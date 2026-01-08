import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { setupTestApp, resetDatabase } from "../helpers.js";
import bcrypt from "bcryptjs";
import { getDb } from "../../src/db/init.js";

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

describe("admin and user routes", () => {
  it("allows contact form submission", async () => {
    const contactRes = await app.inject({
      method: "POST",
      url: "/api/contact",
      payload: {
        name: "John Doe",
        email: "john@example.com",
        subject: "Test Subject",
        message: "This is a test message about something"
      }
    });
    expect(contactRes.statusCode).toBe(201);
    expect(contactRes.json().ok).toBe(true);
    expect(contactRes.json().id).toBeDefined();
  });

  it("rejects contact with invalid email", async () => {
    const contactRes = await app.inject({
      method: "POST",
      url: "/api/contact",
      payload: {
        name: "John Doe",
        email: "invalid-email",
        subject: "Test Subject",
        message: "This is a test message about something"
      }
    });
    expect(contactRes.statusCode).toBe(400);
  });

  it("registers a user with strong password", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "StrongPass123!@#"
      }
    });
    expect(userRes.statusCode).toBe(201);
    expect(userRes.json().ok).toBe(true);
  });

  it("rejects user registration with weak password (no uppercase)", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "weakpass123!@#"
      }
    });
    expect(userRes.statusCode).toBe(400);
  });

  it("rejects user registration with weak password (no lowercase)", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "WEAKPASS123!@#"
      }
    });
    expect(userRes.statusCode).toBe(400);
    expect(userRes.json().ok).toBe(false);
  });

  it("rejects user registration with weak password (no number)", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "Weakpass!@#$%"
      }
    });
    expect(userRes.statusCode).toBe(400);
    expect(userRes.json().ok).toBe(false);
  });

  it("rejects user registration with weak password (no special char)", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "Weakpass123456"
      }
    });
    expect(userRes.statusCode).toBe(400);
    expect(userRes.json().ok).toBe(false);
  });

  it("rejects user registration with short password", async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "newuser@example.com",
        password: "Short1!@"
      }
    });
    expect(userRes.statusCode).toBe(400);
  });

  it("rejects duplicate user registration", async () => {
    // First registration succeeds
    const userRes1 = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "duplicate@example.com",
        password: "StrongPass123!@#"
      }
    });
    expect(userRes1.statusCode).toBe(201);
    expect(userRes1.json().ok).toBe(true);

    // Duplicate registration fails
    const userRes2 = await app.inject({
      method: "POST",
      url: "/api/user/register",
      payload: {
        email: "duplicate@example.com",
        password: "StrongPass123!@#"
      }
    });
    expect(userRes2.statusCode).toBe(409);
    expect(userRes2.json().ok).toBe(false);
  });

  it("allows user login with correct credentials", async () => {
    const db = getDb();
    const email = "logintest@example.com";
    const password = "StrongPass123!@#";
    const hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      "test-user-id",
      email,
      hash,
      new Date().toISOString()
    );

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/user/login",
      payload: {
        email,
        password
      }
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().ok).toBe(true);
  });

  it("rejects user login with incorrect password", async () => {
    const db = getDb();
    const email = "logintest2@example.com";
    const password = "StrongPass123!@#";
    const hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      "test-user-id-2",
      email,
      hash,
      new Date().toISOString()
    );

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/user/login",
      payload: {
        email,
        password: "WrongPassword123!@#"
      }
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().ok).toBe(false);
  });

  it("rejects user login with non-existent email", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/user/login",
      payload: {
        email: "nonexistent@example.com",
        password: "StrongPass123!@#"
      }
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().ok).toBe(false);
  });

  it("allows user logout", async () => {
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/user/logout"
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json().ok).toBe(true);
  });

  it("allows forgot-password request", async () => {
    const forgotRes = await app.inject({
      method: "POST",
      url: "/api/user/forgot-password",
      payload: {
        email: "test@example.com"
      }
    });
    expect(forgotRes.statusCode).toBe(200);
    expect(forgotRes.json().ok).toBe(true);
  });
});
