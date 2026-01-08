import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

export async function registerSecurity(app: FastifyInstance) {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"]
      }
    },
    frameguard: { action: "deny" },
    xssFilter: false,
    noSniff: true
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      const allowList = (process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (allowList.length === 0) {
        cb(null, true);
        return;
      }
      if (!origin || allowList.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS_NOT_ALLOWED"), false);
    },
    methods: ["GET", "POST"]
  });
}
