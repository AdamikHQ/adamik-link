import { expect } from "chai";
import * as dotenv from "dotenv";
import * as path from "path";
import {
  AdamikAPIError,
  AdamikBalance,
  AdamikBroadcastResponse,
  AdamikChain,
} from "../../src/adamik/types";
import { adamikLink } from "../../src/adamikLink";
import { amountToMainUnit } from "../../src/utils";

const familyEncodedFormats = [
  {
    family: "ton",
    chainId: ["ton"],
    signerName: ["SODOT", "TURNKEY"],
    encodedFormats: [
      "HASH_SHA256", // TON uses SHA256 hash of the transaction
    ],
  },
  {
    family: "evm",
    signerName: ["TURNKEY", "SODOT"],
    chainId: ["sepolia"],
    encodedFormats: [
      // "RLP", // Raw transaction in RLP format
      "HASH_KECCAK256", // Keccak256 hash of the transaction
    ],
  },
  {
    family: "cosmos",
    chainId: ["cosmoshub"],
    signerName: ["TURNKEY", "SODOT"],
    encodedFormats: [
      "SIGNDOC_DIRECT", // Direct sign document format
      "HASH_SHA256", // SHA256 hash of the transaction
    ],
  },
  {
    family: "tron",
    signerName: ["SODOT"],
    chainId: ["tron"],
    encodedFormats: [
      "RAW_TRANSACTION", // Raw transaction data
      "HASH_SHA256", // SHA256 hash of the transaction
    ],
    overrideParams: {
      recipientAddress: "TRFc31J1drV7C8CYYjhpJxTxBe1Muf7MGg", // We can't self send in Tron
    },
  },
  // {
  //   family: "algorand",
  //   chainId: ["algorand"],
  //   signerName: ["TURNKEY"],
  //   encodedFormats: [
  // "MSGPACK", // MessagePack format for Algorand transactions
  // "HASH_SHA512_256", // SHA256 hash of the transaction
  //   ],
  // },
  // {
  //   family: "starknet",
  //   chainId: ["starknet"],
  //   signerName: ["DFNS"],
  //   encodedFormats: [
  //     "HASH_PEDERSEN", // Pedersen hash format for Starknet transactions
  //   ],
  // },
];

const commonConfig = {
  startProcess: true,
  chainId: "ton",
  signerName: "SODOT",
  mode: "transfer",
  recipientAddress: "default",
  amount: "default",
  continueTransaction: true,
  continueSigning: true,
  acceptBroadcast: true,
  checkDetails: false,
  startNewTransaction: false,
  continueDeploy: true,
  address: "default",
  toSign: "HASH_SHA256",
};

describe("adamikLink", () => {
  const testResults: {
    family: string;
    chain: string;
    signer: string;
    format: string;
    status: "PASS" | "FAIL";
    hash?: string;
    error?: string;
  }[] = [];

  before(() => {
    // Load environment variables
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

    // Set up prompt overrides for testing
    process.env.ADAMIK_E2E_TEST = "true";
  });

  // Test each family and their encoded formats
  familyEncodedFormats.forEach(
    ({ family, chainId, signerName, encodedFormats, overrideParams }) => {
      describe(`Family: ${family}`, () => {
        chainId.forEach((chain) => {
          describe(`Chain: ${chain}`, () => {
            encodedFormats.forEach((format) => {
              describe(`Format: ${format}`, () => {
                signerName.forEach((signer) => {
                  it(`should complete a full transaction flow with ${family} - ${chain} - ${signer} - ${format}`, async () => {
                    try {
                      // Set up configuration for this specific test
                      process.env.ADAMIK_PROMPT_OVERRIDES = JSON.stringify({
                        ...commonConfig,
                        chainId: chain,
                        signerName: signer,
                        toSign: format,
                        ...(overrideParams || {}),
                      });

                      const result =
                        (await adamikLink()) as AdamikAPIError<AdamikBroadcastResponse>;
                      expect(result?.hash).to.be.a("string");

                      testResults.push({
                        family,
                        chain,
                        signer,
                        format,
                        status: "PASS",
                        hash: result?.hash,
                      });
                    } catch (error) {
                      testResults.push({
                        family,
                        chain,
                        signer,
                        format,
                        status: "FAIL",
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      });
                      throw error;
                    }
                  });
                });
              });
            });
          });
        });
      });
    }
  );

  const balanceTestResults: {
    family: string;
    chain: string;
    signer: string;
    status: "PASS" | "FAIL";
    balance: AdamikBalance | undefined;
    chainInfo: AdamikChain | undefined;
    error?: string;
    address?: string;
  }[] = [];

  familyEncodedFormats.forEach(({ family, chainId, signerName }) => {
    describe(`Family: ${family}`, () => {
      chainId.forEach((chain) => {
        describe(`Chain: ${chain}`, () => {
          signerName.forEach((signer) => {
            describe(`Signer: ${signer}`, () => {
              describe(`Balance: ${chain}`, () => {
                it(`should display the balance for ${family} - ${chain} - ${signer}`, async () => {
                  try {
                    // Set up configuration for this specific test
                    process.env.ADAMIK_PROMPT_OVERRIDES = JSON.stringify({
                      ...commonConfig,
                      continueTransaction: false,
                      chainId: chain,
                      signerName: signer,
                    });

                    const result = (await adamikLink()) as {
                      chains: Record<string, AdamikChain>;
                      chainId: string;
                      balance: AdamikBalance;
                      address: string;
                    };

                    expect(result.balance).to.be.an("object");

                    balanceTestResults.push({
                      family,
                      chain: result.chainId,
                      signer,
                      status: "PASS",
                      balance: result.balance,
                      address: result.address,
                      chainInfo: result.chains[result.chainId],
                    });
                  } catch (error) {
                    balanceTestResults.push({
                      family,
                      chain,
                      signer,
                      status: "FAIL",
                      balance: undefined,
                      chainInfo: undefined,
                      error:
                        error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  after(() => {
    // Print test summary table
    console.log("\nTest Summary:");
    console.log(
      "┌───────────┬───────────┬─────────────┬──────────────────┬────────┬───────────────────────────────────────────────────────────────────────────────"
    );
    console.log(
      "│ Family    │ Chain     │ Signer      │ Format           │ Status │ Result"
    );
    console.log(
      "├───────────┼───────────┼─────────────┼──────────────────┼────────┼───────────────────────────────────────────────────────────────────────────────"
    );

    testResults.forEach((result) => {
      const family = result.family.padEnd(9);
      const chain = result.chain.padEnd(9);
      const signer = result.signer.padEnd(11);
      const format = result.format.padEnd(16);
      const status =
        result.status === "PASS" ? `✅ PASS`.padEnd(6) : `❌ FAIL`.padEnd(6);

      const resultText =
        result.status === "PASS"
          ? result.hash || "No hash returned"
          : result.error || "Unknown error";

      console.log(
        `│ ${family} │ ${chain} │ ${signer} │ ${format} │ ${status} │ ${resultText}`
      );
    });

    console.log(
      "└───────────┴───────────┴─────────────┴──────────────────┴────────┴───────────────────────────────────────────────────────────────────────────────"
    );

    // Print balance summary table
    console.log("\nBalance Summary:");
    console.log(
      "┌───────────┬───────────┬─────────────┬────────┬───────────────────────────────────────────────────────────────────────────────"
    );
    console.log(
      "│ Family    │ Chain     │ Signer      │ Status │ Balance Details"
    );
    console.log(
      "├───────────┼───────────┼─────────────┼────────┼───────────────────────────────────────────────────────────────────────────────"
    );

    balanceTestResults.forEach((result) => {
      const family = result.family.padEnd(9);
      const chain = result.chain.padEnd(9);
      const signer = result.signer.padEnd(11);
      const status =
        result.status === "PASS" ? `✅ PASS`.padEnd(6) : `❌ FAIL`.padEnd(6);

      let balanceText = "No balance data";
      if (result.status === "PASS" && result.balance && result.chainInfo) {
        const nativeBalance = result.balance.balances.native;
        const decimals = result.chainInfo.decimals;
        const ticker = result.chainInfo.ticker;
        const available = amountToMainUnit(nativeBalance.available, decimals);
        const total = amountToMainUnit(nativeBalance.total, decimals);

        // Check for low or zero balances
        const availableNum = parseFloat(available || "0");
        const isZero = availableNum === 0;
        const isLow = availableNum > 0 && availableNum < 0.01; // Less than 0.01 is considered low

        // First line: Address
        balanceText = `Address: ${result.address}\n`;

        // Second line: Native balance with warning if needed
        const warningEmoji = isZero ? "⚠️" : isLow ? "🔸" : "";
        const warningText = isZero
          ? "ZERO BALANCE!"
          : isLow
          ? "LOW BALANCE!"
          : "";
        balanceText += `│           │           │             │        │ ${ticker}: ${available} (Available) | ${total} (Total) ${warningEmoji} ${warningText}\n`;

        // Third line: Token balances if any
        if (result.balance.balances.tokens?.length > 0) {
          const tokenBalances = result.balance.balances.tokens
            .map((token) => {
              const tokenAmount = amountToMainUnit(
                token.amount || "0",
                parseInt(token.token.decimals)
              );
              const tokenNum = parseFloat(tokenAmount || "0");
              const isTokenZero = tokenNum === 0;
              const isTokenLow = tokenNum > 0 && tokenNum < 0.01;
              const tokenWarningEmoji = isTokenZero
                ? "⚠️ "
                : isTokenLow
                ? "🔸"
                : "";
              const tokenWarningText = isTokenZero
                ? "ZERO BALANCE!"
                : isTokenLow
                ? "LOW BALANCE!"
                : "";
              return `${token.token.ticker}: ${tokenAmount} ${tokenWarningEmoji} ${tokenWarningText}`;
            })
            .join(" | ");
          balanceText += `│           │           │             │        │ Tokens: ${tokenBalances}`;
        }
      } else if (result.error) {
        balanceText = result.error;
      }

      console.log(
        `│ ${family} │ ${chain} │ ${signer} │ ${status} │ ${balanceText}`
      );
    });

    console.log(
      "└───────────┴───────────┴─────────────┴────────┴───────────────────────────────────────────────────────────────────────────────"
    );

    // Generate markdown report
    const date = new Date().toISOString().split("T")[0];
    const markdownContent = generateMarkdownReport(
      testResults,
      balanceTestResults,
      date
    );
    const fs = require("fs");
    const path = require("path");

    const reportDir = path.join(process.cwd(), "test-reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir);
    }

    const reportPath = path.join(
      reportDir,
      `test-results-${date}-${new Date().getTime()}.md`
    );
    fs.writeFileSync(reportPath, markdownContent);
    console.log(`\nTest report generated: ${reportPath}`);
  });
});

function generateMarkdownReport(
  testResults: any[],
  balanceResults: any[],
  date: string
): string {
  const passedTests = testResults.filter((r) => r.status === "PASS").length;
  const failedTests = testResults.filter((r) => r.status === "FAIL").length;
  const totalTests = testResults.length;
  const successRate = ((passedTests / totalTests) * 100).toFixed(2);

  let markdown = `# Test Results Report - ${date}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- Total Tests: ${totalTests}\n`;
  markdown += `- Passed: ${passedTests}\n`;
  markdown += `- Failed: ${failedTests}\n`;
  markdown += `- Success Rate: ${successRate}%\n\n`;

  markdown += `## Transaction Results\n\n`;
  markdown += `| Family | Chain | Signer | Status | Result |\n`;
  markdown += `|--------|-------|--------|--------|--------|\n`;

  testResults.forEach((result) => {
    const status = result.status === "PASS" ? "✅ PASS" : "❌ FAIL";
    const resultText =
      result.status === "PASS"
        ? result.hash || "No hash returned"
        : result.error || "Unknown error";

    markdown += `| ${result.family} | ${result.chain} | ${result.signer} | ${status} | \`${resultText}\` |\n`;
  });

  markdown += `\n## Balance Results\n\n`;
  markdown += `| Family | Chain | Signer | Status | Balance Details |\n`;
  markdown += `|--------|-------|--------|--------|----------------|\n`;

  balanceResults.forEach((result) => {
    const status = result.status === "PASS" ? "✅ PASS" : "❌ FAIL";
    let balanceText = "No balance data";

    if (result.status === "PASS" && result.balance && result.chainInfo) {
      const nativeBalance = result.balance.balances.native;
      const decimals = result.chainInfo.decimals;
      const ticker = result.chainInfo.ticker;
      const available = amountToMainUnit(nativeBalance.available, decimals);
      const total = amountToMainUnit(nativeBalance.total, decimals);

      // Check for low or zero balances
      const availableNum = parseFloat(available || "0");
      const isZero = availableNum === 0;
      const isLow = availableNum > 0 && availableNum < 0.01; // Less than 0.01 is considered low

      // First line: Address
      balanceText = `**Address:** \`${result.address}\`\n\n`;

      // Second line: Native balance with warning if needed
      const warningEmoji = isZero ? "⚠️" : isLow ? "🔸" : "";
      const warningText = isZero
        ? "**ZERO BALANCE!**"
        : isLow
        ? "**LOW BALANCE!**"
        : "";
      balanceText += `**${ticker}:** ${available} (Available) | ${total} (Total) ${warningEmoji} ${warningText}\n\n`;

      // Third line: Token balances if any
      if (result.balance.balances.tokens?.length > 0) {
        const tokenBalances = result.balance.balances.tokens
          .map((token) => {
            const tokenAmount = amountToMainUnit(
              token.amount || "0",
              parseInt(token.token.decimals)
            );
            const tokenNum = parseFloat(tokenAmount || "0");
            const isTokenZero = tokenNum === 0;
            const isTokenLow = tokenNum > 0 && tokenNum < 0.01;
            const tokenWarningEmoji = isTokenZero
              ? "⚠️"
              : isTokenLow
              ? "🔸"
              : "";
            const tokenWarningText = isTokenZero
              ? "**ZERO BALANCE!**"
              : isTokenLow
              ? "**LOW BALANCE!**"
              : "";
            return `**${token.token.ticker}:** ${tokenAmount} ${tokenWarningEmoji} ${tokenWarningText}`;
          })
          .join("\n\n");
        balanceText += `**Tokens:**\n${tokenBalances}`;
      }
    } else if (result.error) {
      balanceText = result.error;
    }

    markdown += `| ${result.family} | ${result.chain} | ${result.signer} | ${status} | ${balanceText} |\n`;
  });

  if (failedTests > 0) {
    markdown += `\n## Failed Tests Details\n\n`;
    testResults
      .filter((r) => r.status === "FAIL")
      .forEach((test, index) => {
        markdown += `### ${index + 1}. ${test.family} - ${test.chain} - ${
          test.signer
        }\n\n`;
        markdown += `\`\`\`\n${test.error}\n\`\`\`\n\n`;
      });
  }

  return markdown;
}
