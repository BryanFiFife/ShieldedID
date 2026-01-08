import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { canonicalizePayload, verifyEcdsaP256 } from "../../src/crypto/verify.js";

async function generateKeyPair() {
  return webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

async function signPayload(privateKey: CryptoKey, payload: unknown) {
  const data = new TextEncoder().encode(canonicalizePayload(payload));
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return Buffer.from(signature).toString("base64");
}

describe("verifyEcdsaP256", () => {
  it("accepts a valid signature", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await webcrypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    const payload = { action: "TEST", value: "hello" };
    const signature = await signPayload(privateKey, payload);

    await expect(verifyEcdsaP256(jwk, payload, signature)).resolves.toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    const jwk = (await webcrypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
    const payload = { action: "TEST", value: "hello" };
    const signature = await signPayload(privateKey, { action: "OTHER" });

    await expect(verifyEcdsaP256(jwk, payload, signature)).resolves.toBe(false);
  });
});
