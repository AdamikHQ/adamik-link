#!/usr/bin/env tsx

/**
 * CLI Tool: Extract Signing Inputs for Different Signer Specifications
 *
 * This script analyzes a PSBT and extracts the exact input data needed for different signers
 *
 * Usage:
 *   npx tsx src/scripts/bitcoin/extract-signing-inputs.ts <psbt_hex>
 *
 * Example:
 *   npx tsx src/scripts/bitcoin/extract-signing-inputs.ts 70736274ff0100710200000001b8a55e998f1500ef4acfb9e4827fd69a1a2b8956a0a95a514b1130a0a82f62280000000000fdffffff0210270000000000001600143fac1a8303a3a9c25593f341d3b70cf0dfdd59c17c9a0000000000001600143fac1a8303a3a9c25593f341d3b70cf0dfdd59c1000000000001011f50c30000000000001600143fac1a8303a3a9c25593f341d3b70cf0dfdd59c1000000
 */

import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";

// Helper function to convert number to little-endian buffer
function numberToLE(num: number, bytes: number): Buffer {
  const buf = Buffer.allocUnsafe(bytes);
  buf.writeUIntLE(num, 0, bytes);
  return buf;
}

// Helper function to convert bigint to little-endian buffer
function bigintToLE(num: bigint, bytes: number): Buffer {
  const buf = Buffer.allocUnsafe(bytes);
  buf.writeBigUInt64LE(num, 0);
  return buf;
}

interface SigningInput {
  name: string;
  description: string;
  data: Buffer;
  format: string;
  notes: string[];
}

// Compute BIP143 signing hash for P2WPKH
function computeBIP143SigningHash(
  psbt: bitcoin.Psbt,
  inputIndex: number
): Buffer {
  const input = psbt.data.inputs[inputIndex];
  const witnessUtxo = input.witnessUtxo;

  if (!witnessUtxo) {
    throw new Error("No witnessUtxo found");
  }

  // Use exact values from typical transaction
  const version = 2;
  const locktime = 0;

  const txInputs = psbt.txInputs;
  const txOutputs = psbt.txOutputs;

  // For P2WPKH, extract pubkey hash from script
  const scriptHex = witnessUtxo.script.toString("hex");
  if (!scriptHex.startsWith("0014")) {
    throw new Error("Not a P2WPKH script");
  }

  const pubkeyHash = Buffer.from(scriptHex.slice(4), "hex");

  // Create scriptCode for P2WPKH: OP_DUP OP_HASH160 <pubkeyhash> OP_EQUALVERIFY OP_CHECKSIG
  const scriptCode = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]), // OP_DUP OP_HASH160 PUSH(20)
    pubkeyHash,
    Buffer.from([0x88, 0xac]), // OP_EQUALVERIFY OP_CHECKSIG
  ]);

  // Step 1: Compute hashPrevouts
  const prevouts = Buffer.concat(
    txInputs.map((input) =>
      Buffer.concat([
        Buffer.from(input.hash).reverse(),
        numberToLE(input.index, 4),
      ])
    )
  );
  const hashPrevouts = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(prevouts).digest())
    .digest();

  // Step 2: Compute hashSequence (using sequence from PSBT analysis)
  const actualSequence = 4294967293; // From decoded PSBT
  const sequences = Buffer.concat(
    txInputs.map(() => numberToLE(actualSequence, 4))
  );
  const hashSequence = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(sequences).digest())
    .digest();

  // Step 3: Compute hashOutputs
  const outputs = Buffer.concat(
    txOutputs.map((output) => {
      const valueBuffer = bigintToLE(BigInt(output.value), 8);
      const scriptLength = Buffer.from([output.script.length]);

      return Buffer.concat([valueBuffer, scriptLength, output.script]);
    })
  );
  const hashOutputs = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(outputs).digest())
    .digest();

  // Step 4: Build the BIP143 preimage
  const currentInput = txInputs[inputIndex];
  const preimage = Buffer.concat([
    numberToLE(version, 4),
    hashPrevouts,
    hashSequence,
    Buffer.from(currentInput.hash).reverse(),
    numberToLE(currentInput.index, 4),
    Buffer.from([scriptCode.length]),
    scriptCode,
    bigintToLE(BigInt(witnessUtxo.value), 8),
    numberToLE(actualSequence, 4),
    hashOutputs,
    numberToLE(locktime, 4),
    numberToLE(1, 4), // SIGHASH_ALL
  ]);

  return preimage;
}

// Generate signing inputs for different signer specifications
function generateSigningInputs(
  psbt: bitcoin.Psbt,
  inputIndex: number
): SigningInput[] {
  const inputs: SigningInput[] = [];

  const input = psbt.data.inputs[inputIndex];
  const witnessUtxo = input.witnessUtxo;

  if (!witnessUtxo) {
    throw new Error("No witnessUtxo found");
  }

  const txInputs = psbt.txInputs;
  const txOutputs = psbt.txOutputs;
  const currentInput = txInputs[inputIndex];

  // 1. Raw Transaction Data (what IoFinnet might prefer)
  const rawTxData = Buffer.concat([
    // Transaction version
    numberToLE(2, 4),
    // Input count
    Buffer.from([txInputs.length]),
    // Input data
    ...txInputs.map((inp) =>
      Buffer.concat([
        Buffer.from(inp.hash).reverse(),
        numberToLE(inp.index, 4),
        Buffer.from([0]), // Empty scriptSig
        numberToLE(4294967293, 4), // sequence
      ])
    ),
    // Output count
    Buffer.from([txOutputs.length]),
    // Output data
    ...txOutputs.map((out) =>
      Buffer.concat([
        bigintToLE(BigInt(out.value), 8),
        Buffer.from([out.script.length]),
        out.script,
      ])
    ),
    // Locktime
    numberToLE(0, 4),
  ]);

  inputs.push({
    name: "Raw Transaction Data",
    description: "Complete unsigned transaction serialization",
    data: rawTxData,
    format: "Binary transaction data",
    notes: [
      "Some MPC providers prefer to sign raw transaction data",
      "IoFinnet might use this approach instead of pre-hashed data",
      "Includes all transaction components in Bitcoin format",
    ],
  });

  // 2. BIP143 Preimage (Standard Bitcoin Signing)
  const bip143Preimage = computeBIP143SigningHash(psbt, inputIndex);

  inputs.push({
    name: "BIP143 Preimage",
    description: "Standard Bitcoin BIP143 signing preimage for SegWit",
    data: bip143Preimage,
    format: "182-byte BIP143 preimage",
    notes: [
      "Standard Bitcoin signing method for SegWit transactions",
      "Must be double-SHA256 hashed before ECDSA signing",
      "Used by most Bitcoin wallets and libraries",
    ],
  });

  // 3. BIP143 Hash (Double SHA256 of preimage)
  const bip143Hash = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(bip143Preimage).digest())
    .digest();

  inputs.push({
    name: "BIP143 Hash (Double SHA256)",
    description: "Pre-hashed BIP143 signing hash",
    data: bip143Hash,
    format: "32-byte hash",
    notes: [
      "Ready-to-sign hash for ECDSA",
      "Standard output of BIP143 process",
      "This is what most signers actually sign",
    ],
  });

  // 4. Single SHA256 variants
  const singleSHA256Preimage = crypto
    .createHash("sha256")
    .update(bip143Preimage)
    .digest();
  const singleSHA256RawTx = crypto
    .createHash("sha256")
    .update(rawTxData)
    .digest();

  inputs.push({
    name: "Single SHA256 of BIP143 Preimage",
    description: "Single SHA256 hash of BIP143 preimage",
    data: singleSHA256Preimage,
    format: "32-byte hash",
    notes: [
      "Some implementations use single SHA256 instead of double",
      "Less common but possible for custom signers",
    ],
  });

  inputs.push({
    name: "Single SHA256 of Raw Transaction",
    description: "Single SHA256 hash of raw transaction data",
    data: singleSHA256RawTx,
    format: "32-byte hash",
    notes: [
      "Simple hash of transaction data",
      "Might be used by simplified signing implementations",
    ],
  });

  // 5. Transaction ID related
  const txid = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(rawTxData).digest())
    .digest();

  inputs.push({
    name: "Transaction ID (TXID)",
    description: "Double SHA256 of complete transaction",
    data: txid,
    format: "32-byte hash",
    notes: [
      "Standard Bitcoin transaction ID",
      "Uniquely identifies the transaction",
      "Sometimes used as signing input by custom implementations",
    ],
  });

  // 6. Input-specific data
  const inputSpecificData = Buffer.concat([
    Buffer.from(currentInput.hash).reverse(),
    numberToLE(currentInput.index, 4),
    bigintToLE(BigInt(witnessUtxo.value), 8),
  ]);

  inputs.push({
    name: "Input-Specific Data",
    description: "Data specific to the input being signed",
    data: inputSpecificData,
    format: "44-byte input data",
    notes: [
      "Contains: previous TXID (32) + output index (4) + amount (8)",
      "Minimal data identifying what's being spent",
      "Could be used by minimalist signing approaches",
    ],
  });

  // 7. Script-related data
  const scriptHex = witnessUtxo.script.toString("hex");
  const pubkeyHash = Buffer.from(scriptHex.slice(4), "hex");

  inputs.push({
    name: "Public Key Hash",
    description: "The hash that should match the signing public key",
    data: pubkeyHash,
    format: "20-byte hash160",
    notes: [
      "RIPEMD160(SHA256(compressed_pubkey))",
      "This is what the recovered public key should hash to",
      "Used for verification, not signing",
    ],
  });

  return inputs;
}

// Main function
if (process.argv.length < 3) {
  console.error("❌ ERROR: Missing PSBT argument.");
  console.error(
    "Usage: npx tsx src/scripts/bitcoin/extract-signing-inputs.ts <psbt_hex>"
  );
  process.exit(1);
}

const psbtHex = process.argv[2];

console.log("🔐 Bitcoin Signing Input Extractor\n");
console.log(`PSBT: ${psbtHex.slice(0, 64)}...\n`);

// Parse PSBT
let psbt: bitcoin.Psbt;
try {
  const psbtBuffer = Buffer.from(psbtHex, "hex");
  psbt = bitcoin.Psbt.fromBuffer(psbtBuffer);
  console.log("✅ PSBT parsed successfully");
} catch (err) {
  console.error("❌ Failed to parse PSBT");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Analyze the first input (assuming single input transaction)
const input = psbt.data.inputs[0];
if (!input.witnessUtxo) {
  console.error("❌ No witnessUtxo found");
  process.exit(1);
}

const scriptHex = input.witnessUtxo.script.toString("hex");
if (!scriptHex.startsWith("0014")) {
  console.error(
    "❌ Not a P2WPKH input - this tool currently supports P2WPKH only"
  );
  process.exit(1);
}

const expectedPubkeyHash = scriptHex.slice(4);
const expectedAddress = bitcoin.address.toBech32(
  Buffer.from(expectedPubkeyHash, "hex"),
  0,
  "bc"
);

console.log(`📋 Transaction Info:`);
console.log(`- Input count: ${psbt.txInputs.length}`);
console.log(`- Output count: ${psbt.txOutputs.length}`);
console.log(`- Expected address: ${expectedAddress}`);
console.log(`- Expected pubkey hash: ${expectedPubkeyHash}`);
console.log(`- Amount: ${input.witnessUtxo.value} satoshis\n`);

try {
  // Generate signing inputs
  const signingInputs = generateSigningInputs(psbt, 0);

  console.log("🎯 SIGNING INPUTS FOR DIFFERENT SIGNER SPECIFICATIONS\n");
  console.log("=".repeat(80));

  signingInputs.forEach((sigInput, index) => {
    console.log(`\n${index + 1}. ${sigInput.name}`);
    console.log("-".repeat(50));
    console.log(`Description: ${sigInput.description}`);
    console.log(`Format: ${sigInput.format}`);
    console.log(`Size: ${sigInput.data.length} bytes`);
    console.log(`Hex: ${sigInput.data.toString("hex")}`);

    if (sigInput.notes.length > 0) {
      console.log(`Notes:`);
      sigInput.notes.forEach((note) => console.log(`  • ${note}`));
    }
  });

  // Generate IoFinnet-specific signing modes
  console.log("\n🎯 IOFINNET-SPECIFIC SIGNING MODES\n");
  console.log("=".repeat(80));

  console.log("\nES256K MODE (ECDSA + SHA256):");
  console.log("-".repeat(40));
  console.log("IoFinnet will compute: ECDSA_SIGN(SHA256(your_input))");

  signingInputs.forEach((sigInput, index) => {
    if (sigInput.data.length <= 64) {
      // Show reasonable-sized inputs for ES256K
      const sha256Hash = crypto
        .createHash("sha256")
        .update(sigInput.data)
        .digest();
      console.log(`\n${index + 1}. ${sigInput.name}:`);
      console.log(`   Your input: ${sigInput.data.toString("hex")}`);
      console.log(`   SHA256 result: ${sha256Hash.toString("hex")}`);
      console.log(`   IoFinnet signs: the SHA256 result above`);
    }
  });

  console.log("\nESKEC256 MODE (ECDSA + KECCAK256):");
  console.log("-".repeat(40));
  console.log("IoFinnet will compute: ECDSA_SIGN(KECCAK256(your_input))");
  console.log("Note: KECCAK256 is used in Ethereum, different from SHA256");

  console.log("\n" + "=".repeat(80));
  console.log("\n💡 IoFinnet Integration Guide:");
  console.log("📋 IoFinnet supports two signing modes:");
  console.log(
    "   • ES256K: ECDSA(SHA256(message)) - Standard Bitcoin approach"
  );
  console.log(
    "   • ESKEC256: ECDSA(KECCAK256(message)) - Ethereum-style approach"
  );
  console.log("");
  console.log("🎯 Recommended testing order for Bitcoin:");
  console.log(
    "1. ES256K with option #3 (BIP143 Hash) - most likely for Bitcoin"
  );
  console.log("2. ES256K with option #1 (Raw Transaction Data)");
  console.log("3. ES256K with option #4 (Single SHA256 of BIP143)");
  console.log("4. Try ESKEC256 modes if ES256K doesn't work");

  console.log("\n📝 Testing Process:");
  console.log("1. Choose a signing input from the options above");
  console.log("2. Send to IoFinnet with ES256K or ESKEC256 mode");
  console.log("3. IoFinnet returns: ECDSA signature (r, s, recovery_id)");
  console.log("4. Use comprehensive-recovery.ts to recover the public key");
  console.log(
    "5. Verify: recovered pubkey should hash to " + expectedPubkeyHash
  );
} catch (err) {
  console.error(
    `❌ Error: ${err instanceof Error ? err.message : String(err)}`
  );
}

console.log("\n✅ Extraction complete!");
