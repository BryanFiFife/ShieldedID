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

describe("wallet registry flow", () => {
  it("registers, adds key, checks status, revokes", async () => {
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
    expect(registerBody.walletId).toBeTruthy();

    const { jwk: newJwk } = await generateKeyPair();
    const addKeyPayload = {
      action: "WALLET_ADD_KEY",
      walletId: registerBody.walletId,
      keyType: "DEVICE",
      publicKey: newJwk,
      suiteVersion: "1.0",
      replaceKeyId: null
    };
    const addKeySignature = await signPayload(privateKey, addKeyPayload);

    const addKeyRes = await app.inject({
      method: "POST",
      url: `/v1/wallet/${registerBody.walletId}/keys`,
      payload: { ...addKeyPayload, signature: addKeySignature }
    });
    if (addKeyRes.statusCode !== 201) {
      console.log("Add key response:", addKeyRes.statusCode, addKeyRes.json());
    }
    expect(addKeyRes.statusCode).toBe(201);

    const statusRes = await app.inject({
      method: "GET",
      url: `/v1/status/${registerBody.walletId}`
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = statusRes.json();
    expect(statusBody.keys.length).toBeGreaterThanOrEqual(1);

    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId: registerBody.walletId,
      targetType: "KEY",
      targetIds: [addKeyRes.json().keyId],
      reason: "COMPROMISED"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const revokeRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });

    expect(revokeRes.statusCode).toBe(200);

    const statusResAfter = await app.inject({
      method: "GET",
      url: `/v1/status/${registerBody.walletId}`
    });
    const statusAfterBody = statusResAfter.json();
    const revokedKey = statusAfterBody.keys.find(
      (key: { keyId: string }) => key.keyId === addKeyRes.json().keyId
    );
    expect(revokedKey.status).toBe("REVOKED");
  });

  it("rejects tampered payload", async () => {
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

    // Tamper the payload by changing keyType
    const tamperedPayload = { ...addKeyPayload, keyType: "SIGNING" };

    const addKeyRes = await app.inject({
      method: "POST",
      url: `/v1/wallet/${walletId}/keys`,
      payload: { ...tamperedPayload, signature: addKeySignature }
    });
    expect(addKeyRes.statusCode).toBe(401);
    expect(addKeyRes.json().error).toBe("INVALID_SIGNATURE");
  });

  it("accepts reordered JSON keys", async () => {
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

    // Reorder keys in the payload object
    const reorderedPayload = {
      suiteVersion: "1.0",
      action: "WALLET_ADD_KEY",
      publicKey: newJwk,
      keyType: "DEVICE",
      walletId,
      replaceKeyId: null
    };

    const addKeyRes = await app.inject({
      method: "POST",
      url: `/v1/wallet/${walletId}/keys`,
      payload: { ...reorderedPayload, signature: addKeySignature }
    });
    expect(addKeyRes.statusCode).toBe(201);
  });

  it("accepts benign extra fields in JWK", async () => {
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

    const { jwk: newJwk } = await generateKeyPair();
    // Add benign extra field to JWK
    const jwkWithExtra = { ...newJwk, use: "sig" };
    const addKeyPayload = {
      action: "WALLET_ADD_KEY",
      walletId,
      keyType: "DEVICE",
      publicKey: jwkWithExtra,
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
  });
});
