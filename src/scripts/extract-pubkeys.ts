#!/usr/bin/env tsx

/**
 * CLI Tool: Extract public keys from all Bitcoin address types in a PSBT
 *
 * Usage:
 *   npx tsx src/scripts/extract-pubkeys.ts <hex_psbt>
 *
 * Example:
 *   npx tsx src/scripts/extract-pubkeys.ts 70736274ff0100...
 */

import * as bitcoin from "bitcoinjs-lib";

interface InputAnalysis {
  index: number;
  addressType: string;
  pubkey: string | null;
  address: string | null;
  amount: number | null;
  scriptHex: string;
}

// ---------------------------------------------------
// Helper Functions
// ---------------------------------------------------

function analyzeScriptPubKey(
  scriptHex: string,
  witnessUtxo?: any
): Partial<InputAnalysis> {
  try {
    const script = Buffer.from(scriptHex, "hex");

    // P2TR (Taproot) - OP_1 <32-byte>
    if (scriptHex.startsWith("5120") && scriptHex.length === 68) {
      const xOnlyPubkey = scriptHex.slice(4);
      const address = bitcoin.address.toBech32(
        Buffer.from(xOnlyPubkey, "hex"),
        1,
        "bc"
      );
      return {
        addressType: "P2TR (Taproot)",
        pubkey: xOnlyPubkey,
        address: address,
      };
    }

    // P2WPKH (Native SegWit) - OP_0 <20-byte>
    if (scriptHex.startsWith("0014") && scriptHex.length === 44) {
      const pubkeyHash = scriptHex.slice(4);
      const address = bitcoin.address.toBech32(
        Buffer.from(pubkeyHash, "hex"),
        0,
        "bc"
      );
      return {
        addressType: "P2WPKH (Native SegWit)",
        pubkey: `Hash: ${pubkeyHash}`,
        address: address,
      };
    }

    // P2WSH (Native SegWit Script) - OP_0 <32-byte>
    if (scriptHex.startsWith("0020") && scriptHex.length === 68) {
      const scriptHash = scriptHex.slice(4);
      const address = bitcoin.address.toBech32(
        Buffer.from(scriptHash, "hex"),
        0,
        "bc"
      );
      return {
        addressType: "P2WSH (Native SegWit Script)",
        pubkey: `Script Hash: ${scriptHash}`,
        address: address,
      };
    }

    // P2SH (SegWit wrapped) - OP_HASH160 <20-byte> OP_EQUAL
    if (
      scriptHex.startsWith("a914") &&
      scriptHex.endsWith("87") &&
      scriptHex.length === 46
    ) {
      const scriptHash = scriptHex.slice(4, -2);
      const address = bitcoin.address.toBase58Check(
        Buffer.from(scriptHash, "hex"),
        0x05
      );
      return {
        addressType: "P2SH (SegWit wrapped)",
        pubkey: `Script Hash: ${scriptHash}`,
        address: address,
      };
    }

    // P2PKH (Legacy) - OP_DUP OP_HASH160 <20-byte> OP_EQUALVERIFY OP_CHECKSIG
    if (
      scriptHex.startsWith("76a914") &&
      scriptHex.endsWith("88ac") &&
      scriptHex.length === 50
    ) {
      const pubkeyHash = scriptHex.slice(6, -4);
      const address = bitcoin.address.toBase58Check(
        Buffer.from(pubkeyHash, "hex"),
        0x00
      );
      return {
        addressType: "P2PKH (Legacy)",
        pubkey: `Hash: ${pubkeyHash}`,
        address: address,
      };
    }

    // P2PK (Pay to Public Key) - <pubkey> OP_CHECKSIG
    if (scriptHex.endsWith("ac")) {
      const pubkeyCandidate = scriptHex.slice(0, -2);
      if (pubkeyCandidate.length === 66 || pubkeyCandidate.length === 130) {
        // Remove length prefix if present
        const pubkey = pubkeyCandidate.startsWith("21")
          ? pubkeyCandidate.slice(2)
          : pubkeyCandidate.startsWith("41")
          ? pubkeyCandidate.slice(2)
          : pubkeyCandidate;

        if (pubkey.length === 66 || pubkey.length === 130) {
          return {
            addressType: "P2PK (Pay to Public Key)",
            pubkey: pubkey,
            address: "N/A (Direct pubkey)",
          };
        }
      }
    }

    return {
      addressType: "Unknown/Custom",
      pubkey: "Unable to extract",
      address: "Unable to determine",
    };
  } catch (err) {
    return {
      addressType: "Parse Error",
      pubkey: `Error: ${err instanceof Error ? err.message : String(err)}`,
      address: "N/A",
    };
  }
}

function extractPubkeyFromRedeemScript(input: any): string | null {
  // Try to extract pubkey from redeemScript or witnessScript
  if (input.redeemScript) {
    const redeemHex = input.redeemScript.toString("hex");
    // Look for pubkey patterns in redeem script
    if (redeemHex.startsWith("0014")) {
      // P2WPKH wrapped in P2SH
      return `WPKH Hash: ${redeemHex.slice(4)}`;
    }
  }

  if (input.witnessScript) {
    const witnessHex = input.witnessScript.toString("hex");
    // Analyze witness script for pubkeys
    return `Witness Script: ${witnessHex}`;
  }

  return null;
}

// ---------------------------------------------------
// Main Function
// ---------------------------------------------------
if (process.argv.length < 3) {
  console.error("❌ ERROR: Missing argument.");
  console.error("Usage: npx tsx src/scripts/extract-pubkeys.ts <hex_psbt>");
  process.exit(1);
}

const hexPsbt = process.argv[2];

let psbtBuffer;
try {
  psbtBuffer = Buffer.from(hexPsbt, "hex");
} catch (err) {
  console.error("❌ ERROR: Invalid hex string for PSBT.");
  process.exit(1);
}

let psbt;
try {
  psbt = bitcoin.Psbt.fromBuffer(psbtBuffer);
} catch (err) {
  console.error("❌ ERROR: Failed to parse PSBT. Is it valid?");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("✅ PSBT parsed successfully.\n");

// ---------------------------------------------------
// Analyze all inputs
// ---------------------------------------------------
const results: InputAnalysis[] = [];

psbt.data.inputs.forEach((input, index) => {
  if (!input.witnessUtxo) {
    results.push({
      index,
      addressType: "No UTXO data",
      pubkey: "N/A",
      address: "N/A",
      amount: null,
      scriptHex: "N/A",
    });
    return;
  }

  const scriptPubKey = input.witnessUtxo.script;
  const scriptHex = scriptPubKey.toString("hex");
  const amount = input.witnessUtxo.value;

  const analysis = analyzeScriptPubKey(scriptHex, input.witnessUtxo);

  // Try to get more detailed pubkey info from redeem/witness scripts
  const additionalPubkey = extractPubkeyFromRedeemScript(input);

  results.push({
    index,
    addressType: analysis.addressType || "Unknown",
    pubkey: additionalPubkey || analysis.pubkey || "Unable to extract",
    address: analysis.address || "Unable to determine",
    amount: amount,
    scriptHex: scriptHex,
  });
});

// ---------------------------------------------------
// Display Results in Table
// ---------------------------------------------------
console.log("📊 PSBT Input Analysis Results\n");
console.log(
  "┌─────┬──────────────────────────┬────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────┬──────────────┐"
);
console.log(
  "│ #   │ Address Type             │ Public Key / Hash                                                      │ Address                                                              │ Amount (BTC) │"
);
console.log(
  "├─────┼──────────────────────────┼────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────────┼──────────────┤"
);

results.forEach((result) => {
  const index = result.index.toString().padEnd(3);
  const type = result.addressType?.slice(0, 24).padEnd(24) || "N/A".padEnd(24);
  const pubkey = (result.pubkey?.slice(0, 70) || "N/A").padEnd(70);
  const address = (result.address?.slice(0, 68) || "N/A").padEnd(68);
  const amount = result.amount
    ? (result.amount / 100000000).toFixed(8).padStart(12)
    : "N/A".padStart(12);

  console.log(`│ ${index} │ ${type} │ ${pubkey} │ ${address} │ ${amount} │`);
});

console.log(
  "└─────┴──────────────────────────┴────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────────┴──────────────┘"
);

console.log("\n📋 Raw Script Details:");
results.forEach((result, i) => {
  if (result.scriptHex !== "N/A") {
    console.log(`\nInput ${i}: ${result.scriptHex}`);
  }
});

console.log("\n✅ Analysis complete!");
