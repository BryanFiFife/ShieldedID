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
        description: "Revoke keys or credentials",
        tags: ["revoke"],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["walletId", "targetType", "targetIds", "reason", "signature"],
          properties: {
            walletId: { type: "string" },
            targetType: { type: "string", enum: ["KEY", "CREDENTIAL"] },
            targetIds: { type: "array", items: { type: "string" } },
            reason: { type: "string" },
            signature: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
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
      const effectiveAt = nowIso();

      const insertRevocation = db.prepare(
        "INSERT INTO revocations (revocation_id, target_type, target_id, reason_code, effective_at, signature) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const revokeKey = db.prepare(
        "UPDATE wallet_keys SET revoked_at = ? WHERE key_id = ? AND wallet_id = ?"
      );
      const insertAudit = db.prepare(
        "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
      );

      let revokedCount = 0;
      const tx = db.transaction(() => {
        for (const targetId of targetIds) {
          const revocationId = randomUUID();
          insertRevocation.run(
            revocationId,
            targetType,
            targetId,
            reason,
            effectiveAt,
            signature
          );
          if (targetType === "KEY") {
            const result = revokeKey.run(effectiveAt, targetId, walletId);
            if (result.changes > 0) {
              revokedCount += 1;
            }
          } else {
            revokedCount += 1;
          }
        }

        insertAudit.run(
          targetType === "KEY" ? "KEY_REVOKED" : "CREDENTIAL_REVOKED",
          walletId,
          JSON.stringify({
            signature_hash: signatureHash,
            target_type: targetType,
            target_count: targetIds.length
          }),
          effectiveAt
        );
      });

      tx();

      reply.send({
        ok: true,
        revokedCount,
        effectiveAt
      });
    }
  );
}
