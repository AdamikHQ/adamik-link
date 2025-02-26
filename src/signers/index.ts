import prompts from "prompts";
import { AdamikSignerSpec } from "../adamik/types";
import { SodotSigner } from "./Sodot";
import { TurnkeySigner } from "./Turnkey";
import { BaseSigner } from "./types";

export enum Signer {
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
      .sort((a, b) => {
        if (a.title === Signer.TURNKEY) return -1;
        if (b.title === Signer.TURNKEY) return 1;
        return a.title.localeCompare(b.title);
      }),
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
    default:
      throw new Error(`Unsupported signer: ${signerName}`);
  }
};
