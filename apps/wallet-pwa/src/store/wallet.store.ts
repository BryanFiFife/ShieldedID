import { create } from "zustand";
import { createEmptyVault, decryptVault, encryptVault, generateSalt, type VaultEnvelope, type VaultPayload } from "../lib/vault";
import { saveVaultEnvelope, loadVaultEnvelope, clearVaultEnvelope } from "../lib/vault-storage";
import { createSigningKey, createWebAuthnPasskey, signWithPasskey } from "../lib/keys";
import { deriveMasterSecret } from "../lib/pairwise-id";
import { commitAttribute, createAttribute } from "../lib/commitments";
import { generateProof, type ProofRequest, type ProofResponse } from "../lib/proof-generator";

interface WalletStore {
  vaultLocked: boolean;
  vaultPayload: VaultPayload | null;
  walletId: string | null;
  webauthnCredentialId: string | null;
  currentFlow: "enrollment" | "idle" | "proof" | "settings" | "companion";
  safetyModeEnabled: boolean;
  decoyModeActive: boolean;
  setFlow: (flow: WalletStore["currentFlow"]) => void;
  setSafetyMode: (enabled: boolean) => void;
  toggleDecoyMode: (enabled: boolean) => void;
  createDecoyVault: (pin: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  enrollWallet: (passphrase: string, document: VaultPayload["profile"]) => Promise<void>;
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
    return `{${entries.map(([k, v]) => `\"${k}\":${stableStringify(v)}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function registerWallet(publicKeyJwk: JsonWebKey, credentialId: string) {
  const registryUrl = import.meta.env.VITE_REGISTRY_URL ?? "";
  if (!registryUrl) {
    return { walletId: crypto.randomUUID() };
  }
  const payload = {
    action: "WALLET_REGISTER",
    publicKeys: { signing: publicKeyJwk },
    webauthnCredentialId: credentialId,
    suiteVersion: "1.0"
  };
  const signatureBytes = await signWithPasskey(new TextEncoder().encode(stableStringify(payload)));
  const signature = bytesToBase64(signatureBytes);
  const response = await fetch(`${registryUrl}/v1/wallet/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signature })
  });
  if (!response.ok) {
    throw new Error("REGISTRY_REGISTER_FAILED");
  }
  return (await response.json()) as { walletId: string };
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  vaultLocked: true,
  vaultPayload: null,
  walletId: null,
  webauthnCredentialId: null,
  currentFlow: "idle",
  safetyModeEnabled: true,
  decoyModeActive: false,
  setFlow: (flow) => set({ currentFlow: flow }),
  setSafetyMode: (enabled) => set({ safetyModeEnabled: enabled }),
  toggleDecoyMode: (enabled) => set({ decoyModeActive: enabled, vaultLocked: true, vaultPayload: null }),
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
    if (!envelope) {
      throw new Error("VAULT_NOT_FOUND");
    }
    const aad = envelope.aad ? Uint8Array.from(atob(envelope.aad), (c) => c.charCodeAt(0)) : undefined;
    const payload = await decryptVault(envelope, passphrase, aad);
    set({ vaultLocked: false, vaultPayload: payload, webauthnCredentialId: payload.webauthnCredentialId ?? null });
  },
  enrollWallet: async (passphrase, document) => {
    const masterSecret = deriveMasterSecret();
    const masterSecretB64 = btoa(String.fromCharCode(...masterSecret));
    const signingKey = await createSigningKey(passphrase);
    const passkey = await createWebAuthnPasskey();

    const attributes = [] as VaultPayload["attributes"];
    if (document) {
      const given = createAttribute("GIVEN_NAME", document.givenName);
      const family = createAttribute("FAMILY_NAME", document.familyName);
      const givenCommitment = await commitAttribute(given.normalizedValue, given.salt);
      const familyCommitment = await commitAttribute(family.normalizedValue, family.salt);
      attributes.push({
        id: given.id,
        type: given.type,
        value: given.normalizedValue,
        salt: btoa(String.fromCharCode(...given.salt)),
        commitment: givenCommitment
      });
      attributes.push({
        id: family.id,
        type: family.type,
        value: family.normalizedValue,
        salt: btoa(String.fromCharCode(...family.salt)),
        commitment: familyCommitment
      });
    }

    const payload: VaultPayload = {
      ...createEmptyVault(),
      profile: document,
      masterSecret: masterSecretB64,
      signingKeyEncrypted: btoa(String.fromCharCode(...signingKey.encryptedPrivateKey)),
      webauthnCredentialId: passkey.credentialId,
      kycLevel: 2,
      attributes,
      consentReceipts: [],
      safety: {
        decoyEnabled: true
      }
    };

    const salt = generateSalt();
    const aad = new TextEncoder().encode(passkey.credentialId);
    const envelope = await encryptVault(payload, passphrase, salt, aad);
    await saveVaultEnvelope(ENVELOPE_KEY, envelope);

    const registry = await registerWallet(passkey.publicKeyJwk, passkey.credentialId);

    set({
      vaultLocked: false,
      vaultPayload: payload,
      webauthnCredentialId: passkey.credentialId,
      walletId: registry.walletId
    });
  },
  generateProof: async (request, passphrase) => {
    const { vaultPayload, walletId } = get();
    if (!vaultPayload || !walletId) {
      throw new Error("WALLET_NOT_READY");
    }
    const proof = await generateProof(request, vaultPayload, { walletId, passphrase });
    if (passphrase) {
      const receipt = {
        id: crypto.randomUUID(),
        verifierOrigin: request.verifierOrigin,
        claims: request.requestedClaims.map((claim) => claim.type),
        timestamp: new Date().toISOString()
      };
      const updatedPayload = {
        ...vaultPayload,
        consentReceipts: [...vaultPayload.consentReceipts, receipt]
      };
      const salt = generateSalt();
      const aad = updatedPayload.webauthnCredentialId
        ? new TextEncoder().encode(updatedPayload.webauthnCredentialId)
        : undefined;
      const envelope = await encryptVault(updatedPayload, passphrase, salt, aad);
      await saveVaultEnvelope(ENVELOPE_KEY, envelope);
      set({ vaultPayload: updatedPayload });
    }
    return proof;
  },
  lockVault: () => set({ vaultLocked: true, vaultPayload: null }),
  panicWipe: async () => {
    await clearVaultEnvelope(ENVELOPE_KEY);
    await clearVaultEnvelope(DECOY_KEY);
    set({ vaultLocked: true, vaultPayload: null, walletId: null, webauthnCredentialId: null });
  }
}));
