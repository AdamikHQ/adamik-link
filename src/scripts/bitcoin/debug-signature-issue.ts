#!/usr/bin/env tsx

/**
 * Debug Signature Issues
 *
 * This script provides comprehensive debugging for Bitcoin signature verification issues,
 * specifically for IoFinnet signatures that may fail during transaction broadcast.
 */

import * as bitcoin from "bitcoinjs-lib";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

// Helper functions
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

// Main debugging function
function debugSignature(psbtHex: string, signatureHex: string) {
  console.log("🐛 SIGNATURE DEBUG MODE");
  console.log("=".repeat(80));

  // Remove 0x prefix
  if (signatureHex.startsWith("0x")) {
    signatureHex = signatureHex.slice(2);
  }

  console.log(`PSBT: ${psbtHex.slice(0, 60)}...`);
  console.log(`Signature: ${signatureHex.slice(0, 60)}...`);

  // Parse PSBT
  let psbt: bitcoin.Psbt;
  try {
    const psbtBuffer = Buffer.from(psbtHex, "hex");
    psbt = bitcoin.Psbt.fromBuffer(psbtBuffer);
    console.log("✅ PSBT parsed successfully");
  } catch (err) {
    console.error("❌ Failed to parse PSBT:", err);
    return;
  }

  // Parse signature
  let sigBuffer: Buffer;
  try {
    sigBuffer = Buffer.from(signatureHex, "hex");
    console.log(`✅ Signature parsed successfully (${sigBuffer.length} bytes)`);
  } catch (err) {
    console.error("❌ Failed to parse signature:", err);
    return;
  }

  // Validate signature format
  if (sigBuffer.length !== 65) {
    console.error(
      `❌ Invalid signature length: ${sigBuffer.length} bytes (expected 65)`
    );
    return;
  }

  const input = psbt.data.inputs[0];
  if (!input.witnessUtxo) {
    console.error("❌ No witnessUtxo found");
    return;
  }

  // Display transaction details
  console.log("\n📋 TRANSACTION DETAILS:");
  console.log(`Transaction version: ${psbt.version}`);
  console.log(`Locktime: ${psbt.locktime}`);
  console.log(`Number of inputs: ${psbt.txInputs.length}`);
  console.log(`Number of outputs: ${psbt.txOutputs.length}`);

  const scriptHex = input.witnessUtxo.script.toString("hex");
  console.log(`Input script: ${scriptHex}`);
  console.log(`Input value: ${input.witnessUtxo.value} satoshis`);

  if (!scriptHex.startsWith("0014")) {
    console.error("❌ Not a P2WPKH input - only P2WPKH is supported");
    return;
  }

  const expectedPubkeyHash = scriptHex.slice(4);
  const expectedAddress = bitcoin.address.toBech32(
    Buffer.from(expectedPubkeyHash, "hex"),
    0,
    "bc"
  );

  console.log(`Expected pubkey hash: ${expectedPubkeyHash}`);
  console.log(`Expected address: ${expectedAddress}`);

  // Compute BIP143 preimage and hashes
  console.log("\n🔍 HASH COMPUTATION:");

  try {
    const bip143Preimage = computeBIP143SigningHash(psbt, 0);
    console.log(
      `BIP143 preimage: ${bip143Preimage.toString("hex")} (${
        bip143Preimage.length
      } bytes)`
    );

    const singleSHA256 = crypto
      .createHash("sha256")
      .update(bip143Preimage)
      .digest();
    console.log(`Single SHA256: ${singleSHA256.toString("hex")}`);

    const doubleSHA256 = crypto
      .createHash("sha256")
      .update(singleSHA256)
      .digest();
    console.log(`Double SHA256: ${doubleSHA256.toString("hex")}`);

    // Test multiple signature interpretations
    console.log("\n🔬 SIGNATURE RECOVERY TESTS:");

    const r = sigBuffer.slice(0, 32);
    const s = sigBuffer.slice(32, 64);
    const recoveryId = sigBuffer[64];

    console.log(`r: ${r.toString("hex")}`);
    console.log(`s: ${s.toString("hex")}`);
    console.log(`recovery_id: ${recoveryId}`);

    // Test 1: Standard double SHA256 (IoFinnet expected workflow)
    console.log("\n📝 TEST 1: Double SHA256 (Standard IoFinnet workflow)");
    try {
      const recoveredPubkey1 = secp256k1.ecdsaRecover(
        sigBuffer.slice(0, 64),
        recoveryId,
        doubleSHA256
      );
      const compressedPubkey1 = secp256k1.publicKeyConvert(
        recoveredPubkey1,
        true
      );
      const sha256Hash1 = crypto
        .createHash("sha256")
        .update(compressedPubkey1)
        .digest();
      const ripemd160Hash1 = crypto
        .createHash("ripemd160")
        .update(sha256Hash1)
        .digest();
      const recoveredAddress1 = bitcoin.address.toBech32(
        ripemd160Hash1,
        0,
        "bc"
      );

      console.log(
        `✅ Recovered pubkey: ${Buffer.from(compressedPubkey1).toString("hex")}`
      );
      console.log(`✅ Recovered address: ${recoveredAddress1}`);
      console.log(`✅ Address match: ${recoveredAddress1 === expectedAddress}`);

      const isValid1 = secp256k1.ecdsaVerify(
        sigBuffer.slice(0, 64),
        doubleSHA256,
        compressedPubkey1
      );
      console.log(`✅ Signature valid: ${isValid1}`);

      if (recoveredAddress1 === expectedAddress && isValid1) {
        console.log(
          "🎯 SUCCESS: This appears to be the correct interpretation!"
        );

        // Try to create a finalized transaction
        console.log("\n🚀 ATTEMPTING TRANSACTION FINALIZATION:");

        try {
          const derSignature = bitcoin.script.signature.encode(
            Buffer.concat([r, s]),
            bitcoin.Transaction.SIGHASH_ALL
          );

          // Clone PSBT for finalization attempt
          const testPsbt = bitcoin.Psbt.fromBuffer(psbt.toBuffer());

          testPsbt.updateInput(0, {
            partialSig: [
              {
                pubkey: Buffer.from(compressedPubkey1),
                signature: derSignature,
              },
            ],
          });

          testPsbt.finalizeAllInputs();
          const finalizedTx = testPsbt.extractTransaction();
          const finalizedHex = finalizedTx.toHex();

          console.log(`✅ Transaction finalized successfully`);
          console.log(`✅ Transaction ID: ${finalizedTx.getId()}`);
          console.log(`✅ Transaction hex: ${finalizedHex}`);

          // Validate the transaction format
          try {
            const validatedTx = bitcoin.Transaction.fromHex(finalizedHex);
            console.log(`✅ Transaction format validation: PASSED`);
            console.log(
              `✅ Transaction size: ${finalizedHex.length / 2} bytes`
            );

            // Check if the witness data looks correct
            const witness = validatedTx.ins[0].witness;
            console.log(`✅ Witness stack length: ${witness.length}`);
            if (witness.length === 2) {
              console.log(`✅ Signature length: ${witness[0].length} bytes`);
              console.log(`✅ Public key length: ${witness[1].length} bytes`);
              console.log(`✅ Witness structure: CORRECT for P2WPKH`);
            }
          } catch (validateErr) {
            console.error(`❌ Transaction validation failed: ${validateErr}`);
          }
        } catch (finalizeErr) {
          console.error(`❌ Transaction finalization failed: ${finalizeErr}`);
        }
      }
    } catch (err) {
      console.error(`❌ Test 1 failed: ${err}`);
    }

    // Test 2: Single SHA256 (in case IoFinnet doesn't double hash)
    console.log("\n📝 TEST 2: Single SHA256 (Alternative interpretation)");
    try {
      const recoveredPubkey2 = secp256k1.ecdsaRecover(
        sigBuffer.slice(0, 64),
        recoveryId,
        singleSHA256
      );
      const compressedPubkey2 = secp256k1.publicKeyConvert(
        recoveredPubkey2,
        true
      );
      const sha256Hash2 = crypto
        .createHash("sha256")
        .update(compressedPubkey2)
        .digest();
      const ripemd160Hash2 = crypto
        .createHash("ripemd160")
        .update(sha256Hash2)
        .digest();
      const recoveredAddress2 = bitcoin.address.toBech32(
        ripemd160Hash2,
        0,
        "bc"
      );

      console.log(
        `✅ Recovered pubkey: ${Buffer.from(compressedPubkey2).toString("hex")}`
      );
      console.log(`✅ Recovered address: ${recoveredAddress2}`);
      console.log(`✅ Address match: ${recoveredAddress2 === expectedAddress}`);

      const isValid2 = secp256k1.ecdsaVerify(
        sigBuffer.slice(0, 64),
        singleSHA256,
        compressedPubkey2
      );
      console.log(`✅ Signature valid: ${isValid2}`);

      if (recoveredAddress2 === expectedAddress && isValid2) {
        console.log("🎯 ALTERNATIVE SUCCESS: Single SHA256 might be correct!");
      }
    } catch (err) {
      console.error(`❌ Test 2 failed: ${err}`);
    }

    // Test 3: Raw BIP143 preimage (in case no hashing applied)
    console.log("\n📝 TEST 3: Raw BIP143 preimage (No additional hashing)");
    try {
      const recoveredPubkey3 = secp256k1.ecdsaRecover(
        sigBuffer.slice(0, 64),
        recoveryId,
        bip143Preimage.slice(0, 32) // Only first 32 bytes if used as hash
      );
      console.log(
        "❌ Test 3: Not applicable - preimage too long for direct signing"
      );
    } catch (err) {
      console.log(
        "❌ Test 3: Expected failure - preimage not suitable as hash"
      );
    }
  } catch (err) {
    console.error(`❌ Hash computation failed: ${err}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("🏁 Debug analysis complete!");
  console.log(
    "\nIf TEST 1 shows a successful match but you're still getting broadcast errors,"
  );
  console.log(
    "the issue might be with the transaction format or network-specific requirements."
  );
}

// CLI usage
if (process.argv.length < 4) {
  console.error("❌ ERROR: Missing arguments.");
  console.error(
    "Usage: npx tsx src/scripts/bitcoin/debug-signature-issue.ts <psbt_hex> <signature_hex>"
  );
  console.error("");
  console.error("Example:");
  console.error("  npx tsx src/scripts/bitcoin/debug-signature-issue.ts \\");
  console.error("    70736274ff0100710200000001b8a55e998... \\");
  console.error("    0xc0357ad12a39e8eb83c29f6f562f07c0...");
  process.exit(1);
}

const psbtHex = process.argv[2];
const signatureHex = process.argv[3];

debugSignature(psbtHex, signatureHex);
