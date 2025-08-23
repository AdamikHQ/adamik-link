import { AdamikSignerSpec } from "../adamik/types";
import { overridedPrompt } from "../utils";
import { BlockdaemonSigner } from "./Blockdaemon";
import { DfnsSigner } from "./Dfns";
import { LocalSigner } from "./LocalSigner";
import { SodotSigner } from "./Sodot";
import { TurnkeySigner } from "./Turnkey";
import { BaseSigner } from "./types";

export enum Signer {
  BLOCKDAEMON = "BLOCKDAEMON_TSM",
  DFNS = "DFNS",
  LOCAL = "LOCAL MNEMONIC (UNSECURE)",
  SODOT = "SODOT",
  TURNKEY = "TURNKEY",
}

export const signerSelector = async (
  chainId: string,
  signerSpec: AdamikSignerSpec
): Promise<BaseSigner> => {
  const { signerName } = await overridedPrompt({
    type: "select",
    name: "signerName",
    message:
      "Please, select a signer, be sure to have properly set .env.local for the corresponding signer",
    choices: Object.values(Signer)
      .map((signer) => ({
        title: signer,
        value: signer,
        disabled: signer === Signer.LOCAL && !process.env.UNSECURE_LOCAL_SEED,
      }))
      .sort((a, b) => {
        if (a.title === Signer.LOCAL) return 1;
        if (b.title === Signer.LOCAL) return -1;
        if (a.title === Signer.SODOT) return -1;
        if (b.title === Signer.SODOT) return 1;
        return a.title.localeCompare(b.title);
      }),
  });

  switch (signerName) {
    case Signer.BLOCKDAEMON:
      // Should throw an error if the config is not valid.
      BlockdaemonSigner.isConfigValid();
      return new BlockdaemonSigner(chainId, signerSpec);
    case Signer.LOCAL:
      LocalSigner.isConfigValid();
      return new LocalSigner(chainId, signerSpec);
    case Signer.SODOT:
      // Should throw an error if the config is not valid.
      SodotSigner.isConfigValid();
      return new SodotSigner(chainId, signerSpec);
    case Signer.TURNKEY:
      // Should throw an error if the config is not valid.
      TurnkeySigner.isConfigValid();
      return new TurnkeySigner(chainId, signerSpec);
    case Signer.DFNS:
      // Should throw an error if the config is not valid.
      DfnsSigner.isConfigValid();
      return new DfnsSigner(chainId, signerSpec);
    default:
      throw new Error(`Unsupported signer: ${signerName}`);
  }
};
