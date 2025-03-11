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

const transactionBroadcast = async () => {
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

  const amount = "10000";

  // Prepare the transfer transaction
  const requestBody = {
    transaction: {
      data: {
        mode: "transfer", // Transaction type
        senderAddress, // Our wallet address
        recipientAddress: senderAddress, // Where we're sending to
        amount: amount,
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
        "\x1b[32m" + JSON.stringify(encodedData, null, 2) + "\x1b[0m"
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
  console.log(
    "Transaction Result:",
    "\x1b[32m" + JSON.stringify(responseData, null, 2) + "\x1b[0m"
  );

  return responseData;
};

describe("Starknet with Adamik", () => {
  it("should encode a transaction and broadcast it", async () => {
    const responseData = await transactionBroadcast();
    expect(responseData.hash).to.exist;
  });
});
