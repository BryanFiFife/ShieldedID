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

describe("revoke routes", () => {
  it("revokes a single key", async () => {
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

    // Revoke it
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
    expect(revokeRes.json().revokedCount).toBeGreaterThanOrEqual(1);
  });

  it("revokes multiple keys", async () => {
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

    // Add multiple keys
    const keyIds = [];
    for (let i = 0; i < 2; i++) {
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
      keyIds.push(addKeyRes.json().keyId);
    }

    // Revoke all
    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId,
      targetType: "KEY",
      targetIds: keyIds,
      reason: "COMPROMISED"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const revokeRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().revokedCount).toBeGreaterThanOrEqual(2);
  });

  it("revokes credentials by target id", async () => {
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

    // Revoke by credential id
    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId,
      targetType: "CREDENTIAL",
      targetIds: ["00000000-0000-0000-0000-000000000001"],
      reason: "LOST"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const revokeRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(revokeRes.statusCode).toBe(200);
  });

  it("rejects revoke with invalid signature", async () => {
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

    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId,
      targetType: "KEY",
      targetIds: ["00000000-0000-0000-0000-000000000001"],
      reason: "COMPROMISED"
    };
    // Sign with wrong payload
    const wrongSignature = await signPayload(privateKey, { action: "OTHER" });

    const revokeRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: wrongSignature }
    });
    expect(revokeRes.statusCode).toBe(401);
    expect(revokeRes.json().error).toBe("INVALID_SIGNATURE");
  });

  it("rejects duplicate revoke (replay protection)", async () => {
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

    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId,
      targetType: "KEY",
      targetIds: ["00000000-0000-0000-0000-000000000001"],
      reason: "COMPROMISED"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const revokeRes1 = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(revokeRes1.statusCode).toBe(200);

    // Try again with same signature
    const revokeRes2 = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(revokeRes2.statusCode).toBe(409);
    expect(revokeRes2.json().error).toBe("REPLAY_DETECTED");
  });
});
