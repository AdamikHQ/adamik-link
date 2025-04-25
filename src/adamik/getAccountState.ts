import { AdamikAccountState } from "./types";

export const getAccountState = async (
  chainId: string,
  accountId: string
): Promise<AdamikAccountState> => {
  const response = await fetch(
    `${process.env.ADAMIK_API_BASE_URL}/api/${chainId}/account/${accountId}/state`,
    {
      method: "GET",
      headers: {
        Authorization: process.env.ADAMIK_API_KEY!,
        "Content-Type": "application/json",
      },
    }
  );

  return await response.json();
};
