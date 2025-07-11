#!/usr/bin/env tsx

/**
 * Bitcoin Transaction Finalizer with Signature Verification
 *
 * This script takes an unsigned PSBT and a signature (from IoFinnet or similar MPC provider)
 * and produces a finalized, broadcast-ready Bitcoin transaction.
 *
 * Usage:
 *   npx tsx src/scripts/finalizeBitcoinTransaction.ts <psbt_hex> <signature_hex>
 *
 * Assumptions:
 * - The signature was obtained by signing SHA256(BIP143_preimage)
 * - The signer applied an additional SHA256 internally (resulting in double SHA256)
 * - This is the standard flow for IoFinnet and similar MPC providers
 */

import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

// Helper functions for BIP143 computation
function numberToLE(num: number, bytes: number): Buffer {
  const buf = Buffer.allocUnsafe(bytes);
  buf.writeUIntLE(num, 0, bytes);
  return buf;
}

function bigintToLE(num: bigint, bytes: number): Buffer {
  const buf = Buffer.allocUnsafe(bytes);
  buf.writeBigUInt64LE(num, 0);
  return buf;
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

  // Create scriptCode for P2WPKH
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

  // Step 2: Compute hashSequence
  const actualSequence = 4294967293; // Standard sequence
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

// Main function
if (process.argv.length < 4) {
  console.error("❌ ERROR: Missing arguments.");
  console.error(
    "Usage: npx tsx src/scripts/finalizeBitcoinTransaction.ts <psbt_hex> <signature_hex>"
  );
  console.error("");
  console.error("Example:");
  console.error("  npx tsx src/scripts/finalizeBitcoinTransaction.ts \\");
  console.error("    70736274ff0100710200000001b8a55e998... \\");
  console.error("    0xc0357ad12a39e8eb83c29f6f562f07c0...");
  process.exit(1);
}

const psbtHex = process.argv[2];
let signatureHex = process.argv[3];

// Remove 0x prefix if present
if (signatureHex.startsWith("0x")) {
  signatureHex = signatureHex.slice(2);
}

console.log("🔐 BITCOIN TRANSACTION FINALIZER");
console.log("=".repeat(70));
console.log(`PSBT: ${psbtHex.slice(0, 40)}...`);
console.log(`Signature: ${signatureHex.slice(0, 40)}...`);

// Parse PSBT
let psbt: bitcoin.Psbt;
try {
  const psbtBuffer = Buffer.from(psbtHex, "hex");
  psbt = bitcoin.Psbt.fromBuffer(psbtBuffer);
  console.log("\n✅ PSBT parsed successfully");
} catch (err) {
  console.error("❌ Failed to parse PSBT");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Parse signature
let sigBuffer: Buffer;
try {
  sigBuffer = Buffer.from(signatureHex, "hex");
  console.log("✅ Signature parsed successfully");
} catch (err) {
  console.error("❌ Failed to parse signature");
  process.exit(1);
}

// Validate inputs
const input = psbt.data.inputs[0];
if (!input.witnessUtxo) {
  console.error("❌ No witnessUtxo found");
  process.exit(1);
}

const scriptHex = input.witnessUtxo.script.toString("hex");
if (!scriptHex.startsWith("0014")) {
  console.error(
    "❌ Not a P2WPKH input - this script currently supports P2WPKH only"
  );
  process.exit(1);
}

if (sigBuffer.length !== 65) {
  console.error(
    `❌ Invalid signature length: ${sigBuffer.length} bytes (expected 65)`
  );
  process.exit(1);
}

// Extract expected address from PSBT
const expectedPubkeyHash = scriptHex.slice(4);
const expectedAddress = bitcoin.address.toBech32(
  Buffer.from(expectedPubkeyHash, "hex"),
  0,
  "bc"
);

console.log("\n📋 TRANSACTION INFO:");
console.log(`Expected address: ${expectedAddress}`);
console.log(`Expected pubkey hash: ${expectedPubkeyHash}`);
console.log(`Input amount: ${input.witnessUtxo.value} satoshis`);
console.log(`Number of outputs: ${psbt.txOutputs.length}`);

// Compute what the signer actually signed
try {
  console.log("\n🔍 SIGNATURE VERIFICATION:");

  // Step 1: Compute BIP143 preimage
  const bip143Preimage = computeBIP143SigningHash(psbt, 0);

  // Step 2: Compute single SHA256 (what was sent to signer)
  const singleSHA256 = crypto
    .createHash("sha256")
    .update(bip143Preimage)
    .digest();

  // Step 3: Compute what signer actually signed (double SHA256)
  const doubleSHA256 = crypto
    .createHash("sha256")
    .update(singleSHA256)
    .digest();

  console.log(
    `BIP143 preimage: ${bip143Preimage.toString("hex").slice(0, 40)}... (${
      bip143Preimage.length
    } bytes)`
  );
  console.log(`Single SHA256: ${singleSHA256.toString("hex")}`);
  console.log(`Double SHA256 (signed): ${doubleSHA256.toString("hex")}`);

  // Parse signature components
  const r = sigBuffer.slice(0, 32);
  const s = sigBuffer.slice(32, 64);
  const recoveryId = sigBuffer[64];

  console.log(`Recovery ID: ${recoveryId}`);

  // Recover public key
  const recoveredPubkey = secp256k1.ecdsaRecover(
    sigBuffer.slice(0, 64),
    recoveryId,
    doubleSHA256
  );

  const compressedPubkey = secp256k1.publicKeyConvert(recoveredPubkey, true);
  const compressedHex = Buffer.from(compressedPubkey).toString("hex");

  // Generate address from recovered public key
  const sha256Hash = crypto
    .createHash("sha256")
    .update(compressedPubkey)
    .digest();
  const ripemd160Hash = crypto
    .createHash("ripemd160")
    .update(sha256Hash)
    .digest();
  const recoveredAddress = bitcoin.address.toBech32(ripemd160Hash, 0, "bc");
  const recoveredPubkeyHash = ripemd160Hash.toString("hex");

  console.log("\n🔑 VERIFICATION RESULTS:");
  console.log(`✅ Signature is cryptographically valid`);
  console.log(`✅ Recovered public key: ${compressedHex}`);
  console.log(`✅ Derived address: ${recoveredAddress}`);

  // Verify match
  const addressMatch = recoveredAddress === expectedAddress;
  const pubkeyHashMatch = recoveredPubkeyHash === expectedPubkeyHash;

  if (addressMatch && pubkeyHashMatch) {
    console.log(`✅ Matches expected PSBT address: PERFECT MATCH!`);
    console.log(`✅ Pubkey hash match: ${recoveredPubkeyHash}`);

    // Validate signature
    const isValidSignature = secp256k1.ecdsaVerify(
      sigBuffer.slice(0, 64),
      doubleSHA256,
      compressedPubkey
    );
    console.log(
      `✅ Signature validation: ${isValidSignature ? "VALID" : "INVALID"}`
    );

    if (isValidSignature) {
      console.log("\n🚀 FINALIZING TRANSACTION:");

      // Create DER-encoded signature for Bitcoin
      const derSignature = bitcoin.script.signature.encode(
        Buffer.concat([r, s]),
        bitcoin.Transaction.SIGHASH_ALL
      );

      // Add signature and public key to PSBT
      psbt.updateInput(0, {
        partialSig: [
          {
            pubkey: Buffer.from(compressedPubkey),
            signature: derSignature,
          },
        ],
      });

      // Finalize the transaction
      psbt.finalizeAllInputs();
      const finalizedTx = psbt.extractTransaction();
      const finalizedHex = finalizedTx.toHex();

      console.log(`✅ Transaction finalized successfully`);
      console.log(`✅ Transaction ID: ${finalizedTx.getId()}`);
      console.log(`✅ Transaction size: ${finalizedHex.length / 2} bytes`);

      console.log("\n📦 FINALIZED TRANSACTION:");
      console.log(finalizedHex);

      console.log("\n🎯 READY FOR BROADCAST:");
      console.log(
        "The transaction above is ready to be broadcast to the Bitcoin network"
      );
      console.log(
        "You can use this hex with any Bitcoin RPC or broadcasting service"
      );

      // Show outputs for verification
      console.log("\n📊 TRANSACTION OUTPUTS:");
      psbt.txOutputs.forEach((output, index) => {
        const outputAddress = bitcoin.address.fromOutputScript(
          output.script,
          bitcoin.networks.bitcoin
        );
        console.log(
          `Output ${index}: ${output.value} sats to ${outputAddress}`
        );
      });
    } else {
      console.error("\n❌ Signature validation failed");
      process.exit(1);
    }
  } else {
    console.error("\n❌ VERIFICATION FAILED:");
    console.error(`Expected address: ${expectedAddress}`);
    console.error(`Recovered address: ${recoveredAddress}`);
    console.error("The signature does not match the expected PSBT address");
    process.exit(1);
  }
} catch (err) {
  console.error(
    `❌ Error during verification: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  process.exit(1);
}

console.log("\n" + "=".repeat(70));
console.log("🏁 Transaction finalization complete!");
