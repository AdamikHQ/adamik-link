import * as dotenv from "dotenv";
import * as path from "path";
import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignatureFormat,
} from "../adamik/types";
import { BlockdaemonSigner } from "../signers/Blockdaemon";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testBlockdaemonSigner() {
  console.log("🚀 Testing Blockdaemon TSM Signer Implementation");
  console.log("=".repeat(50));

  try {
    // Test configuration validation
    console.log("\n1. Testing configuration validation...");
    const isConfigValid = BlockdaemonSigner.isConfigValid();
    console.log(
      `✅ Configuration validation: ${isConfigValid ? "PASSED" : "FAILED"}`
    );

    // Create a test signer spec (similar to Bitcoin/Ethereum)
    const testSignerSpec = {
      curve: AdamikCurve.SECP256K1,
      hashFunction: AdamikHashFunction.SHA256,
      signatureFormat: AdamikSignatureFormat.RS,
      coinType: "0", // Bitcoin coin type
    };

    console.log("\n2. Creating Blockdaemon signer instance...");
    const signer = new BlockdaemonSigner("bitcoin", testSignerSpec);
    console.log(`✅ Signer created: ${signer.signerName}`);
    console.log(`   Chain ID: ${signer.chainId}`);
    console.log(`   Curve: ${signer.signerSpec.curve}`);

    console.log("\n3. Testing public key generation...");
    console.log("   This will call the Go binary for key generation...");

    try {
      const pubkey = await signer.getPubkey();
      console.log(`✅ Public key generated successfully!`);
      console.log(`   Public key: ${pubkey}`);
    } catch (error) {
      console.log(`❌ Public key generation failed: ${error}`);
      console.log(
        "   This is expected if the Go binary setup is not complete."
      );
    }

    console.log("\n4. Testing signature (with dummy hash)...");
    const dummyHash =
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    try {
      const signature = await signer.signHash(dummyHash);
      console.log(`✅ Signature generated successfully!`);
      console.log(`   Signature: ${signature}`);
    } catch (error) {
      console.log(`❌ Signature generation failed: ${error}`);
      console.log(
        "   This is expected if key generation failed or Go binary setup is incomplete."
      );
    }
  } catch (error) {
    console.log(`❌ Test failed: ${error}`);

    if (error instanceof Error && error.message.includes("not found")) {
      console.log("\n💡 Setup Instructions:");
      console.log("   1. Ensure the blockdaemon_client/ directory exists");
      console.log("   2. Ensure client.crt and client.key files are present");
      console.log("   3. Ensure Go is installed and available in PATH");
      console.log(
        "   4. Run 'go mod tidy' in the blockdaemon_client/ directory"
      );
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🏁 Test completed");
}

if (require.main === module) {
  testBlockdaemonSigner().catch(console.error);
}

export { testBlockdaemonSigner };
