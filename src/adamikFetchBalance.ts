import { Balance, Chain } from "./types";

import { amountToMainUnit } from "./utils";

export const adamikFetchBalance = async (
  chainId: string,
  accountId: string,
  chains: Record<string, Chain>
) => {
  const fetchBalance = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/account/${accountId}/state`,
    {
      method: "GET",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`Fetching balance for ${accountId} on ${chainId}....`);

  const balance: Balance = await fetchBalance.json();

  console.log(`Your current balance are :`);
  console.log(
    `- ${amountToMainUnit(
      balance.balances.native.total,
      chains[chainId].decimals
    )} ${chains[chainId].ticker} - ${chains[chainId].name}`
  );
  balance.balances.tokens.forEach((token) => {
    console.log(
      `- ${amountToMainUnit(token.amount, token.token.decimals)} ${
        token.token.ticker
      } - ${token.token.name}`
    );
  });

  return balance;
};
