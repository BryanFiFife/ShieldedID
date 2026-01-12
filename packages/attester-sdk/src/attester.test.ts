import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShieldedAttester, AttesterRegistry, type AttesterConfig, type Credential, type SignedCredential } from "./attester";

// Mock fetch globally
global.fetch = vi.fn();

describe("ShieldedAttester", () => {
  let mockConfig: AttesterConfig;
  let attester: ShieldedAttester;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    mockConfig = {
      attesterId: "test-attester",
      attestorName: "Test Attester",
      attestorUrl: "https://test-attester.com",
      registryUrl: "https://registry.test",
      privateKeyPem: `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEILRptTFvHC4vUpUFL25ayiJoUP7QwrytO8SDykTsJm+XoAoGCCqGSM49
AwEHoUQDQgAEHWx+bncmpTt2TQpsync5qNUkj+1Y3WO4obJ0lNn43NkINtNetB/+
UTKEVTynPuwyor7Dotzzgc+EyI6eWDsJZg==
-----END EC PRIVATE KEY-----`,
      publicKeyPem: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHWx+bncmpTt2TQpsync5qNUkj+1Y
3WO4obJ0lNn43NkINtNetB/+UTKEVTynPuwyor7Dotzzgc+EyI6eWDsJZg==
-----END PUBLIC KEY-----`
    };

    // Create attester instance
    attester = new ShieldedAttester(mockConfig);
  });

  describe("constructor", () => {
    it("should create instance with valid config", () => {
      expect(attester).toBeDefined();
      expect(attester).toBeInstanceOf(ShieldedAttester);
    });

    it("should throw on invalid private key", () => {
      const badConfig = { ...mockConfig, privateKeyPem: "invalid-key" };
      expect(() => new ShieldedAttester(badConfig)).toThrow();
    });

    it("should throw on invalid public key", () => {
      const badConfig = { ...mockConfig, publicKeyPem: "invalid-key" };
      expect(() => new ShieldedAttester(badConfig)).toThrow();
    });
  });

  describe("issueCredential", () => {
    it("should issue credential with valid inputs", async () => {
      const userId = "user-123";
      const attributes = { name: "Alice", age: 25 };
      const expiresAt = "2027-01-01T00:00:00Z";

      const result = await attester.issueCredential(userId, attributes, expiresAt);

      expect(result).toBeDefined();
      expect(result.credential).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.algorithm).toBe("ECDSA_P256_SHA256_1.0.0");

      // Check credential structure
      const cred = result.credential;
      expect(cred["@context"]).toBe("https://w3c.github.io/vc-data-model");
      expect(cred.type).toEqual(["VerifiableCredential", "ShieldedIDCredential"]);
      expect(cred.issuer).toBe("did:shielded:test-attester");
      expect(cred.credentialSubject.id).toBe("did:shielded:user-123");
      expect(cred.credentialSubject.attributes).toEqual(attributes);
      expect(cred.expirationDate).toBe(expiresAt);
    });

    it("should throw on empty userId", async () => {
      await expect(attester.issueCredential("", { name: "Alice" }, "2027-01-01T00:00:00Z"))
        .rejects.toThrow("userId required");
    });

    it("should throw on whitespace userId", async () => {
      await expect(attester.issueCredential("   ", { name: "Alice" }, "2027-01-01T00:00:00Z"))
        .rejects.toThrow("userId required");
    });

    it("should throw on empty attributes", async () => {
      await expect(attester.issueCredential("user-123", {}, "2027-01-01T00:00:00Z"))
        .rejects.toThrow("attributes required");
    });

    it("should throw on missing expiresAt", async () => {
      await expect(attester.issueCredential("user-123", { name: "Alice" }, ""))
        .rejects.toThrow("expiresAt required");
    });

    it("should include issuance date", async () => {
      const before = new Date();
      const result = await attester.issueCredential("user-123", { name: "Alice" }, "2027-01-01T00:00:00Z");
      const after = new Date();

      const issuanceDate = new Date(result.credential.issuanceDate);
      expect(issuanceDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(issuanceDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("verifyCredential", () => {
    let testCredential: Credential;
    let testSignature: string;

    beforeEach(async () => {
      // Create a test credential and signature
      const result = await attester.issueCredential("user-123", { name: "Alice" }, "2027-01-01T00:00:00Z");
      testCredential = result.credential;
      testSignature = result.signature;
    });

    it("should verify valid credential signature", async () => {
      const isValid = await attester.verifyCredential(testCredential, testSignature);
      expect(isValid).toBe(true);
    });

    it("should reject invalid signature", async () => {
      const isValid = await attester.verifyCredential(testCredential, "invalid-signature");
      expect(isValid).toBe(false);
    });

    it("should reject tampered credential", async () => {
      const tamperedCredential = JSON.parse(JSON.stringify(testCredential)); // Deep copy
      // Tamper with issuer field which should definitely change the signature
      tamperedCredential.issuer = "did:shielded:evil-attester";

      const isValid = await attester.verifyCredential(tamperedCredential, testSignature);
      expect(isValid).toBe(false);
    });

    it("should handle malformed signature gracefully", async () => {
      const isValid = await attester.verifyCredential(testCredential, "not-base64url");
      expect(isValid).toBe(false);
    });
  });

  describe("generateQRCode", () => {
    it("should generate QR code deep link", async () => {
      const mockCredential: SignedCredential = {
        credential: {
          "@context": "https://w3c.github.io/vc-data-model",
          type: ["VerifiableCredential"],
          issuer: "did:shielded:test",
          issuanceDate: "2024-01-01T00:00:00Z",
          expirationDate: "2027-01-01T00:00:00Z",
          credentialSubject: {
            id: "did:shielded:user-123",
            attributes: { name: "Alice" }
          }
        },
        signature: "test-signature",
        algorithm: "ECDSA_P256_SHA256_1.0.0"
      };

      const qrCode = await attester.generateQRCode(mockCredential);

      expect(qrCode).toContain("shielded-id://credential?data=");
      expect(qrCode).toContain("data=");

      // Should be base64url encoded
      const dataPart = qrCode.split("data=")[1];
      expect(dataPart).toBeDefined();

      // Decode and verify structure
      const decoded = JSON.parse(Buffer.from(dataPart, "base64url").toString());
      expect(decoded).toEqual(mockCredential);
    });
  });

  describe("registerPublicKey", () => {
    it("should register public key successfully", async () => {
      const mockResponse = { success: true, keyId: "key-123" };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await attester.registerPublicKey();

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.test/api/attesters/test-attester/keys",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: expect.stringContaining("Bearer ")
          })
        })
      );
    });

    it("should throw on registration failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error"
      });

      await expect(attester.registerPublicKey())
        .rejects.toThrow("Failed to register public key: Internal Server Error");
    });
  });

  describe("revokeAllCredentials", () => {
    it("should revoke all credentials successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true
      });

      await expect(attester.revokeAllCredentials("Security breach")).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.test/api/attesters/test-attester/revoke-all",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            reason: "Security breach",
            attesterId: "test-attester"
          })
        })
      );
    });

    it("should throw on revocation failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: "Unauthorized"
      });

      await expect(attester.revokeAllCredentials("Test"))
        .rejects.toThrow("Failed to revoke credentials: Unauthorized");
    });
  });
});

describe("AttesterRegistry", () => {
  let registry: AttesterRegistry;

  beforeEach(() => {
    registry = new AttesterRegistry();
  });

  describe("registerAttester", () => {
    it("should register attester successfully", async () => {
      const attesterInfo = {
        id: "attester-1",
        name: "Test Attester",
        url: "https://test.com",
        publicKeyJWK: { kty: "EC", crv: "P-256", x: "x", y: "y" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      await expect(registry.registerAttester(attesterInfo)).resolves.toBeUndefined();

      const retrieved = await registry.getAttester("attester-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("attester-1");
      expect(retrieved?.name).toBe("Test Attester");
    });

    it("should throw on missing id", async () => {
      const badInfo = {
        id: "",
        name: "Test",
        url: "https://test.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      await expect(registry.registerAttester(badInfo))
        .rejects.toThrow("Missing attester information");
    });

    it("should throw on missing public key", async () => {
      const badInfo = {
        id: "attester-1",
        name: "Test",
        url: "https://test.com",
        publicKeyJWK: null as any,
        status: "active" as const,
        registeredAt: new Date()
      };

      await expect(registry.registerAttester(badInfo))
        .rejects.toThrow("Missing attester information");
    });
  });

  describe("getAttester", () => {
    it("should return null for non-existent attester", async () => {
      const result = await registry.getAttester("non-existent");
      expect(result).toBeNull();
    });

    it("should return attester when exists", async () => {
      const attesterInfo = {
        id: "attester-1",
        name: "Test Attester",
        url: "https://test.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      await registry.registerAttester(attesterInfo);
      const result = await registry.getAttester("attester-1");

      expect(result).toEqual(attesterInfo);
    });
  });

  describe("listAttesters", () => {
    it("should return empty array when no attesters", async () => {
      const result = await registry.listAttesters();
      expect(result).toEqual([]);
    });

    it("should return only active attesters", async () => {
      const activeAttester = {
        id: "active-1",
        name: "Active Attester",
        url: "https://active.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      const suspendedAttester = {
        id: "suspended-1",
        name: "Suspended Attester",
        url: "https://suspended.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "suspended" as const,
        registeredAt: new Date()
      };

      await registry.registerAttester(activeAttester);
      await registry.registerAttester(suspendedAttester);

      const result = await registry.listAttesters();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("active-1");
    });
  });

  describe("suspendAttester", () => {
    it("should suspend active attester", async () => {
      const attesterInfo = {
        id: "attester-1",
        name: "Test Attester",
        url: "https://test.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      await registry.registerAttester(attesterInfo);
      await registry.suspendAttester("attester-1", "Security issue");

      const result = await registry.getAttester("attester-1");
      expect(result?.status).toBe("suspended");
    });

    it("should throw on non-existent attester", async () => {
      await expect(registry.suspendAttester("non-existent", "Test"))
        .rejects.toThrow("Attester not found");
    });
  });

  describe("revokeAttester", () => {
    it("should revoke attester", async () => {
      const attesterInfo = {
        id: "attester-1",
        name: "Test Attester",
        url: "https://test.com",
        publicKeyJWK: { kty: "EC" } as JsonWebKey,
        status: "active" as const,
        registeredAt: new Date()
      };

      await registry.registerAttester(attesterInfo);
      await registry.revokeAttester("attester-1");

      const result = await registry.getAttester("attester-1");
      expect(result?.status).toBe("revoked");
    });

    it("should throw on non-existent attester", async () => {
      await expect(registry.revokeAttester("non-existent"))
        .rejects.toThrow("Attester not found");
    });
  });
});