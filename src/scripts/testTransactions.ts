import * as dotenv from "dotenv";
import * as path from "path";
import prompts from "prompts";
import { getTransactionDetails } from "../adamik/getTransactionDetails";
import { adamikGetChains } from "../adamik/getChains";
import { infoTerminal, errorTerminal, italicInfoTerminal } from "../utils";
import { transactionDetailView } from "../utils/displayTransaction";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testTransaction() {
  try {
    infoTerminal("Getting chains ...", "Adamik");
    const { chains, chainId } = await adamikGetChains();

    if (!chainId) {
      infoTerminal("Chain selection cancelled.");
      return;
    }

    const { txHash } = await prompts({
      type: "text",
      name: "txHash",
      message: "Enter the transaction hash to check:",
      validate: (value) => value.length > 0 || "Transaction hash is required",
    });

    if (!txHash) {
      infoTerminal("Transaction hash input cancelled.");
      return;
    }

    console.log(
      `\nTesting transaction ${txHash} on chain ${chainId} (${chains[chainId].name})...\n`
    );

    const result = await getTransactionDetails(chainId, txHash);

    if (result) {
      await transactionDetailView(
        {
          hash: txHash,
          chainId,
          ...result,
        },
        chains
      );

      infoTerminal("\nRaw transaction details:", "Adamik");
      await italicInfoTerminal(JSON.stringify(result, null, 2));
    } else {
      errorTerminal("Failed to fetch transaction details", "Adamik");
    }

    infoTerminal("========================================");
  } catch (error) {
    errorTerminal(String(error), "Adamik");
  }
}

async function main() {
  while (true) {
    const { startProcess } = await prompts({
      type: "confirm",
      name: "startProcess",
      message: "Check another transaction? (No to exit)",
      initial: true,
    });

    if (!startProcess) {
      infoTerminal("Exiting script. Goodbye!");
      process.exit(0);
    }

    await testTransaction();
  }
}

// Run the test
main().catch(console.error);
