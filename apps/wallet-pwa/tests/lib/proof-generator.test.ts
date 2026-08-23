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
      // Pin the system clock so computeAge() is deterministic regardless of
      // when the suite runs (DOB 1990-05-15 -> age 36 after 2026-05-15).
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
      try {
        return await testUsesZkAgent();
      } finally {
        vi.useRealTimers();
      }
    });

    async function testUsesZkAgent() {
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
      36, // pinned clock: 2026-06-01 minus DOB 1990-05-15
      "https://shop.example",
      "nonce-1",
      "2024-12-31T23:59:59Z"
    );
    // Check for new multi-proof format
    expect(response.zkProofs).toBeDefined();
    expect(response.zkProofs[0]).toBeDefined();
    expect(response.zkProofs[0].claimType).toBe("AGE_OVER");
  }

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
    expect(response.zkProofs).toBeDefined();
    expect(response.zkProofs[0]).toBeDefined();
    expect(response.zkProofs[0].claimType).toBe("KYC_LEVEL");
  });

  it("handles multiple requested claims", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      kycLevel: 2,
      profile: {
        givenName: "BOB",
        familyName: "SMITH",
        dateOfBirth: "1985-06-20",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-2",
      nonce: "nonce-2",
      verifierOrigin: "https://store.example",
      requestedClaims: [
        { type: "AGE_OVER" },
        { type: "KYC_LEVEL", minLevel: 1 },
        { type: "CONTINUITY" }
      ]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-2", passphrase });
    expect(response.signature).toBeTruthy();
    expect(response.claims).toBeInstanceOf(Array);
  });

  it("handles multiple requested claims", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      kycLevel: 2,
      profile: {
        givenName: "BOB",
        familyName: "SMITH",
        dateOfBirth: "1985-06-20",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-2",
      nonce: "nonce-2",
      verifierOrigin: "https://store.example",
      requestedClaims: [
        { type: "AGE_OVER" },
        { type: "KYC_LEVEL", minLevel: 1 },
        { type: "CONTINUITY" }
      ]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-2", passphrase });
    expect(response.signature).toBeTruthy();
    expect(response.claims).toBeInstanceOf(Array);
  });

  it("validates request with no claims", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "CHARLIE",
        familyName: "BROWN",
        dateOfBirth: "1995-03-10",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-3",
      nonce: "nonce-3",
      verifierOrigin: "https://vendor.example",
      requestedClaims: [] // No claims
    };

    const response = await generateProof(request, vault, { walletId: "wallet-3", passphrase });
    expect(response.signature).toBeTruthy();
    expect(response.claims).toBeInstanceOf(Array);
  });

  it("generates different proofs for same wallet with different nonces", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "DAVE",
        familyName: "JONES",
        dateOfBirth: "1990-01-01",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request1 = {
      requestId: "req-4a",
      nonce: "nonce-4a",
      verifierOrigin: "https://shop.example",
      requestedClaims: [{ type: "AGE_OVER" }]
    };

    const request2 = {
      requestId: "req-4b",
      nonce: "nonce-4b",
      verifierOrigin: "https://shop.example",
      requestedClaims: [{ type: "AGE_OVER" }]
    };

    const response1 = await generateProof(request1, vault, { walletId: "wallet-4", passphrase });
    const response2 = await generateProof(request2, vault, { walletId: "wallet-4", passphrase });

    // Signatures should be different due to different nonces
    expect(response1.signature).not.toBe(response2.signature);
  });

  it("includes pairwise subject id in response", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "EVE",
        familyName: "WILLIAMS",
        dateOfBirth: "1992-05-10",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-5",
      nonce: "nonce-5",
      verifierOrigin: "https://app.example",
      requestedClaims: [{ type: "CONTINUITY" }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-5", passphrase });
    
    expect(response.pairwiseSubjectId).toBeTruthy();
    expect(typeof response.pairwiseSubjectId).toBe("string");
  });

  it("handles continuity claim type correctly", async () => {
    vi.mocked(zkAgent.isAgentAvailable).mockResolvedValue(false);

    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);

    const vault = {
      ...createEmptyVault(),
      masterSecret: b64(crypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: b64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined,
      profile: {
        givenName: "FRANK",
        familyName: "MILLER",
        dateOfBirth: "1988-12-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      }
    };

    const request = {
      requestId: "req-6",
      nonce: "nonce-6",
      verifierOrigin: "https://verify.example",
      requestedClaims: [{ type: "CONTINUITY" }]
    };

    const response = await generateProof(request, vault, { walletId: "wallet-6", passphrase });
    
    const continuityClaim = response.claims?.find((c: any) => c.type === "CONTINUITY");
    expect(continuityClaim).toBeTruthy();
  });
});
