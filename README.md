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
API_PUBLIC_KEY="<Turnkey API Public Key (that starts with 02 or 03)>"
API_PRIVATE_KEY="<Turnkey API Private Key>"
BASE_URL="https://api.turnkey.com"
ORGANIZATION_ID="<Turnkey organization ID>"
WALLET_ID="<Turnkey wallet ID>"
ADAMIK_API_KEY="<get your API key from adamik.io>"
ADAMIK_API_BASE_URL="https://api.adamik.io"


ADAMIK_API_BASE_URL="https://api.adamik.io"
ADAMIK_API_KEY="<get your API key from adamik.io>"

TURNKEY_BASE_URL="https://api.turnkey.com"
TURNKEY_API_PUBLIC_KEY="<Turnkey API Public Key (that starts with 02 or 03)>"
TURNKEY_API_PRIVATE_KEY="<Turnkey API Private Key>"
TURNKEY_ORGANIZATION_ID="<Turnkey organization ID>"
TURNKEY_WALLET_ID="<Turnkey wallet ID>"

SODOT_VERTEX_URL_0="https://vertex-demo-0.sodot.dev"
SODOT_VERTEX_API_KEY_0="<Sodot Vertex API Key 0>"

SODOT_VERTEX_URL_1="https://vertex-demo-1.sodot.dev"
SODOT_VERTEX_API_KEY_1="<Sodot Vertex API Key 1>"

SODOT_VERTEX_URL_2="https://vertex-demo-2.sodot.dev"
SODOT_VERTEX_API_KEY_2="<Sodot Vertex API Key 2>"

SODOT_EXISTING_ECDSA_KEY_IDS="<Sodot existing ECDSA key IDs split with ,>"
SODOT_EXISTING_ED25519_KEY_IDS="<Sodot existing ED25519 key IDs split with ,>"
```

## Usage

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

## Features

- Multi-chain support through Adamik API
- Transaction encoding and signing using Turnkey
- Balance checking
- Interactive CLI interface
- Amount conversion utilities

## Security Notes

- Never commit your `.env.local` file
- Keep your API keys and private keys secure
- Always verify transaction details before broadcasting
