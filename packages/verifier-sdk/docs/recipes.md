# Shielded ID Recipes

Copy-paste recipes for common integration patterns. Each recipe shows the complete flow: request → display → verify → store.

---

## Recipe 1: Age Over 18 (Simple Boolean Claim)

**Use Case**: Alcohol sales, gambling, adult content

**Your Code:**

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";

const verifier = new ShieldedVerifier({
  origin: "https://your-service.example",
  registryUrl: "https://registry.example"
});

// Endpoint: Create proof request
app.post("/age-check/request", async (_req, res) => {
  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: {
      requireStatusCheck: true,
      maxAgeSeconds: 300  // Proof valid for 5 minutes
    },
    callback: {
      method: "POST",
      url: "https://your-service.example/age-check/verify"
    }
  });

  // Send to user (QR + link)
  const qr = await verifier.generateQR(request);
  res.json({
    requestId: request.requestId,
    qr: qr,  // "data:image/png;base64,..."
    deepLink: verifier.generateDeepLink(request)
  });
});

// Endpoint: Receive proof and verify
app.post("/age-check/verify", async (req, res) => {
  const proof = req.body;

  // Retrieve the request (store in Redis/cache with TTL 5 min)
  const request = await redis.get(`proof-request:${proof.requestId}`);
  if (!request) {
    return res.status(404).json({ valid: false, reason: "REQUEST_NOT_FOUND" });
  }

  // Verify the proof
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });

  if (!result.valid) {
    return res.status(400).json({
      valid: false,
      reason: result.reason
    });
  }

  // ✅ Verified! Store minimal data.
  const userId = result.pairwiseSubjectId;
  await db.users.upsert(userId, {
    ageVerified: true,
    verifiedAt: result.verifiedAt
  });

  res.json({
    valid: true,
    userId: userId
  });
});
```

**What Gets Stored:**
```json
{
  "userId": "pairwise-subject-id-...",
  "ageVerified": true,
  "verifiedAt": "2025-01-07T15:30:00Z"
}
```

❌ NOT stored: Actual age, wallet ID, name, anything personal.

---

## Recipe 2: KYC Level (Assurance Tiers)

**Use Case**: Payment processor, bank, high-value transactions

**Your Code:**

```typescript
// Endpoint: Request KYC verification
app.post("/kyc-verify/request", async (req, res) => {
  const requiredLevel = req.body.minLevel || 1;  // 1-3 usually

  const request = verifier.createProofRequest({
    requestedClaims: [
      { type: "KYC_LEVEL", minLevel: requiredLevel }
    ],
    policy: {
      requireStatusCheck: true,
      maxAgeSeconds: 86400  // 24 hours (KYC is less sensitive to age)
    },
    callback: {
      method: "POST",
      url: "https://your-service.example/kyc-verify/callback"
    }
  });

  const qr = await verifier.generateQR(request);
  res.json({ requestId: request.requestId, qr });
});

// Endpoint: Verify and process
app.post("/kyc-verify/callback", async (req, res) => {
  const proof = req.body;
  const request = await redis.get(`proof:${proof.requestId}`);

  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });

  if (!result.valid) {
    return res.status(400).json({ valid: false, reason: result.reason });
  }

  // KYC succeeded. Check assurance level.
  const userId = result.pairwiseSubjectId;
  const kycLevel = result.assuranceLevel || 0;

  if (kycLevel < 1) {
    return res.status(403).json({
      valid: false,
      reason: "INSUFFICIENT_KYC_LEVEL"
    });
  }

  // Store transaction with KYC level for audit
  await db.users.upsert(userId, {
    kycLevel: kycLevel,
    kycVerifiedAt: result.verifiedAt,
    canTransact: kycLevel >= 1,
    canWithdraw: kycLevel >= 2,
    canLoan: kycLevel >= 3
  });

  res.json({
    valid: true,
    userId,
    kycLevel,
    permissions: {
      canTransact: kycLevel >= 1,
      canWithdraw: kycLevel >= 2,
      canLoan: kycLevel >= 3
    }
  });
});

// Authorization middleware
async function requireKYCLevel(level: 1 | 2 | 3) {
  return async (req: any, res: any, next: any) => {
    const userId = req.user.pairwiseSubjectId;
    const user = await db.users.get(userId);

    if (!user || !user.kycLevel || user.kycLevel < level) {
      return res.status(403).json({
        error: "INSUFFICIENT_KYC_LEVEL",
        requiredLevel: level,
        yourLevel: user?.kycLevel || 0
      });
    }

    next();
  };
}

// Use in routes
app.post("/payment/send", requireKYCLevel(1), async (req, res) => {
  // User has KYC Level ≥ 1
  // Process payment
});

app.post("/withdraw", requireKYCLevel(2), async (req, res) => {
  // User has KYC Level ≥ 2
  // Process withdrawal
});
```

---

## Recipe 3: Continuity (Same User, No Re-identification)

**Use Case**: Session resumption, multi-device, return visits

**Your Code:**

```typescript
// During initial registration (first proof)
app.post("/register", async (req, res) => {
  const ageRequest = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
    callback: { method: "POST", url: "https://your-service/register/verify" }
  });

  res.json({
    step: "age_verification",
    requestId: ageRequest.requestId,
    qr: await verifier.generateQR(ageRequest)
  });
});

// Verify age, create user
app.post("/register/verify", async (req, res) => {
  const proof = req.body;
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });

  if (!result.valid) {
    return res.status(400).json({ valid: false });
  }

  const userId = result.pairwiseSubjectId;
  await db.users.insert({
    id: userId,
    createdAt: new Date(),
    ageVerified: true
  });

  res.json({
    userId,
    step: "profile_setup"
  });
});

// Later: Return visit on different device
// User wants to verify they're the same person
app.post("/continuity-check/request", async (req, res) => {
  const continuityRequest = verifier.createProofRequest({
    requestedClaims: [{ type: "CONTINUITY" }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 3600 },
    callback: { method: "POST", url: "https://your-service/continuity-verify" }
  });

  res.json({
    requestId: continuityRequest.requestId,
    qr: await verifier.generateQR(continuityRequest),
    message: "Prove you're the same person to access your account"
  });
});

// Verify continuity
app.post("/continuity-verify", async (req, res) => {
  const proof = req.body;
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });

  if (!result.valid) {
    return res.status(400).json({ valid: false });
  }

  const userId = result.pairwiseSubjectId;
  const user = await db.users.get(userId);

  if (!user) {
    // Continuity proof doesn't match any known user
    // They're trying to impersonate someone
    return res.status(403).json({
      valid: false,
      reason: "USER_NOT_FOUND"
    });
  }

  // ✅ Same user confirmed. Log them in.
  res.json({
    valid: true,
    userId,
    message: "Welcome back"
  });
});
```

**Key Point**: You NEVER get a new pairwise ID if the user's wallet hasn't changed. If the wallet is different, it's a different user (that's the point).

---

## Recipe 4: Revocation Handling

**Use Case**: Instantly deny access if credential is revoked

**Your Code:**

```typescript
// Standard verification with mandatory revocation check
async function verifyAndStore(request: ProofRequest, proof: ProofResponse) {
  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true  // ⚠️ Always true in production
  });

  // Handle different failure modes
  if (!result.valid) {
    if (result.reason === "WALLET_REVOKED") {
      // User revoked their credential (expected behavior)
      // Inform user, don't re-prompt
      return {
        status: "REVOKED",
        message: "Your credential has been revoked. You can re-enroll anytime."
      };
    }

    if (result.reason === "REGISTRY_UNREACHABLE") {
      // Network error (can't reach registry)
      // Be strict: reject (don't cache proofs)
      return {
        status: "ERROR",
        message: "Cannot verify right now. Please try again.",
        retryable: true
      };
    }

    // Other errors (invalid signature, expired, etc.)
    return {
      status: "INVALID",
      reason: result.reason,
      message: "Proof is invalid. Please generate a new one."
    };
  }

  // ✅ Valid proof. Store minimal data.
  const userId = result.pairwiseSubjectId;
  await db.users.upsert(userId, {
    verified: true,
    verifiedAt: result.verifiedAt
  });

  return {
    status: "OK",
    userId
  };
}
```

**Key Pattern:**
```
WALLET_REVOKED → User action, inform + allow re-enroll
REGISTRY_UNREACHABLE → Network error, reject strictly
INVALID_SIGNATURE → Proof tampered, ask for new proof
TIMESTAMP_EXPIRED → Proof too old, ask for new proof
```

---

## Recipe 5: No-PII Audit Log

**Use Case**: Compliance + debugging without privacy risk

**Your Code:**

```typescript
// ✅ SAFE: Log these
async function logVerification(result: VerificationResult) {
  await db.auditLog.insert({
    timestamp: new Date(),
    service: "age-verification",
    userId: result.pairwiseSubjectId,  // Opaque ID, no PII linkage
    outcome: result.valid ? "SUCCESS" : "FAILED",
    reason: result.reason,
    assuranceLevel: result.assuranceLevel
  });
}

// ❌ UNSAFE: Don't log these
async function logVerification_BAD(proof: ProofResponse) {
  await db.auditLog.insert({
    proof_content: proof.signature,  // ❌ Raw proof data
    wallet_id: proof.walletId,        // ❌ Wallet ID (PII linkage)
    all_claims: proof.claims           // ❌ Claim evidence
  });
}

// Audit query example
async function auditReport(startDate: Date, endDate: Date) {
  const logs = await db.auditLog.find({
    timestamp: { $gte: startDate, $lte: endDate }
  });

  return {
    totalVerifications: logs.length,
    successRate: logs.filter(l => l.outcome === "SUCCESS").length / logs.length,
    failureReasons: logs
      .filter(l => l.outcome === "FAILED")
      .reduce((acc, log) => {
        acc[log.reason] = (acc[log.reason] || 0) + 1;
        return acc;
      }, {})
  };
}
```

---

## Recipe 6: Testing Proofs Locally

**Use Case**: Integration testing without a real wallet

**Your Code:**

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";
import { test, expect } from "vitest";

test("Age verification success path", async () => {
  const verifier = new ShieldedVerifier({
    origin: "https://test.example",
    registryUrl: "https://test-registry.example"
  });

  // Create request
  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: { requireStatusCheck: false, maxAgeSeconds: 300 },  // No registry in tests
    callback: { method: "POST", url: "https://test.example/verify" }
  });

  expect(request.requestId).toBeDefined();
  expect(request.nonce).toBeDefined();

  // Simulate wallet: would create proof here
  // For now, just verify request structure
  expect(request.requestedClaims[0].type).toBe("AGE_OVER");
  expect(request.requestedClaims[0].threshold).toBe(18);
});
```

---

## Recipe 7: Monitoring & Alerts

**Use Case**: Production observability

**Your Code:**

```typescript
// Track verification latency
async function verifyWithMetrics(request: ProofRequest, proof: ProofResponse) {
  const start = Date.now();

  const result = await verifier.verifyProof(request, proof, {
    checkRevocation: true
  });

  const latencyMs = Date.now() - start;

  // Log metrics
  await metrics.record({
    name: "proof_verification",
    latencyMs,
    success: result.valid,
    reason: result.reason
  });

  // Alert on slow verifications
  if (latencyMs > 500) {
    console.warn(`Slow verification: ${latencyMs}ms`, { result });
  }

  // Alert on registry errors
  if (result.reason === "REGISTRY_UNREACHABLE") {
    await alerting.send({
      severity: "HIGH",
      message: "Registry is unreachable"
    });
  }

  return result;
}

// Dashboard query
async function verificationMetrics(window: "1h" | "24h" | "7d") {
  const metrics = await db.metrics.aggregate([
    {
      $match: {
        name: "proof_verification",
        timestamp: { $gte: getWindowStart(window) }
      }
    },
    {
      $group: {
        _id: "$reason",
        count: { $sum: 1 },
        avgLatency: { $avg: "$latencyMs" },
        p99Latency: { $percentile: ["$latencyMs", 0.99] }
      }
    }
  ]);

  return metrics;
}
```

---

## Quick Reference

### Claim Types

| Type | Threshold | Meaning |
|------|-----------|---------|
| `AGE_OVER` | 18, 21, etc. | User is ≥ N years old |
| `KYC_LEVEL` | 1, 2, 3 | Assurance level (1=basic, 3=full) |
| `CONTINUITY` | (none) | Same user as before |
| `CUSTOM` | Any | Your custom claim |

### Error Handling Quick Lookup

| Error | Cause | Recovery |
|-------|-------|----------|
| `INVALID_SIGNATURE` | Proof tampered | Ask for new proof |
| `WALLET_REVOKED` | User revoked | Inform user, allow re-enroll |
| `NONCE_MISMATCH` | Proof for wrong request | Ask for new proof |
| `TIMESTAMP_EXPIRED` | Proof too old | Ask for new proof |
| `REGISTRY_UNREACHABLE` | Network error | Be strict, reject |
| `CLAIM_MISMATCH` | Wrong claims | Ask for new proof |

### Best Practices

- ✅ Always set `requireStatusCheck: true`
- ✅ Always use `checkRevocation: true`
- ✅ Store only `pairwiseSubjectId` + timestamp + claim types
- ✅ Log verification outcomes, NOT proof content
- ✅ Set `maxAgeSeconds` based on use case (5 min for age, 24h for KYC)
- ✅ Cache requests in Redis with 5-10 min TTL
- ❌ Never try to extract identity from proofs
- ❌ Never link pairwise IDs across services
- ❌ Never cache proofs longer than `maxAgeSeconds`
- ❌ Never skip revocation checks

---

## Recipe 8: Express Middleware

**Use Case**: Drop-in middleware for Express.js applications

**Your Code:**

```typescript
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";
import express from "express";

const verifier = new ShieldedVerifier({
  origin: "https://your-service.example",
  registryUrl: "https://registry.example"
});

// Middleware for age verification
export function requireAgeOver18(req: express.Request, res: express.Response, next: express.NextFunction) {
  const proof = req.body.proof;
  if (!proof) {
    return res.status(401).json({ error: "PROOF_REQUIRED" });
  }

  // Create minimal request for validation
  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
    callback: { method: "POST", url: "https://your-service.example/callback" }
  });

  verifier.verifyProof(request, proof, { checkRevocation: true })
    .then(result => {
      if (!result.valid) {
        return res.status(403).json({ error: "AGE_VERIFICATION_FAILED", reason: result.reason });
      }
      // Attach verified user ID to request
      (req as any).userId = result.pairwiseSubjectId;
      next();
    })
    .catch(err => {
      console.error("Verification error:", err);
      res.status(500).json({ error: "VERIFICATION_ERROR" });
    });
}

// Usage in routes
app.post("/purchase-alcohol", requireAgeOver18, (req, res) => {
  const userId = (req as any).userId;
  // Process purchase with verified user
  res.json({ success: true, userId });
});
```

---

## Recipe 9: Next.js Route Handler

**Use Case**: API routes in Next.js applications

**Your Code:**

```typescript
// app/api/verify-age/route.ts
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";
import { NextRequest, NextResponse } from "next/server";

const verifier = new ShieldedVerifier({
  origin: process.env.VERIFIER_ORIGIN!,
  registryUrl: process.env.REGISTRY_URL
});

export async function POST(request: NextRequest) {
  try {
    const { proof } = await request.json();

    if (!proof) {
      return NextResponse.json({ error: "PROOF_REQUIRED" }, { status: 400 });
    }

    // Create validation request
    const validationRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: `${process.env.VERIFIER_ORIGIN}/api/callback` }
    });

    const result = await verifier.verifyProof(validationRequest, proof, {
      checkRevocation: true
    });

    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        reason: result.reason
      }, { status: 403 });
    }

    return NextResponse.json({
      valid: true,
      userId: result.pairwiseSubjectId,
      assuranceLevel: result.assuranceLevel
    });

  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "VERIFICATION_ERROR" }, { status: 500 });
  }
}

// Usage in pages
// app/purchase/page.tsx
"use client";
import { useState } from "react";

export default function PurchasePage() {
  const [verified, setVerified] = useState(false);

  const handleVerification = async (proof: any) => {
    const response = await fetch("/api/verify-age", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof })
    });

    const result = await response.json();
    if (result.valid) {
      setVerified(true);
      // Proceed with purchase
    }
  };

  return (
    <div>
      {verified ? (
        <div>✅ Age verified - proceed with purchase</div>
      ) : (
        <div>🔒 Age verification required</div>
      )}
    </div>
  );
}
```

---

**Questions?** See the SDK README or check the demo at `apps/verifier-demo`.
