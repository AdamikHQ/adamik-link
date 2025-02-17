import prompts from "prompts";

import { Turnkey } from "@turnkey/sdk-server";

export const signerGetAccounts = async (turnkeyClient: Turnkey) => {
  const { accounts } = await turnkeyClient.apiClient().getWalletAccounts({
    walletId: process.env.WALLET_ID!,
  });

  const { selectedAccount } = await prompts({
    type: "autocomplete",
    name: "selectedAccount",
    message: "Select an account",
    initial: "cosmos1pppte5ut0yh6ymtumpl743hp8y6gj80wtrjrqa",
    choices: accounts.map((account) => ({
      title: `${account.address}`,
      value: { path: account.path, address: account.address },
      description: `curve: ${account.curve} | addressFormat: ${account.addressFormat} | path: ${account.path}`,
    })),
  });

  if (!selectedAccount) {
    throw new Error("No account selected");
  }

  let accountId = selectedAccount.address;

  const { pubKey } = await prompts({
    type: "select",
    name: "pubKey",
    message:
      "Some chains will probably need a public key otherwise you can skip",
    choices: [
      { title: "Skip", value: undefined },
      ...accounts
        .filter(
          (account) =>
            account.path === selectedAccount.path &&
            [
              // "ADDRESS_FORMAT_UNCOMPRESSED",
              "ADDRESS_FORMAT_COMPRESSED",
            ].includes(account.addressFormat)
        )
        .map((account) => ({
          title: account.address,
          value: account.address,
        })),
    ],
  });

  return { accountId, pubKey, selectedAccount };
};
