import * as dotenv from "dotenv";
import * as path from "path";
import { broadcastTransaction } from "./adamik/broadcastTransaction";
import { encodePubKeyToAddress } from "./adamik/encodePubkeyToAddress";
import { encodeTransaction } from "./adamik/encodeTransaction";
import { getAccountState } from "./adamik/getAccountState";
import { adamikGetChains } from "./adamik/getChains";
import { signerSelector } from "./signers";
import {
  errorTerminal,
  infoTerminal,
  italicInfoTerminal,
  overridedPrompt,
} from "./utils";
import { displayBalance } from "./utils/displayBalance";
import { transactionDetailView } from "./utils/displayTransaction";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

export const adamikLink = async () => {
  const { startProcess } = await overridedPrompt({
    type: "confirm",
    name: "startProcess",
    message: "Start new signer interaction? (No to exit)",
    initial: true,
  });

  if (!startProcess) {
    infoTerminal("Exiting script. Goodbye!");
    process.exit(0);
  }

  infoTerminal("Getting chains ...", "Adamik");
  const { chains, chainId, signerSpec } = await adamikGetChains();

  if (!chainId) {
    infoTerminal("Chain selection cancelled. Restarting...");
    return;
  }

  infoTerminal("\n========================================");

  const signer = await signerSelector(chainId, signerSpec);

  infoTerminal("========================================");

  infoTerminal(`Getting pubkey ...`, signer.signerName);
  const pubkey = await signer.getPubkey();
  infoTerminal(`Pubkey:`, signer.signerName);
  await italicInfoTerminal(JSON.stringify(pubkey, null, 2));

  if (!pubkey) {
    errorTerminal("Failed to get pubkey from signer", signer.signerName);
    return;
  }

  infoTerminal("========================================");

  infoTerminal(`Encoding pubkey to address ...`, "Adamik");
  const address = await encodePubKeyToAddress(pubkey, chainId);
  infoTerminal(`Address:`, "Adamik");
  await italicInfoTerminal(address);

  infoTerminal("========================================");

  infoTerminal(`Fetching balance ...`, "Adamik");
  const accountState = await getAccountState(chainId, address);
  displayBalance(accountState, chains, chainId);

  infoTerminal("========================================");

  infoTerminal(`We will now prepare an unsigned transaction ...`);

  const { continueTransaction } = await overridedPrompt({
    type: "confirm",
    name: "continueTransaction",
    message: "Do you want to continue? (No to restart)",
    initial: true,
  });

  if (!continueTransaction) {
    infoTerminal("Transaction cancelled. Restarting...");
    return;
  }

  const transactionEncodeResponse = await encodeTransaction({
    chain: chains[chainId],
    senderAddress: address,
    accountState,
  });

  if (!transactionEncodeResponse) {
    errorTerminal("Failed to encode transaction", "Adamik");
    return;
  }

  infoTerminal(
    `${
      transactionEncodeResponse.transaction.data.mode.charAt(0).toUpperCase() +
      transactionEncodeResponse.transaction.data.mode.slice(1)
    } transaction encoded:`,
    "Adamik"
  );
  infoTerminal(`- Chain ID: ${transactionEncodeResponse.chainId}`, "Adamik");
  infoTerminal(`- Transaction data:`, "Adamik");
  await italicInfoTerminal(
    JSON.stringify(transactionEncodeResponse.transaction.data, null, 2)
  );
  infoTerminal(`- Message to sign :`, "Adamik");
  await italicInfoTerminal(
    JSON.stringify(transactionEncodeResponse.transaction.encoded, null, 2)
  );

  infoTerminal("========================================");

  infoTerminal(`We will now sign the transaction ...`);

  infoTerminal(`- Signer spec:\n`, "Adamik");
  await italicInfoTerminal(JSON.stringify(signerSpec, null, 2), 200);

  const { continueSigning } = await overridedPrompt({
    type: "confirm",
    name: "continueSigning",
    message: "Do you want to continue? (No to restart)",
    initial: true,
  });

  if (!continueSigning) {
    infoTerminal("Signature aborted. Restarting...");
    return;
  }

  const { toSign } = await overridedPrompt({
    type: "select",
    name: "toSign",
    message: "Which format do you want to sign with ?",
    choices: transactionEncodeResponse.transaction.encoded.flatMap((encoded) =>
      [
        encoded.hash && {
          title: `Hash (${encoded.hash.format}) : ${encoded.hash.value}`,
          value: encoded.hash.format,
        },
        encoded.raw && {
          title: `Raw (${encoded.raw.format}) : ${encoded.raw.value}`,
          value: encoded.raw.format,
        },
      ].filter(Boolean)
    ),
    initial: transactionEncodeResponse.transaction.encoded[0].hash?.format,
  });

  const isHashPayload = transactionEncodeResponse.transaction.encoded.find(
    (encoded) => encoded.hash?.format === toSign
  )?.hash?.value;

  const isRawPayload = transactionEncodeResponse.transaction.encoded.find(
    (encoded) => encoded.raw?.format === toSign
  )?.raw?.value;

  if (!isHashPayload && !isRawPayload) {
    errorTerminal(`Encoding format ${toSign} doesn't seems to exist`, "Adamik");
    return;
  }

  infoTerminal(
    `Signing ${isHashPayload ? "hash" : "transaction"} with ${toSign} ...`,
    signer.signerName
  );

  const signature = isHashPayload
    ? await signer.signHash(isHashPayload)
    : isRawPayload
    ? await signer.signTransaction(isRawPayload)
    : undefined;

  if (!signature) {
    errorTerminal("Failed to sign transaction", signer.signerName);
    return;
  }

  infoTerminal(`Signature length: ${signature.length}`, signer.signerName);
  infoTerminal(`Signature:`, signer.signerName);
  await italicInfoTerminal(signature, 500);
  infoTerminal("========================================");

  infoTerminal(`Please check the payload that will be broadcasted.`);
  infoTerminal(`Transaction data:`, "Adamik");
  await italicInfoTerminal(
    JSON.stringify(
      {
        ...transactionEncodeResponse,
        signature: signature,
      },
      null,
      2
    )
  );

  const broadcastResponse = await broadcastTransaction(
    chainId,
    transactionEncodeResponse,
    signature
  );

  if (!broadcastResponse) {
    throw new Error("Broadcast aborted");
  }

  if (broadcastResponse.status && broadcastResponse.status.errors.length > 0) {
    errorTerminal("Transaction failed", "Adamik");
    await italicInfoTerminal(JSON.stringify(broadcastResponse, null, 2));
    throw new Error(broadcastResponse.status.errors[0].message);
  }

  infoTerminal("Transaction broadcasted:", "Adamik");
  await italicInfoTerminal(JSON.stringify(broadcastResponse, null, 2));
  infoTerminal("========================================");

  // Add prompt to check transaction details
  const { checkDetails } = await overridedPrompt({
    type: "confirm",
    name: "checkDetails",
    message: "Would you like to check the transaction details?",
    initial: true,
  });

  if (checkDetails && broadcastResponse.hash) {
    await transactionDetailView(broadcastResponse, chains);
  }

  if (process.env.ADAMIK_E2E_TEST) {
    return broadcastResponse;
  }
};
