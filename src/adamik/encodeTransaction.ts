import prompts from "prompts";
import {
  amountToMainUnit,
  amountToSmallestUnit,
  errorTerminal,
  infoTerminal,
} from "../utils";
import {
  AdamikAPIError,
  AdamikBalance,
  AdamikTransactionEncodeResponse,
} from "./types";

export const encodeTransaction = async ({
  chainId,
  senderAddress,
  decimals,
  ticker,
  balance,
  pubkey,
}: {
  chainId: string;
  senderAddress: string;
  decimals: number;
  ticker: string;
  balance: AdamikBalance;
  pubkey?: string;
}) => {
  const { recipientAddress } = await prompts({
    type: "text",
    name: "recipientAddress",
    message: "What is the recipient address ? (default is signer address)",
    initial: senderAddress,
  });

  if (!recipientAddress) {
    throw new Error("No recipient address provided");
  }

  const { amount } = await prompts({
    type: "text",
    name: "amount",
    message: `How much ${ticker} to transfer ? (default is 0.1% of your balance)`,
    initial: amountToMainUnit(
      (BigInt(balance.balances.native.available) / 1000n).toString(),
      decimals
    ) as string,
  });

  if (!amount) {
    throw new Error("No amount provided");
  }

  infoTerminal("Encoding transaction...", "Adamik");

  const requestBody: any = {
    transaction: {
      data: {
        chainId: chainId,
        mode: "transfer",
        senderAddress: senderAddress,
        recipientAddress: recipientAddress,
        amount: amountToSmallestUnit(amount, decimals),
        useMaxAmount: false,
      },
    },
  };

  if (pubkey) {
    requestBody.transaction.data.senderPubKey = pubkey;
  }

  const postTransactionEncode = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const transactionEncodeResponse: AdamikAPIError<AdamikTransactionEncodeResponse> =
    await postTransactionEncode.json();

  if (transactionEncodeResponse.status.errors.length > 0) {
    errorTerminal("Transaction encoding failed, check payload :", "Adamik");
    infoTerminal(JSON.stringify(requestBody, null, 2), "Adamik");

    infoTerminal(" and response :", "Adamik");
    infoTerminal(JSON.stringify(transactionEncodeResponse, null, 2), "Adamik");

    throw new Error(
      transactionEncodeResponse.status.errors[0].message ||
        "Transaction encoding failed"
    );
  }

  return transactionEncodeResponse;
};
