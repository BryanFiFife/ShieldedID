import { describe, it, expect, beforeEach } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";

beforeEach(() => {
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ walletId: "wallet-1", keys: [] })
    } as Response;
  }) as typeof fetch;
});

describe("security", () => {
  it("rejects malformed proofs", async () => {
    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const result = await verifier.verifyProof(request, {
      requestId: request.requestId,
      nonce: "bad-nonce",
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "pairwise-123",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "P256",
      signature: "bad"
    });

    expect(result.valid).toBe(false);
  });
});
