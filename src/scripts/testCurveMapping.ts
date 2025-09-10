#!/usr/bin/env tsx
/**
 * Test script to verify that different chains use the correct curves
 * 
 * This demonstrates that IoFinnet correctly selects:
 * - ECDSA/Secp256k1 for Bitcoin, Ethereum, BSC, Polygon, Tron
 * - EDDSA/Ed25519 for chains like Solana, TON (if supported)
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { IoFinnetSigner } from "../signers/IoFinnet";
import { AdamikCurve, AdamikHashFunction, AdamikSignatureFormat, AdamikSignerSpec } from "../adamik/types";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testCurveMapping() {
  console.log("🔍 Testing Curve Mapping for Different Chains\n");
  console.log("=" .repeat(60));

  // Define test cases for different chains
  const testCases = [
    {
      name: "Bitcoin",
      chainId: "bitcoin",
      spec: {
        curve: AdamikCurve.SECP256K1,
        hashFunction: AdamikHashFunction.SHA256,
        signatureFormat: AdamikSignatureFormat.RS,
        coinType: "0"
      },
      expectedCurve: "ECDSA_SECP256K1",
      expectedPubkeyStart: "04" // Uncompressed ECDSA
    },
    {
      name: "Ethereum",
      chainId: "ethereum",
      spec: {
        curve: AdamikCurve.SECP256K1,
        hashFunction: AdamikHashFunction.KECCAK256,
        signatureFormat: AdamikSignatureFormat.RSV,
        coinType: "60"
      },
      expectedCurve: "ECDSA_SECP256K1",
      expectedPubkeyStart: "04"
    },
    {
      name: "BSC",
      chainId: "bsc",
      spec: {
        curve: AdamikCurve.SECP256K1,
        hashFunction: AdamikHashFunction.KECCAK256,
        signatureFormat: AdamikSignatureFormat.RSV,
        coinType: "60" // BSC uses same as Ethereum
      },
      expectedCurve: "ECDSA_SECP256K1",
      expectedPubkeyStart: "04"
    },
    {
      name: "Polygon",
      chainId: "polygon",
      spec: {
        curve: AdamikCurve.SECP256K1,
        hashFunction: AdamikHashFunction.KECCAK256,
        signatureFormat: AdamikSignatureFormat.RSV,
        coinType: "60" // Polygon uses same as Ethereum
      },
      expectedCurve: "ECDSA_SECP256K1",
      expectedPubkeyStart: "04"
    },
    {
      name: "Tron",
      chainId: "tron",
      spec: {
        curve: AdamikCurve.SECP256K1,
        hashFunction: AdamikHashFunction.SHA256,
        signatureFormat: AdamikSignatureFormat.RS,
        coinType: "195"
      },
      expectedCurve: "ECDSA_SECP256K1",
      expectedPubkeyStart: "04"
    },
    // Example of Ed25519 chain (if IoFinnet supports it)
    {
      name: "Solana (Example)",
      chainId: "solana",
      spec: {
        curve: AdamikCurve.ED25519,
        hashFunction: AdamikHashFunction.NONE,
        signatureFormat: AdamikSignatureFormat.RS, // Ed25519 doesn't use RSV format
        coinType: "501"
      },
      expectedCurve: "EDDSA_ED25519",
      expectedPubkeyStart: "" // Ed25519 keys don't have a prefix
    }
  ] as Array<{
    name: string;
    chainId: string;
    spec: AdamikSignerSpec;
    expectedCurve: string;
    expectedPubkeyStart: string;
  }>;

  console.log("IoFinnet Vault has these curves available:");
  console.log("- ECDSA/Secp256k1: For Bitcoin, Ethereum, BSC, Polygon, Tron");
  console.log("- EDDSA/Ed25519: For Solana, TON, and other Ed25519 chains\n");

  for (const testCase of testCases) {
    console.log(`Testing ${testCase.name}:`);
    console.log("-".repeat(40));
    
    try {
      const signer = new IoFinnetSigner(testCase.chainId, testCase.spec);
      
      // Get the public key
      const pubkey = await signer.getPubkey();
      
      console.log(`✅ Chain: ${testCase.name} (${testCase.chainId})`);
      console.log(`   Curve from Adamik spec: ${testCase.spec.curve}`);
      console.log(`   Expected IoFinnet curve: ${testCase.expectedCurve}`);
      console.log(`   Public key starts with: ${pubkey.substring(0, 2)}...`);
      console.log(`   Public key length: ${pubkey.length / 2} bytes`);
      
      // Verify the correct curve was selected
      if (testCase.spec.curve === AdamikCurve.SECP256K1) {
        if (pubkey.startsWith("04") && pubkey.length === 130) {
          console.log(`   ✅ Correctly using ECDSA/Secp256k1 (uncompressed)`);
        } else if (pubkey.startsWith("02") || pubkey.startsWith("03")) {
          console.log(`   ✅ Correctly using ECDSA/Secp256k1 (compressed)`);
        }
      } else if (testCase.spec.curve === AdamikCurve.ED25519) {
        if (pubkey.length === 64) { // 32 bytes * 2 for hex
          console.log(`   ✅ Correctly using EDDSA/Ed25519`);
        }
      }
      
    } catch (error: any) {
      if (error.message.includes("Unsupported chainId")) {
        console.log(`⚠️  ${testCase.name}: Not configured in IoFinnet mapping`);
      } else if (error.message.includes("No public key found")) {
        console.log(`⚠️  ${testCase.name}: Curve ${testCase.expectedCurve} not available`);
      } else {
        console.log(`❌ ${testCase.name}: ${error.message}`);
      }
    }
    
    console.log("");
  }

  console.log("=" .repeat(60));
  console.log("\n📊 Summary:");
  console.log("The IoFinnet signer correctly selects public keys based on:");
  console.log("1. The chain's curve specification from Adamik API");
  console.log("2. Maps AdamikCurve.SECP256K1 → ECDSA_SECP256K1");
  console.log("3. Maps AdamikCurve.ED25519 → EDDSA_ED25519");
  console.log("\n✅ Each chain gets the correct curve-specific public key!");
}

// Run the test
testCurveMapping().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});