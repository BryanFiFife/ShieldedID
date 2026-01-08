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

describe("wallet error cases", () => {
  it("rejects add-key for non-existent wallet", async () => {
    const { jwk: signingJwk, privateKey } = await generateKeyPair();
    const { jwk: newJwk } = await generateKeyPair();

    const addKeyPayload = {
      action: "WALLET_ADD_KEY",
      walletId: "00000000-0000-0000-0000-000000000000",
      keyType: "DEVICE",
      publicKey: newJwk,
      suiteVersion: "1.0",
      replaceKeyId: null
    };
    const addKeySignature = await signPayload(privateKey, addKeyPayload);

    const res = await app.inject({
      method: "POST",
      url: "/v1/wallet/00000000-0000-0000-0000-000000000000/keys",
      payload: { ...addKeyPayload, signature: addKeySignature }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("WALLET_NOT_FOUND");
  });

  it("replaces a key when replaceKeyId is provided", async () => {
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

    // Get initial key
    const statusRes1 = await app.inject({
      method: "GET",
      url: `/v1/status/${walletId}`
    });
    const initialKeyId = statusRes1.json().keys[0].keyId;

    // Add a new key replacing the old one
    const { jwk: newJwk } = await generateKeyPair();
    const addKeyPayload = {
      action: "WALLET_ADD_KEY",
      walletId,
      keyType: "DEVICE",
      publicKey: newJwk,
      suiteVersion: "1.0",
      replaceKeyId: initialKeyId
    };
    const addKeySignature = await signPayload(privateKey, addKeyPayload);

    const addKeyRes = await app.inject({
      method: "POST",
      url: `/v1/wallet/${walletId}/keys`,
      payload: { ...addKeyPayload, signature: addKeySignature }
    });
    expect(addKeyRes.statusCode).toBe(201);
    const newKeyId = addKeyRes.json().keyId;
    expect(newKeyId).not.toBe(initialKeyId);

    // Check status shows old key as revoked
    const statusRes2 = await app.inject({
      method: "GET",
      url: `/v1/status/${walletId}`
    });
    const keys = statusRes2.json().keys;
    const oldKey = keys.find((k: any) => k.keyId === initialKeyId);
    const newKey = keys.find((k: any) => k.keyId === newKeyId);

    expect(oldKey.status).toBe("REVOKED");
    expect(newKey.status).toBe("ACTIVE");
  });

  it("supports different key types", async () => {
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

    // Add different key types
    const { jwk: newJwk } = await generateKeyPair();
    for (const keyType of ["RECOVERY"]) {
      const addKeyPayload = {
        action: "WALLET_ADD_KEY",
        walletId,
        keyType,
        publicKey: newJwk,
        suiteVersion: "1.0",
        replaceKeyId: null
      };
      const addKeySignature = await signPayload(privateKey, addKeyPayload);

      const res = await app.inject({
        method: "POST",
        url: `/v1/wallet/${walletId}/keys`,
        payload: { ...addKeyPayload, signature: addKeySignature }
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().keyType).toBe(keyType);
    }
  });
});
