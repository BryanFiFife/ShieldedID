import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWalletStore } from "../../src/store/wallet.store";

// Mock dependencies
vi.mock("../../src/lib/vault", () => ({
  createEmptyVault: vi.fn(() => ({
    profile: null,
    masterSecret: "",
    signingKeyEncrypted: "",
    webauthnCredentialId: "",
    kycLevel: 0,
    attributes: [],
    consentReceipts: [],
    safety: { decoyEnabled: false }
  })),
  decryptVault: vi.fn(),
  encryptVault: vi.fn(),
  generateSalt: vi.fn(() => new Uint8Array(32))
}));

vi.mock("../../src/lib/vault-storage", () => ({
  saveVaultEnvelope: vi.fn(),
  loadVaultEnvelope: vi.fn(),
  clearVaultEnvelope: vi.fn()
}));

vi.mock("../../src/lib/keys", () => ({
  createSigningKey: vi.fn(),
  createWebAuthnPasskey: vi.fn(),
  signWithPasskey: vi.fn(),
  decryptSigningKey: vi.fn(),
  signWithSoftwareKey: vi.fn()
}));

vi.mock("../../src/lib/pairwise-id", () => ({
  deriveMasterSecret: vi.fn(() => new Uint8Array(32))
}));

vi.mock("../../src/lib/commitments", () => ({
  commitAttribute: vi.fn(),
  createAttribute: vi.fn()
}));

vi.mock("../../src/lib/proof-generator", () => ({
  generateProof: vi.fn()
}));

// Mock global fetch
// global.fetch = vi.fn();

// Mock import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_REGISTRY_URL: "http://localhost:3000"
  }
});
vi.stubEnv('VITE_REGISTRY_URL', 'http://localhost:3000');

describe("Wallet Store", () => {
  let store: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset store state
    const { useWalletStore: originalStore } = await import("../../src/store/wallet.store");
    originalStore.setState({
      vaultLocked: true,
      vaultPayload: null,
      walletId: null,
      webauthnCredentialId: null,
      currentFlow: "idle",
      safetyModeEnabled: true,
      decoyModeActive: false
    });

    store = originalStore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initial State", () => {
    it("has correct default values", () => {
      const { result } = renderHook(() => useWalletStore());

      expect(result.current.vaultLocked).toBe(true);
      expect(result.current.vaultPayload).toBe(null);
      expect(result.current.walletId).toBe(null);
      expect(result.current.webauthnCredentialId).toBe(null);
      expect(result.current.currentFlow).toBe("idle");
      expect(result.current.safetyModeEnabled).toBe(true);
      expect(result.current.decoyModeActive).toBe(false);
    });
  });

  describe("setFlow", () => {
    it("updates current flow", () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setFlow("enrollment");
      });

      expect(result.current.currentFlow).toBe("enrollment");

      act(() => {
        result.current.setFlow("proof");
      });

      expect(result.current.currentFlow).toBe("proof");
    });
  });

  describe("setSafetyMode", () => {
    it("updates safety mode enabled state", () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.setSafetyMode(false);
      });

      expect(result.current.safetyModeEnabled).toBe(false);

      act(() => {
        result.current.setSafetyMode(true);
      });

      expect(result.current.safetyModeEnabled).toBe(true);
    });
  });

  describe("toggleDecoyMode", () => {
    it("enables decoy mode and locks vault", () => {
      const { result } = renderHook(() => useWalletStore());

      // Set some initial state
      act(() => {
        store.setState({
          vaultLocked: false,
          vaultPayload: { test: "data" }
        });
      });

      act(() => {
        result.current.toggleDecoyMode(true);
      });

      expect(result.current.decoyModeActive).toBe(true);
      expect(result.current.vaultLocked).toBe(true);
      expect(result.current.vaultPayload).toBe(null);
    });

    it("disables decoy mode", () => {
      const { result } = renderHook(() => useWalletStore());

      act(() => {
        result.current.toggleDecoyMode(false);
      });

      expect(result.current.decoyModeActive).toBe(false);
    });
  });

  describe("createDecoyVault", () => {
    it("creates and saves decoy vault", async () => {
      const { encryptVault } = await import("../../src/lib/vault");
      const { saveVaultEnvelope } = await import("../../src/lib/vault-storage");
      const { deriveMasterSecret } = await import("../../src/lib/pairwise-id");

      deriveMasterSecret.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
      encryptVault.mockResolvedValue({ encrypted: "data" });
      saveVaultEnvelope.mockResolvedValue(undefined);

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.createDecoyVault("decoy-pin");
      });

      expect(deriveMasterSecret).toHaveBeenCalled();
      expect(encryptVault).toHaveBeenCalled();
      expect(saveVaultEnvelope).toHaveBeenCalledWith("decoy", { encrypted: "data" });
    });
  });

  describe("unlockVault", () => {
    it("unlocks primary vault successfully", async () => {
      const { loadVaultEnvelope } = await import("../../src/lib/vault-storage");
      const { decryptVault } = await import("../../src/lib/vault");

      const mockEnvelope = { encrypted: "data", aad: "dGVzdA==" }; // base64 "test"
      const mockPayload = {
        webauthnCredentialId: "test-credential",
        test: "payload"
      };

      loadVaultEnvelope.mockResolvedValue(mockEnvelope);
      decryptVault.mockResolvedValue(mockPayload);

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.unlockVault("test-passphrase");
      });

      expect(loadVaultEnvelope).toHaveBeenCalledWith("primary");
      expect(decryptVault).toHaveBeenCalledWith(mockEnvelope, "test-passphrase", expect.any(Uint8Array));
      expect(result.current.vaultLocked).toBe(false);
      expect(result.current.vaultPayload).toEqual(mockPayload);
      expect(result.current.webauthnCredentialId).toBe("test-credential");
    });

    it("unlocks decoy vault when decoy mode is active", async () => {
      const { loadVaultEnvelope } = await import("../../src/lib/vault-storage");
      const { decryptVault } = await import("../../src/lib/vault");

      // Enable decoy mode
      act(() => {
        store.setState({ decoyModeActive: true });
      });

      const mockEnvelope = { encrypted: "data" };
      const mockPayload = { webauthnCredentialId: null };

      loadVaultEnvelope.mockResolvedValue(mockEnvelope);
      decryptVault.mockResolvedValue(mockPayload);

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.unlockVault("decoy-pin");
      });

      expect(loadVaultEnvelope).toHaveBeenCalledWith("decoy");
    });

    it("throws error when vault not found", async () => {
      const { loadVaultEnvelope } = await import("../../src/lib/vault-storage");

      loadVaultEnvelope.mockResolvedValue(null);

      const { result } = renderHook(() => useWalletStore());

      await expect(async () => {
        await act(async () => {
          await result.current.unlockVault("test-passphrase");
        });
      }).rejects.toThrow("VAULT_NOT_FOUND");
    });
  });

  describe("enrollWallet", () => {
    it("creates new wallet with profile", async () => {
      const { createSigningKey, createWebAuthnPasskey, signWithPasskey, decryptSigningKey, signWithSoftwareKey } = await import("../../src/lib/keys");
      const { deriveMasterSecret } = await import("../../src/lib/pairwise-id");
      const { createAttribute, commitAttribute } = await import("../../src/lib/commitments");
      const { encryptVault } = await import("../../src/lib/vault");
      const { saveVaultEnvelope } = await import("../../src/lib/vault-storage");

      // Mock all the dependencies
      const mockSigningKey = {
        publicKeyJwk: { kty: "EC", crv: "P-256" },
        encryptedPrivateKey: new Uint8Array([1, 2, 3])
      };
      const mockPasskey = {
        credentialId: "test-credential",
        publicKeyJwk: { kty: "EC", crv: "P-256" }
      };
      const mockMasterSecret = new Uint8Array([4, 5, 6]);
      const mockAttribute = {
        id: "test-id",
        type: "GIVEN_NAME",
        normalizedValue: "John",
        salt: new Uint8Array([7, 8, 9])
      };
      const mockCommitment = "test-commitment";

      createSigningKey.mockResolvedValue(mockSigningKey);
      createWebAuthnPasskey.mockResolvedValue(mockPasskey);
      signWithPasskey.mockResolvedValue(new Uint8Array([7, 8, 9]));
      decryptSigningKey.mockResolvedValue({} as CryptoKey);
      signWithSoftwareKey.mockResolvedValue(new Uint8Array([10, 11, 12]));
      deriveMasterSecret.mockReturnValue(mockMasterSecret);
      createAttribute.mockReturnValue(mockAttribute);
      commitAttribute.mockResolvedValue(mockCommitment);
      encryptVault.mockResolvedValue({ encrypted: "vault-data" });
      saveVaultEnvelope.mockResolvedValue(undefined);

      // Mock registry registration (hardened registry returns walletId + keyId)
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ walletId: "test-wallet-id", keyId: "test-key-id" })
      }));

      const { result } = renderHook(() => useWalletStore());

      const profile = {
        givenName: "John",
        familyName: "Doe",
        dateOfBirth: "1990-01-01",
        documentType: "PASSPORT",
        issuer: "Government",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      };

      await act(async () => {
        await result.current.enrollWallet("test-passphrase", profile);
      });

      expect(createSigningKey).toHaveBeenCalledWith("test-passphrase");
      expect(createWebAuthnPasskey).toHaveBeenCalled();
      expect(deriveMasterSecret).toHaveBeenCalled();
      expect(createAttribute).toHaveBeenCalledTimes(2); // Given and family name
      expect(commitAttribute).toHaveBeenCalledTimes(2);
      expect(encryptVault).toHaveBeenCalled();
      expect(saveVaultEnvelope).toHaveBeenCalledWith("primary", { encrypted: "vault-data" });
      expect(global.fetch).toHaveBeenCalled();

      expect(result.current.vaultLocked).toBe(false);
      expect(result.current.vaultPayload).toBeDefined();
      expect(result.current.webauthnCredentialId).toBe("test-credential");
      expect(result.current.walletId).toBe("test-wallet-id");
    });

    it("creates wallet without profile", async () => {
      const { createSigningKey, createWebAuthnPasskey, signWithPasskey, decryptSigningKey, signWithSoftwareKey } = await import("../../src/lib/keys");
      const { deriveMasterSecret } = await import("../../src/lib/pairwise-id");
      const { encryptVault } = await import("../../src/lib/vault");
      const { saveVaultEnvelope } = await import("../../src/lib/vault-storage");

      const mockSigningKey = {
        publicKeyJwk: { kty: "EC", crv: "P-256" },
        encryptedPrivateKey: new Uint8Array([1, 2, 3])
      };
      const mockPasskey = {
        credentialId: "test-credential",
        publicKeyJwk: { kty: "EC", crv: "P-256" }
      };
      const mockMasterSecret = new Uint8Array([4, 5, 6]);

      createSigningKey.mockResolvedValue(mockSigningKey);
      createWebAuthnPasskey.mockResolvedValue(mockPasskey);
      signWithPasskey.mockResolvedValue(new Uint8Array([7, 8, 9]));
      decryptSigningKey.mockResolvedValue({} as CryptoKey);
      signWithSoftwareKey.mockResolvedValue(new Uint8Array([10, 11, 12]));
      deriveMasterSecret.mockReturnValue(mockMasterSecret);
      encryptVault.mockResolvedValue({ encrypted: "vault-data" });
      saveVaultEnvelope.mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ walletId: "test-wallet-id", keyId: "test-key-id" })
      });

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.enrollWallet("test-passphrase", null);
      });

      expect(result.current.vaultPayload?.attributes).toEqual([]);
    });

    it("handles registry registration failure", async () => {
      const { createSigningKey, createWebAuthnPasskey, signWithPasskey, decryptSigningKey, signWithSoftwareKey } = await import("../../src/lib/keys");

      createSigningKey.mockResolvedValue({
        publicKeyJwk: { kty: "EC", crv: "P-256" },
        encryptedPrivateKey: new Uint8Array([1, 2, 3])
      });
      createWebAuthnPasskey.mockResolvedValue({
        credentialId: "test-credential",
        publicKeyJwk: { kty: "EC", crv: "P-256" }
      });
      signWithPasskey.mockResolvedValue(new Uint8Array([7, 8, 9]));
      decryptSigningKey.mockResolvedValue({} as CryptoKey);
      signWithSoftwareKey.mockResolvedValue(new Uint8Array([10, 11, 12]));

      vi.stubGlobal("import.meta.env", { VITE_REGISTRY_URL: "http://localhost:3000" });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false
      }));

      const { result } = renderHook(() => useWalletStore());

      await expect(result.current.enrollWallet("test-passphrase", null)).rejects.toThrow("REGISTRY_REGISTER_FAILED");
    });

    it("generates local wallet ID when registry URL not set", async () => {
      // Mock environment variable
      vi.stubEnv("VITE_REGISTRY_URL", "");

      const { createSigningKey, createWebAuthnPasskey } = await import("../../src/lib/keys");
      const { deriveMasterSecret } = await import("../../src/lib/pairwise-id");
      const { encryptVault } = await import("../../src/lib/vault");
      const { saveVaultEnvelope } = await import("../../src/lib/vault-storage");

      createSigningKey.mockResolvedValue({ encryptedPrivateKey: new Uint8Array([1, 2, 3]) });
      createWebAuthnPasskey.mockResolvedValue({
        credentialId: "test-credential",
        publicKeyJwk: { kty: "EC", crv: "P-256" }
      });
      deriveMasterSecret.mockReturnValue(new Uint8Array([4, 5, 6]));
      encryptVault.mockResolvedValue({ encrypted: "vault-data" });
      saveVaultEnvelope.mockResolvedValue(undefined);

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.enrollWallet("test-passphrase", null);
      });

      expect(result.current.walletId).toBeDefined();
      expect(typeof result.current.walletId).toBe("string");
    });
  });

  describe("generateProof", () => {
    it("generates proof successfully", async () => {
      const { encryptVault } = await import("../../src/lib/vault");
      const { saveVaultEnvelope } = await import("../../src/lib/vault-storage");

      const mockProof = { type: "test-proof" };
      const mockPayload = {
        consentReceipts: [],
        webauthnCredentialId: "test-credential",
        signingKeyId: "test-key-id"
      };

      // Access the mocked generateProof
      const { generateProof: mockGenerateProof } = await import("../../src/lib/proof-generator");
      (mockGenerateProof as any).mockResolvedValue(mockProof);
      encryptVault.mockResolvedValue({ encrypted: "updated-vault" });
      saveVaultEnvelope.mockResolvedValue(undefined);

      // Set up wallet state
      act(() => {
        store.setState({
          vaultPayload: mockPayload,
          walletId: "test-wallet-id"
        });
      });

      const { result } = renderHook(() => useWalletStore());

      const request = {
        requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
        policy: { requireStatusCheck: true, maxAgeSeconds: 60 },
        callback: { method: "POST", url: "https://example.com/callback" }
      };

      let returnedProof;
      await act(async () => {
        returnedProof = await result.current.generateProof(request, "passphrase");
      });

      expect(mockGenerateProof).toHaveBeenCalledWith(request, mockPayload, { walletId: "test-wallet-id", keyId: "test-key-id", passphrase: "passphrase" });
      expect(returnedProof).toEqual(mockProof);
      expect(result.current.vaultPayload?.consentReceipts).toHaveLength(1);
      expect(encryptVault).toHaveBeenCalled();
      expect(saveVaultEnvelope).toHaveBeenCalled();
    });

    it("throws error when wallet not ready", async () => {
      const { result } = renderHook(() => useWalletStore());

      await expect(async () => {
        await act(async () => {
          await result.current.generateProof({
            requestedClaims: [],
            policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
            callback: { method: "POST", url: "https://example.com" }
          });
        });
      }).rejects.toThrow("WALLET_NOT_READY");
    });

    it("generates proof without passphrase", async () => {
      const { encryptVault } = await import("../../src/lib/vault");

      const mockProof = { type: "test-proof" };
      
      // Access the mocked generateProof
      const { generateProof: mockGenerateProof } = await import("../../src/lib/proof-generator");
      (mockGenerateProof as any).mockResolvedValue(mockProof);
      encryptVault.mockResolvedValue({ encrypted: "updated-vault" });

      act(() => {
        store.setState({
          vaultPayload: { consentReceipts: [], signingKeyId: "test-key-id" },
          walletId: "test-wallet-id"
        });
      });

      const { result } = renderHook(() => useWalletStore());

      let returnedProof;
      await act(async () => {
        returnedProof = await result.current.generateProof({
          requestedClaims: [],
          policy: { requireStatusCheck: false, maxAgeSeconds: 60 },
          callback: { method: "POST", url: "https://example.com" }
        });
      });

      expect(mockGenerateProof).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        { walletId: "test-wallet-id", keyId: "test-key-id", passphrase: undefined }
      );
      expect(returnedProof).toEqual(mockProof);
      // Should not update vault when no passphrase provided
      expect(encryptVault).not.toHaveBeenCalled();
    });
  });

  describe("lockVault", () => {
    it("locks the vault and clears payload", () => {
      const { result } = renderHook(() => useWalletStore());

      // Set some state first
      act(() => {
        store.setState({
          vaultLocked: false,
          vaultPayload: { test: "data" },
          webauthnCredentialId: "test-credential"
        });
      });

      act(() => {
        result.current.lockVault();
      });

      expect(result.current.vaultLocked).toBe(true);
      expect(result.current.vaultPayload).toBe(null);
      // webauthnCredentialId should be preserved
      expect(result.current.webauthnCredentialId).toBe("test-credential");
    });
  });

  describe("panicWipe", () => {
    it("clears all vault data and resets state", async () => {
      const { clearVaultEnvelope } = await import("../../src/lib/vault-storage");

      clearVaultEnvelope.mockResolvedValue(undefined);

      // Set some state first
      act(() => {
        store.setState({
          vaultLocked: false,
          vaultPayload: { test: "data" },
          walletId: "test-wallet-id",
          webauthnCredentialId: "test-credential"
        });
      });

      const { result } = renderHook(() => useWalletStore());

      await act(async () => {
        await result.current.panicWipe();
      });

      expect(clearVaultEnvelope).toHaveBeenCalledWith("primary");
      expect(clearVaultEnvelope).toHaveBeenCalledWith("decoy");
      expect(result.current.vaultLocked).toBe(true);
      expect(result.current.vaultPayload).toBe(null);
      expect(result.current.walletId).toBe(null);
      expect(result.current.webauthnCredentialId).toBe(null);
    });
  });
});