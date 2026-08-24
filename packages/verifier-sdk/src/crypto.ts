import { base64UrlDecode, stableStringify, toUint8 } from "./utils.js";

function getSubtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj?.subtle) throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  return cryptoObj.subtle;
}

function trimInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  return bytes.slice(start);
}

/** Convert ASN.1 DER ECDSA signatures to WebCrypto's fixed 64-byte P1363 form. */
export function normalizeP256Signature(signature: Uint8Array): Uint8Array {
  if (signature.length === 64) return signature;
  if (signature.length < 8 || signature[0] !== 0x30) throw new Error("INVALID_ECDSA_SIGNATURE_ENCODING");
  let offset = 1;
  const seqLen = signature[offset++];
  if ((seqLen & 0x80) !== 0) {
    const lengthBytes = seqLen & 0x7f;
    if (lengthBytes !== 1 || offset >= signature.length) throw new Error("INVALID_DER_LENGTH");
    offset += 1;
  }
  if (signature[offset++] !== 0x02) throw new Error("INVALID_DER_R");
  const rLen = signature[offset++];
  const r = trimInteger(signature.slice(offset, offset + rLen));
  offset += rLen;
  if (signature[offset++] !== 0x02) throw new Error("INVALID_DER_S");
  const sLen = signature[offset++];
  const s = trimInteger(signature.slice(offset, offset + sLen));
  if (r.length > 32 || s.length > 32) throw new Error("INVALID_DER_INTEGER_SIZE");
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

/** Verify an ECDSA P-256 signature over a canonical string message. */
export async function verifyECDSAP256(
  publicKeyJWK: JsonWebKey,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    if (publicKeyJWK.kty !== "EC" || publicKeyJWK.crv !== "P-256") return false;
    const subtle = getSubtle();
    const key = await subtle.importKey(
      "jwk",
      publicKeyJWK,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const data = toUint8(message);
    const signature = normalizeP256Signature(base64UrlDecode(signatureBase64));
    return subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature as BufferSource,
      data as BufferSource
    );
  } catch {
    return false;
  }
}

export function validateNonce(original: string, provided: string): boolean {
  if (original.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < original.length; i += 1) {
    diff |= original.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function validateTimestamp(
  issuedAt: string,
  expiresAt: string,
  maxAgeSeconds?: number
): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const now = Date.now();
  if (Number.isNaN(issued) || Number.isNaN(expires) || expires <= issued) return false;
  // Allow up to 30 seconds of clock skew for verifier/request creation.
  if (now + 30_000 < issued || now > expires) return false;
  if (maxAgeSeconds !== undefined && now - issued > maxAgeSeconds * 1000) return false;
  return true;
}

export function canonicalPayload(payload: unknown): string {
  return stableStringify(payload);
}
