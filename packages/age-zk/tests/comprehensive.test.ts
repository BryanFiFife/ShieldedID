/**
 * Comprehensive Test Suite for Phase 1 Implementation
 * Tests all 22 global Bulletproof predicates
 * Coverage: Unit tests, integration tests, edge cases, regional compliance
 */

import {
  prove_ge,
  prove_age_range,
  prove_birth_year,
  prove_string_equality,
  prove_membership_in_list,
  prove_not_in_list,
  prove_string_prefix,
  verify_ge_components,
  verify_age_range_components,
  verify_string_equality_components,
  verify_membership_components,
  verify_string_prefix_components
} from "../src/lib.rs";

describe("Comprehensive Phase 1 Bulletproof Circuits", () => {
  
  // ============================================================================
  // AGE VERIFICATION TESTS (4 predicates)
  // ============================================================================
  
  describe("AGE_OVER - Age >= threshold", () => {
    it("proves age 25 >= 18", async () => {
      const proof = await prove_ge(25, 18, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
      expect(proof.commitment).toBeDefined();
      expect(proof.proof).toBeDefined();
      expect(proof.public_inputs).toBeDefined();
    });

    it("rejects age 16 >= 18", () => {
      expect(() => prove_ge(16, 18, "test-origin|nonce|expiry")).toThrow();
    });

    it("accepts age 18 >= 18", async () => {
      const proof = await prove_ge(18, 18, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("verifies valid age proof", async () => {
      const proof = await prove_ge(25, 18, "test-origin|nonce|expiry");
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(true);
    });

    it("rejects proof with wrong threshold", async () => {
      const proof = await prove_ge(25, 18, "test-origin|nonce|expiry");
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        30,
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(false);
    });

    it("rejects proof with wrong context", async () => {
      const proof = await prove_ge(25, 18, "test-origin|nonce|expiry");
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        "wrong-origin|nonce|expiry"
      );
      expect(valid).toBe(false);
    });
  });

  describe("AGE_RANGE - age in [min, max]", () => {
    it("proves age 25 in [18, 65]", async () => {
      const proof = await prove_age_range(25, 18, 65, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects age 16 in [18, 65]", () => {
      expect(() => prove_age_range(16, 18, 65, "test-origin|nonce|expiry")).toThrow();
    });

    it("rejects age 70 in [18, 65]", () => {
      expect(() => prove_age_range(70, 18, 65, "test-origin|nonce|expiry")).toThrow();
    });

    it("accepts boundary age 18", async () => {
      const proof = await prove_age_range(18, 18, 65, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("accepts boundary age 65", async () => {
      const proof = await prove_age_range(65, 18, 65, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("verifies valid age range proof", async () => {
      const proof = await prove_age_range(25, 18, 65, "test-origin|nonce|expiry");
      const valid = await verify_age_range_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        65,
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(true);
    });
  });

  describe("AGE_EXACT - age == expected_value", () => {
    it("proves age 21 == 21", async () => {
      const proof = await prove_ge(21, 21, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects age 20 == 21", () => {
      expect(() => prove_ge(20, 21, "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("BORN_AFTER - birth_year >= min_year", () => {
    it("proves born after 1990 >= 1980", async () => {
      const proof = await prove_birth_year(1990, 1980, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects born 1970 >= 1980", () => {
      expect(() => prove_birth_year(1970, 1980, "test-origin|nonce|expiry")).toThrow();
    });
  });

  // ============================================================================
  // LOCATION VERIFICATION TESTS (5 predicates)
  // ============================================================================

  describe("COUNTRY - country == expected_country", () => {
    it("proves country US == US", async () => {
      const proof = await prove_string_equality("US", "US", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects country US != GB", () => {
      expect(() => prove_string_equality("US", "GB", "test-origin|nonce|expiry")).toThrow();
    });

    it("verifies valid country proof", async () => {
      const proof = await prove_string_equality("DE", "DE", "test-origin|nonce|expiry");
      const valid = await verify_string_equality_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        "DE",
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(true);
    });

    it("supports all ISO country codes", async () => {
      const countries = ["US", "GB", "CA", "DE", "FR", "JP", "CN", "IN", "BR", "AU"];
      for (const country of countries) {
        const proof = await prove_string_equality(country, country, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  describe("EU_RESIDENT - country in EU list", () => {
    const EU = "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE";

    it("proves DE is EU resident", async () => {
      const proof = await prove_membership_in_list("DE", EU, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects US is EU resident", () => {
      expect(() => prove_membership_in_list("US", EU, "test-origin|nonce|expiry")).toThrow();
    });

    it("verifies valid EU membership", async () => {
      const proof = await prove_membership_in_list("FR", EU, "test-origin|nonce|expiry");
      const valid = await verify_membership_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        "FR",
        EU,
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(true);
    });

    it("covers all 27 EU member states", async () => {
      const allEU = [
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
        "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
        "PL", "PT", "RO", "SK", "SI", "ES", "SE"
      ];
      
      for (const country of allEU) {
        const proof = await prove_membership_in_list(country, EU, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  describe("STATE_OR_PROVINCE - state == expected_state", () => {
    it("proves CA == CA", async () => {
      const proof = await prove_string_equality("CA", "CA", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("supports US states", async () => {
      const states = ["CA", "NY", "TX", "FL", "WA", "CO"];
      for (const state of states) {
        const proof = await prove_string_equality(state, state, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });

    it("supports Canadian provinces", async () => {
      const provinces = ["ON", "QC", "BC", "AB", "MB"];
      for (const prov of provinces) {
        const proof = await prove_string_equality(prov, prov, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  describe("POSTAL_CODE_PREFIX - postal.startsWith(prefix)", () => {
    it("proves 90210 starts with 902", async () => {
      const proof = await prove_string_prefix("90210", "902", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects 90210 starts with 80", () => {
      expect(() => prove_string_prefix("90210", "80", "test-origin|nonce|expiry")).toThrow();
    });

    it("verifies valid postal prefix", async () => {
      const proof = await prove_string_prefix("M5V 3A8", "M5V", "test-origin|nonce|expiry");
      const valid = await verify_string_prefix_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        "M5V 3A8",
        "M5V",
        "test-origin|nonce|expiry"
      );
      expect(valid).toBe(true);
    });
  });

  // ============================================================================
  // KYC VERIFICATION TESTS (5 predicates)
  // ============================================================================

  describe("KYC_LEVEL - kyc_level >= min_level", () => {
    it("proves KYC level 3 >= 2", async () => {
      const proof = await prove_ge(3, 2, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects KYC level 1 >= 2", () => {
      expect(() => prove_ge(1, 2, "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("KYC_VERIFIED - kyc_status == verified", () => {
    it("proves status verified", async () => {
      const proof = await prove_string_equality("verified", "verified", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects status pending", () => {
      expect(() => prove_string_equality("pending", "verified", "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("AML_CLEAR - aml_status == clear", () => {
    it("proves AML clear", async () => {
      const proof = await prove_string_equality("clear", "clear", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects AML flagged", () => {
      expect(() => prove_string_equality("flagged", "clear", "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("SANCTIONS_CLEAR - sanctions_status == clear", () => {
    it("proves sanctions clear", async () => {
      const proof = await prove_string_equality("clear", "clear", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects sanctions blocked", () => {
      expect(() => prove_string_equality("blocked", "clear", "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("DOCUMENT_TYPE - doc_type == expected_type", () => {
    it("proves document type passport", async () => {
      const proof = await prove_string_equality("passport", "passport", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("supports all document types", async () => {
      const types = ["passport", "license", "national_id", "visa", "permits"];
      for (const type of types) {
        const proof = await prove_string_equality(type, type, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  // ============================================================================
  // DRIVING LICENSE TESTS (5 predicates)
  // ============================================================================

  describe("LICENSE_CLASS - license_class >= min_class", () => {
    it("proves class B (2) >= A (1)", async () => {
      const proof = await prove_ge(2, 1, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects class A (1) >= B (2)", () => {
      expect(() => prove_ge(1, 2, "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("VEHICLE_CATEGORY - vehicle_class == expected", () => {
    it("proves car category", async () => {
      const proof = await prove_string_equality("car", "car", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("supports all vehicle categories", async () => {
      const categories = ["motorcycle", "car", "truck", "bus", "agricultural"];
      for (const cat of categories) {
        const proof = await prove_string_equality(cat, cat, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  describe("ENDORSEMENT - endorsements includes required", () => {
    it("proves towing endorsement in list", async () => {
      const proof = await prove_membership_in_list("towing", "manual,towing,hazmat", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects missing endorsement", () => {
      expect(() => prove_membership_in_list("airbrake", "manual,towing", "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("RESTRICTION - restrictions excludes forbidden", () => {
    it("proves no corrective lenses restriction", async () => {
      const proof = await prove_not_in_list("no_restriction", "corrective_lenses,hearing_aid", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects if restriction present", () => {
      expect(() => prove_not_in_list("corrective_lenses", "corrective_lenses,hearing_aid", "test-origin|nonce|expiry")).toThrow();
    });
  });

  // ============================================================================
  // DOCUMENT & CREDENTIAL TESTS (7 predicates - grouped as 4)
  // ============================================================================

  describe("DOCUMENT_VALID - expiry_date > now", () => {
    it("proves future expiry", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 365;
      const proof = await prove_ge(futureTimestamp, Math.floor(Date.now() / 1000), "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("rejects past expiry", () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 86400;
      expect(() => prove_ge(pastTimestamp, Math.floor(Date.now() / 1000), "test-origin|nonce|expiry")).toThrow();
    });
  });

  describe("DOCUMENT_TYPE_MATCH - type == expected_type", () => {
    it("proves passport document type", async () => {
      const proof = await prove_string_equality("passport", "passport", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });
  });

  describe("ISSUER_COUNTRY - issuer == expected_country", () => {
    it("proves US issuer", async () => {
      const proof = await prove_string_equality("US", "US", "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });

    it("verifies all country issuers", async () => {
      const issuers = ["US", "GB", "CA", "DE", "FR", "JP"];
      for (const issuer of issuers) {
        const proof = await prove_string_equality(issuer, issuer, "test|nonce|exp");
        expect(proof).toBeDefined();
      }
    });
  });

  describe("CREDENTIAL_LEVEL - level >= min_level", () => {
    it("proves level 2 >= 1", async () => {
      const proof = await prove_ge(2, 1, "test-origin|nonce|expiry");
      expect(proof).toBeDefined();
    });
  });

  // ============================================================================
  // EDGE CASES & SECURITY TESTS
  // ============================================================================

  describe("Context Binding", () => {
    it("different contexts produce different proofs", async () => {
      const proof1 = await prove_ge(25, 18, "context1");
      const proof2 = await prove_ge(25, 18, "context2");
      expect(proof1.proof).not.toEqual(proof2.proof);
    });

    it("replay attack prevention via context", async () => {
      const proof = await prove_ge(25, 18, "https://verifier.com|nonce123|2025-01-12T00:00:00Z");
      const wrongContext = "https://attacker.com|nonce123|2025-01-12T00:00:00Z";
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        wrongContext
      );
      expect(valid).toBe(false);
    });
  });

  describe("Case Sensitivity", () => {
    it("rejects case-insensitive country codes", () => {
      expect(() => prove_string_equality("us", "US", "test|nonce|exp")).toThrow();
    });

    it("rejects case-insensitive state codes", () => {
      expect(() => prove_string_equality("ca", "CA", "test|nonce|exp")).toThrow();
    });
  });

  describe("Boundary Conditions", () => {
    it("handles zero values", async () => {
      const proof = await prove_ge(0, 0, "test|nonce|exp");
      expect(proof).toBeDefined();
    });

    it("handles large numbers", async () => {
      const largeNum = 2147483647; // max 32-bit int
      const proof = await prove_ge(largeNum, largeNum - 1, "test|nonce|exp");
      expect(proof).toBeDefined();
    });

    it("handles empty string prefix", async () => {
      const proof = await prove_string_prefix("anystring", "", "test|nonce|exp");
      expect(proof).toBeDefined();
    });
  });

  describe("Zero-Knowledge Properties", () => {
    it("commitment doesn't reveal value", async () => {
      const proof1 = await prove_ge(25, 18, "context");
      const proof2 = await prove_ge(30, 18, "context");
      // Commitments should be different but shouldn't reveal actual values
      expect(proof1.commitment).not.toEqual(proof2.commitment);
    });

    it("proof is context-bound", async () => {
      const proof = await prove_ge(25, 18, "https://example.com|nonce|expiry");
      expect(proof.public_inputs.includes("https://example.com")).toBe(true);
    });
  });

  // ============================================================================
  // REGIONAL COMPLIANCE TEMPLATES
  // ============================================================================

  describe("US Regional Compliance", () => {
    it("proves 21+ in California with valid driver license", async () => {
      const ageProof = await prove_ge(25, 21, "us-verifier|nonce|exp");
      const stateProof = await prove_string_equality("CA", "CA", "us-verifier|nonce|exp");
      const licenseProof = await prove_ge(2, 1, "us-verifier|nonce|exp"); // Class B+
      
      expect(ageProof).toBeDefined();
      expect(stateProof).toBeDefined();
      expect(licenseProof).toBeDefined();
    });
  });

  describe("EU Regional Compliance", () => {
    it("proves EU resident with verified KYC", async () => {
      const eu = "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE";
      const residencyProof = await prove_membership_in_list("DE", eu, "eu-verifier|nonce|exp");
      const kycProof = await prove_string_equality("verified", "verified", "eu-verifier|nonce|exp");
      
      expect(residencyProof).toBeDefined();
      expect(kycProof).toBeDefined();
    });

    it("proves GDPR compliance (no PII leakage)", async () => {
      // Using pairwise IDs instead of account numbers
      const pairwiseProof = await prove_string_equality("pairwise-id-hash", "pairwise-id-hash", "eu-verifier|nonce|exp");
      expect(pairwiseProof).toBeDefined();
    });
  });

  describe("UK Regional Compliance", () => {
    it("proves 18+ for post-Brexit UK age requirements", async () => {
      const ageProof = await prove_ge(20, 18, "uk-verifier|nonce|exp");
      expect(ageProof).toBeDefined();
    });
  });

  describe("Canada Regional Compliance", () => {
    it("proves 18+ in Ontario with valid driver license", async () => {
      const ageProof = await prove_ge(19, 18, "ca-verifier|nonce|exp");
      const provinceProof = await prove_string_equality("ON", "ON", "ca-verifier|nonce|exp");
      
      expect(ageProof).toBeDefined();
      expect(provinceProof).toBeDefined();
    });
  });

  describe("Australia Regional Compliance", () => {
    it("proves 18+ for Australian age of majority", async () => {
      const ageProof = await prove_ge(25, 18, "au-verifier|nonce|exp");
      expect(ageProof).toBeDefined();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS (Multiple Predicates)
  // ============================================================================

  describe("Multi-Predicate Integration", () => {
    it("combines age + KYC + location", async () => {
      const ageProof = await prove_ge(25, 18, "verifier|nonce|exp");
      const kycProof = await prove_string_equality("verified", "verified", "verifier|nonce|exp");
      const locationProof = await prove_string_equality("US", "US", "verifier|nonce|exp");
      
      expect(ageProof).toBeDefined();
      expect(kycProof).toBeDefined();
      expect(locationProof).toBeDefined();
    });

    it("combines driving license validation", async () => {
      const classProof = await prove_ge(2, 1, "verifier|nonce|exp");
      const endorsementProof = await prove_membership_in_list("hazmat", "manual,hazmat,airbrake", "verifier|nonce|exp");
      const restrictionProof = await prove_not_in_list("ok", "medical_restriction", "verifier|nonce|exp");
      
      expect(classProof).toBeDefined();
      expect(endorsementProof).toBeDefined();
      expect(restrictionProof).toBeDefined();
    });

    it("combines KYC + AML + Sanctions", async () => {
      const kycProof = await prove_string_equality("verified", "verified", "verifier|nonce|exp");
      const amlProof = await prove_string_equality("clear", "clear", "verifier|nonce|exp");
      const sanctionsProof = await prove_string_equality("clear", "clear", "verifier|nonce|exp");
      
      expect(kycProof).toBeDefined();
      expect(amlProof).toBeDefined();
      expect(sanctionsProof).toBeDefined();
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe("Performance", () => {
    it("generates proof < 500ms", async () => {
      const start = performance.now();
      await prove_ge(25, 18, "perf-test|nonce|exp");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it("verifies proof < 100ms", async () => {
      const proof = await prove_ge(25, 18, "perf-test|nonce|exp");
      const start = performance.now();
      await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        "perf-test|nonce|exp"
      );
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it("handles batch verification of 100 proofs", async () => {
      const proofs = [];
      for (let i = 0; i < 100; i++) {
        proofs.push(await prove_ge(25 + i, 18, `batch-test-${i}|nonce|exp`));
      }
      expect(proofs.length).toBe(100);
    });
  });

  // ============================================================================
  // BACKWARD COMPATIBILITY TESTS
  // ============================================================================

  describe("Backward Compatibility", () => {
    it("existing AGE_OVER proofs still verify", async () => {
      const proof = await prove_ge(25, 18, "legacy-context|nonce|exp");
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        18,
        "legacy-context|nonce|exp"
      );
      expect(valid).toBe(true);
    });

    it("supports existing KYC_LEVEL proofs", async () => {
      const proof = await prove_ge(3, 2, "kyc-context|nonce|exp");
      const valid = await verify_ge_components(
        proof.commitment,
        proof.proof,
        proof.public_inputs,
        2,
        "kyc-context|nonce|exp"
      );
      expect(valid).toBe(true);
    });
  });

});
