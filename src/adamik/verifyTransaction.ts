import AdamikSDK from "adamik-sdk";
import Table from "cli-table3";
import {
  errorTerminal,
  infoTerminal,
  successInfoTerminal,
  warningTerminal,
} from "../utils";
import { AdamikTransactionEncodeResponse, AdamikChain } from "./types";

export interface VerificationTableRow {
  field: string;
  intent: string;
  apiResponse: string;
  decoded?: string;
  status: "✅" | "❌" | "⚠️";
}

interface OriginalIntent {
  mode: string;
  senderAddress: string;
  recipientAddress?: string;
  amount?: string;
  tokenId?: string;
  validatorAddress?: string;
  targetValidatorAddress?: string;
  stakeId?: string;
  senderPubKey?: string;
}

export const verifyTransaction = async (
  transactionEncodeResponse: AdamikTransactionEncodeResponse,
  originalIntent: OriginalIntent,
  chain: AdamikChain
): Promise<void> => {
  infoTerminal("========================================");
  infoTerminal("🔍 Verifying Transaction Data...", "Adamik SDK");
  infoTerminal("📖 Powered by open-source Adamik SDK (github.com/Adamik-SDK/adamik-sdk)", "Adamik SDK");

  try {
    const sdk = new AdamikSDK();
    
    // Remove status field and convert to SDK expected format
    const { status, ...apiResponseForSDK } = transactionEncodeResponse;
    
    // Perform verification
    const verificationResult = await sdk.verify(
      apiResponseForSDK as any,
      originalIntent as any
    );

    // Create verification table
    const table = new Table({
      head: ['Field', 'Your Intent', 'API Response', 'Decoded Value', 'Status'],
      colWidths: [15, 25, 25, 25, 10],
      style: { head: ['cyan'] }
    });

    const rows: VerificationTableRow[] = [];
    
    // Check if we have real decoded data or just placeholder
    const hasRealDecoding = verificationResult.decodedData && 
      !(verificationResult.warnings?.some((w: any) => w.message.includes('placeholder decoder')));

    // Add mode row
    rows.push({
      field: 'Mode',
      intent: originalIntent.mode,
      apiResponse: transactionEncodeResponse.transaction.data.mode,
      decoded: hasRealDecoding ? ((verificationResult.decodedData?.transaction as any)?.mode || 'N/A') : 'Not decoded',
      status: originalIntent.mode === transactionEncodeResponse.transaction.data.mode ? '✅' : '❌'
    });

    // Add sender row
    rows.push({
      field: 'Sender',
      intent: originalIntent.senderAddress?.slice(0, 20) + '...',
      apiResponse: transactionEncodeResponse.transaction.data.senderAddress?.slice(0, 20) + '...',
      decoded: hasRealDecoding ? 
        ((verificationResult.decodedData?.transaction as any)?.senderAddress ? 
          (verificationResult.decodedData?.transaction as any).senderAddress.slice(0, 20) + '...' : 'N/A') 
        : 'Not decoded',
      status: originalIntent.senderAddress === transactionEncodeResponse.transaction.data.senderAddress ? '✅' : '❌'
    });

    // Add recipient row if applicable
    if (originalIntent.recipientAddress) {
      rows.push({
        field: 'Recipient',
        intent: originalIntent.recipientAddress.slice(0, 20) + '...',
        apiResponse: transactionEncodeResponse.transaction.data.recipientAddress?.slice(0, 20) + '...' || 'N/A',
        decoded: hasRealDecoding ?
          ((verificationResult.decodedData?.transaction as any)?.recipientAddress ? 
            (verificationResult.decodedData?.transaction as any).recipientAddress.slice(0, 20) + '...' : 'N/A')
          : 'Not decoded',
        status: originalIntent.recipientAddress === transactionEncodeResponse.transaction.data.recipientAddress ? '✅' : '❌'
      });
    }

    // Add amount row if applicable
    if (originalIntent.amount) {
      const displayAmount = (amount: string) => {
        const mainUnit = Number(amount) / Math.pow(10, chain.decimals);
        return `${mainUnit} ${chain.ticker}`;
      };

      rows.push({
        field: 'Amount',
        intent: displayAmount(originalIntent.amount),
        apiResponse: displayAmount(transactionEncodeResponse.transaction.data.amount),
        decoded: hasRealDecoding ?
          ((verificationResult.decodedData?.transaction as any)?.amount ? 
            displayAmount((verificationResult.decodedData?.transaction as any).amount) : 'N/A')
          : 'Not decoded',
        status: originalIntent.amount === transactionEncodeResponse.transaction.data.amount ? '✅' : '❌'
      });
    }

    // Add token row if applicable
    if (originalIntent.tokenId) {
      rows.push({
        field: 'Token',
        intent: originalIntent.tokenId.slice(0, 20) + '...',
        apiResponse: transactionEncodeResponse.transaction.data.tokenId?.slice(0, 20) + '...' || 'N/A',
        decoded: hasRealDecoding ?
          ((verificationResult.decodedData?.transaction as any)?.tokenId ? 
            (verificationResult.decodedData?.transaction as any).tokenId.slice(0, 20) + '...' : 'N/A')
          : 'Not decoded',
        status: originalIntent.tokenId === transactionEncodeResponse.transaction.data.tokenId ? '✅' : '❌'
      });
    }

    // Add rows to table
    rows.forEach(row => {
      table.push([row.field, row.intent, row.apiResponse, row.decoded, row.status]);
    });

    // Display chain information
    infoTerminal("\n🔗 Chain Information:", "Verification");
    const chainTable = new Table({
      head: ['Property', 'Value'],
      colWidths: [30, 50],
      style: { head: ['cyan'] }
    });

    const encodedFormat = transactionEncodeResponse.transaction.encoded?.[0]?.raw?.format || "Unknown";
    const fullProtectionChains = ["ethereum", "sepolia", "polygon", "bsc", "avalanche", "arbitrum", "optimism", "base", "bitcoin", "bitcoin-testnet", "cosmoshub", "celestia", "injective", "babylon-testnet"];
    const isFullProtection = fullProtectionChains.includes(chain.id);

    chainTable.push(
      ['Chain', `${chain.name} (${chain.id})`],
      ['Transaction Format', encodedFormat],
      ['Verification Level', isFullProtection ? 'COMPLETE ✅' : 'PARTIAL ⚠️'],
      ['Intent Validation', '✅ Enabled'],
      ['Encoded Validation', isFullProtection ? '✅ Enabled' : '⚠️ Not Available']
    );

    console.log(chainTable.toString());

    // Display verification results
    infoTerminal("\n📊 Verification Results:", "Verification");
    console.log(table.toString());

    // Display overall status
    if (!verificationResult.isValid) {
      errorTerminal("\n❌ VERIFICATION FAILED", "Verification");
      
      if (verificationResult.criticalErrors && verificationResult.criticalErrors.length > 0) {
        errorTerminal("\n💀 CRITICAL ISSUES:", "Verification");
        verificationResult.criticalErrors.forEach((error: any) => {
          errorTerminal(`  • ${error.code}: ${error.message}`, "Verification");
        });
      }
      
      if (verificationResult.errors && verificationResult.errors.length > 0) {
        errorTerminal("\n❌ ERRORS:", "Verification");
        verificationResult.errors.forEach((error: any) => {
          errorTerminal(`  • ${error.code}: ${error.message}`, "Verification");
        });
      }

      throw new Error("Transaction verification failed - transaction data does not match your original request");
    } else {
      successInfoTerminal("\n✅ VERIFICATION SUCCESSFUL - Transaction data matches your intent", "Verification");
      
      if (verificationResult.warnings && verificationResult.warnings.length > 0) {
        warningTerminal("\n⚠️ Warnings:", "Verification");
        verificationResult.warnings.forEach((warning: any) => {
          // Improve the placeholder decoder warning message
          if (warning.message.includes('placeholder decoder')) {
            warningTerminal(`  • Adamik SDK does not yet have a decoder for this chain - only intent validation performed`, "Verification");
          } else {
            warningTerminal(`  • ${warning.message}`, "Verification");
          }
        });
      }
    }

    // Note: Fees are not available in the transaction data at this point

  } catch (error) {
    if (error instanceof Error && error.message.includes("verification failed")) {
      throw error;
    }
    
    warningTerminal(`\n⚠️ SDK verification error: ${error}`, "Verification");
    warningTerminal("Proceeding with caution - manual verification recommended", "Verification");
  }

  infoTerminal("========================================");
};