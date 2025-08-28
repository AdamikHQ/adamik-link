import { errorTerminal, infoTerminal, overridedPrompt } from "../utils";
import {
  AdamikAPIError,
  AdamikBroadcastResponse,
  AdamikTransactionEncodeResponse,
} from "./types";

export const broadcastTransaction = async (
  chainId: string,
  transactionEncodeResponse: AdamikTransactionEncodeResponse,
  signature: string
) => {
  const { acceptBroadcast } = await overridedPrompt({
    type: "confirm",
    name: "acceptBroadcast",
    message: "Do you wish to broadcast the transaction?",
    initial: true,
  });

  if (!acceptBroadcast) {
    infoTerminal("Transaction not broadcasted.");
    return;
  }

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
    const result =
      (await broadcastResponse.json()) as AdamikAPIError<AdamikBroadcastResponse>;

    // Add detailed logging for debugging
    if (!broadcastResponse.ok || (result.status && result.status.errors.length > 0)) {
      errorTerminal("Detailed broadcast response:", "Adamik");
      console.log("HTTP Status:", broadcastResponse.status);
      console.log("Response:", JSON.stringify(result, null, 2));
    }

    return result;
  } catch (e: any) {
    errorTerminal("Broadcast request failed:", "Adamik");
    errorTerminal(e.message, "Adamik");
    errorTerminal("Response status:", broadcastResponse.status.toString());
    
    // Try to get response text for more details
    try {
      const responseText = await broadcastResponse.text();
      errorTerminal("Response body:", responseText);
    } catch (textError) {
      errorTerminal("Could not read response body", "Adamik");
    }
  }
};
