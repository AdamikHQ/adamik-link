import prompts from "prompts";
import { AdamikSignerSpec } from "../adamik/types";
import { DfnsSigner } from "./Dfns";
import { SodotSigner } from "./Sodot";
import { TurnkeySigner } from "./Turnkey";
import { BaseSigner } from "./types";

export enum Signer {
  DFNS = "DFNS",
  SODOT = "SODOT",
  TURNKEY = "TURNKEY",
}

export const signerSelector = async (
  chainId: string,
  signerSpec: AdamikSignerSpec
): Promise<BaseSigner> => {
  const { signerName } = await prompts({
    type: "select",
    name: "signerName",
    message:
      "Please, select a signer, be sure to have properly set .env.local for the corresponding singer",
    choices: Object.values(Signer)
      .map((signer) => ({
        title: signer,
        value: signer,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  });

  switch (signerName) {
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
      // DfnsSigner.isConfigValid();
      return new DfnsSigner(chainId, signerSpec);
    default:
      throw new Error(`Unsupported signer: ${signerName}`);
  }
};
