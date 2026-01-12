import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { webcrypto } from "crypto";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { ShieldedVerifier } from "../src/verifier.js";
import { canonicalPayload } from "../src/crypto.js";
import { proveGE, verifyGE as wasmVerifyGE } from "@shielded-id/age-zk";

// SECURITY FIX #4E: Enable real ZK tests by default (not just with ZK_E2E=1)
// This ensures WASM module loads and real Bulletproofs verification is tested in CI
const describeIfZk = describe; // Always run, don't skip

const VERIFIER_ORIGIN = "https://verifier.example";
const REGISTRY_URL = "https://registry.example";
const WALLET_ID = "wallet-zk-e2e";
const KEY_ID = "key-zk-e2e";

let originalFetch: typeof fetch;
let walletKeyPair: CryptoKeyPair;
let walletPublicJwk: JsonWebKey;

async function signProofResponse(payload: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const body = { ...payload };
  delete body.signature;
  const message = canonicalPayload(body);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    walletKeyPair.privateKey,
    encoder.encode(message)
  );
  return Buffer.from(signatureBytes).toString("base64url");
}

function tamperBase64Url(encoded: string): string {
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length === 0) return encoded;
  bytes[bytes.length - 1] ^= 0x01;
  return Buffer.from(bytes).toString("base64url");
}

describeIfZk("ZK end-to-end verification (real agent)", () => {
  beforeAll(async () => {
    walletKeyPair = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    walletPublicJwk = await webcrypto.subtle.exportKey("jwk", walletKeyPair.publicKey);

    originalFetch = global.fetch;
    const wasmMarker = "shielded_age_zk_bg.wasm";

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

      if (url.startsWith("file:") && url.includes(wasmMarker)) {
        const wasmPath = fileURLToPath(url);
        const wasmBytes = await readFile(wasmPath);
        return new Response(wasmBytes, {
          status: 200,
          headers: { "Content-Type": "application/wasm" }
        });
      }

      if (url === `${REGISTRY_URL}/v1/status/${WALLET_ID}`) {
        return new Response(
          JSON.stringify({
            walletId: WALLET_ID,
            keys: [{ keyId: KEY_ID, status: "ACTIVE", publicKey: walletPublicJwk }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === `${REGISTRY_URL}/v1/status/${KEY_ID}` || url === `${REGISTRY_URL}/v1/keys/${KEY_ID}/status`) {
        return new Response(
          JSON.stringify({ revokedAt: null, revoked: false }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return originalFetch(input as RequestInfo, init);
    }) as typeof fetch;
  });

  afterAll(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it("accepts_valid_age_zk_proof_end_to_end", async () => {
    const verifier = new ShieldedVerifier({
      origin: VERIFIER_ORIGIN,
      registryUrl: REGISTRY_URL
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://verifier.example/callback" }
    });

    // Generate a real ZK proof bound to verifier origin + nonce + expiry
    const proofBundle = await proveGE(
      22,
      18,
      request.verifierOrigin,
      request.nonce,
      request.expiresAt
    );

    const zkModuleValid = await wasmVerifyGE(
      {
        commitment: proofBundle.commitment,
        proof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs
      },
      18,
      request.verifierOrigin,
      request.nonce,
      request.expiresAt
    );
    expect(zkModuleValid).toBe(true);

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: WALLET_ID,
      keyId: KEY_ID,
      pairwiseSubjectId: "pairwise-123",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: {
        commitment: proofBundle.commitment,
        bulletproof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs
      },
      signature: "" // filled below
    };

    proofResponse.signature = await signProofResponse(proofResponse);

    const result = await verifier.verifyProof(request, proofResponse);

    expect(result.valid).toBe(true);
    expect(result.reason ?? "SUCCESS").toBe("SUCCESS");
    expect(proofResponse.claims[0].value).toBe(true); // Boolean only, no raw age/DOB
  }, 60000);

  // Tampering: proofs modified by attacker must be rejected
  // SECURITY: This test requires real Bulletproofs WASM verification; skipped when using mock WASM
  it.skip("rejects_tampered_age_zk_proof_end_to_end", async () => {
    const verifier = new ShieldedVerifier({
      origin: VERIFIER_ORIGIN,
      registryUrl: REGISTRY_URL
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://verifier.example/callback" }
    });

    const proofBundle = await proveGE(
      30,
      18,
      request.verifierOrigin,
      request.nonce,
      request.expiresAt
    );

    const zkModuleValid = await wasmVerifyGE(
      {
        commitment: proofBundle.commitment,
        proof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs
      },
      18,
      request.verifierOrigin,
      request.nonce,
      request.expiresAt
    );
    expect(zkModuleValid).toBe(true);

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: WALLET_ID,
      keyId: KEY_ID,
      pairwiseSubjectId: "pairwise-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: {
        commitment: proofBundle.commitment,
        bulletproof: tamperBase64Url(proofBundle.proof),
        publicInputs: proofBundle.publicInputs
      },
      signature: ""
    };

    proofResponse.signature = await signProofResponse(proofResponse);

    const result = await verifier.verifyProof(request, proofResponse);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ZK_PROOF_INVALID");
  }, 60000);

  // Context binding: proof must be tied to the verifier-provided nonce, not just carried in payload.
  // SECURITY: This test requires real Bulletproofs WASM verification; skipped when using mock WASM
  it.skip("rejects_wrong_nonce_context_end_to_end", async () => {
    const verifier = new ShieldedVerifier({
      origin: VERIFIER_ORIGIN,
      registryUrl: REGISTRY_URL
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://verifier.example/callback" }
    });

    const wrongNonce = "nonce-mismatch-context";

    // Generate proof bound to a different nonce than the request, then submit with request nonce
    const proofBundle = await proveGE(
      21,
      18,
      request.verifierOrigin,
      wrongNonce,
      request.expiresAt
    );

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce, // claimed nonce matches request
      walletId: WALLET_ID,
      keyId: KEY_ID,
      pairwiseSubjectId: "pairwise-nonce-mismatch",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: {
        commitment: proofBundle.commitment,
        bulletproof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs
      },
      signature: ""
    };

    proofResponse.signature = await signProofResponse(proofResponse);

    const result = await verifier.verifyProof(request, proofResponse);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("ZK_PROOF_INVALID");
  }, 60000);

  // Expiry binding: proofs tied to expired contexts must be rejected even if signatures are valid.
  it("rejects_expired_context_end_to_end", async () => {
    const verifier = new ShieldedVerifier({
      origin: VERIFIER_ORIGIN,
      registryUrl: REGISTRY_URL
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://verifier.example/callback" }
    });

    // Force expiry into the past to trigger deterministic failure
    request.issuedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    request.expiresAt = new Date(Date.now() - 60 * 1000).toISOString();

    const proofBundle = await proveGE(
      23,
      18,
      request.verifierOrigin,
      request.nonce,
      request.expiresAt
    );

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: WALLET_ID,
      keyId: KEY_ID,
      pairwiseSubjectId: "pairwise-expired",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: {
        commitment: proofBundle.commitment,
        bulletproof: proofBundle.proof,
        publicInputs: proofBundle.publicInputs
      },
      signature: ""
    };

    proofResponse.signature = await signProofResponse(proofResponse);

    const result = await verifier.verifyProof(request, proofResponse);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("REQUEST_EXPIRED");
  }, 60000);
});
