# Shielded ID Protocol Specification
## Internet-Draft: draft-shielded-id-protocol-00

**Status**: Standards Track  
**Date**: January 11, 2026  
**Authors**: ShieldedID Protocol Working Group

---

## Table of Contents

1. [Introduction](#introduction)
2. [Terminology](#terminology)
3. [Threat Model](#threat-model)
4. [Protocol Overview](#protocol-overview)
5. [Data Structures](#data-structures)
6. [Proof Generation Algorithm](#proof-generation-algorithm)
7. [Verification Algorithm](#verification-algorithm)
8. [Revocation](#revocation)
9. [Security Considerations](#security-considerations)
10. [Privacy Considerations](#privacy-considerations)
11. [IANA Considerations](#iana-considerations)
12. [References](#references)

---

## 1. Introduction

This document specifies Shielded ID, a privacy-preserving cryptographic protocol for verifying claims about a user without disclosing unnecessary personally identifiable information (PII).

### 1.1 Problem Statement

Traditional identity verification systems require disclosure of sensitive personal attributes (name, date of birth, government ID) to relying parties. This creates privacy risks:

- **Unnecessary Disclosure**: Verifier may only need to verify "age ≥ 18", not actual birthday
- **Linkability**: Same PII used across multiple relying parties enables tracking
- **Data Breaches**: Compromised PII cannot be rotated
- **Regulatory Burden**: GDPR/CCPA force organizations to manage sensitive data

### 1.2 Solution: Zero-Knowledge Proof-Based Verification

Shielded ID enables:

- **Selective Disclosure**: Prove "age ≥ 18" without revealing birth date
- **Unlinkability**: Different proof for each relying party (pairwise subject IDs)
- **Cryptographic Revocation**: User revokes compromised keys, not PII
- **Minimal PII Storage**: Registry holds only public keys and revocation status

### 1.3 Design Principles

1. **Minimal Disclosure**: Prove only what is necessary
2. **Pairwise Subject Identifiers**: Different ID per relying party
3. **User Control**: User revokes credentials, not issuer
4. **Non-Custodial**: No PII in centralized registry
5. **Cryptographic Assurance**: All guarantees from mathematics, not policy

---

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC8174] [RFC2119].

### 2.1 Parties

- **User/Wallet**: Entity holding credentials and generating proofs
- **Issuer/Attester**: Entity performing identity verification (KYC) and issuing credentials
- **Registry**: Non-custodial public key directory
- **Verifier/Relying Party**: Entity requesting proof and verifying claims

### 2.2 Cryptographic Terms

- **Credential**: Signed claim (name, age, KYC level) issued by attester
- **Proof Request (ProofRequest)**: Request for proof of specific claim(s)
- **Proof Response (ProofResponse)**: Zero-knowledge proof + necessary context
- **Pairwise Subject ID**: User identifier, unique per (user, verifier) pair
- **Key ID**: Identifier for a specific credential key version
- **Nonce**: Non-repeating value preventing replay attacks
- **Request ID**: Unique identifier for a proof request

### 2.3 Protocol States

- **ACTIVE**: Key is valid and can generate proofs
- **REVOKED**: User revoked key (cannot be un-revoked)
- **EXPIRED**: Key passed expiration date
- **SUSPENDED**: Issuer temporarily suspended key (recoverable)

---

## 3. Threat Model

### 3.1 Adversaries in Scope

1. **Passive Network Attacker**: Eavesdrops on all messages
   - **Mitigation**: TLS 1.3+ (HTTPS mandatory)

2. **Verifier Linkage Attacker**: Attempts to link proofs from same user
   - **Mitigation**: Pairwise subject IDs + proof randomization

3. **Replay Attack**: Reuses valid proof without freshness check
   - **Mitigation**: Nonce binding + request context binding

4. **Compromised Issuer**: Attester issues fraudulent credentials
   - **Mitigation**: Out-of-band (Issuer reputation is orthogonal to protocol)

5. **Forged Proof**: Attacker generates valid-looking proof without credential
   - **Mitigation**: ECDSA signature verification + non-forge security

6. **Registry Compromise**: Attacker modifies registry entries
   - **Mitigation**: Signatures on all state changes (FUTURE: Blockchain/Merkle Tree)

### 3.2 Adversaries Out of Scope

- **Compromised Wallet Device**: Device compromise is orthogonal (handled by wallet security)
- **Quantum Threat**: Post-quantum readiness in v2.0
- **Social Engineering**: User tricks themselves into signing bad data
- **Issuer Credential Validation**: KYC process is issuer responsibility

### 3.3 Security Goals (S1-S6)

**S1 (Unforgeability)**: Attacker without valid credential cannot create proof that verifies  
**S2 (Unlinkability)**: Verifier cannot determine if two proofs are from same user  
**S3 (No Replay)**: Attacker cannot reuse a proof for different context  
**S4 (Non-Repudiation)**: Proof creator cannot deny generating proof (public key accountability)  
**S5 (Revocation)**: User can revoke key; subsequent proofs fail verification  
**S6 (Key Integrity)**: Registry cannot be secretly modified without detection (future)  

---

## 4. Protocol Overview

### 4.1 Reference Model

```
┌─────────────────┐
│   User Wallet   │  Holds credentials, generates proofs
│  (Encrypted)    │
└────────┬────────┘
         │
         │ 1. Request proof via deep-link/QR
         ▼
┌──────────────────┐
│    Verifier      │  Requests proof of claim(s)
│   Demo/App       │
└────────┬─────────┘
         │
         │ 2. Proof response
         ▼
┌──────────────────┐
│    Registry      │  Checks key revocation status
│   Server        │
└──────────────────┘
         │
         │ 3. Revocation status
         ▼
   [Verification]  Claims verified ✓
```

### 4.2 Message Flow

```
Verifier                          Wallet                    Registry
   │                                │                           │
   ├─ ProofRequest (age ≥ 18) ────→│                           │
   │                                │                           │
   │                ◄── ProofResponse (signature + claim) ──────┤
   │                                │                           │
   ├─ Check Revocation ────────────────────────────────────────→│
   │                                │                           │
   │                ◄─── Revocation Status (ACTIVE) ───────────┤
   │                                │                           │
   └─ Verification Result: VALID ──→│                           │
```

---

## 5. Data Structures

### 5.1 ProofRequest

```json
{
  "requestId": "req-12345-67890",
  "nonce": "base64url_encoded_32_bytes",
  "timestamp": "2026-01-11T12:34:56Z",
  "requestedClaims": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "credentialType": "GOVERNMENT_ID"
    }
  ],
  "context": {
    "origin": "https://verifier.example.com",
    "userAgent": "Mozilla/5.0...",
    "sessionId": "sess-abc-123"
  }
}
```

**Field Definitions**:

- `requestId` (REQUIRED): Unique per request, used for proof binding
- `nonce` (REQUIRED): Random 32 bytes (base64url), MUST NOT repeat within 24 hours
- `timestamp` (REQUIRED): ISO 8601 timestamp, MUST be within ±5 minutes of verifier's clock
- `requestedClaims` (REQUIRED): Array of claims being requested
- `context` (OPTIONAL): Additional context for continuous auth / session binding

### 5.2 ProofResponse

```json
{
  "requestId": "req-12345-67890",
  "keyId": "key-uuid-1234",
  "pairwiseSubjectId": "subject-hash-verifier-specific",
  "claimsVerified": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "proof": "zk_proof_blob_base64url"
    }
  ],
  "signature": "base64url_ecdsa_signature",
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuanceDate": "2026-01-11T12:30:00Z",
  "expirationDate": "2026-01-12T12:30:00Z",
  "assuranceLevel": 2
}
```

**Field Definitions**:

- `requestId` (REQUIRED): MUST match ProofRequest.requestId (prevents CSRF)
- `keyId` (REQUIRED): Which key in registry signed this proof
- `pairwiseSubjectId` (REQUIRED): SHA256(userID || verifierDomain), never changes for that pair
- `claimsVerified` (REQUIRED): Claims proven by this response
- `signature` (REQUIRED): ECDSA(SHA256(canonical_json))
- `algorithm` (REQUIRED): Cryptographic suite identifier, enables algorithm negotiation
- `assuranceLevel` (REQUIRED): 0=unverified, 1=self-asserted, 2=issuer-verified, 3=high-assurance

### 5.3 RegistryKey

```json
{
  "keyId": "key-uuid-1234",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "base64url_x_coordinate",
    "y": "base64url_y_coordinate"
  },
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuerId": "issuer-uuid",
  "issuedAt": "2025-01-11T00:00:00Z",
  "expiresAt": "2027-01-11T00:00:00Z",
  "status": "ACTIVE",
  "revokedAt": null
}
```

### 5.4 RevocationStatus

```json
{
  "keyId": "key-uuid-1234",
  "status": "ACTIVE",
  "revokedAt": null,
  "reason": null,
  "registryTimestamp": "2026-01-11T12:35:00Z",
  "cacheExpiry": "2026-01-11T13:35:00Z"
}
```

---

## 6. Proof Generation Algorithm

### 6.1 Wallet Proof Generation

**Input**:
- `credential`: Signed claim from attester
- `proofRequest`: Request from verifier
- `walletKey`: User's private key

**Output**:
- `proofResponse`: ProofResponse signed with walletKey

**Algorithm**:

```
procedure GenerateProof(credential, proofRequest, walletKey)
  1. Validate proofRequest.timestamp is within ±5 minutes
  2. Validate proofRequest.nonce has not been used (check local cache)
  3. Calculate pairwiseSubjectId = SHA256(userID || verifierOrigin)
  4. For each requestedClaim in proofRequest.requestedClaims:
       - Extract claim from credential
       - Generate zero-knowledge proof (if complex claim)
       - Or include directly (if simple claim like age_over_18)
  5. Construct proofResponse JSON:
       {
         requestId: proofRequest.requestId,
         keyId: walletKey.keyId,
         pairwiseSubjectId: pairwiseSubjectId,
         claimsVerified: [claims],
         algorithm: "ECDSA_P256_SHA256_1.0.0",
         issuanceDate: now(),
         expirationDate: now() + 24 hours,
         assuranceLevel: credential.assuranceLevel
       }
  6. Compute canonicalJSON = CanonicalizeJSON(proofResponse)
  7. Compute digest = SHA256(canonicalJSON)
  8. signature = ECDSA_Sign(digest, walletKey.privateKey)
  9. Add signature to proofResponse
  10. Return proofResponse
end procedure
```

### 6.2 Zero-Knowledge Proof (Age Example)

For claim "AGE_OVER_18":

```
Input: 
  - User's date of birth (secret)
  - Commitment to age (public)
  
Output: 
  - Zero-knowledge proof that age ≥ 18
  
Using: Bulletproofs range proof (Ristretto255)
  - Non-interactive
  - Compact (~800 bytes)
  - Publicly verifiable
```

---

## 7. Verification Algorithm

### 7.1 Verifier Proof Verification

**Input**:
- `proofResponse`: Proof from wallet
- `proofRequest`: Original request
- `registryClient`: Connection to registry

**Output**:
- `verificationResult`: { valid: boolean, reason?: string }

**Algorithm**:

```
procedure VerifyProof(proofResponse, proofRequest, registryClient)
  1. Validate proofResponse.requestId == proofRequest.requestId
     ➜ REJECT if mismatch (CSRF prevention)
  
  2. Validate proofResponse.timestamp within ±5 minutes
     ➜ REJECT if stale (replay prevention)
  
  3. Check nonce freshness: SHA256(proofResponse.nonce) not in cache
     ➜ REJECT if seen before (replay prevention)
  
  4. Retrieve registry key:
       registryKey = registryClient.GetKey(proofResponse.keyId)
     ➜ REJECT if key not found
  
  5. Check key revocation status:
       revocationStatus = registryClient.CheckRevocation(proofResponse.keyId)
     ➜ REJECT if status == REVOKED
  
  6. Validate signature:
       canonicalJSON = CanonicalizeJSON(proofResponse without signature)
       digest = SHA256(canonicalJSON)
       publicKey = ImportPublicKey(registryKey.publicKey)
       isValid = ECDSA_Verify(digest, proofResponse.signature, publicKey)
     ➜ REJECT if isValid == false
  
  7. Validate claims:
       For each claim in proofResponse.claimsVerified:
         - Check claimType matches requestedClaim
         - Verify ZK proof if applicable
       ➜ REJECT if any claim fails
  
  8. Cache nonce:
       nonceCache.Add(SHA256(proofResponse.nonce), expiry=24h)
  
  9. Return VALID with pairwiseSubjectId
end procedure
```

### 7.2 Cryptographic Verification Details

**Signature Verification** (ECDSA P-256):

```
ECDSA_Verify(digest, signature, publicKey):
  1. Parse signature as (r, s) 
  2. Parse publicKey as (Qx, Qy) on secp256r1 curve
  3. Verify using NIST FIPS 186-4 algorithm
  4. Return result (true/false)
```

**Claims Verification** (Age Over N):

```
VerifyAgeOver(claim, zk_proof):
  1. Parse zk_proof as Bulletproof range proof
  2. Verify proof is for age ≥ claim.claimValue
  3. Return result (true/false)
```

---

## 8. Revocation

### 8.1 Revocation Model

User-initiated (non-custodial):

1. User detects compromised private key
2. User calls `revokeKey(keyId)` on registry
3. Registry records revocation timestamp
4. All subsequent proofs with that keyId fail verification

**Properties**:
- **Immediate**: No escrow period
- **Irreversible**: Cannot un-revoke
- **User-Driven**: User has full control

### 8.2 Revocation Endpoint

```
POST /api/revoke/{keyId}

Request:
{
  "keyId": "key-uuid-1234",
  "signature": "ecdsa_sig_proving_knowledge_of_key",
  "reason": "COMPROMISED|USER_INITIATED|LOST_DEVICE"
}

Response:
{
  "keyId": "key-uuid-1234",
  "revokedAt": "2026-01-11T12:40:00Z",
  "status": "REVOKED"
}
```

### 8.3 Revocation Status Freshness

Verifiers MUST:

- Check revocation status before validating proof
- Cache status for ≤ 1 hour (to tolerate registry downtime)
- Fail verification if cache is stale AND registry unavailable
- Implement exponential backoff for registry retries

---

## 9. Security Considerations

### 9.1 Cryptographic Strength

- **Key Size**: P-256 (≈128-bit symmetric strength)
- **Hash**: SHA-256 (≈256-bit preimage resistance)
- **Nonce Size**: 32 bytes (≈2^256 uniqueness guarantee)

**Recommendation**: P-256 is suitable through ~2030. Plan migration to Ed25519 or ECDSA P-384 before 2031.

### 9.2 Nonce Management

**Wallet Responsibilities**:
- MUST generate nonce as cryptographically secure random
- MUST cache used nonces for ≥24 hours
- MUST reject duplicate nonces

**Verifier Responsibilities**:
- MUST verify nonce uniqueness on every proof
- MUST maintain nonce cache (distributed: Redis/memcached)
- MUST implement cache TTL of 24 hours

### 9.3 Clock Skew

Both wallet and verifier MUST:
- Synchronize time to NTP or similar (±5 minute tolerance per spec)
- Reject timestamps outside tolerance window
- Log clock skew incidents for investigation

### 9.4 Key Rotation

Implementers SHOULD:
- Rotate keys annually
- Maintain previous key versions for 30 days post-rotation
- Support multiple active keys per user (for smooth transitions)
- Test migration path before deploying to production

### 9.5 TLS Requirements

- MUST use TLS 1.3+
- MUST use AEAD cipher suite (ChaCha20-Poly1305 or AES-GCM)
- MUST validate certificates (HPKP optional but recommended)
- MUST use HTTPS for all endpoints

### 9.6 Attack Surface Mitigation

| Attack | Mitigation |
|--------|-----------|
| Replay | Nonce binding + request ID binding + timestamp validation |
| Linkage | Pairwise subject IDs + proof randomization |
| Forgery | ECDSA signature verification on all proofs |
| Revocation Bypass | Registry checks BEFORE claim verification |
| Registry Compromise | Registry signing (future: Merkle tree commitments) |
| Metadata Leakage | Minimal audit logs (no PII), no correlation fields |

---

## 10. Privacy Considerations

### 10.1 Information Leakage

**What Registry Learns**:
- Public keys (necessary for verification)
- Revocation timestamps (not linked to user)
- Request counts (can infer usage patterns)

**What Registry Does NOT Learn**:
- User identity
- User claims
- Specific attributes proved
- Which verifiers accessed which keys

**What Verifier Learns**:
- Proof of requested claim (e.g., "age ≥ 18")
- Pairwise subject ID (different per verifier)
- Key ID (to check revocation)

**What Verifier Does NOT Learn** (with ZK proofs):
- Actual age (only binary: over/under threshold)
- Full name
- Other attributes not requested

### 10.2 Linkage Guarantees

**Same Verifier**: Pairwise subject IDs MUST be deterministic and identical across sessions
```
pairwiseSubjectId = SHA256(userID || verifierOrigin)
  (constant for same user + verifier pair)
```

**Different Verifiers**: Pairwise subject IDs MUST be independent
```
verifier1 sees: SHA256(userID || "https://verifier1.com")
verifier2 sees: SHA256(userID || "https://verifier2.com")
  (verifier1 cannot link to verifier2)
```

### 10.3 Metadata Privacy

Implementers MUST:
- Strip PII from all audit logs
- Log only: timestamp, request type, success/failure reason
- NOT log: user identity, claims, IP addresses (GDPR)
- Implement log retention policy (recommend: 90 days)

---

## 11. IANA Considerations

### 11.1 Algorithm Registry

Shielded ID algorithms MUST be registered with IANA:

```
Registry: Shielded ID Algorithm Suite
Algorithm: ECDSA_P256_SHA256_1.0.0
  Reference: This document (Section 5.2)
  Status: Recommended
  
Algorithm: Bulletproofs_Ristretto_1.0.0
  Reference: This document (Section 6.2)
  Status: Experimental
```

### 11.2 Claim Type Registry

```
Registry: Shielded ID Claim Types
Claim: AGE_OVER
  Specification: Proof of age ≥ N (N is parameter)
  Reference: This document
  
Claim: KYC_LEVEL
  Specification: KYC verification level (0-4)
  Reference: This document
```

### 11.3 Error Code Registry

```
Registry: Shielded ID Error Codes
Code: INVALID_SIGNATURE
  Meaning: Proof signature verification failed
  
Code: KEY_REVOKED
  Meaning: Key used in proof has been revoked
```

---

## 12. References

### 12.1 Normative References

- [RFC2104] HMAC: Keyed-Hashing for Message Authentication
- [RFC2119] Key words for use in RFCs to Indicate Requirement Levels
- [RFC3394] NIST AES Key Wrap Algorithm
- [RFC5116] CRYPTOGRAPHIC ALGORITHM INTERFACE AND ALGORITHM IDENTIFIER REGISTRY
- [RFC5234] Augmented BNF for Syntax Specifications
- [RFC6090] FUNDAMENTALS OF ELLIPTIC CURVE CRYPTOGRAPHY
- [RFC6234] US Secure Hash and HMAC
- [RFC8174] Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words
- [RFC8230] Using RSA Algorithms with JOSE and JWT
- [FIPS186-4] Digital Signature Standard (DSS)
- [FIPS198-1] The Keyed-Hash Message Authentication Code (HMAC)
- [SEC2] Recommended Elliptic Curve Domain Parameters

### 12.2 Informative References

- [VC-DATA-MODEL] W3C Verifiable Credentials Data Model 1.1
- [OASIS-PPID] Privacy-Preserving Identity Federation
- [ZKP-SURVEY] Zero-Knowledge Proofs: A Primer
- [BULLETPROOFS] Bulletproofs: Short Proofs for Confidential Transactions and More
- [NIST-CRYPTO] NIST Guidelines for Cryptography

---

## Appendix A: Example Proof Exchange

### Step 1: Verifier Creates Proof Request

```json
{
  "requestId": "req-20260111-001234",
  "nonce": "dGhpcyBpcyBhIHNhbXBsZSBub25jZSBmb3IgdGVzdGluZy4",
  "timestamp": "2026-01-11T12:34:56Z",
  "requestedClaims": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "credentialType": "GOVERNMENT_ID"
    }
  ],
  "context": {
    "origin": "https://demo.example.com"
  }
}
```

### Step 2: Wallet Generates Proof

Wallet signs proof with private key:

```json
{
  "requestId": "req-20260111-001234",
  "keyId": "key-a1b2c3d4",
  "pairwiseSubjectId": "subj-hash-demo-example",
  "claimsVerified": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "proof": "zkproof_base64url"
    }
  ],
  "signature": "MEUCIE...",
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuanceDate": "2026-01-11T12:34:57Z",
  "expirationDate": "2026-01-12T12:34:57Z",
  "assuranceLevel": 2
}
```

### Step 3: Verifier Validates

```
1. ✓ requestId matches
2. ✓ timestamp within ±5 minutes
3. ✓ nonce not in replay cache
4. ✓ key-a1b2c3d4 found in registry
5. ✓ key-a1b2c3d4 status = ACTIVE (not revoked)
6. ✓ signature verifies
7. ✓ claims verify

Result: VALID ✓
```

---

**Status**: This is a draft specification. Comments welcome at [github.com/ShieldedID/protocol-spec](https://github.com/ShieldedID/protocol-spec).
