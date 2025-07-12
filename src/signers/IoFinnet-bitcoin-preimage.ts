/**
 * Bitcoin PSBT Signing for IoFinnet using Preimage Approach
 *
 * This module provides specialized Bitcoin signing functionality for IoFinnet's ES256K algorithm.
 * It uses a custom bitcoinjs-lib fork with getPreimageForWitnessV0 method to extract raw preimage
 * data before double-hashing, ensuring proper Bitcoin signature generation.
 *
 * Custom bitcoinjs-lib Fork:
 * - Repository: https://github.com/AdamikHQ/bitcoinjs-lib
 * - Package: @adamik/bitcoinjs-lib
 * - Added getPreimageForWitnessV0() method to Transaction class
 * - Returns raw BIP143 preimage data before any hashing is applied
 *
 * Key Features:
 * - Extracts raw BIP143 preimage data using custom bitcoinjs-lib fork
 * - Sends single SHA256 hash to IoFinnet (avoiding triple-hash problem)
 * - IoFinnet applies SHA256 again to produce proper Bitcoin double-hash
 * - Includes signature verification and PSBT finalization
 *
 * Flow:
 * 1. Extract raw preimage from custom bitcoinjs-lib fork
 * 2. Apply SHA256(preimage) to get Bitcoin signature hash
 * 3. Send this hash to IoFinnet (which applies SHA256 again)
 * 4. Result: SHA256(SHA256(preimage)) = proper Bitcoin double hash
 */

import { Psbt, Transaction } from "bitcoinjs-lib";
import * as crypto from "crypto";
import * as secp256k1 from "secp256k1";

// Hardcoded IoFinnet public key for bc1q87kp4qcr5w5uy4vn7dqa8dcv7r0a6kwpw0r2dv
// TODO: get this from IoFinnet API once they support it
const IOFINNET_PUBLIC_KEY =
  "034c51543db83b2c177be72788f9272f9d8436cd03d0ef09a0f0f9498e4da14c03";

/**
 * Get the Bitcoin signature hash that should be sent to IoFinnet for signing
 *
 * This function uses our custom bitcoinjs-lib fork with getPreimageForWitnessV0 method
 * to extract the raw preimage data before any hashing is applied.
 *
 * @param psbtHex - PSBT hex string
 * @param inputIndex - Index of the input to sign
 * @param publicKey - Public key for the input (unused but kept for compatibility)
 * @returns Object containing raw preimage, Bitcoin hash, and sighash type
 */
function getBitcoinHashForIoFinnet(
  psbtHex: string,
  inputIndex: number,
  publicKey: Buffer
): { rawPreimage: Buffer; bitcoinHash: Buffer; sighashType: number } {
  const psbt = Psbt.fromHex(psbtHex);
  const input = psbt.data.inputs[inputIndex];

  if (!input.witnessUtxo) {
    throw new Error(`Input ${inputIndex} missing witnessUtxo`);
  }

  const sighashType = input.sighashType || Transaction.SIGHASH_ALL;

  // Extract the unsigned transaction from PSBT internal cache
  const unsignedTx = (psbt as any).__CACHE.__TX;

  // For P2WPKH, we need to create the P2PKH script from the witness script
  let scriptCode: Buffer;
  const witnessScript = input.witnessUtxo.script;

  if (
    witnessScript.length === 22 &&
    witnessScript[0] === 0x00 &&
    witnessScript[1] === 0x14
  ) {
    // P2WPKH: Extract pubkey hash and create P2PKH script
    const pubkeyHash = witnessScript.slice(2);
    scriptCode = Buffer.concat([
      Buffer.from([0x76, 0xa9, 0x14]), // OP_DUP OP_HASH160 OP_PUSHDATA(20)
      pubkeyHash, // 20-byte pubkey hash
      Buffer.from([0x88, 0xac]), // OP_EQUALVERIFY OP_CHECKSIG
    ]);
  } else {
    // For other script types, use the script as-is
    scriptCode = Buffer.from(witnessScript);
  }

  // Get the raw preimage data using our custom method from @adamik/bitcoinjs-lib fork
  // This method is not available in the standard bitcoinjs-lib package
  // Repository: https://github.com/AdamikHQ/bitcoinjs-lib
  const rawPreimage = unsignedTx.getPreimageForWitnessV0(
    inputIndex,
    scriptCode,
    BigInt(input.witnessUtxo.value),
    sighashType
  );

  // Apply SHA256 to get the Bitcoin signature hash
  // This is what we send to IoFinnet (which will apply SHA256 again for double hash)
  const bitcoinHash = crypto
    .createHash("sha256")
    .update(Buffer.from(rawPreimage))
    .digest();

  return {
    rawPreimage: Buffer.from(rawPreimage),
    bitcoinHash,
    sighashType,
  };
}

/**
 * Verify an IoFinnet signature against the Bitcoin signature hash
 *
 * This function verifies that IoFinnet's signature is valid for the given Bitcoin hash.
 * It accounts for IoFinnet's ES256K behavior of applying SHA256 to the input data.
 *
 * @param bitcoinHash - The single SHA256 hash we sent to IoFinnet
 * @param iofinnetSignature - The signature returned by IoFinnet
 * @param publicKey - The public key to verify against
 * @returns True if signature is valid, false otherwise
 */
function verifyIoFinnetSignature(
  bitcoinHash: Buffer,
  iofinnetSignature: string,
  publicKey: Buffer
): boolean {
  try {
    // Parse IoFinnet signature - remove "0x" prefix if present
    const rawSignature = Buffer.from(
      iofinnetSignature.replace("0x", ""),
      "hex"
    );

    if (rawSignature.length !== 65) {
      console.log(
        `❌ Invalid signature length: ${rawSignature.length} bytes (expected 65)`
      );
      return false;
    }

    // Extract r, s components
    const r = rawSignature.slice(0, 32);
    const s = rawSignature.slice(32, 64);

    // IoFinnet applies SHA256 to the hash we sent them (ES256K behavior)
    // We sent SHA256(preimage), so IoFinnet computes SHA256(SHA256(preimage))
    // This equals the proper Bitcoin double hash
    const properBitcoinDoubleHash = crypto
      .createHash("sha256")
      .update(bitcoinHash)
      .digest();

    // Verify using secp256k1.ecdsaVerify with the double-hashed value
    const signature = Buffer.concat([r, s]);
    const isValid = secp256k1.ecdsaVerify(
      signature,
      properBitcoinDoubleHash,
      publicKey
    );

    console.log(`✅ Signature verification: ${isValid ? "VALID" : "INVALID"}`);
    console.log(`📊 Bitcoin hash (SHA256): ${bitcoinHash.toString("hex")}`);
    console.log(
      `📊 Double hash (SHA256²): ${properBitcoinDoubleHash.toString("hex")}`
    );

    return isValid;
  } catch (error) {
    console.log(`❌ Signature verification error: ${error}`);
    return false;
  }
}

/**
 * Add an IoFinnet signature to a PSBT input
 *
 * This function converts the IoFinnet signature to DER format and adds it to the PSBT.
 *
 * @param psbt - The PSBT to add the signature to
 * @param inputIndex - Index of the input to sign
 * @param iofinnetSignature - The signature from IoFinnet
 * @param publicKey - The public key for the signature
 */
function addIoFinnetSignatureToPsbt(
  psbt: Psbt,
  inputIndex: number,
  iofinnetSignature: string,
  publicKey: Buffer
): void {
  const input = psbt.data.inputs[inputIndex];

  // Parse IoFinnet signature - remove "0x" prefix if present
  const rawSignature = Buffer.from(iofinnetSignature.replace("0x", ""), "hex");

  let derSignature: Buffer;

  if (rawSignature.length === 65) {
    // Standard format: r + s + recovery (65 bytes)
    const r = rawSignature.slice(0, 32);
    const s = rawSignature.slice(32, 64);
    derSignature = encodeDERSignature(r, s);
  } else if (rawSignature.length === 64) {
    // Just r + s without recovery (64 bytes)
    const r = rawSignature.slice(0, 32);
    const s = rawSignature.slice(32, 64);
    derSignature = encodeDERSignature(r, s);
  } else {
    throw new Error(
      `Unexpected IoFinnet signature format: ${rawSignature.length} bytes`
    );
  }

  // Add SIGHASH flag
  const sighashFlag = input.sighashType || Transaction.SIGHASH_ALL;
  const signatureBuffer = Buffer.concat([
    derSignature,
    Buffer.from([sighashFlag]),
  ]);

  // Add signature to PSBT
  if (!input.partialSig) {
    input.partialSig = [];
  }

  input.partialSig.push({
    pubkey: publicKey,
    signature: signatureBuffer,
  });
}

/**
 * Encode signature in DER format (Bitcoin standard)
 *
 * @param r - R component of the signature
 * @param s - S component of the signature
 * @returns DER encoded signature
 */
function encodeDERSignature(r: Buffer, s: Buffer): Buffer {
  const encodeInteger = (value: Buffer): Buffer => {
    // Remove leading zeros
    let start = 0;
    while (start < value.length && value[start] === 0) {
      start++;
    }

    if (start === value.length) {
      return Buffer.from([0x02, 0x01, 0x00]);
    }

    let trimmed = value.slice(start);
    if (trimmed[0] >= 0x80) {
      trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
    }

    return Buffer.concat([
      Buffer.from([0x02]),
      Buffer.from([trimmed.length]),
      trimmed,
    ]);
  };

  const rEncoded = encodeInteger(r);
  const sEncoded = encodeInteger(s);
  const payload = Buffer.concat([rEncoded, sEncoded]);

  return Buffer.concat([
    Buffer.from([0x30]),
    Buffer.from([payload.length]),
    payload,
  ]);
}

/**
 * Finalize a Bitcoin PSBT and return the raw transaction hex
 *
 * @param psbt - The PSBT to finalize
 * @returns Raw transaction hex string
 */
function finalizeBitcoinPsbt(psbt: Psbt): string {
  psbt.finalizeAllInputs();
  const rawTransaction = psbt.extractTransaction();
  return rawTransaction.toHex();
}

/**
 * Get the hardcoded IoFinnet public key
 *
 * @returns IoFinnet public key as Buffer
 */
function getIoFinnetPublicKey(): Buffer {
  return Buffer.from(IOFINNET_PUBLIC_KEY, "hex");
}

/**
 * Complete Bitcoin PSBT signing workflow for IoFinnet using correct hash approach
 *
 * This is the main function that orchestrates the entire signing process:
 * 1. Extract raw preimage from bitcoinjs-lib fork
 * 2. Apply SHA256(preimage) to get Bitcoin signature hash
 * 3. Send this hash to IoFinnet (which applies SHA256 again)
 * 4. Result: SHA256(SHA256(preimage)) = proper Bitcoin double hash
 *
 * @param psbtHex - The PSBT to sign (hex string)
 * @param signDataCallback - Function to call IoFinnet with the Bitcoin signature hash
 * @param publicKey - The public key for signature verification (optional, uses hardcoded if not provided)
 * @returns Finalized transaction hex string
 */
async function signBitcoinPsbtWithIoFinnetPreimage(
  psbtHex: string,
  signDataCallback: (bitcoinHash: string) => Promise<string>,
  publicKey?: Buffer
): Promise<string> {
  const psbt = Psbt.fromHex(psbtHex);

  // Use hardcoded public key if not provided
  const pubKey = publicKey || getIoFinnetPublicKey();

  console.log("🔧 Using CORRECT HASH approach for IoFinnet signing");
  console.log("✅ This produces proper Bitcoin double hash signatures!");
  console.log(
    "📦 Using custom bitcoinjs-lib fork: https://github.com/AdamikHQ/bitcoinjs-lib"
  );

  // Sign each input
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    console.log(`\n📝 Processing input ${i}:`);

    // Get the Bitcoin signature hash using our custom bitcoinjs-lib fork
    const { rawPreimage, bitcoinHash } = getBitcoinHashForIoFinnet(
      psbtHex,
      i,
      pubKey
    );

    console.log(`📊 Raw preimage length: ${rawPreimage.length} bytes`);
    console.log(`📊 Bitcoin hash (SHA256): ${bitcoinHash.toString("hex")}`);
    console.log(
      `📤 Sending Bitcoin hash to IoFinnet: ${bitcoinHash
        .toString("hex")
        .substring(0, 32)}...`
    );

    // Send Bitcoin signature hash to IoFinnet for signing
    // IoFinnet will apply SHA256 again to produce SHA256(SHA256(preimage))
    const iofinnetSignature = await signDataCallback(
      bitcoinHash.toString("hex")
    );

    console.log(
      `📥 Received signature: ${iofinnetSignature.substring(0, 32)}...`
    );

    // Verify the signature before adding it to the PSBT
    const isValidSignature = verifyIoFinnetSignature(
      bitcoinHash,
      iofinnetSignature,
      pubKey
    );

    if (!isValidSignature) {
      throw new Error(`Invalid signature from IoFinnet for input ${i}`);
    }

    console.log(`✅ Signature verification passed for input ${i}`);

    // Add the signature to the PSBT
    addIoFinnetSignatureToPsbt(psbt, i, iofinnetSignature, pubKey);
  }

  console.log("\n🎉 All signatures verified and added to PSBT");
  console.log("🏁 Finalizing transaction...");

  // Finalize and return transaction
  const finalizedTx = finalizeBitcoinPsbt(psbt);

  console.log("✅ Transaction finalized successfully!");
  console.log(
    "🔗 This transaction uses PROPER Bitcoin double hash signatures!"
  );

  return finalizedTx;
}

// Export only the functions that are actually used externally
export {
  signBitcoinPsbtWithIoFinnetPreimage,
  getIoFinnetPublicKey,
  getBitcoinHashForIoFinnet, // Used by test scripts
};
