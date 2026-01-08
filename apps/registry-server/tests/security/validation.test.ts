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

describe("security validation", () => {
  it("rejects PII fields", async () => {
    const { jwk, privateKey } = await generateKeyPair();
    const payload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: jwk },
      webauthnCredentialId: Buffer.from("cred").toString("base64"),
      suiteVersion: "1.0"
    };
    const signature = await signPayload(privateKey, payload);

    const res = await app.inject({
      method: "POST",
      url: "/v1/wallet/register",
      payload: {
        ...payload,
        signature,
        name: "Alice"
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("PII_FIELD_REJECTED");
  });

  it("rejects missing signature", async () => {
    const { jwk } = await generateKeyPair();

    const res = await app.inject({
      method: "POST",
      url: "/v1/wallet/register",
      payload: {
        publicKeys: { signing: jwk },
        webauthnCredentialId: Buffer.from("cred").toString("base64"),
        suiteVersion: "1.0"
      }
    });

    expect(res.statusCode).toBe(400);
  });
});
