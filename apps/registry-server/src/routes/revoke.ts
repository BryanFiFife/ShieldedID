import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/init.js";
import { revokeSchema, validateBody } from "../middleware/validation.js";
import { assertWalletRateLimit } from "../middleware/rateLimit.js";
import { assertNotReplayed, verifyWalletSignature } from "../middleware/auth.js";

function nowIso() {
  return new Date().toISOString();
}

export async function registerRevokeRoutes(app: FastifyInstance) {
  app.post(
    "/v1/revoke",
    {
      schema: {
        description: "Revoke wallet keys or credentials",
        tags: ["revoke"],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["action", "walletId", "targetType", "targetIds", "reason", "signature"],
          properties: {
            action: { type: "string", const: "WALLET_REVOKE" },
            walletId: { type: "string" },
            targetType: { type: "string", enum: ["KEY", "CREDENTIAL"] },
            targetIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } },
            reason: { type: "string" },
            signature: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            required: ["ok", "revokedCount", "effectiveAt"],
            properties: {
              ok: { type: "boolean" },
              revokedCount: { type: "number" },
              effectiveAt: { type: "string" }
            }
          }
        }
      },
      preValidation: validateBody(revokeSchema)
    },
    async (request, reply) => {
      const body = request.body as typeof revokeSchema._type;
      const { walletId, targetType, targetIds, reason, signature } = body;

      assertWalletRateLimit(walletId);

      const payload = {
        action: "WALLET_REVOKE",
        walletId,
        targetType,
        targetIds,
        reason
      };

      await verifyWalletSignature(walletId, payload, signature);
      const signatureHash = await assertNotReplayed(walletId, payload, signature);

      const db = getDb();
      const wallet = db.prepare("SELECT status FROM wallets WHERE wallet_id = ?").get(walletId) as { status: string } | undefined;
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (wallet.status !== "ACTIVE") throw new Error("WALLET_REVOKED");

      const effectiveAt = nowIso();
      const insertRevocation = db.prepare(
        "INSERT INTO revocations (revocation_id, target_type, target_id, reason_code, effective_at, signature) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const revokeKey = db.prepare(
        "UPDATE wallet_keys SET revoked_at = ? WHERE key_id = ? AND wallet_id = ? AND revoked_at IS NULL"
      );
      const insertAudit = db.prepare(
        "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
      );

      let revokedCount = 0;
      db.transaction(() => {
        for (const targetId of targetIds) {
          if (targetType === "KEY") {
            const result = revokeKey.run(effectiveAt, targetId, walletId);
            if (result.changes === 0) continue;
            revokedCount += result.changes;
          } else {
            revokedCount += 1;
          }

          insertRevocation.run(
            randomUUID(),
            targetType,
            targetId,
            reason,
            effectiveAt,
            signature
          );
        }

        insertAudit.run(
          targetType === "KEY" ? "KEY_REVOKED" : "CREDENTIAL_REVOKED",
          walletId,
          JSON.stringify({
            signature_hash: signatureHash,
            target_type: targetType,
            target_count: targetIds.length,
            revoked_count: revokedCount
          }),
          effectiveAt
        );
      })();

      reply.header("Cache-Control", "no-store");
      reply.send({
        ok: true,
        revokedCount,
        effectiveAt
      });
    }
  );
}
