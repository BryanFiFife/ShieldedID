/**
 * Shielded ID Security Headers Middleware (Enhanced)
 * File: apps/registry-server/src/middleware/security.ts
 * Updated: January 11, 2026
 * 
 * Implements defense-in-depth security headers per OWASP best practices
 */

import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface SecurityConfig {
  allowedOrigins?: string[];
  enableHSTS?: boolean;
  enableCSPReportOnly?: boolean;
  cspReportUri?: string;
}

export async function registerSecurity(app: FastifyInstance, config: SecurityConfig = {}) {
  const {
    allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    enableHSTS = true,
    enableCSPReportOnly = true,
    cspReportUri = "/api/admin/csp-violations"
  } = config;

  // ============================================================
  // Helmet.js Security Headers
  // ============================================================
  await app.register(helmet, {
    global: true,
    hsts: enableHSTS ? {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    } : false,
    contentSecurityPolicy: enableCSPReportOnly ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        reportUri: [cspReportUri]
      }
    } : false,
    frameguard: { action: "deny" },
    xssFilter: false,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permissionsPolicy: {
      accelerometer: [],
      camera: [],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      payment: [],
      usb: []
    }
  });

  // ============================================================
  // CORS Configuration
  // ============================================================
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS_NOT_ALLOWED"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    maxAge: 3600
  });

  // ============================================================
  // Rate Limit Headers & Cache Control
  // ============================================================
  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply) => {
    if ((request as any).rateLimit) {
      reply.header("RateLimit-Limit", (request as any).rateLimit.limit?.toString());
      reply.header("RateLimit-Remaining", ((request as any).rateLimit.remaining ?? 0).toString());
      reply.header("RateLimit-Reset", ((request as any).rateLimit.resetTime ?? 0).toString());
    }

    // Cache Control for sensitive endpoints
    if (request.url.includes("/api/") || request.url.includes("/admin/")) {
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
      reply.header("Pragma", "no-cache");
    }
  });

  // ============================================================
  // CSP Violation Report Collection
  // ============================================================
  app.post(cspReportUri, async (request: FastifyRequest, reply: FastifyReply) => {
    const report = request.body as Record<string, unknown>;
    
    app.log.warn({
      message: "CSP Violation Reported",
      violatedDirective: report["violated-directive"],
      blockedUri: report["blocked-uri"],
      originalPolicy: report["original-policy"],
      disposition: report.disposition,
      timestamp: new Date().toISOString()
    });

    return reply.code(204).send();
  });

  app.log.info("Enhanced security middleware registered");
}
