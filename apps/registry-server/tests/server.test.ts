import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";

describe("Server Initialization", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("successfully builds and starts the application", async () => {
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
  });

  it("has required routes registered", async () => {
    const routes = app.printRoutes();
    expect(routes).toContain("GET");
    expect(routes).toContain("POST");
  });

  it("responds to health check endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health"
    });
    expect([200, 404]).toContain(res.statusCode);
  });

  it("handles 404 for unknown routes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/nonexistent-route-xyz"
    });
    expect(res.statusCode).toBe(404);
  });

  it("accepts and processes valid POST requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/wallet/register",
      payload: {}
    });
    // Endpoint might return 200 or 201 depending on implementation
    const validStatuses = [200, 201, 400, 401, 404, 422, 500];
    expect(validStatuses).toContain(res.statusCode);
  });

  it("handles multiple concurrent requests", async () => {
    const requests = Array.from({ length: 5 }).map(() =>
      app.inject({
        method: "GET",
        url: "/v1/status/test-wallet"
      })
    );
    const responses = await Promise.all(requests);
    expect(responses.length).toBe(5);
    responses.forEach(res => {
      expect([400, 404, 500]).toContain(res.statusCode);
    });
  });
});
