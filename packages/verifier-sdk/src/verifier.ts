import * as QRCode from "qrcode";
import { RegistryClient, type WalletStatusResponse } from "./registry.js";
import type {
  Claim,
  NumericCommitmentAttestation,
  ProofRequest,
  ProofResponse,
  RequestedClaim,
  VerificationOptions,
  VerificationResult,
  VerifierConfig,
  ZkProofEntry
} from "./types.js";
import { canonicalPayload, validateNonce, validateTimestamp, verifyECDSAP256 } from "./crypto.js";
import { addSeconds, base64UrlDecode, base64UrlEncode, nowIso, stableStringify } from "./utils.js";
import {
  source_commitment_from_public_inputs,
  verify_ge_components,
  verify_le_components
} from "@shielded-id/age-zk";

function ensureRandomUUID(): string {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj?.randomUUID) throw new Error("RANDOM_UUID_NOT_AVAILABLE");
  return cryptoObj.randomUUID();
}

function randomNonce(bytes = 32): string {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj?.getRandomValues) throw new Error("RANDOM_NOT_AVAILABLE");
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

function findSigningKey(
  keys: WalletStatusResponse["keys"],
  requiredKeyId?: string
): JsonWebKey | null {
  if (!keys || !requiredKeyId) return null;
  const active = keys.find((key) => key.keyId === requiredKeyId && key.status !== "REVOKED");
  return active?.publicKey ?? active?.keyMaterial ?? null;
}

function cutoffYyyymmdd(age: number, at: Date): number {
  if (!Number.isInteger(age) || age < 0 || age > 150 || !Number.isFinite(at.getTime())) {
    throw new Error("INVALID_AGE_THRESHOLD");
  }
  const year = at.getUTCFullYear() - age;
  const month = at.getUTCMonth();
  const day = at.getUTCDate();
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return year * 10000 + (month + 1) * 100 + Math.min(day, maxDay);
}

function computeAssuranceLevel(claims: Claim[], request: ProofRequest): number {
  const index = request.requestedClaims.findIndex((item) => item.type === "KYC_LEVEL");
  if (index < 0 || claims[index]?.type !== "KYC_LEVEL" || claims[index].value !== true) return 0;
  return request.requestedClaims[index].minLevel ?? 1;
}

function validateClaimValues(claims: Claim[]): boolean {
  return claims.every((claim) => {
    if (claim.type === "CONTINUITY") return typeof claim.value === "string" && claim.value.length >= 16;
    return claim.value === true;
  });
}

function validateMinimalDisclosure(claims: Claim[]): boolean {
  return claims.every((claim) => {
    if (claim.type === "CONTINUITY") return !claim.evidence && !claim.issuer;
    if (claim.value !== true) return false;
    const attestation = claim.evidence?.commitmentAttestation;
    if (!attestation) return false;
    const allowed = new Set([
      "version", "credentialId", "attribute", "commitment", "issuerDid",
      "keyId", "issuedAt", "expiresAt", "signature"
    ]);
    return Object.keys(attestation).every((key) => allowed.has(key));
  });
}

function validateClaimsAgainstRequest(requested: RequestedClaim[], claims: Claim[]): boolean {
  if (requested.length !== claims.length) return false;
  return requested.every((req, index) => {
    const claim = claims[index];
    if (!claim || claim.type !== req.type) return false;
    if (req.type === "CONTINUITY") return typeof claim.value === "string" && !claim.operator;
    if (req.type === "AGE_OVER") return claim.value === true && claim.operator === "LE";
    if (req.type === "KYC_LEVEL") return claim.value === true && claim.operator === "GE";
    return false;
  });
}

function hasForbiddenEvidence(claim: Claim, forbidden: string[]): boolean {
  const text = JSON.stringify(claim.evidence ?? {}).toLowerCase();
  return forbidden.some((term) => text.includes(`"${term.toLowerCase()}"`));
}

function isNotExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && Date.now() <= expiry;
}

function unsignedAttestation(attestation: NumericCommitmentAttestation) {
  const { signature: _signature, ...unsigned } = attestation;
  return unsigned;
}

function validateAttestationShape(
  attestation: NumericCommitmentAttestation,
  expectedAttribute: "DOB_YYYYMMDD" | "KYC_LEVEL"
): boolean {
  if (attestation.version !== "SID-COMMITMENT-1" || attestation.attribute !== expectedAttribute) return false;
  if (!attestation.credentialId || !attestation.commitment || !attestation.issuerDid || !attestation.keyId || !attestation.signature) return false;
  const issued = Date.parse(attestation.issuedAt);
  const expires = Date.parse(attestation.expiresAt);
  return Number.isFinite(issued) && Number.isFinite(expires) && issued <= Date.now() + 30_000 && expires > Date.now() && expires > issued;
}

export {
  ensureRandomUUID,
  randomNonce,
  buildProofLink,
  findSigningKey,
  cutoffYyyymmdd,
  computeAssuranceLevel,
  validateClaimValues,
  validateMinimalDisclosure,
  validateClaimsAgainstRequest,
  hasForbiddenEvidence,
  isNotExpired
};

export class ShieldedVerifier {
  private readonly origin: string;
  private readonly registryClient: RegistryClient;
  private readonly metrics = {
    verificationTimes: [] as number[],
    registryCallTimes: [] as number[],
    zkVerificationTimes: [] as number[]
  };

  constructor(config: VerifierConfig) {
    this.origin = config.origin.replace(/\/$/, "");
    this.registryClient = new RegistryClient({
      registryUrl: (config.registryUrl ?? config.origin).replace(/\/$/, "")
    });
  }

  createProofRequest(options: {
    requestedClaims: ProofRequest["requestedClaims"];
    policy: ProofRequest["policy"];
    callback: ProofRequest["callback"];
  }): ProofRequest {
    if (!Number.isFinite(options.policy.maxAgeSeconds) || options.policy.maxAgeSeconds <= 0) {
      throw new Error("INVALID_MAX_AGE_SECONDS");
    }
    for (const claim of options.requestedClaims) {
      if (claim.type === "AGE_OVER" && claim.threshold !== undefined && (!Number.isInteger(claim.threshold) || claim.threshold < 0 || claim.threshold > 150)) {
        throw new Error("INVALID_AGE_THRESHOLD");
      }
      if (claim.type === "KYC_LEVEL" && claim.minLevel !== undefined && (!Number.isInteger(claim.minLevel) || claim.minLevel < 0 || claim.minLevel > 5)) {
        throw new Error("INVALID_KYC_THRESHOLD");
      }
      if (claim.type === "AGE_OVER" && claim.operator && claim.operator !== "LE") throw new Error("AGE_OVER_OPERATOR_MUST_BE_LE");
      if (claim.type === "KYC_LEVEL" && claim.operator && claim.operator !== "GE") throw new Error("KYC_LEVEL_OPERATOR_MUST_BE_GE");
    }

    const issuedAt = nowIso();
    return {
      requestId: ensureRandomUUID(),
      nonce: randomNonce(),
      issuedAt,
      expiresAt: addSeconds(issuedAt, options.policy.maxAgeSeconds),
      verifierOrigin: this.origin,
      requestedClaims: options.requestedClaims,
      policy: options.policy,
      callback: options.callback
    };
  }

  async generateQR(request: ProofRequest): Promise<string> {
    return QRCode.toDataURL(buildProofLink(request), { margin: 1, width: 320 });
  }

  generateDeepLink(request: ProofRequest): string {
    return buildProofLink(request);
  }

  async verifyProof(
    request: ProofRequest,
    proofResponse: ProofResponse,
    options: VerificationOptions = { checkRevocation: true }
  ): Promise<VerificationResult> {
    const start = performance.now();
    const verifiedAt = nowIso();
    const fail = (reason: string, details?: Record<string, unknown>): VerificationResult => {
      this.metrics.verificationTimes.push(performance.now() - start);
      return { valid: false, reason, details, verifiedAt };
    };

    try {
      if (request.verifierOrigin.replace(/\/$/, "") !== this.origin) return fail("VERIFIER_ORIGIN_MISMATCH");
      if (!validateTimestamp(request.issuedAt, request.expiresAt, request.policy.maxAgeSeconds)) return fail("REQUEST_EXPIRED");
      if (!validateNonce(request.nonce, proofResponse.nonce)) return fail("NONCE_MISMATCH");
      if (request.requestId !== proofResponse.requestId) return fail("REQUEST_ID_MISMATCH");
      if (!proofResponse.walletId || !proofResponse.keyId || !proofResponse.pairwiseSubjectId) return fail("MALFORMED_RESPONSE");
      if (!validateClaimValues(proofResponse.claims)) return fail("INVALID_CLAIM_VALUE");
      if (!validateMinimalDisclosure(proofResponse.claims)) return fail("MINIMAL_DISCLOSURE_VIOLATION");
      if (!validateClaimsAgainstRequest(request.requestedClaims, proofResponse.claims)) return fail("CLAIM_POLICY_MISMATCH");

      const requiresZk = request.requestedClaims.some((claim) => claim.type === "AGE_OVER" || claim.type === "KYC_LEVEL");
      if (requiresZk && proofResponse.suite !== "BULLETPROOFS_RISTRETTO_BOUND_V2") return fail("UNSUPPORTED_SUITE");
      if (!requiresZk && proofResponse.suite !== "ECDSA_P256_SHA256_1.0.0") return fail("UNSUPPORTED_SUITE");
      if (requiresZk && (!proofResponse.zkProofs || Object.keys(proofResponse.zkProofs).length === 0)) return fail("MISSING_ZK_PROOF");
      if (!requiresZk && proofResponse.zkProofs) return fail("UNEXPECTED_ZK_PROOF");

      const registryStart = performance.now();
      const walletStatus = await this.registryClient.getWalletStatus(proofResponse.walletId);
      this.metrics.registryCallTimes.push(performance.now() - registryStart);
      if (!walletStatus) return fail("WALLET_NOT_FOUND");
      if (walletStatus.status !== "ACTIVE") return fail("WALLET_NOT_ACTIVE");
      const walletKey = findSigningKey(walletStatus.keys, proofResponse.keyId);
      if (!walletKey) return fail("NO_ACTIVE_MATCHING_KEY");

      // Authenticate the wallet before spending CPU on ZK verification.
      const responsePayload = { ...proofResponse } as Record<string, unknown>;
      delete responsePayload.signature;
      if (!await verifyECDSAP256(walletKey, canonicalPayload(responsePayload), proofResponse.signature)) {
        return fail("INVALID_WALLET_SIGNATURE");
      }

      if (request.policy.requireStatusCheck || options.checkRevocation) {
        const statusStart = performance.now();
        const status = await this.registryClient.getKeyStatusViaNewEndpoint(proofResponse.keyId);
        this.metrics.registryCallTimes.push(performance.now() - statusStart);
        if (status.revoked) return fail("KEY_REVOKED");
        if (status.expired) return fail("KEY_EXPIRED");
      }

      if (requiresZk) {
        const zkStart = performance.now();
        const valid = await this.verifyZkClaims(request, proofResponse);
        this.metrics.zkVerificationTimes.push(performance.now() - zkStart);
        if (!valid) return fail("ZK_OR_ISSUER_PROOF_INVALID");
      }

      for (const claim of proofResponse.claims) {
        if (claim.expiresAt && !isNotExpired(claim.expiresAt)) return fail("CLAIM_EXPIRED");
        if (request.policy.forbidPII && hasForbiddenEvidence(claim, request.policy.forbidPII)) return fail("PII_DETECTED");
      }

      this.metrics.verificationTimes.push(performance.now() - start);
      return {
        valid: true,
        pairwiseSubjectId: proofResponse.pairwiseSubjectId,
        assuranceLevel: computeAssuranceLevel(proofResponse.claims, request),
        verifiedAt
      };
    } catch (err) {
      return fail("VERIFICATION_ERROR", { error: err instanceof Error ? err.message : "unknown" });
    }
  }

  private async verifyZkClaims(request: ProofRequest, response: ProofResponse): Promise<boolean> {
    const proofs = response.zkProofs ?? {};
    const expectedProofCount = request.requestedClaims.filter((claim) => claim.type !== "CONTINUITY").length;
    if (Object.keys(proofs).length !== expectedProofCount) return false;
    const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`;

    for (let index = 0; index < request.requestedClaims.length; index += 1) {
      const requested = request.requestedClaims[index];
      const claim = response.claims[index];
      if (requested.type === "CONTINUITY") {
        if (proofs[index]) return false;
        if (claim.value !== response.pairwiseSubjectId) return false;
        continue;
      }

      const zkProof = proofs[index];
      if (!zkProof || zkProof.claimType !== requested.type) return false;
      if (!await this.verifyIssuerBoundProof(requested, request, claim, zkProof, context)) return false;
    }
    return true;
  }

  private async verifyIssuerBoundProof(
    requested: RequestedClaim,
    request: ProofRequest,
    claim: Claim,
    zkProof: ZkProofEntry,
    context: string
  ): Promise<boolean> {
    const attestation = claim.evidence?.commitmentAttestation;
    if (!attestation || !claim.issuer) return false;
    const expectedAttribute = requested.type === "AGE_OVER" ? "DOB_YYYYMMDD" : "KYC_LEVEL";
    if (!validateAttestationShape(attestation, expectedAttribute)) return false;
    if (
      claim.issuer.did !== attestation.issuerDid ||
      claim.issuer.keyId !== attestation.keyId ||
      claim.issuer.signature !== attestation.signature ||
      claim.expiresAt !== attestation.expiresAt
    ) return false;

    const issuerKey = await this.registryClient.getIssuerKey(attestation.issuerDid, attestation.keyId);
    if (issuerKey.status !== "ACTIVE") return false;
    if (!await verifyECDSAP256(
      issuerKey.publicKey,
      stableStringify(unsignedAttestation(attestation)),
      attestation.signature
    )) return false;

    let commitment: Uint8Array;
    let proof: Uint8Array;
    let publicInputs: Uint8Array;
    try {
      commitment = base64UrlDecode(zkProof.commitment);
      proof = base64UrlDecode(zkProof.bulletproof);
      publicInputs = base64UrlDecode(zkProof.publicInputs);
    } catch {
      return false;
    }
    if (commitment.length !== 32 || proof.length < 100 || publicInputs.length < 20) return false;

    const sourceCommitment = await source_commitment_from_public_inputs(publicInputs);
    if (base64UrlEncode(sourceCommitment) !== attestation.commitment) return false;

    if (requested.type === "AGE_OVER") {
      if (zkProof.operator !== "LE" || claim.operator !== "LE") return false;
      const threshold = requested.threshold ?? 18;
      const cutoff = cutoffYyyymmdd(threshold, new Date(request.issuedAt));
      return verify_le_components(commitment, proof, publicInputs, cutoff, context);
    }

    if (requested.type === "KYC_LEVEL") {
      if (zkProof.operator !== "GE" || claim.operator !== "GE") return false;
      const minLevel = requested.minLevel ?? 1;
      return verify_ge_components(commitment, proof, publicInputs, minLevel, context);
    }

    return false;
  }

  async checkRevocation(keyId: string) {
    return this.registryClient.getKeyStatusViaNewEndpoint(keyId);
  }

  getMetrics() {
    const average = (values: number[]) => values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
      : 0;
    return {
      verificationCount: this.metrics.verificationTimes.length,
      avgVerificationMs: average(this.metrics.verificationTimes),
      registryCallCount: this.metrics.registryCallTimes.length,
      avgRegistryCallMs: average(this.metrics.registryCallTimes),
      zkVerificationCount: this.metrics.zkVerificationTimes.length,
      avgZkVerificationMs: average(this.metrics.zkVerificationTimes)
    };
  }

  resetForTesting(): void {
    this.registryClient.resetCircuitBreaker();
  }
}
