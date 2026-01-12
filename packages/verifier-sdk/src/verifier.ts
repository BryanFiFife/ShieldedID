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
import { addSeconds, base64UrlEncode, nowIso, stableStringify } from "./utils.js";
import { verifyGE } from "@shielded-id/age-zk";

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
      return typeof claim.value === "string";
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

    // CONTINUITY claims can be string (pairwise ID)
    if (claim.type === "CONTINUITY") {
      if (typeof claim.value !== "string") {
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
    if (request.type === "AGE_OVER" && typeof request.threshold === "number") {
      if (typeof claim.value === "number" && claim.value < request.threshold) {
        return false;
      }
      if (typeof claim.value === "boolean" && claim.value === false) {
        return false;
      }
    }
    if (request.type === "KYC_LEVEL" && typeof request.minLevel === "number") {
      if (typeof claim.value !== "boolean" || claim.value === false) {
        return false;
      }
    }
    if (request.type === "CONTINUITY" && typeof claim.value === "boolean" && claim.value === false) {
      return false;
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

    if (proofResponse.suite !== "P256" && proofResponse.suite !== "ECDSA_P256_SHA256_1.0.0" && proofResponse.suite !== "AGE_ZK_BULLETPROOFS_V1" && proofResponse.suite !== "KYC_ZK_BULLETPROOFS_V1") {
      return { valid: false, reason: "UNSUPPORTED_SUITE", verifiedAt };
    }

    // Validate ZK proof field consistency
    const isZkSuite = proofResponse.suite === "AGE_ZK_BULLETPROOFS_V1" || proofResponse.suite === "KYC_ZK_BULLETPROOFS_V1";
    const hasZkFields = proofResponse.zkProof || proofResponse.kycZkProof;

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
    if ((proofResponse.suite === "AGE_ZK_BULLETPROOFS_V1" && proofResponse.zkProof) ||
        (proofResponse.suite === "KYC_ZK_BULLETPROOFS_V1" && proofResponse.kycZkProof)) {
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


  /** Verify ZK proof for age or KYC verification. */
  private async verifyZkProof(request: ProofRequest, proofResponse: ProofResponse): Promise<boolean> {
    try {
      if (proofResponse.suite === "AGE_ZK_BULLETPROOFS_V1" && proofResponse.zkProof) {
        // Age ZK proof verification using Bulletproofs
        // SECURITY FIX #2: Use actual threshold from request instead of hardcoded 18
        const ageThreshold = request.requestedClaims
          .find(c => c.type === "AGE_OVER")
          ?.threshold ?? 18; // Fallback to 18 if not specified

        return await verifyGE(
          proofResponse.zkProof.commitment,
          proofResponse.zkProof.bulletproof,
          proofResponse.zkProof.publicInputs,
          ageThreshold
        );
      }

      if (proofResponse.suite === "KYC_ZK_BULLETPROOFS_V1" && proofResponse.kycZkProof) {
        // KYC ZK proof verification using Bulletproofs
        return await verifyGE(
          proofResponse.kycZkProof.commitment,
          proofResponse.kycZkProof.bulletproof,
          proofResponse.kycZkProof.publicInputs,
          proofResponse.kycZkProof.minLevel
        );
      }

      return false;
    } catch (err) {
      console.error("ZK proof verification failed:", err);
      return false;
    }
  }
}
