import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getDb } from "../db/init.js";

function nowIso() { return new Date().toISOString(); }

function validP256Jwk(value: unknown): value is JsonWebKey {
  if (!value || typeof value !== "object") return false;
  const jwk = value as JsonWebKey;
  return jwk.kty === "EC" && jwk.crv === "P-256" &&
    typeof jwk.x === "string" && jwk.x.length > 20 &&
    typeof jwk.y === "string" && jwk.y.length > 20;
}

function requireIssuerRegistrationAuth(request: FastifyRequest): void {
  const configured = process.env.ISSUER_REGISTRATION_TOKEN;
  if (!configured || configured.length < 32) {
    throw new Error("ISSUER_REGISTRATION_NOT_CONFIGURED");
  }
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new Error("ISSUER_AUTH_REQUIRED");
  const provided = header.slice("Bearer ".length);
  const expectedBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    throw new Error("ISSUER_AUTH_INVALID");
  }
}

function validateIssuerDid(issuerDid: string): void {
  if (!/^did:shielded:[A-Za-z0-9._:-]{1,160}$/.test(issuerDid)) {
    throw new Error("INVALID_ISSUER_DID");
  }
}

export async function registerIssuerRoutes(app: FastifyInstance) {
  app.post("/v1/issuers/:issuerDid/keys", async (request, reply) => {
    requireIssuerRegistrationAuth(request);
    const { issuerDid } = request.params as { issuerDid: string };
    validateIssuerDid(issuerDid);
    const body = request.body as {
      keyId?: string;
      publicKey?: JsonWebKey;
      algorithm?: string;
    };
    if (!body?.keyId || body.keyId.length > 256) throw new Error("INVALID_ISSUER_KEY_ID");
    if (!validP256Jwk(body.publicKey)) throw new Error("INVALID_ISSUER_PUBLIC_KEY");
    if (body.algorithm !== "ECDSA_P256_SHA256_1.0.0") throw new Error("INVALID_ISSUER_ALGORITHM");

    const db = getDb();
    const createdAt = nowIso();
    const existing = db.prepare(
      "SELECT status, key_material FROM issuer_keys WHERE issuer_did = ? AND key_id = ?"
    ).get(issuerDid, body.keyId) as { status: string; key_material: string } | undefined;

    if (existing) {
      // Registration is idempotent only when it refers to the exact same key.
      if (existing.key_material !== JSON.stringify(body.publicKey) || existing.status !== "ACTIVE") {
        return reply.code(409).send({ ok: false, error: "ISSUER_KEY_CONFLICT" });
      }
      return reply.send({ success: true, issuerDid, keyId: body.keyId, status: "ACTIVE" });
    }

    db.transaction(() => {
      db.prepare(
        "INSERT INTO issuer_keys (issuer_did, key_id, key_material, algorithm, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)"
      ).run(issuerDid, body.keyId, JSON.stringify(body.publicKey), body.algorithm, createdAt);
      db.prepare(
        "INSERT INTO issuer_audit_events (issuer_did, event_type, metadata, timestamp) VALUES (?, 'ISSUER_KEY_REGISTERED', ?, ?)"
      ).run(issuerDid, JSON.stringify({ keyId: body.keyId }), createdAt);
    })();

    reply.code(201).send({ success: true, issuerDid, keyId: body.keyId, status: "ACTIVE" });
  });

  app.get("/v1/issuers/:issuerDid/keys/:keyId", async (request, reply) => {
    const { issuerDid, keyId } = request.params as { issuerDid: string; keyId: string };
    validateIssuerDid(issuerDid);
    const row = getDb().prepare(
      "SELECT issuer_did, key_id, key_material, algorithm, status, created_at, revoked_at FROM issuer_keys WHERE issuer_did = ? AND key_id = ?"
    ).get(issuerDid, keyId) as {
      issuer_did: string;
      key_id: string;
      key_material: string;
      algorithm: string;
      status: "ACTIVE" | "SUSPENDED" | "REVOKED";
      created_at: string;
      revoked_at: string | null;
    } | undefined;
    if (!row) return reply.code(404).send({ ok: false, error: "ISSUER_KEY_NOT_FOUND" });
    return reply.send({
      issuerDid: row.issuer_did,
      keyId: row.key_id,
      status: row.status,
      publicKey: JSON.parse(row.key_material),
      algorithm: row.algorithm,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    });
  });

  app.post("/v1/issuers/:issuerDid/revoke-all", async (request, reply) => {
    requireIssuerRegistrationAuth(request);
    const { issuerDid } = request.params as { issuerDid: string };
    validateIssuerDid(issuerDid);
    const { reason } = (request.body ?? {}) as { reason?: string };
    if (!reason?.trim()) throw new Error("REVOCATION_REASON_REQUIRED");
    const db = getDb();
    const revokedAt = nowIso();
    const result = db.prepare(
      "UPDATE issuer_keys SET status = 'REVOKED', revoked_at = ? WHERE issuer_did = ? AND status != 'REVOKED'"
    ).run(revokedAt, issuerDid);
    db.prepare(
      "INSERT INTO issuer_audit_events (issuer_did, event_type, metadata, timestamp) VALUES (?, 'ISSUER_KEYS_REVOKED', ?, ?)"
    ).run(issuerDid, JSON.stringify({ reason, affected: result.changes }), revokedAt);
    return reply.send({ success: true, issuerDid, revoked: result.changes, revokedAt });
  });
}
