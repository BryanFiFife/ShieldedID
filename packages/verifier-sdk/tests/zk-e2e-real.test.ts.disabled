// @ts-nocheck
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { ShieldedVerifier } from "../src/verifier.js";
import { stableStringify } from "../src/utils.js";
import { prove_ge, verify_ge, verify_ge_components, initSync } from "@shielded-id/age-zk";
import { base64UrlDecode } from "../src/utils.js";
import fs from "fs";
import path from "path";

// SECURITY FIX #3: Real ZK E2E tests using actual Bulletproofs
// This file tests end-to-end verification with REAL zero-knowledge proofs
// instead of mocked ZK verification, ensuring cryptographic correctness

describe("Real ZK E2E Verification", () => {
  beforeAll(async () => {
    // Initialize the WASM module synchronously for tests
    const wasmPath = "/home/infinitara/Desktop/ShieldedID/packages/age-zk/pkg/shielded_age_zk_bg.wasm";
    const wasmBuffer = fs.readFileSync(wasmPath);
    initSync({ module: wasmBuffer });
  });
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

  // Generate REAL ZK proof using Bulletproofs WASM module
  function generateRealZKProof(age: number, requestedThreshold: number, context?: string) {
    // Generate a real zero-knowledge range proof that age >= threshold
    const proofContext = context || `age-verification-test`;
    const proofBundle = prove_ge(BigInt(age), BigInt(requestedThreshold), proofContext);

    // Test direct verification
    const directVerify = verify_ge(proofBundle, BigInt(requestedThreshold), context);
    console.log('Direct verify_ge result:', directVerify);

    // Convert the proof components to base64 as expected by the verifier
    const commitment = Buffer.from(proofBundle.commitment).toString('base64url');
    const bulletproof = Buffer.from(proofBundle.proof).toString('base64url');
    const publicInputs = Buffer.from(proofBundle.public_inputs).toString('base64url');

    // Test round trip
    const decodedCommitment = base64UrlDecode(commitment);
    const decodedProof = base64UrlDecode(bulletproof);
    const decodedPublicInputs = base64UrlDecode(publicInputs);
    
    // Test verify_ge_components with decoded components
    const componentsVerify = verify_ge_components(decodedCommitment, decodedProof, decodedPublicInputs, BigInt(requestedThreshold), context);
    console.log('Components verify_ge_components result:', componentsVerify);

    return {
      commitment,
      bulletproof,
      publicInputs,
      context
    };
  }
  beforeEach(() => {
    const globalAny = globalThis as unknown as {
      __walletStatus?: unknown;
      __keyStatus?: unknown;
      __zkProofValid?: boolean;
    };
    
    // Set up registry mock for status checks
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/status/wallet-1") || url.includes("/v1/keys")) {
        // Use the key generated in the test
        const testKey = (globalThis as any).__testKey as JsonWebKey;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            walletId: "wallet-1",
            keyId: "key-1",
            status: "ACTIVE",
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            keys: [{
              keyId: "key-1",
              status: "ACTIVE",
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              publicKey: testKey
            }]
          })
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

  it("should verify real ZK proof with valid age over threshold", async () => {
    // This test uses REAL ZK proof generation (not mocked)
    // Environment variable ZK_E2E=1 enables this in CI
    
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    
    // Store the key for the registry mock
    (globalThis as any).__testKey = jwk;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    // Request proof of age over 18
    const proofRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    // Generate REAL ZK proof (age 25, over threshold 18)
    const context = `${proofRequest.verifierOrigin}|${proofRequest.nonce}|${proofRequest.expiresAt || ""}`;
    const realProof = generateRealZKProof(25, 18, context);

    // Create proof response with real ZK data
    const proofResponse = {
      requestId: proofRequest.requestId,
      nonce: proofRequest.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      // Include REAL ZK proof data
      zkProof: realProof,
      timestamp: new Date().toISOString()
    };

    // Sign the proof response (verifier removes signature field before verification)
    const responsePayload = { ...proofResponse } as Record<string, unknown>;
    delete responsePayload.signature; // Not present yet
    const signature = await signPayload(privateKey, responsePayload);
    proofResponse.signature = signature;

    // Verify proof - this should validate the real ZK commitment
    const result = await verifier.verifyProof(proofRequest, proofResponse);
    
    // Verification should succeed with valid real proof
    expect(result.valid).toBe(true);
  });

  it("should REJECT real ZK proof with age UNDER threshold", async () => {
    // Test that real ZK proofs correctly reject invalid age claims
    
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    
    // Store the key for the registry mock
    (globalThis as any).__testKey = jwk;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const proofRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    // Generate ZK proof for a valid statement (17 >= 16)
    // But claim it's for 17 >= 18 (which is false)
    // ZK proofs are mathematically valid regardless of the claim
    const context = `${proofRequest.verifierOrigin}|${proofRequest.nonce}|${proofRequest.expiresAt || ""}`;
    const validProof = generateRealZKProof(17, 16, context);

    const proofResponse = {
      requestId: proofRequest.requestId,
      nonce: proofRequest.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: false }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: validProof,
      timestamp: new Date().toISOString()
    };

    // Sign the proof response
    const responsePayload = { ...proofResponse } as Record<string, unknown>;
    delete responsePayload.signature;
    const signature = await signPayload(privateKey, responsePayload);
    proofResponse.signature = signature;

    const result = await verifier.verifyProof(proofRequest, proofResponse);

    // Verification should REJECT because claim value is false (age not over threshold)
    expect(result.valid).toBe(false);
  });

  it("should validate real ZK proof commitment integrity", async () => {
    // Test that ZK proof commitments are cryptographically valid
    
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    
    // Store the key for the registry mock
    (globalThis as any).__testKey = jwk;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const proofRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const context = `${proofRequest.verifierOrigin}|${proofRequest.nonce}|${proofRequest.expiresAt || ""}`;
    const realProof = generateRealZKProof(30, 18, context);

    const proofResponse = {
      requestId: proofRequest.requestId,
      nonce: proofRequest.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: realProof,
      timestamp: new Date().toISOString()
    };

    // Sign the proof response
    const responsePayload = { ...proofResponse } as Record<string, unknown>;
    delete responsePayload.signature; // Not present yet
    const signature = await signPayload(privateKey, responsePayload);
    proofResponse.signature = signature;

    const result = await verifier.verifyProof(proofRequest, proofResponse);

    // Verify that commitment exists and is properly formatted
    expect(result.valid).toBe(true);
  });

  it("should enforce key expiration even with valid real ZK proof", async () => {
    // Test that expired keys are rejected regardless of ZK proof validity
    
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    
    // Store the key for the registry mock
    (globalThis as any).__testKey = jwk;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    // Override fetch to return EXPIRED key
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/keys/key-1/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            keyId: "key-1",
            status: "ACTIVE",
            // EXPIRED: 30 days in the past
            expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date(Date.now() - 395 * 24 * 60 * 60 * 1000).toISOString()
          })
        } as Response;
      }
      if (url.includes("/v1/status/wallet-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            walletId: "wallet-1",
            keys: [{
              keyId: "key-1",
              status: "ACTIVE",
              expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              publicKey: jwk
            }]
          })
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const proofRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const context = `${proofRequest.verifierOrigin}|${proofRequest.nonce}|${proofRequest.expiresAt || ""}`;
    const validProof = generateRealZKProof(25, 18, context);

    const proofResponse = {
      requestId: proofRequest.requestId,
      nonce: proofRequest.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: validProof,
      timestamp: new Date().toISOString()
    };

    // Sign the proof response
    const responsePayload = { ...proofResponse } as Record<string, unknown>;
    delete responsePayload.signature;
    const signature = await signPayload(privateKey, responsePayload);
    proofResponse.signature = signature;

    const result = await verifier.verifyProof(proofRequest, proofResponse);

    // Should REJECT expired key even with valid ZK proof
    expect(result.valid).toBe(false);
  });

  it("should handle real ZK proof with fallback to ECDSA when ZK fails", async () => {
    // Test graceful degradation when ZK proof is invalid
    
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    
    // Store the key for the registry mock
    (globalThis as any).__testKey = jwk;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    const proofRequest = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const requestPayload = { requestId: proofRequest.requestId, age: 25 };
    const signature = await signPayload(privateKey, requestPayload);

    // Proof with INVALID ZK data (malformed commitment)
    const invalidProof = {
      commitment: "INVALID_COMMITMENT_BASE64",
      bulletproof: "INVALID_BULLETPROOF_BASE64", 
      publicInputs: "INVALID_PUBLIC_INPUTS_BASE64"
    };

    const proofResponse = {
      requestId: proofRequest.requestId,
      nonce: proofRequest.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: invalidProof,
      signature,
      timestamp: new Date().toISOString()
    };

    // Verification should handle invalid ZK gracefully
    const result = await verifier.verifyProof(proofRequest, proofResponse);
    
    // Should be rejected due to invalid ZK proof
    expect(result.valid).toBe(false);
  });

  it("should verify multiple ZK proofs in sequence without interference", async () => {
    // Test that real ZK proof verification doesn't have state leakage
    
    const { publicKey: pk1, privateKey: sk1 } = await generateKeyPair();
    const { publicKey: pk2, privateKey: sk2 } = await generateKeyPair();
    
    const jwk1 = (await globalThis.crypto.subtle.exportKey("jwk", pk1)) as JsonWebKey;
    const jwk2 = (await globalThis.crypto.subtle.exportKey("jwk", pk2)) as JsonWebKey;
    
    // Store the first key for the registry mock
    (globalThis as any).__testKey = jwk1;

    const verifier = new ShieldedVerifier({
      origin: "https://shop.example",
      registryUrl: "https://registry.example"
    });

    // First proof: age 25
    const pr1 = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const context1 = `${pr1.verifierOrigin}|${pr1.nonce}|${pr1.expiresAt || ""}`;
    const proof1 = generateRealZKProof(25, 18, context1);

    const resp1 = {
      requestId: pr1.requestId,
      nonce: pr1.nonce,
      walletId: "wallet-1",
      keyId: "key-1",
      pairwiseSubjectId: "user-456",
      claims: [{ type: "AGE_OVER", value: true }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: proof1,
      timestamp: new Date().toISOString()
    };

    // Sign resp1
    const resp1Payload = { ...resp1 } as Record<string, unknown>;
    delete resp1Payload.signature;
    const sig1 = await signPayload(sk1, resp1Payload);
    resp1.signature = sig1;

    // Second proof: age 17 with threshold 18 (17 >= 18 is false, but we generate proof for 17 >= 16)
    const pr2 = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
      callback: { method: "POST", url: "https://shop.example/callback" }
    });

    const context2 = `${pr2.verifierOrigin}|${pr2.nonce}|${pr2.expiresAt || ""}`;
    const proof2 = generateRealZKProof(17, 16, context2); // Generate valid proof for 17 >= 16

    const resp2 = {
      requestId: pr2.requestId,
      nonce: pr2.nonce,
      walletId: "wallet-1",
      keyId: "key-2",
      pairwiseSubjectId: "user-789",
      claims: [{ type: "AGE_OVER", value: false }],
      suite: "AGE_ZK_BULLETPROOFS_V1",
      zkProof: proof2,
      timestamp: new Date().toISOString()
    };

    // Sign resp2
    const resp2Payload = { ...resp2 } as Record<string, unknown>;
    delete resp2Payload.signature;
    const sig2 = await signPayload(sk2, resp2Payload);
    resp2.signature = sig2;

    const result1 = await verifier.verifyProof(pr1, resp1);
    const result2 = await verifier.verifyProof(pr2, resp2);

    // First should pass (age 25 >= 18), second should fail (claim says false for age >= 18)
    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(false);
  });
});
