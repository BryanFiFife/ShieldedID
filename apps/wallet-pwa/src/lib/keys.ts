import { generateSalt } from "./vault";

const encoder = new TextEncoder();

function getCrypto(): Crypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj) throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  return cryptoObj;
}

function toBase64(data: Uint8Array): string {
  let binary = "";
  data.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Convert WebCrypto's exported JWK to the exact public representation used by
 * Shielded ID's signed registry protocol. Fields such as `ext`, `key_ops` and
 * `alg` are runtime/export metadata and must not silently alter a signed
 * payload when an API validator normalizes it.
 */
export function canonicalP256PublicJwk(jwk: JsonWebKey): JsonWebKey {
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" || jwk.x.length < 20 ||
    typeof jwk.y !== "string" || jwk.y.length < 20
  ) {
    throw new Error("INVALID_P256_PUBLIC_KEY");
  }
  const canonical: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: jwk.x,
    y: jwk.y
  };
  if (jwk.kid) canonical.kid = jwk.kid;
  if (jwk.use) canonical.use = jwk.use;
  return canonical;
}

async function derivePassphraseKey(passphrase: string, salt: Uint8Array) {
  const crypto = getCrypto();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150000,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createWebAuthnPasskey(): Promise<{ credentialId: string; publicKeyJwk: JsonWebKey }> {
  const crypto = getCrypto();
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Shielded ID Wallet" },
      user: {
        id: userId,
        name: "wallet@shielded.id",
        displayName: "Shielded ID Wallet"
      },
      challenge,
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
      },
      timeout: 60_000,
      attestation: "none"
    }
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("PASSKEY_CREATION_FAILED");

  const response = credential.response as AuthenticatorAttestationResponse & {
    getPublicKey?: () => ArrayBuffer;
  };
  if (!response.getPublicKey) throw new Error("PASSKEY_PUBLIC_KEY_UNAVAILABLE");

  const publicKey = await crypto.subtle.importKey(
    "spki",
    response.getPublicKey(),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );
  const exported = await crypto.subtle.exportKey("jwk", publicKey) as JsonWebKey;

  return {
    credentialId: toBase64(new Uint8Array(credential.rawId)),
    publicKeyJwk: canonicalP256PublicJwk(exported)
  };
}

export async function createSigningKey(passphrase: string): Promise<{
  publicKeyJwk: JsonWebKey;
  encryptedPrivateKey: Uint8Array;
}> {
  const crypto = getCrypto();
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const exportedPublicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey) as JsonWebKey;
  const privateKey = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const salt = generateSalt();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await derivePassphraseKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, privateKey);
  const envelope = {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  };

  return {
    publicKeyJwk: canonicalP256PublicJwk(exportedPublicKey),
    encryptedPrivateKey: encoder.encode(JSON.stringify(envelope))
  };
}

export async function decryptSigningKey(passphrase: string, encryptedPrivateKey: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const envelope = JSON.parse(new TextDecoder().decode(encryptedPrivateKey)) as {
    salt: string;
    iv: string;
    ciphertext: string;
  };
  const key = await derivePassphraseKey(passphrase, fromBase64(envelope.salt));
  const privateKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.ciphertext)
  );
  return crypto.subtle.importKey(
    "pkcs8",
    privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

/** WebAuthn signs authenticatorData || SHA256(clientDataJSON), not arbitrary proof JSON. */
export async function signWithPasskey(message: Uint8Array): Promise<Uint8Array> {
  const crypto = getCrypto();
  const challenge = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  const assertion = (await navigator.credentials.get({
    publicKey: { challenge, userVerification: "preferred" }
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("PASSKEY_ASSERTION_FAILED");
  return new Uint8Array((assertion.response as AuthenticatorAssertionResponse).signature);
}

export async function signWithSoftwareKey(
  message: Uint8Array,
  decryptedPrivateKey: CryptoKey
): Promise<Uint8Array> {
  const signature = await getCrypto().subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    decryptedPrivateKey,
    message
  );
  return new Uint8Array(signature);
}
