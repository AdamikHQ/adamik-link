import { mnemonicToPrivateKey, sign } from "@ton/crypto";
import { WalletContractV4 } from "@ton/ton";
import { expect } from "chai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const walletPhrase = process.env.UNSECURE_LOCAL_SEED || "";
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || "your-adamik-api-key"; // get it from https://dashboard.adamik.io
const recipientAddress = "";

describe("TON with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    console.log("Creating wallet...");
    const keyPair = await mnemonicToPrivateKey(walletPhrase.split(" "));

    // Define the workchain and create a wallet contract
    let workchain = 0;
    let wallet = WalletContractV4.create({
      workchain,
      publicKey: keyPair.publicKey,
    });
    const address = wallet.address.toString();

    console.log("Wallet created : ", address);

    // Prepare the transaction request
    const requestBody = {
      transaction: {
        data: {
          chainId: "ton", // TON blockchain
          mode: "transfer",
          sender: address,
          recipient: recipientAddress || address,
          amount: "10000",
          useMaxAmount: false,
          fees: "0", // Set fees to 0 for now
          gas: "0", // Gas is not required on TON
          memo: "", // Optionally, add a memo
          format: "hex",
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
      "https://api.adamik.io/api/ton/transaction/encode",
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
    expect(encodedData.transaction.data.sender).to.equal(address);
    expect(encodedData.transaction.data.amount).to.equal("10000");
    expect(encodedData.chainId).to.equal("ton");

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
      "https://api.adamik.io/api/ton/transaction/broadcast",
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
