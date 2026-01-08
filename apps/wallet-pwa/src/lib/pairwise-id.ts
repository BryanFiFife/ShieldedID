const encoder = new TextEncoder();

function getCrypto(): Crypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj) {
    throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  }
  return cryptoObj;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function deriveMasterSecret(): Uint8Array {
  const secret = new Uint8Array(32);
  getCrypto().getRandomValues(secret);
  return secret;
}

export async function generatePairwiseSubjectId(
  masterSecret: Uint8Array,
  verifierOrigin: string
): Promise<string> {
  const crypto = getCrypto();
  const key = await crypto.subtle.importKey(
    "raw",
    masterSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(verifierOrigin));
  return toHex(new Uint8Array(signature));
}
