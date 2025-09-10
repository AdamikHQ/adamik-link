import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { infoTerminal, italicInfoTerminal } from "../utils";
import { Signer } from "./index";
import { BaseSigner } from "./types";
import { Transaction } from "bitcoinjs-lib";
import { compressPublicKey } from "./IoFinnet-bitcoin-preimage";

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
  private vaultDetails: any | undefined;
  private publicKeys: Map<string, string> = new Map();

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

  /**
   * Get the curve type for the current chain
   */
  private getCurveTypeForChain(): string {
    // Map Adamik curve to IoFinnet curve type
    switch (this.signerSpec.curve) {
      case AdamikCurve.SECP256K1:
        return "ECDSA_SECP256K1";
      case AdamikCurve.ED25519:
        return "EDDSA_ED25519";
      default:
        // Default to ECDSA for Bitcoin and similar chains
        return "ECDSA_SECP256K1";
    }
  }

  /**
   * Fetch and cache vault details including public keys
   */
  private async ensureVaultDetails(): Promise<void> {
    if (this.vaultDetails) {
      return;
    }

    const token = await this.ensureAuthenticated();

    try {
      infoTerminal("Fetching vault details from IoFinnet...", this.signerName);
      
      const response = await fetch(
        `${this.baseUrl}/v1/vaults/${this.vaultId}`,
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
        throw new Error(`Failed to fetch vault details: ${response.statusText}`);
      }

      this.vaultDetails = await response.json();
      
      // Extract public keys from vault details
      // The structure might vary, so we'll handle different possible formats
      if (this.vaultDetails.curves && Array.isArray(this.vaultDetails.curves)) {
        // IoFinnet returns curves array with algorithm, curve, and publicKey
        for (const curveData of this.vaultDetails.curves) {
          if (curveData.publicKey) {
            // Map IoFinnet curve names to our internal format
            let curveKey: string;
            if (curveData.algorithm === "ECDSA" && curveData.curve === "Secp256k1") {
              curveKey = "ECDSA_SECP256K1";
            } else if (curveData.algorithm === "EDDSA" && curveData.curve === "Edwards") {
              curveKey = "EDDSA_ED25519";
            } else {
              curveKey = `${curveData.algorithm}_${curveData.curve}`;
            }
            
            // Store the public key with proper formatting
            // Add 0x prefix if not present for consistency
            const pubKey = curveData.publicKey.startsWith("0x") 
              ? curveData.publicKey 
              : `0x${curveData.publicKey}`;
            
            this.publicKeys.set(curveKey, pubKey);
            infoTerminal(`Found public key for ${curveKey} (${curveData.algorithm} ${curveData.curve})`, this.signerName);
          }
        }
      } else if (this.vaultDetails.publicKeys) {
        // Alternative format: direct publicKeys object
        for (const [curve, pubKey] of Object.entries(this.vaultDetails.publicKeys)) {
          this.publicKeys.set(curve as string, pubKey as string);
          infoTerminal(`Found public key for ${curve}`, this.signerName);
        }
      } else if (this.vaultDetails.signingKeys) {
        // Alternative structure with signing keys
        for (const key of this.vaultDetails.signingKeys) {
          if (key.publicKey && key.curve) {
            this.publicKeys.set(key.curve, key.publicKey);
            infoTerminal(`Found public key for ${key.curve}`, this.signerName);
          }
        }
      } else if (this.vaultDetails.data?.publicKey) {
        // Fallback: single public key in data
        const curveType = this.getCurveTypeForChain();
        this.publicKeys.set(curveType, this.vaultDetails.data.publicKey);
        infoTerminal(`Found single public key, mapping to ${curveType}`, this.signerName);
      }

      if (this.publicKeys.size === 0) {
        infoTerminal(
          "Warning: No public keys found in vault details.",
          this.signerName
        );
        // Only log full details if debugging is needed
        if (process.env.DEBUG_IOFINNET) {
          await italicInfoTerminal(JSON.stringify(this.vaultDetails, null, 2), 200);
        }
      }
    } catch (error) {
      throw new Error(`Failed to get vault details from IoFinnet: ${error}`);
    }
  }

  async getPubkey(): Promise<string> {
    // First, ensure we have vault details
    await this.ensureVaultDetails();

    // Get the appropriate public key based on the chain's curve
    const curveType = this.getCurveTypeForChain();
    let publicKey = this.publicKeys.get(curveType);

    if (!publicKey) {
      throw new Error(
        `No public key found for curve type: ${curveType} on chain: ${this.chainId}`
      );
    }

    // Remove 0x prefix if present for consistency with Adamik's expected format
    publicKey = publicKey.replace(/^0x/i, '');

    // For chains using secp256k1, compress the public key if it's uncompressed
    // IoFinnet returns uncompressed (65 bytes starting with 04)
    // Many chains (Bitcoin, Cosmos, etc.) need compressed format (33 bytes starting with 02/03)
    if (this.signerSpec.curve === AdamikCurve.SECP256K1 && publicKey.startsWith("04")) {
      infoTerminal(`Converting uncompressed public key to compressed for ${this.chainId}`, this.signerName);
      const uncompressedBuffer = Buffer.from(publicKey, 'hex');
      const compressedBuffer = compressPublicKey(uncompressedBuffer);
      publicKey = compressedBuffer.toString('hex');
      infoTerminal(`Compressed public key: ${publicKey}`, this.signerName);
    }

    infoTerminal(`Retrieved public key for ${curveType}`, this.signerName);
    return publicKey;
  }

  /**
   * Get address from IoFinnet vault
   * 
   * NOTE: This method is now largely redundant since we can get public keys
   * and derive addresses via Adamik's encodePubKeyToAddress endpoint.
   * Kept for backward compatibility and as a fallback.
   * 
   * The main adamikLink flow will:
   * 1. Try getPubkey() and convert via Adamik's encodePubKeyToAddress
   * 2. Fall back to this method only if getPubkey() fails
   */
  async getAddress(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    // Since we now have public keys, we could derive the address ourselves
    // But for backward compatibility, we'll still check IoFinnet's assets endpoint
    
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

      // Note: IoFinnet's API returns the address in the 'publicKey' field (confusing naming)
      this.address = asset.publicKey;
      infoTerminal(
        `Got address from assets endpoint: ${this.address}`,
        this.signerName
      );
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
    const { signBitcoinPsbtWithIoFinnetPreimage } =
      await import("./IoFinnet-bitcoin-preimage");

    // Get the public key dynamically from vault details - REQUIRED
    // Note: getPubkey() already handles compression for Bitcoin
    const publicKeyHex = await this.getPubkey();
    infoTerminal(
      `Using dynamically fetched public key: ${publicKeyHex}`,
      this.signerName
    );
    
    // Convert to Buffer - the key is already compressed for Bitcoin
    const publicKey = Buffer.from(publicKeyHex.replace("0x", ""), "hex");

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

  public async signHash(_hash: string): Promise<string> {
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
