import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  OfflineVerifier,
  OfflineCacheManager,
  OfflineVerificationConfig,
  OfflineVerificationResult,
  RevocationRecord
} from "../src/offline-mode.js";

// Mock crypto.subtle for offline verification tests
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      importKey: vi.fn().mockResolvedValue('mock-key'),
      verify: vi.fn().mockResolvedValue(true)
    }
  },
  writable: true
});

describe("OfflineVerifier", () => {
  let config: OfflineVerificationConfig;
  let verifier: OfflineVerifier;

  beforeEach(() => {
    config = {
      cachedKeys: new Map([
        ['key-123', {
          kty: 'EC',
          crv: 'P-256',
          x: 'mock-x',
          y: 'mock-y'
        }],
        ['revoked-key-456', {
          kty: 'EC',
          crv: 'P-256',
          x: 'revoked-x',
          y: 'revoked-y'
        }],
        ['expired-key', {
          kty: 'EC',
          crv: 'P-256',
          x: 'expired-x',
          y: 'expired-y'
        }]
      ]),
      cachedRevocations: new Map([
        ['revoked-key-456', {
          keyId: 'revoked-key-456',
          status: 'revoked',
          revokedAt: '2024-01-01T00:00:00Z',
          reason: 'compromised'
        }],
        ['expired-key', {
          keyId: 'expired-key',
          status: 'expired',
          revokedAt: '2024-01-01T00:00:00Z'
        }]
      ]),
      keysCacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      lastCacheUpdate: new Date().toISOString()
    };
    verifier = new OfflineVerifier(config);
  });

  describe("verifyProofOffline", () => {
    it("verifies valid proof successfully", async () => {
      const proof = {
        keyId: 'key-123',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(true);
      expect(result.details?.signatureValid).toBe(true);
      expect(result.details?.cacheValid).toBe(true);
      expect(result.details?.revocationStatus).toBe('active');
    });

    it("rejects proof with stale cache", async () => {
      // Set cache to be very old
      config.lastCacheUpdate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago

      const proof = {
        keyId: 'key-123',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('OFFLINE_CACHE_STALE');
      expect(result.details?.cacheValid).toBe(false);
    });

    it("rejects proof with unknown key", async () => {
      const proof = {
        keyId: 'unknown-key',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('KEY_NOT_IN_OFFLINE_CACHE');
    });

    it("rejects proof with revoked key", async () => {
      const proof = {
        keyId: 'revoked-key-456',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('KEY_REVOKED');
      expect(result.details?.revocationStatus).toBe('revoked');
      expect(result.details?.revokedAt).toBe('2024-01-01T00:00:00Z');
    });

    it("rejects proof with expired key", async () => {
      config.cachedRevocations.set('expired-key', {
        keyId: 'expired-key',
        status: 'expired',
        revokedAt: '2024-01-01T00:00:00Z'
      });

      const proof = {
        keyId: 'expired-key',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('KEY_EXPIRED');
      expect(result.details?.revocationStatus).toBe('expired');
    });

    it("rejects proof with invalid signature", async () => {
      // Mock signature verification to fail
      vi.mocked(globalThis.crypto.subtle.verify).mockResolvedValueOnce(false);

      const proof = {
        keyId: 'key-123',
        signature: 'invalid-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofOffline(proof, 'request-456');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
      expect(result.details?.signatureValid).toBe(false);
    });
  });

  describe("verifyProofHybrid", () => {
    it("falls back to offline when online fails", async () => {
      const mockRegistryClient = {
        getKey: vi.fn().mockRejectedValue(new Error('Network error')),
        checkRevocation: vi.fn()
      };

      const proof = {
        keyId: 'key-123',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofHybrid(proof, mockRegistryClient);

      expect(result.valid).toBe(true);
      expect(result.details?.mode).toBe('offline');
    });

    it("uses online verification when available", async () => {
      const mockRegistryClient = {
        getKey: vi.fn().mockResolvedValue({
          kty: 'EC',
          crv: 'P-256',
          x: 'online-x',
          y: 'online-y'
        }),
        checkRevocation: vi.fn().mockResolvedValue({
          keyId: 'key-123',
          status: 'active'
        })
      };

      const proof = {
        keyId: 'key-123',
        signature: 'mock-signature',
        pairwiseSubjectId: 'user-123',
        requestId: 'request-456'
      };

      const result = await verifier.verifyProofHybrid(proof, mockRegistryClient);

      expect(result.valid).toBe(true);
      expect(result.details?.mode).toBe('online');
      expect(mockRegistryClient.getKey).toHaveBeenCalledWith('key-123');
      expect(mockRegistryClient.checkRevocation).toHaveBeenCalledWith('key-123');
    });
  });

  describe("syncOfflineCacheFromRegistry", () => {
    it("syncs keys and revocations from registry", async () => {
      const mockRegistryClient = {
        getAllKeys: vi.fn().mockResolvedValue([
          { keyId: 'key-1', publicKey: { kty: 'EC', crv: 'P-256' } },
          { keyId: 'key-2', publicKey: { kty: 'EC', crv: 'P-256' } }
        ]),
        getAllRevocations: vi.fn().mockResolvedValue([
          { keyId: 'revoked-1', status: 'revoked', revokedAt: '2024-01-01T00:00:00Z' },
          { keyId: 'expired-1', status: 'expired' }
        ])
      };

      await verifier.syncOfflineCacheFromRegistry(mockRegistryClient);

      expect(config.cachedKeys.size).toBe(2);
      expect(config.cachedKeys.has('key-1')).toBe(true);
      expect(config.cachedKeys.has('key-2')).toBe(true);

      expect(config.cachedRevocations.size).toBe(2);
      expect(config.cachedRevocations.get('revoked-1')?.status).toBe('revoked');
      expect(config.cachedRevocations.get('expired-1')?.status).toBe('expired');

      // Check that lastCacheUpdate was updated
      expect(new Date(config.lastCacheUpdate).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it("throws error on sync failure", async () => {
      const mockRegistryClient = {
        getAllKeys: vi.fn().mockRejectedValue(new Error('Sync failed')),
        getAllRevocations: vi.fn()
      };

      await expect(
        verifier.syncOfflineCacheFromRegistry(mockRegistryClient)
      ).rejects.toThrow('Sync failed');
    });
  });

  describe("getCacheAgeSeconds", () => {
    it("calculates cache age correctly", () => {
      const pastTime = new Date(Date.now() - 3600000); // 1 hour ago
      config.lastCacheUpdate = pastTime.toISOString();

      const age = (verifier as any).getCacheAgeSeconds();
      expect(age).toBeGreaterThan(3599); // Approximately 3600 seconds
      expect(age).toBeLessThan(3601);
    });
  });
});

describe("OfflineCacheManager", () => {
  let manager: OfflineCacheManager;

  beforeEach(() => {
    manager = new OfflineCacheManager();
  });

  describe("getStatus", () => {
    it("returns correct cache status", () => {
      const status = manager.getStatus();

      expect(status.cacheSize).toBeDefined();
      expect(status.keyCount).toBe(0);
      expect(status.revocationCount).toBe(0);
      expect(status.lastUpdate).toBeDefined();
      expect(status.age).toBeGreaterThan(0);
      expect(status.isFresh).toBe(false); // Never updated
    });
  });

  describe("clearCache", () => {
    it("clears all cached data", () => {
      // Add some data first
      const verifier = manager.getVerifier();
      const config = (manager as any).config;
      config.cachedKeys.set('test-key', { kty: 'EC' });
      config.cachedRevocations.set('test-revocation', { keyId: 'test', status: 'revoked' });

      manager.clearCache();

      expect(config.cachedKeys.size).toBe(0);
      expect(config.cachedRevocations.size).toBe(0);
      expect(config.lastCacheUpdate).toBe('1970-01-01T00:00:00.000Z');
    });
  });

  describe("getVerifier", () => {
    it("returns OfflineVerifier instance", () => {
      const verifier = manager.getVerifier();
      expect(verifier).toBeInstanceOf(OfflineVerifier);
    });
  });

  describe("serializeCache/deserializeCache", () => {
    it("serializes and deserializes cache correctly", () => {
      // Add some test data
      const verifier = manager.getVerifier();
      const config = (manager as any).config;
      config.cachedKeys.set('test-key', { kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y' });
      config.cachedRevocations.set('test-revocation', {
        keyId: 'test-revocation',
        status: 'revoked',
        revokedAt: '2024-01-01T00:00:00Z'
      });
      config.lastCacheUpdate = '2024-01-01T12:00:00Z';
      config.keysCacheTTL = 48 * 60 * 60 * 1000; // 48 hours

      // Serialize
      const serialized = manager.serializeCache();
      expect(typeof serialized).toBe('string');

      // Create new manager and deserialize
      const newManager = new OfflineCacheManager();
      newManager.deserializeCache(serialized);

      const newConfig = (newManager as any).config;
      expect(newConfig.cachedKeys.size).toBe(1);
      expect(newConfig.cachedKeys.get('test-key')).toEqual({ kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y' });
      expect(newConfig.cachedRevocations.size).toBe(1);
      expect(newConfig.cachedRevocations.get('test-revocation')?.status).toBe('revoked');
      expect(newConfig.lastCacheUpdate).toBe('2024-01-01T12:00:00Z');
      expect(newConfig.keysCacheTTL).toBe(48 * 60 * 60 * 1000);
    });
  });
});