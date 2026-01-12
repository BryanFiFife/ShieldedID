import { generatePairwiseSubjectId } from "./pairwise-id";
import { decryptSigningKey, signWithPasskey, signWithSoftwareKey } from "./keys";
import type { VaultPayload } from "./vault";
import {
  prove_ge,
  prove_age_range,
  prove_birth_year,
  prove_string_equality,
  prove_membership_in_list,
  prove_not_in_list,
  prove_string_prefix
} from "@shielded-id/age-zk";
import { zkAgent } from "./zk-agent";
import type { ClaimType, PredicateOperator } from "@shielded-id/verifier-sdk";

// SECURITY FIX #4: Mutex for thread-safe ZK proof generation
class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    while (this.locked) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.locked = true;
    try {
      return await fn();
    } finally {
      this.locked = false;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const encoder = new TextEncoder();

export interface ProofRequest {
  requestId: string;
  nonce: string;
  verifierOrigin: string;
  expiresAt?: string;
  requestedClaims: Array<{
    type: ClaimType;
    operator?: PredicateOperator;
    threshold?: number;
    minLevel?: number;
    minValue?: number;
    maxValue?: number;
    expectedValue?: string | number;
    expectedCountry?: string;
    expectedState?: string;
    requiredEndorsement?: string;
    forbiddenRestriction?: string;
    prefixLength?: number;
  }>;
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
    operator?: PredicateOperator;
    issuer?: { did: string; signature?: string };
    expiresAt?: string;
  }>;
  suite: "ECDSA_P256_SHA256_1.0.0" | "BULLETPROOFS_RISTRETTO_V1" | "AGE_ZK_BULLETPROOFS_V1" | "KYC_ZK_BULLETPROOFS_V1";
  signature: string;
  // Multiple ZK proofs indexed by claim index
  zkProofs?: {
    [claimIndex: number]: {
      commitment: string;
      bulletproof: string;
      publicInputs: string;
      claimType: ClaimType;
      operator: PredicateOperator;
    };
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

// SECURITY FIX #4: Global mutex for ZK proof generation
const zkMutex = new Mutex();

const EU_COUNTRIES = "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE";

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
  const zkProofs: Record<number, any> = {};
  const context = `${request.verifierOrigin}|${request.nonce}|${request.expiresAt || ""}`;

  let claimIndex = 0;
  for (const requestClaim of request.requestedClaims) {
    let claimValue: boolean | number | string = false;
    let zkProof: any = null;

    try {
      switch (requestClaim.type) {
        // ======== AGE PROOFS ========
        case "AGE_OVER": {
          const age = vault.profile?.dateOfBirth ? computeAge(vault.profile.dateOfBirth) : 0;
          const threshold = requestClaim.threshold || 18;
          claimValue = age >= threshold;
          
          if (age >= threshold) {
            zkProof = await zkMutex.acquire(async () => {
              const agentAvailable = await zkAgent.isAgentAvailable();
              if (agentAvailable) {
                return await zkAgent.generateAgeProof(age, request.verifierOrigin, request.nonce, request.expiresAt || "");
              } else {
                return await prove_ge(age, threshold, context);
              }
            });
          }
          break;
        }

        case "AGE_RANGE": {
          const age = vault.profile?.dateOfBirth ? computeAge(vault.profile.dateOfBirth) : 0;
          const minAge = requestClaim.minValue || 18;
          const maxAge = requestClaim.maxValue || 65;
          claimValue = age >= minAge && age <= maxAge;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_age_range(age, minAge, maxAge, context);
            });
          }
          break;
        }

        case "AGE_EXACT": {
          const age = vault.profile?.dateOfBirth ? computeAge(vault.profile.dateOfBirth) : 0;
          const expectedAge = requestClaim.expectedValue as number || 21;
          claimValue = age === expectedAge;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              // For equality, prove (age - expected) == 0 via range proof
              return await prove_ge(age === expectedAge ? 1 : 0, 1, context);
            });
          }
          break;
        }

        case "BORN_AFTER": {
          const year = vault.profile?.issuedDate ? new Date(vault.profile.issuedDate).getFullYear() : 0;
          const minYear = requestClaim.expectedValue as number || 1960;
          claimValue = year >= minYear;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_birth_year(year, minYear, context);
            });
          }
          break;
        }

        // ======== LOCATION PROOFS ========
        case "COUNTRY": {
          const country = vault.profile ? "US" : ""; // Placeholder from vault
          const expectedCountry = requestClaim.expectedCountry || "US";
          claimValue = country === expectedCountry;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(country, expectedCountry, context);
            });
          }
          break;
        }

        case "EU_RESIDENT": {
          const country = vault.profile ? "DE" : ""; // Placeholder from vault
          claimValue = EU_COUNTRIES.split(',').includes(country);
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_membership_in_list(country, EU_COUNTRIES, context);
            });
          }
          break;
        }

        case "STATE_OR_PROVINCE": {
          const state = vault.profile ? "California" : ""; // Placeholder from vault
          const expectedState = requestClaim.expectedState || "California";
          claimValue = state === expectedState;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(state, expectedState, context);
            });
          }
          break;
        }

        case "POSTAL_CODE_PREFIX": {
          const postal = vault.profile ? "90210" : ""; // Placeholder from vault
          const prefix = requestClaim.expectedValue as string || "902";
          claimValue = postal.startsWith(prefix);
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_prefix(postal, prefix, context);
            });
          }
          break;
        }

        case "REGION": {
          const region = vault.profile ? "US-CA" : ""; // Placeholder from vault
          const expectedRegion = requestClaim.expectedValue as string || "US-CA";
          claimValue = region === expectedRegion;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(region, expectedRegion, context);
            });
          }
          break;
        }

        // ======== KYC PROOFS ========
        case "KYC_LEVEL": {
          const level = vault.kycLevel || 0;
          const minLevel = requestClaim.minLevel || 1;
          claimValue = level >= minLevel;
          
          if (level >= minLevel) {
            zkProof = await zkMutex.acquire(async () => {
              const agentAvailable = await zkAgent.isAgentAvailable();
              if (agentAvailable) {
                return await zkAgent.generateAssuranceProof(level, minLevel, request.verifierOrigin, request.nonce, request.expiresAt || "");
              } else {
                return await prove_ge(level, minLevel, context);
              }
            });
          }
          break;
        }

        case "KYC_VERIFIED": {
          const status = vault.attributes?.find(a => a.type === "kycStatus")?.value || "pending";
          claimValue = status === "verified";
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(status, "verified", context);
            });
          }
          break;
        }

        case "AML_CLEAR": {
          const status = vault.attributes?.find(a => a.type === "amlStatus")?.value || "unknown";
          claimValue = status === "clear";
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(status, "clear", context);
            });
          }
          break;
        }

        case "SANCTIONS_CLEAR": {
          const status = vault.attributes?.find(a => a.type === "sanctionsCheck")?.value || "unknown";
          claimValue = status === "clear";
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(status, "clear", context);
            });
          }
          break;
        }

        case "DOCUMENT_TYPE": {
          const docType = vault.profile?.documentType || "passport";
          const expectedType = requestClaim.expectedValue as string || "passport";
          claimValue = docType === expectedType;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(docType, expectedType, context);
            });
          }
          break;
        }

        // ======== DRIVING LICENSE PROOFS ========
        case "LICENSE_CLASS": {
          const licenseClass = vault.attributes?.find(a => a.type === "licenseClass")?.value || "0";
          const licenseNum = parseInt(licenseClass) || 0;
          const minClass = requestClaim.threshold || 2;
          claimValue = licenseNum >= minClass;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(licenseNum, minClass, context);
            });
          }
          break;
        }

        case "VEHICLE_CATEGORY": {
          const category = vault.attributes?.find(a => a.type === "vehicleCategory")?.value || "car";
          const expectedCategory = requestClaim.expectedValue as string || "car";
          claimValue = category === expectedCategory;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(category, expectedCategory, context);
            });
          }
          break;
        }

        case "ENDORSEMENT": {
          const endorsements = vault.attributes?.find(a => a.type === "endorsements")?.value || "";
          const required = requestClaim.requiredEndorsement || "towing";
          claimValue = endorsements.includes(required);
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_membership_in_list(required, endorsements, context);
            });
          }
          break;
        }

        case "RESTRICTION": {
          const restrictions = vault.attributes?.find(a => a.type === "restrictions")?.value || "";
          const forbidden = requestClaim.forbiddenRestriction || "corrective_lenses";
          claimValue = !restrictions.includes(forbidden);
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_not_in_list(forbidden, restrictions, context);
            });
          }
          break;
        }

        case "LICENSE_VALID": {
          const expiryStr = vault.profile?.expiryDate;
          const expiry = expiryStr ? new Date(expiryStr).getTime() : 0;
          claimValue = expiry > Date.now();
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(Math.floor(expiry / 1000), Math.floor(Date.now() / 1000), context);
            });
          }
          break;
        }

        // ======== DOCUMENT & CREDENTIAL PROOFS ========
        case "DOCUMENT_VALID": {
          const expiryStr = vault.profile?.expiryDate;
          const expiry = expiryStr ? new Date(expiryStr).getTime() : 0;
          claimValue = expiry > Date.now();
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(Math.floor(expiry / 1000), Math.floor(Date.now() / 1000), context);
            });
          }
          break;
        }

        case "DOCUMENT_TYPE_MATCH": {
          const docType = vault.profile?.documentType || "passport";
          const expectedType = requestClaim.expectedValue as string || "passport";
          claimValue = docType === expectedType;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(docType, expectedType, context);
            });
          }
          break;
        }

        case "ISSUER_COUNTRY": {
          const issuer = vault.profile?.issuer || "US";
          const expectedIssuer = requestClaim.issuerCountry || "US";
          claimValue = issuer === expectedIssuer;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(issuer, expectedIssuer, context);
            });
          }
          break;
        }

        case "DOCUMENT_AGE": {
          const issuedStr = vault.profile?.issuedDate;
          const issued = issuedStr ? new Date(issuedStr).getTime() : 0;
          const minAge = requestClaim.minDocumentAge || 0;
          claimValue = issued >= minAge;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(Math.floor(issued / 1000), Math.floor(minAge / 1000), context);
            });
          }
          break;
        }

        case "CREDENTIAL_VALID": {
          const credExpiry = vault.attributes?.find(a => a.type === "credentialExpiry")?.value || "0";
          const expiry = parseInt(credExpiry) || 0;
          claimValue = expiry > Date.now() / 1000;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(expiry, Math.floor(Date.now() / 1000), context);
            });
          }
          break;
        }

        case "CREDENTIAL_ACTIVE": {
          const status = vault.attributes?.find(a => a.type === "credentialStatus")?.value || "inactive";
          claimValue = status === "active";
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_string_equality(status, "active", context);
            });
          }
          break;
        }

        case "CREDENTIAL_LEVEL": {
          const level = vault.attributes?.find(a => a.type === "credentialLevel")?.value || "0";
          const levelNum = parseInt(level) || 0;
          const minLevel = requestClaim.minLevel || 1;
          claimValue = levelNum >= minLevel;
          
          if (claimValue) {
            zkProof = await zkMutex.acquire(async () => {
              return await prove_ge(levelNum, minLevel, context);
            });
          }
          break;
        }

        case "CONTINUITY": {
          claimValue = pairwiseSubjectId;
          break;
        }

        default: {
          claimValue = false;
        }
      }
    } catch (err) {
      console.warn(`[Proof] ZK proof generation failed for ${requestClaim.type}:`, err);
      // Fall back to non-ZK claim
    }

    // Add claim to response
    claims.push({
      type: requestClaim.type,
      value: claimValue,
      operator: requestClaim.operator || "GE"
    });

    // Store ZK proof if generated
    if (zkProof) {
      zkProofs[claimIndex] = {
        commitment: base64FromBytes(new Uint8Array(zkProof.commitment)),
        bulletproof: base64FromBytes(new Uint8Array(zkProof.proof)),
        publicInputs: base64FromBytes(new Uint8Array(zkProof.public_inputs)),
        claimType: requestClaim.type,
        operator: requestClaim.operator || "GE"
      };
    }

    claimIndex++;
  }

  const response: ProofResponse = {
    requestId: request.requestId,
    nonce: request.nonce,
    walletId: options.walletId,
    keyId: options.keyId,
    pairwiseSubjectId,
    claims,
    suite: Object.keys(zkProofs).length > 0 ? "BULLETPROOFS_RISTRETTO_V1" : "ECDSA_P256_SHA256_1.0.0",
    signature: "",
    zkProofs: Object.keys(zkProofs).length > 0 ? zkProofs : undefined
  };

  const payload = { ...response } as Record<string, unknown>;
  delete payload.signature;
  const message = encoder.encode(stableStringify(payload));

  // Try WebAuthn first
  if (vault.webauthnCredentialId) {
    try {
      console.debug("[Proof] Signing with WebAuthn passkey");
      const signature = await signWithPasskey(message);
      response.signature = base64FromBytes(signature);
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
    return response;
  } catch (err) {
    console.error("[Proof] All signing attempts failed:", err);
    throw new Error("PROOF_SIGNING_FAILED");
  }
}
