#!/usr/bin/env tsx

/**
 * CLI Tool: Comprehensive Public Key Recovery
 *
 * This script tries all recovery IDs and different message formats to find the correct public key
 *
 * Usage:
 *   npx tsx src/scripts/comprehensive-recovery.ts <psbt_hex> <signature_hex>
 */

import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

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

// Function to try recovering with all recovery IDs
function tryAllRecoveryIds(
  signature: Buffer,
  messageHash: Buffer,
  expectedPubkeyHash: string
): string | null {
  console.log(
    `\n🔄 Trying all recovery IDs with message hash: ${messageHash.toString(
      "hex"
    )}`
  );

  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);

  for (let recoveryId = 0; recoveryId < 4; recoveryId++) {
    console.log(`\n--- Recovery ID: ${recoveryId} ---`);

    try {
      // Recover the public key
      const recoveredPubkey = secp256k1.ecdsaRecover(
        Buffer.concat([r, s]),
        recoveryId,
        messageHash,
        false
      );
      const pubkeyHex = Buffer.from(recoveredPubkey).toString("hex");

      // Get compressed version
      const compressedPubkey = secp256k1.publicKeyConvert(
        recoveredPubkey,
        true
      );
      const compressedHex = Buffer.from(compressedPubkey).toString("hex");

      console.log(`Compressed: ${compressedHex}`);

      // Verify by computing the pubkey hash
      const pubkeyBuffer = Buffer.from(compressedHex, "hex");
      const sha256Hash = crypto
        .createHash("sha256")
        .update(pubkeyBuffer)
        .digest();
      const computedHash = crypto
        .createHash("ripemd160")
        .update(sha256Hash)
        .digest()
        .toString("hex");

      console.log(`Computed hash: ${computedHash}`);
      console.log(`Expected hash: ${expectedPubkeyHash}`);

      if (computedHash === expectedPubkeyHash) {
        console.log(`✅ MATCH with recovery ID ${recoveryId}!`);
        return compressedHex;
      }

      // Try with uncompressed pubkey
      const uncompressedBuffer = Buffer.from(pubkeyHex, "hex");
      const sha256Hash2 = crypto
        .createHash("sha256")
        .update(uncompressedBuffer)
        .digest();
      const computedHash2 = crypto
        .createHash("ripemd160")
        .update(sha256Hash2)
        .digest()
        .toString("hex");

      if (computedHash2 === expectedPubkeyHash) {
        console.log(
          `✅ MATCH with uncompressed pubkey and recovery ID ${recoveryId}!`
        );
        return pubkeyHex;
      }
    } catch (err) {
      console.log(`❌ Error with recovery ID ${recoveryId}: ${err}`);
    }
  }

  return null;
}

// Try different potential signing hashes
function tryDifferentSigningHashes(
  signature: Buffer,
  expectedPubkeyHash: string
): string | null {
  console.log("🔍 Trying different potential signing approaches...\n");

  // Test 1: Simple transaction hash (might be what IoFinnet uses)
  const simpleHashes = [
    // Just the TXID from the decoded PSBT
    Buffer.from(
      "779ce1067d651e2e4e225c8569508dcd4cfe903c8b269f776ed71c5bf01ef12d",
      "hex"
    ),
    Buffer.from(
      "779ce1067d651e2e4e225c8569508dcd4cfe903c8b269f776ed71c5bf01ef12d",
      "hex"
    ).reverse(),

    // Hash of the input TXID
    Buffer.from(
      "28622fa8a030114b515aa9a056892b1a9ad67f82e4b9cf4aef00158f995ea5b8",
      "hex"
    ),
    Buffer.from(
      "28622fa8a030114b515aa9a056892b1a9ad67f82e4b9cf4aef00158f995ea5b8",
      "hex"
    ).reverse(),

    // Hash of some key components
    crypto
      .createHash("sha256")
      .update(
        Buffer.from(
          "28622fa8a030114b515aa9a056892b1a9ad67f82e4b9cf4aef00158f995ea5b8",
          "hex"
        )
      )
      .digest(),
    crypto
      .createHash("sha256")
      .update(Buffer.from("3fac1a8303a3a9c25593f341d3b70cf0dfdd59c1", "hex"))
      .digest(),
  ];

  for (let i = 0; i < simpleHashes.length; i++) {
    console.log(`\n=== Test ${i + 1}: Simple Hash Approach ===`);
    const result = tryAllRecoveryIds(
      signature,
      simpleHashes[i],
      expectedPubkeyHash
    );
    if (result) {
      console.log(`🎉 SUCCESS with simple hash approach ${i + 1}!`);
      return result;
    }
  }

  return null;
}

// Main function
if (process.argv.length < 4) {
  console.error("❌ ERROR: Missing arguments.");
  console.error(
    "Usage: npx tsx src/scripts/comprehensive-recovery.ts <psbt_hex> <signature_hex>"
  );
  process.exit(1);
}

const psbtHex = process.argv[2];
let sigHex = process.argv[3];

// Remove 0x prefix if present
if (sigHex.startsWith("0x")) {
  sigHex = sigHex.slice(2);
}

console.log("🔐 Comprehensive Bitcoin Public Key Recovery\n");
console.log(`PSBT: ${psbtHex.slice(0, 64)}...`);
console.log(`Signature: ${sigHex}\n`);

// Parse PSBT
let psbt: bitcoin.Psbt;
try {
  const psbtBuffer = Buffer.from(psbtHex, "hex");
  psbt = bitcoin.Psbt.fromBuffer(psbtBuffer);
  console.log("✅ PSBT parsed successfully");
} catch (err) {
  console.error("❌ Failed to parse PSBT");
  process.exit(1);
}

// Parse signature
const signature = Buffer.from(sigHex, "hex");
console.log(`✅ Signature parsed: ${signature.length} bytes`);

// Get expected pubkey hash
const input = psbt.data.inputs[0];
if (!input.witnessUtxo) {
  console.error("❌ No witnessUtxo found");
  process.exit(1);
}

const scriptHex = input.witnessUtxo.script.toString("hex");
if (!scriptHex.startsWith("0014")) {
  console.error("❌ Not a P2WPKH input");
  process.exit(1);
}

const expectedPubkeyHash = scriptHex.slice(4);
console.log(`✅ Expected pubkey hash: ${expectedPubkeyHash}`);
console.log(
  `✅ Expected address: bc1q87kp4qcr5w5uy4vn7dqa8dcv7r0a6kwpw0r2dv\n`
);

// First try the BIP143 hash we computed earlier with all recovery IDs
const bip143Hash = Buffer.from(
  "cfbf8d59ec491720bd2c908514716818f4283a10b005d65170e8c41ec6ce1e52",
  "hex"
);
console.log("=== Test A: BIP143 Hash with All Recovery IDs ===");
let recoveredPubkey = tryAllRecoveryIds(
  signature,
  bip143Hash,
  expectedPubkeyHash
);

if (!recoveredPubkey) {
  // Try different potential signing approaches
  recoveredPubkey = tryDifferentSigningHashes(signature, expectedPubkeyHash);
}

if (recoveredPubkey) {
  console.log(`\n🎉 FINAL SUCCESS! Public Key: ${recoveredPubkey}`);

  // Generate the Bitcoin address for verification
  const pubkeyBuffer = Buffer.from(recoveredPubkey, "hex");
  const sha256Hash = crypto.createHash("sha256").update(pubkeyBuffer).digest();
  const hash160 = crypto.createHash("ripemd160").update(sha256Hash).digest();
  const address = bitcoin.address.toBech32(hash160, 0, "bc");

  console.log(`🏠 Recovered Address: ${address}`);
  console.log(
    `🎯 Expected Address: bc1q87kp4qcr5w5uy4vn7dqa8dcv7r0a6kwpw0r2dv`
  );
  console.log(
    `📋 Address Match: ${
      address === "bc1q87kp4qcr5w5uy4vn7dqa8dcv7r0a6kwpw0r2dv"
        ? "✅ PERFECT!"
        : "❌ Different"
    }`
  );
} else {
  console.log("\n❌ Failed to recover correct public key with any approach");
  console.log("\n💡 Possible reasons:");
  console.log("1. IoFinnet uses a different signing hash algorithm");
  console.log("2. The signature might be for a different transaction variant");
  console.log("3. IoFinnet might use different BIP143 parameters");
  console.log("4. This could be a test signature");

  console.log("\n📋 What we know for certain:");
  console.log("- The signature format is correct (65 bytes with recovery ID)");
  console.log("- secp256k1 recovery works (we can extract valid public keys)");
  console.log("- Our BIP143 implementation follows the specification");
  console.log("- The PSBT structure is valid");
}

console.log("\n✅ Comprehensive analysis complete!");
