import { generatePairwiseSubjectId } from "./pairwise-id";
import { decryptSigningKey, signWithPasskey, signWithSoftwareKey } from "./keys";
import type { VaultPayload } from "./vault";
import { proveGE } from "@shielded-id/age-zk";
import { zkAgent } from "./zk-agent";

const encoder = new TextEncoder();

export interface ProofRequest {
  requestId: string;
  nonce: string;
  verifierOrigin: string;
  expiresAt?: string;
  requestedClaims: Array<{ type: "AGE_OVER" | "KYC_LEVEL" | "CONTINUITY" | "CUSTOM"; threshold?: number; minLevel?: number }>;
}

export interface ProofResponse {
  requestId: string;
  nonce: string;
  walletId: string;
  keyId?: string;
  pairwiseSubjectId: string;
  claims: Array<{
    type: string;
    value: boolean | number | string;
    issuer?: { did: string; signature?: string };
    expiresAt?: string;
  }>;
  suite: "ECDSA_P256_SHA256_1.0.0" | "AGE_ZK_BULLETPROOFS_V1" | "KYC_ZK_BULLETPROOFS_V1";
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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries.map(([k, v]) => `"${k}":${stableStringify(v)}`).join(",");
    return `{${body}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computeAgeOver18(dateOfBirth: string): boolean {
  const dob = Date.parse(dateOfBirth);
  if (Number.isNaN(dob)) return false;
  const diff = Date.now() - dob;
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  return years >= 18;
}

function computeAge(dateOfBirth: string): number {
  const dob = Date.parse(dateOfBirth);
  if (Number.isNaN(dob)) return 0;
  const diff = Date.now() - dob;
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years);
}

export async function generateProof(
  request: ProofRequest,
  vault: VaultPayload,
  options: { walletId: string; keyId?: string; passphrase?: string }
): Promise<ProofResponse> {
  if (!vault.masterSecret) {
    throw new Error("MASTER_SECRET_MISSING");
  }

  const pairwiseSubjectId = await generatePairwiseSubjectId(
    bytesFromBase64(vault.masterSecret),
    request.verifierOrigin
  );

  const claims: ProofResponse["claims"] = [];
  let useZkProof = false;
  let useKycZkProof = false;
  let kycMinLevel = 0;

  for (const requestClaim of request.requestedClaims) {
    if (requestClaim.type === "AGE_OVER") {
      // For ZK proof, we don't include the claim value - it's proven in the ZK proof
      claims.push({
        type: "AGE_OVER",
        value: true  // Placeholder - actual proof is in zkProof field
      });
      useZkProof = true;
    }
    if (requestClaim.type === "KYC_LEVEL") {
      const minLevel = requestClaim.minLevel ?? 0;
      kycMinLevel = minLevel;
      // For ZK proof, we don't include the claim value - it's proven in the ZK proof
      claims.push({
        type: "KYC_LEVEL",
        value: true  // Placeholder - actual proof is in kycZkProof field
      });
      useKycZkProof = true;
    }
    if (requestClaim.type === "CONTINUITY") {
      claims.push({ type: "CONTINUITY", value: pairwiseSubjectId });
    }
  }

  const response: ProofResponse = {
    requestId: request.requestId,
    nonce: request.nonce,
    walletId: options.walletId,
    keyId: options.keyId,
    pairwiseSubjectId,
    claims,
    suite: useKycZkProof ? "AGE_ZK_BULLETPROOFS_V1" : (useZkProof ? "AGE_ZK_BULLETPROOFS_V1" : "ECDSA_P256_SHA256_1.0.0"),
    signature: ""
  };

  // Generate ZK proof for age if needed
  if (useZkProof && vault.profile?.dateOfBirth) {
    const age = computeAge(vault.profile.dateOfBirth);
    if (age >= 18) {
      try {
        // Check if ZK agent is available
        const agentAvailable = await zkAgent.isAgentAvailable();
        let proofBundle;

        if (agentAvailable) {
          console.debug("[Proof] Using ZK agent for age proof");
          proofBundle = await zkAgent.generateAgeProof(
            age,
            request.verifierOrigin,
            request.nonce,
            request.expiresAt || ""
          );
        } else {
          console.debug("[Proof] Using WASM fallback for age proof");
          proofBundle = await proveGE(age, 18, request.verifierOrigin, request.nonce, request.expiresAt || "");
        }

        response.zkProof = {
          commitment: proofBundle.commitment,
          bulletproof: proofBundle.proof,
          publicInputs: proofBundle.publicInputs
        };
      } catch (err) {
        console.warn("[Proof] ZK proof generation failed, falling back to predicate:", err);
        // Continue with predicate proof
      }
    }
  }

  // Generate ZK proof for KYC if needed
  if (useKycZkProof && vault.kycLevel && vault.kycLevel >= kycMinLevel) {
    try {
      // Check if ZK agent is available
      const agentAvailable = await zkAgent.isAgentAvailable();
      let proofBundle;

      if (agentAvailable) {
        console.debug("[Proof] Using ZK agent for KYC proof");
        proofBundle = await zkAgent.generateAssuranceProof(
          vault.kycLevel,
          kycMinLevel,
          request.verifierOrigin,
          request.nonce,
          request.expiresAt || ""
        );
      } else {
        console.debug("[Proof] Using WASM fallback for KYC proof");
        proofBundle = await proveGE(vault.kycLevel, kycMinLevel, request.verifierOrigin, request.nonce, request.expiresAt || "");
      }

      response.kycZkProof = {
        commitment: proofBundle.commitment,
        bulletproof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs,
        minLevel: kycMinLevel
      };
    } catch (err) {
      console.warn("[Proof] KYC ZK proof generation failed, falling back to predicate:", err);
      // Continue with predicate proof
    }
  }

  const payload = { ...response } as Record<string, unknown>;
  delete payload.signature;
  const message = encoder.encode(stableStringify(payload));

  // Try WebAuthn first (hardware key / passkey)
  if (vault.webauthnCredentialId) {
    try {
      console.debug("[Proof] Signing with WebAuthn passkey");
      const signature = await signWithPasskey(message);
      response.signature = base64FromBytes(signature);
      console.debug("[Proof] WebAuthn signing succeeded");
      return response;
    } catch (err) {
      console.warn("[Proof] WebAuthn signing failed, falling back to software key:", err);
    }
  }

  // Fallback to software ECDSA key
  if (!vault.signingKeyEncrypted || !options.passphrase) {
    throw new Error("SIGNING_KEY_UNAVAILABLE");
  }

  try {
    console.debug("[Proof] Signing with software ECDSA key");
    const privateKey = await decryptSigningKey(options.passphrase, bytesFromBase64(vault.signingKeyEncrypted));
    const signature = await signWithSoftwareKey(message, privateKey);
    response.signature = base64FromBytes(signature);
    console.debug("[Proof] Software ECDSA signing succeeded");
    return response;
  } catch (err) {
    console.error("[Proof] All signing attempts failed:", err);
    throw new Error("PROOF_SIGNING_FAILED");
  }
}
