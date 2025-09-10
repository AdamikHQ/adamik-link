import { overridedPrompt } from "../utils";
import { AdamikAPIError, AdamikEncodePubkeyToAddressResponse } from "./types";

export const encodePubKeyToAddress = async (
  pubKey: string,
  chainId: string
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

  // For Bitcoin, automatically select address type without prompting
  // Priority: P2WPKH (native SegWit) > P2SH-P2WPKH (wrapped SegWit) > P2PKH (legacy)
  if (chainId === "bitcoin" || chainId === "bitcoin-testnet") {
    // Try P2WPKH first (native SegWit - starts with bc1/tb1)
    const p2wpkhAddress = addresses.find((addr: any) => 
      addr.type === "p2wpkh" || addr.type === "P2WPKH" || 
      addr.address.startsWith("bc1") || addr.address.startsWith("tb1")
    );
    if (p2wpkhAddress) {
      console.log(`[ADAMIK] Auto-selected P2WPKH address: ${p2wpkhAddress.address}`);
      return p2wpkhAddress.address;
    }

    // Try P2SH-P2WPKH (wrapped SegWit - starts with 3/2)
    const p2shAddress = addresses.find((addr: any) => 
      addr.type === "p2sh-p2wpkh" || addr.type === "P2SH-P2WPKH" || 
      addr.type === "p2sh" || addr.type === "P2SH" ||
      addr.address.startsWith("3") || addr.address.startsWith("2")
    );
    if (p2shAddress) {
      console.log(`[ADAMIK] Auto-selected P2SH address: ${p2shAddress.address}`);
      return p2shAddress.address;
    }

    // Fallback to P2PKH (legacy - starts with 1/m/n)
    const p2pkhAddress = addresses.find((addr: any) => 
      addr.type === "p2pkh" || addr.type === "P2PKH" ||
      addr.address.startsWith("1") || addr.address.startsWith("m") || addr.address.startsWith("n")
    );
    if (p2pkhAddress) {
      console.log(`[ADAMIK] Auto-selected P2PKH address: ${p2pkhAddress.address}`);
      return p2pkhAddress.address;
    }

    // If no recognized type, just use the first one
    console.log(`[ADAMIK] Using first available address: ${addresses[0].address}`);
    return addresses[0].address;
  }

  // For non-Bitcoin chains, still use the prompt
  const { address } = await overridedPrompt({
    type: "select",
    name: "address",
    message: "Select the corresponding address for the pubkey you provided",
    choices: addresses.map((address: { type: string; address: string }) => ({
      title: `${address.address} (${address.type})`,
      value: address.address,
    })),
    initial: addresses[0].address,
  });

  if (!address) {
    throw new Error("No address selected");
  }

  return address;
};
