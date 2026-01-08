export interface VaultPayload {
  profile: {
    givenName: string;
    familyName: string;
    dateOfBirth: string;
    documentType: string;
    issuer: string;
    issuedDate: string;
    expiryDate: string;
  } | null;
  attributes: Array<{ id: string; type: string; value: string; salt: string; commitment: string }>;
  masterSecret: string;
  signingKeyEncrypted?: string;
  signingKeyIv?: string;
  webauthnCredentialId?: string;
  kycLevel?: number;
  consentReceipts: Array<{ id: string; verifierOrigin: string; claims: string[]; timestamp: string }>;
  safety: {
    decoyEnabled: boolean;
    decoyPinHash?: string;
    lockdownUntil?: string;
  };
}

export interface VaultEnvelope {
  version: string;
  salt: string;
  iv: string;
  ciphertext: string;
  aad?: string;
  kdf: {
    type: "argon2id";
    time: number;
    memory: number;
    parallelism: number;
  };
}

const encoder = new TextEncoder();

function getCrypto(): Crypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj) {
    throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  }
  return cryptoObj;
}

function toBase64(data: Uint8Array): string {
  let binary = "";
  data.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  getCrypto().getRandomValues(salt);
  return salt;
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  // Use standard argon2 package for both Node.js and browser
  const argon2 = await import("argon2");
  const rawHash = await argon2.default.hash(passphrase, {
    raw: true,
    salt,
    timeCost: 3,
    memoryCost: 64 * 1024,
    parallelism: 4,
    hashLength: 32,
    type: argon2.default.argon2id
  });
  return getCrypto().subtle.importKey("raw", rawHash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptVault(
  payload: VaultPayload,
  passphrase: string,
  salt: Uint8Array,
  aad?: Uint8Array
): Promise<VaultEnvelope> {
  const crypto = getCrypto();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await deriveKey(passphrase, salt);
  const encoded = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    encoded
  );
  return {
    version: "AES-256-GCM-ARGON2ID-1.0",
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    aad: aad ? toBase64(aad) : undefined,
    kdf: {
      type: "argon2id",
      time: 3,
      memory: 64,
      parallelism: 4
    }
  };
}

export async function decryptVault(
  envelope: VaultEnvelope,
  passphrase: string,
  aad?: Uint8Array
): Promise<VaultPayload> {
  const crypto = getCrypto();
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad ?? (envelope.aad ? fromBase64(envelope.aad) : undefined) },
    key,
    ciphertext
  );
  const decoded = new TextDecoder().decode(plaintext);
  return JSON.parse(decoded) as VaultPayload;
}

export function createEmptyVault(): VaultPayload {
  return {
    profile: null,
    attributes: [],
    masterSecret: "",
    consentReceipts: [],
    safety: {
      decoyEnabled: true
    }
  };
}
