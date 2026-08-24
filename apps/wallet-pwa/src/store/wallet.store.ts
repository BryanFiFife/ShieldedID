import { create } from "zustand";
import {
  createEmptyVault,
  decryptVault,
  encryptVault,
  generateSalt,
  type NumericAttributeCode,
  type NumericCredentialWitness,
  type VaultPayload
} from "../lib/vault";
import { saveVaultEnvelope, loadVaultEnvelope, clearVaultEnvelope } from "../lib/vault-storage";
import {
  createSigningKey,
  createWebAuthnPasskey,
  decryptSigningKey,
  signWithSoftwareKey
} from "../lib/keys";
import { deriveMasterSecret } from "../lib/pairwise-id";
import { commitAttribute, createAttribute } from "../lib/commitments";
import { generateProof, type ProofRequest, type ProofResponse } from "../lib/proof-generator";

interface CredentialImportPackage {
  numericWitnesses?: Partial<Record<NumericAttributeCode, NumericCredentialWitness>>;
}

interface WalletStore {
  vaultLocked: boolean;
  vaultPayload: VaultPayload | null;
  walletId: string | null;
  webauthnCredentialId: string | null;
  currentFlow: "enrollment" | "idle" | "proof" | "settings" | "companion";
  safetyModeEnabled: boolean;
  decoyModeActive: boolean;
  initState: "loading" | "unlock" | "enroll" | "ready";
  setFlow: (flow: WalletStore["currentFlow"]) => void;
  setSafetyMode: (enabled: boolean) => void;
  toggleDecoyMode: (enabled: boolean) => void;
  setInitState: (state: WalletStore["initState"]) => void;
  createDecoyVault: (pin: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  enrollWallet: (passphrase: string, document: VaultPayload["profile"]) => Promise<void>;
  importCredentialPackage: (credentialPackage: CredentialImportPackage, passphrase: string) => Promise<void>;
  generateProof: (request: ProofRequest, passphrase?: string) => Promise<ProofResponse>;
  lockVault: () => void;
  panicWipe: () => Promise<void>;
}

const ENVELOPE_KEY = "primary";
const DECOY_KEY = "decoy";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function assertWitness(attribute: NumericAttributeCode, witness: NumericCredentialWitness): void {
  if (!Number.isSafeInteger(witness.value) || witness.value < 0) {
    throw new Error(`INVALID_WITNESS_VALUE:${attribute}`);
  }
  if (!witness.blinding || typeof witness.blinding !== "string") {
    throw new Error(`INVALID_WITNESS_BLINDING:${attribute}`);
  }
  const attestation = witness.attestation;
  if (
    attestation.version !== "SID-COMMITMENT-1" ||
    attestation.attribute !== attribute ||
    !attestation.credentialId ||
    !attestation.commitment ||
    !attestation.issuerDid ||
    !attestation.keyId ||
    !attestation.signature
  ) {
    throw new Error(`INVALID_COMMITMENT_ATTESTATION:${attribute}`);
  }
  const expiry = Date.parse(attestation.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error(`EXPIRED_COMMITMENT_ATTESTATION:${attribute}`);
  }
}

async function persistPayload(payload: VaultPayload, passphrase: string): Promise<void> {
  const salt = generateSalt();
  const aad = payload.webauthnCredentialId
    ? new TextEncoder().encode(payload.webauthnCredentialId)
    : undefined;
  const envelope = await encryptVault(payload, passphrase, salt, aad);
  await saveVaultEnvelope(ENVELOPE_KEY, envelope);
}

async function registerWallet(
  publicKeyJwk: JsonWebKey,
  webauthnCredentialId: string,
  signingKey: CryptoKey
): Promise<{ walletId: string; keyId: string }> {
  const registryUrl = import.meta.env.VITE_REGISTRY_URL ?? "";
  if (!registryUrl) {
    return { walletId: `local-${crypto.randomUUID()}`, keyId: `local-key-${crypto.randomUUID()}` };
  }

  const payload = {
    action: "WALLET_REGISTER",
    publicKeys: { signing: publicKeyJwk },
    webauthnCredentialId,
    suiteVersion: "2.0"
  };
  const signatureBytes = await signWithSoftwareKey(
    new TextEncoder().encode(stableStringify(payload)),
    signingKey
  );
  const response = await fetch(`${registryUrl}/v1/wallet/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature: bytesToBase64(signatureBytes) })
  });
  if (!response.ok) throw new Error(`REGISTRY_REGISTER_FAILED:${response.status}`);
  const result = await response.json() as { walletId?: string; keyId?: string };
  if (!result.walletId || !result.keyId) throw new Error("REGISTRY_REGISTER_MALFORMED_RESPONSE");
  return { walletId: result.walletId, keyId: result.keyId };
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  vaultLocked: true,
  vaultPayload: null,
  walletId: null,
  webauthnCredentialId: null,
  currentFlow: "idle",
  safetyModeEnabled: true,
  decoyModeActive: false,
  initState: "loading",

  setFlow: (flow) => set({ currentFlow: flow }),
  setSafetyMode: (enabled) => set({ safetyModeEnabled: enabled }),
  setInitState: (state) => set({ initState: state }),
  toggleDecoyMode: (enabled) => set({
    decoyModeActive: enabled,
    vaultLocked: true,
    vaultPayload: null,
    walletId: null
  }),

  createDecoyVault: async (pin) => {
    const payload: VaultPayload = {
      ...createEmptyVault(),
      profile: {
        givenName: "DECOY",
        familyName: "ACCOUNT",
        dateOfBirth: "1990-01-01",
        documentType: "DECOY",
        issuer: "LOCAL",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      },
      masterSecret: btoa(String.fromCharCode(...deriveMasterSecret())),
      walletId: `decoy-${crypto.randomUUID()}`,
      consentReceipts: [],
      safety: { decoyEnabled: true }
    };
    const salt = generateSalt();
    const envelope = await encryptVault(payload, pin, salt);
    await saveVaultEnvelope(DECOY_KEY, envelope);
  },

  unlockVault: async (passphrase) => {
    const key = get().decoyModeActive ? DECOY_KEY : ENVELOPE_KEY;
    const envelope = await loadVaultEnvelope(key);
    if (!envelope) throw new Error("VAULT_NOT_FOUND");
    const aad = envelope.aad ? base64ToBytes(envelope.aad) : undefined;
    const payload = await decryptVault(envelope, passphrase, aad);
    set({
      vaultLocked: false,
      vaultPayload: payload,
      walletId: payload.walletId ?? null,
      webauthnCredentialId: payload.webauthnCredentialId ?? null
    });
  },

  enrollWallet: async (passphrase, document) => {
    const masterSecret = deriveMasterSecret();
    const signingKeyEnvelope = await createSigningKey(passphrase);
    const signingPrivateKey = await decryptSigningKey(passphrase, signingKeyEnvelope.encryptedPrivateKey);
    const passkey = await createWebAuthnPasskey();

    const attributes: VaultPayload["attributes"] = [];
    if (document) {
      const given = createAttribute("GIVEN_NAME", document.givenName);
      const family = createAttribute("FAMILY_NAME", document.familyName);
      attributes.push({
        id: given.id,
        type: given.type,
        value: given.normalizedValue,
        salt: btoa(String.fromCharCode(...given.salt)),
        commitment: await commitAttribute(given.normalizedValue, given.salt)
      });
      attributes.push({
        id: family.id,
        type: family.type,
        value: family.normalizedValue,
        salt: btoa(String.fromCharCode(...family.salt)),
        commitment: await commitAttribute(family.normalizedValue, family.salt)
      });
    }

    const registry = await registerWallet(
      signingKeyEnvelope.publicKeyJwk,
      passkey.credentialId,
      signingPrivateKey
    );
    const payload: VaultPayload = {
      ...createEmptyVault(),
      profile: document,
      masterSecret: btoa(String.fromCharCode(...masterSecret)),
      walletId: registry.walletId,
      signingKeyId: registry.keyId,
      signingKeyEncrypted: btoa(String.fromCharCode(...signingKeyEnvelope.encryptedPrivateKey)),
      webauthnCredentialId: passkey.credentialId,
      attributes,
      numericWitnesses: {},
      consentReceipts: [],
      safety: { decoyEnabled: true }
    };

    await persistPayload(payload, passphrase);
    set({
      vaultLocked: false,
      vaultPayload: payload,
      walletId: registry.walletId,
      webauthnCredentialId: passkey.credentialId
    });
  },

  importCredentialPackage: async (credentialPackage, passphrase) => {
    const { vaultPayload } = get();
    if (!vaultPayload) throw new Error("VAULT_NOT_UNLOCKED");
    if (!credentialPackage.numericWitnesses || Object.keys(credentialPackage.numericWitnesses).length === 0) {
      throw new Error("CREDENTIAL_PACKAGE_HAS_NO_SUPPORTED_WITNESSES");
    }

    const validated: Partial<Record<NumericAttributeCode, NumericCredentialWitness>> = {};
    for (const attribute of ["DOB_YYYYMMDD", "KYC_LEVEL"] as const) {
      const witness = credentialPackage.numericWitnesses[attribute];
      if (!witness) continue;
      assertWitness(attribute, witness);
      validated[attribute] = structuredClone(witness);
    }
    if (Object.keys(validated).length === 0) throw new Error("NO_VALID_SUPPORTED_WITNESSES");

    const updatedPayload: VaultPayload = {
      ...vaultPayload,
      numericWitnesses: { ...vaultPayload.numericWitnesses, ...validated }
    };
    await persistPayload(updatedPayload, passphrase);
    set({ vaultPayload: updatedPayload });
  },

  generateProof: async (request, passphrase) => {
    const { vaultPayload, walletId } = get();
    if (!vaultPayload || !walletId || !vaultPayload.signingKeyId) throw new Error("WALLET_NOT_READY");

    const proof = await generateProof(request, vaultPayload, {
      walletId,
      keyId: vaultPayload.signingKeyId,
      passphrase
    });
    if (passphrase) {
      const receipt = {
        id: crypto.randomUUID(),
        verifierOrigin: request.verifierOrigin,
        claims: request.requestedClaims.map((claim) => claim.type),
        timestamp: new Date().toISOString()
      };
      const updatedPayload: VaultPayload = {
        ...vaultPayload,
        consentReceipts: [...vaultPayload.consentReceipts, receipt]
      };
      await persistPayload(updatedPayload, passphrase);
      set({ vaultPayload: updatedPayload });
    }
    return proof;
  },

  lockVault: () => set({ vaultLocked: true, vaultPayload: null }),

  panicWipe: async () => {
    await clearVaultEnvelope(ENVELOPE_KEY);
    await clearVaultEnvelope(DECOY_KEY);
    set({
      vaultLocked: true,
      vaultPayload: null,
      walletId: null,
      webauthnCredentialId: null
    });
  }
}));
