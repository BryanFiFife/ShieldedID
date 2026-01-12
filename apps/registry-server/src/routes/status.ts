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
                    revokedAt: { type: ["string", "null"] },
                    // SECURITY FIX #1: Include key expiration in API responses
                    expiresAt: { type: ["string", "null"] }
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
            // SECURITY FIX #5B: Read stored expires_at instead of calculating
            "SELECT wallet_id, revoked_at, created_at, expires_at FROM wallet_keys WHERE key_id = ? LIMIT 1"
          )
          .get(walletId) as { wallet_id: string; revoked_at: string | null; created_at: string; expires_at: string } | undefined;
        if (!key) {
          throw new Error("WALLET_NOT_FOUND");
        }
        
        // SECURITY FIX #5B: Use stored expires_at instead of calculating
        reply.header("Cache-Control", "public, max-age=300");
        reply.send({
          walletId: key.wallet_id,
          status: key.revoked_at ? "REVOKED" : "ACTIVE",
          revokedAt: key.revoked_at ?? null,
          expiresAt: key.expires_at, // Use stored value
          keys: [],
          checkedAt: nowIso()
        });
        return;
      }

      const keys = db
        .prepare(
          // SECURITY FIX #5B: Read stored expires_at instead of calculating
          "SELECT key_id, revoked_at, key_material, created_at, expires_at FROM wallet_keys WHERE wallet_id = ? ORDER BY created_at ASC"
        )
        .all(walletId) as Array<{ key_id: string; revoked_at: string | null; key_material: string; created_at: string; expires_at: string }>;

      const walletRevocation = db
        .prepare(
          "SELECT effective_at FROM revocations WHERE target_type = 'WALLET' AND target_id = ? ORDER BY effective_at DESC LIMIT 1"
        )
        .get(walletId) as { effective_at: string } | undefined;

      const checkedAt = nowIso();
      // SECURITY FIX #4C: Async audit logging (non-blocking)
      setImmediate(() => {
        try {
          db.prepare(
            "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
          ).run("STATUS_CHECK", walletId, JSON.stringify({}), checkedAt);
        } catch (err) {
          console.error("Audit logging failed:", err);
        }
      });

      reply.header("Cache-Control", "public, max-age=300");

      // SECURITY FIX #5B: Use stored expires_at instead of calculating at runtime
      reply.send({
        walletId,
        status: wallet.status,
        revokedAt: walletRevocation?.effective_at ?? null,
        keys: keys.map((key) => {
          return {
            keyId: key.key_id,
            status: key.revoked_at ? "REVOKED" : "ACTIVE",
            revokedAt: key.revoked_at,
            expiresAt: key.expires_at, // Use stored value from database
            publicKey: JSON.parse(key.key_material)
          };
        }),
        checkedAt
      });
    }
  );

  // SECURITY FIX #2: Create proper key-specific status endpoint
  app.get(
    "/v1/keys/:keyId/status",
    {
      schema: {
        description: "Get key-specific status and expiration information",
        tags: ["status"],
        params: {
          type: "object",
          required: ["keyId"],
          properties: {
            keyId: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              keyId: { type: "string" },
              walletId: { type: "string" },
              status: { type: "string" },
              revokedAt: { type: ["string", "null"] },
              expiresAt: { type: "string" },
              createdAt: { type: "string" },
              checkedAt: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { keyId } = request.params as { keyId: string };
      const db = getDb();

      const key = db
        .prepare(
          // SECURITY FIX #5B: Read stored expires_at instead of calculating
          "SELECT key_id, wallet_id, revoked_at, created_at, expires_at FROM wallet_keys WHERE key_id = ? LIMIT 1"
        )
        .get(keyId) as { key_id: string; wallet_id: string; revoked_at: string | null; created_at: string; expires_at: string } | undefined;

      if (!key) {
        throw new Error("KEY_NOT_FOUND");
      }

      // SECURITY FIX #5B: Use stored expires_at instead of calculating
      const checkedAt = nowIso();
      // SECURITY FIX #4C: Async audit logging (non-blocking)
      setImmediate(() => {
        try {
          db.prepare(
            "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
          ).run("KEY_STATUS_CHECK", key.wallet_id, JSON.stringify({ key_id: keyId }), checkedAt);
        } catch (err) {
          console.error("Audit logging failed:", err);
        }
      });

      reply.header("Cache-Control", "public, max-age=300");
      reply.send({
        keyId: key.key_id,
        walletId: key.wallet_id,
        status: key.revoked_at ? "REVOKED" : "ACTIVE",
        revokedAt: key.revoked_at ?? null,
        // SECURITY FIX #5B: Use stored expires_at value
        expiresAt: key.expires_at,
        createdAt: key.created_at,
        checkedAt
      });
    }
  );
}
