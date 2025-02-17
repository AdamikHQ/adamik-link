import { Chain } from "./types";

import { Turnkey } from "@turnkey/sdk-server";
import prompts from "prompts";
import { TransactionEncodeResponse } from "./types";

export const signerSignTransaction = async (
  turnkeyClient: Turnkey,
  transactionEncodeResponse: TransactionEncodeResponse,
  chains: Record<string, Chain>,
  chainId: string,
  accountId: string
) => {
  console.log("You will need to sign this payload : ");
  console.log(
    JSON.stringify(transactionEncodeResponse.transaction.encoded, null, 2)
  );

  const { signMethod } = await prompts({
    type: "select",
    name: "signMethod",
    message: "Select a sign method",
    choices: [
      {
        title: "signTransaction",
        value: "signTransaction",
      },
      {
        title: "signRawPayload",
        value: "signRawPayload",
      },
    ],
  });

  let txSignResult: any;
  let signature: string;
  if (signMethod === "signTransaction") {
    if (chains[chainId].family !== "evm") {
      throw new Error("This chain is not supported for this method");
    }
    txSignResult = await turnkeyClient.apiClient().signTransaction({
      signWith: accountId,
      unsignedTransaction: transactionEncodeResponse.transaction.encoded,
      type: "TRANSACTION_TYPE_ETHEREUM",
    });

    signature = txSignResult.signedTransaction;
  } else if (signMethod === "signRawPayload") {
    const choices = [
      {
        title: "HASH_FUNCTION_NOT_APPLICABLE",
        value: "HASH_FUNCTION_NOT_APPLICABLE",
      },
      {
        title: "HASH_FUNCTION_SHA256",
        value: "HASH_FUNCTION_SHA256",
      },
      {
        title: "HASH_FUNCTION_KECCAK256",
        value: "HASH_FUNCTION_KECCAK256",
      },
      {
        title: "HASH_FUNCTION_NO_OP",
        value: "HASH_FUNCTION_NO_OP",
      },
    ];

    const { hashFunction } = await prompts({
      type: "select",
      name: "hashFunction",
      message: "Select corresponding hash function",
      choices: choices
        .map((choice) => {
          if (
            choice.value
              .toLowerCase()
              .includes(chains[chainId].signerSpecs.hashFunction)
          ) {
            return {
              title: `[RECOMMENDED] ${choice.title}`,
              value: choice.value,
            };
          }

          return choice;
        })
        .sort((a, b) => (a.title.includes("[RECOMMENDED]") ? -1 : 1)),
    });

    if (!hashFunction) {
      throw new Error("No hash function selected");
    }

    txSignResult = await turnkeyClient.apiClient().signRawPayload({
      signWith: accountId,
      payload: transactionEncodeResponse.transaction.encoded,
      encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
      hashFunction: hashFunction,
    });

    const signatureComponent = chains[chainId].signerSpecs.signatureFormat;

    signature = signatureComponent.reduce((acc, component) => {
      if (component === "r") {
        return acc + txSignResult.r;
      } else if (component === "s") {
        return acc + txSignResult.s;
      }
      if (component === "v") {
        return acc + txSignResult.v;
      }
      return acc;
    }, "");
  } else {
    throw new Error("No sign method selected");
  }

  console.log("Transaction signed : ", txSignResult);

  return { signature: Buffer.from(signature, "hex").toString("hex") };
};
