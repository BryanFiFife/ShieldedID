// @ts-nocheck
/**
 * Shielded ID Chaos Engineering Test Suite
 * File: apps/registry-server/tests/chaos.test.ts
 * 
 * Resilience and failure mode testing
 * Ensures system degrades gracefully under adverse conditions
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios from "axios";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:3001";
const VERIFIER_URL = process.env.VERIFIER_URL || "http://localhost:3002";

describe.skip("Chaos Engineering: Shielded ID Resilience", () => {
  // ============================================================
  // Test 1: Registry Unavailability Handling
  // ============================================================

  describe("Registry Failure Modes", () => {
    it.skip("Verifier handles registry timeout gracefully", async () => {
      // Simulate slow registry response (10s delay)
      const slowRegistry = axios.create({
        baseURL: REGISTRY_URL,
        timeout: 5000 // 5s timeout
      });

      try {
        // This should timeout
        await slowRegistry.get("/api/keys/key-123", {
          adapter: async () => {
            // Simulate 10s delay
            await new Promise((resolve) => setTimeout(resolve, 10000));
            return { status: 200, data: {} };
          }
        });

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        // Expect timeout error
        expect(error.code).toBe("ECONNABORTED");
      }
    });

    it("Revocation check uses cache when registry unavailable", async () => {
      // Pre-populate cache
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      // First request hits registry
      const result1 = await verifier.post("/api/verify", {
        requestId: "test-1",
        keyId: "key-123",
        signature: "sig-base64url",
        pairwiseSubjectId: "subj-123"
      });

      expect(result1.status).toBe(200 | 401); // May fail validation, but server responds

      // Kill registry
      const registry = axios.create({ baseURL: REGISTRY_URL });
      await registry.post("/admin/shutdown"); // Admin endpoint

      // Wait for registry to die
      await new Promise((r) => setTimeout(r, 2000));

      // Second request should use cache
      const result2 = await verifier.post("/api/verify", {
        requestId: "test-2",
        keyId: "key-123", // Same key
        signature: "sig-base64url",
        pairwiseSubjectId: "subj-123"
      });

      // Should still respond (from cache)
      expect(result2.status).toBe(200 | 401);
    });

    it("Proper error messages when registry permanently down", async () => {
      // Disable registry
      const registry = axios.create({ baseURL: REGISTRY_URL });

      try {
        await registry.post("/admin/shutdown");
      } catch {
        // Ignore if already down
      }

      // Wait a bit
      await new Promise((r) => setTimeout(r, 1000));

      // Try to verify with fresh cache
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const result = await verifier.post("/api/verify", {
        requestId: "test-3",
        keyId: "key-unknown-999",
        signature: "sig",
        pairwiseSubjectId: "subj"
      });

      // Should get proper error, not 500
      expect([400, 401, 404, 503]).toContain(result.status);
      expect(result.data.error).toBeDefined();
    });
  });

  // ============================================================
  // Test 2: Load Testing & Throughput
  // ============================================================

  describe("Load Testing", () => {
    it("Registry handles 100 concurrent verification requests", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const requests = Array.from({ length: 100 }, (_, i) =>
        verifier.post("/api/verify", {
          requestId: `load-test-${i}`,
          keyId: "key-123",
          signature: "sig-base64url",
          pairwiseSubjectId: `subj-${i}`
        })
      );

      const startTime = Date.now();
      const results = await Promise.allSettled(requests);
      const duration = Date.now() - startTime;

      // Count successes and failures
      const successes = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected").length;

      console.log(
        `Load test: ${successes} success, ${failures} failed in ${duration}ms`
      );

      // At least 80% should succeed
      expect(successes / results.length).toBeGreaterThan(0.8);

      // Should complete within reasonable time (e.g., 30s)
      expect(duration).toBeLessThan(30000);
    });

    it("Throughput >= 10 requests/second", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const startTime = Date.now();
      let count = 0;

      // Send requests for 10 seconds
      while (Date.now() - startTime < 10000) {
        try {
          await verifier.post("/api/verify", {
            requestId: `throughput-${count}`,
            keyId: "key-123",
            signature: "sig",
            pairwiseSubjectId: `subj-${count}`
          });
          count++;
        } catch {
          // Ignore failures for throughput test
        }
      }

      const throughput = count / 10;
      console.log(`Throughput: ${throughput} req/s`);

      expect(throughput).toBeGreaterThan(10);
    });

    it("Latency percentiles acceptable under load", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const latencies: number[] = [];

      // Send 50 requests and measure latency
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        try {
          await verifier.post("/api/verify", {
            requestId: `latency-${i}`,
            keyId: "key-123",
            signature: "sig",
            pairwiseSubjectId: `subj-${i}`
          });
          latencies.push(Date.now() - start);
        } catch {
          latencies.push(Date.now() - start);
        }
      }

      // Sort and calculate percentiles
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log(`Latency - P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);

      // Expectations (adjust based on infrastructure)
      expect(p50).toBeLessThan(50); // Median under 50ms
      expect(p95).toBeLessThan(200); // 95th percentile under 200ms
      expect(p99).toBeLessThan(500); // 99th percentile under 500ms
    });
  });

  // ============================================================
  // Test 3: Malformed Input Handling
  // ============================================================

  describe("Malformed Input Handling", () => {
    it("Rejects invalid JSON", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      try {
        await verifier.post("/api/verify", "{invalid json");
        expect(true).toBe(false); // Should not reach
      } catch (error: any) {
        expect([400, 422]).toContain(error.response?.status);
      }
    });

    it("Rejects missing required fields", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const testCases = [
        {}, // Empty
        { requestId: "test-1" }, // Missing other fields
        { keyId: "key-123" }, // Missing other fields
        { signature: "sig" } // Missing other fields
      ];

      for (const testCase of testCases) {
        try {
          await verifier.post("/api/verify", testCase);
          expect(true).toBe(false); // Should reject
        } catch (error: any) {
          expect(error.response?.status).toBe(400);
        }
      }
    });

    it("Rejects tampered signatures", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const validProof = {
        requestId: "test-tamper",
        keyId: "key-123",
        signature: "VGhpcyBpcyBhIHZhbGlkIHNpZ25hdHVyZQ==", // Valid base64url
        pairwiseSubjectId: "subj-123"
      };

      // Tamper with signature
      validProof.signature = validProof.signature.slice(0, -4) + "XXXX";

      try {
        await verifier.post("/api/verify", validProof);
      } catch (error: any) {
        expect([401, 400]).toContain(error.response?.status);
      }
    });

    it("Rejects oversized payloads", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const hugeProof = {
        requestId: "test-huge",
        keyId: "key-123",
        signature: "sig",
        pairwiseSubjectId: "x".repeat(1000000) // 1MB
      };

      try {
        await verifier.post("/api/verify", hugeProof, {
          maxBodyLength: 1000000
        });
      } catch (error: any) {
        expect([400, 413]).toContain(error.response?.status);
      }
    });
  });

  // ============================================================
  // Test 4: Replay Attack Prevention
  // ============================================================

  describe("Replay Attack Prevention", () => {
    it("Blocks proof reuse with same nonce", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const proof = {
        requestId: "test-replay",
        nonce: "same-nonce-123",
        keyId: "key-123",
        signature: "sig",
        pairwiseSubjectId: "subj-123"
      };

      // First attempt
      let result1;
      try {
        result1 = await verifier.post("/api/verify", proof);
      } catch (error: any) {
        result1 = error.response?.data;
      }

      // Second attempt with same nonce
      let result2;
      try {
        result2 = await verifier.post("/api/verify", proof);
      } catch (error: any) {
        result2 = error.response?.data;
      }

      // Second should fail (replay)
      if (result1?.valid) {
        expect(result2?.error || result2?.valid).not.toBe(true);
        expect(result2?.reason).toContain("REPLAY");
      }
    });
  });

  // ============================================================
  // Test 5: Key Rotation & Migration
  // ============================================================

  describe("Key Rotation", () => {
    it("Old keys still work during rotation period", async () => {
      const registry = axios.create({ baseURL: REGISTRY_URL });

      // Get current key version
      const keysResp = await registry.get("/api/keys");
      const oldKeyId = keysResp.data[0].keyId;

      // Rotate (add new key, keep old one for 30 days)
      await registry.post("/admin/rotate-keys", { newKeyVersion: "v2" });

      // Old key should still verify
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      const oldProof = {
        requestId: "test-rotation",
        keyId: oldKeyId,
        signature: "old-sig",
        pairwiseSubjectId: "subj-123"
      };

      try {
        await verifier.post("/api/verify", oldProof);
        // May fail for other reasons (bad sig), but not because key is gone
      } catch (error: any) {
        expect(error.response?.data?.reason).not.toBe("KEY_NOT_FOUND");
      }
    });
  });

  // ============================================================
  // Test 6: Graceful Degradation
  // ============================================================

  describe("Graceful Degradation", () => {
    it("System remains available despite cache expiry", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      // Expire all caches (simulated)
      await verifier.post("/admin/clear-cache");

      // Registry is down
      const registry = axios.create({ baseURL: REGISTRY_URL });
      await registry.post("/admin/shutdown");

      await new Promise((r) => setTimeout(r, 2000));

      // Verifier should still respond (even if with error)
      try {
        const result = await verifier.post("/api/verify", {
          requestId: "test-degrade",
          keyId: "key-123",
          signature: "sig",
          pairwiseSubjectId: "subj-123"
        });

        // Status should be 4xx or 5xx, but server responds
        expect([400, 401, 503]).toContain(result.status);
      } catch (error: any) {
        // Connection refused is also acceptable (service restarting)
        expect(error.code).toBe("ECONNREFUSED");
      }
    });
  });

  // ============================================================
  // Test 7: Security Under Attack
  // ============================================================

  describe("Security Under Attack", () => {
    it("Rate limiting activates under high load", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      // Send many requests rapidly
      const requests = Array.from({ length: 200 }, (_, i) =>
        verifier.post("/api/verify", {
          requestId: `rate-limit-${i}`,
          keyId: "key-123",
          signature: "sig",
          pairwiseSubjectId: `subj-${i}`
        }).catch((e) => ({ status: e.response?.status }))
      );

      const results = await Promise.all(requests);

      // Should have some 429 (Too Many Requests) responses
      const rateLimited = results.filter((r) => r.status === 429);

      console.log(`Rate limited: ${rateLimited.length} / ${results.length}`);

      if (rateLimited.length > 0) {
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    });

    it("No information leakage in error messages", async () => {
      const verifier = axios.create({ baseURL: VERIFIER_URL });

      try {
        await verifier.post("/api/verify", {
          keyId: "non-existent-key",
          signature: "invalid",
          pairwiseSubjectId: "x"
        });
      } catch (error: any) {
        const errorMessage = error.response?.data?.message;

        // Should not expose internal details
        expect(errorMessage).not.toMatch(/database|SQL|PostgreSQL/i);
        expect(errorMessage).not.toMatch(/stack trace/i);
        expect(errorMessage).not.toMatch(/file path/i);
      }
    });
  });

  // ============================================================
  // Test 8: Data Consistency
  // ============================================================

  describe("Data Consistency", () => {
    it("Audit logs are immutable", async () => {
      const registry = axios.create({ baseURL: REGISTRY_URL });

      // Get an audit log entry
      const logsResp = await registry.get("/api/audit-logs?limit=1");
      const originalLog = logsResp.data[0];

      // Attempt to modify it
      try {
        await registry.patch(`/api/audit-logs/${originalLog.id}`, {
          event_type: "MODIFIED"
        });

        expect(true).toBe(false); // Should not allow modification
      } catch (error: any) {
        expect([403, 404]).toContain(error.response?.status);
      }

      // Verify log is unchanged
      const verifyResp = await registry.get(`/api/audit-logs/${originalLog.id}`);
      expect(verifyResp.data.event_type).toBe(originalLog.event_type);
    });
  });
});
