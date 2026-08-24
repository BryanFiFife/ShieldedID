/** Production claim surface. Unsupported historical predicate names are rejected fail-closed. */
export type ClaimType = "AGE_OVER" | "KYC_LEVEL" | "CONTINUITY";

/** Cryptographically implemented operators. */
export type PredicateOperator = "GE" | "LE";

export type NumericAttributeCode = "DOB_YYYYMMDD" | "KYC_LEVEL";

export interface NumericCommitmentAttestation {
  version: "SID-COMMITMENT-1";
  credentialId: string;
  attribute: NumericAttributeCode;
  commitment: string;
  issuerDid: string;
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

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

export interface RequestedClaim {
  type: ClaimType;
  operator?: PredicateOperator;
  /** AGE_OVER threshold in whole years, default 18. */
  threshold?: number;
  /** KYC_LEVEL lower bound, integer 0..5. */
  minLevel?: number;
}

export interface ProofPolicy {
  requireStatusCheck: boolean;
  maxAgeSeconds: number;
  forbidPII?: string[];
}

export interface ProofCallback {
  method: "POST";
  url: string;
  timeout?: number;
}

export interface ZkProofEntry {
  commitment: string;
  bulletproof: string;
  publicInputs: string;
  claimType: "AGE_OVER" | "KYC_LEVEL";
  operator: PredicateOperator;
}

export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  claims: Claim[];
  suite: ProofSuite;
  signature: string;
  zkProofs?: Record<number, ZkProofEntry>;
}

export type ProofSuite =
  | "ECDSA_P256_SHA256_1.0.0"
  | "BULLETPROOFS_RISTRETTO_BOUND_V2";

export interface Claim {
  type: ClaimType;
  value: boolean | string;
  operator?: PredicateOperator;
  issuer?: {
    did: string;
    keyId: string;
    signature: string;
  };
  expiresAt?: string;
  evidence?: {
    commitmentAttestation?: NumericCommitmentAttestation;
  };
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  pairwiseSubjectId?: string;
  assuranceLevel?: number;
  verifiedAt: string;
}

export interface VerifierConfig {
  origin: string;
  registryUrl?: string;
}

export interface VerificationOptions {
  checkRevocation: boolean;
}
