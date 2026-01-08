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

describe("status routes", () => {
  it("returns health check", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("registry-server");
    expect(body.timestamp).toBeTruthy();
  });

  it("returns wallet status with keys", async () => {
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

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/status/${walletId}`
    });
    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    expect(body.walletId).toBe(walletId);
    expect(body.status).toBe("ACTIVE");
    expect(body.revokedAt).toBeNull();
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    expect(body.checkedAt).toBeTruthy();
  });

  it("returns not found for non-existent wallet", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/status/00000000-0000-0000-0000-000000000000"
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("WALLET_NOT_FOUND");
  });

  it("returns wallet status by key id", async () => {
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
    const registerBody = registerRes.json();
    const walletId = registerBody.walletId;

    // Get wallet status to extract a key id
    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/status/${walletId}`
    });
    expect(statusRes.statusCode).toBe(200);
    const keys = statusRes.json().keys;
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const keyId = keys[0].keyId;

    // Query by key id instead of wallet id
    const keyStatusRes = await app.inject({
      method: "GET",
      url: `/v1/status/${keyId}`
    });
    expect(keyStatusRes.statusCode).toBe(200);
    const keyStatusBody = keyStatusRes.json();
    expect(keyStatusBody.walletId).toBe(walletId);
    expect(keyStatusBody.status).toBe("ACTIVE");
  });

  it("shows key revocation status", async () => {
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
    const walletId = registerRes.json().walletId;

    // Add a key
    const { jwk: newJwk } = await generateKeyPair();
    const addKeyPayload = {
      action: "WALLET_ADD_KEY",
      walletId,
      keyType: "DEVICE",
      publicKey: newJwk,
      suiteVersion: "1.0",
      replaceKeyId: null
    };
    const addKeySignature = await signPayload(privateKey, addKeyPayload);

    const addKeyRes = await app.inject({
      method: "POST",
      url: `/v1/wallet/${walletId}/keys`,
      payload: { ...addKeyPayload, signature: addKeySignature }
    });
    expect(addKeyRes.statusCode).toBe(201);
    const keyId = addKeyRes.json().keyId;

    // Revoke the key
    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId,
      targetType: "KEY",
      targetIds: [keyId],
      reason: "COMPROMISED"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const revokeRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(revokeRes.statusCode).toBe(200);

    // Check status shows revocation
    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/status/${walletId}`
    });
    expect(statusRes.statusCode).toBe(200);
    const body = statusRes.json();
    const revokedKey = body.keys.find((k: any) => k.keyId === keyId);
    expect(revokedKey).toBeTruthy();
    expect(revokedKey.status).toBe("REVOKED");
    expect(revokedKey.revokedAt).toBeTruthy();
  });
});
