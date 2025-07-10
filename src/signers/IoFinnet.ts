import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { extractSignature, infoTerminal, italicInfoTerminal } from "../utils";
import { Signer } from "./index";
import { BaseSigner } from "./types";

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

  private convertAdamikCurveToIoFinnetCurve(curve: AdamikCurve): string {
    // TODO: Map Adamik curves to IoFinnet curve types
    switch (curve) {
      case AdamikCurve.SECP256K1:
        return "secp256k1";
      case AdamikCurve.ED25519:
        return "ed25519";
      default:
        throw new Error(`Unsupported curve: ${curve}`);
    }
  }

  private convertHashFunctionToIoFinnetHashFunction(
    hashFunction: AdamikHashFunction
  ): string {
    // TODO: Map Adamik hash functions to IoFinnet hash function types
    switch (hashFunction) {
      case AdamikHashFunction.SHA256:
        return "sha256";
      case AdamikHashFunction.KECCAK256:
        return "keccak256";
      default:
        throw new Error(`Unsupported hash function: ${hashFunction}`);
    }
  }

  private convertChainIdToIoFinnetAssetId(chainId: string): string {
    switch (chainId) {
      case "bitcoin":
        return "BTC";
      case "bitcoin-testnet":
        return "BTC_TESTNET";
      case "ethereum":
        return "ETH";
      case "bsc":
        return "BSC";
      case "polygon":
        return "POLYGON";
      default:
        throw new Error(`Unsupported chainId: ${chainId}`);
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
      // TODO: Implement transaction signing via IoFinnet API
      // POST /v1/vaults/{vaultId}/signatures/sign
      infoTerminal("Signing transaction with IoFinnet...", this.signerName);
      await italicInfoTerminal(`Encoded message: ${encodedMessage}`);

      // FIXME
      const signatureRequest = {
        // TODO: Structure the request according to IoFinnet API specification
        message: encodedMessage,
        message_format: "hex", // or "raw" depending on API
        curve: this.convertAdamikCurveToIoFinnetCurve(this.signerSpec.curve),
        hash_function: this.convertHashFunctionToIoFinnetHashFunction(
          this.signerSpec.hashFunction
        ),
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
        throw new Error(`Transaction signing failed: ${response.statusText}`);
      }

      const signatureData = await response.json();

      infoTerminal("Transaction signed successfully", this.signerName);
      await italicInfoTerminal(JSON.stringify(signatureData, null, 2));

      // TODO: Extract and format signature according to Adamik signature format
      // FIXME Does signatureData have the right format?
      return extractSignature(this.signerSpec.signatureFormat, signatureData);
    } catch (error) {
      throw new Error(`Failed to sign transaction with IoFinnet: ${error}`);
    }
  }

  // FIXME Not sure we can implement this one
  public async signHash(hash: string): Promise<string> {
    const token = await this.ensureAuthenticated();

    try {
      // TODO: Implement hash signing via IoFinnet API
      // POST /v1/vaults/{vaultId}/signatures/sign
      infoTerminal("Signing hash with IoFinnet...", this.signerName);
      await italicInfoTerminal(`Hash: ${hash}`);

      const signatureRequest = {
        // TODO: Structure the request according to IoFinnet API specification
        hash: hash,
        message_format: "hash",
        curve: this.convertAdamikCurveToIoFinnetCurve(this.signerSpec.curve),
        // For hash signing, we might not need to specify hash function
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
        throw new Error(`Hash signing failed: ${response.statusText}`);
      }

      const signatureData = await response.json();

      infoTerminal("Hash signed successfully", this.signerName);
      await italicInfoTerminal(JSON.stringify(signatureData, null, 2));

      // TODO: Extract and format signature according to Adamik signature format
      return extractSignature(this.signerSpec.signatureFormat, signatureData);
    } catch (error) {
      throw new Error(`Failed to sign hash with IoFinnet: ${error}`);
    }
  }
}
