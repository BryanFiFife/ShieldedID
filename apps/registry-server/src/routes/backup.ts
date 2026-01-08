import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getDb } from "../db/init.js";
import { backupSchema, validateBody } from "../middleware/validation.js";
import { assertWalletRateLimit } from "../middleware/rateLimit.js";
import { assertNotReplayed, verifyWalletSignature } from "../middleware/auth.js";

function nowIso() {
  return new Date().toISOString();
}

export async function registerBackupRoutes(app: FastifyInstance) {
  app.post(
    "/v1/backup",
    {
      schema: {
        description: "Store encrypted backup payload",
        tags: ["backup"],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["walletId", "ciphertext", "algorithm", "signature"],
          properties: {
            walletId: { type: "string" },
            ciphertext: { type: "string" },
            algorithm: { type: "string", enum: ["AES-256-GCM"] },
            signature: { type: "string" }
          }
        },
        response: {
          201: {
            type: "object",
            properties: {
              backupId: { type: "string" },
              createdAt: { type: "string" }
            }
          }
        }
      },
      preValidation: validateBody(backupSchema)
    },
    async (request, reply) => {
      try {
        const body = request.body as typeof backupSchema._type;
        const { walletId, ciphertext, algorithm, signature } = body;

        assertWalletRateLimit(walletId);

        const payload = {
          action: "WALLET_BACKUP",
          walletId,
          ciphertext,
          algorithm
        };

        await verifyWalletSignature(walletId, payload, signature);
        const signatureHash = await assertNotReplayed(walletId, payload, signature);

        const db = getDb();
        const backupId = randomUUID();
        const createdAt = nowIso();

        const insertBackup = db.prepare(
          "INSERT INTO backups (backup_id, wallet_id, ciphertext, algorithm, created_at) VALUES (?, ?, ?, ?, ?)"
        );
        const insertAudit = db.prepare(
          "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
        );

        const tx = db.transaction(() => {
          insertBackup.run(backupId, walletId, ciphertext, algorithm, createdAt);
          insertAudit.run(
            "BACKUP_STORED",
            walletId,
            JSON.stringify({ signature_hash: signatureHash, backup_id: backupId }),
            createdAt
          );
        });

        tx();

        reply.code(201).send({ backupId, createdAt });
      } catch (error) {
        app.log.error({ err: error, walletId: (request.body as any)?.walletId }, "Backup creation failed");
        throw error; // Let the error handler in validation.ts handle it
      }
    }
  );
}
