import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateProof } from "../../src/lib/proof-generator";
import { createEmptyVault } from "../../src/lib/vault";
import { createSigningKey } from "../../src/lib/keys";

// The hardened proof generator proves issuer-attested numeric witnesses via the
// real Bulletproof WASM (prove_le_attested for AGE_OVER, prove_ge_attested for
// KYC_LEVEL). It no longer consults the obsolete zk-agent. Here we mock the WASM
// boundary so we can assert the wallet's policy (issuer-bound witness required,
// minimal disclosure, signed response) without a full WASM round trip. The real
// cryptographic round trip is exercised by apps/registry-server/tests/e2e-real.
vi.mock("@shielded-id/age-zk", () => ({
  prove_le_attested: vi.fn().mockResolvedValue({
    commitment: new Uint8Array(32).fill(1),
    proof: new Uint8Array(670).fill(2),
    public_inputs: new TextEncoder().encode("9000|18|ctx")
  }),
  prove_ge_attested: vi.fn().mockResolvedValue({
    commitment: new Uint8Array(32).fill(3),
    proof: new Uint8Array(670).fill(4),
    public_inputs: new TextEncoder().encode("2|2|ctx")
  })
}));

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function makeWitness(attribute: "DOB_YYYYMMDD" | "KYC_LEVEL", value: number) {
  const commitment = new Uint8Array(32).fill(attribute === "DOB_YYYYMMDD" ? 1 : 3);
  return {
    value,
    blinding: b64(new Uint8Array(32).fill(9)),
    attestation: {
      version: "SID-COMMITMENT-1" as const,
      credentialId: "cred-1",
      attribute,
      commitment: b64(commitment),
      issuerDid: "did:example:issuer",
      keyId: "issuer-key-1",
      issuedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      signature: "mock-issuer-signature"
    }
  };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req-1",
    nonce: "nonce-1",
    issuedAt: new Date(Date.now() - 5000).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    verifierOrigin: "https://shop.example",
    requestedClaims: [{ type: "AGE_OVER" }],
    ...overrides
  };
}

describe("proof generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates signed proof responses from an issuer-attested witness", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {
        DOB_YYYYMMDD: makeWitness("DOB_YYYYMMDD", 19900101)
      }
    };

    const request = buildRequest();
    const response = await generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase });

    expect(response.signature).toBeTruthy();
    expect(response.pairwiseSubjectId).toBeTruthy();
    expect(response.suite).toBe("BULLETPROOFS_RISTRETTO_BOUND_V2");
    expect(response.claims[0].value).toBe(true);
    expect(response.zkProofs?.[0]).toBeDefined();
    // No raw witness (DOB) must leak into the disclosed payload.
    expect(JSON.stringify(response)).not.toContain("19900101");
  });

  it("fails closed when the requested AGE_OVER witness is not issuer-attested", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {}
    };

    const request = buildRequest({ requestedClaims: [{ type: "AGE_OVER" }] });
    await expect(
      generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase })
    ).rejects.toThrow("ISSUER_ATTESTATION_REQUIRED:AGE_OVER");
  });

  it("fails closed when the KYC_LEVEL witness is missing", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {}
    };

    const request = buildRequest({ requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }] });
    await expect(
      generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase })
    ).rejects.toThrow("ISSUER_ATTESTATION_REQUIRED:KYC_LEVEL");
  });

  it("rejects an expired request", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {
        DOB_YYYYMMDD: makeWitness("DOB_YYYYMMDD", 19900101)
      }
    };

    const request = buildRequest({ expiresAt: new Date(Date.now() - 60_000).toISOString() });
    await expect(
      generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase })
    ).rejects.toThrow();
  });

  it("includes the pairwise subject id in the response", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {}
    };

    const request = buildRequest({ requestedClaims: [{ type: "CONTINUITY" }] });
    const response = await generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase });

    expect(response.pairwiseSubjectId).toBeTruthy();
    expect(typeof response.pairwiseSubjectId).toBe("string");
    expect(response.claims[0]).toMatchObject({ type: "CONTINUITY", value: response.pairwiseSubjectId });
  });

  it("handles a CONTINUITY claim type correctly", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {}
    };

    const request = buildRequest({ requestedClaims: [{ type: "CONTINUITY" }] });
    const response = await generateProof(request, vault, { walletId: "wallet-1", keyId: "key-1", passphrase });

    const continuityClaim = response.claims?.find((c) => c.type === "CONTINUITY");
    expect(continuityClaim).toBeTruthy();
    expect(continuityClaim?.value).toBe(response.pairwiseSubjectId);
    // CONTINUITY does not require a ZK proof and must not emit one.
    expect(response.zkProofs).toBeUndefined();
  });

  it("generates different proof material for different nonces", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {
        DOB_YYYYMMDD: makeWitness("DOB_YYYYMMDD", 19900101)
      }
    };

    const r1 = buildRequest({ nonce: "nonce-a", requestId: "req-a" });
    const r2 = buildRequest({ nonce: "nonce-b", requestId: "req-b" });
    const response1 = await generateProof(r1, vault, { walletId: "wallet-1", keyId: "key-1", passphrase });
    const response2 = await generateProof(r2, vault, { walletId: "wallet-1", keyId: "key-1", passphrase });

    // Different contexts/nonces bind into the signed payload and signature.
    expect(response1.signature).not.toBe(response2.signature);
  });

  it("handles multiple requested claims including KYC and CONTINUITY", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      signingKeyId: "key-1",
      numericWitnesses: {
        DOB_YYYYMMDD: makeWitness("DOB_YYYYMMDD", 19850620),
        KYC_LEVEL: makeWitness("KYC_LEVEL", 2)
      }
    };

    const request = buildRequest({
      requestedClaims: [
        { type: "AGE_OVER" },
        { type: "KYC_LEVEL", minLevel: 1 },
        { type: "CONTINUITY" }
      ]
    });
    const response = await generateProof(request, vault, { walletId: "wallet-2", keyId: "key-1", passphrase });

    expect(response.signature).toBeTruthy();
    expect(response.claims.map((c) => c.type)).toEqual(["AGE_OVER", "KYC_LEVEL", "CONTINUITY"]);
    expect(response.claims.map((c) => c.value)).toEqual([true, true, response.pairwiseSubjectId]);
    expect(Object.keys(response.zkProofs ?? {})).toHaveLength(2);
  });
});
