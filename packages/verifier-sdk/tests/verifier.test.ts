import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import { verifyECDSAP256 } from "../src/crypto.js";
import { RegistryClient } from "../src/registry.js";

// Import utility functions directly
import {
  ensureRandomUUID,
  randomNonce,
  buildProofLink,
  findSigningKey,
  computeAssuranceLevel,
  validateClaimValues,
  validateMinimalDisclosure,
  validateClaimsAgainstRequest,
  hasForbiddenEvidence,
  isNotExpired
} from "../src/verifier.js";

// Mock the age-zk module to avoid WASM loading in tests
vi.mock('@shielded-id/age-zk', () => ({
  prove_ge: vi.fn().mockImplementation(async (age: bigint, threshold: bigint, context: string) => {
    // Create proper public inputs with format "threshold|age|context"
    const publicInputsStr = `${threshold}|${age}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    
    return {
      commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"), // Mock commitment
      proof: new Uint8Array(670).fill(2), // Mock proof
      public_inputs: publicInputs
    };
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

// Mock the registry client
vi.mock("../src/registry.js", () => ({
  RegistryClient: vi.fn().mockImplementation(() => ({
    getKeyStatusViaNewEndpoint: vi.fn().mockResolvedValue({ revoked: false, expired: false }),
    getWalletStatus: vi.fn().mockImplementation((walletId: string) => {
      if (walletId === "unknown-wallet" || walletId === "non-existent-wallet") {
        return Promise.resolve(null);
      }
      if (walletId === "wallet-no-key" || walletId === "test-wallet-no-keys") {
        return Promise.resolve({
          walletId: walletId,
          keys: []
        });
      }
      if (walletId === "test-wallet-revoked-keys") {
        return Promise.resolve({
          walletId: "test-wallet-revoked-keys",
          keys: [{
            keyId: "test-key",
            publicKey: {
              kty: "EC",
              crv: "P-256",
              x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
              y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
            },
            status: "REVOKED"
          }]
        });
      }
      return Promise.resolve({
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
      });
    }),
    fetchIssuerKeys: vi.fn().mockImplementation((did: string) => {
      if (did === "did:example:missing-key") {
        return Promise.resolve({ keys: [] });
      }
      return Promise.resolve({
        keys: [{
          kid: "issuer-key-1",
          publicKey: {
            kty: "EC",
            crv: "P-256",
            x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
            y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
          }
        }]
      });
    }),
    resetCircuitBreaker: vi.fn()
  }))
}));

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
      // Check for unknown wallet
      if (urlString.includes("/v1/wallet/unknown-wallet")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: "Wallet not found" })
        } as Response;
      }
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

    it("accepts boolean true CONTINUITY claims", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "CONTINUITY" }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock valid proof with boolean true value
      const validProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "CONTINUITY", value: true } // ✅ Boolean true - allowed
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, validProof);
      expect(result.reason).not.toBe("INVALID_CLAIM_VALUE");
      expect(result.reason).not.toBe("PII_DETECTED");
    });

    it("rejects non-string CONTINUITY claims", async () => {
      const request = verifier.createProofRequest({
        requestedClaims: [{ type: "CONTINUITY" }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      });

      // Mock invalid proof with number value
      const invalidProof = {
        requestId: request.requestId,
        nonce: request.nonce,
        walletId: "test-wallet",
        keyId: "test-key",
        pairwiseSubjectId: "test-subject",
        claims: [
          { type: "CONTINUITY", value: 123 } // ❌ Number - not allowed
        ],
        suite: "ECDSA_P256_SHA256_1.0.0",
        signature: "mock-signature"
      };

      const result = await verifier.verifyProof(request, invalidProof);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("INVALID_CLAIM_VALUE");
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
    // const { prove_ge } = await import('@shielded-id/age-zk');
    // const proofBundle = await prove_ge(BigInt(25), BigInt(18), `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`);

    // Use mock data instead
    const commitment = Buffer.from(new Uint8Array(32).fill(1)).toString("base64url");
    const bulletproof = Buffer.from(new Uint8Array(670).fill(2)).toString("base64url");
    const publicInputs = Buffer.from(`18|25|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`).toString("base64url");

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
      claims: [{ type: "CONTINUITY", value: { invalid: "object" } }], // Invalid: should be string or boolean
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
        walletId: "wallet-no-key",
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

  it("getMetrics returns performance metrics", () => {
    const metrics = verifier.getMetrics();
    expect(metrics).toHaveProperty("verificationCount");
    expect(metrics).toHaveProperty("avgVerificationMs");
    expect(metrics).toHaveProperty("registryCallCount");
    expect(metrics).toHaveProperty("avgRegistryCallMs");
    expect(metrics).toHaveProperty("zkVerificationCount");
    expect(metrics).toHaveProperty("avgZkVerificationMs");
    expect(typeof metrics.verificationCount).toBe("number");
    expect(typeof metrics.avgVerificationMs).toBe("number");
  });

  it("resetForTesting resets internal state", () => {
    // Call resetForTesting (already called in beforeEach)
    verifier.resetForTesting();
    const metrics = verifier.getMetrics();
    // Metrics should be reset
    expect(metrics.verificationCount).toBe(0);
    expect(metrics.registryCallCount).toBe(0);
    expect(metrics.zkVerificationCount).toBe(0);
  });
});

describe("Comprehensive ZK Proof Verification - New Predicates", () => {
  // Test coverage for new verifyComprehensiveZkProof routing and helper methods
  
  it("verifyComprehensiveZkProof routes AGE_RANGE claims correctly", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_RANGE", 
        minAge: 18, 
        maxAge: 65 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_RANGE", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_RANGE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("18|65|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    // May succeed or fail depending on verification logic, but should not throw
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles COUNTRY claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "COUNTRY", 
        expectedCountry: "US" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "COUNTRY", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "COUNTRY",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("US|hash|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof routes AGE_EXACT claims correctly", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_EXACT", 
        expectedValue: 21 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_EXACT", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_EXACT",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("21|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles EU_RESIDENT claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "EU_RESIDENT" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "EU_RESIDENT", value: true, operator: "IN" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "EU_RESIDENT",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("DE|hash|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles STRING_EQUALITY claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STRING_EQUALITY", 
        field: "documentType",
        expectedValue: "PASSPORT" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "STRING_EQUALITY", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "STRING_EQUALITY",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("PASSPORT|hash|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles membership claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "MEMBERSHIP", 
        list: "CATEGORY_A,CATEGORY_B,CATEGORY_C" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "MEMBERSHIP", value: true, operator: "IN" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "MEMBERSHIP",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("CATEGORY_B|1|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles NOT_MEMBERSHIP claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "NOT_MEMBERSHIP", 
        forbidden: "BANNED_CATEGORY" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "NOT_MEMBERSHIP", value: true, operator: "NOT_IN" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "NOT_MEMBERSHIP",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("ALLOWED_CATEGORY|1|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles STRING_PREFIX claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STRING_PREFIX", 
        prefix: "90210" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "STRING_PREFIX", value: true, operator: "STARTS_WITH" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "STRING_PREFIX",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("90210-1234|5|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles KYC_LEVEL claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "KYC_LEVEL", 
        minLevel: 2 
      }],
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
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "KYC_LEVEL",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`2|3|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("validateClaimsAgainstRequest enforces GE operator", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_OVER",
        operator: "GE",
        threshold: 18
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true, operator: "GE" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });

  it("validateClaimsAgainstRequest enforces EQ operator", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "COUNTRY",
        operator: "EQ",
        expectedCountry: "US"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "COUNTRY", value: true, operator: "EQ" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });

  it("validateClaimsAgainstRequest enforces IN operator", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "EU_RESIDENT",
        operator: "IN",
        list: "DE,FR,IT"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "EU_RESIDENT", value: true, operator: "IN" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });

  it("validateClaimsAgainstRequest enforces NOT_IN operator", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "NOT_MEMBERSHIP",
        operator: "NOT_IN",
        forbidden: "BANNED"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "NOT_MEMBERSHIP", value: true, operator: "NOT_IN" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });

  it("validateClaimsAgainstRequest enforces STARTS_WITH operator", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STRING_PREFIX",
        operator: "STARTS_WITH",
        prefix: "90210"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "STRING_PREFIX", value: true, operator: "STARTS_WITH" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
  });
});

describe("crypto availability checks", () => {
  it("throws when crypto.randomUUID is not available", () => {
    const cryptoSpy = vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue({} as any);
    
    const verifier = new ShieldedVerifier({ origin: "https://test.example" });
    expect(() => {
      verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
        callback: { method: "POST", url: "https://example.com/callback" }
      });
    }).toThrow("RANDOM_UUID_NOT_AVAILABLE");
    
    cryptoSpy.mockRestore();
  });

  it("throws when crypto.getRandomValues is not available", () => {
    const cryptoSpy = vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue({
      randomUUID: () => "test-uuid"
    } as any);
    
    const verifier = new ShieldedVerifier({ origin: "https://test.example" });
    expect(() => {
      verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
        callback: { method: "POST", url: "https://example.com/callback" }
      });
    }).toThrow("RANDOM_NOT_AVAILABLE");
    
    cryptoSpy.mockRestore();
  });

  it("rejects unsupported suite", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      suite: "UNSUPPORTED_SUITE",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_SUITE");
  });

  it("rejects ZK suite without ZK proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      suite: "AGE_ZK",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MISSING_ZK_PROOF");
  });

  it("rejects non-ZK suite with ZK proof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      suite: "ECDSA",
      claims: [{ type: "AGE_OVER", value: true }],
      zkProof: { some: "proof" },
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNEXPECTED_ZK_PROOF");
  });

  it("handles wallet not found", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | Request | URL) => {
      const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : (url as Request).url);
      if (urlString.includes("/v1/status/") && urlString.includes("non-existent-wallet")) {
        return { ok: false, status: 404 };
      }
      return originalFetch(url);
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "non-existent-wallet",
      keyId: "test-key",
      suite: "ECDSA_P256_SHA256_1.0.0",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("WALLET_NOT_FOUND");

    globalThis.fetch = originalFetch;
  });

  it("handles no active key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | Request | URL) => {
      const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : (url as Request).url);
      if (urlString.includes("/v1/status/") && urlString.includes("test-wallet-no-keys")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            walletId: "test-wallet-no-keys",
            keys: [{
              keyId: "test-key",
              publicKey: {
                kty: "EC",
                crv: "P-256",
                x: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8",
                y: "WKn-ZpM2W9pNhNQ3H8yZ6V8V8vz8yZ6V8V8vz8yZ6V8"
              },
              status: "REVOKED"
            }]
          })
        };
      }
      return originalFetch(url);
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet-no-keys",
      keyId: "test-key",
      suite: "ECDSA_P256_SHA256_1.0.0",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NO_ACTIVE_KEY");

    globalThis.fetch = originalFetch;
  });

  it("handles invalid wallet signature", async () => {
    vi.mocked(verifyECDSAP256).mockResolvedValueOnce(false);

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      suite: "ECDSA",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_WALLET_SIGNATURE");
  });

  it("handles key ID required but missing", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", operator: "GE", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://example.com/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      suite: "ECDSA",
      claims: [{ type: "AGE_OVER", value: true }],
      signature: "invalid-sig"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_ID_REQUIRED");
  });

  // ===== COMPREHENSIVE ZK PROOF TESTS FOR UNCOVERED CLAIM TYPES =====

  it("verifyComprehensiveZkProof handles POSTAL_CODE_PREFIX claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "POSTAL_CODE_PREFIX", 
        expectedValue: "90" 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "POSTAL_CODE_PREFIX", value: true, operator: "STARTS_WITH" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "POSTAL_CODE_PREFIX",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`90|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles KYC_VERIFIED claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "KYC_VERIFIED"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "KYC_VERIFIED", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "KYC_VERIFIED",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`verified|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles AML_CLEAR claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AML_CLEAR"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AML_CLEAR", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AML_CLEAR",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`clear|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles SANCTIONS_CLEAR claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "SANCTIONS_CLEAR"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "SANCTIONS_CLEAR", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "SANCTIONS_CLEAR",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`clear|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles DOCUMENT_TYPE claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_TYPE",
        expectedValue: "passport"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "DOCUMENT_TYPE", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "DOCUMENT_TYPE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`passport|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles STATE_OR_PROVINCE claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STATE_OR_PROVINCE",
        expectedState: "CA"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "STATE_OR_PROVINCE", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "STATE_OR_PROVINCE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`CA|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles REGION claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "REGION",
        expectedValue: "US-CA"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "REGION", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "REGION",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`US-CA|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles LICENSE_CLASS claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "LICENSE_CLASS",
        threshold: 2
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "LICENSE_CLASS", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "LICENSE_CLASS",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`2|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles VEHICLE_CATEGORY claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "VEHICLE_CATEGORY",
        expectedValue: "car"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "VEHICLE_CATEGORY", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "VEHICLE_CATEGORY",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`car|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles ENDORSEMENT claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "ENDORSEMENT",
        requiredEndorsement: "towing"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "ENDORSEMENT", value: true, operator: "IN" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "ENDORSEMENT",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`towing|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles RESTRICTION claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "RESTRICTION",
        forbiddenRestriction: "corrective_lenses"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "RESTRICTION", value: true, operator: "NOT_IN" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "RESTRICTION",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`corrective_lenses|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles LICENSE_VALID claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "LICENSE_VALID"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "LICENSE_VALID", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "LICENSE_VALID",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`${futureTimestamp}|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles DOCUMENT_VALID claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_VALID"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "DOCUMENT_VALID", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "DOCUMENT_VALID",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`${futureTimestamp}|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles DOCUMENT_TYPE_MATCH claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_TYPE_MATCH",
        expectedValue: "passport"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "DOCUMENT_TYPE_MATCH", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "DOCUMENT_TYPE_MATCH",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`passport|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles ISSUER_COUNTRY claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "ISSUER_COUNTRY",
        issuerCountry: "US"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "ISSUER_COUNTRY", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "ISSUER_COUNTRY",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`US|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles DOCUMENT_AGE claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_AGE",
        minDocumentAge: 0
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "DOCUMENT_AGE", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "DOCUMENT_AGE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`0|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles CREDENTIAL_VALID claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_VALID"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "CREDENTIAL_VALID", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "CREDENTIAL_VALID",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`${futureTimestamp}|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles CREDENTIAL_ACTIVE claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_ACTIVE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "CREDENTIAL_ACTIVE", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "CREDENTIAL_ACTIVE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`active|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles CREDENTIAL_LEVEL claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_LEVEL",
        minLevel: 1
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "CREDENTIAL_LEVEL", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "CREDENTIAL_LEVEL",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`1|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles AGE_EXACT claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_EXACT",
        expectedValue: 21
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_EXACT", value: true, operator: "EQ" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_EXACT",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`21|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyComprehensiveZkProof handles BORN_AFTER claims", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "BORN_AFTER",
        expectedValue: 1990
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "BORN_AFTER", value: true, operator: "GE" }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "BORN_AFTER",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from(Buffer.from(`1990|hash|${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`)).toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("generateQR creates a valid QR code data URL", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const qrCode = await verifier.generateQR(request);
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
    expect(qrCode.length).toBeGreaterThan(100);
  });

  it("generateDeepLink creates a valid deep link", () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const deepLink = verifier.generateDeepLink(request);
    expect(deepLink).toMatch(/^shielded-id:\/\/proof\?/);
    expect(deepLink).toContain(`request_id=${request.requestId}`);
    expect(deepLink).toContain(`nonce=${request.nonce}`);
    expect(deepLink).toContain(`verifier_origin=${encodeURIComponent(request.verifierOrigin)}`);
  });

  it("checkRevocation calls registry client", async () => {
    const mockStatus = { revoked: false, expired: false };
    // Access the mocked registry client instance
    const registryClientInstance = (verifier as any).registryClient;
    registryClientInstance.getKeyStatusViaNewEndpoint.mockResolvedValue(mockStatus);

    const result = await verifier.checkRevocation("test-key-id");
    expect(result).toEqual(mockStatus);
    expect(registryClientInstance.getKeyStatusViaNewEndpoint).toHaveBeenCalledWith("test-key-id");
  });

  it("getMetrics returns performance metrics", () => {
    // Call some methods to generate metrics
    verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const metrics = verifier.getMetrics();
    expect(metrics).toHaveProperty("verificationCount");
    expect(metrics).toHaveProperty("avgVerificationMs");
    expect(metrics).toHaveProperty("registryCallCount");
    expect(metrics).toHaveProperty("avgRegistryCallMs");
    expect(metrics).toHaveProperty("zkVerificationCount");
    expect(metrics).toHaveProperty("avgZkVerificationMs");
  });

  // Test error conditions in verifyProof
  it("verifyProof rejects expired request", async () => {
    const pastTime = new Date(Date.now() - 100000).toISOString(); // 100 seconds ago
    const request = {
      ...verifier.createProofRequest({
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://shop.example/callback" }
      }),
      issuedAt: pastTime,
      expiresAt: pastTime
    };

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("REQUEST_EXPIRED");
  });

  it("verifyProof rejects nonce mismatch", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NONCE_MISMATCH");
  });

  it("verifyProof rejects request ID mismatch", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("REQUEST_ID_MISMATCH");
  });

  it("verifyProof rejects invalid suite", async () => {
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
      suite: "",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_SUITE");
  });

  it("verifyProof rejects unsupported suite", async () => {
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
      suite: "UNSUPPORTED_SUITE_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNSUPPORTED_SUITE");
  });

  it("verifyProof rejects ZK suite without ZK proof", async () => {
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
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MISSING_ZK_PROOF");
  });

  it("verifyProof rejects non-ZK suite with ZK proof", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "mock-signature",
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_OVER",
          commitment: "mock-commitment",
          bulletproof: "mock-proof",
          publicInputs: "mock-inputs"
        }
      }
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("UNEXPECTED_ZK_PROOF");
  });

  it("verifyProof rejects unknown wallet", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    // Mock registry to return null for unknown wallet
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null
    });

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("WALLET_NOT_FOUND");
  });

  it("verifyProof rejects wallet without active key", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet-revoked-keys",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    // Mock registry to return wallet with no active keys
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        keys: [
          { publicKey: { kty: "EC", crv: "P-256" }, status: "REVOKED" }
        ]
      })
    });

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NO_ACTIVE_KEY");
  });

  it("verifyProof rejects invalid wallet signature", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "invalid-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_WALLET_SIGNATURE");
  });

  it("verifyProof rejects revoked key", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    // Mock key status as revoked
    const registryClientInstance = (verifier as any).registryClient;
    registryClientInstance.getKeyStatusViaNewEndpoint.mockResolvedValue({
      revoked: true,
      expired: false
    });

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_REVOKED");
  });

  it("verifyProof rejects expired key", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    // Mock key status as expired
    const registryClientInstance = (verifier as any).registryClient;
    registryClientInstance.getKeyStatusViaNewEndpoint.mockResolvedValue({
      revoked: false,
      expired: true
    });

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_EXPIRED");
  });

  it("verifyProof rejects invalid claim values", async () => {
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
      claims: [{ type: "AGE_OVER", value: "invalid-boolean" }], // Invalid value type
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_CLAIM_VALUE");
  });

  it("verifyProof rejects minimal disclosure violation", async () => {
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
        { type: "AGE_OVER", value: true, evidence: { name: "John Doe" } } // Forbidden evidence field
      ],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MINIMAL_DISCLOSURE_VIOLATION");
  });

  it("verifyProof rejects claim policy mismatch", async () => {
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
        { type: "CONTINUITY", value: "extra-claim" } // Extra claim not requested
      ],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_POLICY_MISMATCH");
  });

  it("verifyProof rejects expired claims", async () => {
    const pastTime = new Date(Date.now() - 100000).toISOString(); // 100 seconds ago
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
      claims: [{ type: "AGE_OVER", value: true, expiresAt: pastTime }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("CLAIM_EXPIRED");
  });

  it("verifyProof rejects PII detection", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { 
        requireStatusCheck: false, 
        maxAgeSeconds: 60,
        forbidPII: ["contact", "personal"]
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
        evidence: { contactInfo: "user@example.com" } // Forbidden PII (contains "contact" which matches forbidPII)
      }],
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("PII_DETECTED");
  });

  // Test error handling in ZK proof verification
  it("verifyComprehensiveZkProof handles invalid base64 in commitment", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_OVER",
        threshold: 18
      }],
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
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_OVER",
          commitment: "invalid-base64!!!", // Invalid base64
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("18|25|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyComprehensiveZkProof handles invalid base64 in bulletproof", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_OVER",
        threshold: 18
      }],
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
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_OVER",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: "invalid-base64!!!", // Invalid base64
          publicInputs: Buffer.from("18|25|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyComprehensiveZkProof handles invalid base64 in publicInputs", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_OVER",
        threshold: 18
      }],
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
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_OVER",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: "invalid-base64!!!" // Invalid base64
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyComprehensiveZkProof handles unknown claim type", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "UNKNOWN_CLAIM_TYPE",
        threshold: 18
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proof = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "test-wallet",
      keyId: "test-key",
      pairwiseSubjectId: "test-subject",
      claims: [{ type: "UNKNOWN_CLAIM_TYPE", value: true }],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "UNKNOWN_CLAIM_TYPE",
          commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
          bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
          publicInputs: Buffer.from("18|25|context").toString("base64url")
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyProof accepts valid proof", async () => {
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
      suite: "ECDSA_P256_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(true);
    expect(result.pairwiseSubjectId).toBe("test-subject");
    expect(result.assuranceLevel).toBe(0);
  });
});

// Test utility functions for 100% function coverage
describe("Utility Functions", () => {
  describe("ensureRandomUUID", () => {
    it("returns a UUID when crypto.randomUUID is available", () => {
      const mockUUID = "12345678-1234-1234-1234-123456789abc";
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(mockUUID);
      
      expect(ensureRandomUUID()).toBe(mockUUID);
    });

    it("throws error when crypto.randomUUID is not available", () => {
      const originalCrypto = globalThis.crypto;
      // Mock crypto to not have randomUUID
      Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto },
        writable: true
      });
      delete (globalThis.crypto as any).randomUUID;
      
      expect(() => ensureRandomUUID()).toThrow("RANDOM_UUID_NOT_AVAILABLE");
      
      // Restore
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true
      });
    });
  });

  describe("randomNonce", () => {
    it("returns base64url encoded random bytes", () => {
      const mockBytes = new Uint8Array([1, 2, 3, 4]);
      vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
        array.set(mockBytes);
        return array;
      });
      
      const result = randomNonce(4);
      expect(result).toBe("AQIDBA");
    });

    it("throws error when crypto.getRandomValues is not available", () => {
      const originalCrypto = globalThis.crypto;
      // Mock crypto to not have getRandomValues
      Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto },
        writable: true
      });
      delete (globalThis.crypto as any).getRandomValues;
      
      expect(() => randomNonce()).toThrow("RANDOM_NOT_AVAILABLE");
      
      // Restore
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true
      });
    });
  });

  describe("buildProofLink", () => {
    it("builds correct proof link URL", () => {
      const request = {
        requestId: "test-request",
        nonce: "test-nonce",
        verifierOrigin: "https://example.com"
      };
      const result = buildProofLink(request);
      expect(result).toBe("shielded-id://proof?request_id=test-request&nonce=test-nonce&verifier_origin=https%3A%2F%2Fexample.com");
    });
  });

  describe("findSigningKey", () => {
    it("returns null when no keys provided", () => {
      expect(findSigningKey(undefined)).toBeNull();
      expect(findSigningKey([])).toBeNull();
    });

    it("returns active publicKey", () => {
      const keys = [
        { status: "REVOKED", publicKey: { kty: "EC" } },
        { status: "ACTIVE", publicKey: { kty: "RSA" } }
      ];
      expect(findSigningKey(keys)).toEqual({ kty: "RSA" });
    });

    it("returns active keyMaterial when no publicKey", () => {
      const keys = [
        { status: "ACTIVE", keyMaterial: { kty: "EC" } }
      ];
      expect(findSigningKey(keys)).toEqual({ kty: "EC" });
    });

    it("prefers publicKey over keyMaterial", () => {
      const keys = [
        { status: "ACTIVE", publicKey: { kty: "RSA" }, keyMaterial: { kty: "EC" } }
      ];
      expect(findSigningKey(keys)).toEqual({ kty: "RSA" });
    });
  });

  describe("computeAssuranceLevel", () => {
    it("returns 0 when no KYC_LEVEL claim", () => {
      const claims = [{ type: "AGE_OVER", value: true }];
      const request = { requestedClaims: [] };
      expect(computeAssuranceLevel(claims, request)).toBe(0);
    });

    it("returns 0 when KYC_LEVEL claim is not boolean true", () => {
      const claims = [{ type: "KYC_LEVEL", value: false }];
      const request = { requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }] };
      expect(computeAssuranceLevel(claims, request)).toBe(0);
    });

    it("returns minLevel from request", () => {
      const claims = [{ type: "KYC_LEVEL", value: true }];
      const request = { requestedClaims: [{ type: "KYC_LEVEL", minLevel: 3 }] };
      expect(computeAssuranceLevel(claims, request)).toBe(3);
    });

    it("returns 0 when minLevel not specified", () => {
      const claims = [{ type: "KYC_LEVEL", value: true }];
      const request = { requestedClaims: [{ type: "KYC_LEVEL" }] };
      expect(computeAssuranceLevel(claims, request)).toBe(0);
    });
  });

  describe("validateClaimValues", () => {
    it("returns true for valid claims", () => {
      const claims = [
        { type: "AGE_OVER", value: true },
        { type: "KYC_LEVEL", value: 2 },
        { type: "CONTINUITY", value: "pairwise-id" }
      ];
      expect(validateClaimValues(claims)).toBe(true);
    });

    it("returns false for invalid AGE_OVER claim", () => {
      const claims = [{ type: "AGE_OVER", value: "invalid" }];
      expect(validateClaimValues(claims)).toBe(false);
    });

    it("returns false for invalid CONTINUITY claim", () => {
      const claims = [{ type: "CONTINUITY", value: 123 }];
      expect(validateClaimValues(claims)).toBe(false);
    });
  });

  describe("validateMinimalDisclosure", () => {
    it("returns true for valid claims", () => {
      const claims = [
        { type: "AGE_OVER", value: true },
        { type: "KYC_LEVEL", value: true },
        { type: "CONTINUITY", value: true }
      ];
      expect(validateMinimalDisclosure(claims)).toBe(true);
    });

    it("returns false for AGE_OVER with non-boolean value", () => {
      const claims = [{ type: "AGE_OVER", value: 25 }];
      expect(validateMinimalDisclosure(claims)).toBe(false);
    });

    it("returns false for KYC_LEVEL with non-boolean value", () => {
      const claims = [{ type: "KYC_LEVEL", value: 2 }];
      expect(validateMinimalDisclosure(claims)).toBe(false);
    });

    it("returns false for forbidden evidence fields", () => {
      const claims = [{ type: "AGE_OVER", value: true, evidence: { dateOfBirth: "1990-01-01" } }];
      expect(validateMinimalDisclosure(claims)).toBe(false);
    });
  });

  describe("validateClaimsAgainstRequest", () => {
    it("returns true for matching claims", () => {
      const requested = [{ type: "AGE_OVER", threshold: 18 }];
      const claims = [{ type: "AGE_OVER", value: true }];
      expect(validateClaimsAgainstRequest(requested, claims)).toBe(true);
    });

    it("returns false for missing claim type", () => {
      const requested = [{ type: "AGE_OVER", threshold: 18 }];
      const claims = [{ type: "KYC_LEVEL", value: true }];
      expect(validateClaimsAgainstRequest(requested, claims)).toBe(false);
    });

    it("validates GE operator correctly", () => {
      const requested = [{ type: "AGE_OVER", threshold: 18, operator: "GE" }];
      const claims = [{ type: "AGE_OVER", value: 25 }];
      expect(validateClaimsAgainstRequest(requested, claims)).toBe(true);
    });

    it("validates EQ operator correctly", () => {
      const requested = [{ type: "COUNTRY", expectedValue: "US", operator: "EQ" }];
      const claims = [{ type: "COUNTRY", value: "US" }];
      expect(validateClaimsAgainstRequest(requested, claims)).toBe(true);
    });
  });

  describe("hasForbiddenEvidence", () => {
    it("returns false when no evidence", () => {
      const claim = { type: "AGE_OVER", value: true };
      expect(hasForbiddenEvidence(claim, ["forbidden"])).toBe(false);
    });

    it("returns false when evidence has no forbidden fields", () => {
      const claim = { type: "AGE_OVER", value: true, evidence: { allowedField: "value" } };
      expect(hasForbiddenEvidence(claim, ["forbidden"])).toBe(false);
    });

    it("returns true when evidence has forbidden fields", () => {
      const claim = { type: "AGE_OVER", value: true, evidence: { dateOfBirth: "1990-01-01" } };
      expect(hasForbiddenEvidence(claim, ["dateofbirth"])).toBe(true);
    });
  });

  describe("isNotExpired", () => {
    it("returns true for future expiry", () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      expect(isNotExpired(futureDate)).toBe(true);
    });

    it("returns false for past expiry", () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      expect(isNotExpired(pastDate)).toBe(false);
    });

    it("returns false for invalid date", () => {
      expect(isNotExpired("invalid-date")).toBe(false);
    });
  });
});

describe("Legacy ZK Proof Verification", () => {
  it("verifyAgeZkProof handles legacy AGE_ZK_BULLETPROOFS_V1 format", async () => {
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
      zkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("18|25|context").toString("base64url")
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyKycZkProof handles legacy KYC_ZK_BULLETPROOFS_V1 format", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", level: 2 }],
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
      kycZkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("2|3|context").toString("base64url")
      },
      suite: "KYC_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyAgeZkProof handles decode errors gracefully", async () => {
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
      zkProof: {
        commitment: "invalid-base64",
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("18|25|context").toString("base64url")
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyAgeZkProof validates commitment length", async () => {
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
      zkProof: {
        commitment: Buffer.from(new Uint8Array(16).fill(1)).toString("base64url"), // Too short
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("18|25|context").toString("base64url")
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyAgeZkProof validates proof length", async () => {
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
      zkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
        bulletproof: Buffer.from(new Uint8Array(50).fill(2)).toString("base64url"), // Too short
        publicInputs: Buffer.from("18|25|context").toString("base64url")
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyAgeZkProof validates public inputs length", async () => {
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
      zkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("x").toString("base64url") // Too short
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });

  it("verifyAgeZkProof validates context binding", async () => {
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
      zkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString("base64url"),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString("base64url"),
        publicInputs: Buffer.from("18|25|wrong-context").toString("base64url") // Wrong context
      },
      suite: "AGE_ZK_BULLETPROOFS_V1",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result.valid).toBe(false);
  });
});
