# @shielded-id/verifier-sdk

**The easiest way to add privacy-preserving identity verification to your service.**

Shielded ID is a privacy-first identity verification system. This SDK is your integration point. Users prove claims (like "age ≥ 18") **without revealing underlying personal data**. You verify proofs cryptographically. The registry confirms status.

---

## Why Shielded ID?

| Problem | Solution | Privacy |
|---------|----------|---------|
| User proves "≥18" | Cryptographic signature | You don't learn actual age |
| You verify proof | Registry checks revocation | User can't impersonate |
| Service gets hacked | No PII to expose | No names, IDs, or data |
| User switches service | No linking across verifiers | User has unique ID here only |

**Result**: Compliance + Privacy + Low integration risk.

---

## 5-Minute Integration

### 1. Install

```bash
npm install @shielded-id/verifier-sdk
```

### 2. Create a Verifier

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";

const verifier = new ShieldedVerifier({
  origin: "https://your-service.example",  // Your service hostname
  registryUrl: "https://registry.example"   // Shared registry
});
```

### 3. Request a Proof

```typescript
const request = verifier.createProofRequest({
  requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
  policy: {
    requireStatusCheck: true,  // Check registry for revocation
    maxAgeSeconds: 300         // Proof valid for 5 minutes
  },
  callback: {
    method: "POST",
    url: "https://your-service.example/verify-callback"  // Where wallet submits proof
  }
});

// Send to wallet via QR code or deep link
const qrCode = await verifier.generateQR(request);
const deepLink = verifier.generateDeepLink(request);
```

### 4. Verify the Proof

```typescript
// In your callback endpoint, receive the proof and verify it
app.post("/verify-callback", async (req, res) => {
  const proof = req.body;  // From wallet
  
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });
  
  if (!result.valid) {
    return res.status(400).json({ valid: false, reason: result.reason });
  }
  
  // ✅ Proof is valid!
  // result.pairwiseSubjectId = unique ID for this user (at your service only)
  // Store this ID, use for subsequent requests
  
  res.json({
    valid: true,
    pairwiseSubjectId: result.pairwiseSubjectId,
    assuranceLevel: result.assuranceLevel
  });
});
```

That's it. **5 minutes of work, zero PII risk.**

---

## Recipes

Each recipe shows exactly what gets sent, displayed, verified, and stored.

### Recipe 1: Age Verification (Age Over 18)

**Use case**: Alcohol sales, adult-only services, age-gated content

**What you send to the wallet:**
```json
{
  "requestedClaims": [
    { "type": "AGE_OVER", "threshold": 18 }
  ],
  "policy": {
    "requireStatusCheck": true,
    "maxAgeSeconds": 300
  }
}
```

**What the wallet shows the user:**
```
┌─────────────────────────────────┐
│ Proof Request from your-site.   │
│                                 │
│ Proving:  Age ≥ 18              │
│ Verifier: your-site.example     │
│ Valid:    5 minutes             │
│                                 │
│ [Generate Proof]                │
└─────────────────────────────────┘
```
- User's wallet generates proof locally (no server needed)
- Proof is cryptographic signature (not the actual age)
- User can verify they aren't sending data

**What you receive from the wallet:**
```json
{
  "requestId": "req-xyz...",
  "nonce": "abc123...",
  "walletId": "wallet-id-...",
  "pairwiseSubjectId": "pairwise-subject-at-your-service",
  "claims": [
    { "type": "AGE_OVER", "value": 18 }
  ],
  "signature": "MEUCIQDx..."
}
```

**What you verify:**
- ✅ Signature is valid (user owns wallet)
- ✅ Wallet is registered in registry (not revoked)
- ✅ Nonce matches request (proof is for this request, not reused)
- ✅ Timestamp is fresh (not replayed)

**What you learn:**
- ✅ User proved "18 or older"
- ✅ Pairwise ID (unique at your service, doesn't identify user elsewhere)
- ✅ When proof was verified

**What you store:**
```json
{
  "userId": "pairwise-subject-at-your-service",
  "verified_at": "2025-01-07T15:30:00Z",
  "claim_type": "AGE_OVER",
  "claim_threshold": 18
}
```
❌ NOT stored: User's actual age, name, wallet ID, public key, revocation status, or any PII.

**Code example:**
```typescript
const request = verifier.createProofRequest({
  requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
  policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
  callback: { method: "POST", url: "https://your-service/verify" }
});

// ... after verifying ...
const userId = result.pairwiseSubjectId;
db.users.upsert({ pairwiseId: userId, ageVerified: true });
```

---

### Recipe 2: KYC Level Verification

**Use case**: Financial services (KYC Level 1/2/3), high-assurance access

**What you send:**
```json
{
  "requestedClaims": [
    { "type": "KYC_LEVEL", "minLevel": 2 }
  ],
  "policy": {
    "requireStatusCheck": true,
    "maxAgeSeconds": 86400  // 24 hours
  }
}
```

**What the wallet shows:**
```
┌──────────────────────────────────┐
│ KYC Verification                 │
│                                  │
│ Required: KYC Level ≥ 2          │
│ Your level: 3 ✅                 │
│                                  │
│ [Generate KYC Proof]             │
└──────────────────────────────────┘
```

**What you verify & store:**
```typescript
const result = await verifier.verifyProof(request, proof, {
  checkRevocation: true
});

if (result.assuranceLevel >= 2) {
  // Accept transaction
  db.transactions.insert({
    userId: result.pairwiseSubjectId,
    kycLevel: result.assuranceLevel,
    verified: true
  });
}
```

---

### Recipe 3: Continuity (Same User, No Identity)

**Use case**: Session continuity ("prove you're the same person who registered"), multi-device verification

**What you send:**
```json
{
  "requestedClaims": [
    { "type": "CONTINUITY" }
  ],
  "policy": {
    "requireStatusCheck": true,
    "maxAgeSeconds": 3600
  }
}
```

**What this means:**
- User proves: "I'm the same wallet that proved age earlier"
- You learn: The pairwise ID matches your records
- User learns: Nothing (proof doesn't reveal new data)

**Code example:**
```typescript
// During registration (first proof)
const initial = await verifier.verifyProof(request1, proof1, { checkRevocation: true });
db.sessions.insert({ userId: initial.pairwiseSubjectId, registeredAt: now() });

// Later, during re-auth on different device
const renewal = await verifier.verifyProof(request2, proof2, { checkRevocation: true });
if (renewal.pairwiseSubjectId === initial.pairwiseSubjectId) {
  // ✅ Same user, grant access
}
```

---

### Recipe 4: Proof Revocation Check

**Use case**: Instant denial-of-service (user revokes credential, proof fails immediately)

**What happens:**
1. User generates age proof → You verify ✅
2. User revokes wallet at registry
3. User generates new age proof → You verify ❌ (WALLET_REVOKED)

**Why revocation matters:**
- No "proof caching" exploit (attacker replays old proof)
- User controls their identity (can revoke anytime)
- You can't be "tricked" into trusting revoked wallets

**Code example:**
```typescript
const result = await verifier.verifyProof(request, proof, {
  checkRevocation: true  // ⚠️ Always set this to true
});

if (!result.valid) {
  if (result.reason === "WALLET_REVOKED") {
    // User revoked their credential
    // Don't re-prompt, inform user
    return res.json({ valid: false, reason: "Credential revoked by user" });
  }
  
  // Other errors (invalid signature, expired, etc.)
  return res.status(400).json({ valid: false, reason: result.reason });
}
```

---

## API Reference

### `verifier.createProofRequest(options)`

Creates a signed request for the wallet to prove claims.

**Parameters:**
```typescript
{
  requestedClaims: [
    {
      type: "AGE_OVER" | "KYC_LEVEL" | "CONTINUITY" | "CUSTOM",
      threshold?: number,        // For AGE_OVER
      minLevel?: number          // For KYC_LEVEL
    }
  ],
  policy: {
    requireStatusCheck: boolean, // Check registry? (always true in production)
    maxAgeSeconds: number,       // How long proof is valid
    forbidPII?: string[]         // Claim types to reject
  },
  callback: {
    method: "POST",
    url: string,                 // Your endpoint to receive proof
    timeout?: number             // Optional timeout in ms
  }
}
```

**Returns:**
```typescript
{
  requestId: string,             // Unique request ID
  nonce: string,                 // Random nonce (prevents replay)
  issuedAt: string,              // ISO timestamp
  expiresAt: string,             // ISO timestamp
  verifierOrigin: string,        // Your service hostname
  requestedClaims: [...],
  policy: {...},
  callback: {...}
}
```

### `verifier.verifyProof(request, proof, options)`

Verifies a proof response from the wallet.

**Parameters:**
- `request`: The original ProofRequest
- `proof`: The ProofResponse from wallet
- `options`: `{ checkRevocation: boolean }`

**Returns:**
```typescript
{
  valid: boolean,
  reason?: string,               // If !valid: error code
  pairwiseSubjectId?: string,    // If valid: unique user ID
  assuranceLevel?: number,       // If valid: KYC level (0 = none)
  verifiedAt: string             // ISO timestamp
}
```

**Error Reasons:**
| Reason | Meaning | Recovery |
|--------|---------|----------|
| `INVALID_SIGNATURE` | Proof was tampered with | Reject, ask for new proof |
| `WALLET_REVOKED` | User revoked credential | Inform user, don't re-prompt |
| `NONCE_MISMATCH` | Proof doesn't match request | Reject, ask for new proof |
| `TIMESTAMP_EXPIRED` | Proof expired | Reject, ask for new proof |
| `CLAIM_MISMATCH` | Proof doesn't match request | Reject, ask for new proof |
| `REGISTRY_UNREACHABLE` | Can't check revocation | Reject (be strict in production) |

### `verifier.checkRevocation(walletId)`

Check if a wallet is revoked without verifying a full proof.

```typescript
const status = await verifier.checkRevocation(walletId);
if (status === "REVOKED") {
  // Wallet was revoked
}
```

### `verifier.generateQR(request)`

Generate a QR code data URL for the request.

```typescript
const qrCode = await verifier.generateQR(request);
// Returns: "data:image/png;base64,iVBORw0KGgo..."

// Use in HTML
document.getElementById("qr").src = qrCode;
```

### `verifier.generateDeepLink(request)`

Generate a deep link (`shielded-id://`) for mobile wallets.

```typescript
const link = verifier.generateDeepLink(request);
// Returns: "shielded-id://proof?request_id=...&nonce=...&verifier_origin=..."

// Use in HTML
document.getElementById("link").href = link;
```

---

## Security Requirements

### Required for Production

1. **Always require status check:**
   ```typescript
   policy: { requireStatusCheck: true, ... }
   ```
   Without this, you can't verify wallets aren't revoked.

2. **Always set callback timeout:**
   ```typescript
   callback: { method: "POST", url: "...", timeout: 10000 }
   ```
   Prevent hanging requests.

3. **Always use HTTPS:**
   - Registry URL must be HTTPS
   - Callback URL must be HTTPS
   - Only exception: localhost for development

4. **Validate callback URL:**
   - Ensure it's under your control
   - Don't accept dynamic URLs from users
   - Use env variables only

5. **Never log or cache proofs:**
   - Proofs are sensitive (they're cryptographic evidence)
   - Log only the verification result
   - Cache only the pairwise ID and verification timestamp

### Replay Attack Prevention

Shielded ID prevents replay attacks with:
- **Unique nonce per request** (prevents reusing old proofs)
- **Timestamp validation** (prevents time-travel)
- **One-time requestId** (can only be used once)

**Your responsibility:**
- Create a new request for each verification attempt
- Don't reuse request IDs
- Check `maxAgeSeconds` (how old a proof can be)

---

## Best Practices

### Do

- ✅ Store only `pairwiseSubjectId` (user ID) + timestamp + claim type
- ✅ Treat pairwise IDs as user IDs (one per verifier, opaque)
- ✅ Expire proofs after `maxAgeSeconds`
- ✅ Require fresh proofs for sensitive operations
- ✅ Set `requireStatusCheck: true` always
- ✅ Monitor for `WALLET_REVOKED` errors (user control signal)

### Don't

- ❌ Try to extract identity from proofs (you can't)
- ❌ Link proofs across services (each service gets a unique pairwise ID)
- ❌ Cache proofs longer than `maxAgeSeconds`
- ❌ Log proof content (log results only)
- ❌ Skip revocation checks
- ❌ Store anything except: pairwise ID, timestamp, claim types

---

## Error Handling Cheatsheet

```typescript
const result = await verifier.verifyProof(request, proof, { checkRevocation: true });

if (!result.valid) {
  switch (result.reason) {
    case "WALLET_REVOKED":
      // User revoked. Inform them, don't re-prompt.
      return res.json({ message: "Your credential was revoked" });
    
    case "NONCE_MISMATCH":
    case "TIMESTAMP_EXPIRED":
    case "INVALID_SIGNATURE":
    case "CLAIM_MISMATCH":
      // Proof is bad. Ask for a new one.
      return res.status(400).json({ message: "Proof invalid. Please try again." });
    
    case "REGISTRY_UNREACHABLE":
      // Network error. Be strict: reject.
      return res.status(503).json({ message: "Service temporarily unavailable" });
    
    default:
      // Unknown error. Log and reject.
      console.error("Unexpected verification error:", result.reason);
      return res.status(500).json({ message: "Verification failed" });
  }
}

// ✅ Valid proof
const userId = result.pairwiseSubjectId;
// Use this as your primary user identifier
```

---

## Full Example: Age-Gated API

```typescript
import express from "express";
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";

const app = express();
const verifier = new ShieldedVerifier({
  origin: "https://api.example.com",
  registryUrl: "https://registry.example.com"
});

// Endpoint 1: Generate proof request
app.post("/age-verify/request", async (_req, res) => {
  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
    callback: { method: "POST", url: "https://api.example.com/age-verify/callback" }
  });

  // Send QR code to frontend
  const qr = await verifier.generateQR(request);
  res.json({ requestId: request.requestId, qr });
});

// Endpoint 2: Receive and verify proof
app.post("/age-verify/callback", async (req, res) => {
  const proof = req.body;

  // Assume we cached the original request somewhere
  const request = await cache.get(proof.requestId);
  if (!request) return res.status(404).json({ valid: false });

  const result = await verifier.verifyProof(request, proof, { checkRevocation: true });
  if (!result.valid) {
    return res.status(400).json({ valid: false, reason: result.reason });
  }

  // ✅ Verified! Store minimal data.
  const userId = result.pairwiseSubjectId;
  await db.users.upsert({
    id: userId,
    ageVerified: true,
    verifiedAt: result.verifiedAt
  });

  res.json({ valid: true, userId });
});

app.listen(3000);
```

---

## Testing

```typescript
import { test } from "vitest";
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";

test("verifyProof rejects invalid signature", async () => {
  const verifier = new ShieldedVerifier({ origin: "https://test" });
  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
    callback: { method: "POST", url: "https://test/callback" }
  });

  const fakeProof = {
    ...request,
    signature: "invalid_signature"
  };

  const result = await verifier.verifyProof(request, fakeProof, { checkRevocation: false });
  expect(result.valid).toBe(false);
  expect(result.reason).toMatch(/SIGNATURE|INVALID/);
});
```

---

## FAQ

**Q: Can I verify proofs without checking revocation?**  
A: Yes, but don't in production. Set `requireStatusCheck: true` and `checkRevocation: true`.

**Q: Can I cache proofs?**  
A: No. Proofs are one-time use. Store the verification result instead.

**Q: Can I use the same pairwise ID across services?**  
A: No. Each service gets a unique pairwise ID for the same user (privacy feature).

**Q: What if the registry is down?**  
A: Be strict: reject the proof. Use `requireStatusCheck: true` to enforce this.

**Q: Can I extract the user's real age from the proof?**  
A: No. The proof is a cryptographic signature, not encrypted data.

**Q: How do I revoke a user's access?**  
A: You don't. Users revoke themselves at the registry. You detect it when verification fails.

---

## Browser Compatibility

Requires WebCrypto (available in all modern browsers and Node.js 15+).

Older Node.js versions: Use a polyfill or upgrade.

---

## License

MIT

---

## Next Steps

- **Try a recipe**: [Recipes are in the docs](./docs/recipes.md)
- **See the demo**: [Verifier demo reference implementation](../../apps/verifier-demo)
- **Ask questions**: [Issues on GitHub](https://github.com/...)

**Make your service privacy-first. It's easier than you think.**
