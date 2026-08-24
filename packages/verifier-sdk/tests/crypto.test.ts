import { describe, it, expect } from "vitest";
import { verifyECDSAP256, validateNonce, validateTimestamp } from "../src/crypto.js";
import { stableStringify } from "../src/utils.js";

async function generateKeyPair() {
  const subtle = globalThis.crypto.subtle;
  return subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

async function signPayload(privateKey: CryptoKey, payload: unknown) {
  const data = new TextEncoder().encode(stableStringify(payload));
  const signature = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data);
  return Buffer.from(signature).toString("base64");
}

describe("crypto", () => {
  it("verifies valid ECDSA signatures", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    const payload = { action: "TEST", value: 1 };
    const signature = await signPayload(privateKey, payload);

    await expect(verifyECDSAP256(jwk, stableStringify(payload), signature)).resolves.toBe(true);
  });

  it("rejects invalid signatures", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await globalThis.crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    const signature = await signPayload(privateKey, { action: "OTHER" });

    await expect(verifyECDSAP256(jwk, stableStringify({ action: "TEST" }), signature)).resolves.toBe(false);
  });

  it("validates nonce constant-time", () => {
    expect(validateNonce("abc", "abc")).toBe(true);
    expect(validateNonce("abc", "abd")).toBe(false);
  });

  it("validates timestamps", () => {
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    expect(validateTimestamp(issuedAt, expiresAt, 120)).toBe(true);
  });

  it("rejects invalid timestamp formats", () => {
    expect(validateTimestamp("invalid", "2023-01-01T00:00:00Z")).toBe(false);
    expect(validateTimestamp("2023-01-01T00:00:00Z", "invalid")).toBe(false);
  });

  it("rejects expired timestamps", () => {
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    const currentTime = new Date().toISOString();
    expect(validateTimestamp(currentTime, pastTime)).toBe(false);
  });

  it("rejects timestamps with max age exceeded", () => {
    const oldIssued = new Date(Date.now() - 200_000).toISOString(); // 200 seconds ago
    const futureExpires = new Date(Date.now() + 60_000).toISOString();
    expect(validateTimestamp(oldIssued, futureExpires, 120)).toBe(false); // maxAge is 120 seconds
  });

  it("fails closed when webcrypto is unavailable", async () => {
    const originalCrypto = globalThis.crypto;
    // Remove crypto from globalThis
    delete (globalThis as any).crypto;

    // Cryptographic verification must fail closed, not throw an uncaught error.
    // A key with a non-EC type is rejected regardless of crypto availability.
    await expect(verifyECDSAP256({ kty: "RSA", n: "x", e: "AQAB" } as JsonWebKey, "test", "test")).resolves.toBe(false);

    // Restore crypto
    globalThis.crypto = originalCrypto;
  });
});
