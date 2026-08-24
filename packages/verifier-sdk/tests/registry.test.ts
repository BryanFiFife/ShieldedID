import { describe, it, expect, beforeEach, vi } from "vitest";
import { RegistryClient } from "../src/registry.js";

let fetchCalls = 0;

beforeEach(() => {
  fetchCalls = 0;
  // Don't set up global fetch here - let individual tests set it up
});

describe("RegistryClient", () => {
  it("does not cache trust lookups by default", async () => {
    globalThis.fetch = (async (url: string) => {
      fetchCalls += 1;
      if (url.includes("/v1/status/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ walletId: "wallet-1", keys: [] })
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;

    // Default cacheTtlMs is 0 -> verification correctness must not depend on
    // stale registry state, so trust lookups are uncached unless opted in.
    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    const first = await client.getWalletStatus("wallet-1");
    const second = await client.getWalletStatus("wallet-1");

    expect(first?.walletId).toBe("wallet-1");
    expect(second?.walletId).toBe("wallet-1");
    expect(fetchCalls).toBe(2);
  });

  it("caches wallet status when a positive TTL is configured", async () => {
    globalThis.fetch = (async (url: string) => {
      fetchCalls += 1;
      if (url.includes("/v1/status/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ walletId: "wallet-1", keys: [] })
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example", cacheTtlMs: 300_000 });
    const first = await client.getWalletStatus("wallet-1");
    const second = await client.getWalletStatus("wallet-1");

    expect(first?.walletId).toBe("wallet-1");
    expect(second?.walletId).toBe("wallet-1");
    expect(fetchCalls).toBe(1);
  });

  it("expires cache after timeout", async () => {
    globalThis.fetch = (async (url: string) => {
      fetchCalls += 1;
      if (url.includes("/v1/status/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ walletId: "wallet-1", keys: [] })
        } as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example", cacheTtlMs: 300_000 });
    // Mock Date.now to simulate time passing
    const originalNow = Date.now;
    Date.now = vi.fn().mockReturnValue(0);

    await client.getWalletStatus("wallet-1");
    expect(fetchCalls).toBe(1);

    // Simulate cache expiry (5 minutes = 300000 ms)
    Date.now = vi.fn().mockReturnValue(300001);

    await client.getWalletStatus("wallet-1");
    expect(fetchCalls).toBe(2);

    Date.now = originalNow;
  });

  it("handles wallet not found", async () => {
    // Override the global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/status/wallet-missing")) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    const result = await client.getWalletStatus("wallet-missing");
    expect(result).toBe(null);

    globalThis.fetch = originalFetch;
  });

  it("throws KEY_NOT_FOUND when key status is missing", async () => {
    // Override the global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/keys/key-missing/status")) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    // A missing key must fail closed (throw), never silently resolve as active.
    await expect(client.getKeyStatusViaNewEndpoint("key-missing")).rejects.toThrow("KEY_NOT_FOUND");

    globalThis.fetch = originalFetch;
  });

  it("throws ISSUER_KEY_NOT_FOUND for missing issuer key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/issuers/did%3Aexample%3Amissing/keys/k1") || url.includes("/v1/issuers/did:example:missing/keys/k1")) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    await expect(client.getIssuerKey("did:example:missing", "k1")).rejects.toThrow("ISSUER_KEY_NOT_FOUND");

    globalThis.fetch = originalFetch;
  });

  it("returns a resolved issuer key", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/issuers/did%3Aexample%3Aissuer/keys/issuer-key-1") || url.includes("/v1/issuers/did:example:issuer/keys/issuer-key-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            issuerDid: "did:example:issuer",
            keyId: "issuer-key-1",
            status: "ACTIVE",
            publicKey: { kty: "EC", crv: "P-256" },
            createdAt: "2024-01-01T00:00:00Z"
          })
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    const key = await client.getIssuerKey("did:example:issuer", "issuer-key-1");
    expect(key.status).toBe("ACTIVE");
    expect(key.publicKey.crv).toBe("P-256");

    globalThis.fetch = originalFetch;
  });

  it("handles registry errors", async () => {
    // Override the global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/status/wallet-error")) {
        return { ok: false, status: 500 } as Response;
      }
      if (url.includes("/v1/keys/key-error/status")) {
        return { ok: false, status: 500 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    await expect(client.getWalletStatus("wallet-error")).rejects.toThrow("REGISTRY_ERROR");
    await expect(client.getKeyStatusViaNewEndpoint("key-error")).rejects.toThrow("REGISTRY_ERROR");

    globalThis.fetch = originalFetch;
  });

  describe("circuit breaker", () => {
    it("opens circuit after threshold failures", async () => {
      let callCount = 0;
      globalThis.fetch = (async () => {
        callCount++;
        return { ok: false, status: 500 } as Response;
      }) as typeof fetch;

      const client = new RegistryClient({ registryUrl: "https://registry.example" });

      // Make multiple failing calls to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await client.getWalletStatus("wallet-fail");
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit should be open now
      await expect(client.getWalletStatus("wallet-fail")).rejects.toThrow("REGISTRY_CIRCUIT_OPEN");
    });

    it("resets circuit breaker after reset timeout", async () => {
      let callCount = 0;
      globalThis.fetch = (async () => {
        callCount++;
        return { ok: false, status: 500 } as Response;
      }) as typeof fetch;

      const client = new RegistryClient({ registryUrl: "https://registry.example" });

      // Trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await client.getWalletStatus("wallet-fail");
        } catch (e) {
          // Expected to fail
        }
      }

      // Mock time passing to reset circuit breaker
      const originalNow = Date.now;
      Date.now = vi.fn().mockReturnValue(Date.now() + 60001); // 60 seconds later

      // Next call should succeed (circuit reset)
      globalThis.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ walletId: "wallet-1", keys: [] })
        } as Response;
      }) as typeof fetch;

      const result = await client.getWalletStatus("wallet-ok");
      expect(result?.walletId).toBe("wallet-1");

      Date.now = originalNow;
    });

    it("serves an unexpired opt-in cached value during an outage", async () => {
      // RegistryClient's default cacheTtlMs is 0 (trust lookups uncached), which
      // is how the verifier uses it: verification never depends on stale registry
      // state. A positive TTL is an explicit, documented consumer opt-in that
      // trades freshness for availability. Here we assert the opt-in behaviour:
      // an unexpired cached entry is returned even while the circuit is open.
      globalThis.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ walletId: "cached-wallet", keys: [] })
        } as Response;
      }) as typeof fetch;

      const client = new RegistryClient({ registryUrl: "https://registry.example", cacheTtlMs: 60_000 });
      const cachedResult = await client.getWalletStatus("cached-wallet");
      expect(cachedResult?.walletId).toBe("cached-wallet");

      // Now trigger circuit breaker
      globalThis.fetch = (async () => {
        return { ok: false, status: 500 } as Response;
      }) as typeof fetch;

      // Make multiple failing calls to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await client.getWalletStatus("other-wallet");
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit is open but the opted-in cached value is still unexpired.
      const staleResult = await client.getWalletStatus("cached-wallet");
      expect(staleResult?.walletId).toBe("cached-wallet");
    });

    it("throws when circuit breaker is open and no stale cache", async () => {
      globalThis.fetch = (async () => {
        return { ok: false, status: 500 } as Response;
      }) as typeof fetch;

      const client = new RegistryClient({ registryUrl: "https://registry.example" });

      // Make multiple failing calls to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await client.getWalletStatus("wallet-fail");
        } catch (e) {
          // Expected to fail
        }
      }

      // Circuit should be open and no cache available
      await expect(client.getWalletStatus("uncached-wallet")).rejects.toThrow("REGISTRY_CIRCUIT_OPEN");
    });
  });
});
