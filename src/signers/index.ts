import prompts from "prompts";
import { AdamikChain, AdamikSignerSpec } from "../adamik/types";
import { DfnsSigner, DfnsSpecialMode } from "./Dfns";
import { LocalSigner } from "./LocalSigner";
import { SodotSigner } from "./Sodot";
import { TurnkeySigner } from "./Turnkey";
import { SignerType, BaseSigner } from "./types";

export const signerSelector = async (
  chain: AdamikChain,
  signerSpec: AdamikSignerSpec
): Promise<BaseSigner> => {
  const { signerName } = await prompts({
    type: "select",
    name: "signerName",
    message:
      "Please, select a signer, be sure to have properly set .env.local for the corresponding signer",
    choices: Object.values(SignerType)
      .map((signer) => ({
        title: signer,
        value: signer,
        disabled:
          signer === SignerType.LOCAL && !process.env.UNSECURE_LOCAL_SEED,
      }))
      .sort((a, b) => {
        if (a.title === SignerType.LOCAL) return 1;
        if (b.title === SignerType.LOCAL) return -1;
        if (a.title === SignerType.SODOT) return -1;
        if (b.title === SignerType.SODOT) return 1;
        return a.title.localeCompare(b.title);
      }),
  });

  // isConfigValid() Should throw an error if the config is not valid
  switch (signerName) {
    case SignerType.LOCAL:
      LocalSigner.isConfigValid();
      return new LocalSigner(chain, signerSpec);
    case SignerType.SODOT:
      SodotSigner.isConfigValid();
      return new SodotSigner(chain, signerSpec);
    case SignerType.TURNKEY:
      TurnkeySigner.isConfigValid();
      return new TurnkeySigner(chain, signerSpec);
    case SignerType.DFNS:
      DfnsSigner.isConfigValid();
      return new DfnsSigner(chain, signerSpec, DfnsSpecialMode.NONE);
    case SignerType.DFNS_BTC_SEGWIT:
      DfnsSigner.isConfigValid();
      return new DfnsSigner(chain, signerSpec, DfnsSpecialMode.BTC_SEGWIT);
    case SignerType.DFNS_BTC_TAPROOT:
      DfnsSigner.isConfigValid();
      return new DfnsSigner(chain, signerSpec, DfnsSpecialMode.BTC_TAPROOT);
    default:
      throw new Error(`Unsupported signer: ${signerName}`);
  }
};
