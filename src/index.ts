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
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  while (true) {
    try {
      infoTerminal("========================================");

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

      infoTerminal(`Selected chain: ${chainId}`, "Adamik");
      infoTerminal(`- Name: ${chains[chainId].name}`, "Adamik");
      infoTerminal(`- Ticker: ${chains[chainId].ticker}`, "Adamik");
      infoTerminal(`- Decimals: ${chains[chainId].decimals}`, "Adamik");

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
      italicInfoTerminal(address);

      infoTerminal("========================================");

      infoTerminal(`Fetching balance ...`, "Adamik");
      const balance = await getAccountState(chainId, address);
      infoTerminal(`Balance:`, "Adamik");
      console.log(
        `\t- ${picocolors.cyan(
          amountToMainUnit(
            balance.balances.native.total,
            chains[chainId].decimals
          )
        )} ${picocolors.bold(chains[chainId].ticker)} - ${picocolors.italic(
          chains[chainId].name
        )}`
      );
      balance.balances.tokens?.forEach((token) => {
        console.log(
          `\t- ${picocolors.cyan(
            amountToMainUnit(token.amount, token.token.decimals)
          )} ${picocolors.bold(token.token.ticker)} - ${picocolors.italic(
            token.token.name
          )}`
        );
      });

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
      italicInfoTerminal(
        JSON.stringify(transactionEncodeResponse.transaction.data, null, 2)
      );
      infoTerminal(`- Message to sign :`, "Adamik");
      italicInfoTerminal(transactionEncodeResponse.transaction.encoded);

      infoTerminal("========================================");

      infoTerminal(`We will now sign the transaction ...`);

      infoTerminal(`- Signer spec:\n`, "Adamik");
      await italicInfoTerminal(JSON.stringify(signerSpec, null, 2), 2000);

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
      await italicInfoTerminal(signature);
      infoTerminal("========================================");

      infoTerminal(`Please check the payload that will be broadcasted.`);
      infoTerminal(`Transaction data:`, "Adamik");
      italicInfoTerminal(
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
      errorTerminal("An error occurred:", "Main");
      console.error(error);

      const { retryAfterError } = await prompts({
        type: "confirm",
        name: "retryAfterError",
        message: "An error occurred. Would you like to retry? (No to exit)",
        initial: true,
      });

      if (!retryAfterError) {
        process.exit(1);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
