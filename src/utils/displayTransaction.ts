import Table from "cli-table3";
import { formatDistanceToNow, fromUnixTime } from "date-fns";
import picocolors from "picocolors";
import { getTransactionDetails } from "../adamik/getTransactionDetails";
import { AdamikChain, ErrorMsg } from "../adamik/types";
import { amountToMainUnit, infoTerminal } from "../utils";
import { SimpleSpinner } from "./spinner";

export const transactionDetailView = async (
  broadcastResponse: {
    hash: string;
    chainId: string;
  },
  chains: Record<string, AdamikChain>
) => {
  const spinner = new SimpleSpinner(
    "Waiting for transaction to be broadcasted..."
  ).start();

  let attempts = 0;
  const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max wait
  let txDetails;

  while (attempts < maxAttempts && !spinner.isStopped()) {
    try {
      txDetails = await getTransactionDetails(
        broadcastResponse.chainId,
        broadcastResponse.hash
      );

      if (txDetails?.transaction?.parsed) {
        spinner.stop(true);
        infoTerminal("Transaction found! Fetching details...");
        const parsed = txDetails.transaction.parsed;

        // Debug timestamp value
        console.log("Raw timestamp value:", parsed.timestamp);
        console.log("Timestamp type:", typeof parsed.timestamp);

        // Format timestamp properly
        let timestampValue = "Pending";
        if (parsed.timestamp) {
          try {
            // Handle timestamp as a number directly
            const timestamp =
              typeof parsed.timestamp === "string"
                ? fromUnixTime(Number(parsed.timestamp))
                : fromUnixTime(parsed.timestamp);

            if (!isNaN(timestamp.getTime())) {
              timestampValue = formatDistanceToNow(timestamp, {
                addSuffix: true,
              });
            } else {
              timestampValue = "Invalid Date";
            }
          } catch (error) {
            console.log("Error parsing timestamp:", error);
            timestampValue = "Invalid Date";
          }
        }

        // Transaction Overview Table
        const overviewTable = new Table({
          style: { head: ["cyan"] },
          head: ["Field", "Value"],
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

        overviewTable.push(
          ["Transaction Hash", picocolors.yellow(parsed.id)],
          ["Status", picocolors.green(parsed.state)],
          ["Type", picocolors.blue(parsed.mode)],
          ["Block", parsed.blockHeight || "Pending"],
          ["Timestamp", timestampValue], // Use our formatted timestamp
          ["Nonce", parsed.nonce || "N/A"],
          ["Gas Used", parsed.gas || "N/A"],
          [
            "Fee",
            `${amountToMainUnit(
              parsed.fees.amount,
              chains[broadcastResponse.chainId].decimals
            )} ${
              parsed.fees.ticker || chains[broadcastResponse.chainId].ticker
            }`,
          ]
        );

        console.log(picocolors.bold("\nTransaction Overview:"));
        console.log(overviewTable.toString());

        // Transfer Details Table
        const hasSenders =
          parsed.senders &&
          Array.isArray(parsed.senders) &&
          parsed.senders.length > 0;
        const hasRecipients =
          parsed.recipients &&
          Array.isArray(parsed.recipients) &&
          parsed.recipients.length > 0;

        if (hasSenders || hasRecipients) {
          const transferTable = new Table({
            style: { head: ["cyan"] },
            head: ["Type", "Address", "Amount"],
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

          if (hasSenders && parsed.senders) {
            parsed.senders.forEach((sender) => {
              transferTable.push([
                "From",
                picocolors.yellow(sender.address),
                picocolors.cyan(
                  `${amountToMainUnit(
                    sender.amount,
                    chains[broadcastResponse.chainId].decimals
                  )} ${
                    sender.ticker || chains[broadcastResponse.chainId].ticker
                  }`
                ),
              ]);
            });
          }

          if (hasRecipients && parsed.recipients) {
            parsed.recipients.forEach((recipient) => {
              transferTable.push([
                "To",
                picocolors.yellow(recipient.address),
                picocolors.cyan(
                  `${amountToMainUnit(
                    recipient.amount,
                    chains[broadcastResponse.chainId].decimals
                  )} ${
                    recipient.ticker || chains[broadcastResponse.chainId].ticker
                  }`
                ),
              ]);
            });
          }

          console.log(picocolors.bold("\nTransfer Details:"));
          console.log(transferTable.toString());
        }

        // Validator Details Table (if present)
        if (parsed.validators) {
          const validatorTable = new Table({
            style: { head: ["cyan"] },
            head: ["Type", "Address", "Amount"],
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

          if (parsed.validators.source) {
            validatorTable.push([
              "Source",
              picocolors.yellow(parsed.validators.source.address),
              picocolors.cyan(
                `${amountToMainUnit(
                  parsed.validators.source.amount,
                  chains[broadcastResponse.chainId].decimals
                )} ${
                  parsed.validators.source.ticker ||
                  chains[broadcastResponse.chainId].ticker
                }`
              ),
            ]);
          }

          if (parsed.validators.target) {
            validatorTable.push([
              "Target",
              picocolors.yellow(parsed.validators.target.address),
              picocolors.cyan(
                `${amountToMainUnit(
                  parsed.validators.target.amount,
                  chains[broadcastResponse.chainId].decimals
                )} ${
                  parsed.validators.target.ticker ||
                  chains[broadcastResponse.chainId].ticker
                }`
              ),
            ]);
          }

          console.log(picocolors.bold("\nValidator Details:"));
          console.log(validatorTable.toString());
        }

        // Display any warnings
        if (txDetails.status.warnings && txDetails.status.warnings.length > 0) {
          console.log(picocolors.bold("\nWarnings:"));
          txDetails.status.warnings.forEach((warning: ErrorMsg) => {
            console.log(picocolors.yellow(`• ${warning.message}`));
          });
        }

        infoTerminal("========================================");

        break; // Exit the loop if we successfully got the details
      }

      attempts++;
      if (attempts < maxAttempts) {
        spinner.setText(
          `Waiting for transaction to be broadcasted (attempt ${attempts}/${maxAttempts})...`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      if (spinner.isStopped()) break;

      attempts++;
      if (attempts < maxAttempts) {
        spinner.setText(`Retrying... (attempt ${attempts}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  if (!txDetails?.transaction?.parsed) {
    spinner.stop(false);
    if (spinner.isStopped()) {
      infoTerminal(
        "Transaction check cancelled. You can check the status later using the transaction hash:"
      );
    } else {
      infoTerminal(
        "Transaction details not available yet. You can check the status later using the transaction hash:"
      );
    }
    infoTerminal(`Transaction Hash: ${broadcastResponse.hash}`);
  }
};
