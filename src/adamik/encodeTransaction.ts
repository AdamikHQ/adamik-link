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
  AdamikAccountState,
  AdamikChain,
  AdamikTransactionEncodeRequest,
  AdamikTransactionEncodeResponse,
} from "./types";

export const encodeTransaction = async ({
  chain,
  senderAddress,
  senderPubKey,
  accountState,
}: {
  chain: AdamikChain;
  senderAddress: string;
  senderPubKey?: string;
  accountState: AdamikAccountState;
}): Promise<AdamikTransactionEncodeResponse | undefined> => {
  const { verb } = await overridedPrompt({
    type: "select",
    name: "verb",
    message: "What type of transaction do you want to perform?",
    choices: [
      { title: "Transfer", value: "transfer" },
      { title: "Stake", value: "stake" },
      { title: "Unstake", value: "unstake" },
    ],
    initial: 0,
  });

  const requestBody: AdamikTransactionEncodeRequest = {
    transaction: {
      data: {
        mode: "",
        senderAddress,
      },
    },
  };

  if (senderPubKey) {
    requestBody.transaction.data.senderPubKey = senderPubKey;
  }

  switch (verb) {
    case "transfer":
      {
        {
          const assetChoices = [];
          assetChoices.push({
            title: chain.ticker,
            value: null,
          });

          if (
            chain.supportedFeatures.write.transaction.type.transferToken ===
            true
          ) {
            accountState.balances.tokens.forEach((t) =>
              assetChoices.push({
                value: t.token.id,
                title: t.token.name,
              })
            );
          }
          const { tokenId } = await overridedPrompt({
            type: "select",
            name: "tokenId",
            message: `Which asset do you want to transfer?`,
            choices: assetChoices,
            initial: assetChoices[0].value,
          });

          if (tokenId) {
            requestBody.transaction.data.tokenId = tokenId;
            requestBody.transaction.data.mode = "transferToken";
          } else {
            requestBody.transaction.data.mode = "transfer";
          }
        }
        {
          const { recipientAddress } = await overridedPrompt({
            type: "text",
            name: "recipientAddress",
            message:
              "What is the recipient address? (default is signer address)",
            initial: senderAddress,
          });

          if (!recipientAddress) {
            throw new Error("No recipient address provided");
          }

          requestBody.transaction.data.recipientAddress = recipientAddress;
        }
      }
      break;
    case "stake":
      {
        requestBody.transaction.data.mode = "stake";

        const { targetValidatorAddress } = await overridedPrompt({
          type: "text",
          name: "targetValidatorAddress",
          message: "What is the validator address you want to delegate to?",
        });
        if (!targetValidatorAddress) {
          throw new Error("No validator address provided");
        }

        requestBody.transaction.data.targetValidatorAddress =
          targetValidatorAddress;
      }
      break;
    case "unstake":
      {
        requestBody.transaction.data.mode = "unstake";

        const { validatorAddress } = await overridedPrompt({
          type: "text",
          name: "validatorAddress",
          message: "What is the validator address you want to undelegate from?",
        });

        const { stakeId } = await overridedPrompt({
          type: "text",
          name: "stakeId",
          message: "What is the stake id you want to undelegate ? (optional)",
        });

        requestBody.transaction.data.validatorAddress = validatorAddress;

        if (stakeId) {
          requestBody.transaction.data.stakeId = stakeId;
        }
      }
      break;
    default:
      throw new Error("Unsupported transaction mode");
  }

  const token = accountState.balances.tokens.find(
    (t) => t.token.id === requestBody.transaction.data.tokenId
  );

  const assetTicker = token ? token.token.ticker : chain.ticker;
  const assetDecimals = token ? parseInt(token.token.decimals) : chain.decimals;
  const balanceAvailable = token
    ? BigInt(token.amount)
    : BigInt(accountState.balances.native.available);

  const { amount } = await overridedPrompt({
    type: "text",
    name: "amount",
    message: `How much ${assetTicker} to ${verb}? (default is 0.1% of your balance)`,
    initial: amountToMainUnit(
      (balanceAvailable / 1000n).toString(),
      assetDecimals
    ) as string,
  });

  if (!amount) {
    throw new Error("No amount provided");
  }

  requestBody.transaction.data.amount = amountToSmallestUnit(
    amount,
    assetDecimals
  ).toString();

  infoTerminal(
    `Encoding ${requestBody.transaction.data.mode} transaction...`,
    "Adamik"
  );

  const postTransactionEncode = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chain.id}/transaction/encode`,
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
          "It seems that account is not deployed, do you want to craft a deploy account transaction (will not be broadcasted yet)?",
        initial: true,
      });

      if (continueDeploy) {
        const deployTransactionEncodeResponse = await deployAccount({
          chainId: chain.id,
          pubkey: senderPubKey,
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
