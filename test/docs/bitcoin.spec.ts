import * as ecc from "@bitcoinerlab/secp256k1";
import BIP32Factory from "bip32";
import * as bip39 from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { expect } from "chai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);

// Replace with your wallet's mnemonic phrase
const mnemonic = process.env.UNSECURE_LOCAL_SEED || "";

// Fill in your derivation path for Taproot (BIP-86)
// This script is setup as if this account has 1 simple UTXO of more than 100000 sats
const derivationPath = `m/86'/0'/0'/0/0`;
const recipientAddress = ""; // recipient of your choice, sender if none
const ADAMIK_API_KEY = process.env.ADAMIK_API_KEY || ""; // Adamik API key
const ADAMIK_API_BASE_URL =
  process.env.ADAMIK_API_BASE_URL || "https://api.adamik.io";
const chainId = "bitcoin";

describe("Bitcoin with Adamik", () => {
  it.skip("should encode a transaction and broadcast it", async () => {
    // Create wallet using mnemonic phrase
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const rootKey = bip32.fromSeed(seed);
    const childNode = rootKey.derivePath(derivationPath);
    const internalPubkey = toXOnly(Buffer.from(childNode.publicKey));
    const { address } = bitcoin.payments.p2tr({
      internalPubkey,
    });

    console.log("public address of sender:", address);

    const chainInfo = await fetch(
      `${ADAMIK_API_BASE_URL}/api/chains/${chainId}`,
      {
        method: "GET",
        headers: {
          Authorization: ADAMIK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const chainInfoData = await chainInfo.json();

    const decimals = chainInfoData.chain.decimals;
    const ticker = chainInfoData.chain.ticker;
    console.log("Decimals:", decimals);

    const balanceRequest = await fetch(
      `${ADAMIK_API_BASE_URL}/api/${chainId}/account/${address}/state`,
      {
        method: "GET",
        headers: {
          Authorization: ADAMIK_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const balanceData = await balanceRequest.json();

    const balance = balanceData.balances.native.available;

    console.log("SenderAddress :", address);
    console.log("Balance:", balance);
    console.log(
      `[BALANCE] [${chainId}] ${address} : ${(
        Number(balance) / Math.pow(10, decimals)
      ).toString()} ${ticker}`
    );

    // Prepare the transaction request
    const requestBody = {
      transaction: {
        data: {
          chainId: "bitcoin", // Target Bitcoin
          mode: "transfer", // Simple tx
          sender: address,
          recipient: recipientAddress || address,
          amount: "10", // Transaction amount in satoshis
        },
      },
    };

    // Encode the transaction with Adamik API
    const responseEncode = await fetch(
      `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/encode`,
      {
        method: "POST",
        headers: {
          Authorization: ADAMIK_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const encodedData = await responseEncode.json();
    console.log(
      "encodedData:",
      "\x1b[32m" + JSON.stringify(encodedData, null, 2) + "\x1b[0m"
    );
    const rawtx = encodedData.transaction.encoded;

    // Create and sign the PSBT (Partially Signed Bitcoin Transaction)
    const psbt = bitcoin.Psbt.fromHex(rawtx);
    psbt.updateInput(0, {
      tapInternalKey: internalPubkey,
    });

    const tweakedChildNode = childNode.tweak(
      bitcoin.crypto.taggedHash("TapTweak", internalPubkey)
    );
    // @ts-ignore
    psbt.signTaprootInput(0, tweakedChildNode);

    psbt.finalizeAllInputs();
    const signedTransaction = psbt.extractTransaction().toHex();

    // Prepare to broadcast the signed transaction
    const sendTransactionBody = {
      transaction: {
        data: encodedData.transaction.data,
        encoded: encodedData.transaction.encoded,
        signature: signedTransaction,
      },
    };

    // Broadcast the transaction using Adamik API
    const responseBroadcast = await fetch(
      `${ADAMIK_API_BASE_URL}/api/${chainId}/transaction/broadcast`,
      {
        method: "POST",
        headers: {
          Authorization: ADAMIK_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendTransactionBody),
      }
    );

    const responseData = await responseBroadcast.json();
    console.log(
      "Transaction Result:",
      "\x1b[32m" + JSON.stringify(responseData) + "\x1b[0m"
    );

    expect(responseData.hash).to.exist;
  });
});
