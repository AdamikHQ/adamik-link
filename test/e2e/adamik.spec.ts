import { expect } from "chai";
import * as dotenv from "dotenv";
import * as path from "path";
import { adamikLink } from "../../src/adamikLink";

const familyEncodedFormats = [
  {
    family: "ton",
    chainId: ["ton"],
    signerName: ["SODOT"],
    encodedFormats: [
      "HASH_SHA256", // TON uses SHA256 hash of the transaction
    ],
  },
  {
    family: "evm",
    signerName: ["TURNKEY"],
    chainId: ["sepolia"],
    encodedFormats: [
      "RLP", // Raw transaction in RLP format
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
  {
    family: "algorand",
    chainId: ["algorand"],
    signerName: ["TURNKEY"],
    encodedFormats: [
      "MSGPACK", // MessagePack format for Algorand transactions
      // "HASH_SHA512_256", // SHA256 hash of the transaction
    ],
  },
  {
    family: "starknet",
    chainId: ["starknet"],
    signerName: ["DFNS"],
    encodedFormats: [
      "HASH_PEDERSEN", // Pedersen hash format for Starknet transactions
    ],
  },
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
                        signHashOrTransaction: format.startsWith("HASH_")
                          ? "hash"
                          : "transaction",
                        ...(overrideParams || {}),
                      });

                      const result = await adamikLink();
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

    // Generate markdown report
    const date = new Date().toISOString().split("T")[0];
    const markdownContent = generateMarkdownReport(testResults, date);
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

function generateMarkdownReport(results: any[], date: string): string {
  const passedTests = results.filter((r) => r.status === "PASS").length;
  const failedTests = results.filter((r) => r.status === "FAIL").length;
  const totalTests = results.length;
  const successRate = ((passedTests / totalTests) * 100).toFixed(2);

  let markdown = `# Test Results Report - ${date}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- Total Tests: ${totalTests}\n`;
  markdown += `- Passed: ${passedTests}\n`;
  markdown += `- Failed: ${failedTests}\n`;
  markdown += `- Success Rate: ${successRate}%\n\n`;

  markdown += `## Detailed Results\n\n`;
  markdown += `| Family | Chain | Signer | Format | Status | Result |\n`;
  markdown += `|--------|-------|--------|--------|--------|--------|\n`;

  results.forEach((result) => {
    const status = result.status === "PASS" ? "✅ PASS" : "❌ FAIL";
    const resultText =
      result.status === "PASS"
        ? result.hash || "No hash returned"
        : result.error || "Unknown error";

    markdown += `| ${result.family} | ${result.chain} | ${result.signer} | ${result.format} | ${status} | \`${resultText}\` |\n`;
  });

  if (failedTests > 0) {
    markdown += `\n## Failed Tests Details\n\n`;
    results
      .filter((r) => r.status === "FAIL")
      .forEach((test, index) => {
        markdown += `### ${index + 1}. ${test.family} - ${test.chain} - ${
          test.signer
        } - ${test.format}\n\n`;
        markdown += `\`\`\`\n${test.error}\n\`\`\`\n\n`;
      });
  }

  return markdown;
}
