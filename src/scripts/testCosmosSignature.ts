import { secp256k1 } from "@noble/curves/secp256k1";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Test signature verification for Cosmos Blockdaemon TSM
async function testCosmosSignature() {
  // Values from the failed Cosmos transaction
  const messageHash = "6569df5090955d4e15f763b41417c62936ea5fcd86c062b2559ad81c138ccf93";
  const blockdaemonSignature = "283e443c8bf1032741f9b857d4261d9dd4580d73fc7629c97fd8465068829dec4d335be43a73a59ad9c02ff1f6d9847a04fe6bdbdf19a01285a0382f111e6aa3";
  const publicKey = "03331352d353ffd00e8f350b645ddc51212d5ee089b9976becc2ac2a383d33ebbb";

  // Values from the working Sodot transaction for comparison
  const sodotMessageHash = "a675005fddaf3bb510dd6031d1ab55b1db2908dddb3319fcc1af9cce6b324eed";
  const sodotSignature = "594fb250e5d2b55d9cfa675da417352f1be5f3a53f9c28546dbb384655822bf936be8e08f33afef4f362f716c2173e2fa9940fec42cf3eaf3fb63c803623a609";
  const sodotPublicKey = "033d628c930f6bb5a049474a5e8b8674325ebf9ce8e1b0680d03804754791593df";

  console.log("🧪 Testing Cosmos Signature Verification...\n");

  // Test Blockdaemon signature
  console.log("🔍 Testing Blockdaemon TSM signature:");
  console.log("Message hash:", messageHash);
  console.log("Signature:", blockdaemonSignature);
  console.log("Public key:", publicKey);

  try {
    // Extract r and s components
    const r = blockdaemonSignature.slice(0, 64);
    const s = blockdaemonSignature.slice(64, 128);
    
    console.log("\nSignature components:");
    console.log("r:", r);
    console.log("s:", s);

    // Create signature object
    const msgHashBytes = Buffer.from(messageHash, "hex");
    const sig = secp256k1.Signature.fromCompact(
      Buffer.concat([
        Buffer.from(r, "hex"),
        Buffer.from(s, "hex"),
      ])
    );

    // Verify signature directly
    const pubKeyBytes = Buffer.from(publicKey, "hex");
    const isValidBlockdaemon = secp256k1.verify(sig, msgHashBytes, pubKeyBytes);
    console.log("\n✅ Blockdaemon signature verification:", isValidBlockdaemon ? "VALID" : "INVALID");

    // Test recovery for both possible recovery IDs
    for (let recoveryId = 0; recoveryId < 2; recoveryId++) {
      try {
        const recoveredPoint = sig.addRecoveryBit(recoveryId).recoverPublicKey(msgHashBytes);
        const recoveredPublicKey = Buffer.from(recoveredPoint.toRawBytes(true)).toString("hex");
        console.log(`Recovery ID ${recoveryId}: ${recoveredPublicKey}`);
        console.log(`Matches: ${recoveredPublicKey === publicKey ? "✅ YES" : "❌ NO"}`);
      } catch (error) {
        console.log(`Recovery ID ${recoveryId}: ❌ Failed to recover`);
      }
    }

  } catch (error) {
    console.error("❌ Error testing Blockdaemon signature:", error);
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Test Sodot signature for comparison
  console.log("🔍 Testing Sodot signature (working reference):");
  console.log("Message hash:", sodotMessageHash);
  console.log("Signature:", sodotSignature);
  console.log("Public key:", sodotPublicKey);

  try {
    // Extract r and s components
    const r = sodotSignature.slice(0, 64);
    const s = sodotSignature.slice(64, 128);
    
    console.log("\nSignature components:");
    console.log("r:", r);
    console.log("s:", s);

    // Create signature object
    const msgHashBytes = Buffer.from(sodotMessageHash, "hex");
    const sig = secp256k1.Signature.fromCompact(
      Buffer.concat([
        Buffer.from(r, "hex"),
        Buffer.from(s, "hex"),
      ])
    );

    // Verify signature directly
    const pubKeyBytes = Buffer.from(sodotPublicKey, "hex");
    const isValidSodot = secp256k1.verify(sig, msgHashBytes, pubKeyBytes);
    console.log("\n✅ Sodot signature verification:", isValidSodot ? "VALID" : "INVALID");

  } catch (error) {
    console.error("❌ Error testing Sodot signature:", error);
  }
}

testCosmosSignature().catch(console.error);
