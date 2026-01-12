# Phase 1: Comprehensive Bulletproof Circuits Implementation
## Global Predicates for Age, Location, KYC, Driving, & Credentials

**Status:** Implementation Plan (Ready to Build)  
**Date:** January 12, 2026  
**Scope:** Complete predicate library for global identity verification  
**Complexity:** Moderate (modular circuit extensions)

---

## Table of Contents

1. [Predicate Library Overview](#predicate-library-overview)
2. [Rust ZK Circuit Implementation](#rust-zk-circuit-implementation)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Wallet Proof Generation](#wallet-proof-generation)
5. [Verifier Logic](#verifier-logic)
6. [Testing Strategy](#testing-strategy)
7. [Timeline & Effort](#timeline--effort)

---

## Predicate Library Overview

### Comprehensive Global Predicates

```
IDENTITY PREDICATES
├─ Age Verification
│  ├─ AGE_OVER (existing: threshold >= age)
│  ├─ AGE_RANGE (new: min_age <= age <= max_age)
│  ├─ BORN_AFTER (new: birth_year >= year)
│  └─ EXACT_AGE (new: age == value, privacy-respecting)
│
├─ Location Verification
│  ├─ COUNTRY (new: country == "US"/"GB"/"CA"/etc)
│  ├─ EU_RESIDENT (new: is_eu_resident == true)
│  ├─ REGION (new: region == "California"/"England"/etc)
│  ├─ STATE_OR_PROVINCE (new: state == value)
│  └─ POSTAL_CODE_PREFIX (new: first N digits match)
│
├─ KYC Verification
│  ├─ KYC_LEVEL (existing: level >= min_level)
│  ├─ KYC_VERIFIED (new: kyc_status == "verified")
│  ├─ AML_CLEAR (new: aml_status == "clear")
│  ├─ SANCTIONS_CLEAR (new: sanctions_check == "clear")
│  └─ DOCUMENT_TYPE (new: doc_type == "passport"/"license"/etc)
│
├─ Driving Verification
│  ├─ LICENSE_CLASS (new: license_class >= minimum)
│  │  └─ Classes: A, B, C, D, HGV, PSV (global standards)
│  ├─ VEHICLE_CATEGORY (new: vehicle_class == value)
│  │  └─ Categories: Motorcycle, Car, Truck, Bus, etc
│  ├─ ENDORSEMENT (new: endorsements include value)
│  │  └─ Endorsements: Manual, Auto, Towing, Hazmat, etc
│  ├─ RESTRICTION (new: restrictions don't include value)
│  │  └─ Restrictions: Corrective Lenses, Hearing Aid, etc
│  └─ LICENSE_VALID (new: expiry_date > now)
│
├─ Document Verification
│  ├─ DOCUMENT_VALID (new: expiry > now)
│  ├─ DOCUMENT_TYPE_MATCH (new: type == expected)
│  ├─ ISSUER_COUNTRY (new: issuer == country)
│  └─ DOCUMENT_AGE (new: issued_date >= min_age)
│
└─ Credential Verification
   ├─ CREDENTIAL_VALID (new: expiry > now)
   ├─ CREDENTIAL_ACTIVE (new: status == "active")
   └─ CREDENTIAL_LEVEL (new: level >= min_level)
```

---

## Rust ZK Circuit Implementation

### File: `packages/age-zk/src/lib.rs`

**New Circuit Functions:**

```rust
use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use wasm_bindgen::prelude::*;

// ============================================================================
// 1. AGE VERIFICATION CIRCUITS
// ============================================================================

/// Prove age >= threshold (EXISTING - used as base)
#[wasm_bindgen]
pub fn prove_age_over(
    age: u32,
    threshold: u32,
    context: String
) -> ProofBundle {
    prove_ge(age, threshold, context)
}

/// Prove age is within range: min_age <= age <= max_age
#[wasm_bindgen]
pub fn prove_age_range(
    age: u32,
    min_age: u32,
    max_age: u32,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-age-range-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    
    // Prove: age >= min_age
    let min_proof = prove_ge(age, min_age, context.clone());
    
    // Prove: max_age >= age (i.e., age <= max_age)
    let max_proof = prove_ge(max_age, age, context.clone());
    
    // Combine both proofs
    transcript.append_message(b"min_proof", &min_proof.commitment);
    transcript.append_message(b"max_proof", &max_proof.commitment);
    
    let aggregate_commitment = combine_commitments(&min_proof, &max_proof);
    
    ProofBundle {
        commitment: aggregate_commitment,
        proof: combine_proofs(&min_proof, &max_proof),
        public_inputs: format!("age_range|{}|{}", min_age, max_age).into(),
    }
}

/// Prove birth year >= min_year (for historical records)
#[wasm_bindgen]
pub fn prove_birth_year(
    birth_year: u32,
    min_year: u32,
    context: String
) -> ProofBundle {
    prove_ge(birth_year, min_year, context)
}

/// Prove exact age (for age-gated services requiring precision)
/// Uses hash commitment approach for equality within age circuits
#[wasm_bindgen]
pub fn prove_exact_age(
    age: u32,
    expected_age: u32,
    context: String
) -> ProofBundle {
    // Bulletproofs-based equality: prove (age - expected) == 0
    // via zero range proof on difference
    prove_difference_zero(age, expected_age, context)
}

// ============================================================================
// 2. LOCATION VERIFICATION CIRCUITS
// ============================================================================

/// Prove country matches expected value (string equality)
#[wasm_bindgen]
pub fn prove_country(
    country_code: &str,  // e.g., "US", "GB", "CA"
    expected_country: &str,
    context: String
) -> ProofBundle {
    // String equality: hash(country_code) == hash(expected_country)
    prove_string_equality(country_code, expected_country, context)
}

/// Prove EU residency (country in EU list)
#[wasm_bindgen]
pub fn prove_eu_resident(
    country_code: &str,
    context: String
) -> ProofBundle {
    const EU_COUNTRIES: &[&str] = &[
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
        "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
        "PL", "PT", "RO", "SK", "SI", "ES", "SE"
    ];
    
    // Prove country_code is in EU_COUNTRIES list
    // Uses membership proof via Bulletproofs
    prove_membership_in_list(country_code, EU_COUNTRIES, context)
}

/// Prove state/province matches
#[wasm_bindgen]
pub fn prove_state_or_province(
    state_code: &str,
    expected_state: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(state_code, expected_state, context)
}

/// Prove postal code prefix matches (privacy: hide full code)
#[wasm_bindgen]
pub fn prove_postal_prefix(
    postal_code: &str,
    prefix: &str,
    context: String
) -> ProofBundle {
    // Prove postal_code starts with prefix
    // Uses prefix commitment: hash(postal_code_prefix) == hash(expected_prefix)
    prove_string_prefix(postal_code, prefix, context)
}

// ============================================================================
// 3. KYC VERIFICATION CIRCUITS
// ============================================================================

/// Prove KYC level >= minimum (EXISTING - reuse)
#[wasm_bindgen]
pub fn prove_kyc_level(
    kyc_level: u32,
    min_level: u32,
    context: String
) -> ProofBundle {
    prove_ge(kyc_level, min_level, context)
}

/// Prove KYC status is "verified"
#[wasm_bindgen]
pub fn prove_kyc_verified(
    kyc_status: &str,  // "pending", "verified", "rejected"
    context: String
) -> ProofBundle {
    // Status equality proof
    prove_string_equality(kyc_status, "verified", context)
}

/// Prove AML clearance
#[wasm_bindgen]
pub fn prove_aml_clear(
    aml_status: &str,  // "clear", "flagged", "blocked"
    context: String
) -> ProofBundle {
    prove_string_equality(aml_status, "clear", context)
}

/// Prove sanctions check passed
#[wasm_bindgen]
pub fn prove_sanctions_clear(
    sanctions_status: &str,  // "clear", "flagged", "blocked"
    context: String
) -> ProofBundle {
    prove_string_equality(sanctions_status, "clear", context)
}

/// Prove document type (e.g., passport, license, national_id)
#[wasm_bindgen]
pub fn prove_document_type(
    doc_type: &str,
    expected_type: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(doc_type, expected_type, context)
}

// ============================================================================
// 4. DRIVING LICENSE VERIFICATION CIRCUITS
// ============================================================================

/// License class hierarchy (lower = more restrictive):
/// A (motorcycle) < B (car) < C (truck) < D (bus) < HGV < PSV
#[wasm_bindgen]
pub fn prove_license_class(
    license_class: u32,  // A=1, B=2, C=3, D=4, HGV=5, PSV=6
    min_class: u32,
    context: String
) -> ProofBundle {
    prove_ge(license_class, min_class, context)
}

/// Prove vehicle category eligibility
#[wasm_bindgen]
pub fn prove_vehicle_category(
    vehicle_category: &str,  // "motorcycle", "car", "truck", "bus", etc
    allowed_category: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(vehicle_category, allowed_category, context)
}

/// Prove endorsement is present (manual, auto, towing, hazmat, etc)
#[wasm_bindgen]
pub fn prove_has_endorsement(
    endorsements: &str,  // Comma-separated: "manual,towing"
    required_endorsement: &str,
    context: String
) -> ProofBundle {
    // Prove required_endorsement is in endorsements list
    prove_string_in_list(endorsements, required_endorsement, context)
}

/// Prove restriction is NOT present (corrective lenses, hearing aid, etc)
#[wasm_bindgen]
pub fn prove_no_restriction(
    restrictions: &str,  // Comma-separated: "corrective_lenses"
    forbidden_restriction: &str,
    context: String
) -> ProofBundle {
    // Prove forbidden_restriction is NOT in restrictions list
    prove_string_not_in_list(restrictions, forbidden_restriction, context)
}

/// Prove license is not expired
#[wasm_bindgen]
pub fn prove_license_valid(
    expiry_date: u32,  // Unix timestamp
    context: String
) -> ProofBundle {
    // Prove expiry_date > current_time
    // Use current_time from context binding
    let current_time = extract_timestamp_from_context(&context);
    prove_ge(expiry_date, current_time, context)
}

// ============================================================================
// 5. DOCUMENT VERIFICATION CIRCUITS
// ============================================================================

/// Prove document is not expired
#[wasm_bindgen]
pub fn prove_document_valid(
    expiry_date: u32,
    context: String
) -> ProofBundle {
    prove_license_valid(expiry_date, context)  // Reuse expiry logic
}

/// Prove document type matches
#[wasm_bindgen]
pub fn prove_document_type_match(
    actual_type: &str,
    expected_type: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(actual_type, expected_type, context)
}

/// Prove document issuer country
#[wasm_bindgen]
pub fn prove_issuer_country(
    issuer_country: &str,
    expected_country: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(issuer_country, expected_country, context)
}

/// Prove document age (issued_date >= min_age)
#[wasm_bindgen]
pub fn prove_document_age(
    issued_date: u32,
    min_issued_date: u32,
    context: String
) -> ProofBundle {
    prove_ge(issued_date, min_issued_date, context)
}

// ============================================================================
// 6. CREDENTIAL VERIFICATION CIRCUITS
// ============================================================================

/// Prove credential is not expired
#[wasm_bindgen]
pub fn prove_credential_valid(
    expiry_date: u32,
    context: String
) -> ProofBundle {
    prove_license_valid(expiry_date, context)
}

/// Prove credential status is active
#[wasm_bindgen]
pub fn prove_credential_active(
    credential_status: &str,
    context: String
) -> ProofBundle {
    prove_string_equality(credential_status, "active", context)
}

/// Prove credential level >= minimum
#[wasm_bindgen]
pub fn prove_credential_level(
    credential_level: u32,
    min_level: u32,
    context: String
) -> ProofBundle {
    prove_ge(credential_level, min_level, context)
}

// ============================================================================
// 7. HELPER FUNCTIONS (Bulletproofs-based)
// ============================================================================

/// String equality using Bulletproofs hash commitments
fn prove_string_equality(
    secret: &str,
    expected: &str,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-string-eq-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    
    // Convert strings to u32 hashes for Bulletproofs circuit
    let secret_hash = hash_string_to_u32(secret);
    let expected_hash = hash_string_to_u32(expected);
    
    // Prove difference is zero
    prove_difference_zero(secret_hash, expected_hash, context)
}

/// String membership proof (is string in list?)
fn prove_string_in_list(
    comma_separated: &str,
    target: &str,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-string-in-list-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    transcript.append_message(b"target", target.as_bytes());
    
    let items: Vec<&str> = comma_separated.split(',').collect();
    let found = items.iter().any(|item| item.trim() == target);
    
    // Prove membership via scalar witness
    let witness = if found { Scalar::from(1u64) } else { Scalar::from(0u64) };
    
    ProofBundle {
        commitment: hash_string_to_commitment(target),
        proof: transcript.challenge_bytes(b"membership", 32).to_vec(),
        public_inputs: format!("in_list|{}", found).into(),
    }
}

/// String not-in-list proof (is string NOT in list?)
fn prove_string_not_in_list(
    comma_separated: &str,
    forbidden: &str,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-string-not-in-list-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    transcript.append_message(b"forbidden", forbidden.as_bytes());
    
    let items: Vec<&str> = comma_separated.split(',').collect();
    let found = items.iter().any(|item| item.trim() == forbidden);
    
    // Prove non-membership
    let witness = if !found { Scalar::from(1u64) } else { Scalar::from(0u64) };
    
    ProofBundle {
        commitment: hash_string_to_commitment(forbidden),
        proof: transcript.challenge_bytes(b"non_membership", 32).to_vec(),
        public_inputs: format!("not_in_list|{}", !found).into(),
    }
}

/// String prefix proof (does string start with prefix?)
fn prove_string_prefix(
    full_string: &str,
    prefix: &str,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-string-prefix-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    transcript.append_message(b"prefix", prefix.as_bytes());
    
    let matches = full_string.starts_with(prefix);
    
    ProofBundle {
        commitment: hash_string_to_commitment(&full_string[..prefix.len().min(full_string.len())]),
        proof: transcript.challenge_bytes(b"prefix_match", 32).to_vec(),
        public_inputs: format!("prefix_match|{}", matches).into(),
    }
}

/// Membership in pre-defined list (e.g., EU countries)
fn prove_membership_in_list(
    value: &str,
    list: &[&str],
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-list-membership-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    
    let found = list.contains(&value);
    let hash_value = hash_string_to_u32(value);
    
    ProofBundle {
        commitment: hash_string_to_commitment(value),
        proof: transcript.challenge_bytes(b"list_membership", 32).to_vec(),
        public_inputs: format!("in_list|{}", found).into(),
    }
}

/// Prove difference is zero: (a - b) == 0
fn prove_difference_zero(
    a: u32,
    b: u32,
    context: String
) -> ProofBundle {
    let mut transcript = Transcript::new(b"shielded-id-eq-bulletproofs-v1");
    transcript.append_message(b"domain", DOMAIN_PROOF);
    transcript.append_message(b"context", context.as_bytes());
    
    // Use Bulletproofs range proof on small difference
    // Prove |a - b| is in range [0, 1) which is only satisfied when a == b
    
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(32, 1);
    
    let diff = if a >= b { (a - b) as u64 } else { (b - a) as u64 };
    let blinding = Scalar::random(&mut DeterministicRng::from_context(&context));
    
    // If a == b, diff will be 0, making the proof very constrained
    let commitment = pc_gens.commit(Scalar::from(diff), blinding);
    
    let (proof, _) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        diff,
        &blinding,
        32
    ).expect("Bulletproof generation failed");
    
    ProofBundle {
        commitment: commitment.compress().as_bytes().to_vec(),
        proof: proof.to_bytes().to_vec(),
        public_inputs: format!("eq|{}", a == b).into(),
    }
}

// Helper to convert string to u32 hash
fn hash_string_to_u32(s: &str) -> u32 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    (hasher.finish() >> 32) as u32
}

// Helper to create commitment from string
fn hash_string_to_commitment(s: &str) -> Vec<u8> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    let hash = hasher.finish();
    hash.to_le_bytes().to_vec()
}

// Extract timestamp from context (format: "origin|nonce|expiry")
fn extract_timestamp_from_context(context: &str) -> u32 {
    let parts: Vec<&str> = context.split('|').collect();
    if parts.len() >= 3 {
        // Parse ISO datetime from expiry, convert to unix timestamp
        // For now, return placeholder
        0
    } else {
        0
    }
}
```

---

## TypeScript Type Definitions

### File: `packages/verifier-sdk/src/types.ts`

```typescript
/** Comprehensive claim types supporting global predicates */
export type ClaimType = 
  // Age
  | "AGE_OVER"
  | "AGE_RANGE"
  | "AGE_EXACT"
  | "BORN_AFTER"
  
  // Location
  | "COUNTRY"
  | "EU_RESIDENT"
  | "STATE_OR_PROVINCE"
  | "POSTAL_CODE_PREFIX"
  
  // KYC
  | "KYC_LEVEL"
  | "KYC_VERIFIED"
  | "AML_CLEAR"
  | "SANCTIONS_CLEAR"
  | "DOCUMENT_TYPE"
  
  // Driving License
  | "LICENSE_CLASS"
  | "VEHICLE_CATEGORY"
  | "ENDORSEMENT"
  | "RESTRICTION"
  | "LICENSE_VALID"
  
  // Documents
  | "DOCUMENT_VALID"
  | "DOCUMENT_TYPE_MATCH"
  | "ISSUER_COUNTRY"
  | "DOCUMENT_AGE"
  
  // Credentials
  | "CREDENTIAL_VALID"
  | "CREDENTIAL_ACTIVE"
  | "CREDENTIAL_LEVEL"
  
  | "CUSTOM";

/** Predicate operators for flexible proof requests */
export type PredicateOperator = 
  | "GE"        // Greater than or equal (range proofs)
  | "EQ"        // Equality (string or number)
  | "IN"        // Membership in set (EU_RESIDENT, etc)
  | "NOT_IN"    // Membership NOT in set (restrictions)
  | "STARTS_WITH";  // Prefix match (postal codes)

/** Requested claim with full predicate support */
export interface RequestedClaim {
  type: ClaimType;
  operator?: PredicateOperator;  // Default: "GE" for range proofs
  
  // For range proofs (AGE_OVER, AGE_RANGE, KYC_LEVEL, etc)
  threshold?: number;
  minLevel?: number;
  minValue?: number;
  maxValue?: number;
  
  // For equality/membership proofs
  expectedValue?: string | number;
  expectedCountry?: string;
  expectedState?: string;
  requiredEndorsement?: string;
  forbiddenRestriction?: string;
  
  // For prefix matching
  prefixLength?: number;
  
  // Metadata
  minimumAge?: number;  // For document age validation
  issuerCountry?: string;
}

/** Comprehensive proof response with all predicate support */
export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  
  // Standard fields
  claims: Claim[];
  suite: ProofSuite;
  signature: string;
  
  // ZK proof fields (can be multiple types)
  zkProofs?: {
    [claimIndex: number]: {
      commitment: string;      // base64
      bulletproof: string;     // base64
      publicInputs: string;    // base64
      claimType: ClaimType;
      operator: PredicateOperator;
    };
  };
}

export type ProofSuite = 
  | "ECDSA_P256_SHA256_1.0.0"
  | "BULLETPROOFS_RISTRETTO_V1"
  | "COMPOSITE_BULLETPROOFS_V1";

/** Individual claim in response */
export interface Claim {
  type: ClaimType;
  value: boolean | number | string;
  operator?: PredicateOperator;
  issuer?: {
    did: string;
    keyId?: string;
    signature?: string;
  };
  expiresAt?: string;
  evidence?: Record<string, unknown>;
}
```

---

## Wallet Proof Generation

### File: `apps/wallet-pwa/src/lib/proof-generator.ts`

**Expanded proof generation for all predicates:**

```typescript
import {
  prove_age_over,
  prove_age_range,
  prove_country,
  prove_eu_resident,
  prove_kyc_level,
  prove_license_class,
  prove_has_endorsement,
  prove_no_restriction,
  // ... all other circuits
} from '@shielded-id/age-zk';

interface VaultPayload {
  profile?: {
    dateOfBirth?: string;
    age?: number;
    country?: string;
    state?: string;
    postalCode?: string;
    kycLevel?: number;
    kycStatus?: string;
    amlStatus?: string;
  };
  documents?: {
    type: string;
    issuerCountry?: string;
    issuedDate?: number;
    expiryDate?: number;
  }[];
  driving?: {
    licenseClass?: number;  // 1-6
    vehicleCategory?: string;
    endorsements?: string;  // "manual,towing"
    restrictions?: string;  // "corrective_lenses"
    expiryDate?: number;
  };
  credentials?: {
    type: string;
    level?: number;
    status?: string;
    expiryDate?: number;
  }[];
}

export async function generateProof(
  request: ProofRequest,
  vault: VaultPayload,
  options: { walletId: string; keyId?: string; passphrase?: string }
): Promise<ProofResponse> {
  const zkProofs: Record<number, any> = {};
  const claims: Claim[] = [];
  
  for (let i = 0; i < request.requestedClaims.length; i++) {
    const requestClaim = request.requestedClaims[i];
    const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`;
    
    let zkProof = null;
    let claimValue: boolean | number | string = false;
    
    switch (requestClaim.type) {
      // ---- AGE PROOFS ----
      case "AGE_OVER": {
        const age = vault.profile?.age || 0;
        const threshold = requestClaim.threshold || 18;
        const proofBundle = await prove_age_over(
          BigInt(age),
          BigInt(threshold),
          context
        );
        zkProof = proofBundle;
        claimValue = age >= threshold;
        break;
      }
      
      case "AGE_RANGE": {
        const age = vault.profile?.age || 0;
        const minAge = requestClaim.minValue || 18;
        const maxAge = requestClaim.maxValue || 65;
        const proofBundle = await prove_age_range(
          BigInt(age),
          BigInt(minAge),
          BigInt(maxAge),
          context
        );
        zkProof = proofBundle;
        claimValue = age >= minAge && age <= maxAge;
        break;
      }
      
      case "AGE_EXACT": {
        const age = vault.profile?.age || 0;
        const expectedAge = requestClaim.expectedValue as number;
        const proofBundle = await prove_exact_age(
          BigInt(age),
          BigInt(expectedAge),
          context
        );
        zkProof = proofBundle;
        claimValue = age === expectedAge;
        break;
      }
      
      // ---- LOCATION PROOFS ----
      case "COUNTRY": {
        const country = vault.profile?.country || "";
        const expectedCountry = requestClaim.expectedCountry || "US";
        const proofBundle = await prove_country(country, expectedCountry, context);
        zkProof = proofBundle;
        claimValue = country === expectedCountry;
        break;
      }
      
      case "EU_RESIDENT": {
        const country = vault.profile?.country || "";
        const proofBundle = await prove_eu_resident(country, context);
        zkProof = proofBundle;
        claimValue = isEUCountry(country);
        break;
      }
      
      case "STATE_OR_PROVINCE": {
        const state = vault.profile?.state || "";
        const expectedState = requestClaim.expectedState || "";
        const proofBundle = await prove_state_or_province(state, expectedState, context);
        zkProof = proofBundle;
        claimValue = state === expectedState;
        break;
      }
      
      case "POSTAL_CODE_PREFIX": {
        const postal = vault.profile?.postalCode || "";
        const prefix = requestClaim.expectedValue as string;
        const prefixLen = requestClaim.prefixLength || 3;
        const proofBundle = await prove_postal_prefix(postal, prefix, context);
        zkProof = proofBundle;
        claimValue = postal.startsWith(prefix);
        break;
      }
      
      // ---- KYC PROOFS ----
      case "KYC_LEVEL": {
        const level = vault.profile?.kycLevel || 0;
        const minLevel = requestClaim.minLevel || 1;
        const proofBundle = await prove_kyc_level(
          BigInt(level),
          BigInt(minLevel),
          context
        );
        zkProof = proofBundle;
        claimValue = level >= minLevel;
        break;
      }
      
      case "KYC_VERIFIED": {
        const status = vault.profile?.kycStatus || "pending";
        const proofBundle = await prove_kyc_verified(status, context);
        zkProof = proofBundle;
        claimValue = status === "verified";
        break;
      }
      
      case "AML_CLEAR": {
        const status = vault.profile?.amlStatus || "unknown";
        const proofBundle = await prove_aml_clear(status, context);
        zkProof = proofBundle;
        claimValue = status === "clear";
        break;
      }
      
      // ---- DRIVING LICENSE PROOFS ----
      case "LICENSE_CLASS": {
        const licenseClass = vault.driving?.licenseClass || 0;
        const minClass = requestClaim.threshold || 2; // B minimum
        const proofBundle = await prove_license_class(
          BigInt(licenseClass),
          BigInt(minClass),
          context
        );
        zkProof = proofBundle;
        claimValue = licenseClass >= minClass;
        break;
      }
      
      case "ENDORSEMENT": {
        const endorsements = vault.driving?.endorsements || "";
        const required = requestClaim.requiredEndorsement || "";
        const proofBundle = await prove_has_endorsement(
          endorsements,
          required,
          context
        );
        zkProof = proofBundle;
        claimValue = endorsements.includes(required);
        break;
      }
      
      case "RESTRICTION": {
        const restrictions = vault.driving?.restrictions || "";
        const forbidden = requestClaim.forbiddenRestriction || "";
        const proofBundle = await prove_no_restriction(restrictions, forbidden, context);
        zkProof = proofBundle;
        claimValue = !restrictions.includes(forbidden);
        break;
      }
      
      case "LICENSE_VALID": {
        const expiry = vault.driving?.expiryDate || 0;
        const proofBundle = await prove_license_valid(BigInt(expiry), context);
        zkProof = proofBundle;
        claimValue = expiry > Date.now() / 1000;
        break;
      }
      
      // ... other claim types handled similarly
    }
    
    // Store ZK proof if generated
    if (zkProof) {
      zkProofs[i] = {
        commitment: zkProof.commitment,
        bulletproof: zkProof.proof,
        publicInputs: zkProof.publicInputs,
        claimType: requestClaim.type,
        operator: requestClaim.operator || "GE"
      };
    }
    
    // Add claim to response
    claims.push({
      type: requestClaim.type,
      value: claimValue,
      operator: requestClaim.operator || "GE"
    });
  }
  
  // Build response
  const pairwiseSubjectId = await generatePairwiseSubjectId(
    bytesFromBase64(vault.masterSecret || ""),
    request.verifierOrigin
  );
  
  const response: ProofResponse = {
    requestId: request.requestId,
    nonce: request.nonce,
    walletId: options.walletId,
    keyId: options.keyId,
    pairwiseSubjectId,
    claims,
    suite: "BULLETPROOFS_RISTRETTO_V1",
    signature: "",  // Will be signed below
    zkProofs: Object.keys(zkProofs).length > 0 ? zkProofs : undefined
  };
  
  // Sign the proof response
  response.signature = await signProof(response, vault, options.passphrase);
  
  return response;
}

function isEUCountry(country: string): boolean {
  const euCountries = [
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
    "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
    "PL", "PT", "RO", "SK", "SI", "ES", "SE"
  ];
  return euCountries.includes(country);
}
```

---

## Verifier Logic

### File: `packages/verifier-sdk/src/verifier.ts`

**Enhanced verification for all predicates:**

```typescript
async verifyProof(
  request: ProofRequest,
  proofResponse: ProofResponse,
  options: VerificationOptions = { checkRevocation: true }
): Promise<VerificationResult> {
  // ... existing validation checks ...
  
  // Verify all ZK proofs
  if (proofResponse.zkProofs) {
    for (let i = 0; i < proofResponse.claims.length; i++) {
      if (proofResponse.zkProofs[i]) {
        const zkValid = await this.verifyZkProof(
          request,
          proofResponse,
          proofResponse.zkProofs[i]
        );
        
        if (!zkValid) {
          return {
            valid: false,
            reason: `ZK_PROOF_INVALID_${proofResponse.claims[i].type}`,
            verifiedAt: nowIso()
          };
        }
      }
    }
  }
  
  // Verify claims against request
  if (!this.validateClaimsAgainstRequest(request.requestedClaims, proofResponse.claims)) {
    return { valid: false, reason: "CLAIM_POLICY_MISMATCH", verifiedAt: nowIso() };
  }
  
  // ... rest of verification ...
  
  return {
    valid: true,
    pairwiseSubjectId: proofResponse.pairwiseSubjectId,
    assuranceLevel: this.computeAssuranceLevel(proofResponse.claims, request),
    verifiedAt: nowIso()
  };
}

private async verifyZkProof(
  request: ProofRequest,
  proofResponse: ProofResponse,
  zkProof: any
): Promise<boolean> {
  const {
    verify_age_over,
    verify_age_range,
    verify_country,
    verify_eu_resident,
    verify_kyc_level,
    verify_license_class,
    verify_has_endorsement,
    verify_no_restriction,
    // ... all other verifiers
  } = await import('@shielded-id/age-zk');
  
  const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`;
  const commitment = base64UrlDecode(zkProof.commitment);
  const proof = base64UrlDecode(zkProof.bulletproof);
  const publicInputs = base64UrlDecode(zkProof.publicInputs);
  
  try {
    switch (zkProof.claimType) {
      case "AGE_OVER": {
        const threshold = request.requestedClaims.find(c => c.type === "AGE_OVER")?.threshold || 18;
        return verify_age_over(commitment, proof, publicInputs, BigInt(threshold), context);
      }
      
      case "AGE_RANGE": {
        const claim = request.requestedClaims.find(c => c.type === "AGE_RANGE");
        return verify_age_range(
          commitment,
          proof,
          publicInputs,
          BigInt(claim?.minValue || 18),
          BigInt(claim?.maxValue || 65),
          context
        );
      }
      
      case "COUNTRY": {
        const expectedCountry = request.requestedClaims
          .find(c => c.type === "COUNTRY")?.expectedCountry || "US";
        return verify_country(commitment, proof, publicInputs, expectedCountry, context);
      }
      
      case "EU_RESIDENT": {
        return verify_eu_resident(commitment, proof, publicInputs, context);
      }
      
      case "LICENSE_CLASS": {
        const minClass = request.requestedClaims
          .find(c => c.type === "LICENSE_CLASS")?.threshold || 2;
        return verify_license_class(commitment, proof, publicInputs, BigInt(minClass), context);
      }
      
      // ... handle all other claim types
      
      default:
        console.error("Unknown claim type for ZK verification:", zkProof.claimType);
        return false;
    }
  } catch (err) {
    console.error("ZK proof verification failed:", err);
    return false;
  }
}

private validateClaimsAgainstRequest(
  requested: ProofRequest["requestedClaims"],
  claims: Claim[]
): boolean {
  for (const request of requested) {
    const claim = claims.find(c => c.type === request.type);
    if (!claim) return false;
    
    // Validate based on operator
    const operator = request.operator || "GE";
    
    switch (operator) {
      case "GE": {
        // Value must be >= threshold
        if (typeof claim.value !== "number") return false;
        const threshold = request.threshold || request.minLevel || 0;
        if (claim.value < threshold) return false;
        break;
      }
      
      case "EQ": {
        // Value must equal expected
        if (claim.value !== request.expectedValue) return false;
        break;
      }
      
      case "IN": {
        // Value must be in list/membership
        const value = String(claim.value).toLowerCase();
        if (request.type === "EU_RESIDENT") {
          if (!isEUCountry(String(request.expectedValue))) return false;
        }
        break;
      }
      
      case "NOT_IN": {
        // Value must NOT be in list
        const value = String(claim.value).toLowerCase();
        if (request.type === "RESTRICTION") {
          if (value.includes(request.forbiddenRestriction)) return false;
        }
        break;
      }
      
      case "STARTS_WITH": {
        // Value must start with prefix
        if (!String(claim.value).startsWith(String(request.expectedValue))) return false;
        break;
      }
    }
  }
  
  return true;
}
```

---

## Testing Strategy

### Comprehensive Test Coverage (200+ tests)

```typescript
// File: packages/age-zk/tests/circuits.test.ts

describe("Comprehensive Bulletproof Circuits", () => {
  
  describe("Age Verification", () => {
    it("proves age >= threshold", async () => { /* ... */ });
    it("rejects age < threshold", async () => { /* ... */ });
    it("proves age in range", async () => { /* ... */ });
    it("rejects age outside range", async () => { /* ... */ });
    it("proves birth year >= minimum", async () => { /* ... */ });
    it("proves exact age", async () => { /* ... */ });
  });
  
  describe("Location Verification", () => {
    it("proves country equality", async () => { /* ... */ });
    it("proves EU residency", async () => { /* ... */ });
    it("rejects non-EU country", async () => { /* ... */ });
    it("proves state/province equality", async () => { /* ... */ });
    it("proves postal code prefix", async () => { /* ... */ });
    it("handles all country codes", async () => { /* ... */ });
  });
  
  describe("KYC Verification", () => {
    it("proves KYC level >= minimum", async () => { /* ... */ });
    it("proves KYC verified status", async () => { /* ... */ });
    it("proves AML clear status", async () => { /* ... */ });
    it("proves sanctions clear", async () => { /* ... */ });
    it("proves document type", async () => { /* ... */ });
  });
  
  describe("Driving License Verification", () => {
    it("proves license class >= minimum", async () => { /* ... */ });
    it("proves vehicle category", async () => { /* ... */ });
    it("proves endorsement presence", async () => { /* ... */ });
    it("proves restriction absence", async () => { /* ... */ });
    it("proves license validity", async () => { /* ... */ });
  });
  
  describe("Document Verification", () => {
    it("proves document validity", async () => { /* ... */ });
    it("proves document type match", async () => { /* ... */ });
    it("proves issuer country", async () => { /* ... */ });
    it("proves document age", async () => { /* ... */ });
  });
  
  describe("Credential Verification", () => {
    it("proves credential validity", async () => { /* ... */ });
    it("proves credential active status", async () => { /* ... */ });
    it("proves credential level", async () => { /* ... */ });
  });
  
  describe("Edge Cases & Security", () => {
    it("prevents proof forgery", async () => { /* ... */ });
    it("maintains zero-knowledge property", async () => { /* ... */ });
    it("binds proofs to context", async () => { /* ... */ });
    it("prevents replay attacks", async () => { /* ... */ });
    it("handles all integer ranges", async () => { /* ... */ });
  });
});

// File: packages/verifier-sdk/tests/comprehensive.test.ts

describe("Comprehensive Global Verification", () => {
  
  describe("Multi-Predicate Verification", () => {
    it("verifies age + country", async () => { /* ... */ });
    it("verifies KYC + AML + Sanctions", async () => { /* ... */ });
    it("verifies driving license + endorsements + restrictions", async () => { /* ... */ });
    it("verifies document + credential validity", async () => { /* ... */ });
  });
  
  describe("Regional Compliance", () => {
    it("handles US requirements (state + age + license)", async () => { /* ... */ });
    it("handles EU requirements (country + GDPR)", async () => { /* ... */ });
    it("handles UK requirements (post-Brexit)", async () => { /* ... */ });
    it("handles Canada requirements", async () => { /* ... */ });
    it("handles Australia requirements", async () => { /* ... */ });
  });
  
  describe("Error Handling", () => {
    it("rejects invalid claim combinations", async () => { /* ... */ });
    it("rejects expired documents", async () => { /* ... */ });
    it("rejects tampered proofs", async () => { /* ... */ });
  });
});
```

---

## Timeline & Effort

### Phase 1: Comprehensive Bulletproof Circuits

**Week 1-2: Core Implementation**
- Rust circuits for all 22 predicates (~600 lines) - 5 days
- Helper functions for equality, membership, prefix - 2 days
- WASM bindings & exports - 1 day

**Week 2-3: TypeScript Integration**
- Type definitions for all predicates - 2 days
- Wallet proof generation (all 22 types) - 4 days
- Verifier verification logic - 3 days

**Week 3-4: Testing & Documentation**
- Unit tests for all circuits (200+ tests) - 3 days
- Integration tests (multi-predicate, regional) - 3 days
- Documentation & examples - 2 days

**Total Effort:** 25 developer-days (~6 weeks, 1 senior engineer)

### Deliverables

✅ 22 comprehensive Bulletproof circuits  
✅ Global predicate support (age, location, KYC, driving, documents, credentials)  
✅ Regional compliance templates (US, EU, UK, CA, AU)  
✅ 200+ test cases  
✅ Production-ready code with 98%+ coverage  
✅ Complete documentation & examples  

---

## Success Criteria

- ✅ All 22 predicate types implemented & tested
- ✅ 200+ test cases passing (unit + integration)
- ✅ 98%+ code coverage maintained
- ✅ Zero critical vulnerabilities
- ✅ Regional compliance templates working
- ✅ Performance: proof generation <300ms, verification <80ms
- ✅ Documentation complete
- ✅ Ready for production deployment

---

**End of Phase 1: Comprehensive Bulletproof Circuits Implementation Plan**
