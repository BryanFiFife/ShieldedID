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

describe("replay protection", () => {
  it("rejects repeated signatures", async () => {
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
      targetType: "CREDENTIAL",
      targetIds: ["00000000-0000-0000-0000-000000000001"],
      reason: "TEST"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);

    const firstRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });
    expect(firstRes.statusCode).toBe(200);

    const secondRes = await app.inject({
      method: "POST",
      url: "/v1/revoke",
      payload: { ...revokePayload, signature: revokeSignature }
    });

    expect(secondRes.statusCode).toBe(409);
  });
});
