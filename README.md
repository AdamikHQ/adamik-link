# Adamik Connect

A TypeScript-based CLI tool for interacting with the Adamik blockchain. This tool allows you to perform various operations such as checking balances, encoding transactions, and broadcasting signed transactions using different signing providers.

## Features

- Connect to Adamik blockchain
- Get chain information
- Retrieve account balances (native and tokens)
- Encode and sign transactions
- Broadcast signed transactions
- Support for multiple signing providers:
  - Sodot: A multi-party computation (MPC) based signing solution
  - Turnkey: A institutional-grade wallet infrastructure

## Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn
- Access to at least one of the supported signing providers (Sodot or Turnkey)

## Installation

1. Clone the repository:

```bash
git clone git@github.com:AdamikHQ/adamik-connect.git
cd adamik-connect
```

2. Install dependencies:

```bash
pnpm install
# or
npm install
# or
yarn install
```

## Configuration

1. Copy the example environment file:

```bash
cp .env.local.example .env.local
```

2. Configure your environment variables in `.env.local`:

### Required Base Configuration

```
ADAMIK_API_BASE_URL="https://api.adamik.io"
ADAMIK_API_KEY="<your-adamik-api-key>" # Get your free key on https://dashboard.adamik.io
```

### Signer-specific Configuration

#### For Sodot Signer

```
SODOT_VERTEX_URL_0="https://vertex-demo-0.sodot.dev"
SODOT_VERTEX_API_KEY_0="<sodot-vertex-api-key-0>"
SODOT_VERTEX_URL_1="https://vertex-demo-1.sodot.dev"
SODOT_VERTEX_API_KEY_1="<sodot-vertex-api-key-1>"
SODOT_VERTEX_URL_2="https://vertex-demo-2.sodot.dev"
SODOT_VERTEX_API_KEY_2="<sodot-vertex-api-key-2>"
SODOT_EXISTING_ECDSA_KEY_IDS="<comma-separated-ecdsa-key-ids>"
SODOT_EXISTING_ED25519_KEY_IDS="<comma-separated-ed25519-key-ids>"
```

#### For Turnkey Signer

```
TURNKEY_BASE_URL="https://api.turnkey.com"
TURNKEY_API_PUBLIC_KEY="<turnkey-api-public-key>"
TURNKEY_API_PRIVATE_KEY="<turnkey-api-private-key>"
TURNKEY_ORGANIZATION_ID="<turnkey-organization-id>"
TURNKEY_WALLET_ID="<turnkey-wallet-id>"
```

## Usage

1. Start the CLI tool:

```bash
pnpm start
# or
npm start
# or
yarn start
```

2. Follow the interactive prompts to:
   - Select a chain
   - Choose a signer (Sodot or Turnkey)
   - View account information
   - Create and sign transactions
   - Broadcast transactions to the network

## Supported Signers

- [Sodot](https://www.sodot.dev/)
- [Turnkey](https://www.turnkey.com/)

## Important Notes

- Ensure all required environment variables are properly set in `.env.local` before running the application
- Keep your API keys and private keys secure
- Each signer requires specific configuration - make sure to set up the corresponding variables for your chosen signer
- The application will validate signer configurations before attempting to use them

## Support

For any issues or questions:

- Adamik API issues: Contact Adamik support
- Sodot signer issues: Contact Sodot support
- Turnkey signer issues: Contact Turnkey support
