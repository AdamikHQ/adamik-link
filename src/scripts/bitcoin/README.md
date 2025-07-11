# Bitcoin Scripts Directory

This directory contains focused, production-ready Bitcoin tools for transaction finalization, signature verification, and PSBT analysis.

## 🚀 **Primary Tool (Production)**

### **`finalizeBitcoinTransaction.ts` ⭐ MAIN TOOL**

Complete solution for finalizing Bitcoin transactions with MPC provider signatures.

```bash
npx tsx src/scripts/bitcoin/finalizeBitcoinTransaction.ts <psbt_hex> <signature_hex>
```

**Features:**

- ✅ Verifies signature cryptographically
- ✅ Recovers and validates public key
- ✅ Confirms address match with PSBT
- ✅ Outputs finalized, broadcast-ready transaction
- ✅ Works with IoFinnet and similar MPC providers

**Example:**

```bash
npx tsx src/scripts/bitcoin/finalizeBitcoinTransaction.ts \
  70736274ff0100710200000001b8a55e998... \
  0xc0357ad12a39e8eb83c29f6f562f07c0...
```

**Output:**

- 🔑 Complete signature verification results
- 📦 Finalized transaction hex (ready for broadcast)
- 📊 Transaction details and outputs

## 🔐 **Development & Analysis Tools**

### **Integration Helper**

- **`extract-signing-inputs.ts`** - Extract exact signing inputs for different MPC providers
  - Shows what data to send to IoFinnet for signing
  - Explains IoFinnet's ES256K and ESKEC256 modes
  - Provides step-by-step integration guidance

### **Analysis Tools**

- **`comprehensive-recovery.ts`** - Complete signature analysis and recovery

  - Tries all recovery IDs and message formats
  - Best tool for debugging unknown signatures
  - Comprehensive approach to find correct public key

- **`extract-pubkeys.ts`** - PSBT public key and address analysis
  - Analyzes all Bitcoin address types (P2WPKH, P2TR, P2SH, etc.)
  - Extracts public key information from PSBTs
  - Useful for understanding PSBT structure

**Usage Examples:**

```bash
# Extract what to send to IoFinnet for signing
npx tsx src/scripts/bitcoin/extract-signing-inputs.ts <psbt_hex>

# Analyze unknown signatures (debugging)
npx tsx src/scripts/bitcoin/comprehensive-recovery.ts <psbt_hex> <signature_hex>

# Extract PSBT information and addresses
npx tsx src/scripts/bitcoin/extract-pubkeys.ts <psbt_hex>
```

## 📋 **IoFinnet Bitcoin Integration Guide**

### **Confirmed Workflow:**

```
1. Generate PSBT (unsigned transaction)
2. Compute BIP143 preimage (182 bytes)
3. Take SINGLE SHA256 of preimage (32 bytes) ← Send this to IoFinnet
4. IoFinnet applies SHA256 internally (ES256K mode)
5. Result: IoFinnet signs the correct BIP143 double SHA256 hash
6. Use finalizeBitcoinTransaction.ts to create final transaction
```

### **Step-by-Step Process:**

1. **Generate PSBT** (unsigned transaction)
2. **Extract signing input**: Use `extract-signing-inputs.ts` to see what to send
3. **Send to IoFinnet**: Send the single SHA256 of BIP143 preimage with ES256K mode
4. **Get signature**: Receive 65-byte ECDSA signature from IoFinnet
5. **Finalize**: Use `finalizeBitcoinTransaction.ts` to create broadcast-ready transaction

## 🚀 **Getting Started**

### **For Production Bitcoin Transactions:**

**Use `finalizeBitcoinTransaction.ts`** - Your complete solution for:

1. Taking unsigned PSBTs and MPC signatures
2. Verifying signature validity and address match
3. Producing broadcast-ready transactions

### **For IoFinnet Integration:**

1. **Understanding**: Use `extract-signing-inputs.ts` to understand what to send
2. **Implementation**: Send single SHA256 of BIP143 preimage to IoFinnet
3. **Debugging**: Use `comprehensive-recovery.ts` if signatures don't validate
4. **Analysis**: Use `extract-pubkeys.ts` to examine PSBT structure

### **For Debugging:**

1. **Unknown Signatures**: Use `comprehensive-recovery.ts` to try all recovery methods
2. **PSBT Issues**: Use `extract-pubkeys.ts` to understand PSBT structure
3. **Integration Issues**: Use `extract-signing-inputs.ts` to verify input format

## ✅ **Verified Results**

**IoFinnet Integration**: ✅ Production-ready and tested  
**Signature Format**: ✅ 65-byte ECDSA with recovery ID  
**Cryptographic Recovery**: ✅ Working with secp256k1  
**BIP143 Implementation**: ✅ Correct double SHA256 flow  
**Address Verification**: ✅ Perfect match with PSBT addresses

## 🔧 **Dependencies**

- `bitcoinjs-lib` - Bitcoin transaction handling
- `secp256k1` - ECDSA public key recovery
- `crypto` - Hash functions (built-in Node.js)

## 📝 **Notes**

- **Production**: Use `finalizeBitcoinTransaction.ts` for real transactions
- **IoFinnet**: Send single SHA256 of BIP143 preimage (ES256K mode)
- **Integration**: Fully tested and verified workflow
- **P2WPKH Only**: Current scripts support P2WPKH (Native SegWit) transactions
- **Recovery ID**: IoFinnet provides 65-byte signatures with recovery ID
