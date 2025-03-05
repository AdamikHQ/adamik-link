import { errorTerminal } from "../utils";
import { AdamikTransactionDetails } from "./types";

export const getTransactionDetails = async (
  chainId: string,
  transactionId: string
): Promise<AdamikTransactionDetails | undefined> => {
  if (!process.env.ADAMIK_API_BASE_URL) {
    errorTerminal(
      "ADAMIK_API_BASE_URL is not defined in environment variables",
      "Adamik"
    );
    return;
  }

  try {
    // Fetch transaction details using Adamik API
    const response = await fetch(
      `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/transaction/${transactionId}`,
      {
        method: "GET",
        headers: {
          Authorization: process.env.ADAMIK_API_KEY!,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      errorTerminal(
        `API Error: ${error?.message || response.statusText}`,
        "Adamik"
      );
      return;
    }

    const result = await response.json();
    return result;
  } catch (e: any) {
    errorTerminal(e.message, "Adamik");
    return;
  }
};
