#!/usr/bin/env tsx

/**
 * CLI Tool: Extract public keys and addresses from Bitcoin PSBTs
 *
 * Usage:
 *   npx tsx src/scripts/bitcoin/extract-pubkeys.ts <hex_psbt>
 *
 * Example:
 *   npx tsx src/scripts/bitcoin/extract-pubkeys.ts 70736274ff0100...
 */

import * as bitcoin from "bitcoinjs-lib";

interface InputAnalysis {
  index: number;
  addressType: string;
  pubkeyInfo: string;
  address: string;
  amount: number | null;
  scriptHex: string;
}

// ---------------------------------------------------
// Helper Functions
// ---------------------------------------------------

function analyzeScriptPubKey(scriptHex: string): Partial<InputAnalysis> {
  try {
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
        pubkeyInfo: `X-Only: ${xOnlyPubkey}`,
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
        pubkeyInfo: `PubkeyHash: ${pubkeyHash}`,
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
        addressType: "P2WSH (Native SegWit)",
        pubkeyInfo: `ScriptHash: ${scriptHash}`,
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
        pubkeyInfo: `ScriptHash: ${scriptHash}`,
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
        pubkeyInfo: `PubkeyHash: ${pubkeyHash}`,
        address: address,
      };
    }

    // P2PK (Pay to Public Key) - <pubkey> OP_CHECKSIG
    if (scriptHex.endsWith("ac")) {
      const pubkeyCandidate = scriptHex.slice(0, -2);
      if (pubkeyCandidate.length === 66 || pubkeyCandidate.length === 130) {
        const pubkey = pubkeyCandidate.startsWith("21")
          ? pubkeyCandidate.slice(2)
          : pubkeyCandidate.startsWith("41")
          ? pubkeyCandidate.slice(2)
          : pubkeyCandidate;

        if (pubkey.length === 66 || pubkey.length === 130) {
          return {
            addressType: "P2PK (Pay to Public Key)",
            pubkeyInfo: `Pubkey: ${pubkey}`,
            address: "N/A (Direct pubkey)",
          };
        }
      }
    }

    return {
      addressType: "Unknown/Custom",
      pubkeyInfo: "Unable to extract",
      address: "Unable to determine",
    };
  } catch (err) {
    return {
      addressType: "Parse Error",
      pubkeyInfo: `Error: ${err instanceof Error ? err.message : String(err)}`,
      address: "N/A",
    };
  }
}

function extractActualPubkeys(input: any): string[] {
  const pubkeys: string[] = [];

  // Check bip32Derivation for actual public keys
  if (input.bip32Derivation && Array.isArray(input.bip32Derivation)) {
    input.bip32Derivation.forEach((derivation: any) => {
      if (derivation.pubkey) {
        const pubkeyHex = derivation.pubkey.toString("hex");
        pubkeys.push(`BIP32: ${pubkeyHex}`);
      }
    });
  }

  // Check partialSig for public keys
  if (input.partialSig && typeof input.partialSig === "object") {
    Object.keys(input.partialSig).forEach((pubkeyHex) => {
      pubkeys.push(`PartialSig: ${pubkeyHex}`);
    });
  }

  // Check tapBip32Derivation for Taproot
  if (input.tapBip32Derivation && Array.isArray(input.tapBip32Derivation)) {
    input.tapBip32Derivation.forEach((derivation: any) => {
      if (derivation.pubkey) {
        const pubkeyHex = derivation.pubkey.toString("hex");
        pubkeys.push(`TapBIP32: ${pubkeyHex}`);
      }
    });
  }

  return pubkeys;
}

// ---------------------------------------------------
// Main Function
// ---------------------------------------------------
if (process.argv.length < 3) {
  console.error("❌ ERROR: Missing argument.");
  console.error(
    "Usage: npx tsx src/scripts/bitcoin/extract-pubkeys.ts <hex_psbt>"
  );
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

console.log("🔐 Bitcoin PSBT Analysis\n");
console.log("✅ PSBT parsed successfully\n");

// ---------------------------------------------------
// Analyze all inputs
// ---------------------------------------------------
const results: InputAnalysis[] = [];

psbt.data.inputs.forEach((input, index) => {
  if (!input.witnessUtxo) {
    results.push({
      index,
      addressType: "No UTXO data",
      pubkeyInfo: "N/A",
      address: "N/A",
      amount: null,
      scriptHex: "N/A",
    });
    return;
  }

  const scriptPubKey = input.witnessUtxo.script;
  const scriptHex = scriptPubKey.toString("hex");
  const amount = input.witnessUtxo.value;

  const analysis = analyzeScriptPubKey(scriptHex);

  // Extract actual public keys from BIP32 derivation, partial sigs, etc.
  const actualPubkeys = extractActualPubkeys(input);

  let finalPubkeyInfo = analysis.pubkeyInfo || "Unable to extract";
  if (actualPubkeys.length > 0) {
    finalPubkeyInfo = actualPubkeys.join(", ");
  }

  results.push({
    index,
    addressType: analysis.addressType || "Unknown",
    pubkeyInfo: finalPubkeyInfo,
    address: analysis.address || "Unable to determine",
    amount: amount,
    scriptHex: scriptHex,
  });
});

// ---------------------------------------------------
// Display Results
// ---------------------------------------------------
console.log("📊 PSBT Input Analysis\n");

results.forEach((result) => {
  const amountBTC = result.amount
    ? (result.amount / 100000000).toFixed(8)
    : "N/A";

  console.log(`Input ${result.index}:`);
  console.log(`  Type: ${result.addressType}`);
  console.log(`  Address: ${result.address}`);
  console.log(`  Amount: ${amountBTC} BTC`);
  console.log(`  Pubkey Info: ${result.pubkeyInfo}`);
  console.log(`  Script: ${result.scriptHex}`);
  console.log("");
});

// Show additional PSBT details if present
console.log("🔍 Additional PSBT Information:\n");

let hasAdditionalInfo = false;

psbt.data.inputs.forEach((input, index) => {
  const details: string[] = [];

  if (input.redeemScript) {
    details.push(`RedeemScript: ${input.redeemScript.toString("hex")}`);
  }

  if (input.witnessScript) {
    details.push(`WitnessScript: ${input.witnessScript.toString("hex")}`);
  }

  if (input.sighashType) {
    details.push(`SighashType: ${input.sighashType}`);
  }

  if (details.length > 0) {
    hasAdditionalInfo = true;
    console.log(`Input ${index} Additional Fields:`);
    details.forEach((detail) => console.log(`  ${detail}`));
    console.log("");
  }
});

if (!hasAdditionalInfo) {
  console.log("No additional fields found in PSBT inputs.");
}

console.log("✅ Analysis complete!");
