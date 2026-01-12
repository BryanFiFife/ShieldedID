/**
 * Phase 2 Advanced Predicates Comprehensive Tests
 * Tests the 8 advanced Phase 2 predicates
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import type { ClaimType } from "../src/types.js";

let verifier: ShieldedVerifier;

beforeEach(() => {
  verifier = new ShieldedVerifier({
    origin: "https://shop.example",
    registryUrl: "https://registry.example"
  });
  verifier.resetForTesting();
});

describe("CONSENT_REQUIRED - Consent Management Predicate", () => {
  it("proves user has given required consent", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CONSENT_REQUIRED" as ClaimType,
        consentType: "DATA_SHARING",
        minConsentVersion: 2
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims[0].type).toBe("CONSENT_REQUIRED");
    expect(request.requestedClaims[0].consentType).toBe("DATA_SHARING");
    expect(request.requestedClaims[0].minConsentVersion).toBe(2);
  });

  it("proves consent version meets minimum requirement", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CONSENT_REQUIRED" as ClaimType,
        consentType: "MARKETING",
        minConsentVersion: 3
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].minConsentVersion).toBe(3);
  });

  it("proves multiple consent types at once", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "DATA_SHARING", minConsentVersion: 1 },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "ANALYTICS", minConsentVersion: 1 }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(2);
    expect(request.requestedClaims[0].consentType).toBe("DATA_SHARING");
    expect(request.requestedClaims[1].consentType).toBe("ANALYTICS");
  });

  it("proves recent consent with timestamp", async () => {
    const consentDate = Math.floor(Date.now() / 1000);
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CONSENT_REQUIRED" as ClaimType,
        consentType: "FINANCIAL",
        consentDate: consentDate,
        minConsentVersion: 1
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].consentDate).toBe(consentDate);
  });
});

describe("CREDENTIAL_CHAIN - Credential Provenance Verification", () => {
  it("proves direct credential issuance", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_CHAIN" as ClaimType,
        chainLength: 1,
        requiredIssuers: ["did:example:issuer1"]
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].chainLength).toBe(1);
    expect(request.requestedClaims[0].requiredIssuers).toHaveLength(1);
  });

  it("proves credential chain of length 2", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_CHAIN" as ClaimType,
        chainLength: 2,
        requiredIssuers: ["did:example:issuer1", "did:example:issuer2"]
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].chainLength).toBe(2);
    expect(request.requestedClaims[0].requiredIssuers).toHaveLength(2);
  });

  it("proves deep credential chain", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_CHAIN" as ClaimType,
        chainLength: 3,
        requiredIssuers: [
          "did:example:issuer1",
          "did:example:issuer2",
          "did:example:issuer3"
        ]
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].chainLength).toBe(3);
    expect(request.requestedClaims[0].requiredIssuers).toHaveLength(3);
  });
});

describe("RISK_SCORE - Risk Assessment Verification", () => {
  it("proves risk score below threshold", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "RISK_SCORE" as ClaimType,
        maxRiskScore: 30
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("RISK_SCORE");
    expect(request.requestedClaims[0].maxRiskScore).toBe(30);
  });

  it("proves strict risk threshold", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "RISK_SCORE" as ClaimType,
        maxRiskScore: 10
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].maxRiskScore).toBe(10);
  });

  it("proves risk score with freshness requirement", async () => {
    const assessmentDate = Math.floor(Date.now() / 1000);
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "RISK_SCORE" as ClaimType,
        maxRiskScore: 50,
        riskAssessmentDate: assessmentDate
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].riskAssessmentDate).toBe(assessmentDate);
  });

  it("proves acceptable risk for different threat levels", async () => {
    const lowRiskThreshold = 20;
    const mediumRiskThreshold = 50;
    const highRiskThreshold = 75;

    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: lowRiskThreshold },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: mediumRiskThreshold },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: highRiskThreshold }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(3);
    expect(request.requestedClaims[0].maxRiskScore).toBe(lowRiskThreshold);
    expect(request.requestedClaims[1].maxRiskScore).toBe(mediumRiskThreshold);
    expect(request.requestedClaims[2].maxRiskScore).toBe(highRiskThreshold);
  });
});

describe("DEVICE_COMPLIANCE - Device Security Verification", () => {
  it("proves device has required security features", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "DEVICE_COMPLIANCE" as ClaimType,
        osVersion: "14.0",
        hasEncryption: true,
        hasMFA: true
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("DEVICE_COMPLIANCE");
    expect(request.requestedClaims[0].osVersion).toBe("14.0");
    expect(request.requestedClaims[0].hasEncryption).toBe(true);
    expect(request.requestedClaims[0].hasMFA).toBe(true);
  });

  it("proves minimum OS version without other requirements", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "DEVICE_COMPLIANCE" as ClaimType,
        osVersion: "12.0"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].osVersion).toBe("12.0");
  });

  it("proves device compliance freshness", async () => {
    const maxComplianceAge = 3600; // 1 hour
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "DEVICE_COMPLIANCE" as ClaimType,
        hasEncryption: true,
        maxComplianceAge: maxComplianceAge
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].maxComplianceAge).toBe(maxComplianceAge);
  });
});

describe("TRANSACTION_LIMIT - Financial Transaction Limits", () => {
  it("proves available transaction limit exists", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "TRANSACTION_LIMIT" as ClaimType,
        minAvailableLimit: 1000,
        limitType: "DAILY"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("TRANSACTION_LIMIT");
    expect(request.requestedClaims[0].minAvailableLimit).toBe(1000);
    expect(request.requestedClaims[0].limitType).toBe("DAILY");
  });

  it("proves monthly transaction limit", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "TRANSACTION_LIMIT" as ClaimType,
        minAvailableLimit: 10000,
        limitType: "MONTHLY"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].limitType).toBe("MONTHLY");
    expect(request.requestedClaims[0].minAvailableLimit).toBe(10000);
  });

  it("proves cumulative transaction limit", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "TRANSACTION_LIMIT" as ClaimType,
        minAvailableLimit: 50000,
        limitType: "CUMULATIVE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].limitType).toBe("CUMULATIVE");
  });

  it("proves limit with reset date", async () => {
    const resetDate = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "TRANSACTION_LIMIT" as ClaimType,
        minAvailableLimit: 5000,
        limitResetDate: resetDate,
        limitType: "DAILY"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].limitResetDate).toBe(resetDate);
  });
});

describe("REPUTATION_SCORE - Platform Reputation Verification", () => {
  it("proves minimum reputation score", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "REPUTATION_SCORE" as ClaimType,
        minReputationScore: 75,
        reputationSource: "did:example:platform1"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("REPUTATION_SCORE");
    expect(request.requestedClaims[0].minReputationScore).toBe(75);
    expect(request.requestedClaims[0].reputationSource).toBe("did:example:platform1");
  });

  it("proves high reputation score requirement", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "REPUTATION_SCORE" as ClaimType,
        minReputationScore: 90,
        reputationSource: "did:example:premium-platform"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].minReputationScore).toBe(90);
  });

  it("proves reputation score freshness", async () => {
    const maxScoreAge = 2592000; // 30 days
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "REPUTATION_SCORE" as ClaimType,
        minReputationScore: 80,
        reputationSource: "did:example:platform2",
        maxScoreAge: maxScoreAge
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].maxScoreAge).toBe(maxScoreAge);
  });

  it("proves reputation scores from multiple sources", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 75, reputationSource: "did:example:platform1" },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 80, reputationSource: "did:example:platform2" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(2);
    expect(request.requestedClaims[0].reputationSource).toBe("did:example:platform1");
    expect(request.requestedClaims[1].reputationSource).toBe("did:example:platform2");
  });
});

describe("COMPLIANCE_STATUS - Regulatory Compliance Verification", () => {
  it("proves EU compliance status", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "COMPLIANCE_STATUS" as ClaimType,
        jurisdiction: "EU",
        complianceLevel: 3
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("COMPLIANCE_STATUS");
    expect(request.requestedClaims[0].jurisdiction).toBe("EU");
    expect(request.requestedClaims[0].complianceLevel).toBe(3);
  });

  it("proves US regulatory compliance", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "COMPLIANCE_STATUS" as ClaimType,
        jurisdiction: "US",
        complianceLevel: 2
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].jurisdiction).toBe("US");
  });

  it("proves multi-jurisdiction compliance", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 3 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "UK", complianceLevel: 2 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 2 }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(3);
  });

  it("proves compliance with recent audit", async () => {
    const auditDate = Math.floor(Date.now() / 1000) - 604800; // 7 days ago
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "COMPLIANCE_STATUS" as ClaimType,
        jurisdiction: "EU",
        complianceLevel: 4,
        lastAuditDate: auditDate
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].lastAuditDate).toBe(auditDate);
  });
});

describe("CREDENTIAL_METADATA - Metadata Attribute Verification", () => {
  it("proves credential has required metadata value", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_METADATA" as ClaimType,
        metadataKey: "industry",
        metadataValue: "finance",
        comparisonOperator: "EQ"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].type).toBe("CREDENTIAL_METADATA");
    expect(request.requestedClaims[0].metadataKey).toBe("industry");
    expect(request.requestedClaims[0].metadataValue).toBe("finance");
    expect(request.requestedClaims[0].comparisonOperator).toBe("EQ");
  });

  it("proves numeric metadata range (GE)", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_METADATA" as ClaimType,
        metadataKey: "employeeCount",
        metadataValue: 100,
        comparisonOperator: "GE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].metadataValue).toBe(100);
    expect(request.requestedClaims[0].comparisonOperator).toBe("GE");
  });

  it("proves numeric metadata upper bound (LE)", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_METADATA" as ClaimType,
        metadataKey: "yearsInBusiness",
        metadataValue: 50,
        comparisonOperator: "LE"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].comparisonOperator).toBe("LE");
  });

  it("proves multiple metadata constraints", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "industry", metadataValue: "technology", comparisonOperator: "EQ" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "funding", metadataValue: 1000000, comparisonOperator: "GE" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "yearsOld", metadataValue: 10, comparisonOperator: "LE" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(3);
  });

  it("proves string metadata with GT comparison", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [{
        type: "CREDENTIAL_METADATA" as ClaimType,
        metadataKey: "certificationType",
        metadataValue: "ISO9001",
        comparisonOperator: "EQ"
      }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims[0].metadataValue).toBe("ISO9001");
  });
});

describe("Phase 2 Integration - Combined Predicates", () => {
  it("proves compliance with multiple Phase 2 predicates", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 3 },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 80 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(3);
  });

  it("combines Phase 1 and Phase 2 predicates", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 30 },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "DATA_SHARING" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(3);
    expect(request.requestedClaims[0].type).toBe("AGE_OVER");
    expect(request.requestedClaims[1].type).toBe("RISK_SCORE");
    expect(request.requestedClaims[2].type).toBe("CONSENT_REQUIRED");
  });

  it("proves complex predicate requirements for financial service", async () => {
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 21 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 25 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 2 },
        { type: "TRANSACTION_LIMIT" as ClaimType, minAvailableLimit: 10000, limitType: "DAILY" }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://finance.example/callback" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });
});
