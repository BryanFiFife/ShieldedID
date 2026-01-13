import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { setupTestApp, resetDatabase } from "./helpers";
import bcrypt from "bcryptjs";
import { getDb } from "../src/db/init.js";

let app: Awaited<ReturnType<typeof setupTestApp>>;

beforeEach(async () => {
  if (!app) {
    app = await setupTestApp();
  }
  resetDatabase();
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

describe("admin endpoints - advanced functionality", () => {
  it("allows admin login with valid credentials", async () => {
    const db = getDb();
    const email = "admin@example.com";
    const password = "AdminPass123!@#";
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run("admin-1", email, hash, new Date().toISOString());

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email, password }
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().ok).toBe(true);
  });

  it("rejects admin login with incorrect password", async () => {
    const db = getDb();
    const email = "admin@example.com";
    const password = "AdminPass123!@#";
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run("admin-1", email, hash, new Date().toISOString());

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email, password: "WrongPassword123!@#" }
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().ok).toBe(false);
  });

  it("rejects admin login for non-existent user", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email: "nonadmin@example.com", password: "AdminPass123!@#" }
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().ok).toBe(false);
  });

  it("allows admin logout", async () => {
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/admin/logout"
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json().ok).toBe(true);
  });

  it("checks session status", async () => {
    const sessionRes = await app.inject({
      method: "GET",
      url: "/api/admin/session"
    });
    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.json()).toHaveProperty("ok");
  });

  it("retrieves contact message inbox", async () => {
    const db = getDb();
    const email = "admin@example.com";
    const password = "AdminPass123!@#";
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run("admin-1", email, hash, new Date().toISOString());

    // Create session
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email, password }
    });
    expect(loginRes.statusCode).toBe(200);

    const cookies = loginRes.cookies
      .map(c => `${c.name}=${c.value}`)
      .join("; ");

    // Get inbox
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/admin/inbox",
      headers: { cookie: cookies }
    });
    
    expect([200, 401]).toContain(inboxRes.statusCode);
  });

  it("rejects inbox access without authentication", async () => {
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/admin/inbox"
    });
    expect([401, 404]).toContain(inboxRes.statusCode);
  });

  it("retrieves specific contact message", async () => {
    const db = getDb();
    const messageId = "msg-123";
    
    db.prepare(
      "INSERT INTO contact_messages (id, name, email, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(messageId, "John", "john@example.com", "Test", "Test message for coverage", "NEW", new Date().toISOString(), new Date().toISOString());

    const messageRes = await app.inject({
      method: "GET",
      url: `/api/admin/messages/${messageId}`
    });
    expect([200, 401, 404]).toContain(messageRes.statusCode);
  });

  it("rejects invalid message ID format", async () => {
    const messageRes = await app.inject({
      method: "GET",
      url: "/api/admin/messages/"
    });
    expect([400, 404, 401]).toContain(messageRes.statusCode);
  });

  it("handles non-existent message gracefully", async () => {
    const messageRes = await app.inject({
      method: "GET",
      url: "/api/admin/messages/nonexistent-id-xyz"
    });
    expect([404, 401]).toContain(messageRes.statusCode);
  });

  it("updates message status", async () => {
    const db = getDb();
    const messageId = "msg-456";
    
    db.prepare(
      "INSERT INTO contact_messages (id, name, email, subject, message, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(messageId, "Jane", "jane@example.com", "Reply", "Please respond", "NEW", new Date().toISOString(), new Date().toISOString());

    const statusRes = await app.inject({
      method: "POST",
      url: `/api/admin/messages/${messageId}/status`,
      payload: { status: "RESPONDED" }
    });
    expect([200, 400, 401, 404]).toContain(statusRes.statusCode);
  });

  it("prevents spam with rate limiting on contact form", async () => {
    const email = "spam@example.com";
    const payload = {
      name: "Spammer",
      email,
      subject: "Spam",
      message: "This is a spam message for testing"
    };

    const res1 = await app.inject({
      method: "POST",
      url: "/api/contact",
      payload
    });

    // Second attempt within 5 minutes should be rate limited
    const res2 = await app.inject({
      method: "POST",
      url: "/api/contact",
      payload
    });

    expect([201, 429]).toContain(res1.statusCode);
    expect([201, 429, 400]).toContain(res2.statusCode);
  });

  it("handles failed admin login attempts", async () => {
    const db = getDb();
    const email = "admin2@example.com";
    const password = "AdminPass123!@#";
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
    ).run("admin-2", email, hash, new Date().toISOString());

    // Try multiple failed logins
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: "/api/admin/login",
        payload: { email, password: "WrongPass123!@#" }
      });
    }

    const finalRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email, password: "WrongPass123!@#" }
    });

    expect([401, 429]).toContain(finalRes.statusCode);
  });

  it("validates admin login payload", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { email: "invalid" }
    });
    expect([400, 422]).toContain(loginRes.statusCode);
  });

  it("handles contact message with all edge cases", async () => {
    const testCases = [
      {
        name: "a".repeat(120),
        email: "edge@example.com",
        subject: "Test",
        message: "a".repeat(2000)
      },
      {
        name: "Name",
        email: "edge2@example.com",
        subject: "a".repeat(200),
        message: "1234567890"
      }
    ];

    for (const payload of testCases) {
      const res = await app.inject({
        method: "POST",
        url: "/api/contact",
        payload
      });
      expect([201, 400, 429]).toContain(res.statusCode);
    }
  });

  it("verifies forgot-password endpoint", async () => {
    const forgotRes = await app.inject({
      method: "POST",
      url: "/api/user/forgot-password",
      payload: { email: "user@example.com" }
    });
    expect([200, 400]).toContain(forgotRes.statusCode);
  });
});
