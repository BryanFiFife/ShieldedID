/**
 * Shielded ID Attester SDK
 * File: packages/attester-sdk/src/attester.ts
 * 
 * Enables credential issuers to mint Shielded ID credentials
 * and participate in the federated identity ecosystem
 */

import crypto from "crypto";
import { createSign, createVerify } from "crypto";

/**
 * Credential metadata as issued by attester
 */
export interface Credential {
  "@context": string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: {
    id: string;
    attributes: Record<string, unknown>;
  };
}

/**
 * Signed credential package
 */
export interface SignedCredential {
  credential: Credential;
  signature: string;
  algorithm: string;
}

/**
 * Attester configuration
 */
export interface AttesterConfig {
  attesterId: string;
  attestorName: string;
  attestorUrl: string;
  registryUrl: string;
  privateKeyPem: string;
  publicKeyPem: string;
}

/**
 * Shielded ID Attester for credential issuance
 * 
 * Attesters perform out-of-band identity verification (KYC),
 * then issue Shielded ID credentials that users can use to
 * generate zero-knowledge proofs.
 * 
 * @example
 * ```typescript
 * const attester = new ShieldedAttester(config);
 * 
 * // After KYC verification:
 * const credential = await attester.issueCredential(
 *   userId,
 *   { name: "Alice Smith", dateOfBirth: "1990-05-15", kycLevel: 3 },
 *   "2027-01-11"
 * );
 * 
 * // User scans QR code with wallet
 * const qrCode = credential.qrCode;
 * ```
 */
export class ShieldedAttester {
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;

  constructor(private config: AttesterConfig) {
    // Import private key for signing
    this.privateKey = crypto.createPrivateKey({
      key: config.privateKeyPem,
      format: "pem",
      type: "pkcs8"
    });

    // Import public key for verification
    this.publicKey = crypto.createPublicKey({
      key: config.publicKeyPem,
      format: "pem"
    });
  }

  /**
   * Issue a credential after out-of-band KYC verification
   * 
   * @param userId - User identifier (attester-specific, not globally unique)
   * @param attributes - KYC attributes (name, age, KYC level, etc.)
   * @param expiresAt - ISO 8601 expiration timestamp
   * @returns SignedCredential ready for wallet import
   */
  async issueCredential(
    userId: string,
    attributes: Record<string, unknown>,
    expiresAt: string
  ): Promise<SignedCredential> {
    // Validate inputs
    if (!userId || !userId.trim()) {
      throw new Error("userId required");
    }
    if (!attributes || Object.keys(attributes).length === 0) {
      throw new Error("attributes required");
    }
    if (!expiresAt) {
      throw new Error("expiresAt required");
    }

    // Create credential object (W3C VC-compatible)
    const credential: Credential = {
      "@context": "https://w3c.github.io/vc-data-model",
      type: ["VerifiableCredential", "ShieldedIDCredential"],
      issuer: `did:shielded:${this.config.attesterId}`,
      issuanceDate: new Date().toISOString(),
      expirationDate: expiresAt,
      credentialSubject: {
        id: `did:shielded:${userId}`,
        attributes: attributes
      }
    };

    // Sign credential
    const signature = this.signCredential(credential);

    return {
      credential,
      signature,
      algorithm: "ECDSA_P256_SHA256_1.0.0"
    };
  }

  /**
   * Verify a credential signature (for testing)
   */
  async verifyCredential(credential: Credential, signature: string): Promise<boolean> {
    try {
      const payload = JSON.stringify(credential, Object.keys(credential).sort());
      const digest = crypto.createHash("sha256").update(payload).digest();

      const verify = createVerify("sha256");
      verify.update(payload);
      return verify.verify(this.publicKey, Buffer.from(signature, "base64url"));
    } catch {
      return false;
    }
  }

  /**
   * Register attester's public key with registry
   * (allows verifiers to trust this attester's credentials)
   */
  async registerPublicKey(): Promise<{ success: boolean; keyId: string }> {
    const response = await fetch(
      `${this.config.registryUrl}/api/attesters/${this.config.attesterId}/keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.createAdminToken()}`
        },
        body: JSON.stringify({
          publicKey: this.exportPublicKeyJWK(),
          algorithm: "ECDSA_P256_SHA256_1.0.0"
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to register public key: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Revoke all credentials issued by this attester
   * (use only in case of compromise)
   */
  async revokeAllCredentials(reason: string): Promise<void> {
    const response = await fetch(
      `${this.config.registryUrl}/api/attesters/${this.config.attesterId}/revoke-all`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.createAdminToken()}`
        },
        body: JSON.stringify({
          reason: reason,
          attesterId: this.config.attesterId
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to revoke credentials: ${response.statusText}`);
    }
  }

  /**
   * Generate QR code with encoded credential
   * (for wallet scanning)
   */
  async generateQRCode(
    credential: SignedCredential
  ): Promise<string> {
    // Encode credential as deep-link
    const payload = Buffer.from(
      JSON.stringify(credential)
    ).toString("base64url");

    const deepLink = `shielded-id://credential?data=${payload}`;

    // In production, use qrcode library to generate image
    // For now, return the deep-link
    return deepLink;
  }

  /**
   * Export public key in JWK format for registry
   */
  private exportPublicKeyJWK() {
    const keyDetail = this.publicKey.asymmetricKeyDetails;
    if (!keyDetail) {
      throw new Error("Invalid public key");
    }

    // Extract EC point (x, y coordinates)
    const publicKeyPEM = this.publicKey.export({
      format: "pem",
      type: "spki"
    });

    return {
      kty: "EC",
      crv: "P-256",
      use: "sig",
      // In production, extract x, y from EC point
      x: "placeholder_base64url",
      y: "placeholder_base64url"
    };
  }

  /**
   * Sign credential with private key
   */
  private signCredential(credential: Credential): string {
    // Canonical JSON (sorted keys)
    const payload = JSON.stringify(credential, Object.keys(credential).sort());
    const digest = crypto.createHash("sha256").update(payload).digest();

    const sign = createSign("sha256");
    sign.update(payload);
    const signature = sign.sign(this.privateKey);

    return signature.toString("base64url");
  }

  /**
   * Create admin token for registry authentication
   * (should use OAuth 2.0 in production)
   */
  private createAdminToken(): string {
    // In production: JWT with attester claims
    const payload = {
      attesterId: this.config.attesterId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: this.config.registryUrl
    };

    // Should be signed, but for now just base64url encode
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }
}

/**
 * Attester Registry for multi-attester federation
 * (manages trust relationships)
 */
export class AttesterRegistry {
  private attesters = new Map<string, AttesterInfo>();

  interface AttesterInfo {
    id: string;
    name: string;
    url: string;
    publicKeyJWK: JsonWebKey;
    status: "active" | "suspended" | "revoked";
    registeredAt: Date;
  }

  /**
   * Register a new attester in the federation
   */
  async registerAttester(info: AttesterInfo): Promise<void> {
    // Validate attester details
    if (!info.id || !info.publicKeyJWK) {
      throw new Error("Missing attester information");
    }

    // Optionally: Verify attester website (ACME-like challenge)
    // TODO: Implement domain verification

    this.attesters.set(info.id, {
      ...info,
      registeredAt: new Date()
    });
  }

  /**
   * Get attester by ID
   */
  async getAttester(attesterId: string): Promise<AttesterInfo | null> {
    return this.attesters.get(attesterId) || null;
  }

  /**
   * List all active attesters
   */
  async listAttesters(): Promise<AttesterInfo[]> {
    return Array.from(this.attesters.values()).filter(
      (a) => a.status === "active"
    );
  }

  /**
   * Suspend attester (e.g., due to security incident)
   */
  async suspendAttester(attesterId: string, reason: string): Promise<void> {
    const attester = this.attesters.get(attesterId);
    if (!attester) {
      throw new Error("Attester not found");
    }

    attester.status = "suspended";
    // TODO: Notify wallet users
  }

  /**
   * Revoke attester (permanent)
   */
  async revokeAttester(attesterId: string): Promise<void> {
    const attester = this.attesters.get(attesterId);
    if (!attester) {
      throw new Error("Attester not found");
    }

    attester.status = "revoked";
    // TODO: Invalidate all attester's credentials
  }
}

// ============================================================
// Example Usage
// ============================================================

/*
import { ShieldedAttester } from "./attester";

const config: AttesterConfig = {
  attesterId: "kyc-provider-acme",
  attestorName: "ACME KYC Provider",
  attestorUrl: "https://kyc.example.com",
  registryUrl: "https://registry.shielded-id.app",
  privateKeyPem: fs.readFileSync("attester.key", "utf8"),
  publicKeyPem: fs.readFileSync("attester.pub", "utf8")
};

const attester = new ShieldedAttester(config);

// User completes KYC process
const userId = "user-abc-123";
const attributes = {
  given_name: "Alice",
  family_name: "Smith",
  date_of_birth: "1990-05-15",
  kyc_level: 3, // High assurance
  verified_at: new Date().toISOString()
};

// Issue credential
const credential = await attester.issueCredential(
  userId,
  attributes,
  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
);

// Generate QR code for wallet scanning
const qrCode = await attester.generateQRCode(credential);
console.log("QR Code:", qrCode);

// Register with registry (so wallets can import)
await attester.registerPublicKey();
*/

export default ShieldedAttester;
