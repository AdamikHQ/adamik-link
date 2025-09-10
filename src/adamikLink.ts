import * as dotenv from "dotenv";
import * as path from "path";
import { broadcastTransaction } from "./adamik/broadcastTransaction";
import { encodePubKeyToAddress } from "./adamik/encodePubkeyToAddress";
import { encodeTransaction } from "./adamik/encodeTransaction";
import { getAccountState } from "./adamik/getAccountState";
import { adamikGetChains } from "./adamik/getChains";
import { signerSelector, Signer } from "./signers";
import { errorTerminal, infoTerminal, italicInfoTerminal, overridedPrompt } from "./utils";
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

  let address: string;
  let pubkey: string | undefined = undefined;

  // Always use the same flow for all signers and chains:
  // 1. Get pubkey from signer
  // 2. Convert pubkey to address via Adamik API (no fallback)
  infoTerminal(`Getting pubkey from signer...`, signer.signerName);
  pubkey = await signer.getPubkey();
  
  if (!pubkey) {
    errorTerminal("Failed to get pubkey from signer", signer.signerName);
    throw new Error("Cannot continue without public key");
  }
  
  infoTerminal(`Pubkey:`, signer.signerName);
  await italicInfoTerminal(JSON.stringify(pubkey, null, 2));

  infoTerminal("========================================");

  infoTerminal(`Encoding pubkey to address ...`, "Adamik");
  try {
    address = await encodePubKeyToAddress(pubkey, chainId);
    infoTerminal(`Address:`, "Adamik");
    await italicInfoTerminal(address);
  } catch (error) {
    errorTerminal(`Failed to encode address from pubkey: ${error}`, "Adamik");
    throw new Error("Cannot convert public key to address via Adamik API");
  }

  infoTerminal("========================================");

  infoTerminal(`Fetching balance ...`, "Adamik");
  const accountState = await getAccountState(chainId, address);
  displayBalance(accountState, chains, chainId);

  if (accountState.balances.native.available === "0") {
    errorTerminal("Insufficient balance", "Adamik");
    throw new Error(`Balance is 0 for : ${address}`);
  }

  infoTerminal("========================================");

  infoTerminal(`We will now prepare an unsigned transaction ...`);

  let continueTransaction;
  try {
    const result = await overridedPrompt({
      type: "confirm",
      name: "continueTransaction",
      message: "Do you want to continue? (No to restart)",
      initial: true,
    });
    continueTransaction = result.continueTransaction;
  } catch (error) {
    continueTransaction = true;
  }

  if (!continueTransaction) {
    infoTerminal("Transaction cancelled. Restarting...");
    return { chains, chainId, accountState, address };
  }

  const transactionEncodeResponse = await encodeTransaction({
    chain: chains[chainId],
    senderAddress: address,
    senderPubKey: pubkey,
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
  await italicInfoTerminal(JSON.stringify(transactionEncodeResponse.transaction.data, null, 2));
  infoTerminal(`- Message to sign :`, "Adamik");
  await italicInfoTerminal(JSON.stringify(transactionEncodeResponse.transaction.encoded, null, 2));

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

  // For IoFinnet signer, automatically use raw format (they apply hashing internally)
  let toSign: string;
  let isHashPayload: string | undefined;
  let isRawPayload: string | undefined;

  if (signer.signerName === Signer.IOFINNET) {
    // IoFinnet only supports raw transactions, not pre-hashed values
    const rawEncoded = transactionEncodeResponse.transaction.encoded.find(
      (encoded) => encoded?.raw
    );
    
    if (!rawEncoded?.raw) {
      errorTerminal("No raw transaction format available for IoFinnet", "Adamik");
      throw new Error("IoFinnet requires raw transaction format");
    }
    
    toSign = rawEncoded.raw.format;
    isRawPayload = rawEncoded.raw.value;
    
    infoTerminal(`Using raw transaction format for IoFinnet (${toSign})`, signer.signerName);
  } else {
    // For other signers, let the user choose
    const choices = transactionEncodeResponse.transaction.encoded.reduce((acc, encoded, index) => {
      try {
        if (encoded?.hash) {
          acc.push({
            title: `Hash (${encoded.hash.format}) : ${encoded.hash.value}`,
            value: encoded.hash.format,
          });
        }
        if (encoded?.raw) {
          acc.push({
            title: `Raw (${encoded.raw.format}) : ${encoded.raw.value}`,
            value: encoded.raw.format,
          });
        }
      } catch (error) {
        // Skip invalid encoded objects
      }
      return acc;
    }, [] as { title: string; value: string }[]);

    if (choices.length === 0) {
      errorTerminal("No valid signing choices found", "Adamik");
      throw new Error("No valid signing formats available");
    }

    const { toSign: selectedFormat } = await overridedPrompt({
      type: "select",
      name: "toSign",
      message: "Which format do you want to sign with ?",
      choices,
    });
    
    toSign = selectedFormat;

    isHashPayload = transactionEncodeResponse.transaction.encoded.find(
      (encoded) => encoded.hash?.format === toSign
    )?.hash?.value;

    isRawPayload = transactionEncodeResponse.transaction.encoded.find(
      (encoded) => encoded.raw?.format === toSign
    )?.raw?.value;
  }

  if (!isHashPayload && !isRawPayload) {
    errorTerminal(`Encoding format ${toSign} doesn't seems to exist`, "Adamik");
    return;
  }

  infoTerminal(`Signing ${isHashPayload ? "hash" : "transaction"} with ${toSign}...`, signer.signerName);

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

  const broadcastResponse = await broadcastTransaction(chainId, transactionEncodeResponse, signature);

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
