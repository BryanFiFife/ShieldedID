import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/init.js";
import {
  addKeySchema,
  registerWalletSchema,
  validateBody,
  validateParams,
  walletParamsSchema
} from "../middleware/validation.js";
import { registrationRateLimit } from "../middleware/rateLimit.js";
import {
  assertNotReplayed,
  verifyRegisterSignature,
  verifyWalletSignature
} from "../middleware/auth.js";

function nowIso() {
  return new Date().toISOString();
}

export async function registerWalletRoutes(app: FastifyInstance) {
  app.post(
    "/v1/wallet/register",
    {
      config: {
        rateLimit: registrationRateLimit
      },
      schema: {
        description: "Register a new wallet with a signing key",
        tags: ["wallet"],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["publicKeys", "webauthnCredentialId", "suiteVersion", "signature"],
          properties: {
            publicKeys: {
              type: "object",
              additionalProperties: false,
              required: ["signing"],
              properties: {
                signing: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kty", "crv", "x", "y"],
                  properties: {
                    kty: { type: "string", enum: ["EC"] },
                    crv: { type: "string", enum: ["P-256"] },
                    x: { type: "string" },
                    y: { type: "string" },
                    kid: { type: "string" },
                    use: { type: "string" }
                  }
                }
              }
            },
            webauthnCredentialId: { type: "string" },
            suiteVersion: { type: "string" },
            signature: { type: "string" }
          }
        },
        response: {
          201: {
            type: "object",
            properties: {
              walletId: { type: "string" },
              statusUrl: { type: "string" },
              createdAt: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      },
      preValidation: validateBody(registerWalletSchema)
    },
    async (request, reply) => {
      const { publicKeys, webauthnCredentialId, suiteVersion, signature } =
        request.body as typeof registerWalletSchema._type;

      const payload = {
        action: "WALLET_REGISTER",
        publicKeys,
        webauthnCredentialId,
        suiteVersion
      };

      await verifyRegisterSignature(publicKeys.signing, payload, signature);

      const db = getDb();
      const walletId = randomUUID();
      const keyId = randomUUID();
      const createdAt = nowIso();

      const insertWallet = db.prepare(
        "INSERT INTO wallets (wallet_id, created_at, suite_version, status) VALUES (?, ?, ?, ?)"
      );
      const insertKey = db.prepare(
        "INSERT INTO wallet_keys (key_id, wallet_id, key_type, key_material, webauthn_credential_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const insertAudit = db.prepare(
        "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
      );

      const signatureHash = await assertNotReplayed(null, payload, signature);

      const tx = db.transaction(() => {
        insertWallet.run(walletId, createdAt, suiteVersion, "ACTIVE");
        insertKey.run(
          keyId,
          walletId,
          "SIGNING",
          JSON.stringify(publicKeys.signing),
          webauthnCredentialId,
          createdAt
        );
        insertAudit.run(
          "WALLET_REGISTERED",
          walletId,
          JSON.stringify({ signature_hash: signatureHash, key_id: keyId }),
          createdAt
        );
      });

      tx();

      reply.code(201).send({
        walletId,
        statusUrl: `/v1/status/${walletId}`,
        createdAt,
        status: "ACTIVE"
      });
    }
  );

  app.post(
    "/v1/wallet/:walletId/keys",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (request) =>
            (request.params as { walletId: string }).walletId ?? "unknown"
        }
      },
      schema: {
        description: "Add or rotate a wallet key",
        tags: ["wallet"],
        params: {
          type: "object",
          required: ["walletId"],
          properties: {
            walletId: { type: "string" }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["keyType", "publicKey", "suiteVersion", "signature"],
          properties: {
            keyType: { type: "string", enum: ["SIGNING", "RECOVERY", "DEVICE"] },
            publicKey: {
              type: "object",
              additionalProperties: false,
              required: ["kty", "crv", "x", "y"],
              properties: {
                kty: { type: "string", enum: ["EC"] },
                crv: { type: "string", enum: ["P-256"] },
                x: { type: "string" },
                y: { type: "string" },
                kid: { type: "string" },
                use: { type: "string" }
              }
            },
            suiteVersion: { type: "string" },
            signature: { type: "string" },
            replaceKeyId: { type: "string" }
          }
        },
        response: {
          201: {
            type: "object",
            properties: {
              keyId: { type: "string" },
              walletId: { type: "string" },
              keyType: { type: "string" },
              createdAt: { type: "string" },
              status: { type: "string" }
            }
          }
        }
      },
      preValidation: [validateParams(walletParamsSchema), validateBody(addKeySchema)]
    },
    async (request, reply) => {
      const { walletId } = request.params as { walletId: string };
      const body = request.body as typeof addKeySchema._type;

      const db = getDb();
      const wallet = db
        .prepare("SELECT status FROM wallets WHERE wallet_id = ?")
        .get(walletId) as { status: string } | undefined;

      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }
      if (wallet.status === "REVOKED") {
        throw new Error("WALLET_REVOKED");
      }

      const payload = {
        action: "WALLET_ADD_KEY",
        walletId,
        keyType: body.keyType,
        publicKey: body.publicKey,
        suiteVersion: body.suiteVersion,
        replaceKeyId: body.replaceKeyId || null
      };

      await verifyWalletSignature(walletId, payload, body.signature);
      const signatureHash = await assertNotReplayed(walletId, payload, body.signature);

      const keyId = randomUUID();
      const createdAt = nowIso();
      const insertKey = db.prepare(
        "INSERT INTO wallet_keys (key_id, wallet_id, key_type, key_material, created_at) VALUES (?, ?, ?, ?, ?)"
      );
      const revokeKey = db.prepare(
        "UPDATE wallet_keys SET revoked_at = ? WHERE key_id = ? AND wallet_id = ?"
      );
      const insertAudit = db.prepare(
        "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
      );

      const tx = db.transaction(() => {
        if (body.replaceKeyId) {
          revokeKey.run(createdAt, body.replaceKeyId, walletId);
          insertAudit.run(
            "KEY_REVOKED",
            walletId,
            JSON.stringify({ signature_hash: signatureHash, key_id: body.replaceKeyId }),
            createdAt
          );
        }
        insertKey.run(
          keyId,
          walletId,
          body.keyType,
          JSON.stringify(body.publicKey),
          createdAt
        );
        insertAudit.run(
          "KEY_ADDED",
          walletId,
          JSON.stringify({ signature_hash: signatureHash, key_id: keyId }),
          createdAt
        );
      });

      tx();

      reply.code(201).send({
        keyId,
        walletId,
        keyType: body.keyType,
        createdAt,
        status: "ACTIVE"
      });
    }
  );
}
