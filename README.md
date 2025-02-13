# Turnkey Adamik Integration

This project demonstrates how to integrate Turnkey with the Adamik API to perform blockchain transactions across various chains, with a specific implementation for TON blockchain.

## Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn
- A Turnkey account with API credentials
- An Adamik API key

## Installation

1. Clone the repository:

```bash
git clone https://github.com/henri-ly/turnkey-adamik.git
cd turnkey-adamik
```

2. Install dependencies:

```bash
pnpm install
npm install
yarn install
```

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:
You can copy `.env.local.example`

```env
# Turnkey Configuration
API_PUBLIC_KEY="<Turnkey API Public Key (that starts with 02 or 03)>"
API_PRIVATE_KEY="<Turnkey API Private Key>"
BASE_URL="https://api.turnkey.com"
ORGANIZATION_ID="<Turnkey organization ID>"
ADAMIK_API_KEY="<get your API key from adamik.io>"
ADAMIK_API_BASE_URL="https://api.adamik.io"

# For TON Only
TON_ADDRESS="<existing TON address in your organization>"
TON_PUBLIC_KEY="<existing TON pubkey compressed matching your above address in your organization>"
```

## Usage

The project provides two main scripts:

### Generic Chain Transaction

To run the generic chain transaction script:

```bash
npm start
pnpm start
yarn start
```

This script will:

1. List available accounts from your wallet
2. Allow you to select a chain
3. Show current balances
4. Guide you through creating and signing a transaction
5. Broadcast specific transaction

### TON-Specific Transaction

To run the TON-specific transaction script:

```bash
npm run ton
pnpm run ton
yarn run ton
```

This script is specifically designed for TON blockchain transactions and includes:

1. TON address encoding
2. Balance checking
3. Transaction creation and signing
4. Broadcasting to the TON network

## Features

- Multi-chain support through Adamik API
- Transaction encoding and signing using Turnkey
- Balance checking
- Interactive CLI interface
- Amount conversion utilities
- Specific TON blockchain implementation

## Security Notes

- Never commit your `.env.local` file
- Keep your API keys and private keys secure
- Always verify transaction details before broadcasting
