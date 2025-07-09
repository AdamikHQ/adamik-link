import { expect } from "chai";
import * as dotenv from "dotenv";
import path from "path";
import { ec } from "starknet";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const walletPrivateKey = process.env.STARKNET_PRIVATE_KEY || "";
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || "your-adamik-api-key"; // get it from https://dashboard.adamik.io
const ADAMIK_API_BASE_URL =
  process.env.ADAMIK_API_BASE_URL || "https://api.adamik.io";
const chainId = "starknet";

// Utility function for fetch with timeout and retries
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 3,
  timeout = 30000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed:`, error.message);

        if (i === retries - 1) {
          throw error;
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  throw new Error("All retry attempts failed");
};

const transactionBroadcast = async () => {
  console.log("Creating wallet...");
  const pubKey = ec.starkCurve.getStarkKey(walletPrivateKey);

  // First, let's get our wallet address
  const requestBodyAddressEncode = {
    pubkey: pubKey,
  };

  console.log("Fetching wallet address...");
  // Fetch the wallet address from Adamik API
  const responseAddressEncode = await fetchWithRetry(
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
  const argentXAddress = addressEncode.addresses.find(
    (address) => address.type === "argentx"
  );

  if (!argentXAddress) {
    throw new Error("ArgentX address not found in response");
  }

  const senderAddress = argentXAddress.address;
  console.log("Sender address:", senderAddress);

  console.log("Fetching chain info...");
  const chainInfo = await fetchWithRetry(
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

  console.log("Fetching account balance...");
  const balanceRequest = await fetchWithRetry(
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

  console.log("Encoding transaction...");
  const response = await fetchWithRetry(
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

      console.log("Encoding deploy transaction...");
      const responseDeploy = await fetchWithRetry(
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

  const encodedTransaction = encodedData.transaction.encoded.find(
    (encoded: {
      raw?: { format: string; value: string };
      hash?: { format: string; value: string };
    }) => encoded.hash?.format === "pedersen"
  );

  if (!encodedTransaction?.hash?.value) {
    throw new Error("No pedersen hash found in encoded transaction");
  }

  const toSign = encodedTransaction.hash.value;

  console.log("Signing transaction...");
  // Sign the encoded transaction using StarkNet curve
  const signature = ec.starkCurve.sign(toSign, walletPrivateKey);
  const signatureHex = signature.toDERHex();

  console.log("Signature : ", signatureHex);

  // Prepare the broadcast request
  const broadcastTransactionBody = {
    transaction: {
      ...encodedData.transaction,
      signature: signatureHex,
    },
  };

  console.log("Broadcasting transaction...");
  // Broadcast the signed transaction
  const broadcastResponse = await fetchWithRetry(
    `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/broadcast`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ADAMIK_API_KEY,
      },
      body: JSON.stringify(broadcastTransactionBody),
    },
    3,
    60000 // Longer timeout for broadcast
  );

  const responseData = await broadcastResponse.json();
  console.log(
    "Transaction Result:",
    "\x1b[32m" + JSON.stringify(responseData, null, 2) + "\x1b[0m"
  );

  return responseData;
};

describe("Starknet with Adamik", () => {
  it("should encode a transaction and broadcast it", async function () {
    // Increase timeout for CI environments
    this.timeout(120000); // 2 minutes

    // Skip test if required environment variables are not set
    if (!walletPrivateKey || walletPrivateKey === "") {
      console.log("Skipping test: STARKNET_PRIVATE_KEY not set");
      this.skip();
    }

    if (!ADAMIK_API_KEY || ADAMIK_API_KEY === "your-adamik-api-key") {
      console.log("Skipping test: ADAMIK_API_KEY not set");
      this.skip();
    }

    try {
      const responseData = await transactionBroadcast();
      expect(responseData.hash).to.exist;
    } catch (error) {
      console.error("Test failed with error:", error);

      // Provide more context for debugging
      if (error.message.includes("timeout")) {
        throw new Error(
          `Network timeout - this may be due to slow CI network conditions: ${error.message}`
        );
      }

      if (error.message.includes("HTTP")) {
        throw new Error(
          `API error - check network connectivity and API status: ${error.message}`
        );
      }

      throw error;
    }
  });
});
