import {
  amountToMainUnit,
  amountToSmallestUnit,
  errorTerminal,
  infoTerminal,
  italicInfoTerminal,
  successInfoTerminal,
  warningTerminal,
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
import { Choice } from "prompts";
import AdamikSDK from "adamik-sdk";

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
      {
        title: "Unstake",
        value: "unstake",
        disabled: accountState.balances.staking === undefined || accountState.balances.staking.positions.length === 0
      },
      {
        title: "Withdraw",
        value: "withdraw",
        disabled: accountState.balances.staking === undefined || accountState.balances.staking.positions.length === 0
      },
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
    case "transfer": {
      {
        const assetChoices: Choice[] = [];
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
      break;
    }
    case "stake": {
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
      break;
    }
    case "unstake": {
      const positions = accountState.balances.staking!.positions;
      requestBody.transaction.data.mode = "unstake";
      const choices: Choice[] = positions.map((position) => ({
        title: `${position.validatorAddresses[0].slice(0, 6)}...${position.validatorAddresses[0].slice(-4)} (${amountToMainUnit(
          position.amount,
          chain.decimals
        )} ${chain.ticker})`,
        value: position,
      }));

      const { position } = await overridedPrompt({
        type: "select",
        name: "position",
        message: "Which position do you want to unstake?",
        choices,
      });

      // TODO: handle the case where there are multiple validators
      const validatorAddress = position.validatorAddresses[0];

      requestBody.transaction.data.validatorAddress = validatorAddress;

      if (position.stakeId) {
        requestBody.transaction.data.stakeId = position.stakeId;
      }
      break;
    }
    case "withdraw": {
      const positions = accountState.balances.staking!.positions;
      requestBody.transaction.data.mode = "withdraw";
      const choices: Choice[] = positions.map((position) => ({
        title: `${position.validatorAddresses[0].slice(0, 6)}...${position.validatorAddresses[0].slice(-4)} (${amountToMainUnit(
          position.amount,
          chain.decimals
        )} ${chain.ticker})`,
        value: position,
      }));

      const { position } = await overridedPrompt({
        type: "select",
        name: "position",
        message: "Which position do you want to withdraw?",
        choices,
      });

      // TODO: handle the case where there are multiple validators
      const validatorAddress = position.validatorAddresses[0];

      requestBody.transaction.data.validatorAddress = validatorAddress;
      requestBody.transaction.data.recipientAddress = senderAddress;

      if (position.stakeId) {
        requestBody.transaction.data.stakeId = position.stakeId;
      }
      break;
    }
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

  // Verify the transaction response with Adamik SDK
  infoTerminal("========================================");
  infoTerminal("🔍 Starting Adamik SDK Verification...", "Security Check");
  
  try {
    const sdk = new AdamikSDK();
    // Remove status field and convert to SDK expected format
    const { status, ...apiResponseForSDK } = transactionEncodeResponse;
    
    // Display what we're checking
    infoTerminal("📋 Verification Steps:", "Security Check");
    infoTerminal("  1️⃣  Intent Validation - Compare your request vs API response", "Security Check");
    infoTerminal("  2️⃣  Encoded Validation - Decode transaction bytes and verify", "Security Check");
    
    // Display chain and format info
    const encodedFormat = transactionEncodeResponse.transaction.encoded?.[0]?.raw?.format || "Unknown";
    infoTerminal("\n🔗 Chain Information:", "Security Check");
    infoTerminal(`  • Chain: ${chain.name} (${chain.id})`, "Security Check");
    infoTerminal(`  • Transaction Format: ${encodedFormat}`, "Security Check");
    
    // Show protection level based on chain
    const fullProtectionChains = ["ethereum", "sepolia", "polygon", "bsc", "avalanche", "arbitrum", "optimism", "base", "bitcoin", "bitcoin-testnet", "cosmoshub", "celestia", "injective", "babylon-testnet"];
    const isFullProtection = fullProtectionChains.includes(chain.id);
    
    if (isFullProtection) {
      successInfoTerminal("  • Protection Level: 🛡️  FULL (Intent + Encoded validation)", "Security Check");
    } else {
      warningTerminal("  • Protection Level: ⚠️  PARTIAL (Intent validation only)", "Security Check");
      warningTerminal("    Note: Encoded transaction validation not yet available for this chain", "Security Check");
    }
    
    infoTerminal("\n🔎 Checking fields:", "Security Check");
    const intent = requestBody.transaction.data as any;
    const txData = transactionEncodeResponse.transaction.data as any;
    
    // Format the mode for display
    const modeDisplay = {
      transfer: "Native Transfer",
      transferToken: "Token Transfer",
      stake: "Staking",
      unstake: "Unstaking",
      withdraw: "Withdrawal",
      deployAccount: "Account Deployment"
    }[intent.mode as string] || intent.mode;
    
    infoTerminal(`  • Mode: ${modeDisplay} (${intent.mode})`, "Security Check");
    infoTerminal(`  • Sender: ${intent.senderAddress}`, "Security Check");
    
    if (intent.recipientAddress) {
      infoTerminal(`  • Recipient: ${intent.recipientAddress}`, "Security Check");
    }
    
    if (intent.amount) {
      // Try to format amount with token info
      const assetInfo = intent.tokenId ? 
        ` ${intent.tokenId}` : 
        ` ${chain.ticker}`;
      const displayAmount = amountToMainUnit(intent.amount, chain.decimals);
      infoTerminal(`  • Amount: ${displayAmount}${assetInfo}`, "Security Check");
    }
    
    if (intent.tokenId) {
      infoTerminal(`  • Token Contract: ${intent.tokenId}`, "Security Check");
    }
    
    if (intent.validatorAddress || intent.targetValidatorAddress) {
      infoTerminal(`  • Validator: ${intent.validatorAddress || intent.targetValidatorAddress}`, "Security Check");
    }
    
    // Show fees if available
    if (txData.fees) {
      const feeDisplay = amountToMainUnit(txData.fees, chain.decimals);
      infoTerminal(`  • Estimated Fees: ${feeDisplay} ${chain.ticker}`, "Security Check");
    }
    
    const verificationResult = await sdk.verify(
      apiResponseForSDK as any,
      requestBody.transaction.data as any
    );

    if (!verificationResult.isValid) {
      errorTerminal("\n🚨 VERIFICATION FAILED - SECURITY THREAT DETECTED!", "Security Check");
      
      // Display errors by category
      if (verificationResult.criticalErrors && verificationResult.criticalErrors.length > 0) {
        errorTerminal("\n💀 CRITICAL SECURITY ISSUES:", "Security Check");
        verificationResult.criticalErrors.forEach((error: any) => {
          errorTerminal(`  🚨 ${error.code}: ${error.message}`, "Security Check");
          if (error.context) {
            errorTerminal(`     Expected: ${error.context.expected}`, "Security Check");
            errorTerminal(`     Actual: ${error.context.actual}`, "Security Check");
          }
        });
      }
      
      if (verificationResult.errors && verificationResult.errors.length > 0) {
        errorTerminal("\n❌ VALIDATION ERRORS:", "Security Check");
        verificationResult.errors.forEach((error: any) => {
          errorTerminal(`  • ${error.code}: ${error.message}`, "Security Check");
          if (error.field) {
            errorTerminal(`    Field: ${error.field}`, "Security Check");
          }
        });
      }

      // Show detailed comparison
      errorTerminal("\n📊 DETAILED COMPARISON:", "Security Check");
      errorTerminal("Your Intent:", "Security Check");
      await italicInfoTerminal(JSON.stringify(requestBody.transaction.data, null, 2));
      errorTerminal("\nAPI Response:", "Security Check");
      await italicInfoTerminal(JSON.stringify(transactionEncodeResponse.transaction.data, null, 2));

      throw new Error("Transaction verification failed - DO NOT SIGN THIS TRANSACTION!");
    }

    // Success with detailed results
    successInfoTerminal("\n✅ VERIFICATION SUCCESSFUL", "Security Check");
    
    // Show warnings if any
    if (verificationResult.warnings && verificationResult.warnings.length > 0) {
      warningTerminal("\n⚠️  Warnings:", "Security Check");
      verificationResult.warnings.forEach((warning: any) => {
        warningTerminal(`  • ${warning.message}`, "Security Check");
      });
    }
    
    // Show what was verified
    successInfoTerminal("\n✓ Verified Checks:", "Security Check");
    successInfoTerminal("  ✅ Transaction mode matches your intent", "Security Check");
    successInfoTerminal("  ✅ Sender address matches", "Security Check");
    if (intent.recipientAddress) {
      successInfoTerminal("  ✅ Recipient address matches", "Security Check");
    }
    if (intent.amount) {
      successInfoTerminal("  ✅ Amount matches exactly", "Security Check");
    }
    if (intent.tokenId) {
      successInfoTerminal("  ✅ Token contract matches", "Security Check");
    }
    
    // Show decoded transaction info if available
    if (verificationResult.decodedData) {
      infoTerminal("\n🔐 Decoded Transaction:", "Security Check");
      const decoded = verificationResult.decodedData.transaction as any;
      if (decoded && typeof decoded === 'object') {
        if (decoded.recipientAddress || decoded.to) {
          infoTerminal(`  • Decoded recipient: ${decoded.recipientAddress || decoded.to}`, "Security Check");
        }
        if (decoded.amount || decoded.value) {
          infoTerminal(`  • Decoded amount: ${decoded.amount || decoded.value}`, "Security Check");
        }
        if (decoded.mode) {
          infoTerminal(`  • Decoded mode: ${decoded.mode}`, "Security Check");
        }
      }
    }
    
    successInfoTerminal("\n🛡️  Transaction is SAFE to sign", "Security Check");
    infoTerminal("========================================");
    
  } catch (error) {
    // If it's our verification error, re-throw it
    if (error instanceof Error && error.message.includes("verification failed")) {
      throw error;
    }
    
    // For other errors (like SDK issues), log but don't block
    warningTerminal(`\n⚠️  SDK verification error: ${error}`, "Security Check");
    warningTerminal("Proceeding with caution - manual verification recommended", "Security Check");
    infoTerminal("========================================");
  }

  return transactionEncodeResponse;
};
