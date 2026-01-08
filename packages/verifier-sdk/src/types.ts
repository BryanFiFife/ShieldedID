/** Supported claim types for Phase 1. */
export type ClaimType = "AGE_OVER" | "KYC_LEVEL" | "CONTINUITY" | "CUSTOM";

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

/** Requested claim constraints. */
export interface RequestedClaim {
  type: ClaimType;
  threshold?: number;
  minLevel?: number;
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

/** Proof response returned by a wallet. */
export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  claims: Claim[];
  suite: string;
  signature: string;
  // ZK proof fields for age verification
  zkProof?: {
    commitment: string;    // base64
    bulletproof: string;   // base64
    publicInputs: string;  // base64
  };
  // ZK proof fields for KYC verification
  kycZkProof?: {
    commitment: string;    // base64
    bulletproof: string;   // base64
    publicInputs: string;  // base64
    minLevel: number;
  };
}

/** Individual claim in a proof response. */
export interface Claim {
  type: ClaimType;
  value: boolean | number;
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
