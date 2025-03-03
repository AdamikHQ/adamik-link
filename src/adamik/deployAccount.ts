import { errorTerminal } from "../utils";

export const deployAccount = async ({
  chainId,
  senderAddress,
  pubkey,
}: {
  chainId: string;
  senderAddress: string;
  pubkey?: string;
}) => {
  const requestBody: any = {
    transaction: {
      data: {
        mode: "deployAccount",
        type: "argentx",
        senderPubKey: pubkey,
      },
    },
  };

  const deployTransactionEncode = await fetch(
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

  const deployTransactionEncodeResponse = await deployTransactionEncode.json();

  deployTransactionEncodeResponse.status.errors.forEach((error: any) => {
    errorTerminal(error.message, "Adamik");
    throw new Error(error.message);
  });

  return deployTransactionEncodeResponse;
};
