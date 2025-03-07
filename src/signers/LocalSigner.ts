import { HDNodeWallet, ethers } from "ethers";
import {
  AdamikCurve,
  AdamikHashFunction,
  AdamikSignerSpec,
} from "../adamik/types";
import { extractSignature, infoTerminal } from "../utils";
import { BaseSigner } from "./types";
import * as nacl from "tweetnacl";

export class LocalSigner implements BaseSigner {
  private wallet: HDNodeWallet | null = null;
  private ed25519KeyPair: nacl.SignKeyPair | null = null;
  public signerName = "LOCAL_UNSECURE";

  constructor(public chainId: string, public signerSpec: AdamikSignerSpec) {
    if (!process.env.UNSECURE_LOCAL_SEED) {
      throw new Error(
        "UNSECURE_LOCAL_SEED is not set in environment variables"
      );
    }
  }

  static isConfigValid(): boolean {
    return !!process.env.UNSECURE_LOCAL_SEED;
  }

  private async getSecp256k1Wallet(): Promise<HDNodeWallet> {
    if (!this.wallet) {
      // Create master node from mnemonic
      const masterNode = ethers.HDNodeWallet.fromPhrase(
        process.env.UNSECURE_LOCAL_SEED!,
        "", // Empty password
        "m" // Start from master path
      );

      // Derive from master using coinType
      const derivationPath = `44'/${this.signerSpec.coinType}'/0'/0/0`;
      this.wallet = masterNode.derivePath(derivationPath);
    }
    return this.wallet;
  }

  private async getEd25519KeyPair(): Promise<nacl.SignKeyPair> {
    if (!this.ed25519KeyPair) {
      // For ED25519, we should also respect the derivation path
      // but since tweetnacl doesn't support HD wallets directly,
      // we'll need a different approach for ED25519 chains
      const seed = ethers.sha256(Buffer.from(process.env.UNSECURE_LOCAL_SEED!));
      this.ed25519KeyPair = nacl.sign.keyPair.fromSeed(
        Buffer.from(seed.slice(2), "hex").slice(0, 32)
      );
    }
    return this.ed25519KeyPair;
  }

  async getPubkey(): Promise<string> {
    switch (this.signerSpec.curve) {
      case AdamikCurve.SECP256K1: {
        const wallet = await this.getSecp256k1Wallet();
        return wallet.publicKey.slice(2); // Remove '0x' prefix
      }
      case AdamikCurve.ED25519: {
        const keyPair = await this.getEd25519KeyPair();
        return Buffer.from(keyPair.publicKey).toString("hex");
      }
      default:
        throw new Error(`Unsupported curve: ${this.signerSpec.curve}`);
    }
  }

  private padTo32Bytes(input: string): Buffer {
    const hex = input.startsWith("0x") ? input.slice(2) : input;
    const buffer = Buffer.from(hex.padStart(64, "0"), "hex");
    return buffer;
  }

  async signTransaction(encodedMessage: string): Promise<string> {
    infoTerminal(
      `Signing message with ${this.signerSpec.curve}`,
      this.signerName
    );

    const messageBytes = Buffer.from(encodedMessage, "hex");

    let messageHash: Buffer;
    switch (this.signerSpec.hashFunction) {
      case AdamikHashFunction.SHA256:
        messageHash = Buffer.from(ethers.sha256(messageBytes).slice(2), "hex");
        break;
      case AdamikHashFunction.KECCAK256:
        messageHash = Buffer.from(
          ethers.keccak256(messageBytes).slice(2),
          "hex"
        );
        break;
      case AdamikHashFunction.SHA512_256:
        throw new Error("SHA512_256 not implemented");
      case AdamikHashFunction.PEDERSEN:
        throw new Error("Pedersen hash not implemented");
      default:
        throw new Error(
          `Unsupported hash function: ${this.signerSpec.hashFunction}`
        );
    }

    switch (this.signerSpec.curve) {
      case AdamikCurve.SECP256K1: {
        const wallet = await this.getSecp256k1Wallet();
        const sig = wallet.signingKey.sign(messageHash);

        return extractSignature(this.signerSpec.signatureFormat, {
          r: sig.r.slice(2),
          s: sig.s.slice(2),
          v: sig.v.toString(16),
        });
      }
      case AdamikCurve.ED25519: {
        const keyPair = await this.getEd25519KeyPair();
        const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);

        return extractSignature(this.signerSpec.signatureFormat, {
          r: Buffer.from(signature.slice(0, 32)).toString("hex"),
          s: Buffer.from(signature.slice(32, 64)).toString("hex"),
        });
      }
      default:
        throw new Error(`Unsupported curve: ${this.signerSpec.curve}`);
    }
  }

  private hashMessage(message: string): string {
    const input = message.startsWith("0x") ? message : "0x" + message;
    return this.signerSpec.hashFunction === AdamikHashFunction.SHA256
      ? ethers.sha256(input)
      : ethers.keccak256(input);
  }
}
