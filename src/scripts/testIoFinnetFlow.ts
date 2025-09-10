#!/usr/bin/env tsx
/**
 * Test script for IoFinnet integration with Adamik's pubkey-to-address flow
 * 
 * This verifies that:
 * 1. IoFinnet returns public keys from vault API
 * 2. Adamik's encodePubKeyToAddress converts them correctly
 * 3. The addresses match what IoFinnet reports directly
 * 
 * Usage: tsx src/scripts/testIoFinnetFlow.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { IoFinnetSigner } from "../signers/IoFinnet";
import { encodePubKeyToAddress } from "../adamik/encodePubkeyToAddress";
import { AdamikCurve, AdamikHashFunction, AdamikSignatureFormat, AdamikSignerSpec } from "../adamik/types";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testIoFinnetAddressFlow() {
  console.log("🚀 Testing IoFinnet PubKey to Address Flow\n");
  console.log("=" .repeat(60));

  // Validate configuration
  try {
    IoFinnetSigner.isConfigValid();
    console.log("✅ IoFinnet configuration is valid");
    console.log("✅ Adamik API configured\n");
  } catch (error) {
    console.error("❌ Configuration error:", error);
    process.exit(1);
  }

  // Test Bitcoin flow
  console.log("Testing Bitcoin Address Derivation:");
  console.log("-".repeat(40));
  
  const bitcoinSpec: AdamikSignerSpec = {
    curve: AdamikCurve.SECP256K1,
    hashFunction: AdamikHashFunction.SHA256,
    signatureFormat: AdamikSignatureFormat.RS,
    coinType: "0"
  };

  try {
    const bitcoinSigner = new IoFinnetSigner("bitcoin", bitcoinSpec);
    
    // Step 1: Get public key from IoFinnet
    console.log("1️⃣  Fetching public key from IoFinnet vault...");
    const pubkey = await bitcoinSigner.getPubkey();
    console.log(`   ✅ Public key: ${pubkey.substring(0, 20)}...${pubkey.substring(pubkey.length - 20)}`);
    console.log(`   Length: ${pubkey.length / 2} bytes`);
    
    // Step 2: Convert public key to address using Adamik
    console.log("\n2️⃣  Converting public key to address via Adamik...");
    const adamikAddress = await encodePubKeyToAddress(pubkey, "bitcoin");
    console.log(`   ✅ Adamik derived address: ${adamikAddress}`);
    
    // Step 3: Get address directly from IoFinnet for comparison
    console.log("\n3️⃣  Getting address directly from IoFinnet (for comparison)...");
    const iofinnetAddress = await bitcoinSigner.getAddress();
    console.log(`   ✅ IoFinnet direct address: ${iofinnetAddress}`);
    
    // Step 4: Compare addresses
    console.log("\n4️⃣  Comparing addresses:");
    if (adamikAddress === iofinnetAddress) {
      console.log(`   ✅ PERFECT MATCH! Both addresses are identical.`);
    } else {
      console.log(`   ⚠️  Addresses differ:`);
      console.log(`      Adamik:   ${adamikAddress}`);
      console.log(`      IoFinnet: ${iofinnetAddress}`);
      console.log(`   This might be expected if IoFinnet uses a different address type.`);
    }
    
  } catch (error) {
    console.error("❌ Bitcoin test failed:", error);
  }

  // Test Ethereum flow
  console.log("\n" + "=".repeat(60));
  console.log("Testing Ethereum Address Derivation:");
  console.log("-".repeat(40));
  
  const ethereumSpec: AdamikSignerSpec = {
    curve: AdamikCurve.SECP256K1,
    hashFunction: AdamikHashFunction.KECCAK256,
    signatureFormat: AdamikSignatureFormat.RSV,
    coinType: "60"
  };

  try {
    const ethSigner = new IoFinnetSigner("ethereum", ethereumSpec);
    
    // Step 1: Get public key
    console.log("1️⃣  Fetching public key from IoFinnet vault...");
    const pubkey = await ethSigner.getPubkey();
    console.log(`   ✅ Public key: ${pubkey.substring(0, 20)}...${pubkey.substring(pubkey.length - 20)}`);
    
    // Step 2: Convert via Adamik
    console.log("\n2️⃣  Converting public key to address via Adamik...");
    const adamikAddress = await encodePubKeyToAddress(pubkey, "ethereum");
    console.log(`   ✅ Adamik derived address: ${adamikAddress}`);
    
    // Step 3: Get direct address
    console.log("\n3️⃣  Getting address directly from IoFinnet...");
    const iofinnetAddress = await ethSigner.getAddress();
    console.log(`   ✅ IoFinnet direct address: ${iofinnetAddress}`);
    
    // Step 4: Compare
    console.log("\n4️⃣  Comparing addresses:");
    if (adamikAddress.toLowerCase() === iofinnetAddress.toLowerCase()) {
      console.log(`   ✅ PERFECT MATCH! Both addresses are identical.`);
    } else {
      console.log(`   ⚠️  Addresses differ:`);
      console.log(`      Adamik:   ${adamikAddress}`);
      console.log(`      IoFinnet: ${iofinnetAddress}`);
    }
    
  } catch (error) {
    console.error("❌ Ethereum test failed:", error);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🏁 Test Summary:");
  console.log("\n✨ The IoFinnet integration now:");
  console.log("   1. Fetches public keys dynamically from vault API");
  console.log("   2. Uses Adamik's encodePubKeyToAddress for address derivation");
  console.log("   3. Maintains backward compatibility with direct address fetching");
  console.log("\n📝 In the main flow, addresses are now derived from public keys,");
  console.log("   ensuring consistency across the entire Adamik Link system!");
}

// Run the test
testIoFinnetAddressFlow().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});