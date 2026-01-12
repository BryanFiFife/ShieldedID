/**
 * End-to-End (E2E) Route Testing
 * Tests complete flows with Phase 1 + Phase 2 predicates combined
 * Simulates real-world use cases for financial, compliance, and security services
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import type { ClaimType } from "../src/types.js";

let verifier: ShieldedVerifier;

beforeEach(() => {
  verifier = new ShieldedVerifier({
    origin: "https://api.example.com",
    registryUrl: "https://registry.example.com"
  });
  verifier.resetForTesting();
});

describe("E2E: Financial Service Flows", () => {
  it("verifies user for high-value transaction", async () => {
    // Real-world scenario: User wants to transfer $50,000
    // Service requires: Adult, KYC Level 2, Low Risk, Compliance, Device Security
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 21 }, // Must be 21+ (age of majority for financial)
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 }, // Must have Level 2 KYC
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 25 }, // Risk score below 25
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 2 }, // US compliance
        { type: "TRANSACTION_LIMIT" as ClaimType, minAvailableLimit: 50000, limitType: "DAILY" } // Has daily limit >= $50k
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/verify-transaction" }
    });

    expect(request).toBeDefined();
    expect(request.requestedClaims).toHaveLength(5);
    expect(request.policy.requireStatusCheck).toBe(true);
  });

  it("verifies peer-to-peer payment service requirements", async () => {
    // Real-world: P2P payment between users
    // Requirements: Adult, Basic KYC, Non-EU (lower compliance), Consent given
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 1 },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "DATA_SHARING", minConsentVersion: 1 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 50 } // Moderate risk acceptable
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://api.example.com/p2p-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });

  it("verifies enterprise payment gateway requirements", async () => {
    // Real-world: Business account for recurring payments
    // Requirements: Adult, High KYC, Deep compliance, Reputation, Credential chain
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 25 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 3 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 4 },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 85 },
        { type: "CREDENTIAL_CHAIN" as ClaimType, chainLength: 2 },
        { type: "TRANSACTION_LIMIT" as ClaimType, minAvailableLimit: 1000000, limitType: "MONTHLY" }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/enterprise-verify" }
    });

    expect(request.requestedClaims).toHaveLength(6);
  });
});

describe("E2E: Compliance & Regulatory Flows", () => {
  it("verifies GDPR-compliant data processing request", async () => {
    // Real-world: EU user data processing with GDPR requirements
    // Requirements: Adult, EU resident, Explicit consent, Compliance audit
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "EU_RESIDENT" as ClaimType },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "DATA_PROCESSING", minConsentVersion: 2 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 3 }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/gdpr-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });

  it("verifies multi-jurisdiction compliance requirements", async () => {
    // Real-world: Service must comply with EU, UK, and US regulations
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 3 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "UK", complianceLevel: 2 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 2 },
        { type: "DOCUMENT_TYPE" as ClaimType, expectedValue: "passport" } // International travel doc
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/multi-jurisdiction-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });

  it("verifies healthcare service HIPAA compliance", async () => {
    // Real-world: US healthcare service with HIPAA requirements
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 4 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true, hasMFA: true },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "HEALTH_DATA", minConsentVersion: 2 }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/hipaa-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });
});

describe("E2E: Risk & Security Flows", () => {
  it("verifies high-security authentication requirements", async () => {
    // Real-world: Access to sensitive admin panel
    // Requirements: Adult, High trust, Low risk, Device security, Consent
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 10 }, // Very low risk
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true, hasMFA: true, osVersion: "12.0" },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 90 },
        { type: "CONTINUITY" as ClaimType } // Device continuity
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 }, // Short validity
      callback: { method: "POST", url: "https://api.example.com/admin-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });

  it("verifies fraud prevention flow for marketplace listing", async () => {
    // Real-world: Seller profile creation on marketplace
    // Requirements: Adult, KYC verified, Good reputation, Device trust, No high risk
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 1 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 40 },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 60 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true },
        { type: "CONTINUITY" as ClaimType }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/seller-verify" }
    });

    expect(request.requestedClaims).toHaveLength(6);
  });

  it("verifies identity verification for account recovery", async () => {
    // Real-world: Lost password recovery with extra verification
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "DOCUMENT_TYPE" as ClaimType, expectedValue: "passport" },
        { type: "AML_CLEAR" as ClaimType },
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" },
        { type: "DEVICE_COMPLIANCE" as ClaimType } // Device consistency check
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/account-recovery-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });
});

describe("E2E: Onboarding & Access Control Flows", () => {
  it("verifies new customer onboarding flow", async () => {
    // Real-world: New user signup with identity verification
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" },
        { type: "DOCUMENT_TYPE" as ClaimType, expectedValue: "driving_license" },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "TERMS_AND_CONDITIONS", minConsentVersion: 1 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/onboard-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });

  it("verifies role-based access control for employee access", async () => {
    // Real-world: Employee accessing internal systems
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "department", metadataValue: "engineering" },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true, hasMFA: true },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 15 },
        { type: "CONTINUITY" as ClaimType }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/employee-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });

  it("verifies contractor access with time-limited permissions", async () => {
    // Real-world: Contractor with limited-time access
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "contractor_type", metadataValue: "consultant" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "contract_end_date", metadataValue: 1735689600, comparisonOperator: "GE" },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 70 }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/contractor-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });
});

describe("E2E: Age-Restricted Service Flows", () => {
  it("verifies alcohol purchase for drinking-age verification", async () => {
    // Real-world: Age-restricted alcohol/tobacco purchase
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 21 }, // US legal drinking age
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" },
        { type: "DOCUMENT_TYPE" as ClaimType, expectedValue: "driving_license" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://api.example.com/alcohol-verify" }
    });

    expect(request.requestedClaims).toHaveLength(3);
  });

  it("verifies gaming service age verification (COPPA compliance)", async () => {
    // Real-world: Online gaming service COPPA compliance
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 13 }, // COPPA minimum
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "PARENT_CONSENT" } // For <18
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/gaming-verify" }
    });

    expect(request.requestedClaims).toHaveLength(2);
  });
});

describe("E2E: Location & Travel Flows", () => {
  it("verifies international money transfer eligibility", async () => {
    // Real-world: Cross-border money transfer with compliance
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 },
        { type: "AML_CLEAR" as ClaimType },
        { type: "SANCTIONS_CLEAR" as ClaimType },
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/intl-transfer-verify" }
    });

    expect(request.requestedClaims).toHaveLength(5);
  });

  it("verifies travel eligibility for flight booking", async () => {
    // Real-world: Flight booking for international travel
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "DOCUMENT_TYPE" as ClaimType, expectedValue: "passport" },
        { type: "SANCTIONS_CLEAR" as ClaimType },
        { type: "COUNTRY" as ClaimType, expectedCountry: "US" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/flight-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });
});

describe("E2E: Credential Metadata Verification Flows", () => {
  it("verifies business verification with company metadata", async () => {
    // Real-world: B2B service access with company requirements
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "company_size", metadataValue: 50, comparisonOperator: "GE" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "years_in_business", metadataValue: 5, comparisonOperator: "GE" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "industry", metadataValue: "financial_services" },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 75 }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/b2b-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });

  it("verifies professional credentials for service provider", async () => {
    // Real-world: Freelancer marketplace professional verification
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "profession", metadataValue: "software_engineer" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "certifications", metadataValue: 3, comparisonOperator: "GE" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "years_experience", metadataValue: 5, comparisonOperator: "GE" },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 80 }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/professional-verify" }
    });

    expect(request.requestedClaims).toHaveLength(4);
  });
});

describe("E2E: Complex Multi-Predicate Scenarios", () => {
  it("handles ultra-high-security banking scenario", async () => {
    // Real-world: Wire transfer > $1M with maximum security
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 21 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 3 },
        { type: "AML_CLEAR" as ClaimType },
        { type: "SANCTIONS_CLEAR" as ClaimType },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 5 }, // Extremely low risk
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 4 },
        { type: "TRANSACTION_LIMIT" as ClaimType, minAvailableLimit: 1000000 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true, hasMFA: true },
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 95 },
        { type: "CONTINUITY" as ClaimType }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 }, // Very short validity
      callback: { method: "POST", url: "https://api.example.com/mega-wire-verify" }
    });

    expect(request.requestedClaims).toHaveLength(10);
  });

  it("handles global fintech platform requirements", async () => {
    // Real-world: Cross-border fintech platform with global compliance
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "EU", complianceLevel: 3 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "UK", complianceLevel: 2 },
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 2 },
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 30 },
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "DATA_SHARING" },
        { type: "CONSENT_REQUIRED" as ClaimType, consentType: "FINANCIAL_PROCESSING" }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/global-fintech-verify" }
    });

    expect(request.requestedClaims).toHaveLength(9);
  });

  it("handles healthcare provider credentialing flow", async () => {
    // Real-world: Healthcare provider onboarding with credentialing
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 21 },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "license_type", metadataValue: "MD" },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "license_valid", metadataValue: "true" },
        { type: "CREDENTIAL_CHAIN" as ClaimType, chainLength: 2 }, // License issuer chain
        { type: "COMPLIANCE_STATUS" as ClaimType, jurisdiction: "US", complianceLevel: 4 }, // HIPAA
        { type: "DEVICE_COMPLIANCE" as ClaimType, hasEncryption: true, hasMFA: true }, // HIPAA tech
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 85 },
        { type: "CONTINUITY" as ClaimType }
      ],
      policy: { requireStatusCheck: true, maxAgeSeconds: 600 },
      callback: { method: "POST", url: "https://api.example.com/provider-credentialing-verify" }
    });

    expect(request.requestedClaims).toHaveLength(8);
  });

  it("handles marketplace seller elevation flow", async () => {
    // Real-world: Promote marketplace user to verified seller status
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER" as ClaimType, threshold: 18 },
        { type: "KYC_LEVEL" as ClaimType, minLevel: 2 },
        { type: "CONTINUITY" as ClaimType }, // Minimum 30-day account age (verified via continuity)
        { type: "REPUTATION_SCORE" as ClaimType, minReputationScore: 70 }, // Good buyer rating
        { type: "TRANSACTION_LIMIT" as ClaimType, minAvailableLimit: 10000 }, // Can handle sales
        { type: "RISK_SCORE" as ClaimType, maxRiskScore: 35 },
        { type: "CREDENTIAL_METADATA" as ClaimType, metadataKey: "account_age_days", metadataValue: 30, comparisonOperator: "GE" }
      ],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://api.example.com/seller-elevation-verify" }
    });

    expect(request.requestedClaims).toHaveLength(7);
  });
});
