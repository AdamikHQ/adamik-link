import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { secp256k1 } from "@noble/curves/secp256k1";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Debug TSM signing process
async function debugTSMSigning() {
  const messageHash = "6569df5090955d4e15f763b41417c62936ea5fcd86c062b2559ad81c138ccf93";
  const keyId = "cXRuAcUZLMwmHnY6zv9geIabb67j";
  
  console.log("🔍 Debugging TSM signing process...\n");
  console.log("Message hash to sign:", messageHash);
  console.log("Key ID:", keyId);
  
  // First, let's get the public key
  console.log("\n1️⃣ Getting public key from TSM...");
  
  const pubkeyOutput = await callGoBinary("get-pubkey", [keyId]);
  console.log("Public key output:", pubkeyOutput);
  
  // Parse the public key
  const pubkeyLines = pubkeyOutput.split("\n");
  let publicKeyBase64 = "";
  for (const line of pubkeyLines) {
    if (line.includes("public key:")) {
      publicKeyBase64 = line.split("public key:")[1]?.trim() || "";
    }
  }
  
  console.log("Raw public key (base64):", publicKeyBase64);
  
  // Convert to compressed format
  const compressedPublicKey = convertTSMPublicKeyToCompressed(publicKeyBase64);
  console.log("Compressed public key:", compressedPublicKey);
  
  // Now let's sign the message
  console.log("\n2️⃣ Signing message with TSM...");
  
  const signOutput = await callGoBinary("sign", [keyId, messageHash]);
  console.log("Sign output:", signOutput);
  
  // Parse r and s
  const signLines = signOutput.split("\n");
  let r = "";
  let s = "";
  for (const line of signLines) {
    if (line.includes("r:")) {
      r = line.split("r:")[1]?.trim() || "";
    }
    if (line.includes("s:")) {
      s = line.split("s:")[1]?.trim() || "";
    }
  }
  
  console.log("\n3️⃣ Signature components:");
  console.log("r:", r);
  console.log("s:", s);
  
  // Test signature verification
  console.log("\n4️⃣ Testing signature verification...");
  
  try {
    const msgHashBytes = Buffer.from(messageHash, "hex");
    const sig = secp256k1.Signature.fromCompact(
      Buffer.concat([
        Buffer.from(r, "hex"),
        Buffer.from(s, "hex"),
      ])
    );
    
    const pubKeyBytes = Buffer.from(compressedPublicKey, "hex");
    const isValid = secp256k1.verify(sig, msgHashBytes, pubKeyBytes);
    
    console.log("Signature verification:", isValid ? "✅ VALID" : "❌ INVALID");
    
    if (!isValid) {
      console.log("\n5️⃣ Testing recovery to debug...");
      for (let recoveryId = 0; recoveryId < 2; recoveryId++) {
        try {
          const recoveredPoint = sig.addRecoveryBit(recoveryId).recoverPublicKey(msgHashBytes);
          const recoveredPublicKey = Buffer.from(recoveredPoint.toRawBytes(true)).toString("hex");
          console.log(`Recovery ID ${recoveryId}: ${recoveredPublicKey}`);
          console.log(`Matches: ${recoveredPublicKey === compressedPublicKey ? "✅ YES" : "❌ NO"}`);
        } catch (error) {
          console.log(`Recovery ID ${recoveryId}: ❌ Failed to recover - ${error}`);
        }
      }
    }
    
  } catch (error) {
    console.error("❌ Error during verification:", error);
  }
}

function convertTSMPublicKeyToCompressed(base64PublicKey: string): string {
  try {
    const publicKeyJson = JSON.parse(
      Buffer.from(base64PublicKey, "base64").toString("utf-8")
    );
    
    const uncompressedKey = Buffer.from(publicKeyJson.point, "base64");
    
    let fullUncompressedKey: Uint8Array;
    if (uncompressedKey.length === 64) {
      fullUncompressedKey = new Uint8Array(65);
      fullUncompressedKey[0] = 0x04;
      fullUncompressedKey.set(uncompressedKey, 1);
    } else if (uncompressedKey.length === 65) {
      fullUncompressedKey = uncompressedKey;
    } else {
      throw new Error(`Invalid public key length: ${uncompressedKey.length}`);
    }
    
    const point = secp256k1.ProjectivePoint.fromHex(fullUncompressedKey);
    const compressedKey = point.toRawBytes(true);
    
    return Buffer.from(compressedKey).toString("hex");
  } catch (error) {
    throw new Error(`Public key conversion failed: ${error}`);
  }
}

async function callGoBinary(command: string, args: string[] = []): Promise<string> {
  const tempDir = path.join(process.cwd(), "blockdaemon_client");
  let certPath = process.env.BLOCKDAEMON_CLIENT_CERT_PATH || "./blockdaemon_client/client.crt";
  let keyPath = process.env.BLOCKDAEMON_CLIENT_KEY_PATH || "./blockdaemon_client/client.key";
  const filesToCleanup: string[] = [];

  // Create temporary certificate file if content is provided
  if (process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT) {
    certPath = path.join(tempDir, "temp_client.crt");
    fs.writeFileSync(certPath, process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT);
    filesToCleanup.push(certPath);
  }

  // Create temporary key file if content is provided
  if (process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT) {
    keyPath = path.join(tempDir, "temp_client.key");
    fs.writeFileSync(keyPath, process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT);
    filesToCleanup.push(keyPath);
  }

  const cleanup = () => {
    filesToCleanup.forEach((file) => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  };

  return new Promise((resolve, reject) => {
    const goArgs = ["run", "main.go", command, ...args];

    const child = spawn("go", goArgs, {
      cwd: "./blockdaemon_client",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CLIENT_CERT_PATH: certPath,
        CLIENT_KEY_PATH: keyPath,
      },
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    child.on("close", (code) => {
      cleanup();
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Process failed: ${errorOutput}`));
      }
    });

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

debugTSMSigning().catch(console.error);
