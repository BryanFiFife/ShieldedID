# Age ZK Proof v1 & KYC ZK Proof v1: Design Note

## Overview
This design implements true zero-knowledge proofs for both age and KYC level verification using Pedersen commitments and Bulletproof range proofs. The verifier learns ONLY whether the proof is valid, not the underlying values.

## Age ZK Proof Format
```
AgeZKProof {
  commitment: Uint8Array(32),        // Pedersen commitment to age
  bulletproof: Uint8Array(672),      // Bulletproof range proof (age >= 18)
  publicInputs: {
    threshold: 18,                   // Fixed threshold
    nonce: string,                   // Anti-replay
    expiry: string,                  // Time bound
    commitmentKey: Uint8Array(32),   // Public commitment parameters
  },
  signature: string                  // ECDSA signature binding proof to wallet
}
```

## KYC ZK Proof Format
```
KycZKProof {
  commitment: Uint8Array(32),        // Pedersen commitment to kyc_level
  bulletproof: Uint8Array(672),      // Bulletproof range proof (kyc_level >= N)
  publicInputs: {
    minLevel: N,                     // Requested minimum KYC level
    nonce: string,                   // Anti-replay
    expiry: string,                  // Time bound
    commitmentKey: Uint8Array(32),   // Public commitment parameters
  },
  signature: string                  // ECDSA signature binding proof to wallet
}
```

## Security Invariants (Both Proofs)
- **Zero-knowledge**: Verifier cannot derive actual values from commitment or proof
- **Soundness**: Invalid proofs (value < threshold) rejected with high probability
- **Binding**: Commitment cryptographically binds to single value
- **Non-replayable**: Bound to nonce + expiry + wallet signature
- **Revocable**: Wallet signature enables revocation checks

## Cryptographic Construction
1. **Commitment**: `C = g^value * h^r` (Pedersen commitment)
2. **Range Proof**: Bulletproof showing `value ∈ [threshold, max]` (max=150 for age, max=5 for KYC)
3. **Signature**: ECDSA over proof hash binds to wallet identity

## Compatibility Modes
- **ZK Mode**: Full zero-knowledge proof (recommended)
- **Legacy Mode**: Signed boolean predicate (backwards compatible)
- **Auto-fallback**: If ZK WASM fails, fall back to legacy mode</content>
<parameter name="filePath">c:\Users\bryan\Desktop\ZKDigitalID\AGE_ZK_PROOF_DESIGN.md