import prompts from "prompts";
import { Balance, Chain, TransactionEncodeResponse } from "./types";
import { amountToMainUnit, amountToSmallestUnit } from "./utils";

export const adamikEncodeTransaction = async (
  chainId: string,
  accountId: string,
  chains: Record<string, Chain>,
  balance: Balance,
  pubKey?: string
) => {
  const { recipientAddress } = await prompts({
    type: "text",
    name: "recipientAddress",
    message: "What is the recipient address?",
    initial: "cosmos1ksdpkf8l9ypzqqqx38y3x8sdkndw8ytjhuxpwj",
  });

  if (!recipientAddress) {
    throw new Error("No recipient address provided");
  }

  const { amount } = await prompts({
    type: "text",
    name: "amount",
    message: `How much ${chains[chainId].ticker} to transfer ? (default is 0.1% of your balance)`,
    initial: amountToMainUnit(
      (BigInt(balance.balances.native.available) / 1000n).toString(),
      chains[chainId].decimals
    ) as string,
  });

  if (!amount) {
    throw new Error("No amount provided");
  }

  console.log("Encoding transaction...");

  const requestBody: any = {
    transaction: {
      data: {
        chainId: chainId,
        mode: "transfer",
        senderAddress: accountId,
        recipientAddress: recipientAddress,
        amount: amountToSmallestUnit(amount, chains[chainId].decimals),
        useMaxAmount: false,
      },
    },
  };

  if (pubKey) {
    requestBody.transaction.data.senderPubKey = pubKey;
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

  const transactionEncodeResponse: TransactionEncodeResponse =
    await postTransactionEncode.json();

  if (transactionEncodeResponse.status.errors.length > 0) {
    console.log("Transaction encoding failed, check payload :");
    console.log(JSON.stringify(requestBody, null, 2));

    console.log(" and response :");
    console.log(JSON.stringify(transactionEncodeResponse, null, 2));

    throw new Error(
      transactionEncodeResponse.status.errors[0].message ||
        "Transaction encoding failed"
    );
  }

  return transactionEncodeResponse;
};
