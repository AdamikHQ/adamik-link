import * as dotenv from "dotenv";
import * as path from "path";
import { AdamikSignatureFormat } from "../adamik/types";
import { LocalSigner } from "../signers/LocalSigner";
import { errorTerminal, infoTerminal, italicInfoTerminal } from "../utils";
import { adamikGetChains } from "../adamik/getChains";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testLocalSigner() {
  console.log("\n🔑 Starting Local Signer Test\n");

  // First verify environment
  if (!process.env.UNSECURE_LOCAL_SEED) {
    errorTerminal("UNSECURE_LOCAL_SEED is not set in .env.local");
    return;
  }

  infoTerminal("✓ Environment loaded");
  infoTerminal("Getting chains ...", "Adamik");

  // Get chains and let user select one
  const { chains, chainId, signerSpec } = await adamikGetChains();

  if (!chainId) {
    infoTerminal("Chain selection cancelled.");
    return;
  }

  console.log("\nSelected chain configuration:");
  await italicInfoTerminal(
    JSON.stringify(
      {
        chainId,
        name: chains[chainId].name,
        curve: signerSpec.curve,
        hashFunction: signerSpec.hashFunction,
        signatureFormat: signerSpec.signatureFormat,
        coinType: signerSpec.coinType,
      },
      null,
      2
    )
  );

  const testMessage = "deadbeef";
  console.log("\nTest message:", testMessage);

  try {
    infoTerminal("\nInitializing Local Signer...");
    const signer = new LocalSigner(chainId, signerSpec);

    // Get and display public key
    infoTerminal("\n📤 Getting public key...");
    const pubkey = await signer.getPubkey();
    console.log("Public Key:", pubkey);

    // Sign and display signature
    infoTerminal("\n✍️  Signing test message...");
    const signature = await signer.signTransaction(testMessage);
    console.log("Signature:", signature);

    infoTerminal("\n✅ Test completed successfully");

    // Display full test results
    console.log("\nTest Results:");
    await italicInfoTerminal(
      JSON.stringify(
        {
          chain: chains[chainId].name,
          publicKey: pubkey,
          message: testMessage,
          signature: signature,
          signerSpec,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log("\n❌ Test failed");
    console.error("Error:", error);
  }
}

// Run the test with explicit error handling
infoTerminal("Starting test script...");
testLocalSigner()
  .then(() => {
    infoTerminal("\n✨ All tests completed");
    process.exit(0);
  })
  .catch((error) => {
    errorTerminal("\n💥 Fatal error:" + error);
    process.exit(1);
  });
