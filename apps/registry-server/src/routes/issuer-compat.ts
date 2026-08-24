import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getDb } from "../db/init.js";

function requireToken(request: FastifyRequest) {
  const configured = process.env.ISSUER_REGISTRATION_TOKEN;
  if (!configured || configured.length < 32) throw new Error("ISSUER_REGISTRATION_NOT_CONFIGURED");
  const provided = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("ISSUER_AUTH_INVALID");
}

function validP256(jwk: JsonWebKey | undefined) {
  return jwk?.kty === "EC" && jwk.crv === "P-256" && Boolean(jwk.x) && Boolean(jwk.y);
}

export async function registerIssuerCompatibilityRoutes(app: FastifyInstance) {
  app.post("/api/attesters/:attesterId/keys", async (request, reply) => {
    requireToken(request);
    const { attesterId } = request.params as { attesterId: string };
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(attesterId)) throw new Error("INVALID_ATTESTER_ID");
    const body = request.body as { keyId?: string; publicKey?: JsonWebKey; algorithm?: string };
    if (!body.keyId || !validP256(body.publicKey) || body.algorithm !== "ECDSA_P256_SHA256_1.0.0") {
      throw new Error("INVALID_ISSUER_KEY");
    }
    const issuerDid = `did:shielded:${attesterId}`;
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db.prepare(
      "SELECT key_material, status FROM issuer_keys WHERE issuer_did = ? AND key_id = ?"
    ).get(issuerDid, body.keyId) as { key_material: string; status: string } | undefined;
    if (existing) {
      if (existing.key_material !== JSON.stringify(body.publicKey) || existing.status !== "ACTIVE") {
        return reply.code(409).send({ success: false, error: "ISSUER_KEY_CONFLICT" });
      }
      return reply.send({ success: true, keyId: body.keyId });
    }
    db.prepare(
      "INSERT INTO issuer_keys (issuer_did, key_id, key_material, algorithm, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)"
    ).run(issuerDid, body.keyId, JSON.stringify(body.publicKey), body.algorithm, now);
    db.prepare(
      "INSERT INTO issuer_audit_events (issuer_did, event_type, metadata, timestamp) VALUES (?, 'ISSUER_KEY_REGISTERED', ?, ?)"
    ).run(issuerDid, JSON.stringify({ keyId: body.keyId, compatibilityRoute: true }), now);
    return reply.code(201).send({ success: true, keyId: body.keyId });
  });

  app.post("/api/attesters/:attesterId/revoke-all", async (request, reply) => {
    requireToken(request);
    const { attesterId } = request.params as { attesterId: string };
    const { reason } = (request.body ?? {}) as { reason?: string };
    if (!reason?.trim()) throw new Error("REVOCATION_REASON_REQUIRED");
    const issuerDid = `did:shielded:${attesterId}`;
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
      "UPDATE issuer_keys SET status='REVOKED', revoked_at=? WHERE issuer_did=? AND status!='REVOKED'"
    ).run(now, issuerDid);
    db.prepare(
      "INSERT INTO issuer_audit_events (issuer_did, event_type, metadata, timestamp) VALUES (?, 'ISSUER_KEYS_REVOKED', ?, ?)"
    ).run(issuerDid, JSON.stringify({ reason, affected: result.changes, compatibilityRoute: true }), now);
    return reply.send({ success: true, revoked: result.changes });
  });
}
