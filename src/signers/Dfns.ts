import * as utils from "@noble/curves/abstract/utils";
import {
  AdamikChain,
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";

import { DfnsApiClient } from "@dfns/sdk";
import { AsymmetricKeySigner } from "@dfns/sdk-keysigner";
import { ethers, sha256 } from "ethers";
import { extractSignature, infoTerminal, italicInfoTerminal } from "../utils";
import { SignerType, BaseSigner } from "./types";
import { ListWalletsResponse } from "@dfns/sdk/generated/wallets";

export enum DfnsSpecialMode {
  NONE = "none",
  BTC_SEGWIT = "btc-segwit",
  BTC_TAPROOT = "btc-taproot",
}

export class DfnsSigner implements BaseSigner {
  private dfnsApi: DfnsApiClient;
  public chain: AdamikChain;
  public signerSpec: AdamikSignerSpec;
  public specialMode: DfnsSpecialMode;
  public signerName: SignerType;
  private walletId: string;

  constructor(
    chain: AdamikChain,
    signerSpec: AdamikSignerSpec,
    specialMode: DfnsSpecialMode
  ) {
    this.chain = chain;
    this.signerSpec = signerSpec;
    this.specialMode = specialMode;

    this.signerName =
      specialMode === DfnsSpecialMode.BTC_SEGWIT
        ? SignerType.DFNS_BTC_SEGWIT
        : specialMode === DfnsSpecialMode.BTC_TAPROOT
        ? SignerType.DFNS_BTC_TAPROOT
        : SignerType.DFNS;

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
        network: [
          DfnsSpecialMode.BTC_SEGWIT,
          DfnsSpecialMode.BTC_TAPROOT,
        ].includes(this.specialMode)
          ? "Bitcoin"
          : this.convertAdamikCurveToDfnsCurve(this.signerSpec.curve),
      },
    });

    return wallet;
  }

  private async listWallets() {
    const wallets = await this.dfnsApi.wallets.listWallets();
    infoTerminal(
      `Existing wallets: ${JSON.stringify(wallets, null, 2) || "None"}`
    );
    return wallets;
  }

  /**
   * Finds an existing wallet based on the current special mode and curve
   * @param wallets - List of wallets to search through
   * @returns The matching wallet or undefined if none found
   */
  private findExistingWallet(
    wallets: ListWalletsResponse
  ): ListWalletsResponse["items"][number] | undefined {
    switch (this.specialMode) {
      case DfnsSpecialMode.NONE:
        return wallets.items.find(
          (item) =>
            item.network ===
            this.convertAdamikCurveToDfnsCurve(this.signerSpec.curve)
        );
      case DfnsSpecialMode.BTC_SEGWIT:
        return wallets.items.find((item) => item.signingKey.scheme === "ECDSA");
      case DfnsSpecialMode.BTC_TAPROOT:
        return wallets.items.find(
          (item) => item.signingKey.scheme === "Schnorr"
        );
      default:
        return undefined;
    }
  }

  async getPubkey() {
    const wallets = await this.listWallets();

    const existingWallet = this.findExistingWallet(wallets);

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

  async signTransaction(encodedMessage: string): Promise<string> {
    try {
      // Special handling for Bitcoin transactions
      if (this.chain.family === "bitcoin") {
        infoTerminal("Detected Bitcoin transaction, using PSBT signing...");
        // For Bitcoin, the encoded message is expected to be a PSBT in hex format
        return this.signPsbt(encodedMessage);
      }

      // Standard transaction signing for other chains
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

  /**
   * Signs a Bitcoin PSBT (Partially Signed Bitcoin Transaction) using DFNS.
   *
   * This method handles the specifics of Bitcoin PSBT signing through the DFNS API.
   * It expects the input to be a hex-encoded PSBT string and returns the signed PSBT.
   *
   * @param psbtHex - The hex-encoded PSBT to sign
   * @returns A promise that resolves to the signed PSBT hex string
   */
  async signPsbt(psbtHex: string): Promise<string> {
    try {
      // Ensure we have a wallet ID
      if (!this.walletId) {
        await this.getPubkey(); // This will initialize the wallet if needed
      }

      infoTerminal("Signing Bitcoin PSBT with DFNS...");
      await italicInfoTerminal(`PSBT to sign: ${psbtHex}`);

      // Call DFNS API to sign the PSBT
      const signature = await this.dfnsApi.wallets.generateSignature({
        body: {
          kind: "Psbt",
          psbt: psbtHex,
        },
        walletId: this.walletId,
      });

      if (signature.status !== "Signed") {
        throw new Error(`Failed to sign Bitcoin PSBT: ${signature.reason}`);
      }

      infoTerminal("Bitcoin PSBT signed successfully");

      // DFNS API response for PSBT typically includes the encoded signed transaction
      // The exact property depends on DFNS API version
      if (signature.signature?.encoded) {
        return signature.signature.encoded;
      } else if (signature.signedData) {
        return signature.signedData;
      } else {
        // If not available in the standard location, inspect the full response
        // to find where the signed PSBT is stored
        await italicInfoTerminal(JSON.stringify(signature, null, 2));
        throw new Error("Could not find signed PSBT in the response");
      }
    } catch (error: unknown) {
      const e = error as Error;
      console.error("Error signing Bitcoin PSBT:", e);
      throw new Error(
        `Failed to sign Bitcoin PSBT: ${e.message || JSON.stringify(e)}`
      );
    }
  }
}
