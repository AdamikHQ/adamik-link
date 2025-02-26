import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";

import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { keccak256, sha256 } from "ethers";
import { extractSignature, infoTerminal, italicInfoTerminal } from "../utils";
import { BaseSigner } from "./types";

export class DfnsSigner implements BaseSigner {
  private signer: AsymmetricKeySigner;
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

    this.signer = signer;
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

  private async listWallets() {
    const wallets = await this.dfnsApi.wallets.listWallets();
    return wallets;
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

      return existingWallet.signingKey.publicKey;
    }

    infoTerminal("Creating new wallet ...");

    const wallet = await this.createWallet();

    infoTerminal(`New wallet created`);

    this.walletId = wallet.id;

    return wallet.signingKey.publicKey;
  }

  private async signHash(hash: string) {
    const signature = await this.dfnsApi.wallets.generateSignature({
      body: {
        kind: "Hash",
        hash,
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

  private async hashTransactionPayload(
    hashAlgo: AdamikHashFunction,
    curve: AdamikCurve,
    hashTransactionPayload: string
  ) {
    if (curve !== AdamikCurve.SECP256K1) {
      return hashTransactionPayload.startsWith("0x")
        ? hashTransactionPayload
        : `0x${hashTransactionPayload}`;
    }

    switch (hashAlgo) {
      case AdamikHashFunction.SHA256:
        return sha256(Buffer.from(hashTransactionPayload, "hex"));
      case AdamikHashFunction.KECCAK256:
        return keccak256(Buffer.from(hashTransactionPayload, "hex"));
      default:
        throw new Error(`Unsupported hash function: ${hashAlgo} - ${curve}`);
    }
  }

  async signTransaction(encodedMessage: string): Promise<string> {
    try {
      const toSign = await this.hashTransactionPayload(
        this.signerSpec.hashFunction,
        this.signerSpec.curve,
        encodedMessage
      );

      const signedTx =
        this.signerSpec.curve === AdamikCurve.ED25519
          ? await this.signMessage(toSign)
          : await this.signHash(toSign);

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
}
