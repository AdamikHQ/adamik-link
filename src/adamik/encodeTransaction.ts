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
  const { mode } = await prompts({
    type: "select",
    name: "mode",
    message: "What type of transaction do you want to perform?",
    choices: [
      { title: "Transfer", value: "transfer" },
      { title: "Delegate", value: "delegate" },
    ],
    initial: 0,
  });

  let recipientAddress = "";
  let validatorAddress = "";

  if (mode === "transfer") {
    const response = await prompts({
      type: "text",
      name: "recipientAddress",
      message: "What is the recipient address ? (default is signer address)",
      initial: senderAddress,
    });
    recipientAddress = response.recipientAddress;

    if (!recipientAddress) {
      throw new Error("No recipient address provided");
    }
  } else {
    const response = await prompts({
      type: "text",
      name: "validatorAddress",
      message: "What is the validator address you want to delegate to?",
    });
    validatorAddress = response.validatorAddress;

    if (!validatorAddress) {
      throw new Error("No validator address provided");
    }
  }

  const { amount } = await prompts({
    type: "text",
    name: "amount",
    message: `How much ${ticker} to ${mode}? (default is 0.1% of your balance)`,
    initial: amountToMainUnit(
      (BigInt(balance.balances.native.available) / 1000n).toString(),
      decimals
    ) as string,
  });

  if (!amount) {
    throw new Error("No amount provided");
  }

  infoTerminal(`Encoding ${mode} transaction...`, "Adamik");

  const requestBody: any = {
    transaction: {
      data: {
        chainId: chainId,
        mode: mode,
        senderAddress: senderAddress,
        recipientAddress: recipientAddress,
        amount: amountToSmallestUnit(amount, decimals),
        useMaxAmount: false,
      },
    },
  };

  if (mode === "delegate") {
    requestBody.transaction.data.validatorAddress = validatorAddress;
  }

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
