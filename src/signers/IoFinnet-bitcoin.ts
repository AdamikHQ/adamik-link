// NOTE TEMPORARY UTILS TO SIGN BITCOIN INPUTS ONE BY ONE
// BEFORE IO.FINNET HAS PROPER SUPPORT FOR SIGNING A FULL PSBT

import { Psbt, Transaction, payments } from "bitcoinjs-lib";
import { PsbtInput } from "bip174/src/lib/interfaces";

const HARDCODED_IOFINNET_BITCOIN_PUBKEY =
  "034c51543db83b2c177be72788f9272f9d8436cd03d0ef09a0f0f9498e4da14c03";

function finalizeBitcoinPsbt(psbt: Psbt): string {
  psbt.finalizeAllInputs();
  const rawTransaction = psbt.extractTransaction();
  return rawTransaction.toHex();
}

function getHashForSig(
  inputIndex: number,
  input: PsbtInput,
  cache: any
): { script: Buffer; hash: Buffer; sighashType: number } {
  const unsignedTx = cache.__TX;
  const sighashType = input.sighashType || Transaction.SIGHASH_ALL;

  let hash: Buffer;
  let prevout = input.witnessUtxo!;

  const { output: meaningfulScript } = payments.p2pkh({
    hash: prevout.script.slice(2),
  });

  hash = unsignedTx.hashForWitnessV0(
    inputIndex,
    meaningfulScript!,
    prevout.value,
    sighashType
  );

  return {
    script: meaningfulScript!,
    sighashType,
    hash,
  };
}

export {
  getHashForSig,
  finalizeBitcoinPsbt,
  HARDCODED_IOFINNET_BITCOIN_PUBKEY,
};
