import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AttesterRegistry,
  ShieldedAttester,
  type AttesterConfig,
  type NumericCommitmentAttestation
} from "./attester";

const PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEILRptTFvHC4vUpUFL25ayiJoUP7QwrytO8SDykTsJm+XoAoGCCqGSM49
AwEHoUQDQgAEHWx+bncmpTt2TQpsync5qNUkj+1Y3WO4obJ0lNn43NkINtNetB/+
UTKEVTynPuwyor7Dotzzgc+EyI6eWDsJZg==
-----END EC PRIVATE KEY-----`;
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHWx+bncmpTt2TQpsync5qNUkj+1Y
3WO4obJ0lNn43NkINtNetB/+UTKEVTynPuwyor7Dotzzgc+EyI6eWDsJZg==
-----END PUBLIC KEY-----`;

function config(overrides: Partial<AttesterConfig> = {}): AttesterConfig {
  return {
    attesterId: "test-attester",
    attestorName: "Test Attester",
    attestorUrl: "https://issuer.example",
    registryUrl: "https://registry.example",
    privateKeyPem: PRIVATE_KEY,
    publicKeyPem: PUBLIC_KEY,
    registryAuthToken: "registry-token",
    ...overrides
  };
}

describe("ShieldedAttester", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exports a real P-256 JWK", () => {
    const jwk = new ShieldedAttester(config()).exportPublicKeyJWK();
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(jwk.x).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jwk.y).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(jwk.x).not.toContain("placeholder");
    expect(jwk.y).not.toContain("placeholder");
  });

  it("issues independently signed DOB and KYC source commitments", async () => {
    const attester = new ShieldedAttester(config());
    const issued = await attester.issueCredential(
      "user-123",
      { dateOfBirth: "2000-05-15", kycLevel: 3, name: "Alice" },
      "2027-08-24T00:00:00.000Z"
    );

    expect(await attester.verifyCredential(issued.credential, issued.signature)).toBe(true);
    expect(issued.numericWitnesses.DOB_YYYYMMDD?.value).toBe(20000515);
    expect(issued.numericWitnesses.KYC_LEVEL?.value).toBe(3);

    for (const witness of Object.values(issued.numericWitnesses)) {
      expect(witness).toBeDefined();
      expect(witness!.blinding).not.toBe("");
      expect(witness!.attestation.commitment).not.toBe("");
      expect(await attester.verifyCommitmentAttestation(witness!.attestation)).toBe(true);
    }
  });

  it("rejects tampered commitment attestations", async () => {
    const attester = new ShieldedAttester(config());
    const issued = await attester.issueCredential(
      "user-123",
      { kycLevel: 2 },
      "2027-08-24T00:00:00.000Z"
    );
    const original = issued.numericWitnesses.KYC_LEVEL!.attestation;
    const tampered: NumericCommitmentAttestation = { ...original, commitment: `${original.commitment}A` };
    expect(await attester.verifyCommitmentAttestation(tampered)).toBe(false);
  });

  it("rejects invalid and expired issuance inputs", async () => {
    const attester = new ShieldedAttester(config());
    await expect(attester.issueCredential("", { kycLevel: 2 }, "2027-08-24T00:00:00.000Z"))
      .rejects.toThrow("userId required");
    await expect(attester.issueCredential("u", {}, "2027-08-24T00:00:00.000Z"))
      .rejects.toThrow("attributes required");
    await expect(attester.issueCredential("u", { kycLevel: 9 }, "2027-08-24T00:00:00.000Z"))
      .rejects.toThrow("kycLevel");
    await expect(attester.issueCredential("u", { kycLevel: 2 }, "2020-01-01T00:00:00Z"))
      .rejects.toThrow("future");
  });

  it("generates an actual QR image data URL", async () => {
    const attester = new ShieldedAttester(config());
    const issued = await attester.issueCredential(
      "user-123",
      { kycLevel: 2 },
      "2027-08-24T00:00:00.000Z"
    );
    const qr = await attester.generateQRCode(issued);
    expect(qr).toMatch(/^data:image\/png;base64,/);
  });

  it("requires explicit registry authentication and sends the real JWK", async () => {
    const unauthenticated = new ShieldedAttester(config({ registryAuthToken: undefined }));
    await expect(unauthenticated.registerPublicKey()).rejects.toThrow("REGISTRY_AUTH_TOKEN_REQUIRED");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, keyId: "test-attester#signing-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const authenticated = new ShieldedAttester(config());
    await authenticated.registerPublicKey();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(init.headers.Authorization).toBe("Bearer registry-token");
    expect(body.publicKey.x).toBeTruthy();
    expect(body.publicKey.y).toBeTruthy();
    expect(body.publicKey.x).not.toContain("placeholder");
  });
});

describe("AttesterRegistry", () => {
  it("accepts only P-256 issuer keys and tracks status", async () => {
    const registry = new AttesterRegistry();
    const jwk = new ShieldedAttester(config()).exportPublicKeyJWK();
    await registry.registerAttester({
      id: "a1",
      name: "Issuer",
      url: "https://issuer.example",
      publicKeyJWK: jwk,
      status: "active",
      registeredAt: new Date()
    });
    expect((await registry.listAttesters()).map((a) => a.id)).toEqual(["a1"]);
    await registry.suspendAttester("a1", "incident");
    expect(await registry.listAttesters()).toEqual([]);
    await registry.revokeAttester("a1");
    expect((await registry.getAttester("a1"))?.status).toBe("revoked");
  });

  it("rejects non-P-256 keys", async () => {
    const registry = new AttesterRegistry();
    await expect(registry.registerAttester({
      id: "bad",
      name: "Bad",
      url: "https://bad.example",
      publicKeyJWK: { kty: "RSA" },
      status: "active",
      registeredAt: new Date()
    })).rejects.toThrow("P-256");
  });
});
