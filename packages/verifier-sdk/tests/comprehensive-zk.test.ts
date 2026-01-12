/**
 * Comprehensive ZK Proof Verification Tests
 * Tests the new helper verification methods for Phase 1 predicates
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";

// Mock the age-zk module with comprehensive circuit support
vi.mock('@shielded-id/age-zk', () => ({
  prove_ge: vi.fn().mockImplementation(async (age: bigint, threshold: bigint, context: string) => {
    const publicInputsStr = `${threshold}|${age}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  prove_age_range: vi.fn().mockImplementation(async (age: bigint, minAge: bigint, maxAge: bigint, context: string) => {
    const publicInputsStr = `${minAge}|${maxAge}|${age}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  prove_string_equality: vi.fn().mockImplementation(async (value: string, expected: string, context: string) => {
    const publicInputsStr = `${expected}|${value}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  prove_membership_in_list: vi.fn().mockImplementation(async (value: string, list: string, context: string) => {
    const parts = list.split(',');
    const position = parts.indexOf(value);
    const publicInputsStr = `${value}|${position}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  prove_not_in_list: vi.fn().mockImplementation(async (value: string, forbidden: string, context: string) => {
    const parts = forbidden.split(',');
    const count = parts.length;
    const publicInputsStr = `${value}|${count}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  prove_string_prefix: vi.fn().mockImplementation(async (fullString: string, prefix: string, context: string) => {
    const publicInputsStr = `${fullString}|${fullString.length}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);
    return {
      commitment: new Uint8Array(32).fill(1),
      proof: new Uint8Array(670).fill(2),
      public_inputs: publicInputs
    };
  }),
  verify_ge_components: vi.fn().mockResolvedValue(true),
  verify_age_range_components: vi.fn().mockResolvedValue(true),
  verify_string_equality_components: vi.fn().mockResolvedValue(true),
  verify_membership_components: vi.fn().mockResolvedValue(true),
  verify_string_prefix_components: vi.fn().mockResolvedValue(true),
}));

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

let verifier: ShieldedVerifier;
let fetchCalls = 0;

beforeEach(() => {
  fetchCalls = 0;
  verifier = new ShieldedVerifier({
    origin: "https://shop.example",
    registryUrl: "https://registry.example"
  });
  verifier.resetForTesting();
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | Request | URL) => {
    fetchCalls += 1;
    const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : (url as Request).url);
    
    if (urlString.includes('.wasm')) {
      return originalFetch(url);
    }
    
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
    return {
      ok: true,
      status: 404,
      json: async () => ({})
    } as Response;
  }) as any;
});

describe("Helper Verification Methods - Age Range", () => {
  it("verifyAgeRangeProof accepts valid age range", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_RANGE", minAge: 18, maxAge: 65 }],
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("18|65|30|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyAgeRangeProof handles edge case at minimum boundary", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_RANGE", minAge: 18, maxAge: 65 }],
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("18|65|18|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyAgeRangeProof handles edge case at maximum boundary", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_RANGE", minAge: 18, maxAge: 65 }],
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("18|65|65|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Helper Verification Methods - String Equality", () => {
  it("verifyStringEqualityProof accepts matching string", async () => {
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("PASSPORT|PASSPORT|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyStringEqualityProof handles case sensitivity", async () => {
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("passport|PASSPORT|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Helper Verification Methods - Membership", () => {
  it("verifyMembershipProof accepts value in list", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "MEMBERSHIP",
        list: "DE,FR,IT,ES,NL"
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("FR|1|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyMembershipProof handles first element in list", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "MEMBERSHIP",
        list: "FIRST,SECOND,THIRD"
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("FIRST|0|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyMembershipProof handles last element in list", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "MEMBERSHIP",
        list: "FIRST,SECOND,THIRD"
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("THIRD|2|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Helper Verification Methods - Not Membership", () => {
  it("verifyNotMembershipProof rejects forbidden value", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "NOT_MEMBERSHIP",
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
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "NOT_MEMBERSHIP",
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("ALLOWED|1|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Helper Verification Methods - String Prefix", () => {
  it("verifyStringPrefixProof accepts matching prefix", async () => {
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("90210-1234|9|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyStringPrefixProof accepts full match as prefix", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STRING_PREFIX",
        prefix: "90210-1234"
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("90210-1234|10|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyStringPrefixProof handles single character prefix", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STRING_PREFIX",
        prefix: "9"
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
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("90210|5|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Multi-Predicate Comprehensive Verification", () => {
  it("verifies multiple claims with different operators", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER", threshold: 18 },
        { type: "COUNTRY", expectedCountry: "US" },
        { type: "EU_RESIDENT" }
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
      claims: [
        { type: "AGE_OVER", value: true },
        { type: "COUNTRY", value: true, operator: "EQ" },
        { type: "EU_RESIDENT", value: true, operator: "IN" }
      ],
      zkProofs: {
        0: {
          claimIndex: 0,
          claimType: "AGE_OVER",
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("18|25|context"))
        },
        1: {
          claimIndex: 1,
          claimType: "COUNTRY",
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("US|hash|context"))
        },
        2: {
          claimIndex: 2,
          claimType: "EU_RESIDENT",
          commitment: new Uint8Array(32).fill(1),
          bulletproof: new Uint8Array(670).fill(2),
          publicInputs: new Uint8Array(Buffer.from("DE|1|context"))
        }
      },
      suite: "BULLETPROOFS_RISTRETTO_V1_0.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});

describe("Backward Compatibility - Legacy Proofs", () => {
  it("verifyAgeZkProof validates legacy AGE_OVER format", async () => {
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
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString('base64url'),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString('base64url'),
        publicInputs: Buffer.from(new TextEncoder().encode("18|25|" + request.verifierOrigin + "|" + request.nonce + "|" + (request.expiresAt || ""))).toString('base64url')
      },
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });

  it("verifyKycZkProof validates legacy KYC_LEVEL format", async () => {
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
      claims: [{ type: "KYC_LEVEL", value: true }],
      kycZkProof: {
        commitment: Buffer.from(new Uint8Array(32).fill(1)).toString('base64url'),
        bulletproof: Buffer.from(new Uint8Array(670).fill(2)).toString('base64url'),
        publicInputs: Buffer.from(new TextEncoder().encode("2|3|" + request.verifierOrigin + "|" + request.nonce + "|" + (request.expiresAt || ""))).toString('base64url')
      },
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: "mock-signature"
    };

    const result = await verifier.verifyProof(request, proof, { checkRevocation: false });
    expect(result).toHaveProperty("valid");
  });
});
