import { webcrypto } from "node:crypto";

const textEncoder = new TextEncoder();

function normalizeBase64(input: string): string {
  const pad = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = pad.length % 4 === 0 ? "" : "=".repeat(4 - (pad.length % 4));
  return pad + padding;
}

export function decodeBase64(input: string): Uint8Array {
  const normalized = normalizeBase64(input);
  const buffer = Buffer.from(normalized, "base64");
  return new Uint8Array(buffer);
}

export function canonicalizePayload(payload: unknown): string {
  return stableStringify(payload);
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries
      .map(([key, val]) => `"${key}":${stableStringify(val)}`)
      .join(",");
    return `{${body}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(String(value));
}

export async function verifyEcdsaP256(
  jwk: JsonWebKey,
  payload: unknown,
  signatureB64: string
): Promise<boolean> {
  const key = await webcrypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    false,
    ["verify"]
  );

  const data = textEncoder.encode(canonicalizePayload(payload));
  const signature = decodeBase64(signatureB64);

  return webcrypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    data
  );
}
