import { expect } from "chai";
import * as dotenv from "dotenv";
import path from "path";
import { ec } from "starknet";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const walletPrivateKey = process.env.STARKNET_PRIVATE_KEY || "";
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || "your-adamik-api-key"; // get it from https://dashboard.adamik.io
const ADAMIK_API_BASE_URL =
  process.env.ADAMIK_API_BASE_URL || "https://api-staging.adamik.io";
const chainId = "starknet";

describe("Starknet with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    console.log("Creating wallet...");
    const pubKey = ec.starkCurve.getStarkKey(walletPrivateKey);

    // First, let's get our wallet address
    const requestBodyAddressEncode = {
      pubkey: pubKey,
    };

    // Fetch the wallet address from Adamik API
    const responseAddressEncode = await fetch(
      `${ADAMIK_API_BASE_URL}/api/${chainId}/address/encode`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ADAMIK_API_KEY,
        },
        body: JSON.stringify(requestBodyAddressEncode),
      }
    );

    const addressEncode = await responseAddressEncode.json();
    // Get the ArgentX wallet address
    const senderAddress = addressEncode.addresses.find(
      (address) => address.type === "argentx"
    ).address;

    console.log("Sender address : ", senderAddress);

    // Prepare the transfer transaction
    const requestBody = {
      transaction: {
        data: {
          mode: "transfer", // Transaction type
          senderAddress, // Our wallet address
          recipientAddress: senderAddress, // Where we're sending to
          amount: "20000000000", // Amount in wei (0.00002 STRK in this example)
        },
      },
    };
    const response = await fetch(
      `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ADAMIK_API_KEY,
        },
        body: JSON.stringify(requestBody),
      }
    );

    let encodedData = await response.json();

    // Check for encoding errors
    if (encodedData.status.errors.length > 0) {
      if (
        encodedData.status.errors[0].message === "Sender account does not exist"
      ) {
        console.log(
          "Account never deployed ... We will create deploy payload and broadcast it"
        );
        // we will do a deploy because that mean this account hasn't deploy argent x contract yet
        const requestBodyDeploy = {
          transaction: {
            data: {
              mode: "deployAccount", // Transaction type
              senderPubKey: pubKey,
              type: "argentx",
            },
          },
        };

        const responseDeploy = await fetch(
          `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: ADAMIK_API_KEY,
            },
            body: JSON.stringify(requestBodyDeploy),
          }
        );
        encodedData = await responseDeploy.json();

        console.log(
          "Deployed account : ",
          JSON.stringify(encodedData, null, 2)
        );
      } else {
        throw new Error(encodedData.status.errors[0].message);
      }
    }

    // Sign the encoded transaction using StarkNet curve
    const signature = ec.starkCurve.sign(
      encodedData.transaction.encoded,
      walletPrivateKey
    );
    const signatureHex = signature.toDERHex();

    console.log("Signature : ", signatureHex);

    // Prepare the broadcast request
    const broadcastTransactionBody = {
      transaction: {
        ...encodedData.transaction,
        signature: signatureHex,
      },
    };

    // Broadcast the signed transaction
    const broadcastResponse = await fetch(
      "https://api-staging.adamik.io/api/starknet/transaction/broadcast",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ADAMIK_API_KEY,
        },
        body: JSON.stringify(broadcastTransactionBody),
      }
    );

    const responseData = await broadcastResponse.json();
    console.log("Transaction Result:", JSON.stringify(responseData, null, 2));

    expect(responseData.hash).to.exist;
  });
});
