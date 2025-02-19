export enum AdamikCurve {
  SECP256K1 = "secp256k1",
  ED25519 = "ed25519",
  STARK = "stark",
}

export enum AdamikHashFunction {
  SHA256 = "sha256",
  KECCAK256 = "keccak256",
  PEDERSEN = "pedersen",
  SHA512_256 = "sha512_256",
}

export enum AdamikSignatureFormat {
  RS = "rs",
  RSV = "rsv",
}

export type AdamikSignerSpec = {
  curve: AdamikCurve;
  hashFunction: AdamikHashFunction;
  signatureFormat: AdamikSignatureFormat;
  coinType: string;
};

export type AdamikChain = {
  name: string;
  family: string;
  ticker: string;
  decimals: number;
  supportedFeatures: Record<"read" | "write" | "utils", any>;
  signerSpec: AdamikSignerSpec;
};

export type AdamikBalance = {
  balances: {
    native: { available: string; total: string };
    tokens: {
      amount: string;
      token: { id: string; name: string; ticker: string; decimals: number };
    }[];
    staking?: any;
  };
};

export type AdamikTransactionEncodeResponse = {
  chainId: string;
  transaction: {
    data: {
      chainId: string;
      mode: string;
      senderAddress: string;
      recipientAddress: string;
      amount: string;
      memo: string;
      params: any;
    };
    encoded: string;
  };
  status: {
    errors: {
      message: string;
    }[];
  };
};

export type AdamikEncodePubkeyToAddressResponse = {
  chainId: string;
  pubkey: string;
  addresses: {
    type: string;
    address: string;
  }[];
};

export type AdamikAPIError<T> = T & {
  status?: {
    errors: {
      message: string;
    }[];
  };
};
