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
  NONE = "none",
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
  id: string;
  name: string;
  family: string;
  ticker: string;
  decimals: number;
  supportedFeatures: Record<"read" | "write" | "utils", any>;
  signerSpec: AdamikSignerSpec;
};

export type AdamikToken = {
  type: string;
  id: string;
  name: string;
  ticker: string;
  decimals: string;
  contractAddress?: string;
};

export type StakingPosition = {
  stakeId?: string;
  validatorAddresses: string[];
  amount: string;
  status: "free" | string; // Add other possible status values if known
  completionDate: string;
};

export type StakingReward = {
  validatorAddress: string;
  amount: string;
};

export type TokenStakingReward = {
  token: AdamikToken;
  validatorAddress: string;
  amount: string;
};

export type AdamikAccountState = {
  balances: {
    native: {
      available: string;
      unconfirmed: string;
      total: string;
    };
    tokens: {
      amount: string;
      token: AdamikToken;
    }[];
    staking?: {
      total: string;
      locked: string;
      unlocking: string;
      unlocked: string;
      positions: StakingPosition[];
      rewards?: {
        native: StakingReward[];
        tokens: TokenStakingReward[];
      };
    };
  };
};

export type AdamikTransactionEncodeRequest = {
  transaction: {
    data: {
      mode: string;
      senderAddress: string;
      senderPubKey?: string;
      recipientAddress?: string;
      targetValidatorAddress?: string;
      validatorAddress?: string;
      stakeId?: string;
      tokenId?: string;
      amount?: string;
      useMaxAmount?: boolean;
      memo?: string;
      params?: any;
    };
  };
};

export type AdamikTransactionEncodeResponse = {
  chainId: string;
  transaction: {
    data: {
      mode: string;
      senderAddress: string;
      senderPubKey?: string;
      recipientAddress?: string;
      targetValidatorAddress?: string;
      tokenId?: string;
      amount: string;
      useMaxAmount?: boolean;
      memo?: string;
      params?: any;
    };
    encoded: Array<{
      hash?: { format: string; value: string };
      raw?: { format: string; value: string };
    }>;
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

export type ErrorMsg = {
  message: string;
};

export type Status = {
  errors: ErrorMsg[];
  warnings: ErrorMsg[];
};

export type AdamikAPIError<T> = T & {
  status: Status;
};

export type AdamikTransactionDetails = {
  transaction: {
    parsed?: {
      id: string;
      mode: string;
      tokenId?: string;
      state: string;
      blockHeight?: string;
      timestamp?: number;
      fees: {
        amount: string;
        ticker?: string;
      };
      gas?: string;
      nonce?: string;
      memo?: string;
      senders?: {
        address: string;
        amount: string;
        ticker?: string;
      }[];
      recipients?: {
        address: string;
        amount: string;
        ticker?: string;
      }[];
      validators?: {
        source?: {
          address: string;
          amount: string;
          ticker?: string;
        };
        target?: {
          address: string;
          amount: string;
          ticker?: string;
        };
      };
    };
    raw?: unknown;
  };
  status: Status;
};

export type AdamikBroadcastResponse = {
  chainId: string;
  hash: string;
};
