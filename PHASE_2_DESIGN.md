# Phase 2 Advanced Predicates Design

## Overview
Phase 2 extends the 22 Phase 1 predicates with 8 advanced predicates focused on:
- Complex condition logic (AND, OR, NOT combinations)
- Consent and permissions management
- Credential hierarchies and trust
- Compliance chain tracking
- Time-based and risk-based rules

## Phase 2 Predicates (8 total)

### 1. CONSENT_REQUIRED
**Purpose**: Verify user has given explicit consent for a specific operation
**Parameters**:
- `consentType: string` - Type of consent (e.g., "MARKETING", "DATA_SHARING", "ANALYTICS")
- `consentDate: number` - Unix timestamp of consent
- `consentVersion: number` - Version of consent agreement

**Implementation**:
- Proves user has valid, non-revoked consent
- Verifies consent version matches or exceeds required
- Checks consent hasn't expired

**Example**:
```typescript
{
  type: "CONSENT_REQUIRED",
  consentType: "DATA_SHARING",
  minConsentVersion: 2
}
```

---

### 2. CREDENTIAL_CHAIN
**Purpose**: Verify credential hierarchy (e.g., Issuer A issued to B, B issued to C)
**Parameters**:
- `chainLength: number` - Minimum chain depth required
- `requiredIssuers: string[]` - List of DIDs in the chain

**Implementation**:
- Proves chain of custody for credentials
- Verifies each step in chain with signatures
- Prevents tampering with credential provenance

**Example**:
```typescript
{
  type: "CREDENTIAL_CHAIN",
  chainLength: 2,
  requiredIssuers: ["did:example:issuer1", "did:example:issuer2"]
}
```

---

### 3. RISK_SCORE
**Purpose**: Verify user's risk score is below maximum threshold
**Parameters**:
- `maxRiskScore: number` - Maximum acceptable risk (0-100)
- `riskAssessmentDate: number` - Min timestamp of assessment

**Implementation**:
- Range proof: riskScore <= maxRiskScore
- Verifies assessment is recent
- Prevents replay of old low-risk scores

**Example**:
```typescript
{
  type: "RISK_SCORE",
  maxRiskScore: 30
}
```

---

### 4. DEVICE_COMPLIANCE
**Purpose**: Verify device meets security compliance requirements
**Parameters**:
- `osVersion: string` - Minimum required OS version
- `hasEncryption: boolean` - Whether device has full disk encryption
- `hasMFA: boolean` - Whether MFA is enabled
- `maxComplianceAge: number` - Max age of compliance check in seconds

**Implementation**:
- Proves device attestation
- Verifies security properties without revealing specific device
- Ensures compliance data is fresh

**Example**:
```typescript
{
  type: "DEVICE_COMPLIANCE",
  osVersion: "14.0",
  hasEncryption: true,
  hasMFA: true
}
```

---

### 5. TRANSACTION_LIMIT
**Purpose**: Verify user has available transaction limit
**Parameters**:
- `minAvailableLimit: number` - Minimum required available limit
- `limitResetDate: number` - When limit resets
- `limitType: string` - Type of limit (DAILY, MONTHLY, CUMULATIVE)

**Implementation**:
- Range proof: availableLimit >= minAvailableLimit
- Verifies limit window hasn't reset
- Prevents spending beyond limit

**Example**:
```typescript
{
  type: "TRANSACTION_LIMIT",
  minAvailableLimit: 1000,
  limitType: "DAILY"
}
```

---

### 6. REPUTATION_SCORE
**Purpose**: Verify user has minimum reputation score on platform
**Parameters**:
- `minReputationScore: number` - Minimum required score (0-100)
- `reputationSource: string` - Source of reputation data
- `maxScoreAge: number` - Maximum age of score in seconds

**Implementation**:
- Range proof: reputationScore >= minReputationScore
- Verifies score freshness
- Links to reputation source DID

**Example**:
```typescript
{
  type: "REPUTATION_SCORE",
  minReputationScore: 75,
  reputationSource: "did:example:platform1"
}
```

---

### 7. COMPLIANCE_STATUS
**Purpose**: Verify user is compliant with regulatory requirements
**Parameters**:
- `jurisdiction: string` - Required jurisdiction compliance
- `complianceLevel: number` - Minimum compliance level (1-5)
- `lastAuditDate: number` - Min timestamp of last compliance audit

**Implementation**:
- Proves compliance with specific jurisdiction rules
- Range proof: complianceLevel >= minRequired
- Verifies audit is recent

**Example**:
```typescript
{
  type: "COMPLIANCE_STATUS",
  jurisdiction: "EU",
  complianceLevel: 3
}
```

---

### 8. CREDENTIAL_METADATA
**Purpose**: Verify credential has specific metadata attributes
**Parameters**:
- `metadataKey: string` - Key to check in credential metadata
- `metadataValue: string | number` - Required value
- `operator: "EQ" | "GE" | "LE"` - Comparison operator

**Implementation**:
- Proves metadata exists and matches criteria
- Supports range checks for numeric metadata
- Prevents metadata spoofing

**Example**:
```typescript
{
  type: "CREDENTIAL_METADATA",
  metadataKey: "industry",
  metadataValue: "finance",
  operator: "EQ"
}
```

---

## Implementation Strategy

### Rust Circuits
Each predicate will have:
- **Prove function**: Generates ZK proof
- **Verify function**: Verifies proof components
- **Context binding**: origin|nonce|expiresAt to prevent replays

### TypeScript Verification
- Helper functions for each predicate type
- Integration with existing verifier SDK
- Type-safe claim structures

### Test Coverage
- 50+ new tests for Phase 2 predicates
- Unit tests for each predicate
- Integration tests with Phase 1
- E2E tests for combined predicates

## Coverage Impact
- Current: 86.1% (214 tests)
- Target: 95%+ (with 50+ Phase 2 tests)
- Estimated final: ~280-300 total tests

## Backward Compatibility
- Phase 1 predicates unchanged
- New predicates alongside existing ones
- Gradual migration path for applications

## Security Considerations
1. **Replay Prevention**: All proofs bound to request context
2. **Freshness**: Timestamps verified for time-sensitive proofs
3. **Chain Integrity**: Credential chains verified end-to-end
4. **Metadata Integrity**: Proofs prevent metadata tampering
5. **Risk Isolation**: No cross-predicate information leakage
