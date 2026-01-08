import { ShieldedVerifier, ProofRequest, ProofResponse } from "@shielded-id/verifier-sdk";
import express from "express";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json({ limit: "1mb" }));

const verifier = new ShieldedVerifier({
  origin: process.env.VERIFIER_ORIGIN ?? "http://localhost:5174",
  registryUrl: process.env.REGISTRY_URL ?? "http://localhost:3000"
});

interface VerificationResult {
  valid: boolean;
  reason?: string;
  pairwiseSubjectId?: string;
  verifiedAt?: string;
  assuranceLevel?: number;
}

const requests = new Map<string, ProofRequest>();
const sessions: Array<{
  id: string;
  pairwiseSubjectId: string;
  verifiedAt: string;
  claims: Array<{ type: string; value: unknown }>;
  assuranceLevel: number;
  suite?: string;
}> = [];
let latestResult: VerificationResult | null = null;

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "verifier-backend",
    timestamp: new Date().toISOString(),
    registryUrl: process.env.REGISTRY_URL
  });
});

// Status endpoint
app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    service: "Shielded ID Verifier Backend",
    version: "1.0.0",
    endpoints: [
      "GET /health",
      "GET /api/status",
      "POST /api/proof-request",
      "POST /verify-callback",
      "GET /api/sessions",
      "GET /api/latest-result"
    ],
    requestsInFlight: requests.size,
    totalSessions: sessions.length
  });
});

// Proof request storage
app.post("/api/proof-request", (req, res) => {
  const request = req.body as ProofRequest;
  if (!request?.requestId) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "Missing requestId" });
    return;
  }
  requests.set(request.requestId, request);
  res.json({ ok: true, requestId: request.requestId });
});

// Verify callback (main verification endpoint)
app.post("/verify-callback", async (req, res) => {
  const proof = req.body as ProofResponse;
  if (!proof?.requestId) {
    res.status(400).json({ valid: false, reason: "MISSING_REQUEST_ID" });
    return;
  }
  const request = requests.get(proof.requestId);
  if (!request) {
    res.status(404).json({ valid: false, reason: "REQUEST_NOT_FOUND" });
    return;
  }

  try {
    const result = await verifier.verifyProof(request, proof, { checkRevocation: true });
    if (!result.valid) {
      latestResult = {
        valid: false,
        reason: result.reason ?? "VERIFICATION_FAILED",
        verifiedAt: new Date().toISOString()
      };
      res.status(400).json(latestResult);
      return;
    }

    const session = {
      id: randomUUID(),
      pairwiseSubjectId: result.pairwiseSubjectId ?? "",
      verifiedAt: result.verifiedAt ?? new Date().toISOString(),
      claims: proof.claims?.map((claim) => ({ type: claim.type, value: claim.value })) ?? [],
      assuranceLevel: typeof result.assuranceLevel === "number" ? result.assuranceLevel : 0,
      suite: proof.suite
    };
    sessions.unshift(session);
    latestResult = {
      valid: true,
      pairwiseSubjectId: result.pairwiseSubjectId,
      verifiedAt: result.verifiedAt,
      assuranceLevel: result.assuranceLevel
    };

    res.json({
      valid: true,
      pairwiseSubjectId: result.pairwiseSubjectId,
      verifiedAt: result.verifiedAt,
      sessionId: session.id
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    latestResult = { valid: false, reason: `VERIFICATION_ERROR: ${errorMessage}` };
    res.status(500).json({ valid: false, reason: "INTERNAL_ERROR", details: errorMessage });
  }
});

// Get session history
app.get("/api/sessions", (_req, res) => {
  res.json({
    total: sessions.length,
    sessions: sessions.slice(0, 20)
  });
});

// Get latest verification result (for frontend polling)
app.get("/api/latest-result", (_req, res) => {
  res.json(latestResult ?? { valid: false, reason: "PENDING" });
});

// Clear latest result (for testing)
app.post("/api/latest-result/clear", (_req, res) => {
  latestResult = null;
  res.json({ ok: true });
});

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    message: "Shielded ID Verifier Backend API",
    endpoints: [
      "GET /health (health check)",
      "GET /api/status (service status)",
      "POST /api/proof-request (store proof request)",
      "POST /verify-callback (verify proof)",
      "GET /api/sessions (verification history)",
      "GET /api/latest-result (latest result for polling)",
      "POST /api/latest-result/clear (clear result for testing)"
    ]
  });
});

const port = Number(process.env.PORT ?? 5050);
app.listen(port, () => {
  console.log(`✅ Verifier demo backend running on http://localhost:${port}`);
  console.log(`   Health: GET http://localhost:${port}/health`);
  console.log(`   Status: GET http://localhost:${port}/api/status`);
});
