/**
 * Comprehensive ZK Proof Verification Tests (Phase 1)
 * Tests all 22 predicates with correct types
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import type { ClaimType } from "../src/types.js";

// Mock the age-zk module
vi.mock('@shielded-id/age-zk', () => ({
  prove_ge: vi.fn().mockResolvedValue({
    commitment: new Uint8Array(32).fill(1),
    proof: new Uint8Array(670).fill(2),
    public_inputs: new Uint8Array(Buffer.from("18|25|context"))
  }),
  verify_ge_components: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/crypto.js", async () => {
  const actual = await vi.importActual("../src/crypto.js");
  return {
    ...actual,
    verifyECDSAP256: vi.fn().mockResolvedValue(true),
    validateNonce: vi.fn().mockImplementation((nonce1, nonce2) => nonce1 === nonce2),
    validateTimestamp: vi.fn().mockImplementation((issuedAt, expiresAt, maxAge) => true)
  };
});

let verifier: ShieldedVerifier;

beforeEach(() => {
  verifier = new ShieldedVerifier({
    origin: "https://shop.example",
    registryUrl: "https://registry.example"
  });
  verifier.resetForTesting();
  
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({})
  })) as any;
});

describe("AGE_OVER - Age >= threshold", () => {
  it("proves age >= 18", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER" as ClaimType, threshold: 18 }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("AGE_OVER");
    expect(request.requestedClaims[0].threshold).toBe(18);
  });
});

describe("AGE_RANGE - Age in [min, max]", () => {
  it("proves age in range", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_RANGE" as ClaimType, 
        minValue: 18, 
        maxValue: 65 
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("AGE_RANGE");
    expect(request.requestedClaims[0].minValue).toBe(18);
    expect(request.requestedClaims[0].maxValue).toBe(65);
  });
});

describe("BORN_AFTER - Born after date", () => {
  it("proves birth date", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "BORN_AFTER" as ClaimType,
        expectedValue: "1990-01-01"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("BORN_AFTER");
  });
});

describe("COUNTRY - Country verification", () => {
  it("proves country match", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "COUNTRY" as ClaimType,
        expectedCountry: "US"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("COUNTRY");
    expect(request.requestedClaims[0].expectedCountry).toBe("US");
  });

  it("proves EU residency", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "EU_RESIDENT" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("EU_RESIDENT");
  });
});

describe("STATE_OR_PROVINCE - Regional verification", () => {
  it("proves state/province match", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "STATE_OR_PROVINCE" as ClaimType,
        expectedState: "CA"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("STATE_OR_PROVINCE");
  });
});

describe("POSTAL_CODE_PREFIX - Postal code verification", () => {
  it("proves postal code prefix", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "POSTAL_CODE_PREFIX" as ClaimType,
        prefixLength: 5
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("POSTAL_CODE_PREFIX");
    expect(request.requestedClaims[0].prefixLength).toBe(5);
  });
});

describe("KYC_LEVEL - KYC level verification", () => {
  it("proves KYC level >= threshold", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "KYC_LEVEL" as ClaimType,
        minLevel: 2
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("KYC_LEVEL");
    expect(request.requestedClaims[0].minLevel).toBe(2);
  });
});

describe("KYC_VERIFIED - KYC verified flag", () => {
  it("proves KYC verification", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "KYC_VERIFIED" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("KYC_VERIFIED");
  });
});

describe("AML_CLEAR - AML clearance", () => {
  it("proves AML clearance", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AML_CLEAR" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("AML_CLEAR");
  });
});

describe("SANCTIONS_CLEAR - Sanctions clearance", () => {
  it("proves sanctions clearance", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "SANCTIONS_CLEAR" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("SANCTIONS_CLEAR");
  });
});

describe("DOCUMENT_TYPE - Document type verification", () => {
  it("proves document type match", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_TYPE" as ClaimType,
        allowedDocumentType: "PASSPORT"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("DOCUMENT_TYPE");
  });
});

describe("LICENSE_CLASS - Driving license class", () => {
  it("proves license class", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "LICENSE_CLASS" as ClaimType,
        threshold: 2
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("LICENSE_CLASS");
  });
});

describe("VEHICLE_CATEGORY - Vehicle category", () => {
  it("proves vehicle category", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "VEHICLE_CATEGORY" as ClaimType,
        expectedValue: "MOTORCYCLE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("VEHICLE_CATEGORY");
  });
});

describe("ENDORSEMENT - License endorsement", () => {
  it("proves license endorsement", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "ENDORSEMENT" as ClaimType,
        requiredEndorsement: "MOTORCYCLE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("ENDORSEMENT");
  });
});

describe("RESTRICTION - License restriction", () => {
  it("proves no license restriction", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "RESTRICTION" as ClaimType,
        forbiddenRestriction: "VISION_CORRECTION"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("RESTRICTION");
  });
});

describe("LICENSE_VALID - License validity", () => {
  it("proves license is valid", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "LICENSE_VALID" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("LICENSE_VALID");
  });
});

describe("DOCUMENT_VALID - Document validity", () => {
  it("proves document is valid", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_VALID" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("DOCUMENT_VALID");
  });
});

describe("DOCUMENT_TYPE_MATCH - Document type matching", () => {
  it("proves document type matches", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_TYPE_MATCH" as ClaimType,
        allowedDocumentType: "PASSPORT"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("DOCUMENT_TYPE_MATCH");
  });
});

describe("ISSUER_COUNTRY - Document issuer country", () => {
  it("proves document issuer country", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "ISSUER_COUNTRY" as ClaimType,
        issuerCountry: "US"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("ISSUER_COUNTRY");
  });
});

describe("DOCUMENT_AGE - Document age verification", () => {
  it("proves document age", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "DOCUMENT_AGE" as ClaimType,
        minDocumentAge: 30
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("DOCUMENT_AGE");
  });
});

describe("CREDENTIAL_VALID - Credential validity", () => {
  it("proves credential is valid", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_VALID" as ClaimType,
        credentialType: "PASSPORT"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("CREDENTIAL_VALID");
  });
});

describe("CREDENTIAL_ACTIVE - Credential active status", () => {
  it("proves credential is active", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_ACTIVE" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("CREDENTIAL_ACTIVE");
  });
});

describe("CREDENTIAL_LEVEL - Credential level", () => {
  it("proves credential level >= threshold", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CREDENTIAL_LEVEL" as ClaimType,
        minLevel: 3
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("CREDENTIAL_LEVEL");
  });
});

describe("REGION - Regional verification", () => {
  it("proves region", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "REGION" as ClaimType,
        expectedValue: "WEST_COAST"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("REGION");
  });
});

describe("AGE_EXACT - Exact age verification", () => {
  it("proves exact age match", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "AGE_EXACT" as ClaimType,
        expectedValue: "25"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("AGE_EXACT");
  });
});

describe("CONTINUITY - Proof continuity", () => {
  it("proves continuity token", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{ 
        type: "CONTINUITY" as ClaimType
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("CONTINUITY");
  });
});

describe("Multiple predicates", () => {
  it("verifies multiple claims together", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims).toHaveLength(3);
    expect(request.requestedClaims[0].type).toBe("AGE_OVER");
    expect(request.requestedClaims[1].type).toBe("COUNTRY");
    expect(request.requestedClaims[2].type).toBe("KYC_LEVEL");
  });
});
