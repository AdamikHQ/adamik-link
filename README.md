# Adamik Link

A TypeScript-based CLI tool for interacting with Adamik. This tool allows you to perform various operations such as checking balances, encoding transactions, and broadcasting signed transactions using different signing providers.

## Features

- Connect to [Adamik](https://adamik.io)
- Get chain information
- Retrieve account balances (native and tokens)
- Encode and sign transactions
- Broadcast signed transactions
- Support for multiple signing providers:
  - Blockdaemon TSM
  - Dfns
  - Sodot
  - Turnkey

## Prerequisites

- Node.js (v16 or higher recommended)
- pnpm or npm or yarn
- Access to at least one of the supported signing providers (Blockdaemon TSM, Dfns, Sodot, or Turnkey)
- Go (v1.19 or higher) if using Blockdaemon TSM signer

## Installation

1. Clone the repository:

```bash
git clone git@github.com:AdamikHQ/adamik-link.git
cd adamik-link
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

#### For Blockdaemon TSM Signer

**Option 1: Using Certificate Files**

```
# Certificate files (obtain from Blockdaemon)
BLOCKDAEMON_CLIENT_CERT_PATH="/path/to/your/client.crt"
BLOCKDAEMON_CLIENT_KEY_PATH="/path/to/your/client.key"
BLOCKDAEMON_EXISTING_KEY_IDS="<comma-separated-key-ids>"  # Optional: reuse existing keys
```

**Option 2: Using Certificate Content Directly**

```
# Certificate content directly in environment variables (more secure for some deployments)
BLOCKDAEMON_CLIENT_CERT_CONTENT="-----BEGIN CERTIFICATE-----
your-certificate-content-here
-----END CERTIFICATE-----"
BLOCKDAEMON_CLIENT_KEY_CONTENT="-----BEGIN EC PRIVATE KEY-----
your-private-key-content-here
-----END EC PRIVATE KEY-----"
BLOCKDAEMON_EXISTING_KEY_IDS="<comma-separated-key-ids>"  # Optional: reuse existing keys
```

**Note**: You can mix both approaches (e.g., use file for certificate and content for key). Certificate content will take precedence over file paths if both are provided.

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

#### For Dfns Signer

```
DFNS_CRED_ID="<Dfns-Credential-ID>"
DFNS_PRIVATE_KEY="<Dfns-Private-Key>"
DFNS_APP_ID="<Dfns-App-ID>"
DFNS_AUTH_TOKEN="<Dfns-Auth-Token>"
DFNS_API_URL="<Dfns-API-URL>"
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
   - Choose a signer (Blockdaemon TSM, Dfns, Sodot, or Turnkey)
   - View account information
   - Create and sign transactions
   - Broadcast transactions to the network

## Supported Signers

- [Blockdaemon TSM](https://www.blockdaemon.com/) - Threshold Signature Method with distributed key management
- [Dfns](https://www.dfns.co/)
- [Sodot](https://www.sodot.dev/)
- [Turnkey](https://www.turnkey.com/)
- Local Mnemonic (Development Only)

### ⚠️ Local Mnemonic Signer

```env
UNSECURE_LOCAL_SEED="A 24 WORDS MNEMONIC PHRASE"
```

**WARNING: The Local Mnemonic signer is for development and testing purposes only!**

This signer allows you to use a BIP39 mnemonic phrase directly for signing transactions. While convenient for development, it is **NOT SECURE** for production use because:

- The mnemonic is stored in plain text in your environment file
- There is no hardware security module (HSM) protection
- Your private keys are exposed in the application's memory

For production environments, always use one of the secure signing providers listed above (Blockdaemon TSM, Dfns, Sodot, or Turnkey).

## Important Notes

- Ensure all required environment variables are properly set in `.env.local` before running the application
- Keep your API keys and private keys secure
- Each signer requires specific configuration - make sure to set up the corresponding variables for your chosen signer
- The application will validate signer configurations before attempting to use them

## Support

For any issues or questions:

- Adamik API issues: Contact Adamik support
- Dfns signer issues: Contact Dfns support
- Sodot signer issues: Contact Sodot support
- Turnkey signer issues: Contact Turnkey support
