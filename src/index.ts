import * as dotenv from "dotenv";
import * as path from "path";
import picocolors from "picocolors";
import prompts from "prompts";
import { broadcastTransaction } from "./adamik/broadcastTransaction";
import { encodePubKeyToAddress } from "./adamik/encodePubkeyToAddress";
import { encodeTransaction } from "./adamik/encodeTransaction";
import { getAccountState } from "./adamik/getAccountState";
import { adamikGetChains } from "./adamik/getChains";
import { signerSelector } from "./signers";
import {
  amountToMainUnit,
  errorTerminal,
  infoTerminal,
  italicInfoTerminal,
} from "./utils";
import Table from "cli-table3";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  // Add ASCII art banner
  console.log(
    picocolors.cyan(`
    █████╗ ██████╗  █████╗ ███╗   ███╗██╗██╗  ██╗      ██╗     ██╗███╗   ██╗██╗  ██╗
   ██╔══██╗██╔══██╗██╔══██╗████╗ ████║██║██║ ██╔╝      ██║     ██║████╗  ██║██║ ██╔╝
   ███████║██║  ██║███████║██╔████╔██║██║█████╔╝       ██║     ██║██╔██╗ ██║█████╔╝ 
   ██╔══██║██║  ██║██╔══██║██║╚██╔╝██║██║██╔═██╗       ██║     ██║██║╚██╗██║██╔═██╗ 
   ██║  ██║██████╔╝██║  ██║██║ ╚═╝ ██║██║██║  ██╗      ███████╗██║██║ ╚████║██║  ██╗
   ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═╝      ╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝

    ${picocolors.gray("┌" + "─".repeat(74) + "┐")}
    ${
      picocolors.gray("│") +
      picocolors.bold(
        picocolors.yellow(
          "               60+ NETWORKS - ANY SIGNERS - ANY TRANSACTIONS              "
        )
      ) +
      picocolors.gray("│")
    }
    ${picocolors.gray("└" + "─".repeat(74) + "┘")}\n`)
  );

  while (true) {
    try {
      const { startProcess } = await prompts({
        type: "confirm",
        name: "startProcess",
        message: "Start new signer interaction? (No to exit)",
        initial: true,
      });

      if (!startProcess) {
        infoTerminal("Exiting script. Goodbye!");
        process.exit(0);
      }

      infoTerminal("Getting chains ...", "Adamik");
      const { chains, chainId, signerSpec } = await adamikGetChains();

      if (!chainId) {
        infoTerminal("Chain selection cancelled. Restarting...");
        continue;
      }

      infoTerminal("\n========================================");

      const signer = await signerSelector(chainId, signerSpec);

      infoTerminal("========================================");

      infoTerminal(`Getting pubkey ...`, signer.signerName);
      const pubkey = await signer.getPubkey();
      infoTerminal(`Pubkey:`, signer.signerName);
      await italicInfoTerminal(JSON.stringify(pubkey, null, 2));

      if (!pubkey) {
        errorTerminal("Failed to get pubkey from signer", signer.signerName);
        continue;
      }

      infoTerminal("========================================");

      infoTerminal(`Encoding pubkey to address ...`, "Adamik");
      const address = await encodePubKeyToAddress(pubkey, chainId);
      infoTerminal(`Address:`, "Adamik");
      await italicInfoTerminal(address);

      infoTerminal("========================================");

      infoTerminal(`Fetching balance ...`, "Adamik");
      const balance = await getAccountState(chainId, address);

      const balanceTable = new Table({
        style: { head: ["cyan"] },
        head: ["Asset", "Amount", "Name"],
        chars: {
          top: "═",
          "top-mid": "╤",
          "top-left": "╔",
          "top-right": "╗",
          bottom: "═",
          "bottom-mid": "╧",
          "bottom-left": "╚",
          "bottom-right": "╝",
          left: "║",
          "left-mid": "╟",
          mid: "─",
          "mid-mid": "┼",
          right: "║",
          "right-mid": "╢",
          middle: "│",
        },
      });

      // Add native balance
      balanceTable.push([
        picocolors.bold(chains[chainId].ticker),
        picocolors.cyan(
          amountToMainUnit(
            balance.balances.native.total,
            chains[chainId].decimals
          )
        ),
        picocolors.italic(chains[chainId].name),
      ]);

      // Add token balances if they exist
      if (balance.balances.tokens && balance.balances.tokens.length > 0) {
        balance.balances.tokens.forEach((token) => {
          balanceTable.push([
            picocolors.bold(token.token.ticker),
            picocolors.cyan(
              amountToMainUnit(token.amount, token.token.decimals)
            ),
            picocolors.italic(token.token.name),
          ]);
        });
      }

      console.log("\n" + balanceTable.toString() + "\n");

      infoTerminal("========================================");

      infoTerminal(`We will now prepare an unsigned transaction ...`);

      const { continueTransaction } = await prompts({
        type: "confirm",
        name: "continueTransaction",
        message: "Do you want to continue? (No to restart)",
        initial: true,
      });

      if (!continueTransaction) {
        infoTerminal("Transaction cancelled. Restarting...");
        continue;
      }

      const transactionEncodeResponse = await encodeTransaction({
        chainId,
        senderAddress: address,
        decimals: chains[chainId].decimals,
        ticker: chains[chainId].ticker,
        balance,
        pubkey,
      });

      infoTerminal(
        `${
          transactionEncodeResponse.transaction.data.mode
            .charAt(0)
            .toUpperCase() +
          transactionEncodeResponse.transaction.data.mode.slice(1)
        } transaction encoded:`,
        "Adamik"
      );
      infoTerminal(
        `- Chain ID: ${transactionEncodeResponse.chainId}`,
        "Adamik"
      );
      infoTerminal(`- Transaction data:`, "Adamik");
      await italicInfoTerminal(
        JSON.stringify(transactionEncodeResponse.transaction.data, null, 2)
      );
      infoTerminal(`- Message to sign :`, "Adamik");
      await italicInfoTerminal(transactionEncodeResponse.transaction.encoded);

      infoTerminal("========================================");

      infoTerminal(`We will now sign the transaction ...`);

      infoTerminal(`- Signer spec:\n`, "Adamik");
      await italicInfoTerminal(JSON.stringify(signerSpec, null, 2), 200);

      const { continueSigning } = await prompts({
        type: "confirm",
        name: "continueSigning",
        message: "Do you want to continue? (No to restart)",
        initial: true,
      });

      if (!continueSigning) {
        infoTerminal("Signature aborted. Restarting...");
        continue;
      }

      const signature = await signer.signTransaction(
        transactionEncodeResponse.transaction.encoded
      );

      infoTerminal(`Signature length: ${signature.length}`, signer.signerName);
      infoTerminal(`Signature:`, signer.signerName);
      await italicInfoTerminal(signature, 500);
      infoTerminal("========================================");

      infoTerminal(`Please check the payload that will be broadcasted.`);
      infoTerminal(`Transaction data:`, "Adamik");
      await italicInfoTerminal(
        JSON.stringify(
          {
            ...transactionEncodeResponse,
            signature: signature,
          },
          null,
          2
        )
      );

      const broadcastResponse = await broadcastTransaction(
        chainId,
        transactionEncodeResponse,
        signature
      );

      if (!broadcastResponse) {
        throw new Error("Broadcast aborted");
      }

      infoTerminal("Transaction broadcasted:", "Adamik");
      await italicInfoTerminal(JSON.stringify(broadcastResponse, null, 2));
      infoTerminal("========================================");

      const { startNewTransaction } = await prompts({
        type: "confirm",
        name: "startNewTransaction",
        message: "Transaction completed. Start a new one? (No to exit)",
        initial: true,
      });

      if (!startNewTransaction) {
        infoTerminal("Exiting script. Goodbye!");
        process.exit(0);
      }
    } catch (error) {
      if (typeof error === "string") {
        errorTerminal(error);
      } else {
        errorTerminal(String(error));
      }
      continue;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
