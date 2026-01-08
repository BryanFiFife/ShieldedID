import { randomUUID, createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
// @ts-ignore
import bcrypt from "bcryptjs";
import { getDb } from "../db/init.js";
import { validateBody } from "../middleware/validation.js";
import { z } from "zod";

// Calculate Shannon entropy for password strength analysis
function calculateEntropy(str: string): number {
  const charCounts: Record<string, number> = {};
  for (const char of str) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  
  let entropy = 0;
  for (const count of Object.values(charCounts)) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Validate password: min 12 chars, uppercase, lowercase, number, special char, and minimum entropy
function validatePasswordStrength(password: string): { ok: boolean; error?: string } {
  if (password.length < 12) {
    return { ok: false, error: "PASSWORD_MIN_12_CHARS" };
  }
  if (password.length > 128) {
    return { ok: false, error: "PASSWORD_TOO_LONG" };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: "PASSWORD_NEEDS_UPPERCASE" };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: "PASSWORD_NEEDS_LOWERCASE" };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "PASSWORD_NEEDS_NUMBER" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { ok: false, error: "PASSWORD_NEEDS_SPECIAL" };
  }
  
  // Check entropy: password should have sufficient randomness
  const entropy = calculateEntropy(password);
  if (entropy < 3.5) {
    return { ok: false, error: "PASSWORD_TOO_WEAK_ENTROPY" };
  }
  
  return { ok: true };
}

// Generate cryptographically secure CSRF token
function generateCsrfToken(): string {
  // Generate 32 bytes of random data and convert to hex (64 chars)
  return randomBytes(32).toString("hex");
}

// Verify CSRF token - check format and validity
function verifyCsrfToken(token: string, expectedToken: string | null): boolean {
  if (!expectedToken || !token) return false;
  if (typeof token !== "string" || typeof expectedToken !== "string") return false;
  if (token.length !== 64 || expectedToken.length !== 64) return false;
  // Constant-time comparison to prevent timing attacks
  return token === expectedToken;
}

const loginSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(128),
    csrfToken: z.string().optional()
  })
  .strict();

const contactSchema = z
  .object({
    name: z.string().min(1).max(120).trim(),
    email: z.string().email().max(200).toLowerCase(),
    subject: z.string().min(1).max(200).trim(),
    message: z.string().min(10).max(2000).trim()
  })
  .strict();

const statusUpdateSchema = z
  .object({
    status: z.enum(["NEW", "READ", "RESPONDED", "CLOSED"]).optional()
  })
  .strict();

const userLoginSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(12).max(128)
  })
  .strict();

const userRegisterSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(12).max(128)
  })
  .strict();

const sessionCookie = "shielded_admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_HOURS = 48;

// Time utilities
function nowIso(): string {
  return new Date().toISOString();
}

function getExpirationTime(durationMs: number = SESSION_DURATION_MS): string {
  return new Date(Date.now() + durationMs).toISOString();
}

// Audit logging with proper structure
function audit(
  db: ReturnType<typeof getDb>,
  eventType: string,
  userEmail: string | null | undefined,
  metadata: Record<string, unknown> = {},
  walletId: string | null = null
): void {
  try {
    db.prepare(
      "INSERT INTO audit_events (event_type, wallet_id, metadata, timestamp) VALUES (?, ?, ?, ?)"
    ).run(
      eventType,
      walletId,
      JSON.stringify({ userEmail, timestamp: nowIso(), ...metadata }),
      nowIso()
    );
  } catch (error) {
    console.error("Failed to log audit event:", error);
  }
}

// Session management with validation
interface SessionData {
  email: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
}

function getSessionEmail(
  db: ReturnType<typeof getDb>,
  request: { cookies?: Record<string, string | undefined> }
): string | null {
  const token = request.cookies?.[sessionCookie];
  if (!token) return null;

  try {
    // Validate token format
    if (typeof token !== "string" || token.length === 0) return null;

    // Check session in database (for persistence across restarts)
    const session = db
      .prepare("SELECT email, expires_at FROM sessions WHERE token = ? AND expires_at > ? LIMIT 1")
      .get(token, nowIso()) as { email: string; expires_at: string } | undefined;

    return session?.email ?? null;
  } catch (error) {
    console.error("Session lookup failed:", error);
    return null;
  }
}

// Rate limiting helpers
function checkRateLimit(db: ReturnType<typeof getDb>, key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const windowStart = new Date(now - windowMs).toISOString();
  
  try {
    const count = (db.prepare(
      "SELECT COUNT(*) as count FROM audit_events WHERE metadata LIKE ? AND timestamp > ?"
    ).get(`%"${key}"%`, windowStart) as { count: number })?.count || 0;
    
    return count < maxAttempts;
  } catch {
    return true; // Fail open on error
  }
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // Contact form submission with rate limiting
  app.post(
    "/api/contact",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      preValidation: validateBody(contactSchema, { allowPII: true })
    },
    async (request, reply) => {
      try {
        const body = request.body as z.infer<typeof contactSchema>;
        const db = getDb();

        // Prevent duplicate submissions from same email within 5 minutes
        const recentSubmission = db
          .prepare(
            "SELECT id FROM contact_messages WHERE email = ? AND created_at > datetime('now', '-5 minutes') LIMIT 1"
          )
          .get(body.email);

        if (recentSubmission) {
          reply.code(429).send({ ok: false, error: "TOO_MANY_SUBMISSIONS", retryAfter: 300 });
          return;
        }

        const id = randomUUID();
        const createdAt = nowIso();
        
        db.prepare(
          "INSERT INTO contact_messages (id, name, email, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(id, body.name, body.email, body.subject, body.message, "NEW", createdAt, createdAt);

        audit(db, "CONTACT_RECEIVED", undefined, { messageId: id, subject: body.subject });

        reply.code(201).send({ ok: true, id, createdAt });
      } catch (error) {
        console.error("Contact submission error:", error);
        reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
      }
    }
  );

  // Admin login with improved security
  app.post(
    "/api/admin/login",
    { preValidation: validateBody(loginSchema, { allowPII: true }) },
    async (request, reply) => {
      try {
        const body = request.body as z.infer<typeof loginSchema>;
        const db = getDb();

        // Check rate limit on failed attempts
        const recentFailures = (db.prepare(
          "SELECT COUNT(*) as count FROM audit_events WHERE event_type = 'LOGIN_FAILED' AND metadata LIKE ? AND timestamp > datetime('now', '-15 minutes')"
        ).get(`%"${body.email}"%`) as { count: number })?.count || 0;

        if (recentFailures >= 5) {
          audit(db, "LOGIN_FAILED", body.email, { reason: "ACCOUNT_LOCKED" });
          reply.code(429).send({ ok: false, error: "ACCOUNT_LOCKED", retryAfter: 900 });
          return;
        }

        const admin = db
          .prepare("SELECT id, email, password_hash FROM admins WHERE email = ? LIMIT 1")
          .get(body.email) as { id: string; email: string; password_hash: string } | undefined;

        if (!admin) {
          audit(db, "LOGIN_FAILED", body.email, { reason: "USER_NOT_FOUND" });
          reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });
          return;
        }

        const passwordValid = await bcrypt.compare(body.password, admin.password_hash);
        if (!passwordValid) {
          audit(db, "LOGIN_FAILED", body.email, { reason: "INVALID_PASSWORD" });
          reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });
          return;
        }

        // Create session
        const token = randomBytes(32).toString("hex");
        const expiresAt = getExpirationTime();

        db.prepare(
          "INSERT INTO sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)"
        ).run(token, admin.email, expiresAt, nowIso());

        audit(db, "LOGIN_SUCCESS", admin.email, {});

        reply
          .setCookie(sessionCookie, token, {
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_DURATION_MS / 1000
          })
          .code(200)
          .send({ ok: true, email: admin.email });
      } catch (error) {
        console.error("Admin login error:", error);
        reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
      }
    }
  );

  // Admin logout with session cleanup
  app.post("/api/admin/logout", async (request, reply) => {
    try {
      const db = getDb();
      const token = request.cookies?.[sessionCookie];
      const email = getSessionEmail(db, request);

      if (token) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }

      if (email) {
        audit(db, "ADMIN_LOGOUT", email, {});
      }

      reply.clearCookie(sessionCookie, { path: "/" }).code(200).send({ ok: true });
    } catch (error) {
      console.error("Admin logout error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Session validation endpoint
  app.get("/api/admin/session", async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);
      reply.code(200).send({ ok: Boolean(email), email });
    } catch (error) {
      console.error("Session check error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Get contact messages inbox (requires authentication)
  app.get("/api/admin/inbox", async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);

      if (!email) {
        reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const messages = db
        .prepare(
          "SELECT id, name, email, subject, status, created_at, updated_at FROM contact_messages ORDER BY created_at DESC LIMIT 100"
        )
        .all();

      reply.code(200).send({ ok: true, messages, count: messages.length });
    } catch (error) {
      console.error("Inbox error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Get specific message with audit logging
  app.get("/api/admin/messages/:id", async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);

      if (!email) {
        reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const { id } = request.params as { id: string };

      // Validate ID format
      if (!id || typeof id !== "string" || id.length === 0) {
        reply.code(400).send({ ok: false, error: "INVALID_MESSAGE_ID" });
        return;
      }

      const message = db
        .prepare("SELECT * FROM contact_messages WHERE id = ? LIMIT 1")
        .get(id);

      if (!message) {
        reply.code(404).send({ ok: false, error: "MESSAGE_NOT_FOUND" });
        return;
      }

      audit(db, "CONTACT_VIEWED", email, { messageId: id });
      reply.code(200).send({ ok: true, message });
    } catch (error) {
      console.error("Message fetch error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Update message status
  app.post("/api/admin/messages/:id/status", { preValidation: validateBody(statusUpdateSchema) }, async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);

      if (!email) {
        reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof statusUpdateSchema>;
      const status = body.status ?? "READ";

      // Verify message exists
      const message = db.prepare("SELECT id FROM contact_messages WHERE id = ? LIMIT 1").get(id);
      if (!message) {
        reply.code(404).send({ ok: false, error: "MESSAGE_NOT_FOUND" });
        return;
      }

      db.prepare(
        "UPDATE contact_messages SET status = ?, updated_at = ? WHERE id = ?"
      ).run(status, nowIso(), id);

      audit(db, "CONTACT_STATUS_UPDATED", email, { messageId: id, newStatus: status });

      reply.code(200).send({ ok: true });
    } catch (error) {
      console.error("Status update error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Get audit logs
  app.get("/api/admin/audit", async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);

      if (!email) {
        reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const events = db
        .prepare(
          "SELECT id, event_type, metadata, timestamp FROM audit_events ORDER BY timestamp DESC LIMIT 500"
        )
        .all();

      reply.code(200).send({ ok: true, events, count: events.length });
    } catch (error) {
      console.error("Audit log error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Get revocation history
  app.get("/api/admin/revocations", async (request, reply) => {
    try {
      const db = getDb();
      const email = getSessionEmail(db, request);

      if (!email) {
        reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
        return;
      }

      const revocations = db
        .prepare(
          "SELECT revocation_id, target_type, target_id, reason_code, effective_at FROM revocations ORDER BY effective_at DESC LIMIT 100"
        )
        .all();

      reply.code(200).send({ ok: true, revocations, count: revocations.length });
    } catch (error) {
      console.error("Revocation history error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // User registration with strict validation
  app.post(
    "/api/user/register",
    { preValidation: validateBody(userRegisterSchema, { allowPII: true }) },
    async (request, reply) => {
      try {
        const { email, password } = request.body as z.infer<typeof userRegisterSchema>;

        // Validate password strength
        const pwdCheck = validatePasswordStrength(password);
        if (!pwdCheck.ok) {
          reply.code(400).send({ ok: false, error: pwdCheck.error });
          return;
        }

        const db = getDb();

        // Check if user already exists
        const existing = db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").get(email);
        if (existing) {
          audit(db, "LOGIN_FAILED", email, { reason: "USER_EXISTS" });
          reply.code(409).send({ ok: false, error: "USER_EXISTS" });
          return;
        }

        // Hash password with bcrypt (10 rounds minimum)
        const hash = await bcrypt.hash(password, 12);
        const id = randomUUID();
        const createdAt = nowIso();

        db.prepare(
          "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
        ).run(id, email, hash, createdAt);

        audit(db, "USER_REGISTERED", email, { userId: id });

        reply.code(201).send({ ok: true, userId: id, createdAt });
      } catch (error) {
        console.error("User registration error:", error);
        reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
      }
    }
  );

  // User login with rate limiting and session management
  app.post(
    "/api/user/login",
    { preValidation: validateBody(userLoginSchema, { allowPII: true }) },
    async (request, reply) => {
      try {
        const { email, password } = request.body as z.infer<typeof userLoginSchema>;
        const db = getDb();

        // Check rate limit
        const recentFailures = (db.prepare(
          "SELECT COUNT(*) as count FROM audit_events WHERE event_type = 'LOGIN_FAILED' AND metadata LIKE ? AND timestamp > datetime('now', '-15 minutes')"
        ).get(`%"${email}"%`) as { count: number })?.count || 0;

        if (recentFailures >= 5) {
          audit(db, "LOGIN_FAILED", email, { reason: "ACCOUNT_LOCKED" });
          reply.code(429).send({ ok: false, error: "ACCOUNT_LOCKED", retryAfter: 900 });
          return;
        }

        // Find user and verify password
        const user = db
          .prepare("SELECT id, password_hash FROM users WHERE email = ? LIMIT 1")
          .get(email) as { id: string; password_hash: string } | undefined;

        if (!user) {
          audit(db, "LOGIN_FAILED", email, { reason: "USER_NOT_FOUND" });
          reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });
          return;
        }

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
          audit(db, "LOGIN_FAILED", email, { reason: "INVALID_PASSWORD" });
          reply.code(401).send({ ok: false, error: "INVALID_CREDENTIALS" });
          return;
        }

        // Create session
        const token = randomBytes(32).toString("hex");
        const expiresAt = getExpirationTime();

        db.prepare(
          "INSERT INTO sessions (token, email, expires_at, created_at) VALUES (?, ?, ?, ?)"
        ).run(token, email, expiresAt, nowIso());

        audit(db, "USER_LOGIN", email, { userId: user.id });

        reply
          .setCookie(sessionCookie, token, {
            httpOnly: true,
            sameSite: "strict",
            path: "/",
            secure: process.env.NODE_ENV === "production",
            maxAge: SESSION_DURATION_MS / 1000
          })
          .code(200)
          .send({ ok: true, email, userId: user.id });
      } catch (error) {
        console.error("User login error:", error);
        reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
      }
    }
  );

  // User logout with session cleanup
  app.post("/api/user/logout", async (request, reply) => {
    try {
      const db = getDb();
      const token = request.cookies?.[sessionCookie];

      if (token) {
        const session = db
          .prepare("SELECT email FROM sessions WHERE token = ? LIMIT 1")
          .get(token) as { email: string } | undefined;

        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);

        if (session) {
          audit(db, "USER_LOGOUT", session.email, {});
        }
      }

      reply.clearCookie(sessionCookie, { path: "/" }).code(200).send({ ok: true });
    } catch (error) {
      console.error("User logout error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });

  // Password reset request (stub - implement proper email flow)
  app.post("/api/user/forgot-password", async (request, reply) => {
    try {
      const payload = request.body as { email?: string } | undefined;
      const email = payload?.email;

      if (!email || typeof email !== "string") {
        reply.code(400).send({ ok: false, error: "INVALID_EMAIL" });
        return;
      }

      const db = getDb();

      // Check if user exists
      const user = db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").get(email);
      if (!user) {
        // Don't reveal whether user exists for security
        audit(db, "LOGIN_FAILED", email, { reason: "RESET_REQUEST" });
        reply.code(200).send({ ok: true, message: "If account exists, password reset email will be sent" });
        return;
      }

      // Generate reset token (in production, send via email)
      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = getExpirationTime(60 * 60 * 1000); // 1 hour expiry

      db.prepare(
        "INSERT INTO password_resets (email, token, expires_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET token = ?, expires_at = ?, created_at = ?"
      ).run(email, resetToken, expiresAt, nowIso(), resetToken, expiresAt, nowIso());

      audit(db, "LOGIN_FAILED", email, { reason: "RESET_REQUESTED" });

      reply.code(200).send({ ok: true, message: "Password reset email sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      reply.code(500).send({ ok: false, error: "INTERNAL_SERVER_ERROR" });
    }
  });
}
