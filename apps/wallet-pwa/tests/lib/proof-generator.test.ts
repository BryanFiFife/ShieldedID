import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateProof } from "../../src/lib/proof-generator";
import { createEmptyVault } from "../../src/lib/vault";
import { createSigningKey } from "../../src/lib/keys";

// Mock the ZK agent
vi.mock("../../src/lib/zk-agent", () => ({
  zkAgent: {
    isAgentAvailable: vi.fn(),
    generateAgeProof: vi.fn(),
    generateAssuranceProof: vi.fn()
  }
}));

import { zkAgent } from "../../src/lib/zk-agent";

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

describe("proof generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates signed proof responses", async () => {
    // Mock ZK agent as unavailable
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-1",
      nonce: "nonce-1",
      verifierOrigin: "https://shop.example",
      requestedClaims: [{ type: "AGE_OVER" }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-1", passphrase });
    expect(response.signature).toBeTruthy();
    expect(response.pairwiseSubjectId).toBeTruthy();
  });

  it("uses ZK agent for age proof when available", async () => {
    // Mock ZK agent as available
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(true);
    vi.mocked(zkAgent.generateAgeProof).mockResolvedValue({
      commitment: "zk-commitment",
      proof: "zk-proof",
      publicInputs: "zk-public-inputs"
    });

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15", // Age 34
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-1",
      nonce: "nonce-1",
      verifierOrigin: "https://shop.example",
      expiresAt: "2024-12-31T23:59:59Z",
      requestedClaims: [{ type: "AGE_OVER" }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-1", passphrase });

    expect(zkAgent.isAgentAvailable).toHaveBeenCalled();
    expect(zkAgent.generateAgeProof).toHaveBeenCalledWith(
      35, // computed age (current year 2026 - 1990 = 36, but date is May 15, so not yet 36)
      "https://shop.example",
      "nonce-1",
      "2024-12-31T23:59:59Z"
    );
    expect(response.zkProof).toEqual({
      commitment: "zk-commitment",
      bulletproof: "zk-proof",
      publicInputs: "zk-public-inputs"
    });
  });

  it("falls back to WASM when ZK agent fails", async () => {
    // Mock ZK agent as available but proof generation fails
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(true);
    vi.mocked(zkAgent.generateAgeProof).mockRejectedValue(new Error("Agent error"));

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-1",
      nonce: "nonce-1",
      verifierOrigin: "https://shop.example",
      requestedClaims: [{ type: "AGE_OVER" }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-1", passphrase });

    // Should still generate a valid signed proof even when ZK fails
    expect(response.signature).toBeTruthy();
    expect(response.pairwiseSubjectId).toBeTruthy();
  });

  it("uses ZK agent for KYC proof when available", async () => {
    // Mock ZK agent as available
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(true);
    vi.mocked(zkAgent.generateAssuranceProof).mockResolvedValue({
      commitment: "kyc-commitment",
      proof: "kyc-proof",
      publicInputs: "kyc-public-inputs"
    });

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      kycLevel: 3,
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-1",
      nonce: "nonce-1",
      verifierOrigin: "https://shop.example",
      expiresAt: "2024-12-31T23:59:59Z",
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-1", passphrase });

    expect(zkAgent.generateAssuranceProof).toHaveBeenCalledWith(
      3, // kyc level
      2, // min level
      "https://shop.example",
      "nonce-1",
      "2024-12-31T23:59:59Z"
    );
    expect(response.kycZkProof).toEqual({
      commitment: "kyc-commitment",
      bulletproof: "kyc-proof",
      publicInputs: "kyc-public-inputs",
      minLevel: 2
    });
  });
});
