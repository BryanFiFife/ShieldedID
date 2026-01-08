import { base64UrlDecode, stableStringify, toUint8 } from "./utils.js";

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  }
  return cryptoObj.subtle;
}

/** Verify an ECDSA P-256 signature over a string message. */
export async function verifyECDSAP256(
  publicKeyJWK: JsonWebKey,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    "jwk",
    publicKeyJWK,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const data = toUint8(message);
  const signature = base64UrlDecode(signatureBase64);
  return subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature as BufferSource,
    data as BufferSource
  );
}

/** Constant-time nonce comparison. */
export function validateNonce(original: string, provided: string): boolean {
  if (original.length !== provided.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < original.length; i += 1) {
    diff |= original.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

/** Validate issued/expires timestamps and optional max age. */
export function validateTimestamp(
  issuedAt: string,
  expiresAt: string,
  maxAgeSeconds?: number
): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const now = Date.now();
  if (Number.isNaN(issued) || Number.isNaN(expires)) {
    return false;
  }
  if (now < issued || now > expires) {
    return false;
  }
  if (maxAgeSeconds !== undefined) {
    if (now - issued > maxAgeSeconds * 1000) {
      return false;
    }
  }
  return true;
}

/** Canonical JSON string for deterministic signing. */
export function canonicalPayload(payload: unknown): string {
  return stableStringify(payload);
}
