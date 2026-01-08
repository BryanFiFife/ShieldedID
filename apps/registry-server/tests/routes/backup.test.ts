import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { setupTestApp, resetDatabase } from "../helpers.js";
import { generateKeyPair, signPayload } from "../utils.js";

let app: Awaited<ReturnType<typeof setupTestApp>>;

beforeEach(async () => {
  if (!app) {
    app = await setupTestApp();
  }
  resetDatabase();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

describe("backup routes", () => {
  it("allows wallet to store backup with valid signature", async () => {
    // First register a wallet
    const { jwk: signingJwk, privateKey } = await generateKeyPair();
    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingJwk },
      webauthnCredentialId: Buffer.from("cred").toString("base64"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);

    const registerRes = await app.inject({
      method: "POST",
      url: "/v1/wallet/register",
      payload: { ...registerPayload, signature: registerSignature }
    });
    expect(registerRes.statusCode).toBe(201);
    const walletId = registerRes.json().walletId;

    // Now test backup
    const signingPayload = {
      action: "WALLET_BACKUP",
      walletId,
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "AES-256-GCM"
    };
    const backupSignature = await signPayload(privateKey, signingPayload);

    const requestPayload = {
      walletId,
      ciphertext: signingPayload.ciphertext,
      algorithm: signingPayload.algorithm,
      signature: backupSignature
    };

    const backupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: requestPayload
    });
    expect(backupRes.statusCode).toBe(201);
    expect(backupRes.json().backupId).toBeDefined();
    expect(backupRes.json().createdAt).toBeDefined();
  });

  it("rejects backup with invalid signature", async () => {
    // Register wallet first
    const { jwk: signingJwk, privateKey } = await generateKeyPair();
    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingJwk },
      webauthnCredentialId: Buffer.from("cred").toString("base64"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);

    const registerRes = await app.inject({
      method: "POST",
      url: "/v1/wallet/register",
      payload: { ...registerPayload, signature: registerSignature }
    });
    expect(registerRes.statusCode).toBe(201);
    const walletId = registerRes.json().walletId;

    // Test backup with invalid signature
    const backupPayload = {
      walletId,
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "AES-256-GCM",
      signature: "invalid_signature"
    };

    const backupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: backupPayload
    });
    expect(backupRes.statusCode).toBe(401);
  });

  it("rejects backup for non-existent wallet", async () => {
    const fakeWalletId = "550e8400-e29b-41d4-a716-446655440000";
    const signingPayload = {
      action: "WALLET_BACKUP",
      walletId: fakeWalletId,
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "AES-256-GCM"
    };
    const fakeSignature = Buffer.from("fake sig").toString("base64");

    const requestPayload = {
      walletId: fakeWalletId,
      ciphertext: signingPayload.ciphertext,
      algorithm: signingPayload.algorithm,
      signature: fakeSignature
    };

    const backupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: requestPayload
    });
    expect(backupRes.statusCode).toBe(403); // NO_ACTIVE_KEY for non-existent wallet
  });

  it("rejects backup with invalid algorithm", async () => {
    const backupPayload = {
      walletId: "550e8400-e29b-41d4-a716-446655440000",
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "INVALID-ALGO",
      signature: Buffer.from("fake sig").toString("base64")
    };

    const backupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: backupPayload
    });
    expect(backupRes.statusCode).toBe(400);
  });

  it("rejects backup with invalid walletId format", async () => {
    const backupPayload = {
      walletId: "invalid-uuid",
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "AES-256-GCM",
      signature: Buffer.from("fake sig").toString("base64")
    };

    const backupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: backupPayload
    });
    expect(backupRes.statusCode).toBe(400);
  });

  it("rejects backup with replayed signature", async () => {
    // Register wallet
    const { jwk: signingJwk, privateKey } = await generateKeyPair();
    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingJwk },
      webauthnCredentialId: Buffer.from("cred").toString("base64"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);

    const registerRes = await app.inject({
      method: "POST",
      url: "/v1/wallet/register",
      payload: { ...registerPayload, signature: registerSignature }
    });
    expect(registerRes.statusCode).toBe(201);
    const walletId = registerRes.json().walletId;

    // First backup succeeds
    const signingPayload = {
      action: "WALLET_BACKUP",
      walletId,
      ciphertext: Buffer.from("encrypted data").toString("base64"),
      algorithm: "AES-256-GCM"
    };
    const backupSignature = await signPayload(privateKey, signingPayload);

    const requestPayload = {
      walletId,
      ciphertext: signingPayload.ciphertext,
      algorithm: signingPayload.algorithm,
      signature: backupSignature
    };

    const firstBackupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: requestPayload
    });
    expect(firstBackupRes.statusCode).toBe(201);

    // Second backup with same signature should fail (replay)
    const secondBackupRes = await app.inject({
      method: "POST",
      url: "/v1/backup",
      payload: requestPayload
    });
    expect(secondBackupRes.statusCode).toBe(409);
  });
});
