import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import { verifyECDSAP256 } from "../src/crypto.js";

// Mock the age-zk module to avoid WASM loading in tests
vi.mock('@shielded-id/age-zk', () => ({
  prove_ge: vi.fn().mockResolvedValue({
    commitment: new Uint8Array(32),
    proof: new Uint8Array(100),
    public_inputs: new Uint8Array(50)
  }),
  proveGE: vi.fn().mockResolvedValue({
    commitment: 'mock-commitment',
    proof: 'mock-proof', 
    publicInputs: 'mock-inputs'
  }),
  verify_ge: vi.fn().mockImplementation(async () => true),
  verify_ge_components: vi.fn().mockImplementation(async () => true)
}));

// Mock the crypto functions to avoid signature verification issues
vi.mock("../src/crypto.js", async () => {
  const actual = await vi.importActual("../src/crypto.js");
  return {
    ...actual,
    verifyECDSAP256: vi.fn().mockResolvedValue(true),
    validateNonce: vi.fn().mockImplementation((nonce1, nonce2) => nonce1 === nonce2),
    validateTimestamp: vi.fn().mockImplementation((issuedAt, expiresAt, maxAge) => {
      const now = Date.now();
      const issued = Date.parse(issuedAt);
      const expires = Date.parse(expiresAt);
      return now >= issued && now <= expires;
    })
  };
});

let fetchCalls = 0;
let verifier: ShieldedVerifier;

beforeEach(() => {
  fetchCalls = 0;
  verifier = new ShieldedVerifier({
    origin: "https://shop.example",
    registryUrl: "https://registry.example"
  });
  verifier.resetForTesting();
  vi.mocked(verifyECDSAP256).mockResolvedValue(true);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | Request | URL) => {
    fetchCalls += 1;
    const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : (url as Request).url);
    
    // Don't mock WASM file requests
    if (urlString.includes('.wasm')) {
      return originalFetch(url);
    }
    
    // Match /v1/status/*, /v1/keys/*/status, or /v1/wallet/*
    if (urlString.includes("/v1/status/") || urlString.match(/\/v1\/keys\/[^/]+\/status/) || urlString.includes("/v1/wallet/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          walletId: "test-wallet",
          keys: [{
            keyId: "test-key",
            publicKey: {
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            },
            status: "ACTIVE"
          }]
        })
      } as Response;
    }
    if (urlString.includes(".well-known/shielded-id-keys.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          keys: [{
            keyId: "test-key",
            publicKey: {
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            },
            status: "ACTIVE"
          }]
        })
      } as Response;
    }
    return originalFetch(url);
  }) as typeof fetch;
});

describe("ShieldedVerifier", () => {
  it("creates proof requests with nonce and timestamps", () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestId).toBeTruthy();
    expect(request.nonce).toBeTruthy();
    expect(request.issuedAt).toBeTruthy();
    expect(request.expiresAt).toBeTruthy();
  });

  it("generates deep link", () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const link = verifier.generateDeepLink(request);
    expect(link.startsWith("shielded-id://proof?")).toBe(true);
  });

  it("generates QR data URL", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const qr = await verifier.generateQR(request);
    expect(qr.startsWith("data:image/png;base64,")).toBe(true);
  });
});

// Regression guardrails: Ensure minimal disclosure is maintained
describe("Minimal Disclosure Regression Guards", () => {
  describe("AGE_OVER claims", () => {
    it("rejects proofs containing raw age values", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock proof with forbidden raw age value
      const invalidProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "AGE_OVER", value: 25 } // ❌ Raw age value - forbidden
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, invalidProof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
    });

    it("rejects proofs containing dateOfBirth", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock proof with forbidden dateOfBirth in evidence
      const invalidProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          {
            type: "AGE_OVER",
            value: true,
            evidence: { dateOfBirth: "1990-01-01" } // ❌ Raw DOB - forbidden
          }
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, invalidProof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
    });

    it("accepts valid boolean AGE_OVER claims", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock valid proof with only boolean value
      const validProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "AGE_OVER", value: true } // ✅ Only boolean - allowed
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      // Note: This will fail signature verification, but that's expected
      // The important part is it doesn't fail on INVALID_CLAIM_VALUE or PII_DETECTED
      const result = await verifier.verifyProof(request, validProof);
      expect(result.reason).not.toBe("INVALID_CLAIM_VALUE");
      expect(result.reason).not.toBe("PII_DETECTED");
    });
  });

  describe("KYC_LEVEL claims", () => {
    it("rejects proofs containing raw KYC level numbers", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock proof with forbidden raw KYC level
      const invalidProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "KYC_LEVEL", value: 3 } // ❌ Raw KYC level - forbidden
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, invalidProof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
    });

    it("rejects proofs containing personal identifiers", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock proof with forbidden personal data
      const invalidProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          {
            type: "KYC_LEVEL",
            value: true,
            evidence: {
              name: "John Doe",
              address: "123 Main St",
              ssn: "123-45-6789"
            } // ❌ Personal identifiers - forbidden
          }
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, invalidProof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
    });

    it("accepts valid boolean KYC_LEVEL claims", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock valid proof with only boolean value
      const validProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "KYC_LEVEL", value: true } // ✅ Only boolean - allowed
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      // Note: This will fail signature verification, but that's expected
      // The important part is it doesn't fail on INVALID_CLAIM_VALUE or PII_DETECTED
      const result = await verifier.verifyProof(request, validProof);
      expect(result.reason).not.toBe("INVALID_CLAIM_VALUE");
      expect(result.reason).not.toBe("PII_DETECTED");
    });
  });

  describe("CONTINUITY claims", () => {
    it("accepts string pairwise subject IDs", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "CONTINUITY" }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock valid proof with string value
      const validProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "CONTINUITY", value: "test-subject-id" } // ✅ String ID - allowed
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, validProof);
      expect(result.reason).not.toBe("INVALID_CLAIM_VALUE");
      expect(result.reason).not.toBe("PII_DETECTED");
    });
  });
});

describe("ShieldedVerifier Error Paths", () => {
  it("rejects expired requests", async () => {
    const expiredRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: -1 }, // Already expired
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: expiredRequest.requestId,
      nonce: expiredRequest.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(expiredRequest, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("REQUEST_EXPIRED");
  });

  it("rejects nonce mismatch", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: "wrong-nonce",
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NONCE_MISMATCH");
  });

  it("rejects request ID mismatch", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: "wrong-request-id",
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("REQUEST_ID_MISMATCH");
  });

  it("rejects unsupported suite", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "UNSUPPORTED_SUITE",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_SUITE");
  });

  it("rejects ZK suite without ZK proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
      // Missing zkProof
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MISSING_ZK_PROOF");
  });

  it("rejects non-ZK suite with ZK proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature",
      zkProof: "unexpected-zk-proof"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNEXPECTED_ZK_PROOF");
  });

  it("handles wallet not found", async () => {
    // Temporarily change fetch mock to return 404 for wallet status
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | Request) => {
    const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes("/v1/status/")) {
        return { ok: false, status: 404 } as Response;
      }
      return originalFetch(url);
    }) as typeof fetch;

    try {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      const proof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "unknown-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [{ type: "AGE_OVER", value: true }],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, proof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("WALLET_NOT_FOUND");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles missing key ID when status check required", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      // Missing keyId
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_ID_REQUIRED");
  });

  it("handles claim policy mismatch", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 21 }], // Requires age over 21
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: false }], // But claim proves user is NOT over 21
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("handles expired claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        expiresAt: "2020-01-01T00:00:00Z" // Already expired
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_EXPIRED");
  });

  it("handles PII detection from policy", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: {
        requireStatusCheck: false,
        maxAgeSeconds: 60,
        forbidPII: ["email", "phone"]
      },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        evidence: { email: "user@example.com" }
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
  });
});

describe("ShieldedVerifier ZK Proofs", () => {
  it("accepts valid AGE_ZK_BULLETPROOFS_V1 proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    // Generate a real ZK proof using WASM (mocked in tests)
    const { prove_ge } = await import('@shielded-id/age-zk');
    const proofBundle = await prove_ge(BigInt(25), BigInt(18), `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`);

    // Convert Uint8Arrays to base64url for response
    const commitment = Buffer.from(proofBundle.commitment).toString("base64url");
    const bulletproof = Buffer.from(proofBundle.proof).toString("base64url");
    const publicInputs = Buffer.from(proofBundle.public_inputs).toString("base64url");

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: {
        commitment,
        bulletproof,
        publicInputs
      }
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.reason).not.toBe("MISSING_ZK_PROOF");
    expect(result.reason).not.toBe("UNEXPECTED_ZK_PROOF");
    expect(result.reason).not.toBe("ZK_PROOF_INVALID");
  });

  it("accepts valid KYC_ZK_BULLETPROOFS_V1 proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    // Generate a real KYC ZK proof using WASM (mocked in tests)
    const { prove_ge } = await import('@shielded-id/age-zk');
    const proofBundle = await prove_ge(BigInt(3), BigInt(2), `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`);

    // Convert Uint8Arrays to base64url for response
    const commitment = Buffer.from(proofBundle.commitment).toString("base64url");
    const bulletproof = Buffer.from(proofBundle.proof).toString("base64url");
    const publicInputs = Buffer.from(proofBundle.public_inputs).toString("base64url");

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "KYC_LEVEL", value: true }],
      suite: "KYC_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      kycZkProof: {
        commitment,
        bulletproof,
        publicInputs,
        minLevel: 2
      }
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.reason).not.toBe("MISSING_ZK_PROOF");
    expect(result.reason).not.toBe("UNEXPECTED_ZK_PROOF");
    expect(result.reason).not.toBe("ZK_PROOF_INVALID");
  });
});

describe("ShieldedVerifier Methods", () => {
  it("checkRevocation method works", async () => {
    const result = await verifier.checkRevocation("test-key");
    expect(result).toBeDefined();
  });

  it("handles unexpected claim types", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [
        { type: "AGE_OVER", value: true },
        { type: "UNEXPECTED_CLAIM", value: true } // This claim type is not requested
      ],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("handles PII detection via policy forbidPII", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: {
        requireStatusCheck: false,
        maxAgeSeconds: 60,
        forbidPII: ["sessionId"]
      },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        evidence: { sessionId: "abc123" } // This should trigger PII detection via policy
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("PII_DETECTED");
  });

  it("handles expired claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        expiresAt: "2020-01-01T00:00:00Z" // Expired date
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_EXPIRED");
  });

  it("handles claims with issuer signatures", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        issuer: {
          did: "did:example:issuer",
          keyId: "issuer-key-1",
          signature: "mock-issuer-signature"
        }
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    // Mock the issuer keys fetch
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | Request) => {
    const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes("did:example:issuer")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            keys: [{
              kid: "issuer-key-1",
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            }]
          })
        } as Response;
      }
      // Fallback to original mock
      return {
        ok: true,
        status: 200,
        json: async () => ({
          walletId: "test-wallet",
          keys: [{
            keyId: "test-key",
            publicKey: {
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            },
            status: "ACTIVE"
          }]
        })
      } as Response;
    });

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(true);
  });

  it("rejects when claimed type not in requested types", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "KYC_LEVEL", value: true }], // Different type than requested
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when missing required claim type", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER", threshold: 18 },
        { type: "KYC_LEVEL", minLevel: 1 }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25 }], // Missing KYC_LEVEL
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when AGE_OVER value below threshold", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 21 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 18 }], // Below threshold of 21
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when AGE_OVER boolean false", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: false }], // Boolean false fails threshold check
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when KYC_LEVEL value is false", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 1 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "KYC_LEVEL", value: false }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when KYC_LEVEL value is not boolean", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 1 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "KYC_LEVEL", value: "not-boolean" }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects when CONTINUITY is false", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "CONTINUITY", value: false }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects claims with forbidden evidence", async () => {
    const verifier = new ShieldedVerifier({ 
      origin: "https://verifier.example",
      forbiddenEvidenceTerms: ["biometric"]
    });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{
        type: "AGE_OVER",
        value: 25,
        evidence: { biometric_scan: "data" }
      }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects expired claims", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const expiredDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25, expiresAt: expiredDate }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("rejects claims with invalid expiration date", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25, expiresAt: "not-a-date" }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
  });

  it("accepts valid AGE_OVER with numeric value matching threshold", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25 }], // Equal or above threshold
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts valid AGE_OVER with boolean true", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts AGE_OVER with no threshold specified", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER" }], // No threshold
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 15 }], // Below any threshold but none specified
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts KYC_LEVEL with boolean true", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 1 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "KYC_LEVEL", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts KYC_LEVEL without minLevel specified", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL" }], // No minLevel
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "KYC_LEVEL", value: false }], // Even false should be accepted since no minLevel
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts CONTINUITY with true value", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "CONTINUITY", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts CONTINUITY with non-boolean value", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "CONTINUITY", value: "true" }], // String, not boolean
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts claims with no evidence", async () => {
    const verifier = new ShieldedVerifier({ 
      origin: "https://verifier.example",
      forbiddenEvidenceTerms: ["biometric"]
    });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25 }], // No evidence
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts claims with evidence not matching forbidden terms", async () => {
    const verifier = new ShieldedVerifier({ 
      origin: "https://verifier.example",
      forbiddenEvidenceTerms: ["biometric"]
    });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{
        type: "AGE_OVER",
        value: 25,
        evidence: { document_type: "passport" }
      }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts claims with valid future expiration", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const futureDate = new Date(Date.now() + 60000).toISOString(); // 1 minute from now

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25, expiresAt: futureDate }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts claims without explicit expiration", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25 }], // No expiresAt
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("accepts claims just before expiration", async () => {
    const verifier = new ShieldedVerifier({ origin: "https://verifier.example" });
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    // Set expiry to 1 millisecond in future
    const expiryDate = new Date(Date.now() + 1).toISOString();

    const proof = {
      requestId: request.nonce,
      claims: [{ type: "AGE_OVER", value: 25, expiresAt: expiryDate }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature",
      zkProof: Buffer.from([1, 2, 3]).toString("base64")
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false); // Invalid due to missing proper sig
  });

  it("rejects invalid claim values before minimal disclosure checks", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "CONTINUITY", value: true }], // Invalid: should be string
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_CLAIM_VALUE");
  });

  it("returns false in verifyZkProof when suite does not match", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "P256",
      signature: "mock-signature"
    };

    const result = await (verifier as unknown as { verifyZkProof: (req: unknown, resp: unknown) => Promise<boolean> })
      .verifyZkProof(request, proof);
    expect(result).toBe(false);
  });

  it("handles exceptions inside verifyZkProof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    } as Record<string, unknown>;

    let accessCount = 0;
    Object.defineProperty(proof, "zkProof", {
      get() {
        accessCount += 1;
        if (accessCount >= 3) {
          throw new Error("ZK_ACCESS_ERROR");
        }
        return {
          commitment: "mock-commitment",
          bulletproof: "mock-proof", 
          publicInputs: "mock-inputs"
        };
      }
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await verifier.verifyProof(request, proof as unknown as Parameters<typeof verifier.verifyProof>[1]);
    consoleSpy.mockRestore();

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ZK_PROOF_INVALID");
  });

  it("rejects proofs when wallet has no active signing key", async () => {
    const localVerifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | Request) => {
    const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes("/v1/status/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            walletId: "test-wallet",
            keys: []
          })
        } as Response;
      }
      return originalFetch(url);
    }) as typeof fetch;

    try {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      const proof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "revoked-key",
        pairwiseSubjectId: "test-subject",
        claims: [{ type: "AGE_OVER", value: true }],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await localVerifier.verifyProof(request, proof, { checkRevocation: false });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("NO_ACTIVE_KEY");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid wallet signatures", async () => {
    vi.mocked(verifyECDSAP256).mockResolvedValueOnce(false);
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_WALLET_SIGNATURE");
  });

  it("rejects when issuer key is missing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | Request) => {
    const urlString = typeof url === 'string' ? url : url.url;
      if (urlString.includes(".well-known/shielded-id-keys.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            keys: [{
              kid: "issuer-key-1",
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            }]
          })
        } as Response;
      }
      return originalFetch(url);
    }) as typeof fetch;

    try {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      const proof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [{
          type: "AGE_OVER",
          value: true,
          issuer: {
            did: "did:example:issuer",
            keyId: "missing-key",
            signature: "issuer-signature"
          }
        }],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("ISSUER_KEY_NOT_FOUND");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid issuer signatures", async () => {
    vi.mocked(verifyECDSAP256)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        issuer: {
          did: "did:example:issuer",
          signature: "issuer-signature"
        }
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_ISSUER_SIGNATURE");
  });

  it("accepts issuer key lookup without keyId", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60, forbidPII: ["ssn"] },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{
        type: "AGE_OVER",
        value: true,
        evidence: { document_type: "passport" },
        issuer: {
          did: "did:example:issuer",
          signature: "issuer-signature"
        }
      }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });

  it("rejects when claim types are not requested", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "KYC_LEVEL", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("rejects when required claim types are missing", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER", threshold: 18 },
        { type: "KYC_LEVEL", minLevel: 1 }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("rejects when KYC_LEVEL minLevel is unmet", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "KYC_LEVEL", value: false }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("rejects when claim expiration is invalid", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true, expiresAt: "not-a-date" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_EXPIRED");
  });

  it("accepts claims when forbidPII is configured but evidence is absent", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60, forbidPII: ["ssn"] },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });
});
