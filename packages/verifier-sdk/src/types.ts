/** Comprehensive claim types supporting 30 global predicates (Phase 1 + Phase 2). */
export type ClaimType = 
  // Age Verification (4 types)
  | "AGE_OVER"
  | "AGE_RANGE"
  | "BORN_AFTER"
  | "AGE_EXACT"
  
  // Location Verification (5 types)
  | "COUNTRY"
  | "EU_RESIDENT"
  | "STATE_OR_PROVINCE"
  | "POSTAL_CODE_PREFIX"
  | "REGION"
  
  // KYC Verification (5 types)
  | "KYC_LEVEL"
  | "KYC_VERIFIED"
  | "AML_CLEAR"
  | "SANCTIONS_CLEAR"
  | "DOCUMENT_TYPE"
  
  // Driving License (5 types)
  | "LICENSE_CLASS"
  | "VEHICLE_CATEGORY"
  | "ENDORSEMENT"
  | "RESTRICTION"
  | "LICENSE_VALID"
  
  // Documents & Credentials (4 types)
  | "DOCUMENT_VALID"
  | "DOCUMENT_TYPE_MATCH"
  | "ISSUER_COUNTRY"
  | "DOCUMENT_AGE"
  | "CREDENTIAL_VALID"
  | "CREDENTIAL_ACTIVE"
  | "CREDENTIAL_LEVEL"
  
  // Phase 2: Advanced Predicates (8 types)
  | "CONSENT_REQUIRED"
  | "CREDENTIAL_CHAIN"
  | "RISK_SCORE"
  | "DEVICE_COMPLIANCE"
  | "TRANSACTION_LIMIT"
  | "REPUTATION_SCORE"
  | "COMPLIANCE_STATUS"
  | "CREDENTIAL_METADATA"
  
  | "CONTINUITY"
  | "CUSTOM";

/** Predicate operators for flexible proof requests */
export type PredicateOperator = 
  | "GE"          // >= (range proofs, threshold)
  | "EQ"          // == (equality)
  | "IN"          // membership in set (EU_RESIDENT)
  | "NOT_IN"      // NOT in set (restrictions)
  | "STARTS_WITH"; // prefix match (postal codes)

/** Verifier proof request sent to wallets. */
export interface ProofRequest {
  requestId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  verifierOrigin: string;
  requestedClaims: RequestedClaim[];
  policy: ProofPolicy;
  callback: ProofCallback;
}

/** Requested claim constraints with comprehensive predicate support. */
export interface RequestedClaim {
  type: ClaimType;
  operator?: PredicateOperator;  // Default: "GE" for range proofs
  
  // For range proofs (AGE_OVER, AGE_RANGE, KYC_LEVEL, LICENSE_CLASS, CREDENTIAL_LEVEL)
  threshold?: number;
  minLevel?: number;
  minValue?: number;
  maxValue?: number;
  
  // For equality/membership/string proofs
  expectedValue?: string | number;
  expectedCountry?: string;
  expectedState?: string;
  expectedProvince?: string;
  requiredEndorsement?: string;
  forbiddenRestriction?: string;
  allowedDocumentType?: string;
  
  // For prefix matching (POSTAL_CODE_PREFIX)
  prefixLength?: number;
  
  // For credential validation
  credentialType?: string;
  issuerDid?: string;
  
  // For document validation
  minDocumentAge?: number;  // timestamp or days
  issuerCountry?: string;
  
  // Phase 2: Advanced predicate parameters
  // For CONSENT_REQUIRED
  consentType?: string;
  consentDate?: number;
  consentVersion?: number;
  minConsentVersion?: number;
  
  // For CREDENTIAL_CHAIN
  chainLength?: number;
  requiredIssuers?: string[];
  
  // For RISK_SCORE, REPUTATION_SCORE, TRANSACTION_LIMIT
  maxRiskScore?: number;
  riskAssessmentDate?: number;
  minAvailableLimit?: number;
  limitResetDate?: number;
  limitType?: "DAILY" | "MONTHLY" | "CUMULATIVE";
  minReputationScore?: number;
  reputationSource?: string;
  maxScoreAge?: number;
  
  // For DEVICE_COMPLIANCE
  osVersion?: string;
  hasEncryption?: boolean;
  hasMFA?: boolean;
  maxComplianceAge?: number;
  
  // For COMPLIANCE_STATUS
  jurisdiction?: string;
  complianceLevel?: number;
  lastAuditDate?: number;
  
  // For CREDENTIAL_METADATA
  metadataKey?: string;
  metadataValue?: string | number;
  comparisonOperator?: "EQ" | "GE" | "LE" | "GT" | "LT";
}

/** Policy enforcing status checks and freshness. */
export interface ProofPolicy {
  requireStatusCheck: boolean;
  maxAgeSeconds: number;
  forbidPII?: string[];
}

/** Callback details for proof delivery. */
export interface ProofCallback {
  method: "POST";
  url: string;
  timeout?: number;
}

/** Proof response returned by a wallet with comprehensive proof support. */
export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  claims: Claim[];
  suite: ProofSuite;
  signature: string;
  // Multiple ZK proofs indexed by claim index (Phase 1 format)
  zkProofs?: {
    [claimIndex: number]: {
      commitment: string;      // base64
      bulletproof: string;     // base64
      publicInputs: string;    // base64
      claimType: ClaimType;
      operator: PredicateOperator;
    };
  };
  // Legacy single-proof format for AGE_OVER (backward compatibility)
  zkProof?: {
    commitment: string;        // base64
    bulletproof: string;       // base64
    publicInputs: string;      // base64
  };
  // Legacy single-proof format for KYC_LEVEL (backward compatibility)
  kycZkProof?: {
    commitment: string;        // base64
    bulletproof: string;       // base64
    publicInputs: string;      // base64
  };
}

export type ProofSuite = 
  | "ECDSA_P256_SHA256_1.0.0"
  | "BULLETPROOFS_RISTRETTO_V1"
  | "COMPOSITE_BULLETPROOFS_V1"
  | "AGE_ZK_BULLETPROOFS_V1"
  | "KYC_ZK_BULLETPROOFS_V1";

/** Individual claim in a proof response with operator info. */
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

/** Result of verifying a proof response. */
export interface VerificationResult {
  valid: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  pairwiseSubjectId?: string;
  assuranceLevel?: number;
  verifiedAt: string;
}

/** Configuration for the verifier SDK. */
export interface VerifierConfig {
  origin: string;
  registryUrl?: string;
  publicKeyUrl?: string;
}

/** Optional verification controls. */
export interface VerificationOptions {
  checkRevocation: boolean;
}
