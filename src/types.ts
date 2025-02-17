export type SignerSpecs = {
  curve: string;
  hashFunction: "sha256" | "keccak256" | "pedersen" | "sha512_256";
  signatureFormat: string[];
  derivationPath: string;
  addressFormat: string;
};

export type Account = {
  path: string;
  address: string;
  curve: string;
  addressFormat: string;
};

export type Chain = {
  name: string;
  family: string;
  ticker: string;
  decimals: number;
  supportedFeatures: Record<"read" | "write" | "utils", any>;
  signerSpecs: SignerSpecs;
};

export type Balance = {
  balances: {
    native: { available: string; total: string };
    tokens: {
      amount: string;
      token: { id: string; name: string; ticker: string; decimals: number };
    }[];
    staking?: any;
  };
};

export type TransactionEncodeResponse = {
  chaindId: string;
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
