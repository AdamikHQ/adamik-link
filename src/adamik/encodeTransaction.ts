import {
  amountToMainUnit,
  amountToSmallestUnit,
  errorTerminal,
  infoTerminal,
  overridedPrompt,
} from "../utils";
import { deployAccount } from "./deployAccount";
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
}): Promise<AdamikTransactionEncodeResponse | undefined> => {
  const { mode } = await overridedPrompt({
    type: "select",
    name: "mode",
    message: "What type of transaction do you want to perform?",
    choices: [
      { title: "Transfer", value: "transfer" },
      { title: "Transfer Token", value: "transferToken" },
      { title: "Stake", value: "stake" },
    ],
    initial: 0,
  });

  let recipientAddress = "";
  let targetValidatorAddress = "";
  let tokenId = "";

  switch (mode) {
    case "transfer":
      const response = await overridedPrompt({
        type: "text",
        name: "recipientAddress",
        message: "What is the recipient address ? (default is signer address)",
        initial: senderAddress,
      });
      recipientAddress = response.recipientAddress;

      if (!recipientAddress) {
        throw new Error("No recipient address provided");
      }
      break;
    case "stake": {
      const response = await overridedPrompt({
        type: "text",
        name: "targetValidatorAddress",
        message: "What is the validator address you want to delegate to?",
      });
      targetValidatorAddress = response.targetValidatorAddress;

      if (!targetValidatorAddress) {
        throw new Error("No validator address provided");
      }
      break;
    }
  }

  const { amount } = await overridedPrompt({
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

  if (mode === "transferToken") {
    requestBody.transaction.data.tokenId = tokenId;
  }

  if (mode === "stake") {
    requestBody.transaction.data.targetValidatorAddress =
      targetValidatorAddress;
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
    (await postTransactionEncode.json()) as AdamikAPIError<AdamikTransactionEncodeResponse>;

  if (transactionEncodeResponse.status.errors.length > 0) {
    errorTerminal("Transaction encoding failed, check payload :", "Adamik");
    infoTerminal(JSON.stringify(requestBody, null, 2), "Adamik");

    infoTerminal(" and response :", "Adamik");
    infoTerminal(JSON.stringify(transactionEncodeResponse, null, 2), "Adamik");

    if (
      transactionEncodeResponse.status.errors[0].message ===
      "Sender account does not exist"
    ) {
      const { continueDeploy } = await overridedPrompt({
        type: "confirm",
        name: "continueDeploy",
        message:
          "It's seems that account is not deployed, do you want to craft a deploy transaction (will not be broadcasted yet) ?",
        initial: true,
      });

      if (continueDeploy) {
        const deployTransactionEncodeResponse = await deployAccount({
          chainId,
          pubkey,
        });

        return deployTransactionEncodeResponse;
      }
    }

    throw new Error(
      transactionEncodeResponse.status.errors[0].message ||
        "Transaction encoding failed"
    );
  }

  return transactionEncodeResponse;
};
