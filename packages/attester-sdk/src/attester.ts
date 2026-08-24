import crypto, { createSign, createVerify } from "crypto";
import QRCode from "qrcode";
import { create_numeric_commitment } from "@shielded-id/age-zk";

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

export interface NumericCredentialWitness {
  value: number;
  blinding: string;
  attestation: NumericCommitmentAttestation;
}

export interface Credential {
  "@context": string;
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: {
    id: string;
    attributes: Record<string, unknown>;
    commitmentAttestations: Omit<NumericCommitmentAttestation, "signature">[];
  };
}

export interface SignedCredential {
  credential: Credential;
  signature: string;
  algorithm: "ECDSA_P256_SHA256_1.0.0";
  /** Private to the wallet. Never disclose these witness values/blindings to a verifier. */
  numericWitnesses: Partial<Record<NumericAttributeCode, NumericCredentialWitness>>;
}

export interface AttesterConfig {
  attesterId: string;
  attestorName: string;
  attestorUrl: string;
  registryUrl: string;
  privateKeyPem: string;
  publicKeyPem: string;
  /** Explicit registry credential. No unsigned self-minted bearer tokens are created. */
  registryAuthToken?: string;
  keyId?: string;
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "null";
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

function dateToYyyymmdd(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return year * 10000 + month * 100 + day;
}

export class ShieldedAttester {
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;
  private keyId: string;

  constructor(private config: AttesterConfig) {
    this.privateKey = crypto.createPrivateKey({
      key: config.privateKeyPem,
      format: "pem",
      type: "pkcs8"
    });
    this.publicKey = crypto.createPublicKey({
      key: config.publicKeyPem,
      format: "pem"
    });
    if (this.privateKey.asymmetricKeyType !== "ec" || this.publicKey.asymmetricKeyType !== "ec") {
      throw new Error("ATTESTER_KEY_MUST_BE_EC_P256");
    }
    const details = this.publicKey.asymmetricKeyDetails;
    if (details?.namedCurve !== "prime256v1") {
      throw new Error("ATTESTER_KEY_MUST_BE_P256");
    }
    this.keyId = config.keyId ?? `${config.attesterId}#signing-1`;
  }

  async issueCredential(
    userId: string,
    attributes: Record<string, unknown>,
    expiresAt: string
  ): Promise<SignedCredential> {
    if (!userId?.trim()) throw new Error("userId required");
    if (!attributes || Object.keys(attributes).length === 0) throw new Error("attributes required");

    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      throw new Error("expiresAt must be a future ISO-8601 timestamp");
    }

    const issuedAt = new Date().toISOString();
    const credentialId = `urn:uuid:${crypto.randomUUID()}`;
    const issuerDid = `did:shielded:${this.config.attesterId}`;
    const numericWitnesses: Partial<Record<NumericAttributeCode, NumericCredentialWitness>> = {};

    const dob = dateToYyyymmdd(attributes.dateOfBirth ?? attributes.date_of_birth);
    if (dob !== null) {
      numericWitnesses.DOB_YYYYMMDD = await this.createNumericWitness(
        "DOB_YYYYMMDD", dob, credentialId, issuerDid, issuedAt, expiry.toISOString()
      );
    }

    const rawKyc = attributes.kycLevel ?? attributes.kyc_level;
    if (rawKyc !== undefined) {
      const kycLevel = Number(rawKyc);
      if (!Number.isInteger(kycLevel) || kycLevel < 0 || kycLevel > 5) {
        throw new Error("kycLevel must be an integer from 0 to 5");
      }
      numericWitnesses.KYC_LEVEL = await this.createNumericWitness(
        "KYC_LEVEL", kycLevel, credentialId, issuerDid, issuedAt, expiry.toISOString()
      );
    }

    const commitmentAttestations = Object.values(numericWitnesses)
      .filter((w): w is NumericCredentialWitness => Boolean(w))
      .map(({ attestation }) => {
        const { signature: _signature, ...unsigned } = attestation;
        return unsigned;
      });

    const credential: Credential = {
      "@context": "https://www.w3.org/ns/credentials/v2",
      id: credentialId,
      type: ["VerifiableCredential", "ShieldedIDCredential"],
      issuer: issuerDid,
      issuanceDate: issuedAt,
      expirationDate: expiry.toISOString(),
      credentialSubject: {
        id: `did:shielded:${userId}`,
        attributes,
        commitmentAttestations
      }
    };

    return {
      credential,
      signature: this.signObject(credential),
      algorithm: "ECDSA_P256_SHA256_1.0.0",
      numericWitnesses
    };
  }

  private async createNumericWitness(
    attribute: NumericAttributeCode,
    value: number,
    credentialId: string,
    issuerDid: string,
    issuedAt: string,
    expiresAt: string
  ): Promise<NumericCredentialWitness> {
    const { commitment, blinding } = await create_numeric_commitment(value);
    const unsigned = {
      version: "SID-COMMITMENT-1" as const,
      credentialId,
      attribute,
      commitment,
      issuerDid,
      keyId: this.keyId,
      issuedAt,
      expiresAt
    };
    return {
      value,
      blinding,
      attestation: {
        ...unsigned,
        signature: this.signObject(unsigned)
      }
    };
  }

  async verifyCredential(credential: Credential, signature: string): Promise<boolean> {
    return this.verifyObject(credential, signature);
  }

  async verifyCommitmentAttestation(attestation: NumericCommitmentAttestation): Promise<boolean> {
    const { signature, ...unsigned } = attestation;
    if (attestation.version !== "SID-COMMITMENT-1") return false;
    if (new Date(attestation.expiresAt).getTime() <= Date.now()) return false;
    return this.verifyObject(unsigned, signature);
  }

  async registerPublicKey(): Promise<{ success: boolean; keyId: string }> {
    const token = this.requireRegistryToken();
    const response = await fetch(`${this.config.registryUrl}/api/attesters/${this.config.attesterId}/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        keyId: this.keyId,
        publicKey: this.exportPublicKeyJWK(),
        algorithm: "ECDSA_P256_SHA256_1.0.0"
      })
    });
    if (!response.ok) throw new Error(`Failed to register public key: ${response.status} ${response.statusText}`);
    return await response.json() as { success: boolean; keyId: string };
  }

  async revokeAllCredentials(reason: string): Promise<void> {
    if (!reason.trim()) throw new Error("revocation reason required");
    const token = this.requireRegistryToken();
    const response = await fetch(`${this.config.registryUrl}/api/attesters/${this.config.attesterId}/revoke-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason, attesterId: this.config.attesterId })
    });
    if (!response.ok) throw new Error(`Failed to revoke credentials: ${response.status} ${response.statusText}`);
  }

  async generateQRCode(credential: SignedCredential): Promise<string> {
    const payload = Buffer.from(JSON.stringify(credential)).toString("base64url");
    const deepLink = `shielded-id://credential?data=${payload}`;
    return QRCode.toDataURL(deepLink, { errorCorrectionLevel: "M" });
  }

  exportPublicKeyJWK(): JsonWebKey {
    const jwk = this.publicKey.export({ format: "jwk" }) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
      throw new Error("FAILED_TO_EXPORT_VALID_P256_JWK");
    }
    return { ...jwk, use: "sig", alg: "ES256", key_ops: ["verify"] };
  }

  private signObject(value: unknown): string {
    const payload = stableStringify(value);
    const sign = createSign("sha256");
    sign.update(payload);
    sign.end();
    return sign.sign(this.privateKey).toString("base64url");
  }

  private verifyObject(value: unknown, signature: string): boolean {
    try {
      const verify = createVerify("sha256");
      verify.update(stableStringify(value));
      verify.end();
      return verify.verify(this.publicKey, Buffer.from(signature, "base64url"));
    } catch {
      return false;
    }
  }

  private requireRegistryToken(): string {
    if (!this.config.registryAuthToken?.trim()) {
      throw new Error("REGISTRY_AUTH_TOKEN_REQUIRED");
    }
    return this.config.registryAuthToken;
  }
}

export interface AttesterInfo {
  id: string;
  name: string;
  url: string;
  publicKeyJWK: JsonWebKey;
  status: "active" | "suspended" | "revoked";
  registeredAt: Date;
}

export class AttesterRegistry {
  private attesters = new Map<string, AttesterInfo>();

  async registerAttester(info: AttesterInfo): Promise<void> {
    if (!info.id || !info.publicKeyJWK) throw new Error("Missing attester information");
    if (info.publicKeyJWK.kty !== "EC" || info.publicKeyJWK.crv !== "P-256") {
      throw new Error("Attester public key must be P-256");
    }
    this.attesters.set(info.id, { ...info, registeredAt: new Date() });
  }

  async getAttester(attesterId: string): Promise<AttesterInfo | null> {
    return this.attesters.get(attesterId) ?? null;
  }

  async listAttesters(): Promise<AttesterInfo[]> {
    return Array.from(this.attesters.values()).filter((a) => a.status === "active");
  }

  async suspendAttester(attesterId: string, _reason: string): Promise<void> {
    const attester = this.attesters.get(attesterId);
    if (!attester) throw new Error("Attester not found");
    attester.status = "suspended";
  }

  async revokeAttester(attesterId: string): Promise<void> {
    const attester = this.attesters.get(attesterId);
    if (!attester) throw new Error("Attester not found");
    attester.status = "revoked";
  }
}

export { stableStringify, dateToYyyymmdd };
export default ShieldedAttester;
