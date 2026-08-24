import { generatePairwiseSubjectId } from "./pairwise-id";
import { decryptSigningKey, signWithPasskey, signWithSoftwareKey } from "./keys";
import type { NumericCommitmentAttestation, VaultPayload } from "./vault";
import { prove_ge_attested, prove_le_attested } from "@shielded-id/age-zk";

const encoder = new TextEncoder();

type SupportedClaimType = "AGE_OVER" | "KYC_LEVEL" | "CONTINUITY";
type PredicateOperator = "GE" | "LE";

export interface ProofRequest {
  requestId: string;
  nonce: string;
  verifierOrigin: string;
  expiresAt?: string;
  requestedClaims: Array<{
    type: SupportedClaimType | string;
    operator?: PredicateOperator;
    threshold?: number;
    minLevel?: number;
  }>;
}

export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  claims: Array<{
    type: SupportedClaimType;
    value: boolean | string;
    operator?: PredicateOperator;
    issuer?: { did: string; keyId: string; signature: string };
    expiresAt?: string;
    evidence?: { commitmentAttestation: NumericCommitmentAttestation };
  }>;
  suite: "ECDSA_P256_SHA256_1.0.0" | "BULLETPROOFS_RISTRETTO_BOUND_V2";
  signature: string;
  zkProofs?: Record<number, {
    commitment: string;
    bulletproof: string;
    publicInputs: string;
    claimType: "AGE_OVER" | "KYC_LEVEL";
    operator: PredicateOperator;
  }>;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function cutoffYyyymmdd(age: number, now = new Date()): number {
  if (!Number.isInteger(age) || age < 0 || age > 150) throw new Error("INVALID_AGE_THRESHOLD");
  const year = now.getUTCFullYear() - age;
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);
  return year * 10000 + (month + 1) * 100 + clampedDay;
}

function requireCurrentAttestation(attestation: NumericCommitmentAttestation, expectedAttribute: string) {
  if (attestation.version !== "SID-COMMITMENT-1") throw new Error("UNSUPPORTED_ATTESTATION_VERSION");
  if (attestation.attribute !== expectedAttribute) throw new Error("ATTESTATION_ATTRIBUTE_MISMATCH");
  if (!attestation.signature || !attestation.commitment || !attestation.issuerDid || !attestation.keyId) {
    throw new Error("MALFORMED_ATTESTATION");
  }
  const expiry = Date.parse(attestation.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("ATTESTATION_EXPIRED");
}

export async function generateProof(
  request: ProofRequest,
  vault: VaultPayload,
  options: { walletId: string; keyId?: string; passphrase?: string }
): Promise<ProofResponse> {
  if (!vault.masterSecret) throw new Error("MASTER_SECRET_MISSING");
  if (!request.requestId || !request.nonce || !request.verifierOrigin) throw new Error("INVALID_PROOF_REQUEST");
  if (request.expiresAt && Date.parse(request.expiresAt) <= Date.now()) throw new Error("PROOF_REQUEST_EXPIRED");

  const pairwiseSubjectId = await generatePairwiseSubjectId(
    bytesFromBase64(vault.masterSecret),
    request.verifierOrigin
  );
  const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt ?? ""}`;
  const claims: ProofResponse["claims"] = [];
  const zkProofs: NonNullable<ProofResponse["zkProofs"]> = {};

  for (let claimIndex = 0; claimIndex < request.requestedClaims.length; claimIndex += 1) {
    const requested = request.requestedClaims[claimIndex];

    if (requested.type === "CONTINUITY") {
      claims.push({ type: "CONTINUITY", value: pairwiseSubjectId });
      continue;
    }

    if (requested.type === "AGE_OVER") {
      const witness = vault.numericWitnesses.DOB_YYYYMMDD;
      if (!witness) throw new Error("ISSUER_ATTESTATION_REQUIRED:AGE_OVER");
      requireCurrentAttestation(witness.attestation, "DOB_YYYYMMDD");
      const threshold = requested.threshold ?? 18;
      const cutoff = cutoffYyyymmdd(threshold);
      const proof = await prove_le_attested(witness.value, cutoff, context, witness.blinding);

      claims.push({
        type: "AGE_OVER",
        value: true,
        operator: "LE",
        issuer: {
          did: witness.attestation.issuerDid,
          keyId: witness.attestation.keyId,
          signature: witness.attestation.signature
        },
        expiresAt: witness.attestation.expiresAt,
        evidence: { commitmentAttestation: witness.attestation }
      });
      zkProofs[claimIndex] = {
        commitment: base64FromBytes(proof.commitment),
        bulletproof: base64FromBytes(proof.proof),
        publicInputs: base64FromBytes(proof.public_inputs),
        claimType: "AGE_OVER",
        operator: "LE"
      };
      continue;
    }

    if (requested.type === "KYC_LEVEL") {
      const witness = vault.numericWitnesses.KYC_LEVEL;
      if (!witness) throw new Error("ISSUER_ATTESTATION_REQUIRED:KYC_LEVEL");
      requireCurrentAttestation(witness.attestation, "KYC_LEVEL");
      const minLevel = requested.minLevel ?? requested.threshold ?? 1;
      if (!Number.isInteger(minLevel) || minLevel < 0 || minLevel > 5) throw new Error("INVALID_KYC_THRESHOLD");
      const proof = await prove_ge_attested(witness.value, minLevel, context, witness.blinding);

      claims.push({
        type: "KYC_LEVEL",
        value: true,
        operator: "GE",
        issuer: {
          did: witness.attestation.issuerDid,
          keyId: witness.attestation.keyId,
          signature: witness.attestation.signature
        },
        expiresAt: witness.attestation.expiresAt,
        evidence: { commitmentAttestation: witness.attestation }
      });
      zkProofs[claimIndex] = {
        commitment: base64FromBytes(proof.commitment),
        bulletproof: base64FromBytes(proof.proof),
        publicInputs: base64FromBytes(proof.public_inputs),
        claimType: "KYC_LEVEL",
        operator: "GE"
      };
      continue;
    }

    throw new Error(`UNSUPPORTED_CLAIM_TYPE:${requested.type}`);
  }

  const response: ProofResponse = {
    requestId: request.requestId,
    nonce: request.nonce,
    walletId: options.walletId,
    keyId: options.keyId,
    pairwiseSubjectId,
    claims,
    suite: Object.keys(zkProofs).length > 0 ? "BULLETPROOFS_RISTRETTO_BOUND_V2" : "ECDSA_P256_SHA256_1.0.0",
    signature: "",
    zkProofs: Object.keys(zkProofs).length > 0 ? zkProofs : undefined
  };

  const payload = { ...response } as Record<string, unknown>;
  delete payload.signature;
  const message = encoder.encode(stableStringify(payload));

  if (vault.webauthnCredentialId) {
    try {
      const signature = await signWithPasskey(message);
      response.signature = base64FromBytes(signature);
      return response;
    } catch (err) {
      console.warn("[Proof] WebAuthn signing unavailable; trying encrypted software key", err);
    }
  }

  if (!vault.signingKeyEncrypted || !options.passphrase) throw new Error("SIGNING_KEY_UNAVAILABLE");
  const privateKey = await decryptSigningKey(options.passphrase, bytesFromBase64(vault.signingKeyEncrypted));
  response.signature = base64FromBytes(await signWithSoftwareKey(message, privateKey));
  return response;
}

export { cutoffYyyymmdd, stableStringify };
