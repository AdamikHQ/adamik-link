import prompts from "prompts";
import { AdamikAPIError, AdamikEncodePubkeyToAddressResponse } from "./types";
import { BaseSigner } from "../signers/types";
import { SignerType } from "../signers/types";

export const encodePubKeyToAddress = async (
  pubKey: string,
  chainId: string,
  signer: BaseSigner
) => {
  const fetchPubkeyToAddresses = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/address/encode`,
    {
      method: "POST",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pubkey: pubKey,
      }),
    }
  );

  const pubkeyToAddresses: AdamikAPIError<AdamikEncodePubkeyToAddressResponse> =
    await fetchPubkeyToAddresses.json();

  if (pubkeyToAddresses.status && pubkeyToAddresses.status.errors.length > 0) {
    throw new Error(pubkeyToAddresses.status.errors[0].message);
  }

  const addresses = pubkeyToAddresses.addresses;

  if (addresses.length === 0) {
    throw new Error("No addresses found, please verify ");
  }

  if (addresses.length === 1) {
    return addresses[0].address;
  }

  // DFNS special mode handling
  // TODO We should abstract this with a "high-level, chain-specific" signer abstraction,
  // as opposed to "low-level, chain-agnostic" signer support that we have now
  // for all signers except these two DFNS modes below
  if (signer.signerName === SignerType.DFNS_BTC_SEGWIT) {
    return addresses.find((address) => address.type === "p2wpkh")?.address;
  } else if (signer.signerName === SignerType.DFNS_BTC_TAPROOT) {
    return addresses.find((address) => address.type === "p2tr")?.address;
  }

  const { address } = await prompts({
    type: "select",
    name: "address",
    message: "Select the corresponding address for the pubkey you provided",
    choices: addresses.map((address: { type: string; address: string }) => ({
      title: `${address.address} (${address.type})`,
      value: address.address,
    })),
  });

  if (!address) {
    throw new Error("No address selected");
  }

  return address;
};
