import prompts from "prompts";
import { Account, Chain } from "./types";

export const adamikGetChains = async (
  selectedAccount: Account,
  pubKey?: string
) => {
  const fetchAllChains = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/chains`,
    {
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );
  const chains: Record<string, Chain> = (await fetchAllChains.json()).chains;

  const { chainId } = await prompts({
    type: "autocomplete",
    name: "chainId",
    message: "Select a chain",
    choices: Object.keys(chains)
      .filter(
        (chain) =>
          chains[chain].signerSpecs.derivationPath === selectedAccount.path
      )
      .map((chain) => ({
        title: `${chains[chain].name} (${chains[chain].ticker})`,
        value: chain,
      })),
  });

  if (!chainId) {
    throw new Error("No chain selected");
  }

  if (pubKey) {
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

    const pubkeyToAddresses = await fetchPubkeyToAddresses.json();

    if (
      pubkeyToAddresses.status &&
      pubkeyToAddresses.status.errors.length > 0
    ) {
      throw new Error(pubkeyToAddresses.status.errors[0].message);
    }

    const addresses = pubkeyToAddresses.addresses;

    const { selectedAddress } = await prompts({
      type: "select",
      name: "selectedAddress",
      message:
        "We have detected multiple addresses for this pubkey, please select the one you want to use or skip to keep your wallet one",
      choices: [
        { title: "Skip" },
        ...addresses.map((address: { type: string; address: string }) => ({
          title: `${address.address} (${address.type})`,
          value: address.address,
        })),
      ],
    });

    return { chains, chainId, selectedAddress };
  }

  return { chains, chainId };
};
