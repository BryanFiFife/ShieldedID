import { describe, it, expect, beforeEach } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import { stableStringify } from "../src/utils.js";

async function generateKeyPair() {
  return globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

async function signPayload(privateKey: CryptoKey, payload: unknown) {
  const data = new TextEncoder().encode(stableStringify(payload));
  const signature = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return Buffer.from(signature).toString("base64");
}

beforeEach(() => {
  const globalAny = globalThis as unknown as {
    __walletStatus?: unknown;
    __keyStatus?: unknown;
  };
  globalThis.fetch = (async (url: string) => {
    if (url.includes("/v1/status/wallet-1")) {
      return {
        ok: true,
        status: 200,
        json: async () => globalAny.__walletStatus
      } as Response;
    }
    if (url.includes("/v1/status/key-1") || url.includes("/v1/keys/key-1/status")) {
      return {
        ok: true,
        status: 200,
        json: async () => globalAny.__keyStatus
      } as Response;
    }
    if (url.includes(".well-known/shielded-id-keys.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ keys: [] })
      } as Response;
    }
    return { ok: false, status: 500, json: async () => ({}) } as Response;
  }) as typeof fetch;
});

describe("integration", () => {
  it("verifies a full proof flow", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
    };
    globalAny.__walletStatus = {
      walletId: "wallet-1",
      keys: [{ keyId: "key-1", status: "ACTIVE", publicKey: jwk }]
    };
    globalAny.__keyStatus = { status: "ACTIVE", revokedAt: null, expiresAt: "2099-12-31T23:59:59Z", createdAt: "2024-01-01T00:00:00Z" };

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-123",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "P256",
      signature: ""
    };

    const payload = { ...proofResponse };
    delete (payload as { signature?: string }).signature;
    proofResponse.signature = await signPayload(privateKey, payload);

    const result = await verifier.verifyProof(request, proofResponse, { checkRevocation: true });
    expect(result.valid).toBe(true);
    expect(result.pairwiseSubjectId).toBe("pairwise-123");
  });

  it("rejects revoked keys", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
    };
    globalAny.__walletStatus = {
      walletId: "wallet-1",
      keys: [{ keyId: "key-1", status: "ACTIVE", publicKey: jwk }]
    };
    globalAny.__keyStatus = { status: "REVOKED", revokedAt: "2024-01-01T00:00:00Z", expiresAt: "2099-12-31T23:59:59Z", createdAt: "2024-01-01T00:00:00Z" };

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-123",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "P256",
      signature: ""
    };

    const payload = { ...proofResponse };
    delete (payload as { signature?: string }).signature;
    proofResponse.signature = await signPayload(privateKey, payload);

    const result = await verifier.verifyProof(request, proofResponse, { checkRevocation: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_REVOKED");
  });
});
