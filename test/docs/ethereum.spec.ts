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

describe("Ethereum with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    console.log("Creating wallet...");
    const wallet = Wallet.fromPhrase(walletPhrase);

    console.log("Wallet created");
    console.log({ senderAddress: wallet.address });

    const requestBody = {
      transaction: {
        data: {
          chainId: chainId, // Target Ethereum testnet chain
          mode: "transfer",
          sender: wallet.address,
          recipient: recipientAddress || wallet.address, // Self-send if no recipient
          amount: "10000", // Transaction amount
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
    console.log(JSON.stringify(encodedData, null, 2));

    expect(encodedData.transaction.encoded).to.exist;
    expect(encodedData.transaction.data.sender).to.equal(wallet.address);
    expect(encodedData.transaction.data.recipient).to.equal(recipientAddress);
    expect(encodedData.transaction.data.amount).to.equal("10000");
    expect(encodedData.chainId).to.equal(chainId);

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
    console.log("Transaction Result:", JSON.stringify(responseData, null, 2));

    expect(responseData.hash).to.exist;
  });
});
