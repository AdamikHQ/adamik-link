import { Turnkey } from "@turnkey/sdk-server";
import * as dotenv from "dotenv";
import * as path from "path";
import prompts from "prompts";
import { amountToSmallestUnit } from "./utils";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const organizationId = process.env.ORGANIZATION_ID!;
  const turnkeyClient = new Turnkey({
    apiBaseUrl: process.env.BASE_URL!,
    apiPublicKey: process.env.API_PUBLIC_KEY!,
    apiPrivateKey: process.env.API_PRIVATE_KEY!,
    defaultOrganizationId: organizationId,
  });

  const responseChain = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/chains/ton`,
    {
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );
  const chain = (await responseChain.json()).chain;

  console.log({ chain });

  const responseAddressEncode = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/ton/address/encode`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pubkey: process.env.TON_PUBLIC_KEY!,
      }),
    }
  );

  const addressEncode = await responseAddressEncode.json();

  const tonWalletv4Address = addressEncode.addresses.find(
    (address: { type: string; address: string }) => address.type === "walletv4"
  );
  if (!tonWalletv4Address) {
    throw new Error("No TON walletv4 address found");
  }

  console.log({ tonWalletv4Address });

  const { recipientAddress } = await prompts({
    type: "text",
    name: "recipientAddress",
    message: "What is the recipient address?",
    initial: "UQAxLON74v5km3ogohzsHKvjKWoPTxixn08iLSXMpYfF8tka",
  });

  const { amount } = await prompts({
    type: "number",
    name: "amount",
    message: "How much TON to transfer ? (default is 0.05)",
    initial: "0.05",
  });

  const requestBody = {
    transaction: {
      data: {
        chainId: "ton", // TON blockchain
        mode: "transfer",
        senderAddress: tonWalletv4Address.address,
        senderPubKey: process.env.TON_PUBLIC_KEY!,
        recipientAddress: recipientAddress,
        amount: amountToSmallestUnit(amount, chain.decimals),
        useMaxAmount: false,
      },
    },
  };

  const response = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/ton/transaction/encode`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const transactionEncode = await response.json();
  console.log(JSON.stringify(transactionEncode, null, 2));

  const txSignResult = await turnkeyClient.apiClient().signRawPayload({
    signWith: tonWalletv4Address.address,
    payload: transactionEncode.transaction.encoded,
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
  });

  const { r, s } = txSignResult;
  const signatureBytes = Buffer.from(r + s, "hex");

  const signature = signatureBytes.toString("hex");
  console.log({ signature });

  // Prepare to broadcast the signed transaction
  const broadcastRequestBody = {
    transaction: {
      data: transactionEncode.transaction.data,
      encoded: transactionEncode.transaction.encoded,
      signature: signature,
    },
  };

  // Broadcast the transaction using Adamik API
  const broadcastResponse = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/ton/transaction/broadcast`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(broadcastRequestBody),
    }
  );

  const tonResponse = await broadcastResponse.json();
  console.log("Transaction Result:", JSON.stringify(tonResponse, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
