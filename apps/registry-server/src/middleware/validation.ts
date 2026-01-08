import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";

const forbiddenKeyPatterns: RegExp[] = [
  /name/i,
  /dob/i,
  /birth/i,
  /address/i,
  /document/i,
  /passport/i,
  /ssn/i,
  /national.?id/i,
  /driver.?license/i,
  /email/i,
  /phone/i,
  /photo/i,
  /face/i,
  /credential(?!id)/i
];

const allowedKeys = new Set(["webauthnCredentialId"]);

function hasForbiddenKey(input: unknown): string | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = hasForbiddenKey(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedKeys.has(key)) {
      for (const pattern of forbiddenKeyPatterns) {
        if (pattern.test(key)) {
          return key;
        }
      }
    }
    const found = hasForbiddenKey(value);
    if (found) return found;
  }
  return null;
}

const base64String = z.string().min(1).regex(/^[A-Za-z0-9+/=_-]+$/);

export const jwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string(),
    y: z.string(),
    kid: z.string().optional(),
    use: z.string().optional()
  })

export const registerWalletSchema = z
  .object({
    action: z.literal("WALLET_REGISTER"),
    publicKeys: z
      .object({
        signing: jwkSchema
      })
      .strict(),
    webauthnCredentialId: base64String,
    suiteVersion: z.string().min(1).max(50),
    signature: base64String
  })
  .strict();

export const addKeySchema = z
  .object({
    action: z.literal("WALLET_ADD_KEY"),
    walletId: z.string().uuid(),
    keyType: z.enum(["SIGNING", "RECOVERY", "DEVICE"]),
    publicKey: jwkSchema,
    suiteVersion: z.string().min(1).max(50),
    signature: base64String,
    replaceKeyId: z.string().uuid().nullable().optional()
  })
  .strict();

export const revokeSchema = z
  .object({
    action: z.literal("WALLET_REVOKE"),
    walletId: z.string().uuid(),
    targetType: z.enum(["KEY", "CREDENTIAL"]),
    targetIds: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().min(1).max(100),
    signature: base64String
  })
  .strict();

export const backupSchema = z
  .object({
    walletId: z.string().uuid(),
    ciphertext: base64String,
    algorithm: z.literal("AES-256-GCM"),
    signature: base64String
  })
  .strict();

export const statusParamsSchema = z
  .object({
    walletId: z.string().uuid()
  })
  .strict();

export const walletParamsSchema = z
  .object({
    walletId: z.string().uuid()
  })
  .strict();

export function validateBody(
  schema: z.ZodTypeAny,
  options: { allowPII?: boolean } = {}
) {
  return async function (request: FastifyRequest) {
    if (!options.allowPII) {
      const forbidden = hasForbiddenKey(request.body);
      if (forbidden) {
        throw new Error("PII_REJECTED");
      }
    }
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      throw new Error("INVALID_REQUEST");
    }
    request.body = parsed.data;
  };
}

export function validateParams(schema: z.ZodTypeAny) {
  return async function (request: FastifyRequest) {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      throw new Error("INVALID_REQUEST");
    }
    request.params = parsed.data;
  };
}

export function registerValidationPlugin(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error;
    if (err.message === "PII_REJECTED") {
      reply.code(400).send({ error: "PII_FIELD_REJECTED" });
      return;
    }
    if (err.message === "INVALID_REQUEST") {
      reply.code(400).send({ error: "INVALID_REQUEST" });
      return;
    }
    if (err.message === "INVALID_SIGNATURE") {
      reply.code(401).send({ error: "INVALID_SIGNATURE" });
      return;
    }
    if (err.message === "NO_ACTIVE_KEY") {
      reply.code(403).send({ error: "NO_ACTIVE_KEY" });
      return;
    }
    if (err.message === "REPLAY_DETECTED") {
      reply.code(409).send({ error: "REPLAY_DETECTED" });
      return;
    }
    if (err.message === "WALLET_NOT_FOUND") {
      reply.code(404).send({ error: "WALLET_NOT_FOUND" });
      return;
    }
    if (err.message === "WALLET_REVOKED") {
      reply.code(403).send({ error: "WALLET_REVOKED" });
      return;
    }
    if (err.message === "RATE_LIMITED") {
      reply.code(429).send({ error: "RATE_LIMITED" });
      return;
    }
    if (err.message === "CORS_NOT_ALLOWED") {
      reply.code(403).send({ error: "CORS_NOT_ALLOWED" });
      return;
    }
    app.log.error({ err: error }, "Request failed");
    reply.code(500).send({ error: "INTERNAL_ERROR" });
  });
}
