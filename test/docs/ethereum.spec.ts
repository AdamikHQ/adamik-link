import { expect } from "chai";
import * as dotenv from "dotenv";
import { ethers, Wallet } from "ethers";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const walletPhrase = process.env.UNSECURE_LOCAL_SEED || "";
const ADAMIK_API_BASE_URL =
  process.env.ADAMIK_API_BASE_URL || "https://api.adamik.io";
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || "your-adamik-api-key"; // get it from https://dashboard.adamik.io
const recipientAddress = "";
const chainId = "sepolia";

const transactionBroadcast = async () => {
  console.log("Creating wallet...");
  const wallet = Wallet.fromPhrase(walletPhrase);

  const senderAddress = wallet.address;

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
    `${ADAMIK_API_BASE_URL}/api/${chainId}/account/${senderAddress}/state`,
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
    `[BALANCE] [${chainId}] ${senderAddress} : ${(
      Number(balance) / Math.pow(10, decimals)
    ).toString()} ${ticker}`
  );

  const amount = (BigInt(balance) / 1000n).toString() || "10000";

  const requestBody = {
    transaction: {
      data: {
        chainId: chainId, // Target Ethereum testnet chain
        mode: "transfer",
        sender: wallet.address,
        recipient: recipientAddress || wallet.address, // Self-send if no recipient
        amount: amount, // Transaction amount
        useMaxAmount: false,
        memo: "",
        format: "hex",
        validatorAddress: "",
        params: {
          pubKey: wallet.publicKey, // Public key of the wallet
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
  const tx = ethers.Transaction.from(encodedData.transaction.encoded);
  console.log(tx.toJSON());
  console.log("Signing transaction...");
  const signature = await wallet.signTransaction(tx);
  console.log("Transaction signed : ", signature);

  // Prepare to broadcast the signed transaction
  const sendTransactionBody = {
    transaction: {
      ...encodedData.transaction,
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

describe("Ethereum with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    const responseData = await transactionBroadcast();
    expect(responseData.hash).to.exist;
  });
});
