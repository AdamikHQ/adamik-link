import { TransactionEncodeResponse } from "./types";

export const adamikBroadcastTransaction = async (
  chainId: string,
  transactionEncodeResponse: TransactionEncodeResponse,
  signature: string
) => {
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
    const result = await broadcastResponse.json();
    console.log("Transaction Result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
    console.log("Transaction failed.");
  }
};
