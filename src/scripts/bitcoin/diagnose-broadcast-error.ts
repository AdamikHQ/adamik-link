#!/usr/bin/env tsx

/**
 * Diagnose Bitcoin Transaction Broadcast Errors
 *
 * This script helps identify common issues that cause Bitcoin transaction broadcast failures,
 * particularly the "non-mandatory-script-verify-flag" error.
 */

import * as bitcoin from "bitcoinjs-lib";

console.log("🩺 BITCOIN TRANSACTION BROADCAST ERROR DIAGNOSIS");
console.log("=".repeat(80));

console.log(`
The error "non-mandatory-script-verify-flag (Signature must be zero for failed CHECK(MULTI)SIG operation)"
typically indicates one of these issues:

1. ❌ SIGNATURE FORMAT PROBLEMS:
   - Signature is not DER-encoded properly
   - Wrong SIGHASH type appended
   - Signature components (r, s) are malformed
   - Recovery ID still present in signature (should be removed)

2. ❌ PUBLIC KEY RECOVERY ISSUES:
   - Wrong hash was signed (single vs double SHA256)
   - Incorrect BIP143 preimage computation
   - Wrong sequence numbers or locktime values
   - Incorrect scriptCode for P2WPKH

3. ❌ TRANSACTION STRUCTURE PROBLEMS:
   - Witness stack not properly formatted
   - Missing or incorrect witness data
   - Wrong script type (not actually P2WPKH)
   - Version or locktime mismatches

4. ❌ IOFINNET-SPECIFIC ISSUES:
   - IoFinnet applied different hashing than expected
   - COSE algorithm mismatch (ES256K vs ESKEC256)
   - Content-type encoding issues
   - Recovery ID interpretation differences

🔍 DEBUGGING STEPS:

Step 1: Use the debug script to verify signature recovery:
   npx tsx src/scripts/bitcoin/debug-signature-issue.ts <psbt_hex> <signature_hex>

Step 2: Check if the signature was created with the correct hash:
   - IoFinnet should receive: SHA256(BIP143_preimage) 
   - IoFinnet should sign: SHA256(SHA256(BIP143_preimage))
   - Verify the BIP143 preimage is computed correctly

Step 3: Verify the DER encoding:
   - Raw ECDSA signature: 64 bytes (r=32, s=32)
   - DER signature: Variable length with proper ASN.1 encoding
   - SIGHASH_ALL (0x01) must be appended

Step 4: Check witness stack format:
   - P2WPKH witness: [<signature>, <pubkey>]
   - Signature: DER + SIGHASH_ALL
   - Public key: 33 bytes compressed

Step 5: Validate against Bitcoin Core rules:
   - Use bitcoin-cli with -testmempool flag
   - Check for any policy violations
   - Verify fee rates and dust limits

🔧 COMMON FIXES:

For IoFinnet signatures:
1. Ensure you send only SHA256(BIP143_preimage) to IoFinnet
2. IoFinnet will apply SHA256 internally (ES256K mode)
3. Recover public key using the double SHA256 hash
4. Convert to DER format before adding to witness

For signature format:
1. Remove recovery ID from IoFinnet signature
2. Use only the first 64 bytes (r + s)
3. Encode as DER with SIGHASH_ALL appended
4. Add compressed public key to witness

For transaction validation:
1. Double-check all BIP143 preimage components
2. Verify sequence numbers match across computation
3. Ensure locktime is consistent
4. Validate output scripts and amounts

📋 CHECKLIST:

□ PSBT parses correctly
□ Signature is 65 bytes (64 + recovery_id)
□ BIP143 preimage computed correctly (182 bytes expected)
□ Single SHA256 hash sent to IoFinnet
□ Double SHA256 used for public key recovery
□ Recovered public key matches expected address
□ Signature validates cryptographically
□ DER encoding applied correctly
□ Witness stack has exactly 2 elements
□ Transaction size is reasonable (< 100KB)
□ Fees are adequate (> dust limit)

If all checks pass but broadcast still fails, the issue might be:
- Network congestion or mempool policies
- RBF (Replace-By-Fee) conflicts
- Double-spend detection
- Node-specific validation rules

Use the debug script for detailed analysis of your specific transaction.
`);

console.log("=".repeat(80));
