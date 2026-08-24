import type { FastifyInstance } from "fastify";
import { getDb } from "../db/init.js";
import { statusParamsSchema, validateParams } from "../middleware/validation.js";

function nowIso() {
  return new Date().toISOString();
}

function auditStatus(
  db: ReturnType<typeof getDb>,
  eventType: "STATUS_CHECK" | "KEY_STATUS_CHECK",
  walletId: string,
  metadata: Record<string, unknown>,
  timestamp: string
) {
  db.prepare(
    "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
  ).run(eventType, walletId, JSON.stringify(metadata), timestamp);
}

export async function registerStatusRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        description: "Health check endpoint",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              service: { type: "string" },
              timestamp: { type: "string" }
            }
          }
        }
      }
    },
    async (_request, reply) => reply.send({
      ok: true,
      service: "registry-server",
      timestamp: nowIso()
    })
  );

  app.get(
    "/v1/status/:walletId",
    {
      schema: {
        description: "Get wallet status and signing-key state",
        tags: ["status"],
        params: {
          type: "object",
          required: ["walletId"],
          properties: { walletId: { type: "string" } }
        },
        response: {
          200: {
            type: "object",
            required: ["walletId", "status", "keys", "checkedAt"],
            properties: {
              walletId: { type: "string" },
              status: { type: "string" },
              revokedAt: { type: ["string", "null"] },
              expiresAt: { type: ["string", "null"] },
              keys: {
                type: "array",
                items: {
                  type: "object",
                  required: ["keyId", "status", "expiresAt", "publicKey"],
                  properties: {
                    keyId: { type: "string" },
                    status: { type: "string" },
                    revokedAt: { type: ["string", "null"] },
                    expiresAt: { type: ["string", "null"] },
                    publicKey: { type: "object", additionalProperties: true }
                  }
                }
              },
              checkedAt: { type: "string" }
            }
          },
          404: {
            type: "object",
            required: ["ok", "error"],
            properties: {
              ok: { type: "boolean" },
              error: { type: "string" }
            }
          }
        }
      },
      preValidation: validateParams(statusParamsSchema)
    },
    async (request, reply) => {
      const { walletId } = request.params as { walletId: string };
      const db = getDb();
      const checkedAt = nowIso();
      const wallet = db.prepare("SELECT status FROM wallets WHERE wallet_id = ?").get(walletId) as { status: string } | undefined;

      if (!wallet) {
        const key = db.prepare(
          "SELECT key_id, wallet_id, revoked_at, key_material, expires_at FROM wallet_keys WHERE key_id = ? LIMIT 1"
        ).get(walletId) as {
          key_id: string;
          wallet_id: string;
          revoked_at: string | null;
          key_material: string;
          expires_at: string;
        } | undefined;
        if (!key) return reply.code(404).send({ ok: false, error: "WALLET_NOT_FOUND" });

        try {
          auditStatus(db, "STATUS_CHECK", key.wallet_id, { compatibility_key_id: key.key_id }, checkedAt);
        } catch (err) {
          request.log.error({ err }, "status audit logging failed");
        }
        reply.header("Cache-Control", "no-store");
        return reply.send({
          walletId: key.wallet_id,
          status: key.revoked_at ? "REVOKED" : "ACTIVE",
          revokedAt: key.revoked_at ?? null,
          expiresAt: key.expires_at,
          keys: [{
            keyId: key.key_id,
            status: key.revoked_at ? "REVOKED" : "ACTIVE",
            revokedAt: key.revoked_at,
            expiresAt: key.expires_at,
            publicKey: JSON.parse(key.key_material)
          }],
          checkedAt
        });
      }

      const keys = db.prepare(
        "SELECT key_id, revoked_at, key_material, expires_at FROM wallet_keys WHERE wallet_id = ? ORDER BY created_at ASC"
      ).all(walletId) as Array<{
        key_id: string;
        revoked_at: string | null;
        key_material: string;
        expires_at: string;
      }>;
      const walletRevocation = db.prepare(
        "SELECT effective_at FROM revocations WHERE target_type = 'WALLET' AND target_id = ? ORDER BY effective_at DESC LIMIT 1"
      ).get(walletId) as { effective_at: string } | undefined;

      try {
        auditStatus(db, "STATUS_CHECK", walletId, {}, checkedAt);
      } catch (err) {
        request.log.error({ err }, "status audit logging failed");
      }

      reply.header("Cache-Control", "no-store");
      return reply.send({
        walletId,
        status: wallet.status,
        revokedAt: walletRevocation?.effective_at ?? null,
        keys: keys.map((key) => ({
          keyId: key.key_id,
          status: key.revoked_at ? "REVOKED" : "ACTIVE",
          revokedAt: key.revoked_at,
          expiresAt: key.expires_at,
          publicKey: JSON.parse(key.key_material)
        })),
        checkedAt
      });
    }
  );

  app.get(
    "/v1/keys/:keyId/status",
    {
      schema: {
        description: "Get key-specific status and expiration information",
        tags: ["status"],
        params: {
          type: "object",
          required: ["keyId"],
          properties: { keyId: { type: "string" } }
        },
        response: {
          200: {
            type: "object",
            required: ["keyId", "walletId", "status", "expiresAt", "createdAt", "checkedAt"],
            properties: {
              keyId: { type: "string" },
              walletId: { type: "string" },
              status: { type: "string" },
              revokedAt: { type: ["string", "null"] },
              expiresAt: { type: "string" },
              createdAt: { type: "string" },
              checkedAt: { type: "string" }
            }
          },
          404: {
            type: "object",
            required: ["ok", "error"],
            properties: {
              ok: { type: "boolean" },
              error: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { keyId } = request.params as { keyId: string };
      const db = getDb();
      const key = db.prepare(
        "SELECT key_id, wallet_id, revoked_at, created_at, expires_at FROM wallet_keys WHERE key_id = ? LIMIT 1"
      ).get(keyId) as {
        key_id: string;
        wallet_id: string;
        revoked_at: string | null;
        created_at: string;
        expires_at: string;
      } | undefined;
      if (!key) return reply.code(404).send({ ok: false, error: "KEY_NOT_FOUND" });

      const checkedAt = nowIso();
      try {
        auditStatus(db, "KEY_STATUS_CHECK", key.wallet_id, { key_id: keyId }, checkedAt);
      } catch (err) {
        request.log.error({ err }, "key status audit logging failed");
      }

      reply.header("Cache-Control", "no-store");
      return reply.send({
        keyId: key.key_id,
        walletId: key.wallet_id,
        status: key.revoked_at ? "REVOKED" : "ACTIVE",
        revokedAt: key.revoked_at ?? null,
        expiresAt: key.expires_at,
        createdAt: key.created_at,
        checkedAt
      });
    }
  );
}
