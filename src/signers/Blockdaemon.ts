import { spawn, execSync } from "child_process";
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

// Constants for cryptographic operations
const UNCOMPRESSED_KEY_PREFIX = 0x04;
const EXPECTED_UNCOMPRESSED_LENGTH = 64;
const EXPECTED_FULL_LENGTH = 65;

export class BlockdaemonSigner implements BaseSigner {
  public chainId: string;
  public signerSpec: AdamikSignerSpec;
  public signerName = Signer.BLOCKDAEMON;

  private keyIds: string[] = [];
  private clientCertContent: string | null = null;
  private clientKeyContent: string | null = null;
  private cachedPublicKey: string | null = null;

  constructor(chainId: string, signerSpec: AdamikSignerSpec) {
    this.chainId = chainId;
    this.signerSpec = signerSpec;

    this.initializeCertificateConfig();
    this.initializeKeyIds(signerSpec.curve);
  }

  private initializeCertificateConfig(): void {
    // All certificate configuration is now handled via environment variables
    this.clientCertContent =
      process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT || null;
    this.clientKeyContent = process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT || null;
  }

  private initializeKeyIds(curve: AdamikCurve): void {
    switch (curve) {
      case AdamikCurve.SECP256K1:
        this.keyIds =
          process.env.BLOCKDAEMON_EXISTING_KEY_IDS?.split(",") || [];
        break;
      case AdamikCurve.ED25519:
        throw new Error("ED25519 curve not yet supported by Builder Vault TSM");
      case AdamikCurve.STARK:
        throw new Error("STARK curve not supported by Builder Vault TSM");
      default:
        throw new Error(`Unsupported curve: ${curve}`);
    }
  }

  static isConfigValid(): boolean {
    const certPath = process.env.BLOCKDAEMON_CLIENT_CERT_PATH;
    const keyPath = process.env.BLOCKDAEMON_CLIENT_KEY_PATH;

    const hasCertContent = !!process.env.BLOCKDAEMON_CLIENT_CERT_CONTENT;
    const hasKeyContent = !!process.env.BLOCKDAEMON_CLIENT_KEY_CONTENT;
    const hasCertPath = !!certPath;
    const hasKeyPath = !!keyPath;

    // Must have either certificate content or valid certificate file path
    if (!hasCertContent && (!hasCertPath || !fs.existsSync(certPath))) {
      throw new Error(
        "Builder Vault TSM client certificate required. Please provide either BLOCKDAEMON_CLIENT_CERT_PATH (file) or BLOCKDAEMON_CLIENT_CERT_CONTENT (content)."
      );
    }

    // Must have either key content or valid key file path
    if (!hasKeyContent && (!hasKeyPath || !fs.existsSync(keyPath))) {
      throw new Error(
        "Builder Vault TSM client key required. Please provide either BLOCKDAEMON_CLIENT_KEY_PATH (file) or BLOCKDAEMON_CLIENT_KEY_CONTENT (content)."
      );
    }

    try {
      execSync("go version", { stdio: "ignore" });
    } catch {
      throw new Error("Go is not installed or not available in PATH");
    }

    const blockdaemonDir = path.resolve("./blockdaemon_client");
    if (!fs.existsSync(blockdaemonDir)) {
      throw new Error(
        `Builder Vault TSM client directory not found at: ${blockdaemonDir}`
      );
    }

    const mainGoPath = path.join(blockdaemonDir, "main.go");
    if (!fs.existsSync(mainGoPath)) {
      throw new Error(`Builder Vault TSM main.go not found at: ${mainGoPath}`);
    }

    return true;
  }

  private adamikCurveToTSMCurve(curve: AdamikCurve): string {
    switch (curve) {
      case AdamikCurve.SECP256K1:
        return "secp256k1";
      default:
        throw new Error(`Unsupported curve for TSM: ${curve}`);
    }
  }

  private convertTSMPublicKeyToCompressed(base64PublicKey: string): string {
    try {
      const publicKeyJson = this.parseTSMPublicKey(base64PublicKey);
      this.validateTSMPublicKey(publicKeyJson);

      const uncompressedKey = Buffer.from(publicKeyJson.point, "base64");
      const fullUncompressedKey =
        this.ensureUncompressedKeyFormat(uncompressedKey);

      const point = secp256k1.ProjectivePoint.fromHex(fullUncompressedKey);
      const compressedKey = point.toRawBytes(true);
      return Buffer.from(compressedKey).toString("hex");
    } catch (error) {
      errorTerminal(
        `Failed to convert TSM public key format: ${error}`,
        this.signerName
      );
      throw new Error(`Public key conversion failed: ${error}`);
    }
  }

  private parseTSMPublicKey(base64PublicKey: string): TSMPublicKeyResponse {
    return JSON.parse(
      Buffer.from(base64PublicKey, "base64").toString("utf-8")
    ) as TSMPublicKeyResponse;
  }

  private validateTSMPublicKey(publicKeyJson: TSMPublicKeyResponse): void {
    if (
      publicKeyJson.scheme !== "ECDSA" ||
      publicKeyJson.curve !== "secp256k1"
    ) {
      throw new Error(
        `Unsupported key format: ${publicKeyJson.scheme}/${publicKeyJson.curve}`
      );
    }
  }

  private ensureUncompressedKeyFormat(uncompressedKey: Buffer): Uint8Array {
    if (uncompressedKey.length === EXPECTED_UNCOMPRESSED_LENGTH) {
      const fullUncompressedKey = new Uint8Array(EXPECTED_FULL_LENGTH);
      fullUncompressedKey[0] = UNCOMPRESSED_KEY_PREFIX;
      fullUncompressedKey.set(uncompressedKey, 1);
      return fullUncompressedKey;
    } else if (uncompressedKey.length === EXPECTED_FULL_LENGTH) {
      return uncompressedKey;
    } else {
      throw new Error(
        `Invalid public key length: ${uncompressedKey.length}, expected ${EXPECTED_UNCOMPRESSED_LENGTH} or ${EXPECTED_FULL_LENGTH} bytes`
      );
    }
  }

  private async createTempCertFiles(): Promise<{
    certPath: string;
    keyPath: string;
    cleanup: () => void;
  }> {
    const tempDir = path.join(process.cwd(), "blockdaemon_client");
    let certPath = process.env.BLOCKDAEMON_CLIENT_CERT_PATH || "";
    let keyPath = process.env.BLOCKDAEMON_CLIENT_KEY_PATH || "";
    const filesToCleanup: string[] = [];

    if (this.clientCertContent) {
      certPath = path.join(tempDir, "temp_client.crt");
      fs.writeFileSync(certPath, this.clientCertContent);
      filesToCleanup.push(certPath);
    }

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
        } catch {
          // Ignore cleanup errors
        }
      });
    };

    return { certPath, keyPath, cleanup };
  }

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
          errorTerminal(
            `TSM process failed with code ${code}: ${errorOutput}`,
            this.signerName
          );
          reject(new Error(`TSM process failed: ${errorOutput}`));
        }
      });

      child.on("error", (error) => {
        cleanup();
        errorTerminal(
          `Failed to start TSM process: ${error.message}`,
          this.signerName
        );
        reject(error);
      });
    });
  }

  private parseKeygenOutput(output: string): BlockdaemonKeygenResponse {
    const keyId = this.extractValueFromOutput(output, "Key ID:");
    const publicKey = this.extractValueFromOutput(output, "public key:");

    if (!keyId || !publicKey) {
      throw new Error(`Failed to parse key generation output: ${output}`);
    }

    return { keyId, publicKey };
  }

  private extractValueFromOutput(output: string, pattern: string): string {
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes(pattern)) {
        return line.split(pattern)[1]?.trim() || "";
      }
    }
    return "";
  }

  private parseSignOutput(
    output: string
  ): BlockdaemonSignResponse & { r: string; s: string } {
    const r = this.extractValueFromOutput(output, "r:");
    const s = this.extractValueFromOutput(output, "s:");
    const keyId =
      this.extractValueFromOutput(output, "Key ID:") ||
      this.extractValueFromOutput(output, "key ID:");

    if (!r || !s) {
      throw new Error(`Failed to parse signature output: ${output}`);
    }

    return { signature: `${r},${s}`, keyId, r, s };
  }

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

  private async keygenTSM(): Promise<{ keyIds: string[]; publicKey: string }> {
    infoTerminal("Starting distributed key generation...", this.signerName);

    try {
      const output = await this.callGoBinary("keygen");
      const result = this.parseKeygenOutput(output);

      infoTerminal(`TSM key generated successfully!`, this.signerName);
      infoTerminal(`Key ID: ${result.keyId}`, this.signerName);
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

  private async getPublicKeyFromTSM(keyId: string): Promise<string> {
    try {
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

      const output = await this.callGoBinary("get-pubkey", [keyId]);
      const result = this.parsePubkeyOutput(output);

      infoTerminal(
        "Public key retrieved successfully from TSM!",
        this.signerName
      );

      const compressedPublicKey = this.convertTSMPublicKeyToCompressed(
        result.publicKey
      );
      infoTerminal(
        `Converted to compressed format: ${compressedPublicKey}`,
        this.signerName
      );

      this.cachedPublicKey = compressedPublicKey;
      return compressedPublicKey;
    } catch (error) {
      errorTerminal(`Failed to get public key: ${error}`, this.signerName);
      throw error;
    }
  }

  public async getPubkey(): Promise<string> {
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
      const cleanMessage = message.replace("0x", "");

      const output = await this.callGoBinary("sign", [keyId, cleanMessage]);
      const result = this.parseSignOutput(output);

      infoTerminal("TSM signature completed.", this.signerName);
      infoTerminal(`r: ${result.r}`, this.signerName);
      infoTerminal(`s: ${result.s}`, this.signerName);

      return this.formatSignature({ r: result.r, s: result.s }, cleanMessage);
    } catch (error) {
      errorTerminal(`Signing failed: ${error}`, this.signerName);
      throw error;
    }
  }

  private calculateRecoveryId(
    messageHash: string,
    signature: { r: string; s: string },
    publicKey: string
  ): number {
    try {
      const msgHashBytes = Buffer.from(messageHash, "hex");

      const pubKeyBytes = Buffer.from(publicKey, "hex");
      const pubKeyPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);

      const sig = secp256k1.Signature.fromCompact(
        Buffer.concat([
          Buffer.from(signature.r.padStart(64, "0"), "hex"),
          Buffer.from(signature.s.padStart(64, "0"), "hex"),
        ])
      );

      for (let recoveryId = 0; recoveryId < 2; recoveryId++) {
        try {
          const recoveredPoint = sig
            .addRecoveryBit(recoveryId)
            .recoverPublicKey(msgHashBytes);

          if (recoveredPoint.equals(pubKeyPoint)) {
            return recoveryId;
          }
        } catch {
          continue;
        }
      }

      return 0;
    } catch (error) {
      infoTerminal(
        `Recovery ID calculation failed, using default: ${error}`,
        this.signerName
      );
      return 0;
    }
  }

  private formatSignature(
    signatureData: { r: string; s: string },
    messageHash?: string
  ): string {
    try {
      infoTerminal("Converting r,s values to Adamik format", this.signerName);

      const signatureParams: { r: string; s: string; v?: string } = {
        r: signatureData.r,
        s: signatureData.s,
      };

      if (this.signerSpec.signatureFormat === "rsv") {
        if (messageHash && this.cachedPublicKey) {
          const recoveryId = this.calculateRecoveryId(
            messageHash,
            signatureData,
            this.cachedPublicKey
          );

          signatureParams.v = recoveryId.toString(16);
          infoTerminal(
            `Calculated recovery ID: ${recoveryId} (v=${recoveryId})`,
            this.signerName
          );
        } else {
          signatureParams.v = "0";
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
