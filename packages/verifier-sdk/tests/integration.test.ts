import { describe, it, expect, beforeEach } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import { stableStringify } from "../src/utils.js";
import { verifyECDSAP256 } from "../src/crypto.js";

async function generateKeyPair() {
  return globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

async function signPayload(privateKey: CryptoKey, payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(payload));
  const signature = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return Buffer.from(signature).toString("base64url");
}

const EC_KEY_X = "K2qXxZ7SlNztC7zH8O2kGV8zM5sQ1aJ3oP9dF6yW4vA";
const EC_KEY_Y = "b8lE4vN1sQ6rA9wC3dF7gH2jK5mP0sT4uX8yZ1eO5cI";

function contextFor(request: { verifierOrigin: string; nonce: string; expiresAt: string }): string {
  return `${request.verifierOrigin}|${request.nonce}|${request.expiresAt}`;
}

/**
 * Real issuer → registry → wallet → verifier integration at the SDK level.
 *
 * The full multi-entity flow (real registry on an ephemeral port, real P-256
 * issuer key, proof-of-possession wallet registration, genuine issuer-bound
 * Bulletproof, and adversarial revocation) is exercised by
 * `apps/registry-server/tests/e2e-real.test.ts` which boots the real registry.
 *
 * This suite covers the verifier's cryptographic enforcement directly: it signs
 * a real payload with a real wallet key, and asserts the verifier fails closed
 * on signature tampering and on revoked keys. It does NOT mock successful
 * verification.
 */
describe("integration", () => {
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
      if (url.includes("/v1/keys/key-1/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => globalAny.__keyStatus
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;
  });

  it("verifies a wallet-signed proof with an active key", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
    };
    globalAny.__walletStatus = {
      walletId: "wallet-1",
      status: "ACTIVE",
      keys: [{ keyId: "key-1", status: "ACTIVE", publicKey: jwk }]
    };
    globalAny.__keyStatus = { status: "ACTIVE", revokedAt: null, expiresAt: "2099-12-31T23:59:59Z", createdAt: "2024-01-01T00:00:00Z" };

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    // CONTINUITY-only request: no ZK predicate, so the ECDSA wallet signature is
    // the verifier's cryptographic anchor for this response.
    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-1234567890abcdef",
      claims: [{ type: "CONTINUITY", value: "pairwise-1234567890abcdef" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: ""
    };

    const payload = { ...proofResponse };
    delete (payload as { signature?: string }).signature;
    proofResponse.signature = await signPayload(privateKey, payload);

    const result = await verifier.verifyProof(request, proofResponse, { checkRevocation: true });
    expect(result.valid).toBe(true);
    expect(result.pairwiseSubjectId).toBe("pairwise-1234567890abcdef");
  });

  it("rejects a proof whose wallet signature was tampered with", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
    };
    globalAny.__walletStatus = {
      walletId: "wallet-1",
      status: "ACTIVE",
      keys: [{ keyId: "key-1", status: "ACTIVE", publicKey: jwk }]
    };
    globalAny.__keyStatus = { status: "ACTIVE", revokedAt: null, expiresAt: "2099-12-31T23:59:59Z", createdAt: "2024-01-01T00:00:00Z" };

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-1234567890abcdef",
      claims: [{ type: "CONTINUITY", value: "pairwise-1234567890abcdef" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
      signature: ""
    };
    const payload = { ...proofResponse };
    delete (payload as { signature?: string }).signature;
    proofResponse.signature = await signPayload(privateKey, payload);

    // Tamper: change the pairwise subject id after signing.
    proofResponse.pairwiseSubjectId = "attacker-controlled";

    const result = await verifier.verifyProof(request, proofResponse, { checkRevocation: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_WALLET_SIGNATURE");
  });

  it("rejects revoked wallet keys", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;

    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
    };
    globalAny.__walletStatus = {
      walletId: "wallet-1",
      status: "ACTIVE",
      keys: [{ keyId: "key-1", status: "ACTIVE", publicKey: jwk }]
    };
    globalAny.__keyStatus = { status: "REVOKED", revokedAt: "2024-01-01T00:00:00Z", expiresAt: "2099-12-31T23:59:59Z", createdAt: "2024-01-01T00:00:00Z" };

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CONTINUITY" }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-1234567890abcdef",
      claims: [{ type: "CONTINUITY", value: "pairwise-1234567890abcdef" }],
      suite: "ECDSA_P256_SHA256_1.0.0",
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
