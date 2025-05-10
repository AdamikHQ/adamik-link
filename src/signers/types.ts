import { AdamikChain, AdamikSignerSpec } from "../adamik/types";

export enum SignerType {
  DFNS = "DFNS",
  DFNS_BTC_TAPROOT = "DFNS - Bitcoin Taproot",
  DFNS_BTC_SEGWIT = "DFNS - Bitcoin Segwit",
  LOCAL = "LOCAL MNEMONIC (UNSECURE)",
  SODOT = "SODOT",
  TURNKEY = "TURNKEY",
}

export interface BaseSigner {
  signerSpec: AdamikSignerSpec;
  signerName: SignerType;
  chain: AdamikChain;

  getPubkey(): Promise<string>;
  signTransaction(encodedMessage: string): Promise<string>;
}
