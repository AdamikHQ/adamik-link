import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { infoTerminal, italicInfoTerminal } from "../utils";
import { Signer } from "./index";
import { BaseSigner } from "./types";

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

  private async pollForSignatureCompletion(
    signatureId: string,
    token: string
  ): Promise<string> {
    const maxAttempts = 60; // 10 minutes max (60 * 10s)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
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
      } catch (error) {
        if (error instanceof Error && error.message.includes("Signature")) {
          throw error; // Re-throw signature-specific errors
        }
        throw new Error(`Failed to poll signature status: ${error}`);
      }
    }

    throw new Error(
      "Signature completion timeout - exceeded maximum polling time"
    );
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

  public async signTransaction(encodedMessage: string): Promise<string> {
    const token = await this.ensureAuthenticated();

    try {
      infoTerminal("Signing transaction with IoFinnet...", this.signerName);
      await italicInfoTerminal(`Encoded message: ${encodedMessage}`);

      // Remove "0x" prefix if present
      const cleanEncodedMessage = encodedMessage.startsWith("0x")
        ? encodedMessage.slice(2)
        : encodedMessage;

      const signatureRequest = {
        data: cleanEncodedMessage,
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
        throw new Error(
          `Transaction signature request failed: ${response.statusText}`
        );
      }

      const signatureRequestData: IoFinnetSignatureResponse =
        await response.json();

      infoTerminal("Signature request created successfully", this.signerName);
      await italicInfoTerminal(JSON.stringify(signatureRequestData, null, 2));

      // Extract signature ID for polling
      const signatureId = signatureRequestData.signatureId;
      infoTerminal(`Signature ID: ${signatureId}`, this.signerName);
      infoTerminal(
        "Waiting for signature approval and completion...",
        this.signerName
      );

      // Poll for signature completion
      const completedSignature = await this.pollForSignatureCompletion(
        signatureId,
        token
      );

      infoTerminal("Transaction signed successfully", this.signerName);
      return completedSignature;
    } catch (error) {
      throw new Error(`Failed to sign transaction with IoFinnet: ${error}`);
    }
  }

  public async signHash(hash: string): Promise<string> {
    // NOTE io.finnet always apply the hash themselves
    throw new Error("Not implemented");
  }
}
