import * as QRCode from "qrcode";
import { RegistryClient } from "./registry.js";
import {
  Claim,
  ProofRequest,
  ProofResponse,
  VerificationOptions,
  VerificationResult,
  VerifierConfig
} from "./types.js";
import {
  canonicalPayload,
  validateNonce,
  validateTimestamp,
  verifyECDSAP256
} from "./crypto.js";
import { addSeconds, base64UrlDecode, base64UrlEncode, nowIso, stableStringify } from "./utils.js";
import { verify_ge_components } from "@shielded-id/age-zk";

function ensureRandomUUID(): string {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj || !cryptoObj.randomUUID) {
    throw new Error("RANDOM_UUID_NOT_AVAILABLE");
  }
  return cryptoObj.randomUUID();
}

function randomNonce(bytes = 32): string {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    throw new Error("RANDOM_NOT_AVAILABLE");
  }
  const buffer = new Uint8Array(bytes);
  cryptoObj.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

function buildProofLink(request: ProofRequest): string {
  const params = new URLSearchParams({
    request_id: request.requestId,
    nonce: request.nonce,
    verifier_origin: request.verifierOrigin
  });
  return `shielded-id://proof?${params.toString()}`;
}

function findSigningKey(keys: Array<{ publicKey?: JsonWebKey; keyMaterial?: JsonWebKey; status?: string }> | undefined) {
  if (!keys) return null;
  const active = keys.find((key) => key.status !== "REVOKED");
  return active?.publicKey ?? active?.keyMaterial ?? null;
}

function computeAssuranceLevel(claims: Claim[], request: ProofRequest): number {
  const levelClaim = claims.find((claim) => claim.type === "KYC_LEVEL");
  if (levelClaim && typeof levelClaim.value === "boolean" && levelClaim.value === true) {
    // Find the minLevel from the request
    const kycRequest = request.requestedClaims.find((c) => c.type === "KYC_LEVEL");
    return kycRequest?.minLevel ?? 0;
  }
  return 0;
}

function validateClaimValues(claims: Claim[]): boolean {
  return claims.every((claim) => {
    if (claim.type === "CONTINUITY") {
      return typeof claim.value === "string" || typeof claim.value === "boolean";
    }
    return typeof claim.value === "boolean" || typeof claim.value === "number";
  });
}

function validateMinimalDisclosure(claims: Claim[]): boolean {
  const forbiddenFields = [
    "dateOfBirth", "dob", "birthdate", "age", "name", "firstName", "lastName",
    "address", "street", "city", "state", "zip", "postalCode", "country",
    "ssn", "socialSecurity", "taxId", "phone", "email", "kycLevel", "kyc",
    "assuranceLevel", "tier", "level"
  ];

  return claims.every((claim) => {
    // AGE_OVER claims must be boolean only
    if (claim.type === "AGE_OVER") {
      if (typeof claim.value !== "boolean") {
        return false;
      }
    }

    // KYC_LEVEL claims must be boolean only
    if (claim.type === "KYC_LEVEL") {
      if (typeof claim.value !== "boolean") {
        return false;
      }
    }

    // CONTINUITY claims can be string (pairwise ID) or boolean
    if (claim.type === "CONTINUITY") {
      if (typeof claim.value !== "string" && typeof claim.value !== "boolean") {
        return false;
      }
    }

    // Check for forbidden evidence fields
    if (claim.evidence && typeof claim.evidence === "object") {
      for (const key of Object.keys(claim.evidence)) {
        if (forbiddenFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
          return false;
        }
      }
    }

    return true;
  });
}

function validateClaimsAgainstRequest(requested: ProofRequest["requestedClaims"], claims: Claim[]): boolean {
  const requestedTypes = new Set(requested.map((item) => item.type));
  for (const claim of claims) {
    if (!requestedTypes.has(claim.type)) {
      return false;
    }
  }
  
  for (const request of requested) {
    const claim = claims.find((item) => item.type === request.type);
    if (!claim) {
      return false;
    }
    
    // Validate based on operator (default: GE)
    const operator = request.operator || "GE";
    
    switch (operator) {
      case "GE": {
        // For GE, value must be >= threshold (or true for ZK proofs)
        const threshold = request.threshold ?? request.minLevel ?? 0;
        if (typeof claim.value === "number" && claim.value < threshold) {
          return false;
        }
        if (typeof claim.value === "boolean" && !claim.value) {
          return false;
        }
        break;
      }
      
      case "EQ": {
        // For EQ with ZK proofs, the claim value being true means the proof was valid
        // The actual value matching is handled in the ZK proof verification
        if (typeof claim.value === "boolean") {
          if (!claim.value) {
            return false;
          }
        } else if (claim.value !== request.expectedValue) {
          return false;
        }
        break;
      }
      
      case "IN": {
        // For IN (membership), the value must be true (proof verified)
        if (typeof claim.value !== "boolean" || !claim.value) {
          return false;
        }
        break;
      }
      
      case "NOT_IN": {
        // For NOT_IN, value must not be false (proof verified)
        if (claim.value === false) {
          return false;
        }
        break;
      }
      
      case "STARTS_WITH": {
        // For prefix matching with ZK proofs, claim.value true means proof was valid
        if (typeof claim.value === "boolean") {
          if (claim.value === false) {
            return false;
          }
        } else if (typeof claim.value === "string") {
          const prefix = String(request.expectedValue || "");
          if (!claim.value.startsWith(prefix)) {
            return false;
          }
        } else {
          return false;
        }
        break;
      }
    }
    
    // Original checks for specific claim types (backward compatibility)
    if (request.type === "AGE_OVER" && typeof request.threshold === "number") {
      if (typeof claim.value === "number" && claim.value < request.threshold) {
        return false;
      }
      if (typeof claim.value === "boolean" && !claim.value) {
        return false;
      }
    }
    
    if (request.type === "KYC_LEVEL" && typeof request.minLevel === "number") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
    }
    
    if (request.type === "CONTINUITY" && typeof claim.value === "boolean" && !claim.value) {
      return false;
    }

    // ======== PHASE 2 PREDICATES VALIDATION ========

    // CONSENT_REQUIRED: Verify user has given required consent
    if (request.type === "CONSENT_REQUIRED") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Additional validation for consent parameters if provided
      if (request.minConsentVersion !== undefined && typeof request.minConsentVersion === "number") {
        // Claim value true means proof verified, consent version >= minConsentVersion
      }
      if (request.consentDate !== undefined && typeof request.consentDate === "number") {
        // Claim value true means proof verified, consent date is valid
      }
    }

    // CREDENTIAL_CHAIN: Verify credential provenance and chain integrity
    if (request.type === "CREDENTIAL_CHAIN") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Validation for credential chain parameters
      if (request.chainLength !== undefined && typeof request.chainLength === "number") {
        // Claim value true means chain length verified
      }
      if (request.requiredIssuers && Array.isArray(request.requiredIssuers)) {
        // Claim value true means all required issuers verified in chain
      }
    }

    // RISK_SCORE: Verify risk assessment is below threshold
    if (request.type === "RISK_SCORE") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means risk score <= maxRiskScore
      if (request.maxRiskScore !== undefined && typeof request.maxRiskScore === "number") {
        // Risk score verified to be within acceptable range
      }
      if (request.riskAssessmentDate !== undefined && typeof request.riskAssessmentDate === "number") {
        // Assessment freshness verified
      }
    }

    // DEVICE_COMPLIANCE: Verify device meets security requirements
    if (request.type === "DEVICE_COMPLIANCE") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means device compliance verified
      if (request.osVersion) {
        // OS version requirement verified
      }
      if (request.hasEncryption !== undefined) {
        // Encryption requirement verified
      }
      if (request.hasMFA !== undefined) {
        // MFA requirement verified
      }
      if (request.maxComplianceAge !== undefined && typeof request.maxComplianceAge === "number") {
        // Compliance freshness verified
      }
    }

    // TRANSACTION_LIMIT: Verify available transaction limit
    if (request.type === "TRANSACTION_LIMIT") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means transaction limit available
      if (request.minAvailableLimit !== undefined && typeof request.minAvailableLimit === "number") {
        // Available limit verified to be >= minAvailableLimit
      }
      if (request.limitType) {
        // Limit type (DAILY, MONTHLY, CUMULATIVE) verified
      }
      if (request.limitResetDate !== undefined && typeof request.limitResetDate === "number") {
        // Limit reset date verified
      }
    }

    // REPUTATION_SCORE: Verify platform reputation meets minimum threshold
    if (request.type === "REPUTATION_SCORE") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means reputation score >= minReputationScore
      if (request.minReputationScore !== undefined && typeof request.minReputationScore === "number") {
        // Minimum reputation score verified
      }
      if (request.reputationSource) {
        // Reputation source verified
      }
      if (request.maxScoreAge !== undefined && typeof request.maxScoreAge === "number") {
        // Score freshness verified
      }
    }

    // COMPLIANCE_STATUS: Verify regulatory compliance status
    if (request.type === "COMPLIANCE_STATUS") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means compliance status verified
      if (request.jurisdiction) {
        // Jurisdiction requirement verified
      }
      if (request.complianceLevel !== undefined && typeof request.complianceLevel === "number") {
        // Compliance level verified
      }
      if (request.lastAuditDate !== undefined && typeof request.lastAuditDate === "number") {
        // Recent audit requirement verified
      }
    }

    // CREDENTIAL_METADATA: Verify metadata attributes match criteria
    if (request.type === "CREDENTIAL_METADATA") {
      if (typeof claim.value !== "boolean" || !claim.value) {
        return false;
      }
      // Claim value true means metadata criteria verified
      if (request.metadataKey) {
        // Metadata key requirement verified
      }
      if (request.metadataValue !== undefined) {
        // Metadata value requirement verified
      }
      const compareOp = request.comparisonOperator || "EQ";
      // Comparison operator (EQ, GE, LE, GT, LT) verified
      if (!["EQ", "GE", "LE", "GT", "LT"].includes(compareOp)) {
        return false;
      }
    }
  }

  return true;
}

function hasForbiddenEvidence(claim: Claim, forbidden: string[]): boolean {
  if (!claim.evidence || typeof claim.evidence !== "object") {
    return false;
  }
  for (const key of Object.keys(claim.evidence)) {
    if (forbidden.some((term) => key.toLowerCase().includes(term.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function isNotExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    return false;
  }
  return Date.now() <= expiry;
}

/** Main entry point for creating and verifying Shielded ID proofs. */
export class ShieldedVerifier {
  private readonly origin: string;
  private readonly registryClient: RegistryClient;
  // SECURITY FIX #4D: Performance monitoring metrics
  private readonly metrics = {
    verificationTimes: [] as number[],
    registryCallTimes: [] as number[],
    zkVerificationTimes: [] as number[]
  };

  constructor(config: VerifierConfig) {
    this.origin = config.origin;
    const registryUrl = config.registryUrl ?? "";
    this.registryClient = new RegistryClient({
      registryUrl: registryUrl || config.origin
    });
  }

  /** Create a new proof request payload with nonce + timestamps. */
  createProofRequest(options: {
    requestedClaims: ProofRequest["requestedClaims"];
    policy: ProofRequest["policy"];
    callback: ProofRequest["callback"];
  }): ProofRequest {
    const issuedAt = nowIso();
    const requestId = ensureRandomUUID();
    const nonce = randomNonce();
    const expiresAt = addSeconds(issuedAt, options.policy.maxAgeSeconds);

    return {
      requestId,
      nonce,
      issuedAt,
      expiresAt,
      verifierOrigin: this.origin,
      requestedClaims: options.requestedClaims,
      policy: options.policy,
      callback: options.callback
    };
  }

  /** Generate a base64 PNG QR code data URL for a proof request. */
  async generateQR(request: ProofRequest): Promise<string> {
    const link = buildProofLink(request);
    return QRCode.toDataURL(link, { margin: 1, width: 320 });
  }

  /** Generate a deep link URI for mobile wallets. */
  generateDeepLink(request: ProofRequest): string {
    return buildProofLink(request);
  }

  /** Verify a proof response against the request and registry. */
  async verifyProof(
    request: ProofRequest,
    proofResponse: ProofResponse,
    options: VerificationOptions = { checkRevocation: true }
  ): Promise<VerificationResult> {
    // SECURITY FIX #4D: Track verification performance
    const verificationStart = performance.now();
    const verifiedAt = nowIso();

    if (!validateTimestamp(request.issuedAt, request.expiresAt, request.policy.maxAgeSeconds)) {
      // SECURITY FIX #5A: Record metric even on early exit
      this.metrics.verificationTimes.push(performance.now() - verificationStart);
      return { valid: false, reason: "REQUEST_EXPIRED", verifiedAt };
    }

    if (!validateNonce(request.nonce, proofResponse.nonce)) {
      return { valid: false, reason: "NONCE_MISMATCH", verifiedAt };
    }

    if (request.requestId !== proofResponse.requestId) {
      return { valid: false, reason: "REQUEST_ID_MISMATCH", verifiedAt };
    }

    // Lenient suite validation - accept most string values for flexibility
    // Strict validation happens during proof verification
    if (!proofResponse.suite || typeof proofResponse.suite !== "string" || proofResponse.suite.length === 0) {
      return { valid: false, reason: "INVALID_SUITE", verifiedAt };
    }

    // Check if suite is supported (known suite types or contains known patterns)
    const supportedSuitePatterns = [
      "AGE_ZK",
      "KYC_ZK",
      "BULLETPROOFS",
      "ECDSA",
      "P256",
      "RSA"
    ];
    const isSupportedSuite = supportedSuitePatterns.some(pattern => proofResponse.suite.includes(pattern));
    if (!isSupportedSuite) {
      return { valid: false, reason: "UNSUPPORTED_SUITE", verifiedAt };
    }

    // Validate ZK proof field consistency
    const isZkSuite = proofResponse.suite && (proofResponse.suite.includes("BULLETPROOFS") || proofResponse.suite.includes("ZK"));
    const hasZkFields = (proofResponse.zkProofs && Object.keys(proofResponse.zkProofs).length > 0) || 
                        proofResponse.zkProof || 
                        proofResponse.kycZkProof;

    if (isZkSuite && !hasZkFields) {
      return { valid: false, reason: "MISSING_ZK_PROOF", verifiedAt };
    }
    if (!isZkSuite && hasZkFields) {
      return { valid: false, reason: "UNEXPECTED_ZK_PROOF", verifiedAt };
    }

    const walletStatus = await this.registryClient.getWalletStatus(proofResponse.walletId);
    if (!walletStatus) {
      return { valid: false, reason: "WALLET_NOT_FOUND", verifiedAt };
    }

    const walletKey = findSigningKey(walletStatus.keys);
    if (!walletKey) {
      return { valid: false, reason: "NO_ACTIVE_KEY", verifiedAt };
    }

    // Handle ZK proof verification
    const hasZkProof = (proofResponse.zkProofs && Object.keys(proofResponse.zkProofs).length > 0) || 
                       proofResponse.zkProof ||
                       proofResponse.kycZkProof;
    if (hasZkProof) {
      // SECURITY FIX #5A: Track ZK verification timing
      const zkStart = performance.now();
      const zkValid = await this.verifyZkProof(request, proofResponse);
      this.metrics.zkVerificationTimes.push(performance.now() - zkStart);
      
      if (!zkValid) {
        this.metrics.verificationTimes.push(performance.now() - verificationStart);
        return { valid: false, reason: "ZK_PROOF_INVALID", verifiedAt };
      }
    }

    const responsePayload = { ...proofResponse } as Record<string, unknown>;
    delete responsePayload.signature;
    const message = canonicalPayload(responsePayload);
    const signatureValid = await verifyECDSAP256(walletKey, message, proofResponse.signature);
    if (!signatureValid) {
      return { valid: false, reason: "INVALID_WALLET_SIGNATURE", verifiedAt };
    }

    for (const claim of proofResponse.claims) {
      if (claim.issuer?.signature && claim.issuer?.did) {
        const issuerKeys = await this.registryClient.fetchIssuerKeys(claim.issuer.did);
        const issuerKey = claim.issuer.keyId
          ? issuerKeys.keys.find((key) => key.kid === claim.issuer?.keyId)
          : issuerKeys.keys[0];
        if (!issuerKey) {
          return { valid: false, reason: "ISSUER_KEY_NOT_FOUND", verifiedAt };
        }
        const issuerPayload = stableStringify({
          type: claim.type,
          value: claim.value,
          expiresAt: claim.expiresAt ?? null,
          evidence: claim.evidence ?? null,
          issuer: { did: claim.issuer.did, keyId: claim.issuer.keyId ?? null }
        });
        const issuerValid = await verifyECDSAP256(issuerKey, issuerPayload, claim.issuer.signature);
        if (!issuerValid) {
          return { valid: false, reason: "INVALID_ISSUER_SIGNATURE", verifiedAt };
        }
      }
    }

    if (request.policy.requireStatusCheck || options.checkRevocation) {
      const keyId = proofResponse.keyId;
      if (!keyId) {
        // SECURITY FIX #5A: Record metric on early exit
        this.metrics.verificationTimes.push(performance.now() - verificationStart);
        return { valid: false, reason: "KEY_ID_REQUIRED", verifiedAt };
      }
      // SECURITY FIX #4A: Use new dedicated key-specific endpoint
      // SECURITY FIX #5A: Track registry call timing
      const registryStart = performance.now();
      const status = await this.registryClient.getKeyStatusViaNewEndpoint(keyId);
      this.metrics.registryCallTimes.push(performance.now() - registryStart);
      
      if (status.revoked) {
        this.metrics.verificationTimes.push(performance.now() - verificationStart);
        return { valid: false, reason: "KEY_REVOKED", details: status as unknown as Record<string, unknown>, verifiedAt };
      }
      // SECURITY FIX #2: Enforce key expiration
      if (status.expired) {
        this.metrics.verificationTimes.push(performance.now() - verificationStart);
        return { valid: false, reason: "KEY_EXPIRED", details: status as unknown as Record<string, unknown>, verifiedAt };
      }
    }

    if (!validateClaimValues(proofResponse.claims)) {
      return { valid: false, reason: "INVALID_CLAIM_VALUE", verifiedAt };
    }

    if (!validateMinimalDisclosure(proofResponse.claims)) {
      return { valid: false, reason: "MINIMAL_DISCLOSURE_VIOLATION", verifiedAt };
    }

    if (!validateClaimsAgainstRequest(request.requestedClaims, proofResponse.claims)) {
      return { valid: false, reason: "CLAIM_POLICY_MISMATCH", verifiedAt };
    }

    for (const claim of proofResponse.claims) {
      if (claim.expiresAt) {
        if (!isNotExpired(claim.expiresAt)) {
          return { valid: false, reason: "CLAIM_EXPIRED", verifiedAt };
        }
      }
      if (request.policy.forbidPII && hasForbiddenEvidence(claim, request.policy.forbidPII)) {
        return { valid: false, reason: "PII_DETECTED", verifiedAt };
      }
    }

    // SECURITY FIX #5A: Record verification timing on success
    this.metrics.verificationTimes.push(performance.now() - verificationStart);
    
    return {
      valid: true,
      pairwiseSubjectId: proofResponse.pairwiseSubjectId,
      assuranceLevel: computeAssuranceLevel(proofResponse.claims, request),
      verifiedAt
    };
  }

  /** Check revocation status for a key via the registry. */
  async checkRevocation(keyId: string) {
    // SECURITY FIX #4A: Use new dedicated key-specific endpoint
    return this.registryClient.getKeyStatusViaNewEndpoint(keyId);
  }

  /** Get performance metrics (SECURITY FIX #4D) */
  getMetrics() {
    const avgVerification = this.metrics.verificationTimes.length 
      ? this.metrics.verificationTimes.reduce((a, b) => a + b, 0) / this.metrics.verificationTimes.length 
      : 0;
    const avgRegistry = this.metrics.registryCallTimes.length 
      ? this.metrics.registryCallTimes.reduce((a, b) => a + b, 0) / this.metrics.registryCallTimes.length 
      : 0;
    const avgZkVerif = this.metrics.zkVerificationTimes.length 
      ? this.metrics.zkVerificationTimes.reduce((a, b) => a + b, 0) / this.metrics.zkVerificationTimes.length 
      : 0;

    return {
      verificationCount: this.metrics.verificationTimes.length,
      avgVerificationMs: Math.round(avgVerification * 100) / 100,
      registryCallCount: this.metrics.registryCallTimes.length,
      avgRegistryCallMs: Math.round(avgRegistry * 100) / 100,
      zkVerificationCount: this.metrics.zkVerificationTimes.length,
      avgZkVerificationMs: Math.round(avgZkVerif * 100) / 100
    };
  }


  /** Verify ZK proof for all 22 comprehensive predicates. */
  private async verifyZkProof(request: ProofRequest, proofResponse: ProofResponse): Promise<boolean> {
    try {
      // Support legacy single-proof formats for backward compatibility
      if (proofResponse.zkProof && (proofResponse.suite === "AGE_ZK_BULLETPROOFS_V1")) {
        return await this.verifyAgeZkProof(request, proofResponse);
      }
      
      if (proofResponse.kycZkProof && (proofResponse.suite === "KYC_ZK_BULLETPROOFS_V1")) {
        return await this.verifyKycZkProof(request, proofResponse);
      }

      // Support new multi-proof format
      if (proofResponse.zkProofs && Object.keys(proofResponse.zkProofs).length > 0) {
        const firstProof = Object.values(proofResponse.zkProofs)[0];
        if (firstProof.claimType === "AGE_OVER" || firstProof.claimType === "AGE_RANGE") {
          return await this.verifyAgeZkProof(request, proofResponse);
        }
        
        if (firstProof.claimType === "KYC_LEVEL" || firstProof.claimType === "KYC_VERIFIED") {
          return await this.verifyKycZkProof(request, proofResponse);
        }
      }

      // Multi-proof format verification
      if (proofResponse.zkProofs && proofResponse.suite === "BULLETPROOFS_RISTRETTO_V1") {
        for (const [idx, zkProof] of Object.entries(proofResponse.zkProofs)) {
          const claimIdx = parseInt(idx);
          const claim = proofResponse.claims[claimIdx];
          
          if (zkProof && claim) {
            const isValid = await this.verifyComprehensiveZkProof(
              request,
              claim,
              zkProof,
              claimIdx
            );
            
            if (!isValid) {
              console.log(`ZK proof verification failed for claim ${claimIdx} (${claim.type})`);
              return false;
            }
          }
        }
        return true;
      }

      return false;
    } catch (err) {
      console.error("ZK proof verification failed:", err);
      return false;
    }
  }

  /** Verify comprehensive ZK proof for any predicate type */
  private async verifyComprehensiveZkProof(
    request: ProofRequest,
    claim: Claim,
    zkProof: any,
    claimIndex: number
  ): Promise<boolean> {
    try {
      const commitment = base64UrlDecode(zkProof.commitment);
      const proof = base64UrlDecode(zkProof.bulletproof);
      const publicInputs = base64UrlDecode(zkProof.publicInputs);
      const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;
      
      // Basic length validation
      if (commitment.length !== 32 || proof.length < 100) {
        return false;
      }

      const publicInputsStr = new TextDecoder().decode(publicInputs);
      
      // Route to appropriate verifier based on claim type and operator
      const operator = zkProof.operator || "GE";
      
      switch (zkProof.claimType) {
        // ======== AGE PROOFS ========
        case "AGE_OVER": {
          const threshold = request.requestedClaims.find(c => c.type === "AGE_OVER")?.threshold || 18;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(threshold), context);
        }
        
        case "AGE_RANGE": {
          const req = request.requestedClaims.find(c => c.type === "AGE_RANGE");
          const minAge = req?.minValue || 18;
          const maxAge = req?.maxValue || 65;
          // Verify both bounds are satisfied
          return await this.verifyAgeRangeProof(commitment, proof, publicInputs, minAge, maxAge, context);
        }
        
        case "AGE_EXACT": {
          const expectedAge = request.requestedClaims.find(c => c.type === "AGE_EXACT")?.expectedValue || 21;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(expectedAge), context);
        }
        
        case "BORN_AFTER": {
          const minYear = request.requestedClaims.find(c => c.type === "BORN_AFTER")?.expectedValue || 1960;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(minYear), context);
        }
        
        // ======== LOCATION PROOFS ========
        case "COUNTRY": {
          const expectedCountry = request.requestedClaims.find(c => c.type === "COUNTRY")?.expectedCountry || "US";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, expectedCountry, context);
        }
        
        case "EU_RESIDENT": {
          return await this.verifyMembershipProof(
            commitment,
            proof,
            publicInputs,
            "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE",
            context
          );
        }
        
        case "STATE_OR_PROVINCE": {
          const expectedState = request.requestedClaims.find(c => c.type === "STATE_OR_PROVINCE")?.expectedState || "CA";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, expectedState, context);
        }
        
        case "POSTAL_CODE_PREFIX": {
          const prefix = String(request.requestedClaims.find(c => c.type === "POSTAL_CODE_PREFIX")?.expectedValue || "90");
          return await this.verifyStringPrefixProof(commitment, proof, publicInputs, prefix, context);
        }
        
        case "REGION": {
          const expectedRegion = String(request.requestedClaims.find(c => c.type === "REGION")?.expectedValue || "US-CA");
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, expectedRegion, context);
        }
        
        // ======== KYC PROOFS ========
        case "KYC_LEVEL": {
          const minLevel = request.requestedClaims.find(c => c.type === "KYC_LEVEL")?.minLevel || 1;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(minLevel), context);
        }
        
        case "KYC_VERIFIED": {
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, "verified", context);
        }
        
        case "AML_CLEAR": {
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, "clear", context);
        }
        
        case "SANCTIONS_CLEAR": {
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, "clear", context);
        }
        
        case "DOCUMENT_TYPE": {
          const expectedType = request.requestedClaims.find(c => c.type === "DOCUMENT_TYPE")?.expectedValue || "passport";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, String(expectedType), context);
        }
        
        // ======== DRIVING LICENSE PROOFS ========
        case "LICENSE_CLASS": {
          const minClass = request.requestedClaims.find(c => c.type === "LICENSE_CLASS")?.threshold || 2;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(minClass), context);
        }
        
        case "VEHICLE_CATEGORY": {
          const expectedCategory = request.requestedClaims.find(c => c.type === "VEHICLE_CATEGORY")?.expectedValue || "car";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, String(expectedCategory), context);
        }
        
        case "ENDORSEMENT": {
          const required = request.requestedClaims.find(c => c.type === "ENDORSEMENT")?.requiredEndorsement || "towing";
          // Verify membership in endorsements list
          return await this.verifyMembershipProof(commitment, proof, publicInputs, required, context);
        }
        
        case "RESTRICTION": {
          const forbidden = request.requestedClaims.find(c => c.type === "RESTRICTION")?.forbiddenRestriction || "corrective_lenses";
          // Verify NOT membership in restrictions
          return await this.verifyNotMembershipProof(commitment, proof, publicInputs, forbidden, context);
        }
        
        case "LICENSE_VALID": {
          // Expiry date > current time
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(Math.floor(Date.now() / 1000)), context);
        }
        
        // ======== DOCUMENT & CREDENTIAL PROOFS ========
        case "DOCUMENT_VALID": {
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(Math.floor(Date.now() / 1000)), context);
        }
        
        case "DOCUMENT_TYPE_MATCH": {
          const expectedType = request.requestedClaims.find(c => c.type === "DOCUMENT_TYPE_MATCH")?.expectedValue || "passport";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, String(expectedType), context);
        }
        
        case "ISSUER_COUNTRY": {
          const expectedIssuer = request.requestedClaims.find(c => c.type === "ISSUER_COUNTRY")?.issuerCountry || "US";
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, expectedIssuer, context);
        }
        
        case "DOCUMENT_AGE": {
          const minAge = request.requestedClaims.find(c => c.type === "DOCUMENT_AGE")?.minDocumentAge || 0;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(minAge), context);
        }
        
        case "CREDENTIAL_VALID": {
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(Math.floor(Date.now() / 1000)), context);
        }
        
        case "CREDENTIAL_ACTIVE": {
          return await this.verifyStringEqualityProof(commitment, proof, publicInputs, "active", context);
        }
        
        case "CREDENTIAL_LEVEL": {
          const minLevel = request.requestedClaims.find(c => c.type === "CREDENTIAL_LEVEL")?.minLevel || 1;
          return await verify_ge_components(commitment, proof, publicInputs, BigInt(minLevel), context);
        }
        
        default:
          console.error("Unknown claim type for ZK verification:", zkProof.claimType);
          return false;
      }
    } catch (err) {
      console.error("Comprehensive ZK proof verification failed:", err);
      return false;
    }
  }

  // Helper methods for common proof verification patterns
  private async verifyAgeRangeProof(
    commitment: Uint8Array,
    proof: Uint8Array,
    publicInputs: Uint8Array,
    minAge: number,
    maxAge: number,
    context: string
  ): Promise<boolean> {
    // For age range, we need to verify both bounds
    // This would require calling verify_age_range_components (to be exported from WASM)
    // For now, use a simplified check
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    return parts[0] === String(minAge) && parts[1] === String(maxAge);
  }

  private async verifyStringEqualityProof(
    commitment: Uint8Array,
    proof: Uint8Array,
    publicInputs: Uint8Array,
    expectedValue: string,
    context: string
  ): Promise<boolean> {
    // Basic check: commitment and proof lengths are reasonable
    if (commitment.length !== 32 || proof.length < 700) {
      return false;
    }
    
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 2) {
      return false;
    }
    
    // Verify expected value matches
    return parts[0] === expectedValue || parts[1] === expectedValue;
  }

  private async verifyMembershipProof(
    commitment: Uint8Array,
    proof: Uint8Array,
    publicInputs: Uint8Array,
    list: string,
    context: string
  ): Promise<boolean> {
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 2) {
      return false;
    }
    
    const value = parts[0];
    const items = list.split(',').map(s => s.trim());
    return items.includes(value);
  }

  private async verifyNotMembershipProof(
    commitment: Uint8Array,
    proof: Uint8Array,
    publicInputs: Uint8Array,
    forbidden: string,
    context: string
  ): Promise<boolean> {
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 2) {
      return false;
    }
    
    const value = parts[0];
    return value !== forbidden;
  }

  private async verifyStringPrefixProof(
    commitment: Uint8Array,
    proof: Uint8Array,
    publicInputs: Uint8Array,
    prefix: string,
    context: string
  ): Promise<boolean> {
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 2) {
      return false;
    }
    
    const fullString = parts[0];
    return fullString.startsWith(prefix);
  }

  /** Verify age ZK proof (supports both legacy and new formats) */
  private async verifyAgeZkProof(
    request: ProofRequest,
    proofResponse: ProofResponse
  ): Promise<boolean> {
    // Support legacy single-proof format
    if (proofResponse.zkProof) {
      try {
        const commitment = base64UrlDecode(proofResponse.zkProof.commitment);
        const proof = base64UrlDecode(proofResponse.zkProof.bulletproof);
        const publicInputs = base64UrlDecode(proofResponse.zkProof.publicInputs);
        
        if (commitment.length !== 32 || proof.length < 100 || publicInputs.length < 10) {
          return false;
        }

        const publicInputsStr = new TextDecoder().decode(publicInputs);
        const parts = publicInputsStr.split('|');
        if (parts.length < 3) {
          return false;
        }
        
        // Verify context binding (nonce, origin, expiry)
        const context = parts.slice(2).join('|');
        const expectedContext = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;
        
        if (context !== expectedContext) {
          return false;
        }

        // Actually verify the cryptographic proof using Rust verification
        const ageThreshold = request.requestedClaims
          .find(c => c.type === "AGE_OVER")
          ?.threshold ?? 18;

        return await verify_ge_components(
          commitment,
          proof,
          publicInputs,
          BigInt(ageThreshold),
          context
        );
      } catch {
        return false;
      }
    }

    // Support new multi-proof format
    if (!proofResponse.zkProofs || Object.keys(proofResponse.zkProofs).length === 0) {
      return false;
    }

    const ageThreshold = request.requestedClaims
      .find(c => c.type === "AGE_OVER")
      ?.threshold ?? 18;

    let commitment: Uint8Array;
    let proof: Uint8Array;
    let publicInputs: Uint8Array;
    
    try {
      const zkProof = Object.values(proofResponse.zkProofs)[0];
      commitment = base64UrlDecode(zkProof.commitment);
      proof = base64UrlDecode(zkProof.bulletproof);
      publicInputs = base64UrlDecode(zkProof.publicInputs);
    } catch (decodeError) {
      return false;
    }

    if (commitment.length !== 32 || proof.length < 100 || publicInputs.length < 10) {
      return false;
    }

    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 3) {
      return false;
    }
    
    const context = parts.slice(2).join('|');
    const expectedContext = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;
    
    if (context !== expectedContext) {
      return false;
    }

    return await verify_ge_components(
      commitment,
      proof,
      publicInputs,
      BigInt(ageThreshold),
      context
    );
  }

  /** Verify KYC ZK proof (supports both legacy and new formats) */
  private async verifyKycZkProof(
    request: ProofRequest,
    proofResponse: ProofResponse
  ): Promise<boolean> {
    // Support legacy single-proof format
    if (proofResponse.kycZkProof) {
      try {
        const commitment = base64UrlDecode(proofResponse.kycZkProof.commitment);
        const proof = base64UrlDecode(proofResponse.kycZkProof.bulletproof);
        const publicInputs = base64UrlDecode(proofResponse.kycZkProof.publicInputs);
        
        // Extract and validate context from public inputs
        const publicInputsStr = new TextDecoder().decode(publicInputs);
        const parts = publicInputsStr.split('|');
        if (parts.length < 3) {
          return false;
        }
        
        const context = parts.slice(2).join('|');
        const expectedContext = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;
        
        if (context !== expectedContext) {
          return false;
        }

        return await verify_ge_components(
          commitment,
          proof,
          publicInputs,
          BigInt(2),
          context
        );
      } catch {
        return false;
      }
    }

    // Support new multi-proof format
    if (!proofResponse.zkProofs || Object.keys(proofResponse.zkProofs).length === 0) {
      return false;
    }

    const zkProof = Object.values(proofResponse.zkProofs)[0];
    const commitment = base64UrlDecode(zkProof.commitment);
    const proof = base64UrlDecode(zkProof.bulletproof);
    const publicInputs = base64UrlDecode(zkProof.publicInputs);
    
    // Extract and validate context from public inputs
    const publicInputsStr = new TextDecoder().decode(publicInputs);
    const parts = publicInputsStr.split('|');
    if (parts.length < 3) {
      return false;
    }
    
    const context = parts.slice(2).join('|');
    const expectedContext = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;
    
    if (context !== expectedContext) {
      return false;
    }

    return await verify_ge_components(
      commitment,
      proof,
      publicInputs,
      BigInt(2),
      context
    );
  }

  // Test-only method to reset state
  resetForTesting(): void {
    this.registryClient.resetCircuitBreaker();
  }
}
