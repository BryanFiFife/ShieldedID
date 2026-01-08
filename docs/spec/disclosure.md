# Shielded ID Disclosure Specification v1.0

This document specifies the privacy-preserving disclosure guarantees for Shielded ID proofs. Shielded ID provides **minimal disclosure** - verifiers learn only what they need to know, nothing more.

## Disclosure Modes

Shielded ID supports two proof modes with different privacy properties:

### A) Legacy Signed Predicate Mode (Minimal Disclosure)
- **Technology**: ECDSA-signed boolean predicates
- **Privacy**: Verifier learns only the boolean result (e.g., "age ≥ 18")
- **Not Zero-Knowledge**: Relies on wallet not including forbidden data
- **Suite**: `ECDSA_P256_SHA256_1.0.0`

### B) Zero-Knowledge Proof Mode (Cryptographic Privacy)
- **Technology**: Bulletproof range proofs with Pedersen commitments
- **Privacy**: Verifier learns only the boolean result with cryptographic assurance
- **True Zero-Knowledge**: Impossible to learn underlying values even with malicious wallet
- **Suites**: `AGE_ZK_v1`, `KYC_ZK_v1`

## Privacy Invariants

Shielded ID proofs guarantee that verifiers **never learn**:
- Raw personal data (names, addresses, dates of birth, etc.)
- Exact values (actual age, exact KYC level, etc.)
- Any data not explicitly requested in the proof request

Both modes enforce these invariants, but ZK mode provides cryptographic guarantees while legacy mode relies on correct wallet implementation.

## Recipe: AGE_OVER

**Request Input**: `{ type: "AGE_OVER", threshold: 18 }`

**Wallet Output**:
```json
{
  "type": "AGE_OVER",
  "value": true
}
```

**Verifier Learns**: Whether the user is ≥18 years old

**MUST NOT Include**:
- Actual age number
- Date of birth
- Any evidence containing PII

## Recipe: KYC_LEVEL (Assurance Level)

**Request Input**: `{ type: "KYC_LEVEL", minLevel: 2 }`

**Wallet Output**:
```json
{
  "type": "KYC_LEVEL",
  "value": true
}
```

**Verifier Learns**: Whether the user meets or exceeds the minimum assurance level

**MUST NOT Include**:
- Exact KYC/assurance level number
- KYC provider details
- Document copies or verification evidence
- Personal identifiers used in KYC process

## Recipe: CONTINUITY

**Request Input**: `{ type: "CONTINUITY" }`

**Wallet Output**:
```json
{
  "type": "CONTINUITY",
  "value": "pairwise-subject-id-..."
}
```

**Verifier Learns**: A consistent, pseudonymous identifier for the same user across sessions

**MUST NOT Include**:
- Real user identity
- Wallet identifiers
- Any personal data

## Recipe: CUSTOM

**Request Input**: `{ type: "CUSTOM", customField: "value" }`

**Wallet Output**:
```json
{
  "type": "CUSTOM",
  "value": "minimal-response"
}
```

**Verifier Learns**: Only the custom predicate result, never underlying data

**MUST NOT Include**:
- Raw data used to compute the custom predicate
- Any evidence beyond the boolean/string result

## Forbidden Evidence Fields

All proof responses MUST NOT contain evidence with these fields (case-insensitive):
- `dateOfBirth`, `dob`, `birthdate`
- `age`, `yearsOld`
- `name`, `firstName`, `lastName`, `fullName`
- `address`, `street`, `city`, `state`, `zip`, `postalCode`, `country`
- `ssn`, `socialSecurity`, `taxId`
- `phone`, `email`
- `kycLevel`, `kyc`, `assuranceLevel`, `tier`, `level`
- Any other personally identifiable information

## Zero-Knowledge Proofs

When available, Shielded ID uses cryptographic zero-knowledge proofs that reveal even less:
- **AGE_OVER ZK**: Proves age ≥ threshold without revealing actual age
- **KYC_LEVEL ZK**: Proves assurance level ≥ minimum without revealing exact level

ZK proofs provide the same disclosure guarantees as legacy mode but with **stronger cryptographic privacy assurances** - the verifier cannot learn underlying values even if the proof protocol is compromised.

## Implementation Requirements

### Runtime Validation
Verifiers MUST reject proofs that violate minimal disclosure:
- Claims with non-boolean values for AGE_OVER/KYC_LEVEL
- Evidence containing forbidden fields
- Any raw personal data in claim values

### Test Requirements
All implementations MUST include tests that:
- Reject proofs with raw values (age numbers, exact KYC levels)
- Reject proofs with forbidden evidence fields
- Accept only minimal boolean/string responses

### Backwards Compatibility
Legacy signed predicate proofs remain supported but SHOULD be migrated to ZK proofs when available for enhanced privacy.