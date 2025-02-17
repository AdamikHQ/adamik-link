import { Turnkey } from "@turnkey/sdk-server";
import * as dotenv from "dotenv";
import * as path from "path";
import { adamikBroadcastTransaction } from "./adamikBroadcastTransaction";
import { adamikEncodeTransaction } from "./adamikEncodeTransaction";
import { adamikFetchBalance } from "./adamikFetchBalance";
import { adamikGetChains } from "./adamikGetChains";
import { signerGetAccounts } from "./signerGetAccount";
import { signerSignTransaction } from "./signerSignTransaction";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const turnkeyClient = new Turnkey({
    apiBaseUrl: process.env.BASE_URL!,
    apiPublicKey: process.env.API_PUBLIC_KEY!,
    apiPrivateKey: process.env.API_PRIVATE_KEY!,
    defaultOrganizationId: process.env.ORGANIZATION_ID!,
  });

  const { accountId, pubKey, selectedAccount } = await signerGetAccounts(
    turnkeyClient
  );

  const { chains, chainId } = await adamikGetChains(selectedAccount, pubKey);

  console.log(
    "We do not check if your wallet support the chosen chain so be careful, be sure to have the right wallet for the right chains"
  );

  const balance = await adamikFetchBalance(chainId, accountId, chains);

  const transactionEncodeResponse = await adamikEncodeTransaction(
    chainId,
    accountId,
    chains,
    balance
  );

  const { signature } = await signerSignTransaction(
    turnkeyClient,
    transactionEncodeResponse,
    chains,
    chainId,
    accountId
  );

  console.log("SUMMARY :");
  console.log(`- Sender : ${accountId}`);
  console.log(
    `- Recipient : ${transactionEncodeResponse.transaction.data.recipientAddress}`
  );
  console.log(
    `- Amount : ${transactionEncodeResponse.transaction.data.amount} ${chains[chainId].ticker}`
  );
  console.log(`- Chain : ${chains[chainId].name}`);

  await adamikBroadcastTransaction(
    chainId,
    transactionEncodeResponse,
    signature
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
