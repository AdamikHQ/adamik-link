import { secp256k1 } from "@noble/curves/secp256k1";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Test signature verification for Blockdaemon TSM
async function testSignatureVerification() {
  // Example values from the failed transaction
  const messageHash = "a978c4d8c64255684d1d0c9fb04b57696d960fc85fc1ce7298c4b474ec6631df";
  const signature = "84725c7c593d5fb23a580bee00d3773266d2ee6128b08215d3648a0f9cae7b342d98395b2530c88a8eefa59367470e503a74e3134ccb0341fc04a4321fa0eb9d1b";
  const publicKey = "03331352d353ffd00e8f350b645ddc51212d5ee089b9976becc2ac2a383d33ebbb";

  console.log("Testing signature verification...");
  console.log("Message hash:", messageHash);
  console.log("Signature:", signature);
  console.log("Public key:", publicKey);

  try {
    // Extract components
    const r = signature.slice(0, 64);
    const s = signature.slice(64, 128);
    const v = signature.slice(128, 130);
    
    console.log("\nSignature components:");
    console.log("r:", r);
    console.log("s:", s);
    console.log("v:", v, `(${parseInt(v, 16)})`);

    // Convert to recovery ID
    const vValue = parseInt(v, 16);
    const recoveryId = vValue - 27;
    console.log("Recovery ID:", recoveryId);

    // Create signature object
    const msgHashBytes = Buffer.from(messageHash, "hex");
    const sig = secp256k1.Signature.fromCompact(
      Buffer.concat([
        Buffer.from(r, "hex"),
        Buffer.from(s, "hex"),
      ])
    );

    // Try to recover public key
    const recoveredPoint = sig.addRecoveryBit(recoveryId).recoverPublicKey(msgHashBytes);
    const recoveredPublicKey = Buffer.from(recoveredPoint.toRawBytes(true)).toString("hex");
    
    console.log("\nRecovered public key:", recoveredPublicKey);
    console.log("Expected public key: ", publicKey);
    console.log("Match:", recoveredPublicKey === publicKey ? "✅ YES" : "❌ NO");

    // Also test with the other recovery ID
    const otherRecoveryId = recoveryId === 0 ? 1 : 0;
    const otherRecoveredPoint = sig.addRecoveryBit(otherRecoveryId).recoverPublicKey(msgHashBytes);
    const otherRecoveredPublicKey = Buffer.from(otherRecoveredPoint.toRawBytes(true)).toString("hex");
    
    console.log("\nTesting other recovery ID:", otherRecoveryId);
    console.log("Other recovered public key:", otherRecoveredPublicKey);
    console.log("Other match:", otherRecoveredPublicKey === publicKey ? "✅ YES" : "❌ NO");

    // Verify signature directly
    const pubKeyPoint = secp256k1.ProjectivePoint.fromHex(Buffer.from(publicKey, "hex"));
    const isValid = sig.verify(msgHashBytes, pubKeyPoint);
    console.log("\nDirect signature verification:", isValid ? "✅ VALID" : "❌ INVALID");

  } catch (error) {
    console.error("Error during verification:", error);
  }
}

testSignatureVerification().catch(console.error);
