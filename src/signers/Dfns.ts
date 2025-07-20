import * as utils from "@noble/curves/abstract/utils";
import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";

import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { ethers, sha256 } from "ethers";
import { extractSignature, infoTerminal, italicInfoTerminal } from "../utils";
import { BaseSigner } from "./types";

export class DfnsSigner implements BaseSigner {
  private dfnsApi: DfnsApiClient;
  public chainId: string;
  public signerSpec: AdamikSignerSpec;
  public signerName = "DFNS";
  private walletId: string;

  constructor(chainId: string, signerSpec: AdamikSignerSpec) {
    this.chainId = chainId;
    this.signerSpec = signerSpec;

    const signer = new AsymmetricKeySigner({
      credId: process.env.DFNS_CRED_ID!,
      privateKey: process.env.DFNS_PRIVATE_KEY!,
    });

    const dfnsApi = new DfnsApiClient({
      appId: process.env.DFNS_APP_ID!,
      authToken: process.env.DFNS_AUTH_TOKEN!,
      baseUrl: process.env.DFNS_API_URL!,
      signer,
    });

    this.dfnsApi = dfnsApi;
    this.walletId = "";
  }

  static isConfigValid(): boolean {
    if (!process.env.DFNS_CRED_ID) {
      throw new Error("DFNS_CRED_ID is not set");
    }
    if (!process.env.DFNS_PRIVATE_KEY) {
      throw new Error("DFNS_PRIVATE_KEY is not set");
    }
    if (!process.env.DFNS_APP_ID) {
      throw new Error("DFNS_APP_ID is not set");
    }
    if (!process.env.DFNS_AUTH_TOKEN) {
      throw new Error("DFNS_AUTH_TOKEN is not set");
    }
    if (!process.env.DFNS_API_URL) {
      throw new Error("DFNS_API_URL is not set");
    }

    return true;
  }

  private convertAdamikCurveToDfnsCurve(
    curve: AdamikCurve
  ): "KeyECDSAStark" | "KeyEdDSA" | "KeyECDSA" {
    switch (curve) {
      case AdamikCurve.STARK:
        return "KeyECDSAStark";
      case AdamikCurve.ED25519:
        return "KeyEdDSA";
      case AdamikCurve.SECP256K1:
        return "KeyECDSA";
      default:
        throw new Error(`Unsupported curve: ${curve}`);
    }
  }

  private async createWallet() {
    const wallet = await this.dfnsApi.wallets.createWallet({
      body: {
        network: this.convertAdamikCurveToDfnsCurve(this.signerSpec.curve),
      },
    });

    return wallet;
  }

  private async starknetPubkeyFormatting(bytes: string) {
    const hex = bytes.substring(2);
    const stripped = hex.replace(/^0+/gm, ""); // strip leading 0s
    return `0x${stripped}`;
  }

  private async listWallets() {
    const wallets = await this.dfnsApi.wallets.listWallets();
    return wallets;
  }

  async getAddress(): Promise<string> {
    throw new Error("Not implemented");
  }

  async getPubkey() {
    const wallets = await this.listWallets();

    const existingWallet = wallets.items.find(
      (item) =>
        item.network ===
        this.convertAdamikCurveToDfnsCurve(this.signerSpec.curve)
    );

    infoTerminal(
      `Existing wallet: ${existingWallet?.signingKey.publicKey || "None"}`
    );

    if (existingWallet) {
      await italicInfoTerminal(JSON.stringify(existingWallet, null, 2));

      this.walletId = existingWallet.id;

      if (this.signerSpec.curve === AdamikCurve.STARK) {
        return this.starknetPubkeyFormatting(
          existingWallet.signingKey.publicKey
        );
      }

      return existingWallet.signingKey.publicKey;
    }

    infoTerminal("Creating new wallet ...");

    const wallet = await this.createWallet();

    infoTerminal(`New wallet created`);

    this.walletId = wallet.id;

    if (this.signerSpec.curve === AdamikCurve.STARK) {
      return this.starknetPubkeyFormatting(wallet.signingKey.publicKey);
    }

    return wallet.signingKey.publicKey;
  }

  private async signDFNSHash(hash: string) {
    const formattedHash = hash.startsWith("0x") ? hash : "0x" + hash;

    await italicInfoTerminal(JSON.stringify(formattedHash, null, 2));

    const signature = await this.dfnsApi.wallets.generateSignature({
      body: {
        kind: "Hash",
        hash: formattedHash,
      },
      walletId: this.walletId,
    });

    return signature;
  }

  private async signMessage(message: string) {
    const signature = await this.dfnsApi.wallets.generateSignature({
      body: {
        kind: "Message",
        message,
      },
      walletId: this.walletId,
    });

    return signature;
  }

  private keccak256FromHex(hexString: string) {
    if (!hexString.startsWith("0x")) {
      hexString = "0x" + hexString;
    }

    const bytes = ethers.getBytes(hexString);
    const hash = ethers.keccak256(bytes);

    return hash;
  }

  private MAX_VALUE: bigint = BigInt(
    "0x800000000000000000000000000000000000000000000000000000000000000"
  );

  private hex0xToBytes(hex: string): Uint8Array {
    if (typeof hex === "string") {
      hex = hex.replace(/^0x/i, ""); // allow 0x prefix
      if (hex.length & 1) hex = "0" + hex; // allow unpadded hex
    }
    return utils.hexToBytes(hex);
  }

  private ensureBytes(hex: string): Uint8Array {
    return utils.ensureBytes(
      "",
      typeof hex === "string" ? this.hex0xToBytes(hex) : hex
    );
  }

  private checkMessage(msgHash: string) {
    const bytes = this.ensureBytes(msgHash);
    const num = utils.bytesToNumberBE(bytes);
    if (num >= this.MAX_VALUE)
      throw new Error(`msgHash should be [0, ${this.MAX_VALUE})`);
    return bytes;
  }

  private async hashTransactionPayload(
    hashAlgo: AdamikHashFunction,
    curve: AdamikCurve,
    hashTransactionPayload: string
  ) {
    if (curve === AdamikCurve.STARK) {
      return Buffer.from(this.checkMessage(hashTransactionPayload)).toString(
        "hex"
      );
    }

    if (curve !== AdamikCurve.SECP256K1) {
      return hashTransactionPayload.startsWith("0x")
        ? hashTransactionPayload
        : `0x${hashTransactionPayload}`;
    }

    switch (hashAlgo) {
      case AdamikHashFunction.SHA256:
        return sha256(Buffer.from(hashTransactionPayload, "hex"));
      case AdamikHashFunction.KECCAK256:
        return this.keccak256FromHex(hashTransactionPayload);
      default:
        throw new Error(`Unsupported hash function: ${hashAlgo} - ${curve}`);
    }
  }

  async signTransaction(
    encodedMessage: string,
    byPassHashFunction = false
  ): Promise<string> {
    try {
      const toSign = byPassHashFunction
        ? encodedMessage
        : await this.hashTransactionPayload(
            this.signerSpec.hashFunction,
            this.signerSpec.curve,
            encodedMessage
          );

      const signedTx =
        this.signerSpec.curve === AdamikCurve.ED25519
          ? await this.signMessage(toSign)
          : await this.signDFNSHash(toSign);

      if (signedTx.status !== "Signed") {
        throw new Error(`Failed to sign transaction: ${signedTx.reason}`);
      }

      infoTerminal("Signature generated");
      await italicInfoTerminal(JSON.stringify(signedTx.signature, null, 2));

      return extractSignature(this.signerSpec.signatureFormat, {
        r: signedTx.signature?.r || "",
        s: signedTx.signature?.s || "",
        v: signedTx.signature?.recid?.toString(16) || undefined,
      });
    } catch (e) {
      console.log(JSON.stringify(e, null, 2));
      throw e;
    }
  }

  public async signHash(hash: string): Promise<string> {
    return this.signTransaction(hash, true);
  }
}
