import { webcrypto } from "node:crypto";
import { getDb } from "../db/init.js";
import { canonicalizePayload, verifyEcdsaP256 } from "../crypto/verify.js";

const textEncoder = new TextEncoder();

async function sha256Base64(input: string): Promise<string> {
  const data = textEncoder.encode(input);
  const digest = await webcrypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64");
}

export async function verifyRegisterSignature(
  publicKey: JsonWebKey,
  payload: unknown,
  signature: string
) {
  const ok = await verifyEcdsaP256(publicKey, payload, signature);
  if (!ok) {
    throw new Error("INVALID_SIGNATURE");
  }
}

export async function verifyWalletSignature(
  walletId: string,
  payload: unknown,
  signature: string
) {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT key_material FROM wallet_keys WHERE wallet_id = ? AND key_type = 'SIGNING' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1"
    )
    .get(walletId) as { key_material: string } | undefined;

  if (!row) {
    throw new Error("NO_ACTIVE_KEY");
  }

  const jwk = JSON.parse(row.key_material) as JsonWebKey;
  const ok = await verifyEcdsaP256(jwk, payload, signature);
  if (!ok) {
    throw new Error("INVALID_SIGNATURE");
  }
}

export async function assertNotReplayed(
  walletId: string | null,
  payload: unknown,
  signature: string
) {
  const db = getDb();
  const hash = await sha256Base64(`${canonicalizePayload(payload)}.${signature}`);
  const existing = walletId
    ? db
        .prepare(
          "SELECT 1 FROM audit_events WHERE wallet_id = ? AND json_extract(metadata, '$.signature_hash') = ? LIMIT 1"
        )
        .get(walletId, hash)
    : db
        .prepare(
          "SELECT 1 FROM audit_events WHERE json_extract(metadata, '$.signature_hash') = ? LIMIT 1"
        )
        .get(hash);
  if (existing) {
    throw new Error("REPLAY_DETECTED");
  }
  return hash;
}
