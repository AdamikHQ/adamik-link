import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignatureFormat,
} from "../adamik/types";
import { BlockdaemonSigner } from "../signers/Blockdaemon";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testBlockdaemonSignerBasic() {
  console.log("🚀 Testing Blockdaemon TSM Signer Implementation (Basic)");
  console.log("=".repeat(60));

  try {
    // Test 1: Certificate file validation
    console.log("\n1. Testing certificate file validation...");

    const certPath =
      process.env.BLOCKDAEMON_CLIENT_CERT_PATH ||
      "./blockdaemon_client/client.crt";
    const keyPath =
      process.env.BLOCKDAEMON_CLIENT_KEY_PATH ||
      "./blockdaemon_client/client.key";

    const certExists = fs.existsSync(certPath);
    const keyExists = fs.existsSync(keyPath);

    console.log(
      `   📄 Certificate file (${certPath}): ${
        certExists ? "✅ EXISTS" : "❌ NOT FOUND"
      }`
    );
    console.log(
      `   🔑 Private key file (${keyPath}): ${
        keyExists ? "✅ EXISTS" : "❌ NOT FOUND"
      }`
    );

    // Test 2: Blockdaemon directory structure
    console.log("\n2. Testing Blockdaemon directory structure...");
    const blockdaemonDir = "./blockdaemon_client";
    const mainGoPath = `${blockdaemonDir}/main.go`;
    const goModPath = `${blockdaemonDir}/go.mod`;

    console.log(
      `   📁 Directory (${blockdaemonDir}): ${
        fs.existsSync(blockdaemonDir) ? "✅ EXISTS" : "❌ NOT FOUND"
      }`
    );
    console.log(
      `   📄 main.go: ${
        fs.existsSync(mainGoPath) ? "✅ EXISTS" : "❌ NOT FOUND"
      }`
    );
    console.log(
      `   📄 go.mod: ${fs.existsSync(goModPath) ? "✅ EXISTS" : "❌ NOT FOUND"}`
    );

    // Test 3: Environment variables
    console.log("\n3. Testing environment variables...");
    console.log(
      `   BLOCKDAEMON_CLIENT_CERT_PATH: ${
        process.env.BLOCKDAEMON_CLIENT_CERT_PATH || "❌ NOT SET"
      }`
    );
    console.log(
      `   BLOCKDAEMON_CLIENT_KEY_PATH: ${
        process.env.BLOCKDAEMON_CLIENT_KEY_PATH || "❌ NOT SET"
      }`
    );
    console.log(
      `   BLOCKDAEMON_EXISTING_KEY_IDS: ${
        process.env.BLOCKDAEMON_EXISTING_KEY_IDS || "❌ NOT SET (Optional)"
      }`
    );

    // Test 4: Signer instantiation (without Go validation)
    console.log("\n4. Testing signer instantiation...");

    // Create a test signer spec
    const testSignerSpec = {
      curve: AdamikCurve.SECP256K1,
      hashFunction: AdamikHashFunction.SHA256,
      signatureFormat: AdamikSignatureFormat.RS,
      coinType: "0", // Bitcoin coin type
    };

    console.log("   Creating signer instance...");
    const signer = new BlockdaemonSigner("bitcoin", testSignerSpec);

    console.log(`   ✅ Signer created successfully!`);
    console.log(`      Signer name: ${signer.signerName}`);
    console.log(`      Chain ID: ${signer.chainId}`);
    console.log(`      Curve: ${signer.signerSpec.curve}`);
    console.log(`      Hash function: ${signer.signerSpec.hashFunction}`);
    console.log(`      Signature format: ${signer.signerSpec.signatureFormat}`);

    // Test 5: Configuration validation (without Go check)
    console.log("\n5. Testing configuration validation (files only)...");
    if (
      certExists &&
      keyExists &&
      fs.existsSync(blockdaemonDir) &&
      fs.existsSync(mainGoPath)
    ) {
      console.log("   ✅ All required files are present");
      console.log("   ⚠️  Go installation check skipped for this test");
    } else {
      console.log("   ❌ Some required files are missing");
    }

    // Test 6: Curve support validation
    console.log("\n6. Testing curve support...");

    const supportedCurves = [AdamikCurve.SECP256K1];
    const unsupportedCurves = [AdamikCurve.ED25519, AdamikCurve.STARK];

    console.log("   Supported curves:");
    supportedCurves.forEach((curve) => {
      try {
        new BlockdaemonSigner("test", { ...testSignerSpec, curve });
        console.log(`      ✅ ${curve}`);
      } catch (error) {
        console.log(`      ❌ ${curve}: ${error}`);
      }
    });

    console.log("   Unsupported curves (should fail):");
    unsupportedCurves.forEach((curve) => {
      try {
        new BlockdaemonSigner("test", { ...testSignerSpec, curve });
        console.log(`      ❌ ${curve}: Should have failed but didn't`);
      } catch (error) {
        console.log(`      ✅ ${curve}: Correctly rejected`);
      }
    });

    console.log("\n🎉 Basic validation completed successfully!");

    if (!certExists || !keyExists) {
      console.log("\n💡 Missing files detected. Setup instructions:");
      console.log(
        "   1. Ensure client.crt and client.key are in blockdaemon_client/"
      );
      console.log(
        "   2. These files should be provided by Blockdaemon TSM sandbox"
      );
    }

    console.log("\n📋 Next steps to fully test:");
    console.log("   1. Install Go (https://golang.org/dl/)");
    console.log("   2. Run 'go mod tidy' in blockdaemon_client/");
    console.log("   3. Test with: pnpm run test:blockdaemon");
  } catch (error) {
    console.log(`❌ Test failed: ${error}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🏁 Basic test completed");
}

if (require.main === module) {
  testBlockdaemonSignerBasic().catch(console.error);
}

export { testBlockdaemonSignerBasic };
