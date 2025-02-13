import { Turnkey } from "@turnkey/sdk-server";
import * as dotenv from "dotenv";
import * as path from "path";
import prompts from "prompts";
import { amountToMainUnit, amountToSmallestUnit } from "./utils";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const organizationId = process.env.ORGANIZATION_ID!;
  const turnkeyClient = new Turnkey({
    apiBaseUrl: process.env.BASE_URL!,
    apiPublicKey: process.env.API_PUBLIC_KEY!,
    apiPrivateKey: process.env.API_PRIVATE_KEY!,
    defaultOrganizationId: organizationId,
  });

  const { accounts } = await turnkeyClient.apiClient().getWalletAccounts({
    walletId: process.env.WALLET_ID!,
  });

  const { selectedAccount } = await prompts({
    type: "autocomplete",
    name: "selectedAccount",
    message: "Select an account",
    choices: accounts.map((account) => ({
      title: `${account.address}`,
      value: { path: account.path, address: account.address },
      description: `curve: ${account.curve} | addressFormat: ${account.addressFormat} | path: ${account.path}`,
    })),
  });

  if (!selectedAccount) {
    throw new Error("No account selected");
  }

  const accountId = selectedAccount.address;

  const { pubKey } = await prompts({
    type: "select",
    name: "pubKey",
    message:
      "Some chains will probably need a public key otherwise you can skip",
    choices: [
      { title: "Skip", value: undefined },
      ...accounts
        .filter(
          (account) =>
            account.path === selectedAccount.path &&
            [
              "ADDRESS_FORMAT_UNCOMPRESSED",
              "ADDRESS_FORMAT_COMPRESSED",
            ].includes(account.addressFormat)
        )
        .map((account) => ({
          title: account.address,
          value: account.address,
        })),
    ],
  });

  const fetchAllChains = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/chains`,
    {
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );
  const chains: Record<
    string,
    {
      name: string;
      family: string;
      ticker: string;
      decimals: number;
      supportedFeatures: Record<"read" | "write" | "utils", any>;
    }
  > = (await fetchAllChains.json()).chains;

  const { chainId } = await prompts({
    type: "autocomplete",
    name: "chainId",
    message: "Select a chain",
    choices: Object.keys(chains).map((chain) => ({
      title: `${chains[chain].name} (${chains[chain].ticker})`,
      value: chain,
    })),
  });

  if (!chainId) {
    throw new Error("No chain selected");
  }

  console.log(
    "We do not check if your wallet support the chosen chain so be careful, be sure to have the right wallet for the right chains"
  );

  const fetchBalance = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/account/${accountId}/state`,
    {
      method: "GET",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`Fetching balance for ${accountId} on ${chainId}....`);

  const balance: {
    balances: {
      native: { available: string; total: string };
      tokens: {
        amount: string;
        token: { id: string; name: string; ticker: string; decimals: number };
      }[];
      staking?: any;
    };
  } = await fetchBalance.json();

  console.log(`Your current balance are :`);
  console.log(
    `- ${amountToMainUnit(
      balance.balances.native.total,
      chains[chainId].decimals
    )} ${chains[chainId].ticker} - ${chains[chainId].name}`
  );
  balance.balances.tokens.forEach((token) => {
    console.log(
      `- ${amountToMainUnit(token.amount, token.token.decimals)} ${
        token.token.ticker
      } - ${token.token.name}`
    );
  });

  const { recipientAddress } = await prompts({
    type: "text",
    name: "recipientAddress",
    message: "What is the recipient address?",
  });

  if (!recipientAddress) {
    throw new Error("No recipient address provided");
  }

  const { amount } = await prompts({
    type: "text",
    name: "amount",
    message: `How much ${chains[chainId].ticker} to transfer ? (default is 0.1% of your balance)`,
    initial: amountToMainUnit(
      (BigInt(balance.balances.native.available) / 1000n).toString(),
      chains[chainId].decimals
    ) as string,
  });

  if (!amount) {
    throw new Error("No amount provided");
  }

  console.log("Encoding transaction...");

  const requestBody: any = {
    transaction: {
      data: {
        chainId: chainId,
        mode: "transfer",
        senderAddress: accountId,
        recipientAddress: recipientAddress,
        amount: amountToSmallestUnit(amount, chains[chainId].decimals),
        useMaxAmount: false,
      },
    },
  };

  if (pubKey) {
    requestBody.transaction.data.senderPubKey = pubKey;
  }

  const postTransactionEncode = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const transactionEncodeResponse = await postTransactionEncode.json();

  if (transactionEncodeResponse.status.errors.length > 0) {
    console.log("Transaction encoding failed, check payload :");
    console.log(JSON.stringify(requestBody, null, 2));

    console.log(" and response :");
    console.log(JSON.stringify(transactionEncodeResponse, null, 2));

    throw new Error(
      transactionEncodeResponse.status.errors[0].message ||
        "Transaction encoding failed"
    );
  }

  console.log("You will need to sign this payload : ");
  console.log(
    JSON.stringify(transactionEncodeResponse.transaction.encoded, null, 2)
  );

  const { hashFunction } = await prompts({
    type: "select",
    name: "hashFunction",
    message: "Select corresponding hash function",
    choices: [
      {
        title: "HASH_FUNCTION_NOT_APPLICABLE",
        value: "HASH_FUNCTION_NOT_APPLICABLE",
      },
      {
        title: "HASH_FUNCTION_SHA256",
        value: "HASH_FUNCTION_SHA256",
      },
      {
        title: "HASH_FUNCTION_KECCAK256",
        value: "HASH_FUNCTION_KECCAK256",
      },
      {
        title: "HASH_FUNCTION_NO_OP",
        value: "HASH_FUNCTION_NO_OP",
      },
    ],
  });

  const txSignResult = await turnkeyClient.apiClient().signRawPayload({
    signWith: accountId,
    payload: transactionEncodeResponse.transaction.encoded,
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: hashFunction,
  });

  console.log({ txSignResult });
  const { r, s, v } = txSignResult;
  let signatureBytes: Buffer;
  if (hashFunction === "HASH_FUNCTION_NOT_APPLICABLE") {
    signatureBytes = Buffer.from(r + s, "hex");
  } else {
    signatureBytes = Buffer.from(r + s + v, "hex");
  }

  const signature = signatureBytes.toString("hex");
  console.log("Transaction signed : ", signature);

  console.log("SUMMARY :");
  console.log(`- Sender : ${accountId}`);
  console.log(`- Recipient : ${recipientAddress}`);
  console.log(`- Amount : ${amount} ${chains[chainId].ticker}`);
  console.log(`- Chain : ${chains[chainId].name}`);

  const { acceptBroadcast } = await prompts({
    type: "confirm",
    name: "acceptBroadcast",
    message: "Do you want to proceed with the broadcast ?",
    initial: true,
  });

  if (!acceptBroadcast) {
    console.log("Transaction not broadcasted.");
    return;
  }

  console.log("Broadcasting transaction...");

  // Prepare to broadcast the signed transaction
  const broadcastRequestBody = {
    transaction: {
      data: transactionEncodeResponse.transaction.data,
      encoded: transactionEncodeResponse.transaction.encoded,
      signature: signature,
    },
  };

  // Broadcast the transaction using Adamik API
  const broadcastResponse = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/transaction/broadcast`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(broadcastRequestBody),
    }
  );

  try {
    const tonResponse = await broadcastResponse.json();
    console.log("Transaction Result:", JSON.stringify(tonResponse, null, 2));
  } catch (e) {
    console.error(e);
    console.log("Transaction failed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
