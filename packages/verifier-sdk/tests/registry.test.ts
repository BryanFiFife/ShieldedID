import { describe, it, expect, beforeEach, vi } from "vitest";
import { RegistryClient } from "../src/registry.js";

let fetchCalls = 0;

beforeEach(() => {
  fetchCalls = 0;
  // Don't set up global fetch here - let individual tests set it up
});

describe("RegistryClient", () => {
  it("caches wallet status for 5 minutes", async () => {
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

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
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

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
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

  it("handles key not found", async () => {
    // Override the global fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/v1/keys/key-missing/status")) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    }) as typeof fetch;

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    const result = await client.getKeyStatusViaNewEndpoint("key-missing");
    expect(result).toEqual({ revoked: false });
    
    globalThis.fetch = originalFetch;
  });

  it("handles issuer keys not found", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(".well-known/shielded-id-keys.json")) {
        return { ok: false, status: 404 } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);

    const client = new RegistryClient({ registryUrl: "https://registry.example" });
    await expect(client.fetchIssuerKeys("https://issuer.example")).rejects.toThrow("ISSUER_KEYS_NOT_FOUND");
    
    expect(spy).toHaveBeenCalledWith("https://issuer.example/.well-known/shielded-id-keys.json");
    spy.mockRestore();
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
});
