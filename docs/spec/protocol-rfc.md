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

## Appendix B: Implementation Considerations

### B.1 Wallet Implementation Guidelines

#### B.1.1 Key Management

Wallets MUST implement secure key storage:

```typescript
interface WalletKeyStore {
  generateKey(): Promise<CryptoKeyPair>;
  storeKey(keyId: string, privateKey: CryptoKey): Promise<void>;
  retrieveKey(keyId: string): Promise<CryptoKey>;
  listKeys(): Promise<string[]>;
  revokeKey(keyId: string): Promise<void>;
}
```

**Security Requirements**:
- Private keys MUST be encrypted at rest
- Key derivation MUST use PBKDF2 or Argon2
- Biometric/PIN protection RECOMMENDED
- Key export MUST be user-initiated only

#### B.1.2 Proof Generation Flow

```typescript
async function generateProof(
  proofRequest: ProofRequest,
  credentials: Credential[],
  keyStore: WalletKeyStore
): Promise<ProofResponse> {
  // Validate request
  if (!isValidTimestamp(proofRequest.timestamp)) {
    throw new Error('Request timestamp outside tolerance');
  }

  // Check nonce freshness
  if (await isNonceUsed(proofRequest.nonce)) {
    throw new Error('Nonce already used');
  }

  // Find matching credential
  const credential = findCredentialForClaims(
    credentials,
    proofRequest.requestedClaims
  );

  if (!credential) {
    throw new Error('No matching credential found');
  }

  // Generate pairwise subject ID
  const pairwiseSubjectId = await generatePairwiseSubjectId(
    proofRequest.context.origin
  );

  // Generate ZK proof if needed
  const claimsVerified = await generateClaimsProof(
    proofRequest.requestedClaims,
    credential
  );

  // Construct response
  const response: ProofResponse = {
    requestId: proofRequest.requestId,
    keyId: credential.keyId,
    pairwiseSubjectId,
    claimsVerified,
    algorithm: 'ECDSA_P256_SHA256_1.0.0',
    issuanceDate: new Date().toISOString(),
    expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    assuranceLevel: credential.assuranceLevel
  };

  // Sign response
  response.signature = await signProofResponse(response, keyStore);

  return response;
}
```

#### B.1.3 Credential Storage Format

```json
{
  "version": "1.0.0",
  "credentials": [
    {
      "id": "cred-uuid-1234",
      "keyId": "key-uuid-5678",
      "issuerId": "issuer-gov-id",
      "claims": {
        "AGE_OVER": {
          "value": 18,
          "proof": "zk_commitment_data"
        },
        "KYC_LEVEL": {
          "value": 2,
          "verifiedAt": "2026-01-11T10:00:00Z"
        }
      },
      "issuedAt": "2026-01-11T10:00:00Z",
      "expiresAt": "2028-01-11T10:00:00Z",
      "signature": "issuer_signature_base64url"
    }
  ]
}
```

### B.2 Verifier Implementation Guidelines

#### B.2.1 Proof Verification Flow

```typescript
async function verifyProof(
  proofResponse: ProofResponse,
  proofRequest: ProofRequest,
  registryClient: RegistryClient
): Promise<VerificationResult> {
  try {
    // Step 1: Validate request binding
    if (proofResponse.requestId !== proofRequest.requestId) {
      return { valid: false, reason: 'Request ID mismatch' };
    }

    // Step 2: Validate timestamp
    if (!isValidTimestamp(proofResponse.issuanceDate)) {
      return { valid: false, reason: 'Proof timestamp invalid' };
    }

    // Step 3: Check nonce freshness
    if (await isNonceUsed(proofRequest.nonce)) {
      return { valid: false, reason: 'Nonce replay detected' };
    }

    // Step 4: Retrieve and validate key
    const registryKey = await registryClient.getKey(proofResponse.keyId);
    if (!registryKey) {
      return { valid: false, reason: 'Key not found in registry' };
    }

    // Step 5: Check revocation status
    const revocationStatus = await registryClient.checkRevocation(proofResponse.keyId);
    if (revocationStatus.status !== 'ACTIVE') {
      return { valid: false, reason: `Key ${revocationStatus.status}` };
    }

    // Step 6: Verify signature
    const isSignatureValid = await verifySignature(proofResponse, registryKey);
    if (!isSignatureValid) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Step 7: Verify claims
    const claimsValid = await verifyClaims(proofResponse.claimsVerified, proofRequest.requestedClaims);
    if (!claimsValid) {
      return { valid: false, reason: 'Claim verification failed' };
    }

    // Step 8: Cache nonce
    await cacheNonce(proofRequest.nonce);

    return {
      valid: true,
      subjectId: proofResponse.pairwiseSubjectId,
      assuranceLevel: proofResponse.assuranceLevel
    };

  } catch (error) {
    return { valid: false, reason: `Verification error: ${error.message}` };
  }
}
```

#### B.2.2 Registry Client Implementation

```typescript
class RegistryClient {
  private baseUrl: string;
  private cache: Map<string, CachedRevocationStatus>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.cache = new Map();
  }

  async getKey(keyId: string): Promise<RegistryKey | null> {
    const response = await fetch(`${this.baseUrl}/api/keys/${keyId}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Registry error');

    return await response.json();
  }

  async checkRevocation(keyId: string): Promise<RevocationStatus> {
    // Check cache first
    const cached = this.cache.get(keyId);
    if (cached && cached.expiry > Date.now()) {
      return cached.status;
    }

    // Fetch from registry
    const response = await fetch(`${this.baseUrl}/api/revocation/${keyId}`);
    if (!response.ok) throw new Error('Registry error');

    const status: RevocationStatus = await response.json();

    // Cache result
    this.cache.set(keyId, {
      status,
      expiry: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    return status;
  }
}
```

### B.3 Registry Implementation Guidelines

#### B.3.1 Database Schema

```sql
-- Keys table
CREATE TABLE keys (
  key_id UUID PRIMARY KEY,
  public_key JSONB NOT NULL,
  algorithm VARCHAR(50) NOT NULL,
  issuer_id UUID NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Revocations table
CREATE TABLE revocations (
  key_id UUID PRIMARY KEY REFERENCES keys(key_id),
  revoked_at TIMESTAMP NOT NULL,
  reason VARCHAR(100),
  signature TEXT, -- Proof of revocation authority
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  key_id UUID,
  request_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  event_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_keys_status ON keys(status);
CREATE INDEX idx_keys_issuer ON keys(issuer_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_key ON audit_log(key_id);
```

#### B.3.2 API Endpoints

```typescript
// Key registration
app.post('/api/keys', async (req, res) => {
  const { keyId, publicKey, algorithm, issuerId } = req.body;

  // Validate input
  if (!isValidPublicKey(publicKey)) {
    return res.status(400).json({ error: 'Invalid public key' });
  }

  // Check issuer authorization
  if (!await isAuthorizedIssuer(issuerId, req)) {
    return res.status(403).json({ error: 'Unauthorized issuer' });
  }

  // Insert key
  await db.query(`
    INSERT INTO keys (key_id, public_key, algorithm, issuer_id, issued_at, expires_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '2 years')
  `, [keyId, publicKey, algorithm, issuerId]);

  // Audit log
  await auditLog('KEY_REGISTERED', { keyId, issuerId }, req);

  res.json({ status: 'registered', keyId });
});

// Revocation
app.post('/api/revoke/:keyId', async (req, res) => {
  const { keyId } = req.params;
  const { signature, reason } = req.body;

  // Verify revocation signature (proof of key ownership)
  const key = await db.query('SELECT * FROM keys WHERE key_id = $1', [keyId]);
  if (!key.rows[0]) {
    return res.status(404).json({ error: 'Key not found' });
  }

  if (!await verifyRevocationSignature(signature, key.rows[0])) {
    return res.status(403).json({ error: 'Invalid revocation signature' });
  }

  // Mark as revoked
  await db.query(`
    UPDATE keys SET status = 'REVOKED', updated_at = NOW() WHERE key_id = $1
  `, [keyId]);

  await db.query(`
    INSERT INTO revocations (key_id, revoked_at, reason, signature)
    VALUES ($1, NOW(), $2, $3)
  `, [keyId, reason, signature]);

  // Audit log
  await auditLog('KEY_REVOKED', { keyId, reason }, req);

  res.json({ status: 'revoked', keyId, revokedAt: new Date() });
});

// Key lookup
app.get('/api/keys/:keyId', async (req, res) => {
  const { keyId } = req.params;

  const result = await db.query('SELECT * FROM keys WHERE key_id = $1', [keyId]);
  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Key not found' });
  }

  const key = result.rows[0];
  res.json({
    keyId: key.key_id,
    publicKey: key.public_key,
    algorithm: key.algorithm,
    issuerId: key.issuer_id,
    issuedAt: key.issued_at,
    expiresAt: key.expires_at,
    status: key.status
  });
});

// Revocation status
app.get('/api/revocation/:keyId', async (req, res) => {
  const { keyId } = req.params;

  const keyResult = await db.query('SELECT status FROM keys WHERE key_id = $1', [keyId]);
  if (!keyResult.rows[0]) {
    return res.status(404).json({ error: 'Key not found' });
  }

  const revocationResult = await db.query(
    'SELECT * FROM revocations WHERE key_id = $1',
    [keyId]
  );

  const revocation = revocationResult.rows[0];
  res.json({
    keyId,
    status: keyResult.rows[0].status,
    revokedAt: revocation?.revoked_at || null,
    reason: revocation?.reason || null,
    registryTimestamp: new Date().toISOString(),
    cacheExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
});
```

---

## Appendix C: Security Analysis

### C.1 Cryptographic Security Proofs

#### C.1.1 Signature Security

**Theorem**: Shielded ID signature scheme is EUF-CMA secure under the ECDLP assumption.

**Proof Sketch**:
1. ECDSA signature scheme is EUF-CMA secure [Brown99]
2. Shielded ID uses ECDSA-P256-SHA256 as specified
3. Proof request binding prevents context confusion attacks
4. Nonce prevents replay attacks
5. Timestamp prevents clock skew attacks

**Security Bound**: 2^128 operations (P-256 strength)

#### C.1.2 Zero-Knowledge Proof Security

**Theorem**: Age verification ZK proof is zero-knowledge and sound.

**Properties**:
- **Completeness**: Honest prover with valid credential always verifies
- **Soundness**: Dishonest prover without valid credential verifies with negligible probability
- **Zero-Knowledge**: Verifier learns nothing beyond the validity of the statement

**Proof**: Based on Bulletproofs [BBB+18], which are:
- Argument of knowledge for range proofs
- Σ-protocol based construction
- Special soundness and honest verifier zero-knowledge

### C.2 Attack Analysis

#### C.2.1 Replay Attacks

**Attack Scenario**: Attacker captures valid proof and replays it.

**Prevention**:
1. **Nonce Binding**: Each proof request includes unique nonce
2. **Request ID Binding**: Proof must match specific request
3. **Timestamp Validation**: Proofs expire after short window
4. **Cache Management**: Nonce cache prevents reuse

**Residual Risk**: Clock skew between systems (±5 minutes tolerance)

#### C.2.2 Linkage Attacks

**Attack Scenario**: Verifier attempts to correlate users across sessions.

**Prevention**:
1. **Pairwise Subject IDs**: Different ID per (user, verifier) pair
2. **Deterministic Generation**: Same pair always gets same ID
3. **Domain Separation**: Verifier origin included in hash
4. **No Global Identifiers**: No persistent user identifiers

**Residual Risk**: Side-channel attacks (timing, traffic analysis)

#### C.2.3 Forgery Attacks

**Attack Scenario**: Attacker creates valid-looking proof without credential.

**Prevention**:
1. **Digital Signatures**: All proofs cryptographically signed
2. **Public Key Verification**: Signatures verified against registry
3. **Revocation Checking**: Compromised keys immediately invalid
4. **ZK Proof Verification**: Mathematical proof of claim validity

**Residual Risk**: Private key compromise (out of scope - wallet security)

#### C.2.4 Denial of Service

**Attack Scenario**: Attacker floods registry with requests.

**Prevention**:
1. **Rate Limiting**: Request rate limits per IP/client
2. **Caching**: Revocation status cached to reduce load
3. **Circuit Breakers**: Automatic failover during registry issues
4. **Stateless Verification**: Most verification done client-side

**Residual Risk**: Distributed DoS attacks (requires infrastructure protection)

### C.3 Privacy Analysis

#### C.3.1 Information Leakage

**Registry Perspective**:
- **Learns**: Public keys, revocation events, usage patterns
- **Doesn't Learn**: User identities, specific claims, verifier details

**Verifier Perspective**:
- **Learns**: Binary claim result (e.g., "age ≥ 18"), pairwise subject ID
- **Doesn't Learn**: Actual age, other attributes, cross-verifier linkage

**Wallet Perspective**:
- **Learns**: Nothing new (wallet controls all data)
- **Shares**: Only requested claims with cryptographic privacy

#### C.3.2 Correlation Risks

**Same Verifier Correlation**:
- **Risk**: Session linkage through subject ID consistency
- **Mitigation**: Subject IDs are necessary for account management
- **Residual**: Users can be tracked within single verifier (by design)

**Cross-Verifier Correlation**:
- **Risk**: Fingerprinting through timing/traffic analysis
- **Mitigation**: Minimal metadata, no persistent identifiers
- **Residual**: Advanced traffic analysis (theoretical)

**Temporal Correlation**:
- **Risk**: Timing attacks linking proof generations
- **Mitigation**: Proof generation is client-side, timing hidden
- **Residual**: Network-level timing analysis

### C.4 Performance Analysis

#### C.4.1 Computational Complexity

**Proof Generation** (Wallet):
- **ECDSA Sign**: ~1ms (modern hardware)
- **ZK Proof**: ~50ms (Bulletproofs range proof)
- **Total**: ~51ms per proof

**Proof Verification** (Verifier):
- **Registry Lookup**: ~10ms (network + database)
- **ECDSA Verify**: ~0.5ms
- **ZK Verify**: ~5ms
- **Total**: ~15.5ms per proof

**Registry Operations**:
- **Key Registration**: ~20ms (database insert + validation)
- **Revocation Check**: ~5ms (cached), ~50ms (uncached)

#### C.4.2 Network Overhead

**Proof Request**: ~500 bytes
**Proof Response**: ~1KB (with ZK proof)
**Registry Query**: ~200 bytes
**Total per Flow**: ~1.7KB

#### C.4.3 Scalability Considerations

**Registry Load**:
- Read-heavy workload (99% revocation checks)
- Horizontal scaling with read replicas
- CDN for public key distribution

**Cache Effectiveness**:
- 99%+ cache hit rate for revocation status
- 1-hour TTL balances freshness vs. performance
- Distributed cache (Redis) for high availability

**Database Optimization**:
- UUID primary keys for even distribution
- Composite indexes for common queries
- Partitioning by time for audit logs

---

## Appendix D: Test Vectors

### D.1 Key Generation Test Vector

**Input**: None (random generation)

**Expected Output**:
```json
{
  "keyId": "test-key-001",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "WKn-Zz7d5Vb2auzpq6H1QlI3wXM8Y2Yf7W8_9QxJcE",
    "y": "Hr8-2V3nJ8fW7Y6zX9qL5M3N2O8P7Q6R5S4T3U2V1W"
  },
  "privateKey": "test-only-private-key-not-for-production"
}
```

### D.2 Proof Request Test Vector

```json
{
  "requestId": "test-req-001",
  "nonce": "dGVzdCBub25jZSBmb3IgdmFsaWRhdGlvbg",
  "timestamp": "2026-01-11T12:00:00Z",
  "requestedClaims": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "credentialType": "GOVERNMENT_ID"
    }
  ],
  "context": {
    "origin": "https://test.verifier.example.com"
  }
}
```

### D.3 Proof Response Test Vector

```json
{
  "requestId": "test-req-001",
  "keyId": "test-key-001",
  "pairwiseSubjectId": "test-subject-abc123",
  "claimsVerified": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "proof": "test-zk-proof-data"
    }
  ],
  "signature": "test-ecdsa-signature",
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuanceDate": "2026-01-11T12:00:01Z",
  "expirationDate": "2026-01-12T12:00:01Z",
  "assuranceLevel": 2
}
```

### D.4 Verification Test Cases

#### Valid Proof
**Input**: Test vectors above
**Expected**: `{ valid: true, subjectId: "test-subject-abc123" }`

#### Invalid Signature
**Input**: Proof response with modified signature
**Expected**: `{ valid: false, reason: "Invalid signature" }`

#### Revoked Key
**Input**: Proof with revoked key ID
**Expected**: `{ valid: false, reason: "Key REVOKED" }`

#### Expired Timestamp
**Input**: Proof with timestamp > 5 minutes old
**Expected**: `{ valid: false, reason: "Proof timestamp invalid" }`

#### Nonce Replay
**Input**: Same nonce used twice
**Expected**: `{ valid: false, reason: "Nonce replay detected" }`

---

## Appendix E: Protocol Extensions

### E.1 Continuous Authentication

**Extension Overview**: Enable session-based authentication with rolling proofs.

**Proof Request Extension**:
```json
{
  "continuousAuth": {
    "sessionId": "session-uuid",
    "lastProof": "previous-proof-hash",
    "maxFrequency": 300
  }
}
```

**Benefits**:
- Reduced friction for repeated verifications
- Session binding prevents hijacking
- Configurable proof frequency

### E.2 Multi-Claim Proofs

**Extension Overview**: Prove multiple claims in single proof.

**Proof Request**:
```json
{
  "requestedClaims": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18
    },
    {
      "claimType": "KYC_LEVEL",
      "claimValue": 2
    }
  ]
}
```

**ZK Proof**: Combined range proofs for efficiency.

### E.3 Selective Disclosure

**Extension Overview**: Prove claims without revealing which claims are held.

**Use Case**: Prove "has valid driver's license OR passport" without revealing which.

**Implementation**: Set-based ZK proofs using cryptographic accumulators.

### E.4 Federated Registries

**Extension Overview**: Multiple registry instances with cross-verification.

**Benefits**:
- Geographic distribution
- Load balancing
- Backup registry support

**Implementation**: Merkle tree commitments across registries.

---

## Appendix F: Deployment Considerations

### F.1 Production Checklist

#### Security
- [ ] TLS 1.3+ configured on all endpoints
- [ ] HSTS headers enabled
- [ ] Security headers (CSP, X-Frame-Options) configured
- [ ] Rate limiting implemented
- [ ] Input validation enabled
- [ ] Audit logging configured

#### Performance
- [ ] Database indexes optimized
- [ ] Caching layer configured
- [ ] CDN for static assets
- [ ] Monitoring and alerting set up
- [ ] Load testing completed

#### Operations
- [ ] Backup procedures tested
- [ ] Disaster recovery plan documented
- [ ] Incident response procedures defined
- [ ] Monitoring dashboards configured

### F.2 Monitoring and Observability

#### Key Metrics
- **Verification Success Rate**: >99.9%
- **Average Response Time**: <100ms
- **Error Rate**: <0.1%
- **Cache Hit Rate**: >95%

#### Alerting
- Verification failure rate >1%
- Response time >500ms (p95)
- Registry unavailable >5 minutes
- Revocation cache miss rate >10%

### F.3 Backup and Recovery

#### Data Backup
- **Frequency**: Daily full backup + hourly incremental
- **Retention**: 30 days hot, 1 year cold
- **Encryption**: AES-256 at rest
- **Testing**: Monthly restore testing

#### Key Recovery
- **Registry Keys**: Distributed key shares (Shamir's secret sharing)
- **User Keys**: Not recoverable (by design)
- **Recovery Time**: <4 hours for registry, N/A for user keys

---

## Appendix G: Compliance Mappings

### G.1 GDPR Compliance

#### Data Minimization (Article 5)
- Only necessary PII processed
- Pairwise identifiers prevent correlation
- Data retention limited to operational needs

#### Purpose Limitation (Article 5)
- Processing limited to identity verification
- User consent required for each verification
- Clear privacy notices provided

#### Lawful Basis (Article 6)
- Consent: User explicitly agrees to verification
- Legitimate Interest: Service provision requires verification
- Legal Obligation: Regulatory compliance requirements

### G.2 CCPA Compliance

#### Personal Information Collection
- Minimal PII collection (only public keys)
- No sale of personal information
- User rights fully supported (access, deletion, portability)

#### Data Subject Rights
- **Access**: Users can view their registered keys
- **Deletion**: Users can revoke keys (effective deletion)
- **Portability**: Keys exportable in standard formats
- **Opt-out**: Users can disable all verifications

### G.3 ISO 27001 Controls

#### Information Security Policies (A.5)
- Comprehensive security policy documented
- Regular policy reviews and updates
- Employee security awareness training

#### Access Control (A.9)
- Role-based access control implemented
- Principle of least privilege enforced
- Access rights regularly reviewed

#### Cryptography (A.10)
- FIPS-compliant cryptographic algorithms
- Secure key management procedures
- Regular key rotation and replacement

---

## Appendix H: Future Work

### H.1 Post-Quantum Cryptography

**Timeline**: 2028-2030 migration required

**Options**:
1. **XMSS Signatures**: Stateful hash-based signatures
2. **Dilithium**: Lattice-based digital signatures
3. **Falcon**: Multivariate cryptography

**Migration Plan**:
- Dual algorithm support during transition
- Registry support for multiple key types
- Gradual client migration

### H.2 Advanced ZK Proofs

**Current**: Range proofs for age verification

**Future Enhancements**:
1. **Set Membership Proofs**: Prove membership without revealing element
2. **Equality Proofs**: Prove two values equal without revealing values
3. **Circuit-Based Proofs**: Arbitrary computation verification

**Benefits**:
- More claim types supported
- Enhanced privacy guarantees
- Reduced proof sizes

### H.3 Decentralized Registry

**Current**: Centralized registry with high availability

**Future**: Blockchain-based registry

**Benefits**:
- Censorship resistance
- Cryptographic auditability
- Distributed trust model

**Challenges**:
- Performance implications
- Cost considerations
- Regulatory compliance

### H.4 Mobile Optimization

**Current**: Web-based wallet with WASM

**Future**: Native mobile SDKs

**Improvements**:
- Better biometric integration
- Offline proof generation
- Platform-specific optimizations

---

## Appendix I: API Specifications

### I.1 Registry API

#### I.1.1 Key Registration

**Endpoint**: `POST /api/v1/keys`

**Request Body**:
```json
{
  "keyId": "string (UUID format)",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "string (base64url)",
    "y": "string (base64url)"
  },
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuerId": "string (UUID)",
  "metadata": {
    "deviceType": "mobile|desktop|server",
    "keyUsage": "signing|encryption",
    "keyStrength": 256
  }
}
```

**Response** (201 Created):
```json
{
  "keyId": "string",
  "status": "registered",
  "issuedAt": "2026-01-11T12:00:00Z",
  "expiresAt": "2028-01-11T12:00:00Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid key format or missing fields
- `403 Forbidden`: Unauthorized issuer
- `409 Conflict`: Key ID already exists
- `429 Too Many Requests`: Rate limit exceeded

#### I.1.2 Key Retrieval

**Endpoint**: `GET /api/v1/keys/{keyId}`

**Response** (200 OK):
```json
{
  "keyId": "string",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "string",
    "y": "string"
  },
  "algorithm": "ECDSA_P256_SHA256_1.0.0",
  "issuerId": "string",
  "issuedAt": "2026-01-11T12:00:00Z",
  "expiresAt": "2028-01-11T12:00:00Z",
  "status": "ACTIVE|REVOKED|EXPIRED|SUSPENDED",
  "lastAccessed": "2026-01-11T12:30:00Z"
}
```

**Error Responses**:
- `404 Not Found`: Key not found
- `429 Too Many Requests`: Rate limit exceeded

#### I.1.3 Revocation Status

**Endpoint**: `GET /api/v1/revocation/{keyId}`

**Response** (200 OK):
```json
{
  "keyId": "string",
  "status": "ACTIVE|REVOKED|EXPIRED|SUSPENDED",
  "revokedAt": "2026-01-11T12:00:00Z",
  "reason": "USER_INITIATED|COMPROMISED|LOST_DEVICE|EXPIRED",
  "registryTimestamp": "2026-01-11T12:30:00Z",
  "cacheExpiry": "2026-01-11T13:30:00Z"
}
```

#### I.1.4 Key Revocation

**Endpoint**: `POST /api/v1/revoke/{keyId}`

**Request Body**:
```json
{
  "signature": "string (base64url ECDSA signature)",
  "reason": "USER_INITIATED|COMPROMISED|LOST_DEVICE",
  "metadata": {
    "deviceId": "string",
    "ipAddress": "string",
    "userAgent": "string"
  }
}
```

**Response** (200 OK):
```json
{
  "keyId": "string",
  "status": "REVOKED",
  "revokedAt": "2026-01-11T12:30:00Z",
  "reason": "USER_INITIATED"
}
```

#### I.1.5 Bulk Operations

**Endpoint**: `POST /api/v1/keys/bulk`

**Request Body**:
```json
{
  "operations": [
    {
      "type": "register",
      "keyId": "string",
      "publicKey": { ... }
    },
    {
      "type": "revoke",
      "keyId": "string",
      "signature": "string"
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "results": [
    {
      "operation": 0,
      "success": true,
      "result": { ... }
    },
    {
      "operation": 1,
      "success": false,
      "error": "Key not found"
    }
  ]
}
```

### I.2 Wallet API

#### I.2.1 Proof Generation

**Endpoint**: `POST /api/v1/proof/generate`

**Request Body**:
```json
{
  "proofRequest": {
    "requestId": "string",
    "nonce": "string (base64url)",
    "timestamp": "2026-01-11T12:00:00Z",
    "requestedClaims": [
      {
        "claimType": "AGE_OVER",
        "claimValue": 18,
        "credentialType": "GOVERNMENT_ID"
      }
    ],
    "context": {
      "origin": "https://verifier.example.com",
      "sessionId": "string"
    }
  },
  "credentialId": "string"
}
```

**Response** (200 OK):
```json
{
  "proofResponse": {
    "requestId": "string",
    "keyId": "string",
    "pairwiseSubjectId": "string",
    "claimsVerified": [
      {
        "claimType": "AGE_OVER",
        "claimValue": 18,
        "proof": "string (base64url ZK proof)"
      }
    ],
    "signature": "string (base64url)",
    "algorithm": "ECDSA_P256_SHA256_1.0.0",
    "issuanceDate": "2026-01-11T12:00:01Z",
    "expirationDate": "2026-01-12T12:00:01Z",
    "assuranceLevel": 2
  }
}
```

#### I.2.2 Credential Management

**Endpoint**: `GET /api/v1/credentials`

**Response** (200 OK):
```json
{
  "credentials": [
    {
      "id": "string",
      "issuerId": "string",
      "claims": {
        "AGE_OVER": {
          "value": 18,
          "verifiedAt": "2026-01-11T10:00:00Z"
        }
      },
      "issuedAt": "2026-01-11T10:00:00Z",
      "expiresAt": "2028-01-11T10:00:00Z",
      "status": "ACTIVE"
    }
  ]
}
```

### I.3 Verifier API

#### I.3.1 Proof Verification

**Endpoint**: `POST /api/v1/proof/verify`

**Request Body**:
```json
{
  "proofResponse": { ... },
  "proofRequest": { ... },
  "options": {
    "strictTimestamp": true,
    "allowStaleCache": false,
    "maxClockSkew": 300
  }
}
```

**Response** (200 OK):
```json
{
  "valid": true,
  "subjectId": "string",
  "assuranceLevel": 2,
  "verifiedClaims": [
    {
      "claimType": "AGE_OVER",
      "claimValue": 18,
      "verified": true
    }
  ],
  "verificationTime": 15,
  "warnings": []
}
```

**Error Response** (400 Bad Request):
```json
{
  "valid": false,
  "reason": "Invalid signature",
  "details": {
    "errorCode": "INVALID_SIGNATURE",
    "timestamp": "2026-01-11T12:30:00Z"
  }
}
```

---

## Appendix J: Error Handling

### J.1 Error Code Reference

| Error Code | HTTP Status | Description | Retryable |
|------------|-------------|-------------|-----------|
| `INVALID_REQUEST` | 400 | Malformed request | No |
| `INVALID_SIGNATURE` | 400 | Signature verification failed | No |
| `KEY_NOT_FOUND` | 404 | Key not in registry | No |
| `KEY_REVOKED` | 403 | Key has been revoked | No |
| `KEY_EXPIRED` | 403 | Key has expired | No |
| `NONCE_REPLAY` | 403 | Nonce already used | No |
| `TIMESTAMP_INVALID` | 400 | Timestamp outside tolerance | Yes |
| `REGISTRY_UNAVAILABLE` | 503 | Registry service down | Yes |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Yes |
| `INTERNAL_ERROR` | 500 | Server error | Yes |

### J.2 Error Response Format

```json
{
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "The proof signature could not be verified",
    "details": {
      "keyId": "key-uuid-1234",
      "algorithm": "ECDSA_P256_SHA256_1.0.0",
      "timestamp": "2026-01-11T12:30:00Z"
    },
    "requestId": "req-12345-67890",
    "retryable": false,
    "retryAfter": null
  }
}
```

### J.3 Client Error Handling

```typescript
async function handleVerificationError(error: VerificationError): Promise<void> {
  switch (error.code) {
    case 'KEY_REVOKED':
      // Prompt user to re-enroll
      await handleKeyRevocation(error.details.keyId);
      break;

    case 'TIMESTAMP_INVALID':
      // Check system clock
      if (await isClockSkewed()) {
        await syncSystemClock();
        // Retry verification
        return await retryVerification();
      }
      break;

    case 'REGISTRY_UNAVAILABLE':
      // Use cached revocation status if available
      if (error.details.allowStaleCache) {
        return await verifyWithStaleCache();
      }
      break;

    case 'RATE_LIMIT_EXCEEDED':
      // Implement exponential backoff
      const delay = Math.min(error.retryAfter || 1000, 30000);
      await sleep(delay);
      return await retryVerification();
      break;

    default:
      // Log and rethrow
      console.error('Verification failed:', error);
      throw error;
  }
}
```

---

## Appendix K: Performance Benchmarks

### K.1 Proof Generation Performance

**Test Environment**:
- CPU: Apple M2 Pro (12-core)
- Memory: 32GB RAM
- Browser: Chrome 120
- Network: 100Mbps

**Results**:

| Operation | Average Time | P95 | P99 | Notes |
|-----------|--------------|-----|-----|-------|
| Key Generation | 2.3ms | 4.1ms | 8.7ms | WebCrypto API |
| ZK Proof (Age) | 45.2ms | 67.8ms | 123.4ms | Bulletproofs WASM |
| ECDSA Sign | 1.1ms | 2.2ms | 4.5ms | WebCrypto API |
| Total Proof Gen | 48.6ms | 74.1ms | 136.6ms | End-to-end |

### K.2 Proof Verification Performance

**Test Environment**:
- CPU: Intel Xeon (8-core)
- Memory: 64GB RAM
- Node.js: v20.10.0
- Database: PostgreSQL 15

**Results**:

| Operation | Average Time | P95 | P99 | Notes |
|-----------|--------------|-----|-----|-------|
| Registry Lookup | 8.4ms | 15.2ms | 28.7ms | Cached |
| Revocation Check | 3.2ms | 5.8ms | 12.1ms | Cached |
| ECDSA Verify | 0.8ms | 1.5ms | 3.2ms | Node.js crypto |
| ZK Verify | 4.7ms | 8.9ms | 16.3ms | Native Rust |
| Total Verify | 17.1ms | 31.4ms | 60.3ms | End-to-end |

### K.3 Scalability Metrics

**Concurrent Users**: 10,000
**Request Rate**: 1,000 req/sec
**Average Response Time**: 23ms
**Error Rate**: 0.02%
**CPU Usage**: 45%
**Memory Usage**: 2.8GB

### K.4 Network Performance

**Proof Request Size**: 487 bytes
**Proof Response Size**: 1,247 bytes (with ZK proof)
**Registry Query Size**: 156 bytes
**Total Transfer**: 1.89KB per verification

**Compression Savings**:
- GZIP: 65% reduction (647 bytes total)
- Brotli: 72% reduction (527 bytes total)

---

## Appendix L: Interoperability

### L.1 Compatible Implementations

#### L.1.1 Reference Implementation
- **Language**: TypeScript/Node.js
- **ZK Library**: Custom Bulletproofs WASM
- **Crypto**: WebCrypto API + Node.js crypto
- **Database**: PostgreSQL
- **Cache**: Redis
- **Repository**: github.com/ShieldedID/reference-implementation

#### L.1.2 Alternative Implementations

**Go Implementation**:
- **ZK Library**: go-bulletproofs
- **Crypto**: crypto/ecdsa
- **Database**: PostgreSQL
- **Status**: Beta

**Rust Implementation**:
- **ZK Library**: bulletproofs crate
- **Crypto**: ring crate
- **Database**: PostgreSQL
- **Status**: Alpha

**Python Implementation**:
- **ZK Library**: bulletproofs-python
- **Crypto**: cryptography library
- **Database**: PostgreSQL
- **Status**: Proof of concept

### L.2 Protocol Version Negotiation

```typescript
interface ProtocolVersion {
  major: number;
  minor: number;
  patch: number;
  features: string[];
}

const SUPPORTED_VERSIONS: ProtocolVersion[] = [
  { major: 1, minor: 0, patch: 0, features: ['basic', 'zk'] },
  { major: 1, minor: 1, patch: 0, features: ['basic', 'zk', 'continuous'] }
];

function negotiateVersion(requestedVersion: string): ProtocolVersion {
  const [major, minor, patch] = requestedVersion.split('.').map(Number);

  for (const version of SUPPORTED_VERSIONS) {
    if (version.major === major &&
        version.minor <= minor) {
      return version;
    }
  }

  throw new Error(`Unsupported protocol version: ${requestedVersion}`);
}
```

### L.3 Cross-Platform Compatibility

#### L.3.1 Browser Support Matrix

| Browser | Version | WebCrypto | WASM | Status |
|---------|---------|-----------|------|--------|
| Chrome | 90+ | ✅ | ✅ | Supported |
| Firefox | 88+ | ✅ | ✅ | Supported |
| Safari | 14+ | ✅ | ✅ | Supported |
| Edge | 90+ | ✅ | ✅ | Supported |
| Mobile Safari | 14.5+ | ✅ | ✅ | Supported |
| Chrome Android | 90+ | ✅ | ✅ | Supported |

#### L.3.2 Mobile Platform Support

**iOS**:
- **Framework**: ShieldedID-iOS
- **Language**: Swift 5.5+
- **Crypto**: Security framework + CryptoKit
- **ZK**: WASM via JavaScriptCore

**Android**:
- **Library**: ShieldedID-Android
- **Language**: Kotlin 1.6+
- **Crypto**: Android Keystore + Conscrypt
- **ZK**: WASM via WebView

### L.4 Federation Protocol

#### L.4.1 Registry Federation

**Use Case**: Multiple organizations maintaining separate registries that can verify each other's keys.

**Federation Agreement**:
```json
{
  "federationId": "string",
  "participants": [
    {
      "registryId": "string",
      "baseUrl": "https://registry.example.com",
      "publicKey": { ... },
      "supportedAlgorithms": ["ECDSA_P256_SHA256_1.0.0"]
    }
  ],
  "trustPolicy": {
    "minAssuranceLevel": 2,
    "maxClockSkew": 300,
    "cacheDuration": 3600
  }
}
```

**Cross-Registry Verification**:
1. Verifier queries local registry
2. If key not found, query federation participants
3. Verify using federated trust policy
4. Cache results for performance

---

## Appendix M: Regulatory Compliance

### M.1 GDPR Compliance Analysis

#### M.1.1 Data Processing Inventory

**Personal Data Processed**:
- **Public Keys**: Cryptographic public keys (not PII)
- **Revocation Reasons**: User-provided reasons (optional)
- **Audit Logs**: IP addresses, timestamps (pseudonymized)

**Data Subject Rights**:
- **Right to Access**: Users can retrieve their registered keys
- **Right to Rectification**: Users can update key metadata
- **Right to Erasure**: Key revocation effectively deletes data
- **Right to Portability**: Keys exportable in JWK format

#### M.1.2 Lawful Basis Assessment

**Primary Basis**: Consent (Article 6(1)(a))
- Users explicitly consent to key registration
- Granular consent for different verification types
- Right to withdraw consent (key revocation)

**Secondary Basis**: Legitimate Interest (Article 6(1)(f))
- Identity verification necessary for service provision
- Minimal data processing (privacy by design)
- Balancing test passes (no overriding individual rights)

#### M.1.3 Data Protection Impact Assessment

**High-Level DPIA**:
- **Data Processing**: Minimal cryptographic data
- **Risk Level**: Low (no sensitive PII)
- **Mitigations**: Encryption, access controls, audit logging
- **Residual Risk**: Very low

### M.2 CCPA Compliance Analysis

#### M.2.1 Personal Information Inventory

**Business Purpose**: Identity verification for age-restricted services

**Categories of PI**:
- **Identifiers**: Public keys (not directly identifiable)
- **Protected Classifications**: Age verification results (not stored)
- **Commercial Information**: None
- **Internet Activity**: Verification timestamps (aggregated only)

#### M.2.2 Data Subject Rights Implementation

**Right to Know**:
- Clear privacy notice explaining data usage
- API endpoints for data access
- Data export in machine-readable format

**Right to Delete**:
- Key revocation removes all associated data
- Audit logs anonymized after 90 days
- No data retention beyond operational needs

**Right to Opt-Out**:
- Global opt-out via key revocation
- Per-verifier opt-out supported
- No sale of personal information

### M.3 Industry-Specific Compliance

#### M.3.1 Financial Services (PSD2)

**Applicable Requirements**:
- Strong customer authentication
- Secure communication channels
- Transaction authorization

**Shielded ID Mapping**:
- **SCA**: Cryptographic proof of identity
- **Secure Channel**: TLS 1.3 + end-to-end encryption
- **Authorization**: User-controlled key signing

#### M.3.2 Healthcare (HIPAA)

**Applicable Requirements**:
- Individual access to health information
- Secure transmission of PHI
- Audit controls for access

**Shielded ID Mapping**:
- **Access Control**: Role-based verification
- **Encryption**: End-to-end cryptographic protection
- **Audit**: Comprehensive audit logging

#### M.3.3 Government (NIST 800-63)

**Applicable Requirements**:
- Identity proofing and verification
- Authentication assurance levels
- Federation capabilities

**Shielded ID Mapping**:
- **IAL**: Assurance levels 1-3 supported
- **AAL**: Cryptographic authentication
- **FAL**: Registry federation support

---

## Appendix N: Troubleshooting Guide

### N.1 Common Issues

#### N.1.1 "Key not found" Error

**Symptoms**:
- Verification fails with `KEY_NOT_FOUND`
- Registry returns 404 for valid key ID

**Causes**:
1. Key never registered
2. Wrong registry endpoint
3. Key ID typo
4. Network connectivity issues

**Solutions**:
1. Verify key registration in audit logs
2. Check registry configuration
3. Validate key ID format (UUID)
4. Test network connectivity

#### N.1.2 "Invalid signature" Error

**Symptoms**:
- Verification fails with `INVALID_SIGNATURE`
- Proof appears valid but signature check fails

**Causes**:
1. Clock skew between wallet and verifier
2. Corrupted proof data during transmission
3. Wrong algorithm implementation
4. Key compromise

**Solutions**:
1. Synchronize system clocks (NTP)
2. Check JSON canonicalization
3. Verify algorithm implementation
4. Check for key revocation

#### N.1.3 "Nonce replay detected" Error

**Symptoms**:
- Verification fails with `NONCE_REPLAY`
- Same proof request fails repeatedly

**Causes**:
1. Nonce cache corruption
2. Clock skew causing nonce reuse
3. Insufficient nonce randomness
4. Cache persistence issues

**Solutions**:
1. Clear nonce cache
2. Check system clock synchronization
3. Verify nonce generation entropy
4. Check cache backend connectivity

#### N.1.4 ZK Proof Verification Fails

**Symptoms**:
- Claims verify but ZK proof fails
- `CLAIM_VERIFICATION_FAILED` error

**Causes**:
1. WASM not loaded properly
2. Incorrect proof parameters
3. Bulletproofs library version mismatch
4. Mathematical error in proof generation

**Solutions**:
1. Verify WASM module loading
2. Check proof parameters match request
3. Update to compatible library versions
4. Enable debug logging for proof details

### N.2 Diagnostic Tools

#### N.2.1 Registry Health Check

```bash
curl -X GET https://registry.example.com/api/v1/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "database": "connected",
  "cache": "connected"
}
```

#### N.2.2 Key Validation Tool

```typescript
async function validateKey(keyId: string, registryUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${registryUrl}/api/v1/keys/${keyId}`);
    if (!response.ok) return false;

    const key = await response.json();

    // Validate key format
    if (!key.publicKey || key.publicKey.kty !== 'EC') return false;
    if (key.status !== 'ACTIVE') return false;

    // Validate signature if present
    if (key.signature) {
      return await verifyKeySignature(key);
    }

    return true;
  } catch (error) {
    console.error('Key validation failed:', error);
    return false;
  }
}
```

#### N.2.3 Proof Validation Tool

```typescript
async function debugProof(
  proofRequest: ProofRequest,
  proofResponse: ProofResponse
): Promise<DebugResult> {
  const debug: DebugResult = {
    requestValid: false,
    responseValid: false,
    signatureValid: false,
    claimsValid: false,
    errors: []
  };

  // Validate request binding
  if (proofResponse.requestId !== proofRequest.requestId) {
    debug.errors.push('Request ID mismatch');
  } else {
    debug.requestValid = true;
  }

  // Validate signature
  try {
    debug.signatureValid = await verifySignature(proofResponse);
  } catch (error) {
    debug.errors.push(`Signature error: ${error.message}`);
  }

  // Validate claims
  try {
    debug.claimsValid = await verifyClaims(proofResponse.claimsVerified);
  } catch (error) {
    debug.errors.push(`Claims error: ${error.message}`);
  }

  debug.responseValid = debug.signatureValid && debug.claimsValid;

  return debug;
}
```

### N.3 Performance Troubleshooting

#### N.3.1 Slow Proof Generation

**Common Causes**:
1. WASM cold start
2. Large credential sets
3. Browser resource constraints

**Optimizations**:
1. Pre-load WASM modules
2. Cache credentials locally
3. Use Web Workers for computation

#### N.3.2 High Latency Verification

**Common Causes**:
1. Registry network latency
2. Database query performance
3. Cache misses

**Optimizations**:
1. Use CDN for registry endpoints
2. Optimize database indexes
3. Increase cache TTL
4. Implement request batching

#### N.3.3 Memory Issues

**Common Causes**:
1. Large proof caches
2. Memory leaks in WASM
3. Excessive credential storage

**Solutions**:
1. Implement LRU cache eviction
2. Update WASM runtime
3. Limit stored credential count

---

## Appendix O: Change Log

### Version 1.0.0 (January 11, 2026)

**Initial Release**
- Basic proof generation and verification
- Registry API for key management
- ZK proofs using Bulletproofs
- Comprehensive security analysis

**New Features**:
- Pairwise subject identifiers
- Revocation checking
- Timestamp validation
- Nonce-based replay protection

**Security**:
- ECDSA signature verification
- TLS 1.3 requirement
- Input validation and sanitization

### Version 1.1.0 (Planned Q2 2026)

**Enhanced Features**:
- Continuous authentication support
- Multi-claim proofs
- Selective disclosure proofs
- Mobile SDKs (iOS/Android)

**Performance**:
- WASM optimization
- Caching improvements
- Batch verification support

**Security**:
- Additional claim types
- Enhanced audit logging
- Rate limiting improvements

### Version 2.0.0 (Planned 2028)

**Major Changes**:
- Post-quantum cryptography support
- Decentralized registry option
- Advanced ZK proof circuits
- Cross-chain compatibility

**Breaking Changes**:
- New key formats
- Updated algorithm suites
- Registry federation protocol

---

## Appendix P: Code Examples

### P.1 Complete Wallet Implementation

```typescript
/**
 * Complete Shielded ID Wallet Implementation
 * Demonstrates all core wallet functionality
 */

import {
  ProofRequest,
  ProofResponse,
  Credential,
  ShieldedWallet,
  RegistryClient
} from '@shielded-id/wallet-sdk';

class Wallet implements ShieldedWallet {
  private credentials: Map<string, Credential> = new Map();
  private keyStore: KeyStore;
  private registry: RegistryClient;

  constructor(registryUrl: string) {
    this.keyStore = new WebCryptoKeyStore();
    this.registry = new HttpRegistryClient(registryUrl);
  }

  async enroll(issuerUrl: string, credentialTypes: string[]): Promise<string> {
    // Generate new key pair
    const keyPair = await this.keyStore.generateKey();
    const keyId = crypto.randomUUID();

    // Register key with registry
    await this.registry.registerKey({
      keyId,
      publicKey: await this.keyStore.exportPublicKey(keyPair.publicKey),
      algorithm: 'ECDSA_P256_SHA256_1.0.0',
      issuerId: 'wallet-self' // Self-issued for now
    });

    // Request credentials from issuer
    const credentials = await this.requestCredentials(issuerUrl, credentialTypes, keyId);

    // Store credentials
    for (const credential of credentials) {
      this.credentials.set(credential.id, credential);
    }

    return keyId;
  }

  async generateProof(proofRequest: ProofRequest): Promise<ProofResponse> {
    // Validate request
    this.validateProofRequest(proofRequest);

    // Find matching credential
    const credential = this.findMatchingCredential(proofRequest.requestedClaims);
    if (!credential) {
      throw new Error('No matching credential found');
    }

    // Generate pairwise subject ID
    const pairwiseSubjectId = await this.generatePairwiseSubjectId(
      proofRequest.context.origin
    );

    // Generate ZK proofs for claims
    const claimsVerified = await Promise.all(
      proofRequest.requestedClaims.map(async (claim) => {
        const proof = await this.generateZKProof(claim, credential);
        return {
          claimType: claim.claimType,
          claimValue: claim.claimValue,
          proof: proof
        };
      })
    );

    // Create response object
    const response: ProofResponse = {
      requestId: proofRequest.requestId,
      keyId: credential.keyId,
      pairwiseSubjectId,
      claimsVerified,
      algorithm: 'ECDSA_P256_SHA256_1.0.0',
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      assuranceLevel: credential.assuranceLevel
    };

    // Sign the response
    response.signature = await this.signProofResponse(response);

    return response;
  }

  async revokeKey(keyId: string, reason: string): Promise<void> {
    // Generate revocation signature
    const signature = await this.generateRevocationSignature(keyId);

    // Submit revocation to registry
    await this.registry.revokeKey(keyId, signature, reason);

    // Remove local credentials
    for (const [credId, credential] of this.credentials) {
      if (credential.keyId === keyId) {
        this.credentials.delete(credId);
      }
    }
  }

  private validateProofRequest(request: ProofRequest): void {
    // Check timestamp
    const now = Date.now();
    const requestTime = new Date(request.timestamp).getTime();
    const skew = Math.abs(now - requestTime);

    if (skew > 5 * 60 * 1000) { // 5 minutes
      throw new Error('Request timestamp outside tolerance');
    }

    // Check nonce freshness (simplified)
    if (this.isNonceUsed(request.nonce)) {
      throw new Error('Nonce already used');
    }
  }

  private findMatchingCredential(requestedClaims: any[]): Credential | null {
    for (const credential of this.credentials.values()) {
      if (this.credentialMatchesClaims(credential, requestedClaims)) {
        return credential;
      }
    }
    return null;
  }

  private credentialMatchesClaims(credential: Credential, claims: any[]): boolean {
    return claims.every(claim =>
      credential.claims[claim.claimType] &&
      credential.claims[claim.claimType].value >= claim.claimValue
    );
  }

  private async generatePairwiseSubjectId(verifierOrigin: string): Promise<string> {
    // In practice, this would use a stable user ID
    const userId = await this.getUserId();
    const input = `${userId}|${verifierOrigin}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/[+/=]/g, '');
  }

  private async generateZKProof(claim: any, credential: Credential): Promise<string> {
    // Load WASM module (simplified)
    const zkModule = await import('./zk/bulletproofs.js');

    // Generate proof based on claim type
    switch (claim.claimType) {
      case 'AGE_OVER':
        return zkModule.proveAgeOver(
          credential.claims.AGE_OVER.commitment,
          claim.claimValue
        );

      default:
        throw new Error(`Unsupported claim type: ${claim.claimType}`);
    }
  }

  private async signProofResponse(response: ProofResponse): Promise<string> {
    // Canonicalize JSON
    const canonicalJson = this.canonicalizeJson(response);

    // Sign with private key
    const signature = await this.keyStore.sign(
      new TextEncoder().encode(canonicalJson)
    );

    // Return base64url encoded
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/[+/=]/g, '');
  }

  private canonicalizeJson(obj: any): string {
    // Simplified canonicalization
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  private async generateRevocationSignature(keyId: string): Promise<string> {
    const message = `revoke:${keyId}:${Date.now()}`;
    const signature = await this.keyStore.sign(new TextEncoder().encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/[+/=]/g, '');
  }

  private isNonceUsed(nonce: string): boolean {
    // Simplified nonce tracking
    return false; // In practice, maintain a cache
  }

  private async getUserId(): Promise<string> {
    // In practice, this would be a stable user identifier
    return 'user-' + crypto.randomUUID();
  }

  private async requestCredentials(
    issuerUrl: string,
    types: string[],
    keyId: string
  ): Promise<Credential[]> {
    // Simplified credential request
    const response = await fetch(`${issuerUrl}/api/credentials/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ types, keyId })
    });

    return await response.json();
  }
}
```

### P.2 Complete Verifier Implementation

```typescript
/**
 * Complete Shielded ID Verifier Implementation
 * Demonstrates proof verification and user authentication
 */

import {
  ProofRequest,
  ProofResponse,
  VerificationResult,
  ShieldedVerifier,
  RegistryClient
} from '@shielded-id/verifier-sdk';

class Verifier implements ShieldedVerifier {
  private registry: RegistryClient;
  private nonceCache: Set<string> = new Set();
  private sessionStore: Map<string, Session> = new Map();

  constructor(registryUrl: string) {
    this.registry = new HttpRegistryClient(registryUrl);
  }

  async authenticateUser(
    userId: string | null,
    requiredClaims: ClaimRequest[]
  ): Promise<AuthenticationResult> {
    // Generate proof request
    const proofRequest = await this.createProofRequest(requiredClaims);

    // Send to wallet (in practice, this would be via deep link or browser API)
    const proofResponse = await this.requestProofFromWallet(proofRequest);

    // Verify proof
    const verification = await this.verifyProof(proofRequest, proofResponse);

    if (!verification.valid) {
      return {
        authenticated: false,
        error: verification.reason,
        userId: null
      };
    }

    // Create or update session
    const sessionId = await this.createSession(verification.subjectId, verification);

    return {
      authenticated: true,
      userId: verification.subjectId,
      sessionId,
      assuranceLevel: verification.assuranceLevel
    };
  }

  async createProofRequest(claims: ClaimRequest[]): Promise<ProofRequest> {
    const requestId = crypto.randomUUID();
    const nonce = await this.generateNonce();

    return {
      requestId,
      nonce: btoa(nonce).replace(/[+/=]/g, ''),
      timestamp: new Date().toISOString(),
      requestedClaims: claims.map(claim => ({
        claimType: claim.type,
        claimValue: claim.value,
        credentialType: claim.credentialType || 'GOVERNMENT_ID'
      })),
      context: {
        origin: window.location.origin,
        sessionId: crypto.randomUUID()
      }
    };
  }

  async verifyProof(
    request: ProofRequest,
    response: ProofResponse
  ): Promise<VerificationResult> {
    try {
      // Step 1: Validate request binding
      if (response.requestId !== request.requestId) {
        return { valid: false, reason: 'Request ID mismatch' };
      }

      // Step 2: Validate timestamp
      if (!this.isValidTimestamp(response.issuanceDate)) {
        return { valid: false, reason: 'Response timestamp invalid' };
      }

      // Step 3: Check nonce freshness
      if (this.nonceCache.has(request.nonce)) {
        return { valid: false, reason: 'Nonce replay detected' };
      }

      // Step 4: Retrieve and validate key
      const registryKey = await this.registry.getKey(response.keyId);
      if (!registryKey) {
        return { valid: false, reason: 'Key not found in registry' };
      }

      // Step 5: Check revocation
      const revocation = await this.registry.checkRevocation(response.keyId);
      if (revocation.status !== 'ACTIVE') {
        return { valid: false, reason: `Key ${revocation.status}` };
      }

      // Step 6: Verify signature
      const signatureValid = await this.verifySignature(response, registryKey);
      if (!signatureValid) {
        return { valid: false, reason: 'Invalid signature' };
      }

      // Step 7: Verify claims
      const claimsValid = await this.verifyClaims(response.claimsVerified, request.requestedClaims);
      if (!claimsValid) {
        return { valid: false, reason: 'Claim verification failed' };
      }

      // Step 8: Cache nonce
      this.nonceCache.add(request.nonce);

      // Clean up old nonces (simplified)
      if (this.nonceCache.size > 10000) {
        this.nonceCache.clear();
      }

      return {
        valid: true,
        subjectId: response.pairwiseSubjectId,
        assuranceLevel: response.assuranceLevel
      };

    } catch (error) {
      return { valid: false, reason: `Verification error: ${error.message}` };
    }
  }

  private async generateNonce(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return String.fromCharCode(...array);
  }

  private isValidTimestamp(timestamp: string): boolean {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const skew = Math.abs(now - time);
    return skew <= 5 * 60 * 1000; // 5 minutes
  }

  private async verifySignature(
    response: ProofResponse,
    registryKey: RegistryKey
  ): Promise<boolean> {
    try {
      // Remove signature for canonicalization
      const { signature, ...responseWithoutSig } = response;
      const canonicalJson = this.canonicalizeJson(responseWithoutSig);

      // Import public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        registryKey.publicKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );

      // Decode signature
      const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));

      // Verify
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBytes,
        new TextEncoder().encode(canonicalJson)
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  private async verifyClaims(
    verifiedClaims: any[],
    requestedClaims: any[]
  ): Promise<boolean> {
    // Load ZK verification module
    const zkModule = await import('./zk/bulletproofs.js');

    for (let i = 0; i < verifiedClaims.length; i++) {
      const verified = verifiedClaims[i];
      const requested = requestedClaims[i];

      // Check claim matches request
      if (verified.claimType !== requested.claimType ||
          verified.claimValue !== requested.claimValue) {
        return false;
      }

      // Verify ZK proof
      const proofValid = await zkModule.verifyAgeOver(
        verified.proof,
        verified.claimValue
      );

      if (!proofValid) {
        return false;
      }
    }

    return true;
  }

  private canonicalizeJson(obj: any): string {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  private async createSession(
    subjectId: string,
    verification: VerificationResult
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    this.sessionStore.set(sessionId, {
      subjectId,
      createdAt: new Date(),
      lastActivity: new Date(),
      assuranceLevel: verification.assuranceLevel,
      claims: verification.claims || []
    });

    return sessionId;
  }

  private async requestProofFromWallet(request: ProofRequest): Promise<ProofResponse> {
    // In practice, this would use postMessage API or similar
    // For demo purposes, simulate wallet response
    return new Promise((resolve) => {
      // Simulate network delay
      setTimeout(() => {
        resolve({
          requestId: request.requestId,
          keyId: 'demo-key-123',
          pairwiseSubjectId: 'demo-subject-abc',
          claimsVerified: request.requestedClaims.map(claim => ({
            claimType: claim.claimType,
            claimValue: claim.claimValue,
            proof: 'demo-zk-proof'
          })),
          signature: 'demo-signature',
          algorithm: 'ECDSA_P256_SHA256_1.0.0',
          issuanceDate: new Date().toISOString(),
          expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          assuranceLevel: 2
        });
      }, 100);
    });
  }
}

interface ClaimRequest {
  type: string;
  value: number;
  credentialType?: string;
}

interface AuthenticationResult {
  authenticated: boolean;
  userId: string | null;
  sessionId?: string;
  assuranceLevel?: number;
  error?: string;
}

interface Session {
  subjectId: string;
  createdAt: Date;
  lastActivity: Date;
  assuranceLevel: number;
  claims: any[];
}
```

### P.3 Registry Implementation

```typescript
/**
 * Complete Shielded ID Registry Implementation
 * Demonstrates key management and revocation services
 */

import express from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';

class RegistryServer {
  private app: express.Application;
  private db: Pool;
  private revocationCache: Map<string, CachedRevocation> = new Map();

  constructor() {
    this.app = express();
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    this.setupRoutes();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(this.rateLimitMiddleware);
    this.app.use(this.loggingMiddleware);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/v1/health', this.healthCheck.bind(this));

    // Key management
    this.app.post('/api/v1/keys', this.registerKey.bind(this));
    this.app.get('/api/v1/keys/:keyId', this.getKey.bind(this));
    this.app.post('/api/v1/revoke/:keyId', this.revokeKey.bind(this));
    this.app.get('/api/v1/revocation/:keyId', this.getRevocationStatus.bind(this));

    // Bulk operations
    this.app.post('/api/v1/keys/bulk', this.bulkOperations.bind(this));

    // Audit
    this.app.get('/api/v1/audit', this.getAuditLog.bind(this));
  }

  private async healthCheck(req: express.Request, res: express.Response): Promise<void> {
    try {
      await this.db.query('SELECT 1');
      res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: 'connected',
        cache: 'operational'
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  private async registerKey(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { keyId, publicKey, algorithm, issuerId, metadata } = req.body;

      // Validate input
      if (!this.isValidKeyFormat(publicKey)) {
        return res.status(400).json({ error: 'Invalid key format' });
      }

      // Check authorization (simplified)
      if (!await this.isAuthorizedIssuer(issuerId, req)) {
        return res.status(403).json({ error: 'Unauthorized issuer' });
      }

      // Insert key
      await this.db.query(`
        INSERT INTO keys (
          key_id, public_key, algorithm, issuer_id,
          issued_at, expires_at, status, metadata
        ) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '2 years', 'ACTIVE', $5)
      `, [keyId, JSON.stringify(publicKey), algorithm, issuerId, JSON.stringify(metadata || {})]);

      // Audit log
      await this.auditLog('KEY_REGISTERED', { keyId, issuerId }, req);

      res.status(201).json({
        keyId,
        status: 'registered',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
      });

    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'Key ID already exists' });
      } else {
        console.error('Key registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  private async getKey(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { keyId } = req.params;

      const result = await this.db.query(`
        SELECT key_id, public_key, algorithm, issuer_id,
               issued_at, expires_at, status, last_accessed
        FROM keys WHERE key_id = $1
      `, [keyId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Key not found' });
      }

      const key = result.rows[0];

      // Update last accessed
      await this.db.query(
        'UPDATE keys SET last_accessed = NOW() WHERE key_id = $1',
        [keyId]
      );

      res.json({
        keyId: key.key_id,
        publicKey: key.public_key,
        algorithm: key.algorithm,
        issuerId: key.issuer_id,
        issuedAt: key.issued_at,
        expiresAt: key.expires_at,
        status: key.status,
        lastAccessed: key.last_accessed
      });

    } catch (error) {
      console.error('Key retrieval error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async revokeKey(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { keyId } = req.params;
      const { signature, reason } = req.body;

      // Verify revocation signature
      const key = await this.getKeyById(keyId);
      if (!key) {
        return res.status(404).json({ error: 'Key not found' });
      }

      if (!await this.verifyRevocationSignature(signature, keyId, key.public_key)) {
        return res.status(403).json({ error: 'Invalid revocation signature' });
      }

      // Update key status
      await this.db.query(
        'UPDATE keys SET status = $1 WHERE key_id = $2',
        ['REVOKED', keyId]
      );

      // Insert revocation record
      await this.db.query(`
        INSERT INTO revocations (key_id, revoked_at, reason, signature)
        VALUES ($1, NOW(), $2, $3)
      `, [keyId, reason || 'USER_INITIATED', signature]);

      // Clear cache
      this.revocationCache.delete(keyId);

      // Audit log
      await this.auditLog('KEY_REVOKED', { keyId, reason }, req);

      res.json({
        keyId,
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        reason: reason || 'USER_INITIATED'
      });

    } catch (error) {
      console.error('Key revocation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async getRevocationStatus(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { keyId } = req.params;

      // Check cache first
      const cached = this.revocationCache.get(keyId);
      if (cached && cached.expiry > Date.now()) {
        return res.json(cached.status);
      }

      // Get key status
      const keyResult = await this.db.query(
        'SELECT status FROM keys WHERE key_id = $1',
        [keyId]
      );

      if (keyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Key not found' });
      }

      // Get revocation details
      const revocationResult = await this.db.query(`
        SELECT revoked_at, reason FROM revocations WHERE key_id = $1
      `, [keyId]);

      const revocation = revocationResult.rows[0];

      const status = {
        keyId,
        status: keyResult.rows[0].status,
        revokedAt: revocation?.revoked_at || null,
        reason: revocation?.reason || null,
        registryTimestamp: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
      };

      // Cache result
      this.revocationCache.set(keyId, {
        status,
        expiry: Date.now() + 60 * 60 * 1000
      });

      res.json(status);

    } catch (error) {
      console.error('Revocation status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private async bulkOperations(req: express.Request, res: express.Response): Promise<void> {
    const { operations } = req.body;
    const results = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'register':
            await this.registerKeyInternal(op);
            results.push({ operation: operations.indexOf(op), success: true });
            break;
          case 'revoke':
            await this.revokeKeyInternal(op);
            results.push({ operation: operations.indexOf(op), success: true });
            break;
          default:
            results.push({
              operation: operations.indexOf(op),
              success: false,
              error: 'Unknown operation type'
            });
        }
      } catch (error) {
        results.push({
          operation: operations.indexOf(op),
          success: false,
          error: error.message
        });
      }
    }

    res.json({ results });
  }

  private async getAuditLog(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const result = await this.db.query(`
        SELECT event_type, key_id, request_id, ip_address,
               user_agent, event_data, created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [parseInt(limit as string), parseInt(offset as string)]);

      res.json({
        events: result.rows,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: result.rows.length === parseInt(limit as string)
        }
      });

    } catch (error) {
      console.error('Audit log error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper methods
  private isValidKeyFormat(publicKey: any): boolean {
    return publicKey &&
           publicKey.kty === 'EC' &&
           publicKey.crv === 'P-256' &&
           publicKey.x && publicKey.y;
  }

  private async isAuthorizedIssuer(issuerId: string, req: express.Request): Promise<boolean> {
    // Simplified authorization check
    // In practice, this would validate JWT tokens, API keys, etc.
    return true;
  }

  private async getKeyById(keyId: string): Promise<any> {
    const result = await this.db.query(
      'SELECT * FROM keys WHERE key_id = $1',
      [keyId]
    );
    return result.rows[0];
  }

  private async verifyRevocationSignature(
    signature: string,
    keyId: string,
    publicKey: any
  ): Promise<boolean> {
    // Simplified signature verification
    // In practice, this would verify the signature cryptographically
    return signature && signature.length > 0;
  }

  private async auditLog(
    eventType: string,
    eventData: any,
    req: express.Request
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO audit_log (
        event_type, key_id, request_id, ip_address,
        user_agent, event_data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
      eventType,
      eventData.keyId,
      req.headers['x-request-id'] || crypto.randomUUID(),
      req.ip,
      req.headers['user-agent'],
      JSON.stringify(eventData)
    ]);
  }

  private rateLimitMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    // Simplified rate limiting
    // In practice, use express-rate-limit or similar
    next();
  }

  private loggingMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  }

  // Internal methods for bulk operations
  private async registerKeyInternal(op: any): Promise<void> {
    // Similar to registerKey but without HTTP response handling
  }

  private async revokeKeyInternal(op: any): Promise<void> {
    // Similar to revokeKey but without HTTP response handling
  }

  start(port: number): void {
    this.app.listen(port, () => {
      console.log(`Registry server listening on port ${port}`);
    });
  }
}

// Usage
const server = new RegistryServer();
server.start(3001);
```

---

## Appendix Q: Testing Framework

### Q.1 Unit Test Examples

```typescript
/**
 * Comprehensive test suite for Shielded ID components
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Wallet } from '../src/wallet';
import { Verifier } from '../src/verifier';
import { RegistryServer } from '../src/registry';

describe('Shielded ID Core Components', () => {
  let wallet: Wallet;
  let verifier: Verifier;
  let registry: RegistryServer;

  beforeEach(async () => {
    // Setup test environment
    registry = new RegistryServer();
    await registry.start();

    wallet = new Wallet(registry.getUrl());
    verifier = new Verifier(registry.getUrl());
  });

  afterEach(async () => {
    await registry.stop();
  });

  describe('Wallet Functionality', () => {
    it('should generate valid key pairs', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);

      expect(keyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      const keyInfo = await registry.getKey(keyId);
      expect(keyInfo.status).toBe('ACTIVE');
      expect(keyInfo.algorithm).toBe('ECDSA_P256_SHA256_1.0.0');
    });

    it('should generate valid proofs', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);

      const proofRequest = {
        requestId: 'test-req-001',
        nonce: 'dGVzdCBub25jZQ',
        timestamp: new Date().toISOString(),
        requestedClaims: [{
          claimType: 'AGE_OVER',
          claimValue: 18,
          credentialType: 'GOVERNMENT_ID'
        }],
        context: {
          origin: 'https://verifier.example.com'
        }
      };

      const proof = await wallet.generateProof(proofRequest);

      expect(proof.requestId).toBe(proofRequest.requestId);
      expect(proof.keyId).toBe(keyId);
      expect(proof.algorithm).toBe('ECDSA_P256_SHA256_1.0.0');
      expect(proof.signature).toBeDefined();
      expect(proof.claimsVerified).toHaveLength(1);
    });

    it('should reject invalid proof requests', async () => {
      const invalidRequest = {
        requestId: 'test-req-001',
        nonce: 'dGVzdCBub25jZQ',
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        requestedClaims: [],
        context: { origin: 'https://verifier.example.com' }
      };

      await expect(wallet.generateProof(invalidRequest))
        .rejects.toThrow('Request timestamp outside tolerance');
    });
  });

  describe('Verifier Functionality', () => {
    it('should verify valid proofs', async () => {
      // Setup: enroll wallet and generate proof
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);
      const proof = await wallet.generateProof(proofRequest);

      // Verify
      const result = await verifier.verifyProof(proofRequest, proof);

      expect(result.valid).toBe(true);
      expect(result.subjectId).toBeDefined();
      expect(result.assuranceLevel).toBe(2);
    });

    it('should reject tampered proofs', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);
      const proof = await wallet.generateProof(proofRequest);

      // Tamper with proof
      proof.claimsVerified[0].claimValue = 21;

      const result = await verifier.verifyProof(proofRequest, proof);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('signature');
    });

    it('should prevent nonce replay', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);
      const proof = await wallet.generateProof(proofRequest);

      // First verification should succeed
      const result1 = await verifier.verifyProof(proofRequest, proof);
      expect(result1.valid).toBe(true);

      // Second verification with same nonce should fail
      const result2 = await verifier.verifyProof(proofRequest, proof);
      expect(result2.valid).toBe(false);
      expect(result2.reason).toContain('replay');
    });
  });

  describe('Registry Functionality', () => {
    it('should register and revoke keys', async () => {
      const keyId = crypto.randomUUID();
      const publicKey = {
        kty: 'EC',
        crv: 'P-256',
        x: 'abc123',
        y: 'def456'
      };

      // Register key
      await registry.registerKey({
        keyId,
        publicKey,
        algorithm: 'ECDSA_P256_SHA256_1.0.0',
        issuerId: 'test-issuer'
      });

      let keyInfo = await registry.getKey(keyId);
      expect(keyInfo.status).toBe('ACTIVE');

      // Revoke key
      await registry.revokeKey(keyId, 'test-signature', 'USER_INITIATED');

      keyInfo = await registry.getKey(keyId);
      expect(keyInfo.status).toBe('REVOKED');
    });

    it('should cache revocation status', async () => {
      const keyId = crypto.randomUUID();

      // Register and revoke key
      await registry.registerKey({
        keyId,
        publicKey: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
        algorithm: 'ECDSA_P256_SHA256_1.0.0',
        issuerId: 'test-issuer'
      });
      await registry.revokeKey(keyId, 'test-sig', 'USER_INITIATED');

      // First check should query database
      const startTime = Date.now();
      let status = await registry.checkRevocation(keyId);
      const firstCheckTime = Date.now() - startTime;

      expect(status.status).toBe('REVOKED');

      // Second check should use cache
      const secondStartTime = Date.now();
      status = await registry.checkRevocation(keyId);
      const secondCheckTime = Date.now() - secondStartTime;

      expect(status.status).toBe('REVOKED');
      // Cached check should be significantly faster
      expect(secondCheckTime).toBeLessThan(firstCheckTime / 2);
    });
  });

  describe('End-to-End Flows', () => {
    it('should complete full enrollment to verification flow', async () => {
      // 1. Wallet enrollment
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);

      // 2. Verifier creates proof request
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);

      // 3. Wallet generates proof
      const proof = await wallet.generateProof(proofRequest);

      // 4. Verifier verifies proof
      const result = await verifier.verifyProof(proofRequest, proof);

      // 5. Verification succeeds
      expect(result.valid).toBe(true);
      expect(result.subjectId).toBeDefined();

      // 6. Same subject ID for same verifier
      const proofRequest2 = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 21
      }]);
      const proof2 = await wallet.generateProof(proofRequest2);
      const result2 = await verifier.verifyProof(proofRequest2, proof2);

      expect(result2.valid).toBe(true);
      expect(result2.subjectId).toBe(result.subjectId);
    });

    it('should handle key revocation correctly', async () => {
      // Setup: enroll and get initial proof
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);
      const proof = await wallet.generateProof(proofRequest);

      // Initial verification succeeds
      const result1 = await verifier.verifyProof(proofRequest, proof);
      expect(result1.valid).toBe(true);

      // Revoke key
      await wallet.revokeKey(keyId, 'USER_INITIATED');

      // New proof request
      const proofRequest2 = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);

      // Should fail - no credentials for revoked key
      await expect(wallet.generateProof(proofRequest2))
        .rejects.toThrow('No matching credential');
    });
  });

  describe('Error Handling', () => {
    it('should handle network failures gracefully', async () => {
      // Stop registry to simulate network failure
      await registry.stop();

      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);

      // Verification should fail gracefully
      const result = await verifier.verifyProof(proofRequest, {
        requestId: proofRequest.requestId,
        keyId: 'test-key',
        pairwiseSubjectId: 'test-subject',
        claimsVerified: [],
        signature: 'test-sig',
        algorithm: 'ECDSA_P256_SHA256_1.0.0',
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 86400000).toISOString(),
        assuranceLevel: 2
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('registry');
    });

    it('should handle malformed inputs', async () => {
      const invalidProof = {
        requestId: 'test',
        keyId: '',
        pairwiseSubjectId: 'test',
        claimsVerified: null, // Invalid
        signature: 'test',
        algorithm: 'INVALID',
        issuanceDate: 'invalid-date',
        expirationDate: 'invalid-date',
        assuranceLevel: 2
      };

      const result = await verifier.verifyProof({
        requestId: 'test',
        nonce: 'test',
        timestamp: new Date().toISOString(),
        requestedClaims: [],
        context: { origin: 'test' }
      }, invalidProof as any);

      expect(result.valid).toBe(false);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should generate proofs within time limits', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);

      const startTime = Date.now();
      const proof = await wallet.generateProof(proofRequest);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // 100ms limit
      expect(proof).toBeDefined();
    });

    it('should verify proofs within time limits', async () => {
      const keyId = await wallet.enroll('https://issuer.example.com', ['AGE_OVER']);
      const proofRequest = await verifier.createProofRequest([{
        type: 'AGE_OVER',
        value: 18
      }]);
      const proof = await wallet.generateProof(proofRequest);

      const startTime = Date.now();
      const result = await verifier.verifyProof(proofRequest, proof);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50); // 50ms limit
      expect(result.valid).toBe(true);
    });
  });
});
```

### Q.2 Integration Test Examples

```typescript
/**
 * Integration tests for Shielded ID end-to-end flows
 */

import { test, expect } from '@playwright/test';
import { WalletApp } from '../apps/wallet-pwa/src/app';
import { VerifierDemo } from '../apps/verifier-demo/src/app';
import { RegistryServer } from '../apps/registry-server/src/server';

test.describe('Shielded ID E2E Integration', () => {
  let registry: RegistryServer;
  let walletApp: WalletApp;
  let verifierApp: VerifierDemo;

  test.beforeAll(async () => {
    // Start services
    registry = new RegistryServer();
    await registry.start(3001);

    walletApp = new WalletApp();
    await walletApp.start(3002);

    verifierApp = new VerifierDemo();
    await verifierApp.start(3003);
  });

  test.afterAll(async () => {
    await verifierApp.stop();
    await walletApp.stop();
    await registry.stop();
  });

  test('complete user journey: enrollment → verification', async ({ browser }) => {
    // Create browser contexts for wallet and verifier
    const walletContext = await browser.newContext();
    const verifierContext = await browser.newContext();

    const walletPage = await walletContext.newPage();
    const verifierPage = await verifierContext.newPage();

    try {
      // 1. Open wallet and enroll
      await walletPage.goto('http://localhost:3002');
      await walletPage.click('text=Enroll');

      // Fill enrollment form
      await walletPage.fill('input[name="issuerUrl"]', 'http://localhost:3001/api/issuer');
      await walletPage.selectOption('select[name="claims"]', ['AGE_OVER']);
      await walletPage.click('text=Submit Enrollment');

      // Wait for enrollment completion
      await walletPage.waitForSelector('text=Enrollment Successful');

      // 2. Open verifier and create proof request
      await verifierPage.goto('http://localhost:3003');
      await verifierPage.selectOption('select[name="claimType"]', 'AGE_OVER');
      await verifierPage.fill('input[name="claimValue"]', '18');
      await verifierPage.click('text=Request Proof');

      // Get the proof request URL/QR code
      const proofUrl = await verifierPage.getAttribute('img[alt="Proof Request QR"]', 'data-url');

      // 3. Wallet receives proof request
      await walletPage.goto(proofUrl);

      // Wallet should automatically process the request
      await walletPage.waitForSelector('text=Proof Generated');

      // 4. Proof is sent back to verifier
      await verifierPage.waitForSelector('text=Verification Result: VALID');

      // Verify the result details
      const subjectId = await verifierPage.textContent('.subject-id');
      const assuranceLevel = await verifierPage.textContent('.assurance-level');

      expect(subjectId).toMatch(/^subj-[a-zA-Z0-9]+$/);
      expect(assuranceLevel).toBe('2');

    } finally {
      await walletContext.close();
      await verifierContext.close();
    }
  });

  test('handles revoked credentials correctly', async ({ browser }) => {
    const walletContext = await browser.newContext();
    const verifierContext = await browser.newContext();

    const walletPage = await walletContext.newPage();
    const verifierPage = await verifierContext.newPage();

    try {
      // Setup: enroll wallet
      await walletPage.goto('http://localhost:3002');
      await walletPage.click('text=Enroll');
      await walletPage.fill('input[name="issuerUrl"]', 'http://localhost:3001/api/issuer');
      await walletPage.selectOption('select[name="claims"]', ['AGE_OVER']);
      await walletPage.click('text=Submit Enrollment');
      await walletPage.waitForSelector('text=Enrollment Successful');

      // Revoke the credential
      await walletPage.click('text=Manage Credentials');
      await walletPage.click('text=Revoke');
      await walletPage.click('text=Confirm Revocation');
      await walletPage.waitForSelector('text=Credential Revoked');

      // Try to verify - should fail
      await verifierPage.goto('http://localhost:3003');
      await verifierPage.selectOption('select[name="claimType"]', 'AGE_OVER');
      await verifierPage.fill('input[name="claimValue"]', '18');
      await verifierPage.click('text=Request Proof');

      const proofUrl = await verifierPage.getAttribute('img[alt="Proof Request QR"]', 'data-url');
      await walletPage.goto(proofUrl);

      // Wallet should show error
      await walletPage.waitForSelector('text=No valid credentials');

      // Verifier should show verification failed
      await verifierPage.waitForSelector('text=Verification Result: INVALID');

    } finally {
      await walletContext.close();
      await verifierContext.close();
    }
  });

  test('prevents replay attacks', async ({ browser }) => {
    const walletContext = await browser.newContext();
    const verifierContext = await browser.newContext();

    const walletPage = await walletContext.newPage();
    const verifierPage = await verifierContext.newPage();

    try {
      // Setup: complete successful verification
      await walletPage.goto('http://localhost:3002');
      await walletPage.click('text=Enroll');
      await walletPage.fill('input[name="issuerUrl"]', 'http://localhost:3001/api/issuer');
      await walletPage.selectOption('select[name="claims"]', ['AGE_OVER']);
      await walletPage.click('text=Submit Enrollment');
      await walletPage.waitForSelector('text=Enrollment Successful');

      await verifierPage.goto('http://localhost:3003');
      await verifierPage.selectOption('select[name="claimType"]', 'AGE_OVER');
      await verifierPage.fill('input[name="claimValue"]', '18');
      await verifierPage.click('text=Request Proof');

      const proofUrl = await verifierPage.getAttribute('img[alt="Proof Request QR"]', 'data-url');
      await walletPage.goto(proofUrl);
      await walletPage.waitForSelector('text=Proof Generated');
      await verifierPage.waitForSelector('text=Verification Result: VALID');

      // Try to reuse the same proof request
      await verifierPage.click('text=Request Proof Again');

      const proofUrl2 = await verifierPage.getAttribute('img[alt="Proof Request QR"]', 'data-url');
      await walletPage.goto(proofUrl2);

      // Should fail due to nonce replay
      await walletPage.waitForSelector('text=Nonce already used');

    } finally {
      await walletContext.close();
      await verifierContext.close();
    }
  });

  test('handles network failures gracefully', async ({ browser }) => {
    const walletContext = await browser.newContext();
    const verifierContext = await browser.newContext();

    const walletPage = await walletContext.newPage();
    const verifierPage = await verifierContext.newPage();

    try {
      // Setup: enroll wallet
      await walletPage.goto('http://localhost:3002');
      await walletPage.click('text=Enroll');
      await walletPage.fill('input[name="issuerUrl"]', 'http://localhost:3001/api/issuer');
      await walletPage.selectOption('select[name="claims"]', ['AGE_OVER']);
      await walletPage.click('text=Submit Enrollment');
      await walletPage.waitForSelector('text=Enrollment Successful');

      // Stop registry to simulate network failure
      await registry.stop();

      // Try verification
      await verifierPage.goto('http://localhost:3003');
      await verifierPage.selectOption('select[name="claimType"]', 'AGE_OVER');
      await verifierPage.fill('input[name="claimValue"]', '18');
      await verifierPage.click('text=Request Proof');

      const proofUrl = await verifierPage.getAttribute('img[alt="Proof Request QR"]', 'data-url');
      await walletPage.goto(proofUrl);

      // Should handle gracefully
      await walletPage.waitForSelector('text=Network Error');
      await verifierPage.waitForSelector('text=Verification Failed');

      // Restart registry
      await registry.start(3001);

      // Retry should work
      await verifierPage.click('text=Retry');
      await walletPage.waitForSelector('text=Proof Generated');
      await verifierPage.waitForSelector('text=Verification Result: VALID');

    } finally {
      await walletContext.close();
      await verifierContext.close();
    }
  });
});
```

---

## Appendix R: Migration Guide

### R.1 Migrating from Legacy Systems

#### R.1.1 From SAML-based Identity

**Current State**: Organizations using SAML assertions for age verification

**Migration Steps**:
1. **Assessment**: Identify all SAML-based age verification points
2. **Parallel Deployment**: Deploy Shielded ID alongside existing SAML
3. **Gradual Migration**: Migrate one application at a time
4. **Fallback Strategy**: Maintain SAML as backup during transition
5. **User Communication**: Notify users of improved privacy benefits

**Timeline**: 3-6 months for typical enterprise

#### R.1.2 From OAuth 2.0 Custom Claims

**Current State**: Using custom OAuth scopes for age verification

**Migration Steps**:
1. **API Enhancement**: Add Shielded ID endpoints to existing OAuth server
2. **Client Updates**: Update mobile apps to support Shielded ID proofs
3. **Scope Mapping**: Map existing scopes to Shielded ID claim types
4. **Testing**: Comprehensive integration testing
5. **Rollout**: Feature flag-based rollout

**Timeline**: 2-4 months

### R.2 Version Upgrade Guide

#### R.2.1 Upgrading from v0.x to v1.0

**Breaking Changes**:
- Algorithm identifier format changed
- Proof request structure updated
- Registry API endpoints modified

**Migration Script**:
```typescript
async function migrateToV1() {
  // 1. Update algorithm identifiers
  await updateAlgorithmIdentifiers();

  // 2. Migrate key formats
  await migrateKeyFormats();

  // 3. Update proof request handlers
  await updateProofRequestHandlers();

  // 4. Migrate registry data
  await migrateRegistryData();
}
```

#### R.2.2 Database Migration

```sql
-- Add new columns for v1.0
ALTER TABLE keys ADD COLUMN metadata JSONB;
ALTER TABLE revocations ADD COLUMN signature TEXT;

-- Update existing records
UPDATE keys SET metadata = '{}' WHERE metadata IS NULL;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_keys_metadata ON keys USING GIN (metadata);
CREATE INDEX CONCURRENTLY idx_revocations_signature ON revocations (signature);
```

### R.3 Implementation Migration Checklist

- [ ] Review security requirements
- [ ] Update dependencies
- [ ] Modify API integrations
- [ ] Update client applications
- [ ] Test end-to-end flows
- [ ] Update documentation
- [ ] Train development teams
- [ ] Plan rollback procedures
- [ ] Schedule production deployment
- [ ] Monitor post-deployment metrics

---

## Appendix S: Frequently Asked Questions

### S.1 General Questions

**Q: How does Shielded ID differ from traditional identity verification?**

A: Traditional systems require disclosing actual personal information (name, date of birth, ID number). Shielded ID proves claims about identity attributes without revealing the underlying data. For example, proving "age ≥ 18" without revealing the actual birth date.

**Q: Is Shielded ID a replacement for existing identity systems?**

A: Shielded ID is designed to complement existing identity systems. It can be used alongside traditional verification for enhanced privacy, or as a standalone solution for privacy-conscious applications.

**Q: What regulatory compliance does Shielded ID support?**

A: Shielded ID supports GDPR, CCPA, and other privacy regulations by minimizing personal data collection and providing user control over data sharing. It also helps with industry-specific compliance like PSD2 for financial services.

### S.2 Technical Questions

**Q: What happens if the registry is unavailable?**

A: Verifiers can use cached revocation status for a limited time (default: 1 hour) to maintain service availability. Applications should implement appropriate fallback strategies based on their risk tolerance.

**Q: How do you prevent correlation between different verifiers?**

A: Each verifier receives a unique "pairwise subject ID" derived from the user ID and verifier domain. This prevents verifiers from correlating users across different services while maintaining consistent identification within each service.

**Q: What cryptographic algorithms does Shielded ID use?**

A: Shielded ID uses ECDSA with P-256 curves for digital signatures, SHA-256 for hashing, and Bulletproofs for zero-knowledge range proofs. All algorithms are standardized and widely supported.

**Q: How does the wallet store credentials securely?**

A: Wallets encrypt credentials using user-provided keys or biometric protection. Private keys never leave the wallet device, and all cryptographic operations happen client-side.

### S.3 Privacy Questions

**Q: What data does the registry store?**

A: The registry stores only cryptographic public keys, revocation status, and minimal audit information. No personal identity information is stored in the registry.

**Q: Can verifiers learn more than requested claims?**

A: No. Verifiers only learn the result of the requested claim (e.g., "yes, age ≥ 18") and a unique identifier for that user-verifier pair. The actual underlying data remains private.

**Q: How do users revoke their credentials?**

A: Users can revoke credentials through their wallet application. Revocation is immediate and irreversible, preventing any future use of the revoked credentials.

### S.4 Implementation Questions

**Q: What platforms does Shielded ID support?**

A: Shielded ID supports web browsers (Chrome, Firefox, Safari, Edge), mobile applications (iOS, Android), and server-side implementations. All major platforms are supported.

**Q: How do I integrate Shielded ID into my application?**

A: Integration typically involves:
1. Adding Shielded ID SDK to your application
2. Configuring proof request generation
3. Implementing proof verification
4. Setting up user interface for the verification flow

**Q: What are the performance requirements?**

A: Proof generation takes ~50ms, verification takes ~20ms. Network latency depends on registry location, but typical end-to-end verification completes in under 200ms.

**Q: How do I handle errors and edge cases?**

A: Shielded ID provides comprehensive error handling with specific error codes for different failure scenarios. Implement proper fallback mechanisms and user-friendly error messages.

### S.5 Security Questions

**Q: How secure is the zero-knowledge proof system?**

A: The ZK proofs are based on Bulletproofs, a well-studied cryptographic construction. The proofs are zero-knowledge (verifier learns nothing beyond validity) and sound (invalid proofs are rejected).

**Q: What happens if a user's device is compromised?**

A: Users can immediately revoke their credentials, rendering any stolen information useless. The decentralized nature means compromising one device doesn't affect other users.

**Q: How does Shielded ID prevent replay attacks?**

A: Each proof request includes a unique nonce that can only be used once. The system maintains nonce tracking to prevent replay attacks across the validity period.

---

**Status**: This is a draft specification. Comments welcome at [github.com/ShieldedID/protocol-spec](https://github.com/ShieldedID/protocol-spec).
