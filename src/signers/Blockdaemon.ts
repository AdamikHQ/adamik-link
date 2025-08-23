import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import {
  errorTerminal,
  extractSignature,
  infoTerminal,
  italicInfoTerminal,
} from "../utils";
import { Signer } from "./index";
import { BaseSigner } from "./types";

type BlockdaemonKeygenResponse = {
  keyId: string;
  publicKey: string;
};

type BlockdaemonSignResponse = {
  signature: string;
  keyId: string;
};

type TSMPublicKeyResponse = {
  scheme: string;
  curve: string;
  point: string;
};

export class BlockdaemonSigner implements BaseSigner {
  public chainId: string;
  public signerSpec: AdamikSignerSpec;
  public signerName = Signer.BLOCKDAEMON;

  // TSM node configuration (similar to Sodot's SODOT_VERTICES)
  private TSM_NODES = [
    {
      url: "https://tsm-sandbox.prd.wallet.blockdaemon.app:8080",
      nodeIndex: 0,
    },
    {
      url: "https://tsm-sandbox.prd.wallet.blockdaemon.app:8081",
      nodeIndex: 1,
    },
    {
      url: "https://tsm-sandbox.prd.wallet.blockdaemon.app:8082",
      nodeIndex: 2,
    },
  ];

  private n = 3; // Total nodes
  private t = 2; // Threshold (2 of 3)

  // Similar to Sodot's keyIds array
  private keyIds: string[] = [];
  private clientCertPath: string;
  private clientKeyPath: string;
  private clientCertContent: string | null = null;
  private clientKeyContent: string | null = null;
  private cachedPublicKey: string | null = null;

  constructor(chainId: string, signerSpec: AdamikSignerSpec) {
    this.chainId = chainId;
    this.signerSpec = signerSpec;

    // Support both file paths and direct content for certificates
    this.clientCertPath =
      process.env.BLOCKDAEMON_CLIENT_CERT_PATH ||
      "./blockdaemon_client/client.crt";
    this.clientKeyPath =
      process.env.BLOCKDAEMON_CLIENT_KEY_PATH ||
      "./blockdaemon_client/client.key";

    // Support direct certificate content in environment variables
    this.clientCertContent =
      process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT || null;
    this.clientKeyContent = process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT || null;

    // Load existing key IDs from environment (similar to Sodot)
    switch (signerSpec.curve) {
      case AdamikCurve.SECP256K1:
        this.keyIds =
          process.env.BLOCKDAEMON_EXISTING_KEY_IDS?.split(",") || [];
        break;
      case AdamikCurve.ED25519:
        throw new Error("ED25519 curve not yet supported by Blockdaemon TSM");
      case AdamikCurve.STARK:
        throw new Error("STARK curve not supported by Blockdaemon TSM");
      default:
        throw new Error(`Unsupported curve: ${signerSpec.curve}`);
    }
  }

  static isConfigValid(): boolean {
    const certPath =
      process.env.BLOCKDAEMON_CLIENT_CERT_PATH ||
      "./blockdaemon_client/client.crt";
    const keyPath =
      process.env.BLOCKDAEMON_CLIENT_KEY_PATH ||
      "./blockdaemon_client/client.key";

    // Check if we have certificate content directly or via files
    const hasCertContent = !!process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT;
    const hasKeyContent = !!process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT;

    // Validate certificate availability
    if (!hasCertContent && !fs.existsSync(certPath)) {
      throw new Error(
        `Blockdaemon client certificate not found at: ${certPath}. Please provide either BLOCKDAEMON_CLIENT_CERT_PATH (file) or BLOCKDAEMON_CLIENT_CERT_CONTENT (content).`
      );
    }

    // Validate key availability
    if (!hasKeyContent && !fs.existsSync(keyPath)) {
      throw new Error(
        `Blockdaemon client key not found at: ${keyPath}. Please provide either BLOCKDAEMON_CLIENT_KEY_PATH (file) or BLOCKDAEMON_CLIENT_KEY_CONTENT (content).`
      );
    }

    // Check if Go is available
    try {
      require("child_process").execSync("go version", { stdio: "ignore" });
    } catch {
      throw new Error("Go is not installed or not available in PATH");
    }

    // Verify blockdaemon_client directory exists
    const blockdaemonDir = path.resolve("./blockdaemon_client");
    if (!fs.existsSync(blockdaemonDir)) {
      throw new Error(
        `Blockdaemon client directory not found at: ${blockdaemonDir}`
      );
    }

    const mainGoPath = path.join(blockdaemonDir, "main.go");
    if (!fs.existsSync(mainGoPath)) {
      throw new Error(`Blockdaemon main.go not found at: ${mainGoPath}`);
    }

    return true;
  }

  // Convert Adamik curve to the curve name used by TSM
  private adamikCurveToTSMCurve(curve: AdamikCurve): string {
    switch (curve) {
      case AdamikCurve.SECP256K1:
        return "secp256k1";
      default:
        throw new Error(`Unsupported curve for TSM: ${curve}`);
    }
  }

  // Convert TSM public key format to compressed secp256k1 format expected by Adamik
  private convertTSMPublicKeyToCompressed(base64PublicKey: string): string {
    try {
      // Decode the base64 JSON
      const publicKeyJson = JSON.parse(
        Buffer.from(base64PublicKey, "base64").toString("utf-8")
      ) as TSMPublicKeyResponse;

      if (
        publicKeyJson.scheme !== "ECDSA" ||
        publicKeyJson.curve !== "secp256k1"
      ) {
        throw new Error(
          `Unsupported key format: ${publicKeyJson.scheme}/${publicKeyJson.curve}`
        );
      }

      // Decode the point (uncompressed public key)
      const uncompressedKey = Buffer.from(publicKeyJson.point, "base64");

      // TSM returns 64 bytes (x, y coordinates), but noble curves expects 65 bytes with 0x04 prefix
      let fullUncompressedKey: Uint8Array;
      if (uncompressedKey.length === 64) {
        // Add the 0x04 prefix for uncompressed format
        fullUncompressedKey = new Uint8Array(65);
        fullUncompressedKey[0] = 0x04;
        fullUncompressedKey.set(uncompressedKey, 1);
      } else if (uncompressedKey.length === 65) {
        fullUncompressedKey = uncompressedKey;
      } else {
        throw new Error(
          `Invalid public key length: ${uncompressedKey.length}, expected 64 or 65 bytes`
        );
      }

      // Convert to compressed format using noble curves
      const point = secp256k1.ProjectivePoint.fromHex(fullUncompressedKey);
      const compressedKey = point.toRawBytes(true); // true for compressed format

      // Return as hex string without 0x prefix (following LocalSigner pattern)
      return Buffer.from(compressedKey).toString("hex");
    } catch (error) {
      errorTerminal(
        `Failed to convert TSM public key format: ${error}`,
        this.signerName
      );
      throw new Error(`Public key conversion failed: ${error}`);
    }
  }

  // Create temporary certificate files if content is provided via environment variables
  private async createTempCertFiles(): Promise<{
    certPath: string;
    keyPath: string;
    cleanup: () => void;
  }> {
    const tempDir = path.join(process.cwd(), "blockdaemon_client");
    let certPath = this.clientCertPath;
    let keyPath = this.clientKeyPath;
    const filesToCleanup: string[] = [];

    // Create temporary certificate file if content is provided
    if (this.clientCertContent) {
      certPath = path.join(tempDir, "temp_client.crt");
      fs.writeFileSync(certPath, this.clientCertContent);
      filesToCleanup.push(certPath);
    }

    // Create temporary key file if content is provided
    if (this.clientKeyContent) {
      keyPath = path.join(tempDir, "temp_client.key");
      fs.writeFileSync(keyPath, this.clientKeyContent);
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

    return { certPath, keyPath, cleanup };
  }

  // Call the Go binary (similar to Sodot's HTTP calls)
  private async callGoBinary(
    command: string,
    args: string[] = []
  ): Promise<string> {
    const { certPath, keyPath, cleanup } = await this.createTempCertFiles();

    return new Promise((resolve, reject) => {
      const goArgs = ["run", "main.go", command, ...args];

      infoTerminal(`Executing: go ${goArgs.join(" ")}`, this.signerName);

      const child = spawn("go", goArgs, {
        cwd: "./blockdaemon_client",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Use the resolved cert paths (either original or temporary)
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
        cleanup(); // Clean up temporary files
        if (code === 0) {
          resolve(output.trim());
        } else {
          errorTerminal(
            `TSM process failed with code ${code}: ${errorOutput}`,
            this.signerName
          );
          reject(new Error(`TSM process failed: ${errorOutput}`));
        }
      });

      child.on("error", (error) => {
        cleanup(); // Clean up temporary files
        errorTerminal(
          `Failed to start TSM process: ${error.message}`,
          this.signerName
        );
        reject(error);
      });
    });
  }

  // Parse the Go binary output to extract key information
  private parseKeygenOutput(output: string): BlockdaemonKeygenResponse {
    const lines = output.split("\n");
    let keyId = "";
    let publicKey = "";

    for (const line of lines) {
      if (line.includes("Key ID:")) {
        keyId = line.split("Key ID:")[1]?.trim() || "";
      }
      if (line.includes("public key:")) {
        publicKey = line.split("public key:")[1]?.trim() || "";
      }
    }

    if (!keyId || !publicKey) {
      throw new Error(`Failed to parse key generation output: ${output}`);
    }

    return { keyId, publicKey };
  }

  // Parse the Go binary output to extract signature information
  private parseSignOutput(
    output: string
  ): BlockdaemonSignResponse & { r: string; s: string } {
    const lines = output.split("\n");
    let r = "";
    let s = "";
    let keyId = "";

    for (const line of lines) {
      if (line.includes("r:")) {
        r = line.split("r:")[1]?.trim() || "";
      }
      if (line.includes("s:")) {
        s = line.split("s:")[1]?.trim() || "";
      }
      if (line.includes("key ID:") || line.includes("Key ID:")) {
        keyId = line.split(/key ID:|Key ID:/)[1]?.trim() || "";
      }
    }

    if (!r || !s) {
      throw new Error(`Failed to parse signature output: ${output}`);
    }

    return { signature: `${r},${s}`, keyId, r, s };
  }

  // Parse the Go binary output to extract public key information from get-pubkey command
  private parsePubkeyOutput(output: string): BlockdaemonKeygenResponse {
    const lines = output.split("\n");
    let keyId = "";
    let publicKey = "";

    for (const line of lines) {
      if (line.includes("Key ID:")) {
        keyId = line.split("Key ID:")[1]?.trim() || "";
      }
      if (line.includes("public key:")) {
        publicKey = line.split("public key:")[1]?.trim() || "";
      }
    }

    if (!keyId || !publicKey) {
      throw new Error(`Failed to parse public key output: ${output}`);
    }

    return { keyId, publicKey };
  }

  // Generate a new TSM key (similar to Sodot's keygenVertex)
  private async keygenTSM(): Promise<{ keyIds: string[]; publicKey: string }> {
    infoTerminal("Starting distributed key generation...", this.signerName);

    try {
      const output = await this.callGoBinary("keygen");
      const result = this.parseKeygenOutput(output);

      infoTerminal(`TSM key generated successfully!`, this.signerName);
      infoTerminal(`Key ID: ${result.keyId}`, this.signerName);

      // Convert TSM format to compressed secp256k1 format
      const compressedPublicKey = this.convertTSMPublicKeyToCompressed(
        result.publicKey
      );
      infoTerminal(
        `Converted to compressed format: ${compressedPublicKey}`,
        this.signerName
      );

      return {
        keyIds: [result.keyId],
        publicKey: compressedPublicKey,
      };
    } catch (error) {
      errorTerminal(`Key generation failed: ${error}`, this.signerName);
      throw error;
    }
  }

  // Get public key from an existing TSM key
  private async getPublicKeyFromTSM(keyId: string): Promise<string> {
    try {
      // Check if we have a cached public key
      if (this.cachedPublicKey) {
        infoTerminal(
          `Using cached public key for key ID: ${keyId}`,
          this.signerName
        );
        return this.cachedPublicKey;
      }

      infoTerminal(
        `Retrieving public key for key ID: ${keyId}`,
        this.signerName
      );

      // Use the proper get-pubkey command from the TSM SDK
      const output = await this.callGoBinary("get-pubkey", [keyId]);
      const result = this.parsePubkeyOutput(output);

      infoTerminal(
        "Public key retrieved successfully from TSM!",
        this.signerName
      );

      // Convert TSM format to compressed secp256k1 format
      const compressedPublicKey = this.convertTSMPublicKeyToCompressed(
        result.publicKey
      );
      infoTerminal(
        `Converted to compressed format: ${compressedPublicKey}`,
        this.signerName
      );

      // Cache the converted result for this session
      this.cachedPublicKey = compressedPublicKey;
      return compressedPublicKey;
    } catch (error) {
      errorTerminal(`Failed to get public key: ${error}`, this.signerName);
      throw error;
    }
  }

  public async getPubkey(): Promise<string> {
    // If no keyIds provided, generate new keypair (like Sodot)
    if (this.keyIds.length === 0) {
      infoTerminal("Generating new TSM keypair...", this.signerName);
      const keyGenResults = await this.keygenTSM();
      this.keyIds = keyGenResults.keyIds;

      infoTerminal("Key generation completed.", this.signerName);
      infoTerminal(
        "Please use BLOCKDAEMON_EXISTING_KEY_IDS to reuse the same keys",
        this.signerName
      );
      await italicInfoTerminal(
        `export BLOCKDAEMON_EXISTING_KEY_IDS="${this.keyIds.join(",")}"`,
        1000
      );

      // Cache and return the public key from the generation result
      this.cachedPublicKey = keyGenResults.publicKey;
      return keyGenResults.publicKey;
    } else {
      infoTerminal("Using existing keypair from env.", this.signerName);
      return await this.getPublicKeyFromTSM(this.keyIds[0]);
    }
  }

  public async signTransaction(encodedMessage: string): Promise<string> {
    return this.signMessage(encodedMessage);
  }

  public async signHash(hash: string): Promise<string> {
    return this.signMessage(hash);
  }

  // Core signing method (similar to Sodot's sign method)
  private async signMessage(message: string): Promise<string> {
    if (this.keyIds.length === 0) {
      throw new Error(
        "No key IDs available for signing. Generate a key first."
      );
    }

    const keyId = this.keyIds[0];

    infoTerminal("Creating TSM signing session...", this.signerName);
    infoTerminal(`Signing with key ID: ${keyId}`, this.signerName);

    try {
      // Clean the message (remove 0x prefix if present)
      const cleanMessage = message.replace("0x", "");

      const output = await this.callGoBinary("sign", [keyId, cleanMessage]);
      const result = this.parseSignOutput(output);

      infoTerminal("TSM signature completed.", this.signerName);
      infoTerminal(`r: ${result.r}`, this.signerName);
      infoTerminal(`s: ${result.s}`, this.signerName);

      // Pass the clean message hash for recovery ID calculation
      return this.formatSignature({ r: result.r, s: result.s }, cleanMessage);
    } catch (error) {
      errorTerminal(`Signing failed: ${error}`, this.signerName);
      throw error;
    }
  }

  // Calculate recovery ID (v) for RSV signature format
  private calculateRecoveryId(
    messageHash: string,
    signature: { r: string; s: string },
    publicKey: string
  ): number {
    try {
      // Convert message hash to bytes
      const msgHashBytes = Buffer.from(messageHash, "hex");

      // Get the compressed public key point  
      const pubKeyBytes = Buffer.from(publicKey, "hex");
      const pubKeyPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);

      // Create signature object
      const sig = secp256k1.Signature.fromCompact(
        Buffer.concat([
          Buffer.from(signature.r.padStart(64, "0"), "hex"),
          Buffer.from(signature.s.padStart(64, "0"), "hex"),
        ])
      );

      // Try both recovery IDs (0 and 1, which correspond to v=27 and v=28)
      for (let recoveryId = 0; recoveryId < 2; recoveryId++) {
        try {
          // Recover the public key using this recovery ID
          const recoveredPoint = sig.addRecoveryBit(recoveryId).recoverPublicKey(msgHashBytes);

          // Check if recovered public key matches our public key
          if (recoveredPoint.equals(pubKeyPoint)) {
            return recoveryId;
          }
        } catch {
          // Continue to next recovery ID
        }
      }

      // Default to 0 if recovery fails
      return 0;
    } catch (error) {
      infoTerminal(`Recovery ID calculation failed, using default: ${error}`, this.signerName);
      return 0;
    }
  }

  // Format the signature according to Adamik's requirements
  private formatSignature(
    signatureData: { r: string; s: string },
    messageHash?: string
  ): string {
    try {
      // Convert the r,s values to the format expected by Adamik using extractSignature
      infoTerminal("Converting r,s values to Adamik format", this.signerName);

      // For RSV format, we need to provide a recovery ID (v)
      // For RS format, v is not needed
      const signatureParams: { r: string; s: string; v?: string } = {
        r: signatureData.r,
        s: signatureData.s,
      };

      // Only add v parameter for RSV format
      if (this.signerSpec.signatureFormat === "rsv") {
        if (messageHash && this.cachedPublicKey) {
          // Calculate the correct recovery ID
          const recoveryId = this.calculateRecoveryId(
            messageHash,
            signatureData,
            this.cachedPublicKey
          );
          // For EIP-1559 transactions, v is just the recovery ID (0 or 1)
          // For legacy transactions, v = recoveryId + 27, but Adamik handles this conversion
          signatureParams.v = recoveryId.toString(16);
          infoTerminal(`Calculated recovery ID: ${recoveryId} (v=${recoveryId})`, this.signerName);
        } else {
          // Fallback to default v value if we can't calculate
          signatureParams.v = "0"; // Recovery ID 0 for EIP-1559
          infoTerminal("Using default recovery ID: 0 (v=0)", this.signerName);
        }
      }

      return extractSignature(this.signerSpec.signatureFormat, signatureParams);
    } catch (error) {
      errorTerminal(`Failed to format signature: ${error}`, this.signerName);
      throw error;
    }
  }
}
