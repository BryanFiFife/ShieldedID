import { webcrypto } from "node:crypto";
import { canonicalizePayload } from "../src/crypto/verify.js";

export async function generateKeyPair() {
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = (await webcrypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey;
  // Clean the JWK to only include required fields
  const cleanJwk = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y
  };
  return { ...keys, jwk: cleanJwk };
}

export async function signPayload(privateKey: CryptoKey, payload: unknown) {
  const canonicalized = canonicalizePayload(payload);
  const data = new TextEncoder().encode(canonicalized);
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return Buffer.from(signature).toString("base64");
}
