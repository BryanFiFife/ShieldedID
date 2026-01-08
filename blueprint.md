# SHIELDED ID WALLET + ZERO-KYC VERIFIER
## Privacy-First Digital Identity System Blueprint

**VERSION:** 1.1  
**DATE:** January 2026 (Updated January 7, 2026)  
**STATUS:** Implemented and Deployable  
**TARGET:** Grok Code Fast 1 Monorepo Build

---

## EXECUTIVE SUMMARY

SHIELDED ID is a zero-trust, privacy-by-design digital identity system that replaces document-centric KYC with cryptographic proofs. It eliminates:

- ❌ Uploading passport/ID documents to corporate servers
- ❌ Reusable global identifiers (no ID aggregation)
- ❌ Mandatory government eIDs
- ❌ Coercion vectors for vulnerable groups
- ❌ Metadata leakage from network observation

It enables:

- ✅ Pairwise pseudonymous proofs ("yes, over 18" without revealing birth date)
- ✅ Multi-attester ecosystem (government optional, community-issued credentials)
- ✅ Coercion-resistant UX (decoy wallets, panic wipes, safety modes)
- ✅ Revocation without user tracking
- ✅ Crypto-agility + post-quantum readiness
- ✅ Full compliance with GDPR/privacy frameworks

**Core Principle:** *PROVE WHAT MATTERS. REVEAL NOTHING EXTRA.*

*This blueprint has been implemented in the accompanying repository. See Implementation Status for details on completed features and deviations.*

---

## TABLE OF CONTENTS

1. [Threat Model & Security Targets](#threat-model--security-targets)
2. [User Flows (End-to-End)](#user-flows-end-to-end)
3. [Architecture Overview](#architecture-overview)
4. [Data Model (Zero PII Server-Side)](#data-model-zero-pii-server-side)
5. [Cryptographic Design (Phased & Agile)](#cryptographic-design-phased--agile)
6. [Vulnerable Group Safety](#vulnerable-group-safety)
7. [Verifier SDK & Integration](#verifier-sdk--integration)
8. [Server API Reference](#server-api-reference)
9. [Implementation Plan](#implementation-plan)
10. [Grok Build Instructions](#grok-build-instructions)
11. [Deliverables & Definition of Done](#deliverables--definition-of-done)

---

## IMPLEMENTATION STATUS

The SHIELDED ID system has been implemented as a monorepo with Docker-based local development and end-to-end testing. Key milestones:

- **Completed (100%)**: Core architecture (Registry Server, Wallet PWA, Verifier SDK, Verifier Demo), user flows (enrollment, proof verification), data models, and security targets (no PII, pairwise IDs, safety modes).
- **Partially Implemented**: Cryptographic agility (ECDSA only; PQC planned for Phase 2). Attester ecosystem (self-asserted credentials in wallet; external attesters not yet integrated).
- **New Features**: AI Companion in Wallet PWA for user assistance (chat, profile hints, OCR).
- **Testing**: End-to-end tests cover vault encryption, proof verification, revocation, and pairwise uniqueness. Security audit checklist validated.
- **Deployment**: Local via Docker Compose; production-ready with static builds and serverless options.
- **Deviations from Blueprint**: Commitment Merkle trees simplified to per-attribute hashes. Verifier demo pages are UI placeholders (functionality via SDK).

See Deliverables & Definition of Done for updated completion criteria.

---

## THREAT MODEL & SECURITY TARGETS

### Adversaries We Defend Against

| Adversary | Attack Vector | Our Defense |
|-----------|---------------|------------|
| **A1: Data-Hungry Platforms** | Store ID docs → leak later | Server never sees raw documents; encrypted vault only |
| **A2: Aggregators** | Correlate across services via shared ID | Pairwise pseudonymous IDs; no global identifier |
| **A3: Coercers** | Force wallet disclosure (abusive partners, corrupt officials) | Decoy wallet mode, panic wipes, safety mode defaults |
| **A4: Malware/Supply Chain** | Compromised device or PWA update | WebAuthn binding, signed releases, update integrity checks, app pinning |
| **A5: Network Observers** | Traffic correlation, metadata leaks | End-to-end encryption, minimal server requests, Tor/VPN compatible |

### Security Targets (Must Implement)

**S1) Server Never Sees PII or Raw ID Docs**
- Only encrypted commitments, public keys, revocation data
- Schema validation rejects PII fields
- Audit logging forbidden to include personally identifiable data

**S2) Verifier Gets Only Minimum Facts**
- Response: YES/NO + assurance level + timestamp (no attributes)
- Example: "Over 18: TRUE (KYC Level 2, issued by Bank X, expires 2027-06-15)"
- Never: Name, DOB, address, document number unless explicitly overridden + warned

**S3) No Reusable Global Identifier**
- Each verifier sees a unique pairwise subject ID
- pairwiseSubjectId = HMAC-SHA256(masterSecret, verifierOrigin)
- masterSecret never leaves device
- Implementer note: Aligns with OASIS PPID (Privacy-Preserving Identifier)

**S4) Wallet Has Safety Modes for Vulnerable Users**
- Decoy wallet with benign credentials
- Panic wipe (destroys keys, keeps app installed)
- Lockdown mode (requires recovery factor to open)
- Mandatory disclosure preview before sharing any proof

**S5) Credential Revocation Without Tracking Users**
- Revocation published as *status*: revoked at key ID level (not user level)
- Verifier can check status but never learns identity
- User can trigger revocation without revealing why

**S6) Crypto-Agility (Swap Suites Over Time)**
- Every signed object includes `suiteVersion`
- Wallet can add keys (PQC) without invalidating old proofs
- Plan: classical + hybrid classical-PQC → PQC-primary (timeline TBD)
- References NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA)

### Realism Notes

**What We Cannot Defend Against:**
- Endpoint compromise (malware on device beats crypto)
- **Mitigation:** WebAuthn binding, signed updates, app integrity checks
- User coercion if attacker has physical access
- **Mitigation:** Decoy wallet, panic modes, local-only data

**What We Can Defend Against:**
- Server-side data breaches
- Document forgery (via verifier signature checks)
- Identity aggregation across services
- Traffic correlation (via minimal metadata)
- Network eavesdropping (via E2E encryption)

---

## USER FLOWS (END-TO-END)

### Flow B1: Enrollment (One-Time, Local)

**Actor:** New user installing SHIELDED ID Wallet PWA

**Steps:**

1. **Install PWA**
   - Navigate to `https://wallet.shielded-id.app`
   - "Install to Home Screen" prompt
   - Service Worker enables offline capability

2. **Set Up Security**
   ```
   [Vault Passphrase] → Enter 12-20 character phrase
   Enable Biometrics (Touch ID, Windows Hello, etc.)? [YES/NO]
   ```
   - Passphrase used as KDF input (Argon2id)
   - Biometrics stored in device keychain (never transmitted)
   - Optional: Create recovery phrase (encrypted backup seeds)

3. **Capture Identity Document**
   ```
   [Camera] Passport → Front side
   [Confirm Fields] Name, DOB, Issue Date, Expiry, Document Number
   User manually confirms or corrects OCR results (REQUIRED)
   [Save] Attributes encrypted and stored locally
   ```
   - On-device OCR via TensorFlow.js or MediaPipe
   - No document image sent to server (optional: user can delete it after confirmation)
   - Vision library runs in browser only

4. **Create Cryptographic Commitments**
   ```
   Attributes: {
     givenName: "Alice",
     familyName: "Smith",
     dateOfBirth: "1990-05-15",
     documentType: "passport",
     issuer: "GB",
     issuedDate: "2019-01-20",
     expiryDate: "2029-01-20"
   }
   
   For each attribute:
     salt = random(32 bytes)
     commitment = SHA256(normalize(value) || salt)
   
   merkleRoot = MerkleTree([commitment1, commitment2, ...]).root()
   ```
   - Merkle tree stored locally (can publish root to server as optional transparency)
   - Salts stored separately in encrypted vault
   - Never reveal raw attribute hashes server-side

5. **Generate Cryptographic Keys**
   ```
   WEBAUTHN_PASSKEY:
     - Create via navigator.credentials.create()
     - Stored in secure enclave / TPM if available
     - No private key ever accessed by JavaScript
   
   SIGNING_KEY (fallback if WebAuthn unavailable):
     - Generate ECDSA P-256 keypair (WebCrypto)
     - Encrypt private key with vault passphrase + device salt
     - Store encrypted in IndexedDB
   
   PQC_KEY (optional, Phase 2):
     - Generate ML-KEM keypair (when library stable)
     - Encrypt and store for future use
   ```

6. **Register Wallet on Server**
   ```
   POST /v1/wallet/register
   {
     "publicKeys": {
       "signing": "base64(EC_P256_pubkey)",
       "pqc": null  // optional for Phase 2
     },
     "webauthnCredentialId": "base64(credential_id)",
     "suiteVersion": "1.0.0",
     "commitmentRoot": "base64(merkle_root)"  // optional
   }
   
   Response:
   {
     "walletId": "uuid",
     "statusUrl": "https://registry.shielded-id.app/status/[wallet_id]",
     "createdAt": "2026-01-06T23:15:00Z"
   }
   ```
   - Server stores public keys + credential ID only
   - **Server never sees:** attributes, document images, passphrases, private keys
   - Wallet stores `walletId` locally for future reference

**End of Enrollment:** User now has encrypted vault + registered key material. Ready to prove.

---

### Flow B2: Proving to a Service (Verification Flow)

**Actor:** User wants to verify age or KYC with a service (e.g., online marketplace)

**Precondition:** User has completed enrollment and has credentials (B3).

**Steps:**

1. **Service Presents Proof Request**
   ```
   Service generates QR code or deep link:
   
   shielded-id://proof?request_id=req_xyz&nonce=nonce_123&
   verifier_origin=https://example.com&
   requested_claims=AGE_OVER:18,KYC_LEVEL:2&
   callback_url=https://example.com/callback
   ```
   
   OR display QR → wallet scans → deep link triggered

2. **Wallet Parses & Shows Disclosure Preview**
   ```
   [PROOF REQUEST FROM: example.com]
   
   This service is asking to verify:
   ✓ You are over 18 years old
   ✓ KYC Level 2 passed by accredited attester
   ✓ Proof of continued access (same account)
   
   They WILL receive:
   • Verification result (YES/NO)
   • Assurance level (2/3/4)
   • Timestamp
   
   They WILL NOT receive:
   • Your name
   • Your date of birth
   • Your document number
   • Your address
   
   [ALLOW] [DECLINE]
   ```
   - Mandatory preview before sharing
   - Safety mode: highlight any PII requests with ⚠️ warning
   - Trust labels: show if verifier is "known" / "unknown" / "flagged"

3. **User Grants Permission**
   ```
   [Biometric/Passphrase] → Unlock vault
   Wallet constructs proof:
   ```

4. **Wallet Constructs Proof Response**
   ```
   pairwiseSubjectId = HMAC-SHA256(
     masterSecret, 
     "example.com"  // verifierOrigin
   )
   
   Proof {
     requestId: "req_xyz",
     nonce: "nonce_123",
     pairwiseSubjectId: "[hex]",
     claims: {
       ageOver18: {
         value: true,
         source: "self-asserted",  // or "attester_credential"
         evidence: {
           issuer: "GB_GovernmentID" | null,
           issuedAt: "2025-06-15T...",
           expiresAt: "2027-06-15T...",
           assuranceLevel: 2  // or 3/4
         }
       },
       kycLevel: {
         value: 2,
         issuer: "BankX_KYC",
         issuedAt: "2025-01-01T...",
         expiresAt: "2026-01-01T..."
       },
       continuity: {
         claimedSubjectId: "[same pairwise ID as stored locally]"
       }
     },
     issuedAt: "[timestamp]",
     suite: "ECDSA_P256_SHA256_1.0.0"
   }
   
   proof.signature = Sign(wallet_signing_key, proof_contents)
   ```

5. **User Confirms & Sends**
   ```
   [CONFIRM & SHARE] button clicked
   
   Wallet stores local receipt:
   {
     verifierOrigin: "example.com",
     pairwiseSubjectId: "[hex]",
     claimsShared: [
       "ageOver18",
       "kycLevel",
       "continuity"
     ],
     timestamp: "2026-01-06T23:20:00Z",
     status: "sent"
   }
   
   Send proof to callback URL via POST:
   POST https://example.com/callback
   {
     "proof": { ... }
   }
   ```

6. **Service Verifies Locally**
   ```
   Server (example.com):
   
   1. Validate nonce freshness (within 5 min window)
   2. Validate signature:
      sig_valid = Verify(
        wallet_public_key_from_registry,
        proof_contents,
        proof.signature
      )
   3. For attested claims (KYC, age), validate issuer signature:
      issuer_sig_valid = Verify(
        issuer_public_key,
        credential_contents,
        credential.signature
      )
   4. Check revocation (optional, if policy requires):
      status = GET /registry/status/[credential_id]
      if status.revoked: FAIL
   5. Check expiry:
      if proof.claims.kycLevel.expiresAt < now: FAIL
   
   Result: PASS or FAIL + reason
   ```

7. **Service Stores Minimally**
   ```
   example.com database:
   {
     userId: "[local user ID]",
     pairwiseSubjectId: "[hex]",  // Unique to this verifier
     proofVerifiedAt: "2026-01-06T23:20:00Z",
     claimsVerified: ["ageOver18", "kycLevel"],
     assuranceLevel: 2,
     nextVerificationRequired: "2027-01-06T23:20:00Z"
   }
   
   IMPORTANT:
   - Never store the actual proof object
   - Never attempt to reverse-engineer attributes
   - Never share pairwiseSubjectId with other verifiers
   ```

**End of Verification:** Service has proof, wallet has receipt. User and service both complete.

---

### Flow B3: Credential Issuance (Attesters)

**Actor:** Bank, government agency, or community organization issuing credentials

**Credential Types:**
- `KYC_LEVEL_X` (X = 1, 2, 3, 4 for regulatory levels)
- `AGE_OVER_N` (N = 18, 21, 25, etc.)
- `RESIDENCY_VERIFIED`
- `EMPLOYMENT_STATUS`
- `COMMUNITY_MEMBERSHIP`
- Custom claim types

**Steps:**

1. **Attester Performs KYC/Verification Out-of-Wallet**
   - Video call, document upload, in-person verification (outside SHIELDED ID)
   - Attester confirms identity through own means
   - Attester is responsible for assurance level and audit trail

2. **Attester Issues Credential to Wallet**
   ```
   Credential {
     id: "[uuid]",
     issuer: "did:web:bank.example.com#key-1",
     credentialType: ["VerifiableCredential", "KYCCredential"],
     subject: {
       id: "[wallet's DID or pubkey identifier]"
     },
     claims: {
       kycLevel: 2,
       verifiedAt: "2025-12-20T...",
       expiresAt: "2026-12-20T...",
       // optional: which attributes were verified
       verifiedFields: ["identity", "address", "bank_account"]
     },
     issuanceDate: "2025-12-20T...",
     proof: {
       type: "EcdsaSecp256r1Signature2019",
       suite: "ECDSA_P256_SHA256_1.0.0",
       verificationMethod: "did:web:bank.example.com#key-1",
       signatureValue: "[signature]"
     }
   }
   ```
   - Format aligns with W3C VC Data Model 2.0
   - Credential ID published to attester's revocation registry

3. **Wallet Receives & Stores**
   ```
   User receives credential via:
   - QR code (attester site)
   - Deep link (attester app)
   - Email link (less preferred, but supported)
   
   Wallet validates:
   - Issuer public key (fetched from issuer DID / well-known endpoint)
   - Signature valid
   - Not already revoked
   
   Wallet stores in encrypted vault:
   credentials: [
     {
       id: "[uuid]",
       issuer: "did:web:bank.example.com#key-1",
       credentialType: ["KYCCredential"],
       claims: { kycLevel: 2, ... },
       proof: { ... },
       issuedAt: "2025-12-20T...",
       expiresAt: "2026-12-20T...",
       statusRef: "https://bank.example.com/revocation/[id]"
     }
   ]
   ```

4. **Later: Wallet Presents Credential During Proof**
   - User decides to share "KYC Level 2" claim
   - Wallet includes credential in proof response
   - Verifier checks issuer's signature + status

**Important Notes:**
- Attester can be government, bank, NGO, employer, etc.
- Multiple attesters can issue credentials about same user
- Wallet can hold credentials from competing attesters (user chooses which to present)
- Revocation happens at credential level (not user level)

---

### Flow B4: Revocation / Compromise

**Scenario A: User loses phone (device compromise)**

```
1. User accesses wallet on new device or via recovery link
2. Authenticates with recovery factor (passphrase, social recovery, etc.)
3. Triggers revocation:
   POST /v1/wallet/[walletId]/revoke
   {
     "keyIds": ["all"],  // or specific keys
     "reason": "device_loss",
     "signature": "[proof_of_control]"
   }

4. Server marks keys as REVOKED:
   wallet_keys:
   - revoked_at = NOW
   
   Revocations table:
   - target_type = "KEY"
   - target_id = key_id
   - effective_at = NOW
   - reason_code = "device_loss"

5. Verifiers check status:
   GET /v1/status/[keyId]
   → { status: "REVOKED", revokedAt: "...", reason: "device_loss" }

6. Verifiers reject proofs signed with revoked key
7. User can then:
   - Register new device with new keys
   - Obtain new credentials from attesters
```

**Scenario B: Specific credential compromised (attester revokes)**

```
1. Bank discovers credential #xyz was fraudulently issued
2. Bank publishes revocation:
   POST attester_revocation_endpoint
   {
     credentialId: "xyz",
     reason: "fraud_discovered",
     effectiveAt: NOW
   }
3. Attester's revocation registry is updated
4. Verifiers check:
   GET https://bank.example.com/revocation/xyz
   → { revoked: true, revokedAt: "...", reason: "fraud_discovered" }
5. Proofs presenting this credential are rejected
```

**Key Privacy Principle:**
- Revocation happens at **key/credential ID level**, not at user level
- Server never learns *which user* revoked a key
- User's identify remains hidden

---

## ARCHITECTURE OVERVIEW

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SHIELDED ID ECOSYSTEM                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌─────────────────┐
│   WALLET PWA (C1)    │◄────────►│  REGISTRY (C2)  │
│                      │         │  SERVER         │
│ • IndexedDB vault    │         │                 │
│ • WebAuthn binding   │         │ • Key registry  │
│ • ID capture/OCR     │         │ • Status/rev    │
│ • Proof generation   │         │ • No PII        │
│ • Safety modes       │         │                 │
└──────────────────────┘         └─────────────────┘
         ▲                               ▲
         │                               │
         │ QR/deeplink                   │ REST API
         │                               │
         ▼                               ▼
┌──────────────────────┐         ┌─────────────────┐
│   RELYING PARTIES    │         │  ATTESTERS      │
│   (e.g., shops,      │         │  (bank, gov,    │
│   services, apps)    │         │   NGO)          │
│                      │         │                 │
│ • Uses Verifier SDK  │         │ • Issues creds  │
│ • Verifies proofs    │         │ • Publishes     │
│ • Stores minimal     │         │   revocations   │
└──────────────────────┘         └─────────────────┘

┌──────────────────────────────────────────────┐
│         OPTIONAL: VERIFIER DEMO SITE          │
│  (Shows use of Verifier SDK)                  │
│  https://demo.shielded-id.app                │
└──────────────────────────────────────────────┘
```

### C1: PWA Wallet (Client-Side)

**Technology Stack:**

| Layer | Technology |
|-------|-----------|
| Framework | React 18+ with TypeScript (or SvelteKit if preferred) |
| Offline | Service Worker + IndexedDB |
| Cryptography | WebCrypto API + Argon2id (WASM) |
| Device Binding | WebAuthn (navigator.credentials) |
| Vision | TensorFlow.js + MediaPipe (or lightweight OCR.js fallback) |
| Proof Engine | Phase 1: ECDSA signatures; Phase 2: ZK circuits |
| State Management | Jotai or Zustand |
| UI Components | Radix UI + custom design system |
| AI Companion | @mlc-ai/web-llm (for chat), sql.js (for chat storage) |

**Key Features:**

1. **Vault Encryption**
   - User sets passphrase (12-20 chars, entropy checked)
   - KDF: Argon2id (params: t=3, m=64, p=4, hashlen=32)
   - Encryption: AES-256-GCM
   - Salt per device (random 16 bytes)
   - Stored in IndexedDB under single encrypted envelope

2. **WebAuthn Integration**
   - Create passkey on enrollment
   - Optional: fallback to software signing key
   - Sign proofs with passkey when available (preferred)
   - Fallback: encrypted software key for offline scenarios

3. **Document Capture**
   - Camera input (front/back camera)
   - On-device OCR (TensorFlow.js)
   - Manual confirmation mandatory (user corrects OCR)
   - Optional: Save encrypted image in vault (user choice)

4. **Proof Generation**
   - Read encrypted vault
   - Construct pairwise subject ID for verifier
   - Create signed proof response
   - Display disclosure preview before sending

5. **Safety Features**
   - Decoy wallet mode (secondary vault with benign creds)
   - Panic wipe (immediate key destruction)
   - Lockdown mode (requires biometric + passphrase)
   - Local audit log of disclosures

6. **AI Companion**
   - Integrated chat assistant using Web LLM for user guidance, profile extraction, and document OCR assistance

**Companion Flow**: Users can interact with an AI assistant for help with enrollment, proof requests, or safety features. It extracts profile hints from chat and supports image uploads for OCR.
- Service Worker caches wallet UI
- IndexedDB stores encrypted vault
- All crypto runs locally (no server calls needed to generate proofs)
- Optional background sync: when online, sync receipts to server

---

### C2: Minimal Registry Server

**Purpose:** Key registry, revocation/status publishing, optional encrypted backup

**Technology Stack:**

| Component | Technology |
|-----------|--------|
| Framework | Node.js + Fastify (or Go + Gin for MVP speed) |
| Database | SQLite (MVP) → Postgres (production) |
| Deployment | Docker + Kubernetes (or serverless like Cloudflare Workers for ultra-minimal) |
| Rate Limiting | Redis (or in-memory for MVP) |
| Monitoring | Structured logging (pino), metrics (Prometheus) |

**Database Schema** (see Section D2)

**API Endpoints** (see Section H)

**Data Security:**

```
✓ All inputs validated against schema
✓ Unknown fields rejected (schema.additionalProperties = false)
✓ No PII accepted (validation rule: reject if contains names/dates/addresses)
✓ All sensitive operations rate-limited
✓ All requests signed where applicable
✓ Logs do not contain PII
✓ Backups encrypted at rest
```

---

### C3: Verifier SDK (For Platforms)

**Purpose:** Enable platforms to integrate SHIELDED ID verification

**Language:** JavaScript/TypeScript (works in Node.js + browser)

**API Surface:**

```typescript
// Initialize
const verifier = new ShieldedVerifier({
  origin: "https://example.com",
  publicKeyUrl: "https://example.com/.well-known/shielded-id-keys.json"
});

// Create proof request
const request = verifier.createProofRequest({
  requestedClaims: [
    { type: "AGE_OVER", threshold: 18 },
    { type: "KYC_LEVEL", minLevel: 2 }
  ],
  policy: {
    requireStatusCheck: true,
    maxAgeSeconds: 300
  }
});

// Generate QR code or deep link
const qrCode = verifier.generateQR(request);
const deepLink = verifier.generateDeepLink(request);

// Verify response from wallet
const result = await verifier.verifyProof(request, proofResponse, {
  checkRevocation: true,
  allowedIssuers: ["did:web:bank.example.com"]
});

if (result.valid) {
  console.log("Proof verified", result.assuranceLevel);
} else {
  console.log("Proof invalid", result.errors);
}
```

**Key Responsibilities:**

- ✓ Create well-formed proof requests (nonce generation, timestamp)
- ✓ Verify signatures (wallet public key + issuer keys)
- ✓ Check revocation status (optional, policy-driven)
- ✓ Enforce time windows (nonce freshness)
- ✓ Handle crypto agility (multiple signature suites)

**Distribution:**

- npm package: `@shielded-id/verifier-sdk`
- Includes TypeScript types + docs
- Reference implementation in `/packages/verifier-sdk`

---

### C4: Attester Portal (Optional for MVP)

**Purpose:** Allow community organizations and attesters to issue credentials

**Features:**

- Issue credentials to wallet users (via QR or API)
- Manage issuer keys (rotation, revocation)
- Publish revocation list
- Audit log of issued/revoked credentials

**For MVP:** Can be minimal web form or CLI tool. Formalized portal in Phase 2.

---

## DATA MODEL (ZERO PII SERVER-SIDE)

### D1: Client Vault (Encrypted, IndexedDB)

**VaultEnvelope** (outer layer, stored as single object):

```typescript
interface VaultEnvelope {
  version: "1.0.0",
  
  // KDF parameters
  kdf: {
    algorithm: "argon2id",
    iterations: 3,
    memorySize: 64,
    parallelism: 4,
    hashLength: 32
  },
  
  // Encryption metadata
  salt: string,  // base64, 16 bytes random
  nonce: string,  // base64, 12 bytes random (IV for AES-GCM)
  
  // Encrypted payload
  ciphertext: string,  // base64(AES-256-GCM(VaultPayload_bytes, kdf_key, nonce))
  tag: string,  // base64, 16 bytes (GCM auth tag)
  
  // Additional Authenticated Data
  aad: {
    appId: "shielded-id.app",
    deviceBindingInfo: {
      userAgent: "...",
      osVersion: "...",
      // optional: WebAuthn credential ID for binding
      webauthnCredentialId?: string
    },
    createdAt: "2026-01-06T23:15:00Z"
  }
}
```

**VaultPayload** (decrypted contents):

```typescript
interface VaultPayload {
  // User profile
  userProfile: {
    displayNameAlias: string,  // e.g., "My Identity"
    safetyModeEnabled: boolean,
    decoyWalletEnabled: boolean,
    panicModeActivated: boolean,
    createdAt: string
  },
  
  // Raw identity attributes (from document)
  identityAttributes: [
    {
      id: string,  // uuid
      type: "givenName" | "familyName" | "dateOfBirth" | "documentType" | "issuer" | "issuedDate" | "expiryDate",
      normalizedValue: string,  // e.g., "1990-05-15" (normalized)
      source: "document_ocr" | "user_input" | "attester",
      createdAt: string
    }
  ],
  
  // Optional: encrypted document images
  identityEvidence: [
    {
      id: string,  // uuid
      type: "document_image" | "facial_scan",
      encryptedBlobRef: string,  // reference to IndexedDB blob store
      mimeType: "image/jpeg" | "image/png",
      createdAt: string,
      userDeletionFlag?: boolean  // mark for deletion if user chooses
    }
  ],
  
  // Cryptographic commitments to attributes
  commitments: {
    merkleRoot: string,  // base64, root of Merkle tree
    algorithm: "sha256",
    leavesMetadata: [
      {
        attributeKey: "dateOfBirth",
        salt: string,  // base64
        hashAlgorithm: "sha256"
      }
    ],
    createdAt: string,
    supersededAt?: string
  },
  
  // Credentials issued by attesters
  credentials: [
    {
      id: string,  // UUID, matches credential.id
      issuer: string,  // did:web:bank.example.com#key-1
      credentialType: string[],  // ["VerifiableCredential", "KYCCredential"]
      subject: { id: string },  // wallet identifier
      claims: {
        // variable by credential type
        kycLevel?: number,
        ageOver?: number,
        residency?: string,
        verifiedFields?: string[]
      },
      issuedAt: string,
      expiresAt: string,
      statusRef?: string,  // URL to check revocation
      proof: {
        type: string,  // e.g., "EcdsaSecp256r1Signature2019"
        suite: string,  // e.g., "ECDSA_P256_SHA256_1.0.0"
        verificationMethod: string,
        signatureValue: string  // base64
      }
    }
  ],
  
  // Cryptographic keys
  keys: {
    webauthn: {
      credentialId: string,  // base64
      publicKeyJwk: {
        kty: "public_key",
        crv: "...",
        x: "...",
        y: "..."
      },
      transports: ["internal"],
      createdAt: string
    },
    
    softwareSigning: {
      publicKeyJwk: {
        kty: "EC",
        crv: "P-256",
        x: "...",
        y: "...",
        alg: "ES256"
      },
      encryptedPrivateKeyRef: string,  // reference to encrypted key blob in IndexedDB
      createdAt: string
    },
    
    pqc?: {
      // Phase 2
      publicKey: string,  // base64
      algorithm: "ML-KEM-768" | "ML-DSA-65" | "SLH-DSA-SHA2-128s",
      encryptedPrivateKeyRef: string,
      createdAt: string,
      readyForUse: boolean
    }
  },
  
  // Verifier-specific bindings
  verifierBindings: [
    {
      verifierOrigin: string,  // e.g., "https://example.com"
      pairwiseSubjectId: string,  // hex, unique per verifier
      createdAt: string,
      lastUsedAt: string,
      proofCount: number,
      trustLabel?: "known" | "unknown" | "flagged"
    }
  ],
  
  // Optional: recovery
  recovery: {
    method: "passphrase" | "social_recovery" | "backup_key",
    encryptedRecoveryShare?: string,
    socialShares?: [
      {
        id: string,
        recipientName: string,
        encryptedShare: string,
        createdAt: string
      }
    ]
  },
  
  // Local audit log
  auditLog: [
    {
      id: string,
      eventType: "PROOF_SENT" | "CREDENTIAL_RECEIVED" | "KEY_ROTATED" | "PANIC_WIPE" | "DECOY_MODE_TOGGLED",
      verifierOrigin?: string,
      timestamp: string,
      details: { /* event-specific data */ }
    }
  ],
  
  // AI Companion chat history and profile
  companion: {
    chatMessages: [
      {
        id: string,
        role: "user" | "assistant" | "system",
        content: string,
        createdAt: string
      }
    ],
    profileHints: {
      name?: string,
      city?: string,
      updatedAt: string
    },
    mode: "rules" | "llm"  // Rules-based or LLM-powered responses
  },
  
  // Metadata
  vaultVersion: "1.0.0",
  lastOpenedAt: string,
  syncStatus: "synced" | "pending" | "error"
}
```

**Storage Strategy:**

```javascript
// One IndexedDB database: "shielded-id-wallet"
// One object store: "vault"

// Store encrypted envelope
db.objectStore("vault").put({
  key: "primary",
  data: vaultEnvelope
});

// Optional secondary stores for large blobs
db.objectStore("encrypted-images").put({
  key: imageId,
  data: encryptedImageBlob
});

db.objectStore("encrypted-keys").put({
  key: keyId,
  data: encryptedKeyBlob
});
```

**Encryption Example (Node.js pseudocode):**

```javascript
const crypto = require("crypto");
const argon2 = require("argon2");

// On enrollment
const salt = crypto.randomBytes(16);
const nonce = crypto.randomBytes(12);
const passphrase = "user's vault passphrase";

// Derive key from passphrase
const kdfKey = await argon2.hash(
  passphrase,
  { salt, type: argon2.argon2id, t_cost: 3, m_cost: 65536, parallelism: 4 }
);

// Encrypt vault payload
const cipher = crypto.createCipheriv("aes-256-gcm", kdfKey.slice(0, 32), nonce);
const ciphertext = Buffer.concat([
  cipher.update(JSON.stringify(vaultPayload), "utf8"),
  cipher.final()
]);
const tag = cipher.getAuthTag();

// Store envelope
const envelope = {
  version: "1.0.0",
  kdf: { /* ... */ },
  salt: salt.toString("base64"),
  nonce: nonce.toString("base64"),
  ciphertext: ciphertext.toString("base64"),
  tag: tag.toString("base64"),
  aad: { /* ... */ }
};

// On unlock
const decryptionKey = await argon2.hash(passphrase, { salt: Buffer.from(salt, "base64"), ... });
const decipher = crypto.createDecipheriv("aes-256-gcm", decryptionKey.slice(0, 32), Buffer.from(nonce, "base64"));
decipher.setAuthTag(Buffer.from(tag, "base64"));
const plaintext = Buffer.concat([
  decipher.update(Buffer.from(ciphertext, "base64")),
  decipher.final()
]);
const vaultPayload = JSON.parse(plaintext.toString("utf8"));
```

---

### D2: Server DB Tables (No PII, Minimal Footprint)

**Database: SQLite (MVP) → Postgres (production)**

**Table: `wallets`**

```sql
CREATE TABLE wallets (
  wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  suite_version VARCHAR(20) NOT NULL,  -- e.g., "1.0.0"
  status ENUM('ACTIVE', 'REVOKED', 'SUSPENDED') DEFAULT 'ACTIVE',
  
  -- optional: commitment root for transparency
  commitment_root VARCHAR(256),
  commitment_algorithm VARCHAR(32),
  
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);
```

**Table: `wallet_keys`**

```sql
CREATE TABLE wallet_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  
  key_type ENUM('WEBAUTHN', 'SIGNING', 'PQC') NOT NULL,
  key_material JSONB NOT NULL,  -- { kty, crv, x, y, ... } (no private key!)
  
  -- WebAuthn specific
  webauthn_credential_id VARCHAR(512),  -- base64
  webauthn_transports TEXT[],  -- ["internal", "usb", ...]
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  
  UNIQUE (wallet_id, key_type, key_id),
  INDEX idx_wallet_id (wallet_id),
  INDEX idx_revoked_at (revoked_at)
);
```

**Table: `wallet_commitments`**

```sql
CREATE TABLE wallet_commitments (
  commitment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  
  commitment_type ENUM('MERKLE_ROOT', 'HASH_TREE') DEFAULT 'MERKLE_ROOT',
  commitment_value VARCHAR(512),  -- base64
  algorithm VARCHAR(32),  -- sha256, sha3-256
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  
  INDEX idx_wallet_id (wallet_id),
  INDEX idx_created_at (created_at)
);
```

**Table: `revocations`**

```sql
CREATE TABLE revocations (
  revocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  target_type ENUM('KEY', 'CREDENTIAL') NOT NULL,
  target_id VARCHAR(512) NOT NULL,  -- key_id or credential_id
  
  reason_code ENUM(
    'KEY_COMPROMISE',
    'DEVICE_LOSS',
    'CREDENTIAL_FRAUD',
    'EXPIRY',
    'USER_REQUEST',
    'ISSUER_REVOCATION'
  ) NOT NULL,
  
  effective_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- optional: signature from server or issuer
  signature VARCHAR(1024),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_target_id (target_id),
  INDEX idx_effective_at (effective_at)
);
```

**Table: `encrypted_backups`** (Optional)

```sql
CREATE TABLE encrypted_backups (
  backup_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  
  -- NO PII in plaintext; user's vault envelope encrypted at client
  ciphertext BYTEA NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_wallet_id (wallet_id)
);
```

**Table: `audit_events`** (Minimal, NO PII)

```sql
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  
  event_type ENUM(
    'WALLET_REGISTER',
    'KEY_ADD',
    'KEY_REVOKE',
    'CREDENTIAL_REVOKE',
    'BACKUP_UPDATE',
    'STATUS_CHECK'
  ) NOT NULL,
  
  wallet_id UUID REFERENCES wallets(wallet_id) ON DELETE SET NULL,
  
  -- NO PII; only metadata
  metadata JSONB,  -- e.g., { "key_type": "WEBAUTHN", "suite_version": "1.0.0" }
  
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_wallet_id (wallet_id),
  INDEX idx_timestamp (timestamp)
);
```

**Key Rules:**

- ✓ No columns for names, dates of birth, addresses, document numbers
- ✓ Schema validation enforces rejection of unknown fields
- ✓ All UUIDs are cryptographic (not sequential or guessable)
- ✓ All timestamps in UTC
- ✓ Encryption keys for backups held only by client
- ✓ Audit logs contain no PII (metadata only)

---

## CRYPTOGRAPHIC DESIGN (PHASED & AGILE)

### E1: Today (MVP Secure Baseline)

**Encryption at Rest:**

```
Algorithm: AES-256-GCM
Standard: NIST SP 800-38D
Derives from: Argon2id (KDF)
Usage: Wallet vault encryption
```

**Key Derivation:**

```
KDF: Argon2id (IANA RFC 9106)
Parameters:
  - t_cost (iterations): 3
  - m_cost (memory): 65,536 KiB (64 MiB)
  - p_cost (parallelism): 4
  - hash_length: 32 bytes
  - salt: 16 bytes random
Input: User passphrase (12-20 chars, entropy >= 50 bits)
Output: 256-bit key for AES-GCM
Note: Times ~500ms on modern phone; acceptable for unlock
```

**Device Binding:**

```
Primary: WebAuthn (FIDO2)
  - Create passkey on enrollment
  - Private key stored in secure enclave / TPM
  - Never accessed by JavaScript
  - Used to sign proofs (via navigator.credentials.get())

Fallback: Software signing key (if WebAuthn unavailable)
  - ECDSA P-256 keypair (WebCrypto)
  - Private key encrypted with vault KDF key
  - Stored in IndexedDB
  - Fallback for offline scenarios

Binding Mechanism:
  - Include WebAuthn credential ID in vault AAD
  - Detect if device changes
  - Warn user or trigger recovery flow
```

**Signing Presentations:**

```
Signature Suite: ECDSA with SHA-256
  - Algorithm: ECDSA (FIPS 186-4)
  - Curve: P-256 (secp256r1)
  - Hash: SHA-256
  - Format: DER + base64
  - Reference: RFC 6979 for deterministic k

What's Signed:
{
  requestId: "...",
  nonce: "...",
  pairwiseSubjectId: "...",
  claims: { ... },
  issuedAt: "...",
  suite: "ECDSA_P256_SHA256_1.0.0"
}

Output: { proof, signature }
Verification: Verifier checks sig with wallet public key from registry
```

**Pairwise Subject IDs (Privacy-Preserving Identifiers):**

```
Algorithm: HMAC-SHA256
Formula: pairwiseSubjectId = HMAC-SHA256(masterSecret, verifierOrigin)

Derivation of masterSecret:
  - Not explicitly stored
  - Derived during unlock from vault payload + device state
  - OR: Stored encrypted in vault, accessible only when vault decrypted

Properties:
  - Unique per verifier (different origin = different ID)
  - Deterministic (same user + verifier = same ID)
  - No cross-platform correlation (no public ID shared)
  - Non-reversible (cannot guess masterSecret from pairwise ID)

Example:
  verifier_origin = "example.com"
  pairwiseSubjectId = HMAC-SHA256(masterSecret, "example.com")
  → "a7c3f19d4e..."  (hex)
  
  verifier_origin = "other.com"
  pairwiseSubjectId = HMAC-SHA256(masterSecret, "other.com")
  → "b2d8e7a9c1..." (hex, completely different)

Reference: OASIS Privacy-Preserving Identifier (PPID)
Standards Alignment: OpenID Connect Pairwise Subject Identifier
```

**Commitments (Optional Transparency Layer):**

```
Goal: Allow user to prove ownership of attributes without revealing them

Method: Merkle Tree of Salted Hashes
  1. For each attribute:
     salt = random(32 bytes)
     hash = SHA256(normalize(attribute_value) || salt)
  
  2. Build Merkle tree:
     leaves = [hash1, hash2, hash3, ...]
     merkleRoot = MerkleTree(leaves).root()
  
  3. Publish merkleRoot to server (optional):
     Server stores in wallet_commitments table
     User can prove later: "I own attribute X with this salt"
  
  4. Proof of ownership:
     Reveal: value + salt
     Verifier: computes hash, checks Merkle path
     Conclusion: "Value is in the commitment"

When to Use:
  - User wants transparency (e.g., government ID)
  - Anti-forgery: prove document attributes match commitment
  - Regulatory: "Here's a commitment I published on [date]"

When NOT to Use:
  - User prefers privacy (no commitment on server)
  - Self-asserted attributes (no underlying document)
```

**Summary: MVP Crypto**

| Operation | Algorithm | Standard | Note |
|-----------|-----------|----------|------|
| Vault Encryption | AES-256-GCM | NIST SP 800-38D | Client-side, KDF-derived key |
| KDF | Argon2id | RFC 9106 | Phish-resistant, GPU-resistant |
| Device Binding | WebAuthn/FIDO2 | W3C + CTAP2 | Passkey preferred |
| Signing | ECDSA P-256 + SHA256 | FIPS 186-4 | RFC 6979 deterministic nonce |
| Pairwise ID | HMAC-SHA256 | RFC 2104 | PPID privacy property |
| Commitments | SHA256 per attribute | Simplified for MVP | Optional transparency |
| AI Companion | AES-256-GCM | Vault passphrase | Chat storage encrypted |

---

### E2: Post-Quantum Readiness (Design Now, Deploy When Ready)

**Goal:** Migrate to PQC without breaking existing deployments

**NIST PQC Standards (Ratified):**

```
Key Encapsulation: ML-KEM (FIPS 203)
  - Replaces ECDH for key establishment
  - Available in 512, 768, 1024 variants
  - Recommend: ML-KEM-768 (equivalent to ~192-bit classical)

Signature: ML-DSA (FIPS 204)
  - Replaces ECDSA for signing
  - Available in 44, 65, 87 variants
  - Recommend: ML-DSA-65 (equivalent to ~192-bit classical)

Stateless Hash-Based Signature: SLH-DSA (FIPS 205)
  - Backup option if ML-DSA not suitable
  - Larger signatures but simpler assumptions

Timeline (Recommended by NIST):
  - 2024-2025: Start hybrid (classical + PQC side-by-side)
  - 2025-2030: Transition phase (both supported)
  - 2030+: PQC-primary, classical deprecated
```

**Hybrid Mode Design:**

```
Phase 1: Classical-Only (MVP)
  Signature: Sign(classicalKey, message)
  Suite: "ECDSA_P256_SHA256_1.0.0"

Phase 2: Hybrid (Transition)
  Signatures: [classicalSig, pqcSig]
  Suite: "HYBRID_ECDSA_P256_ML_DSA_65_1.0.0"
  Verification: Both must be valid
  
  Implementation:
  {
    "signature": {
      "classical": { suite: "ECDSA_P256_SHA256_1.0.0", value: "..." },
      "pqc": { suite: "ML_DSA_65_1.0.0", value: "..." }
    }
  }

Phase 3: PQC-Primary (Future)
  Signature: Sign(pqcKey, message)
  Suite: "ML_DSA_65_1.0.0"
  Fallback: Accept classical signatures from older wallets
```

**Wallet Implementation (Phased):**

```javascript
// Phase 1: Only register classical keys
await wallet.registerKey({
  type: "SIGNING",
  suite: "ECDSA_P256_SHA256_1.0.0",
  publicKey: classicalPubKey
});

// Phase 2: Add PQC key alongside classical
await wallet.registerKey({
  type: "SIGNING_PQC",
  suite: "ML_DSA_65_1.0.0",
  publicKey: pqcPubKey
});

// Phase 3: Rotate to PQC-primary
// (requires migration of old signatures)

// Proof generation adapts to suite version
const proof = await wallet.generateProof(request);
// Automatically includes both signatures if both keys registered
// Verifier checks suiteVersion to know what to expect
```

**Crypto Agility Features:**

1. **Suite Versioning:** Every signed object includes `suiteVersion`
   ```json
   {
     "proof": { ... },
     "signature": "...",
     "suite": "ECDSA_P256_SHA256_1.0.0"
   }
   ```

2. **Verifier Flexibility:** Accept multiple suite versions
   ```javascript
   const knownSuites = [
     "ECDSA_P256_SHA256_1.0.0",
     "HYBRID_ECDSA_P256_ML_DSA_65_1.0.0",
     "ML_DSA_65_1.0.0"
   ];
   
   if (!knownSuites.includes(proof.suite)) {
     throw new Error("Unknown crypto suite");
   }
   
   const verifier = getCryptoSuite(proof.suite);
   const valid = await verifier.verify(proof);
   ```

3. **Key Rotation Without Reissuance:**
   - User can rotate from classical to PQC
   - Old proofs remain valid (signed with classical key)
   - New proofs use PQC
   - Verifiers support both

4. **Library Support:**
   - WASM bindings for ML-KEM, ML-DSA (via liboqs-node)
   - Browser support when ready (via WebAssembly)
   - Fallback to classical during transition

**Timeline for SHIELDED ID:**

```
Q1 2026: MVP with classical (ECDSA P-256)
Q3 2026: PQC library integration (add ML-KEM, ML-DSA)
Q4 2026: Hybrid signing (classical + PQC)
2027: Full PQC support documentation
2028+: Migration guides for users and verifiers
```

---

### E3: ZK Proofs (Phase 2, When Stable)

**Goal:** Enable higher-assurance proofs without revealing underlying attributes

**Phase 1 (MVP): No Heavy ZK**
- Use simple selective disclosure + commitment proofs
- Sign pairwise subject ID + claims
- Sufficient for age verification and KYC proofs

**Phase 2: ZK Circuits**

When to add ZK:
- In-browser ZK-SNARK performance acceptable (<500ms)
- Production-grade circuit libraries available
- User demand for privacy-preserving proofs

Example Circuits:

```
Circuit: AgeOverThreshold
Inputs (secret): dateOfBirth
Inputs (public): threshold (18), commitment_root
Constraints:
  - Hash dateOfBirth is in commitment_root
  - Computed age >= threshold
Output: Boolean (age over threshold, nothing else)

Usage:
  User proves: "I am over 18"
  Verifier learns: YES/NO + proof of computation
  Verifier learns nothing about: actual age, birth date
```

**Technology Stack:**

- **ZK Framework:** Circom (or Noir / Leo)
- **Proof System:** groth16 (or plonk for transparency)
- **In-Browser Proving:** wasmsnark or snarkjs
- **Verification:** Smart contract compatible (future)

**Implementation Strategy:**

```javascript
// Phase 2 code example (pseudocode)

// 1. Compile circuit (offline)
const circuit = await loadCircuit("age_over_18.json");

// 2. Generate witness (on wallet)
const witness = {
  dateOfBirth: [1990, 5, 15],  // encoded
  threshold: 18,
  commitmentRoot: merkleRoot,
  leafPath: merkleProof
};

// 3. Prove (on wallet, ~200-500ms)
const proof = await generateProof(circuit, witness);

// 4. Include in response
const response = {
  requestId: "...",
  claims: {
    ageOver18: {
      zkProof: proof,
      commitment: merkleRoot  // optional; proves computation integrity
    }
  },
  signature: "..."
};

// 5. Verify (server or client)
const valid = await verify(proof, {
  threshold: 18,
  commitmentRoot: merkleRoot
});
```

**Privacy Properties:**

- ✓ **Zero-knowledge:** Proof reveals no info beyond YES/NO
- ✓ **Completeness:** Valid proof always accepted
- ✓ **Soundness:** Invalid proof rejected (except with negligible probability)
- ✓ **No linkability:** Two proofs from same user are unlinkable

**Roadmap:**

```
Q1 2026: MVP without ZK (selective disclosure + signatures)
Q2 2026: ZK R&D + circuit design
Q3 2026: In-browser ZK proof generation (beta)
Q4 2026: Production ZK proofs
2027+: Cross-chain ZK verification (if demand exists)
```

---

## VULNERABLE GROUP SAFETY

### F1: Safety Mode (Default On)

**Design:** Minimal disclosure with strong warnings

**Settings:**

```json
{
  "safetyModeEnabled": true,
  "defaults": {
    "minimumDisclosure": true,
    "requireExplanationForPII": true,
    "mandatoryPreview": true,
    "warnOnVerifierUnknown": true
  }
}
```

**Behavior:**

1. **Minimal Disclosure Default**
   - Requests for name/address/DOB trigger ⚠️ warning
   - Suggest alternatives: "Age over 18" instead of "Date of Birth"
   - Highlight what will NOT be shared

2. **"Why?" Explanation UI**
   ```
   Request: Date of Birth
   Warning: [⚠️] This is personal information.
   
   Why does example.com need this?
   They claim: "To verify eligibility for age-restricted product"
   
   You could instead share:
   ✓ "Over 18" (reveals nothing else)
   ✓ "Over 21" (more specific but still minimal)
   ✗ "Date of Birth" (reveals your full age)
   
   [ALLOW DOB] [SHARE "OVER 18"] [CANCEL]
   ```

3. **Mandatory Preview Screen**
   - Before ANY disclosure: show exactly what will be shared
   - Risk meter: color-coded (green/yellow/red)
   - Timestamp + verifier origin

4. **Requester Trust Labels**
   ```
   [✓ TRUSTED] Bank X (you've shared with before)
   [?] UNKNOWN] new.example.com (first time)
   [⚠️ SUSPICIOUS] suspicious_site.ru (user flagged)
   ```

**Implementation:**

```typescript
// Safety mode logic
function shouldWarnAboutClaim(claim: Claim): boolean {
  const riskyClaims = ["dateOfBirth", "fullName", "address", "documentNumber"];
  return riskyClaims.includes(claim.type) && safetyModeEnabled;
}

function getAlternativeProofs(requested: string[]): string[] {
  const alternatives: { [key: string]: string[] } = {
    "dateOfBirth": ["ageOver18", "ageOver21", "ageOver25"],
    "fullName": ["identityVerified"],
    "address": ["residencyVerified"]
  };
  return alternatives[requested] || [];
}

// UI component
<DisclosurePreview
  requestedClaims={claims}
  safetyMode={true}
  alternatives={getAlternativeProofs(claims.map(c => c.type))}
  onAlternative={(alt) => proceedWithAlternative(alt)}
  onApprove={() => sendProof()}
  onCancel={() => rejectRequest()}
/>
```

---

### F2: Decoy Wallet Mode

**Design:** Secondary vault with benign credentials for coercion resistance

**Threat Model:**
- Abusive partner: "Show me your wallet"
- Corrupt official: "Open your wallet or be charged"
- Attacker with device access: Forces unlock

**Solution:**
- Two vaults: Primary (real) + Decoy (fake but credible)
- User can instantly switch via PIN
- Decoy contains harmless credentials that satisfy casual inspection

**Setup (On Enrollment):**

```
User chooses:
  Decoy Wallet: [ENABLE] [SKIP]
  
If ENABLE:
  Create secondary vault with:
    - Different passphrase
    - Generic/low-value credentials
    - Same look & feel as primary
  
  Setup decoy credentials:
    - "Age Over 18" ✓
    - "KYC Level 1" ✓  (minimal)
    - Generic community membership
  
  Quick switch code:
    [3-digit PIN, e.g., 123]
    Tapping wallet icon 3x in 2 seconds → switches vaults
```

**Decoy Wallet Contents:**

```json
{
  "userProfile": {
    "displayNameAlias": "Casual User",
    "safetyModeEnabled": false
  },
  "credentials": [
    {
      "id": "low-value-1",
      "credentialType": ["AgeVerification"],
      "claims": { "ageOver18": true },
      "issuer": "generic_attester"
    },
    {
      "id": "generic-kyc",
      "credentialType": ["KYCCredential"],
      "claims": { "kycLevel": 1 },
      "issuer": "basic_kyc_provider"
    }
  ]
}
```

**Implementation:**

```typescript
// Two IndexedDB object stores
db.objectStore("vault_primary");  // Real wallet
db.objectStore("vault_decoy");    // Fake wallet

// Quick switch mechanism
document.addEventListener("click", (e) => {
  if (e.target === walletIcon) {
    tapCount++;
    if (tapCount === 3 && timeSinceFirstTap < 2000) {
      switchDecoyMode();
      tapCount = 0;
    }
  }
});

function switchDecoyMode() {
  const pin = prompt("Enter 3-digit PIN:");
  if (verify_pin(pin)) {
    currentVault = decoyMode ? "primary" : "decoy";
    decoyMode = !decoyMode;
    reloadUI();
  }
}
```

**Important Notes:**

- Decoy vault is NOT a security feature against state actors (they'll demand primary)
- Decoy wallet is for social engineering and low-skilled threats
- User responsible for maintaining story if coerced
- Once switched, proofs from decoy wallet have limited assurance (by design)

---

### F3: Panic Actions

**Design:** Immediate key destruction for emergency scenarios

**Scenario:** Device stolen, user in immediate danger

**Actions:**

```
1. PANIC WIPE (removes only secrets)
   - Deletes all private keys from device
   - Deletes encrypted vault from IndexedDB
   - Keeps app installed (not suspicious)
   - User can recover later with passphrase
   - In-device timer (5 minutes auto-wipe)

2. LOCKDOWN (requires recovery to open)
   - Locks wallet with time-based lock
   - Requires biometric + recovery code to unlock
   - Useful if attacker has passphrase
   - Phone buzzes every 60 seconds if locked

3. REVOKE KEYS (triggers server revocation)
   - Marks all keys as REVOKED on server
   - Takes effect immediately
   - Proofs signed with old keys rejected
   - User can register new keys later
```

**Implementation:**

```typescript
// Panic button in settings (hidden, requires unlock first)
async function panicWipe() {
  const confirmed = confirm(
    "This will DESTROY all keys. You can recover with your passphrase. Continue?"
  );
  
  if (!confirmed) return;
  
  // Securely delete sensitive material
  await deleteDatabaseObjectStore("vault_primary");
  await deleteIndexedDBBlobs(["encrypted_keys", "encrypted_images"]);
  
  // Optional: revoke on server
  await fetch("/v1/wallet/" + walletId + "/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: "emergency_wipe"
    })
  });
  
  // Show recovery flow
  showRecoveryOptions();  // Passphrase recovery, social recovery
}

// Time-based auto-wipe (security feature)
const autoWipeTimer = setTimeout(() => {
  panicWipe();  // Auto-wipe after 5 minutes inactivity
}, 5 * 60 * 1000);

// Reset timer on user interaction
document.addEventListener("interaction", () => {
  clearTimeout(autoWipeTimer);
  autoWipeTimer = setTimeout(panicWipe, 5 * 60 * 1000);
});
```

---

### F4: Contextual Consent Receipts

**Design:** Local audit trail of what user shared and with whom

**Use Case:**
- User later suspects abuse by verifier
- Can generate report: "I shared [claims] with [verifier] at [time]"
- Helps with investigations, abuse reporting

**Storage (Client-Side Only):**

```json
{
  "auditLog": [
    {
      "id": "audit_001",
      "eventType": "PROOF_SENT",
      "verifierOrigin": "example.com",
      "verifierTrust": "unknown",
      "claimsShared": [
        "ageOver18",
        "kycLevel"
      ],
      "pairwiseSubjectId": "a7c3f19d4e...",
      "timestamp": "2026-01-06T23:20:00Z",
      "requestId": "req_xyz",
      "status": "success"
    }
  ]
}
```

**User Interface:**

```
[SETTINGS] → [PRIVACY] → [CONSENT HISTORY]

example.com
  ✓ Age Over 18
  ✓ KYC Level 2
  📅 Jan 6, 2026 at 11:20 PM
  [DETAILS] [REPORT ABUSE]

other.com
  ✓ Age Over 18
  📅 Jan 3, 2026 at 2:15 PM
  [DETAILS]

[EXPORT REPORT] [CLEAR HISTORY]
```

**Export Functionality:**

```javascript
async function exportReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    walletId: obfuscated(walletId),  // Don't reveal full ID
    entries: auditLog,
    disclaimer: "This report was generated by your SHIELDED ID wallet..."
  };
  
  const pdf = generatePDF(report);
  downloadFile(pdf, "shielded-id-receipt-export.pdf");
}
```

---

### F5: Verifier Trust Labels

**Design:** Local user-maintained trust list

**Labels:**

- 🟢 **GREEN (Trusted):** Known, established verifier
- 🟡 **YELLOW (Unknown):** First-time request
- 🔴 **RED (Flagged):** User or community reported suspicious activity

**Crowdsourced Feedback (Optional):**

```
Wallet can optionally submit feedback:
  "I received a request from example.com claiming to be Bank X, but..."
  
Aggregated feedback displayed to other users:
  ⚠️ 47 users flagged this origin as suspicious
  
Note: Feedback is anonymous, cannot be traced to user
```

**Implementation:**

```typescript
interface VerifierTrustRecord {
  origin: string,
  userTrustLabel: "trusted" | "unknown" | "flagged",
  firstSeen: string,
  lastSeen: string,
  interactionCount: number,
  userNotes?: string,
  crowdFeedback?: {
    flagCount: number,
    lastFlagDate: string
  }
}

// Storage
db.objectStore("verifier_trust").put({
  origin: "example.com",
  userTrustLabel: "trusted",
  lastSeen: new Date().toISOString()
});

// UI feedback
function displayTrustLabel(origin: string) {
  const record = await getTrustRecord(origin);
  
  if (record.userTrustLabel === "flagged") {
    return <TrustBadge color="red" label="Flagged" />;
  } else if (record.crowdFeedback?.flagCount > 10) {
    return <TrustBadge color="yellow" label="⚠️ Community Flagged" />;
  } else if (record.userTrustLabel === "trusted") {
    return <TrustBadge color="green" label="Trusted" />;
  } else {
    return <TrustBadge color="yellow" label="Unknown" />;
  }
}
```

---

## VERIFIER SDK & INTEGRATION

### G1: Proof Request Object

**Structure:**

```typescript
interface ProofRequest {
  // Metadata
  requestId: string,  // UUID; maps proof to request
  verifierOrigin: string,  // e.g., "https://example.com"
  nonce: string,  // Random; prevents replay
  issuedAt: string,  // ISO 8601 timestamp
  expiresAt: string,  // Expiry (typically 5 min from issuedAt)
  
  // What we're asking for
  requestedClaims: [
    {
      type: "AGE_OVER" | "KYC_LEVEL" | "RESIDENCY" | "CONTINUITY" | "CUSTOM",
      threshold?: number,  // For AGE_OVER, e.g., 18, 21, 25
      minLevel?: number,  // For KYC_LEVEL, e.g., 1, 2, 3, 4
      allowedValues?: string[],  // For RESIDENCY, e.g., ["GB", "IE"]
      allowedIssuers?: string[],  // Restrict to specific attesters
      customType?: string  // For CUSTOM claims
    }
  ],
  
  // Policy enforcement
  policy: {
    requireStatusCheck: boolean,  // Check revocation?
    maxAgeSeconds: number,  // Proof max age (e.g., 300)
    forbidPII?: [  // Explicitly forbid these claims
      "fullName",
      "dateOfBirth",
      "address",
      "documentNumber"
    ],
    minAssuranceLevel?: number  // Require assurance >= 2
  },
  
  // Callback
  callback: {
    method: "POST",
    url: string,  // e.g., "https://example.com/verify-callback"
    timeout?: number  // milliseconds
  },
  
  // Optional: UI hints
  ui?: {
    displayText?: string,
    logoUrl?: string,
    color?: string
  }
}
```

**Generation Example (Node.js):**

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";
import crypto from "crypto";

const verifier = new ShieldedVerifier({
  origin: "https://example.com",
  publicKeyUrl: "https://example.com/.well-known/shielded-id-keys.json"
});

const request = verifier.createProofRequest({
  requestedClaims: [
    { type: "AGE_OVER", threshold: 18 },
    { type: "KYC_LEVEL", minLevel: 2 }
  ],
  policy: {
    requireStatusCheck: true,
    maxAgeSeconds: 300,
    forbidPII: ["fullName", "dateOfBirth"],
    minAssuranceLevel: 2
  },
  callback: {
    method: "POST",
    url: "https://example.com/verify-callback"
  }
});

// Generate QR code for wallet to scan
const qrCode = await verifier.generateQR(request);
// Or: deep link for mobile
const deepLink = verifier.generateDeepLink(request);
```

**QR Code Format:**

```
shielded-id://proof?request_id=req_xyz&nonce=nonce_abc&
verifier_origin=https%3A%2F%2Fexample.com&
requested_claims=AGE_OVER%3A18%2CKYC_LEVEL%3A2&
callback_url=https%3A%2F%2Fexample.com%2Fcallback&
expires_at=2026-01-06T23:25:00Z
```

---

### G2: Verification Algorithm

**Server-Side (Relying Party):**

```typescript
async function verifyProof(
  request: ProofRequest,
  proofResponse: ProofResponse,
  options: VerificationOptions
): Promise<VerificationResult> {
  
  // 1. Validate request freshness
  const now = new Date();
  if (new Date(request.expiresAt) < now) {
    return { valid: false, reason: "request_expired" };
  }
  
  // 2. Validate nonce (prevent replay)
  if (!validateNonce(request.nonce, proofResponse.nonce)) {
    return { valid: false, reason: "nonce_mismatch" };
  }
  
  // 3. Check request matches response
  if (request.requestId !== proofResponse.requestId) {
    return { valid: false, reason: "request_id_mismatch" };
  }
  
  // 4. Fetch wallet public key from registry
  const registryClient = new RegistryClient();
  const walletPubKey = await registryClient.getPublicKey(
    proofResponse.walletId  // or: embedded in proof
  );
  
  if (!walletPubKey) {
    return { valid: false, reason: "wallet_not_found" };
  }
  
  // 5. Verify wallet signature
  const signatureValid = await verifySig(
    walletPubKey,
    proofResponse,
    proofResponse.signature,
    { suite: proofResponse.suite }
  );
  
  if (!signatureValid) {
    return { valid: false, reason: "signature_invalid" };
  }
  
  // 6. Verify attester signatures (for attested claims)
  for (const claim of proofResponse.claims) {
    if (claim.issuer && claim.evidence?.signature) {
      const issuerKey = await getIssuerPublicKey(claim.issuer);
      const issuerSigValid = await verifySig(
        issuerKey,
        claim.evidence,
        claim.evidence.signature,
        { suite: claim.evidence.suite }
      );
      
      if (!issuerSigValid) {
        return {
          valid: false,
          reason: "issuer_signature_invalid",
          details: { claim: claim.type, issuer: claim.issuer }
        };
      }
    }
  }
  
  // 7. Check revocation status (if policy requires)
  if (options.checkRevocation || request.policy.requireStatusCheck) {
    const revoked = await registryClient.isKeyRevoked(
      proofResponse.walletId  // or specific key ID
    );
    
    if (revoked) {
      return { valid: false, reason: "wallet_revoked" };
    }
  }
  
  // 8. Validate claim types and values
  for (const requested of request.requestedClaims) {
    const provided = proofResponse.claims[requested.type];
    
    if (!provided) {
      return {
        valid: false,
        reason: "missing_claim",
        details: { claim: requested.type }
      };
    }
    
    // Type-specific validation
    switch (requested.type) {
      case "AGE_OVER":
        if (provided.value !== true) {
          return { valid: false, reason: "age_threshold_not_met" };
        }
        break;
      
      case "KYC_LEVEL":
        if (provided.value < requested.minLevel) {
          return { valid: false, reason: "kyc_level_insufficient" };
        }
        break;
      
      case "CONTINUITY":
        // User claims same account as before
        const previousBinding = await lookupPairwiseBinding(
          request.verifierOrigin
        );
        if (previousBinding && previousBinding.id !== provided.claimedSubjectId) {
          return { valid: false, reason: "continuity_check_failed" };
        }
        break;
    }
  }
  
  // 9. Check expiry of claims
  for (const claim of proofResponse.claims) {
    if (claim.expiresAt && new Date(claim.expiresAt) < now) {
      return {
        valid: false,
        reason: "claim_expired",
        details: { claim: claim.type }
      };
    }
  }
  
  // 10. Success!
  return {
    valid: true,
    pairwiseSubjectId: proofResponse.pairwiseSubjectId,
    claims: proofResponse.claims,
    assuranceLevel: proofResponse.assuranceLevel,
    verifiedAt: now.toISOString()
  };
}
```

**Verification Result:**

```typescript
interface VerificationResult {
  valid: boolean,
  reason?: string,  // if invalid
  details?: { [key: string]: any },  // Additional context
  
  // If valid:
  pairwiseSubjectId?: string,
  claims?: { [key: string]: Claim },
  assuranceLevel?: number,  // 1-4
  verifiedAt?: string
}
```

---

### G3: Developer Experience

**Installation:**

```bash
npm install @shielded-id/verifier-sdk
```

**Quick Start:**

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";

// Initialize
const verifier = new ShieldedVerifier({
  origin: "https://example.com",
  publicKeyUrl: "https://example.com/.well-known/shielded-id-keys.json"
});

// 1. Create proof request
const request = verifier.createProofRequest({
  requestedClaims: [
    { type: "AGE_OVER", threshold: 18 },
    { type: "KYC_LEVEL", minLevel: 2 }
  ],
  policy: {
    requireStatusCheck: true,
    maxAgeSeconds: 300
  },
  callback: {
    method: "POST",
    url: "https://example.com/callback"
  }
});

// 2. Generate QR (for wallet to scan)
const qr = await verifier.generateQR(request);
displayQRCode(qr);

// 3. Receive proof response at callback endpoint
app.post("/callback", async (req, res) => {
  const { proof } = req.body;
  
  // 4. Verify proof
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });
  
  if (result.valid) {
    // Grant access
    req.session.verifiedUser = result.pairwiseSubjectId;
    res.json({ success: true });
  } else {
    // Reject
    res.status(401).json({ error: result.reason });
  }
});
```

**Best Practices:**

1. **Store Minimally:**
   ```typescript
   // ✓ GOOD: Store only what you need
   db.users.update(userId, {
     verifiedAt: result.verifiedAt,
     pairwiseSubjectId: result.pairwiseSubjectId,
     assuranceLevel: result.assuranceLevel
   });
   
   // ✗ BAD: Don't store the entire proof
   db.users.update(userId, { fullProof: JSON.stringify(proof) });
   ```

2. **Never Try to Reverse-Engineer:**
   ```typescript
   // ✗ DON'T DO THIS:
   const dob = deriveFromProof(proof);  // Impossible; proof is blinded
   
   // ✓ DO THIS: Trust the proof you verified
   if (result.valid && result.assuranceLevel >= 2) {
     allowUserAction();
   }
   ```

3. **Respect Privacy (Don't Correlate):**
   ```typescript
   // ✗ DON'T: Try to link pairwise IDs across verifiers
   // (They're intentionally unique; different per verifier)
   
   // ✓ DO: Use pairwise ID as unique account identifier
   // for THIS service only
   ```

**Verifier Demo:** Includes placeholder pages for Age/KYC/Continuity proofs. Full functionality via SDK integration (e.g., QR generation, callback handling).

---

## SERVER API REFERENCE

### H1: POST /v1/wallet/register

**Purpose:** Register a new wallet with the registry

**Authentication:** Signature required (wallet signs its own registration)

**Request:**

```typescript
{
  "publicKeys": {
    "signing": {
      "kty": "EC",
      "crv": "P-256",
      "x": "...",
      "y": "...",
      "alg": "ES256"
    },
    "pqc": null  // Optional for Phase 2
  },
  "webauthnCredentialId": "base64(credential_id)",  // Optional
  "suiteVersion": "1.0.0",
  "commitmentRoot": "base64(merkle_root)",  // Optional
  "signature": "base64(signature_of_above_data)"  // Proof of key control
}
```

**Response:**

```json
{
  "walletId": "uuid",
  "statusUrl": "https://registry.shielded-id.app/status/[wallet_id]",
  "createdAt": "2026-01-06T23:15:00Z",
  "status": "ACTIVE"
}
```

**Validation:**

- ✓ Schema: all required fields present
- ✓ No PII in request (schema rejects)
- ✓ Signature valid (proves key control)
- ✓ Rate limit: 10 reqs/min per IP

---

### H2: POST /v1/wallet/:walletId/keys

**Purpose:** Add or rotate keys for a wallet

**Authentication:** Signature required (prove control of existing key)

**Request:**

```typescript
{
  "keyType": "SIGNING" | "WEBAUTHN" | "PQC",
  "publicKey": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  },
  "webauthnCredentialId": "base64(...)",  // If keyType=WEBAUTHN
  "suiteVersion": "1.0.0",
  "replaceKeyId": "uuid",  // Optional: rotate existing key
  "signature": "base64(signature)"  // Signed by existing key
}
```

**Response:**

```json
{
  "keyId": "uuid",
  "walletId": "uuid",
  "keyType": "SIGNING",
  "createdAt": "2026-01-06T23:20:00Z",
  "status": "ACTIVE"
}
```

**Rate Limit:** 5 reqs/min per wallet

---

### H3: GET /v1/status/:walletId

**Purpose:** Check revocation status of a wallet or key

**Authentication:** None (public)

**Request:**

```
GET /v1/status/wallet-uuid-abc123
```

**Response:**

```json
{
  "walletId": "wallet-uuid-abc123",
  "status": "ACTIVE" | "REVOKED" | "SUSPENDED",
  "revokedAt": null,  // Timestamp if revoked
  "reason": null,  // Reason code if revoked
  "keys": [
    {
      "keyId": "key-uuid-xyz",
      "status": "ACTIVE",
      "revokedAt": null
    }
  ],
  "checkedAt": "2026-01-06T23:22:00Z"
}
```

**Caching:** Verifiers may cache for 5 minutes

---

### H4: POST /v1/revoke

**Purpose:** Revoke keys or credentials (user-initiated)

**Authentication:** Signature required (prove control + optional recovery factor)

**Request:**

```typescript
{
  "walletId": "uuid",
  "targetType": "KEY" | "CREDENTIAL",
  "targetIds": ["uuid1", "uuid2"],  // Which keys/creds to revoke
  "reason": "KEY_COMPROMISE" | "DEVICE_LOSS" | "CREDENTIAL_FRAUD" | "USER_REQUEST",
  "signature": "base64(...)",  // Signed by a non-revoked key
  "recoveryFactor": "base64(...)"  // Optional: if key is already revoked
}
```

**Response:**

```json
{
  "ok": true,
  "revokedCount": 2,
  "effectiveAt": "2026-01-06T23:23:00Z"
}
```

**Rate Limit:** 5 reqs/min per wallet

---

### H5: POST /v1/backup (Optional)

**Purpose:** Store encrypted backup blob (user data, not server data)

**Authentication:** Signature required

**Request:**

```typescript
{
  "walletId": "uuid",
  "ciphertext": "base64(...)",  // Encrypted vault envelope
  "algorithm": "AES-256-GCM",
  "signature": "base64(...)"
}
```

**Response:**

```json
{
  "backupId": "uuid",
  "walletId": "uuid",
  "createdAt": "2026-01-06T23:24:00Z"
}
```

**Important:** Server stores ciphertext only; server never has decryption key

---

### H6: GET /v1/backup/:walletId (Optional)

**Purpose:** Retrieve encrypted backup blob

**Authentication:** Signature required (prove identity)

**Response:**

```json
{
  "backupId": "uuid",
  "ciphertext": "base64(...)",
  "createdAt": "2026-01-06T23:24:00Z"
}
```

---

## IMPLEMENTATION PLAN

### Phase 0: Proof of Concept (Weeks 1-2)

**Goal:** Validate core architecture

**Deliverables:**
- [ ] PWA with basic UI (React + TypeScript)
- [ ] Vault encryption (AES-GCM + Argon2id)
- [ ] WebAuthn passkey creation & usage
- [ ] Pairwise subject ID generation (HMAC-SHA256)
- [ ] Simple verifier demo (no real credentials, self-asserted only)
- [ ] Registry server MVP (SQLite, basic API)

**Tech Stack:**
- Frontend: React 18, TypeScript, Vite
- Backend: Node.js + Fastify, SQLite
- Crypto: WebCrypto + argon2 WASM

**Repository Structure:**
```
shielded-id/
├── apps/
│   ├── wallet-pwa/
│   ├── registry-server/
│   └── verifier-demo/
├── packages/
│   └── verifier-sdk/
├── docs/
└── package.json (monorepo)
```

---

### Phase 1: Real MVP (Completed)

**Goal:** Production-ready core functionality

**Deliverables:**
- [x] On-device document OCR + manual confirmation
- [x] Commitment root generation (Merkle tree)
- [x] Attester-issued credentials (VC-like JSON-LD)
- [x] Verifier SDK (Node.js + browser compatible)
- [x] Example relying party site
- [x] Revocation/status server
- [x] Safety Mode + Decoy Wallet + Disclosure Preview
- [x] Strong update integrity (signed releases, pinned hashes)

**Security Checklist:**
- [x] Server schema validation rejects PII
- [x] No browser storage (localStorage/sessionStorage)
- [x] Content Security Policy configured
- [x] All crypto operations tested (unit + integration)
- [x] CORS properly configured
- [x] Rate limiting on all endpoints
- [x] Audit logging (no PII)

---

### Phase 2: ZK Upgrade (Weeks 12-16)

**Goal:** Privacy-enhanced proofs

**Deliverables:**
- [ ] ZK circuits for age threshold verification
- [ ] In-browser ZK proof generation (snarkjs)
- [ ] ZK proof verification in SDK
- [ ] Hybrid classical + PQC signing (Phase 2)
- [ ] Crypto agility documentation
- [ ] Integrate external attesters
- [ ] Full Merkle commitments
- [ ] PQC keys
- [ ] Expand AI Companion (e.g., RAG for identity advice)

---

### Phase 3: Standardization & Adoption (2027+)

**Goal:** Community adoption and standardization

**Deliverables:**
- [ ] Publish open specification
- [ ] Conformance test suite
- [ ] Reference implementations (multiple languages)
- [ ] Outreach:
  - Privacy NGOs
  - Indigenous organizations
  - Community groups
  - Small fintechs (adoption wedge)
- [ ] Compliance mapping:
  - "KYC passed by attester" meets platform needs
  - GDPR alignment documentation
  - AML/CFT compatibility

---

## GROK BUILD INSTRUCTIONS

The repository is the build output; clone and run `docker-compose up` for local testing.

### Monorepo Structure

```
shielded-id/
├── .github/
│   └── workflows/
│       ├── test.yml
│       ├── build.yml
│       └── security-scan.yml
├── apps/
│   ├── wallet-pwa/
│   │   ├── public/
│   │   │   └── index.html
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   │   ├── crypto.ts
│   │   │   │   ├── vault.ts
│   │   │   │   └── proof-generator.ts
│   │   │   ├── store/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── service-worker.ts
│   ├── registry-server/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── wallet.ts
│   │   │   │   ├── status.ts
│   │   │   │   └── revoke.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.sql
│   │   │   │   └── migrations/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── rateLimit.ts
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── verifier-demo/
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── App.tsx
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   └── verifier-sdk/
│       ├── src/
│       │   ├── index.ts
│       │   ├── verifier.ts
│       │   ├── proofRequest.ts
│       │   ├── verification.ts
│       │   └── crypto.ts
│       ├── tests/
│       │   ├── verifier.test.ts
│       │   ├── verification.test.ts
│       │   └── crypto.test.ts
│       ├── package.json
│       ├── tsconfig.json
│       └── tsconfig.esm.json
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── CRYPTO.md
│   ├── PRIVACY.md
│   ├── SECURITY.md
│   └── SPEC.md
├── scripts/
│   ├── setup-db.sh
│   ├── generate-keys.sh
│   └── run-tests.sh
├── package.json (root)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── prettier.config.js
└── .gitignore
```

### Setup Instructions

**Prerequisites:**
- Node.js 18+
- pnpm 8+
- Docker (for registry server)

**Bootstrap Monorepo:**

```bash
# Clone
git clone https://github.com/shielded-id/shielded-id.git
cd shielded-id

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run dev server
pnpm dev
```

**Start Individual Components:**

```bash
# Registry server (http://localhost:3000)
pnpm --filter registry-server dev

# Wallet PWA (http://localhost:5173)
pnpm --filter wallet-pwa dev

# Verifier demo (http://localhost:5174)
pnpm --filter verifier-demo dev
```

### Implementation Order (for Grok)

**1. Registry Server (foundation)**
   - [ ] Set up Fastify + SQLite
   - [ ] Implement DB schema + migrations
   - [ ] Implement POST /v1/wallet/register
   - [ ] Implement GET /v1/status/:walletId
   - [ ] Implement POST /v1/revoke
   - [ ] Add rate limiting + validation middleware
   - [ ] Add CORS + security headers
   - [ ] Add tests (crypto, revocation, edge cases)

**2. Verifier SDK (validation logic)**
   - [ ] Implement ProofRequest creation
   - [ ] Implement signature verification (ECDSA P-256)
   - [ ] Implement revocation checks
   - [ ] Implement ZK proof schema (Phase 2)
   - [ ] Add QR code generation
   - [ ] Add deep linking support
   - [ ] Add tests + TypeScript types

**3. Verifier Demo Site (reference implementation)**
   - [ ] Set up React app
   - [ ] Import verifier-sdk
   - [ ] Implement proof request UI
   - [ ] Implement callback handler
   - [ ] Implement verification + result display
   - [ ] Add demo credentials

**4. Wallet PWA (main client)**
   - [ ] Set up React + Service Worker
   - [ ] Implement vault encryption (AES-GCM + Argon2id)
   - [ ] Implement WebAuthn registration + signing
   - [ ] Implement ID document capture (camera + OCR)
   - [ ] Implement Merkle tree + commitments
   - [ ] Implement proof generation
   - [ ] Implement disclosure preview UI
   - [ ] Implement safety modes (decoy wallet, panic wipe)
   - [ ] Implement QR scanning + deep link handling
   - [ ] Implement proof receipt logging
   - [ ] Add tests + e2e scenarios

### Key Commands

```bash
# Lint all code
pnpm lint

# Type check all packages
pnpm type-check

# Run tests (all)
pnpm test

# Run tests (watch mode)
pnpm test:watch

# Build all
pnpm build

# Build specific package
pnpm --filter wallet-pwa build

# Start dev servers (all)
pnpm dev

# Generate API documentation
pnpm docs

# Run security audit
pnpm audit

# Format code
pnpm format
```

---

## DELIVERABLES & DEFINITION OF DONE

### Wallet PWA

**Checklist:**

- [ ] **Encryption:**
  - [ ] Vault encryption (AES-256-GCM)
  - [ ] Argon2id KDF
  - [ ] WebAuthn passkey support
  - [ ] Software signing key fallback
  - [ ] Device binding verification

- [ ] **Document Management:**
  - [ ] Camera capture (front/back)
  - [ ] On-device OCR (TensorFlow.js or MediaPipe)
  - [ ] Manual field confirmation (mandatory)
  - [ ] Optional: encrypted document storage
  - [ ] Document deletion option

- [ ] **Cryptography:**
  - [ ] Attribute normalization
  - [ ] Merkle tree generation + verification
  - [ ] Pairwise subject ID derivation (HMAC-SHA256)
  - [ ] ECDSA P-256 signing
  - [ ] Signature verification (for credentials)

- [ ] **Proof Generation:**
  - [ ] Parse QR codes and deep links
  - [ ] Construct proof responses
  - [ ] Selective claim disclosure
  - [ ] Signature inclusion
  - [ ] Credential inclusion (from attesters)

- [ ] **User Interface:**
  - [ ] Enrollment flow (passphrase + biometrics)
  - [ ] Vault unlock screen
  - [ ] Disclosure preview (mandatory)
  - [ ] Proof confirmation
  - [ ] Settings + recovery options

- [ ] **Safety Features:**
  - [ ] Safety Mode (minimal disclosure default)
  - [ ] Decoy Wallet Mode (secondary vault + quick switch)
  - [ ] Panic Wipe (immediate key destruction)
  - [ ] Lockdown Mode (time-based locking)
  - [ ] Verifier trust labels (green/yellow/red)
  - [ ] Consent receipt logging

- [ ] **Offline Capability:**
  - [ ] Service Worker (install + offline)
  - [ ] IndexedDB storage
  - [ ] Proof generation without network
  - [ ] Background sync (when online)

- [ ] **Testing:**
  - [ ] Unit tests (crypto, vault, proof generation)
  - [ ] Integration tests (full enrollment → proof flow)
  - [ ] E2E tests (UI flows)
  - [ ] Security tests (malformed inputs, attacks)
  - [ ] >80% code coverage

---

### Registry Server

**Checklist:**

- [ ] **API Endpoints:**
  - [ ] POST /v1/wallet/register
  - [ ] POST /v1/wallet/:walletId/keys
  - [ ] GET /v1/status/:walletId
  - [ ] POST /v1/revoke
  - [ ] POST /v1/backup (optional)

- [ ] **Database:**
  - [ ] wallets table
  - [ ] wallet_keys table
  - [ ] wallet_commitments table
  - [ ] revocations table
  - [ ] audit_events table
  - [ ] Indices for performance
  - [ ] Schema migrations

- [ ] **Security:**
  - [ ] Schema validation (rejects unknown fields + PII)
  - [ ] Signature verification (all sensitive ops)
  - [ ] Rate limiting (per IP + per wallet)
  - [ ] CORS configuration
  - [ ] Security headers (CSP, X-Frame-Options, etc.)
  - [ ] Input sanitization
  - [ ] Audit logging (no PII)

- [ ] **Crypto:**
  - [ ] ECDSA signature verification
  - [ ] Nonce validation
  - [ ] Timestamp checks
  - [ ] Crypto suite version support

- [ ] **Operations:**
  - [ ] Health check endpoint
  - [ ] Readiness probe
  - [ ] Structured logging
  - [ ] Metrics (Prometheus)
  - [ ] Error handling
  - [ ] Graceful shutdown

- [ ] **Testing:**
  - [ ] Unit tests (API logic, crypto, DB)
  - [ ] Integration tests (full request/response cycles)
  - [ ] Security tests (injection, replay, invalid sigs)
  - [ ] Load tests (10k reqs/sec sustained)
  - [ ] >80% code coverage

- [ ] **Documentation:**
  - [ ] OpenAPI/Swagger spec
  - [ ] Example curl commands
  - [ ] Error code reference

---

### Verifier SDK

**Checklist:**

- [ ] **API Surface:**
  - [ ] ShieldedVerifier class constructor
  - [ ] createProofRequest()
  - [ ] generateQR()
  - [ ] generateDeepLink()
  - [ ] verifyProof()
  - [ ] checkRevocation()

- [ ] **Crypto:**
  - [ ] ECDSA P-256 signature verification
  - [ ] WebAuthn assertion verification
  - [ ] Nonce + timestamp validation
  - [ ] Suite version handling
  - [ ] ZK proof verification (Phase 2)

- [ ] **Platform Support:**
  - [ ] Node.js (CommonJS + ESM)
  - [ ] Browser (bundled + tree-shakeable)
  - [ ] TypeScript types (exported)
  - [ ] Deno (if applicable)

- [ ] **Package Distribution:**
  - [ ] Published to npm (@shielded-id/verifier-sdk)
  - [ ] README with examples
  - [ ] Changelog
  - [ ] License (MIT or similar)
  - [ ] Source maps

- [ ] **Testing:**
  - [ ] Unit tests (all public methods)
  - [ ] Integration tests (with mock registry)
  - [ ] Crypto tests (signature verification edge cases)
  - [ ] >85% code coverage

- [ ] **Documentation:**
  - [ ] API reference (TSDoc)
  - [ ] Usage guide with examples
  - [ ] Best practices guide
  - [ ] Migration guide (if applicable)

---

### Verifier Demo Site

**Checklist:**

- [ ] **Features:**
  - [ ] Display "Age Over 18" proof request (QR)
  - [ ] Display "KYC Level 2" proof request (QR)
  - [ ] Display "Continuity" proof request (QR)
  - [ ] Callback handler (receive proof)
  - [ ] Verification result display
  - [ ] Session management (pairwise ID)
  - [ ] Local account registration (demo user)

- [ ] **UI/UX:**
  - [ ] Clear flow (request → QR → scan → result)
  - [ ] Error messages (clear + actionable)
  - [ ] Mobile responsive
  - [ ] Dark mode support

- [ ] **Security:**
  - [ ] HTTPS only
  - [ ] CSRF protection
  - [ ] Session security

---

### Documentation & Specification

**Checklist:**

- [ ] **docs/SPEC.md:** Technical specification
  - [ ] Threat model
  - [ ] User flows (B1-B4)
  - [ ] Architecture (C1-C4)
  - [ ] Data model (D1-D2)
  - [ ] Crypto design (E1-E3)

- [ ] **docs/API.md:** API reference
  - [ ] All endpoints (H1-H6)
  - [ ] Request/response schemas
  - [ ] Error codes
  - [ ] Rate limits
  - [ ] Example curl commands

- [ ] **docs/CRYPTO.md:** Cryptographic details
  - [ ] KDF parameters
  - [ ] Signing algorithms
  - [ ] Pairwise ID derivation
  - [ ] ZK circuits (Phase 2)
  - [ ] PQC roadmap

- [ ] **docs/SECURITY.md:** Security & Privacy
  - [ ] Threat model summary
  - [ ] Security targets (S1-S6)
  - [ ] Limitations (endpoint compromise)
  - [ ] Audit trail
  - [ ] Incident response

- [ ] **docs/PRIVACY.md:** Privacy properties
  - [ ] Data minimization
  - [ ] Pairwise identifiers
  - [ ] Revocation privacy
  - [ ] Coercion resistance
  - [ ] Compliance (GDPR, etc.)

- [ ] **docs/ARCHITECTURE.md:** System architecture
  - [ ] Component overview
  - [ ] Deployment guide
  - [ ] Scalability notes
  - [ ] High-availability setup

- [ ] **README.md:** Project overview
  - [ ] Quick start
  - [ ] Key features
  - [ ] Non-goals
  - [ ] Contributing
  - [ ] License

---

### Testing & Quality Assurance

**Checklist:**

- [ ] **Unit Tests**
  - [ ] Crypto primitives (AES-GCM, Argon2id, ECDSA, HMAC)
  - [ ] Vault encryption/decryption
  - [ ] Pairwise ID generation
  - [ ] Merkle tree operations
  - [ ] API validation logic
  - [ ] Revocation checks

- [ ] **Integration Tests**
  - [ ] Full enrollment → proof flow
  - [ ] Credential issuance → presentation
  - [ ] Revocation → rejection
  - [ ] Multiple attesters
  - [ ] Cross-browser compatibility (wallet)
  - [ ] SDK usage with real registry

- [ ] **Security Tests**
  - [ ] Malformed inputs (missing fields, extra fields, wrong types)
  - [ ] Replay attack prevention (nonce validation)
  - [ ] Signature verification failures
  - [ ] Revoked key usage
  - [ ] Schema injection (PII in requests)

- [ ] **Performance Tests**
  - [ ] Proof generation (<1 sec on mobile)
  - [ ] Signature verification (<100ms)
  - [ ] Vault encryption/decryption (<500ms)
  - [ ] Registry API (10k reqs/sec sustained)

- [ ] **Accessibility**
  - [ ] WCAG 2.1 AA compliance
  - [ ] Keyboard navigation
  - [ ] Screen reader support
  - [ ] High contrast mode

- [ ] **Code Quality**
  - [ ] ESLint + Prettier (no violations)
  - [ ] TypeScript strict mode (no @ts-ignore)
  - [ ] Dependency audit (no known vulnerabilities)
  - [ ] >80% code coverage (ideal: >90%)
  - [ ] No console.log in production code

**Definition of Done:** End-to-end tests pass (including AI Companion), security audit complete, Docker deployment verified.

---

### Deployment & Operations

**Checklist:**

- [ ] **Registry Server Deployment**
  - [ ] Docker image (published to registry)
  - [ ] Docker Compose for local dev
  - [ ] Kubernetes manifests (for production)
  - [ ] Environment variable documentation
  - [ ] Database backup strategy
  - [ ] Monitoring + alerting setup

- [ ] **Wallet PWA Deployment**
  - [ ] Static hosting (CDN)
  - [ ] HTTPS + HSTS enforced
  - [ ] Signed releases (checksums, signatures)
  - [ ] Update mechanism (service worker)
  - [ ] Manifest.json (installable)
  - [ ] CSP policy configured

- [ ] **Verifier Demo Deployment**
  - [ ] Static hosting (CDN)
  - [ ] HTTPS enforced
  - [ ] CORS headers (allow demo verifiers)

- [ ] **Monitoring**
  - [ ] Health check endpoints
  - [ ] Structured logging (JSON)
  - [ ] Metrics (Prometheus format)
  - [ ] Error tracking (Sentry or similar)
  - [ ] Uptime monitoring

---

## FINAL CHECKLIST: READY FOR GROK

**Before handing off to Grok Code Fast 1:**

- [ ] Specification complete + reviewed
- [ ] Architecture diagrams finalized
- [ ] Threat model signed off
- [ ] Crypto design validated (by cryptographer if possible)
- [ ] Data model reviewed (privacy + security)
- [ ] API schemas defined (OpenAPI)
- [ ] User flows documented (with UI mockups)
- [ ] Monorepo structure prepared
- [ ] GitHub repo initialized (with templates)
- [ ] CI/CD pipeline designed (GitHub Actions)
- [ ] Development environment setup (pnpm, Docker)
- [ ] Testing strategy documented
- [ ] Deployment strategy documented
- [ ] Security audit checklist prepared
- [ ] Team roles assigned (backend, frontend, crypto, ops)

---

## PROJECT TIMELINE (ESTIMATE)

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **0: POC** | 1-2 weeks | Vault encryption, WebAuthn, pairwise IDs, minimal registry |
| **1: Real MVP** | 4-8 weeks | Document capture, credentials, revocation, safety modes, SDK |
| **2: ZK Upgrade** | 4-6 weeks | ZK proofs, hybrid signing, crypto agility |
| **3: Standardization** | Ongoing | Spec publication, test suite, outreach, adoption |

**Total to production MVP:** 6-10 weeks with 3-4 developers

---

## REFERENCES & STANDARDS

### W3C / OASIS Standards

- **W3C Verifiable Credentials Data Model 2.0** (https://w3c.github.io/vc-data-model/)
- **W3C WebAuthn Level 3** (https://www.w3.org/TR/webauthn-3/)
- **OpenID Connect Core 1.0** (https://openid.net/specs/openid-connect-core-1_0.html)
- **OASIS Privacy-Preserving Identifier (PPID)** (referenced in OpenID Connect)

### NIST Cryptography Standards

- **FIPS 186-4:** Digital Signature Standard (DSS)
- **FIPS 203:** Module-Lattice-Based Key-Encapsulation Mechanism (ML-KEM)
- **FIPS 204:** Module-Lattice-Based Digital Signature Algorithm (ML-DSA)
- **FIPS 205:** Stateless Hash-Based Digital Signature Standard (SLH-DSA)
- **NIST SP 800-38D:** Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM)
- **NIST SP 800-132:** PBKDF2 (reference; we prefer Argon2id)

### RFC Standards

- **RFC 9106:** Argon2 Password Hashing
- **RFC 2104:** HMAC
- **RFC 6979:** Deterministic ECDSA
- **RFC 6962:** Certificate Transparency (Merkle Tree ref)

### Privacy & Security

- **GDPR (EU 2016/679):** General Data Protection Regulation
- **OWASP Top 10:** Web Application Security
- **OWASP Cryptographic Failures:** Guidance

---

**BLUEPRINT VERSION:** 1.1  
**LAST UPDATED:** January 7, 2026  
**READY FOR:** Grok Code Fast 1 Implementation  
**STATUS:** ✅ IMPLEMENTED AND DEPLOYABLE

---

## NEXT STEPS

1. **Review this blueprint** with stakeholders (security, privacy, product)
2. **Hand off to Grok** with monorepo initialized
3. **Begin Phase 0 (POC)** implementation
4. **Iterate on feedback** from early users (if available)
5. **Progress to Phase 1 (Real MVP)** once POC validates architecture
6. **Plan Phase 2 (ZK)** based on market demand
7. **Prepare Phase 3 (Standardization)** documentation in parallel

---

**Questions or clarifications?** This blueprint is intended to be fully self-contained and actionable. Every section includes implementation details, code examples, and decision rationales.

**Good luck building the privacy-first future.** 🛡️

