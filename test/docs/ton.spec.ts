import { mnemonicToPrivateKey, sign } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { expect } from "chai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const walletPhrase = process.env.UNSECURE_LOCAL_SEED || "";
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || "your-adamik-api-key"; // get it from https://dashboard.adamik.io
const recipientAddress = "";
const ADAMIK_API_BASE_URL =
  process.env.ADAMIK_API_BASE_URL || "https://api.adamik.io";
const chainId = "ton";

const transactionBroadcast = async () => {
  console.log("Creating wallet...");
  const keyPair = await mnemonicToPrivateKey(walletPhrase.split(" "));

  // Define the workchain and create a wallet contract
  let workchain = 0;
  let wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  });
  const address = wallet.address.toString();

  const chainInfo = await fetch(
    `${ADAMIK_API_BASE_URL}/api/chains/${chainId}`,
    {
      method: "GET",
      headers: {
        Authorization: ADAMIK_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  const chainInfoData = await chainInfo.json();

  const decimals = chainInfoData.chain.decimals;
  const ticker = chainInfoData.chain.ticker;
  console.log("Decimals:", decimals);

  const balanceRequest = await fetch(
    `${ADAMIK_API_BASE_URL}/api/${chainId}/account/${address}/state`,
    {
      method: "GET",
      headers: {
        Authorization: ADAMIK_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  const balanceData = await balanceRequest.json();

  const balance = balanceData.balances.native.available;

  console.log("Balance:", balance);
  console.log(
    `[BALANCE] [${chainId}] ${address} : ${(
      Number(balance) / Math.pow(10, decimals)
    ).toString()} ${ticker}`
  );

  // Prepare the transaction request
  const requestBody = {
    transaction: {
      data: {
        chainId: chainId, // TON blockchain
        mode: "transfer",
        senderAddress: address,
        recipientAddress: recipientAddress || address,
        amount: "10000",
        useMaxAmount: false,
        validatorAddress: "",
        params: {
          pubKey: keyPair.publicKey.toString("hex"),
        },
      },
    },
  };

  console.log("Encoding transaction...");
  // Encode the transaction with Adamik API
  const responseEncode = await fetch(
    `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
    {
      method: "POST",
      headers: {
        Authorization: ADAMIK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const encodedData = await responseEncode.json();
  console.log("\x1b[32m" + JSON.stringify(encodedData, null, 2) + "\x1b[0m");

  // Sign the encoded transaction
  const tx = encodedData.transaction.encoded;
  console.log("Signing transaction...");
  // Sign the encoded transaction
  const signature = sign(
    Buffer.from(encodedData.transaction.encoded, "hex"),
    keyPair.secretKey
  ).toString("hex");
  console.log(`Signature: ${signature}`);

  console.log("Transaction signed : ", signature);

  // Prepare to broadcast the signed transaction
  const sendTransactionBody = {
    transaction: {
      data: encodedData.transaction.data,
      encoded: tx,
      signature: signature,
    },
  };

  console.log("Broadcasting transaction...");

  // Broadcast the transaction using Adamik API
  const responseBroadcast = await fetch(
    `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/broadcast`,
    {
      method: "POST",
      headers: {
        Authorization: ADAMIK_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendTransactionBody),
    }
  );

  const responseData = await responseBroadcast.json();
  console.log(
    "Transaction Result:",
    "\x1b[32m" + JSON.stringify(responseData, null, 2) + "\x1b[0m"
  );

  return responseData;
};

describe("TON with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    const responseData = await transactionBroadcast();
    expect(responseData.hash).to.exist;
  });
});
