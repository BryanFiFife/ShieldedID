import type { FastifyInstance } from "fastify";
import { getDb } from "../db/init.js";
import { statusParamsSchema, validateParams } from "../middleware/validation.js";

function nowIso() {
  return new Date().toISOString();
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
    async (request, reply) => {
      reply.send({
        ok: true,
        service: "registry-server",
        timestamp: nowIso()
      });
    }
  );

  app.get(
    "/v1/status/:walletId",
    {
      schema: {
        description: "Get wallet status and key revocation state",
        tags: ["status"],
        params: {
          type: "object",
          required: ["walletId"],
          properties: {
            walletId: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              walletId: { type: "string" },
              status: { type: "string" },
              revokedAt: { type: ["string", "null"] },
              keys: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyId: { type: "string" },
                    status: { type: "string" },
                    revokedAt: { type: ["string", "null"] }
                  }
                }
              },
              checkedAt: { type: "string" }
            }
          }
        }
      },
      preValidation: validateParams(statusParamsSchema)
    },
    async (request, reply) => {
      const { walletId } = request.params as { walletId: string };
      const db = getDb();

      const wallet = db
        .prepare("SELECT status FROM wallets WHERE wallet_id = ?")
        .get(walletId) as { status: string } | undefined;

      if (!wallet) {
        const key = db
          .prepare(
            "SELECT wallet_id, revoked_at FROM wallet_keys WHERE key_id = ? LIMIT 1"
          )
          .get(walletId) as { wallet_id: string; revoked_at: string | null } | undefined;
        if (!key) {
          throw new Error("WALLET_NOT_FOUND");
        }
        reply.header("Cache-Control", "public, max-age=300");
        reply.send({
          walletId: key.wallet_id,
          status: key.revoked_at ? "REVOKED" : "ACTIVE",
          revokedAt: key.revoked_at ?? null,
          keys: [],
          checkedAt: nowIso()
        });
        return;
      }

      const keys = db
        .prepare(
          "SELECT key_id, revoked_at, key_material FROM wallet_keys WHERE wallet_id = ? ORDER BY created_at ASC"
        )
        .all(walletId) as Array<{ key_id: string; revoked_at: string | null; key_material: string }>;

      const walletRevocation = db
        .prepare(
          "SELECT effective_at FROM revocations WHERE target_type = 'WALLET' AND target_id = ? ORDER BY effective_at DESC LIMIT 1"
        )
        .get(walletId) as { effective_at: string } | undefined;

      const checkedAt = nowIso();
      db.prepare(
        "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
      ).run("STATUS_CHECK", walletId, JSON.stringify({}), checkedAt);

      reply.header("Cache-Control", "public, max-age=300");

      reply.send({
        walletId,
        status: wallet.status,
        revokedAt: walletRevocation?.effective_at ?? null,
        keys: keys.map((key) => ({
          keyId: key.key_id,
          status: key.revoked_at ? "REVOKED" : "ACTIVE",
          revokedAt: key.revoked_at,
          publicKey: JSON.parse(key.key_material)
        })),
        checkedAt
      });
    }
  );
}
