import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db/init.js";
import { registerSecurity } from "./middleware/security.js";
import { registerRateLimit } from "./middleware/rateLimit.js";
import { registerValidationPlugin } from "./middleware/validation.js";
import { registerWalletRoutes } from "./routes/wallet.js";
import { registerStatusRoutes } from "./routes/status.js";
import { registerRevokeRoutes } from "./routes/revoke.js";
import { registerBackupRoutes } from "./routes/backup.js";
import { registerAdminRoutes } from "./routes/admin.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "req.body", "res"]
    }
  });

  initDb(process.env.DATABASE_URL);

  await registerSecurity(app);
  await registerRateLimit(app);
  await app.register(cookie);
  registerValidationPlugin(app);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.join(__dirname, "..", "public");

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    decorateReply: false,
    index: ["index.html"],
    wildcard: false
  });

  // SPA fallback for admin routes
  app.get("/admin/*", async (request, reply) => {
    return reply.type("text/html").sendFile("admin/index.html");
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Shielded ID Registry",
        version: "1.0.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  await registerWalletRoutes(app);
  await registerStatusRoutes(app);
  await registerRevokeRoutes(app);
  await registerBackupRoutes(app);
  await registerAdminRoutes(app);

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/v1")) {
      reply.send({ ok: false, error: "NOT_FOUND", path: request.url });
      return;
    }
    // Let @fastify/static handle serving HTML files
    reply.code(404).send({ ok: false, error: "NOT_FOUND" });
  });

  return app;
}
