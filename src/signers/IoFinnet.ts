import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { infoTerminal, italicInfoTerminal } from "../utils";
import { Signer } from "./index";
import { BaseSigner } from "./types";
import { Transaction } from "bitcoinjs-lib";

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

/**
 * IoFinnet signer implementation for Adamik
 *
 * This signer integrates with IoFinnet's MPC signing service, supporting multiple blockchain networks.
 * For Bitcoin, it uses a specialized signing approach that works with IoFinnet's ES256K algorithm.
 *
 * Key features:
 * - Multi-chain support (Bitcoin, Ethereum, BSC, Polygon, Tron)
 * - ES256K signature algorithm compatibility
 * - Automatic signature polling and completion
 * - Bitcoin PSBT signing with proper double-hash handling
 */
export class IoFinnetSigner implements BaseSigner {
  public chainId: string;
  public signerSpec: AdamikSignerSpec;
  public signerName = Signer.IOFINNET;

  private baseUrl: string;
  private accessToken: string | undefined;
  private vaultId: string;
  private address: string | undefined;

  // Feature flag to control PSBT signing capability
  // Set to true once IoFinnet adds native PSBT signing support
  // When enabled, IoFinnet will attempt to sign the complete PSBT directly
  // before falling back to individual hash signing
  private readonly supportsPsbtSigning: boolean = false;

  // Constants for configuration
  private static readonly SIGNATURE_POLL_MAX_ATTEMPTS = 60; // 10 minutes max (60 * 10s)
  private static readonly SIGNATURE_POLL_INTERVAL_MS = 10000; // 10 seconds
  private static readonly MIN_TRANSACTION_LENGTH = 130; // Minimum length for a valid transaction

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

  /**
   * Convert Adamik chain ID to IoFinnet asset ID
   */
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

  /**
   * Map Adamik signature specs to IoFinnet COSE algorithms
   */
  private getIoFinnetCoseAlgorithm(
    curve: AdamikCurve,
    hashFunction: AdamikHashFunction
  ): string {
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
        return "EDDSA"; // EdDSA with Ed25519
      case AdamikCurve.STARK:
        throw new Error(
          "STARK curves are not supported by IoFinnet COSE algorithms"
        );
      default:
        throw new Error(`Unsupported curve: ${curve}`);
    }
  }

  /**
   * Authenticate with IoFinnet API and get access token
   */
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

  /**
   * Ensure we have a valid access token, authenticating if necessary
   */
  private async ensureAuthenticated(): Promise<string> {
    if (!this.accessToken) {
      return await this.authenticate();
    }
    return this.accessToken!;
  }

  async getPubkey(): Promise<string> {
    throw new Error(
      "Not implemented - IoFinnet does not expose public keys directly"
    );
  }

  /**
   * Get address from IoFinnet vault
   * Note: IoFinnet provides addresses directly, not public keys
   */
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
        throw new Error(`Failed to fetch address: ${response.statusText}`);
      }

      const responseData = await response.json();

      // Find the asset that matches our chainId
      const targetAssetId = this.convertChainIdToIoFinnetAssetId(this.chainId);
      const asset = responseData.data.find(
        (asset: any) => asset.id === targetAssetId
      );

      if (!asset) {
        throw new Error(
          `Asset not found for chainId: ${this.chainId} (looking for asset ID: ${targetAssetId})`
        );
      }

      // Note: IoFinnet's API returns the address in the 'publicKey' field
      this.address = asset.publicKey;
      return this.address!;
    } catch (error) {
      throw new Error(`Failed to get address from IoFinnet: ${error}`);
    }
  }

  /**
   * Sign data with IoFinnet
   *
   * @param data - Hex string of data to sign
   * @returns Hex string of signature
   */
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

  /**
   * Sign Bitcoin PSBT using IoFinnet
   *
   * This method uses a specialized approach for Bitcoin signing that works with IoFinnet's ES256K algorithm.
   * It extracts the raw preimage data and sends the single SHA256 hash to IoFinnet, which then applies
   * another SHA256 to produce the proper Bitcoin double-hash signature.
   *
   * The method checks the `supportsPsbtSigning` flag to determine whether to attempt direct PSBT signing
   * first. If disabled (current state), it skips directly to individual hash signing for efficiency.
   *
   * @param encodedMessage - PSBT hex string
   * @returns Finalized transaction hex string
   */
  private async signBitcoinPsbt(encodedMessage: string): Promise<string> {
    infoTerminal("Signing transaction with PSBT ...", this.signerName);

    // Check if IoFinnet supports direct PSBT signing
    if (this.supportsPsbtSigning) {
      infoTerminal(
        "Attempting direct PSBT signing with IoFinnet...",
        this.signerName
      );
      // Try to send the entire PSBT to IoFinnet to see if they can handle it directly
      try {
        const iofinnetResponse = await this.signData(encodedMessage);

        // Check if IoFinnet returned a complete transaction
        if (iofinnetResponse.length > IoFinnetSigner.MIN_TRANSACTION_LENGTH) {
          infoTerminal(
            `IoFinnet returned complete transaction (${
              iofinnetResponse.length / 2
            } bytes)`,
            this.signerName
          );

          // Verify it's a valid transaction by parsing it
          try {
            const tx = Transaction.fromHex(iofinnetResponse);
            infoTerminal(
              `✅ IoFinnet returned valid transaction with ${tx.ins.length} inputs and ${tx.outs.length} outputs`,
              this.signerName
            );
            return iofinnetResponse;
          } catch (parseError) {
            infoTerminal(
              `❌ IoFinnet response is not a valid transaction: ${parseError}`,
              this.signerName
            );
            throw new Error(
              `IoFinnet returned invalid transaction: ${parseError}`
            );
          }
        }

        // If we get here, IoFinnet returned a regular signature, fall back to individual hash signing
        infoTerminal(
          "IoFinnet returned signature, falling back to individual hash signing",
          this.signerName
        );
      } catch (error) {
        infoTerminal(
          `Direct PSBT signing failed: ${error}. Trying individual hash signing...`,
          this.signerName
        );
      }
    } else {
      infoTerminal(
        "IoFinnet does not support direct PSBT signing. Using individual hash signing approach.",
        this.signerName
      );
    }

    // Use the specialized Bitcoin signing approach with proper hash handling
    const { signBitcoinPsbtWithIoFinnetPreimage, getIoFinnetPublicKey } =
      await import("./IoFinnet-bitcoin-preimage");

    // Use the hardcoded public key to avoid extra signature call
    const publicKey = getIoFinnetPublicKey();
    infoTerminal(
      `Using hardcoded public key: ${publicKey.toString("hex")}`,
      this.signerName
    );

    // Create a callback function to sign Bitcoin hash with IoFinnet
    // This sends SHA256(preimage) to IoFinnet, which applies SHA256 again
    // Result: SHA256(SHA256(preimage)) = proper Bitcoin double hash
    const signBitcoinHashCallback = async (
      bitcoinHash: string
    ): Promise<string> => {
      return await this.signData(bitcoinHash);
    };

    // Use the specialized Bitcoin PSBT signing approach
    return await signBitcoinPsbtWithIoFinnetPreimage(
      encodedMessage,
      signBitcoinHashCallback,
      publicKey
    );
  }

  /**
   * Sign a transaction with IoFinnet
   *
   * @param encodedMessage - Transaction data to sign (hex string)
   * @returns Signature or finalized transaction hex string
   */
  public async signTransaction(encodedMessage: string): Promise<string> {
    infoTerminal("Signing transaction with IoFinnet...", this.signerName);
    await italicInfoTerminal(`Encoded message: ${encodedMessage}`);

    // Bitcoin requires special handling due to PSBT format and double-hash requirements
    if (this.chainId === "bitcoin") {
      return await this.signBitcoinPsbt(encodedMessage);
    }

    // For non-Bitcoin chains, use the standard signing method
    const signature = await this.signData(encodedMessage);
    infoTerminal("Transaction signed successfully", this.signerName);
    return signature;
  }

  public async signHash(hash: string): Promise<string> {
    throw new Error("Not implemented - IoFinnet applies hashing internally");
  }

  /**
   * Poll IoFinnet API for signature completion
   *
   * @param signatureId - ID of the signature request
   * @param token - Authentication token
   * @returns Completed signature hex string
   */
  private async pollForSignatureCompletion(
    signatureId: string,
    token: string
  ): Promise<string> {
    let attempts = 0;

    while (attempts < IoFinnetSigner.SIGNATURE_POLL_MAX_ATTEMPTS) {
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

      // Wait before next poll
      await new Promise((resolve) =>
        setTimeout(resolve, IoFinnetSigner.SIGNATURE_POLL_INTERVAL_MS)
      );
      attempts++;
    }

    throw new Error(
      "Signature completion timeout - exceeded maximum polling time"
    );
  }
}
