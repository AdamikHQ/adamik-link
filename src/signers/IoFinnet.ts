import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { infoTerminal, italicInfoTerminal } from "../utils";
import { Signer } from "./index";
import {
  finalizeBitcoinPsbt,
  getHashForSig,
  HARDCODED_IOFINNET_BITCOIN_PUBKEY,
} from "./IoFinnet-bitcoin";
import { BaseSigner } from "./types";
import { Psbt, Transaction } from "bitcoinjs-lib";

export interface IoFinnetSignatureResponse {
  id: string;
  signatureId: string;
  status: string;
  memo: string;
  errorCode: string | null;
  errorMessage: string | null;
  voting: {
    approvedWeight: number;
    progress: string;
    threshold: number;
    votes: {
      required: boolean;
      vote: string | null;
      weight: number;
      device: {
        id: string;
        name: string;
        type: string;
        user: {
          id: string;
          profile: {
            fullName: string;
          };
        };
      };
    }[];
  };
  signingData: {
    signature: string | null;
    data: string;
    contentType: string;
    coseAlgorithm: {
      type: string;
      value: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export class IoFinnetSigner implements BaseSigner {
  public chainId: string;
  public signerSpec: AdamikSignerSpec;
  public signerName = Signer.IOFINNET;

  private baseUrl: string;
  private accessToken: string | undefined;
  private vaultId: string;
  private address: string | undefined;

  constructor(chainId: string, signerSpec: AdamikSignerSpec) {
    infoTerminal("Initializing IoFinnet signer...", this.signerName);
    this.chainId = chainId;
    this.signerSpec = signerSpec;
    this.baseUrl = process.env.IOFINNET_BASE_URL!;
    this.vaultId = process.env.IOFINNET_VAULT_ID!;
  }

  static isConfigValid(): boolean {
    if (!process.env.IOFINNET_BASE_URL) {
      throw new Error("IOFINNET_BASE_URL is not set");
    }
    if (!process.env.IOFINNET_CLIENT_ID) {
      throw new Error("IOFINNET_CLIENT_ID is not set");
    }
    if (!process.env.IOFINNET_CLIENT_SECRET) {
      throw new Error("IOFINNET_CLIENT_SECRET is not set");
    }
    if (!process.env.IOFINNET_VAULT_ID) {
      throw new Error("IOFINNET_VAULT_ID is not set");
    }
    return true;
  }

  private convertChainIdToIoFinnetAssetId(chainId: string): string {
    switch (chainId) {
      case "bitcoin":
        return "BTC";
      case "bitcoin-testnet":
        return "BTC_TESTNET";
      case "ethereum":
        return "ETH";
      case "sepolia":
        return "ETH_SEPOLIA";
      case "bsc":
        return "BSC";
      case "polygon":
        return "POLYGON";
      case "tron":
        return "TRON";
      default:
        throw new Error(`Unsupported chainId: ${chainId}`);
    }
  }

  private getIoFinnetCoseAlgorithm(
    curve: AdamikCurve,
    hashFunction: AdamikHashFunction
  ): string {
    // Map Adamik curves and hash functions to IoFinnet COSE algorithms
    switch (curve) {
      case AdamikCurve.SECP256K1:
        switch (hashFunction) {
          case AdamikHashFunction.SHA256:
            return "ES256K"; // ECDSA with secp256k1 and SHA-256
          case AdamikHashFunction.KECCAK256:
            return "ESKEC256"; // ECDSA with secp256k1 and Keccak-256
          default:
            throw new Error(
              `Unsupported hash function ${hashFunction} for SECP256K1 curve`
            );
        }
      case AdamikCurve.ED25519:
        // Ed25519 typically doesn't use external hash functions
        return "EDDSA"; // EdDSA with Ed25519
      case AdamikCurve.STARK:
        throw new Error(
          "STARK curves are not supported by IoFinnet COSE algorithms"
        );
      default:
        throw new Error(`Unsupported curve: ${curve}`);
    }
  }

  private async authenticate(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/auth/accessToken`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          clientId: process.env.IOFINNET_CLIENT_ID,
          clientSecret: process.env.IOFINNET_CLIENT_SECRET,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.accessToken;

      return this.accessToken!;
    } catch (error) {
      throw new Error(`Failed to authenticate with IoFinnet: ${error}`);
    }
  }

  private async ensureAuthenticated(): Promise<string> {
    if (!this.accessToken) {
      return await this.authenticate();
    }
    return this.accessToken!;
  }

  private encodeDER(r: Buffer, s: Buffer): Buffer {
    // Helper function to encode an integer with proper DER formatting
    const encodeInteger = (value: Buffer): Buffer => {
      // Remove leading zeros except when the high bit is set
      let start = 0;
      while (start < value.length && value[start] === 0) {
        start++;
      }

      let trimmed = value.slice(start);

      // If empty or high bit is set, prepend a zero byte
      if (trimmed.length === 0 || trimmed[0] >= 0x80) {
        trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
      }

      // Return: 0x02 (INTEGER tag) + length + value
      return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
    };

    const rEncoded = encodeInteger(r);
    const sEncoded = encodeInteger(s);
    const payload = Buffer.concat([rEncoded, sEncoded]);

    // Return: 0x30 (SEQUENCE tag) + length + payload
    return Buffer.concat([Buffer.from([0x30, payload.length]), payload]);
  }

  async getPubkey(): Promise<string> {
    throw new Error("Not implemented");
  }

  async getAddress(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    const token = await this.ensureAuthenticated();

    try {
      const response = await fetch(
        `${this.baseUrl}/v1/vaults/${this.vaultId}/assets`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch public key: ${response.statusText}`);
      }

      const response_data = await response.json();

      // Find the asset that matches our chainId
      const targetAssetId = this.convertChainIdToIoFinnetAssetId(this.chainId);
      const asset = response_data.data.find(
        (asset: any) => asset.id === targetAssetId
      );

      if (!asset) {
        throw new Error(
          `Asset not found for chainId: ${this.chainId} (looking for asset ID: ${targetAssetId})`
        );
      }

      // NOTE io.finnet actually provides addresses, not public keys...
      this.address = asset.publicKey;

      return this.address!;
    } catch (error) {
      throw new Error(`Failed to get public key from IoFinnet: ${error}`);
    }
  }

  private async signData(data: string): Promise<string> {
    const token = await this.ensureAuthenticated();

    try {
      // Remove "0x" prefix if present
      const cleanData = data.startsWith("0x") ? data.slice(2) : data;

      const signatureRequest = {
        data: cleanData,
        coseAlgorithm: this.getIoFinnetCoseAlgorithm(
          this.signerSpec.curve,
          this.signerSpec.hashFunction
        ),
        contentType: "application/octet-stream+hex",
        //source: "?",
        //memo: "",
        //expiresAt: "",
      };

      const response = await fetch(
        `${this.baseUrl}/v1/vaults/${this.vaultId}/signatures/sign`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(signatureRequest),
        }
      );

      if (!response.ok) {
        throw new Error(`Signature request failed: ${response.statusText}`);
      }

      const signatureRequestData: IoFinnetSignatureResponse =
        await response.json();

      infoTerminal("Signature request created successfully", this.signerName);
      await italicInfoTerminal(JSON.stringify(signatureRequestData, null, 2));

      // Extract signature ID for polling
      const signatureId = signatureRequestData.signatureId;
      infoTerminal(`Signature ID: ${signatureId}`, this.signerName);

      // Poll for signature completion
      const completedSignature = await this.pollForSignatureCompletion(
        signatureId,
        token
      );

      return completedSignature;
    } catch (error) {
      throw new Error(`Failed to sign data with IoFinnet: ${error}`);
    }
  }

  private async signBitcoinPsbt(encodedMessage: string): Promise<string> {
    // Parse the original PSBT
    const psbt = Psbt.fromHex(encodedMessage);

    if (!psbt.data.globalMap.unsignedTx) {
      throw new Error("Unsigned transaction not available in PSBT.");
    }

    // Sign each hash separately and add signatures to PSBT
    const signaturePromises = psbt.data.inputs.map(async (input, index) => {
      const { hash } = getHashForSig(index, input, (psbt as any).__CACHE);

      const hashHex = hash.toString("hex");

      const signatureHex = await this.signData(hashHex);

      // Convert raw signature to DER format and add SIGHASH flag
      // IoFinnet returns raw ECDSA signatures (r + s + recovery), we need DER format
      const rawSignature = Buffer.from(signatureHex.replace("0x", ""), "hex");

      // Extract r and s components (32 bytes each) from the raw signature
      const r = rawSignature.slice(0, 32);
      const s = rawSignature.slice(32, 64);

      // Convert to DER format
      const derSignature = this.encodeDER(r, s);

      // Append SIGHASH_ALL flag
      const sighashType = input.sighashType || Transaction.SIGHASH_ALL;
      const signatureBuffer = Buffer.concat([
        derSignature,
        Buffer.from([sighashType]),
      ]);

      // Add signature to the PSBT input
      // Using the hardcoded public key as instructed
      const publicKey = Buffer.from(HARDCODED_IOFINNET_BITCOIN_PUBKEY, "hex");

      if (!input.partialSig) {
        input.partialSig = [];
      }

      input.partialSig!.push({
        pubkey: publicKey,
        signature: signatureBuffer,
      });
    });

    // Wait for all signatures to be added
    await Promise.all(signaturePromises);

    // Finalize the PSBT and return the raw transaction hex
    return finalizeBitcoinPsbt(psbt);
  }

  public async signTransaction(encodedMessage: string): Promise<string> {
    infoTerminal("Signing transaction with IoFinnet...", this.signerName);
    await italicInfoTerminal(`Encoded message: ${encodedMessage}`);

    // FIXME Temporary hack to sign each PSBT input one by one,
    // until io.finnet supports signing a full PSBT
    if (this.chainId === "bitcoin") {
      return await this.signBitcoinPsbt(encodedMessage);
    }

    // For non-Bitcoin chains, use the extracted signData method
    const signature = await this.signData(encodedMessage);
    infoTerminal("Transaction signed successfully", this.signerName);
    return signature;
  }

  public async signHash(hash: string): Promise<string> {
    // NOTE io.finnet always apply the hash themselves
    throw new Error("Not implemented");
  }

  private async pollForSignatureCompletion(
    signatureId: string,
    token: string
  ): Promise<string> {
    const maxAttempts = 60; // 10 minutes max (60 * 10s)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `${this.baseUrl}/v1/vaults/${this.vaultId}/signatures/${signatureId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get signature status: ${response.statusText}`
        );
      }

      const signatureData: IoFinnetSignatureResponse = await response.json();

      infoTerminal(
        `Signature status: ${signatureData.status}`,
        this.signerName
      );

      if (signatureData.status === "COMPLETED") {
        if (!signatureData.signingData.signature) {
          throw new Error("Signature completed but no signature data found");
        }
        return signatureData.signingData.signature;
      }

      if (
        signatureData.status === "FAILED" ||
        signatureData.status === "CANCELLED"
      ) {
        throw new Error(
          `Signature ${signatureData.status.toLowerCase()}: ${
            signatureData.errorMessage || "Unknown error"
          }`
        );
      }

      // Wait 10 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 10000));
      attempts++;
    }

    throw new Error(
      "Signature completion timeout - exceeded maximum polling time"
    );
  }
}
