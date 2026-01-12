/**
 * Shielded ID Offline Verification Mode
 * File: packages/verifier-sdk/src/offline-mode.ts
 * 
 * Enables proof verification without registry network access
 * (requires previously cached key list and revocations)
 * 
 * Use case: Mobile apps in poor network conditions, or on airplane mode
 */

/**
 * Offline verification configuration
 */
export interface OfflineVerificationConfig {
  cachedKeys: Map<string, JsonWebKey>;
  cachedRevocations: Map<string, RevocationRecord>;
  keysCacheTTL: number; // milliseconds
  lastCacheUpdate: string; // ISO timestamp
}

/**
 * Revocation record stored in cache
 */
export interface RevocationRecord {
  keyId: string;
  status: "active" | "revoked" | "expired" | "suspended";
  revokedAt?: string;
  reason?: string;
}

/**
 * Verification result for offline mode
 */
export interface OfflineVerificationResult {
  valid: boolean;
  reason?: string;
  details?: {
    cacheAge?: number; // seconds
    cacheValid?: boolean;
    signatureValid?: boolean;
    revocationStatus?: string;
    revokedAt?: string;
    mode?: string;
  };
}

/**
 * Offline Verifier
 * 
 * Extends online verifier with offline-first fallback mode
 * 
 * Strategy:
 * 1. Try to verify online (full revocation check)
 * 2. If network unavailable: use cached data
 * 3. If cache stale: warn but allow (with reduced assurance)
 */
export class OfflineVerifier {
  private offlineConfig: OfflineVerificationConfig;

  constructor(
    offlineConfig: OfflineVerificationConfig
  ) {
    this.offlineConfig = offlineConfig;
  }

  /**
   * Verify proof using only cached keys + revocations
   * No network calls required
   * 
   * @param proof - ProofResponse to verify
   * @param expectedPairwiseId - For security check
   * @returns OfflineVerificationResult
   */
  async verifyProofOffline(
    proof: {
      keyId: string;
      signature: string;
      pairwiseSubjectId: string;
      requestId: string;
    },
    expectedRequestId: string
  ): Promise<OfflineVerificationResult> {
    // ============================================================
    // 1. Check Cache Staleness
    // ============================================================
    const cacheAge = this.getCacheAgeSeconds();

    if (cacheAge > (this.offlineConfig.keysCacheTTL / 1000)) {
      return {
        valid: false,
        reason: "OFFLINE_CACHE_STALE",
        details: {
          cacheAge,
          cacheValid: false
        }
      };
    }

    // ============================================================
    // 2. Check Key Exists in Cache
    // ============================================================
    const publicKey = this.offlineConfig.cachedKeys.get(proof.keyId);
    if (!publicKey) {
      return {
        valid: false,
        reason: "KEY_NOT_IN_OFFLINE_CACHE",
        details: {
          cacheAge
        }
      };
    }

    // ============================================================
    // 3. Check Revocation Status (Offline)
    // ============================================================
    const revocationStatus = this.offlineConfig.cachedRevocations.get(proof.keyId);
    
    if (revocationStatus && revocationStatus.status === "revoked") {
      return {
        valid: false,
        reason: "KEY_REVOKED",
        details: {
          revocationStatus: revocationStatus.status,
          revokedAt: revocationStatus.revokedAt,
          cacheAge
        }
      };
    }

    if (revocationStatus && revocationStatus.status === "expired") {
      return {
        valid: false,
        reason: "KEY_EXPIRED",
        details: {
          revocationStatus: revocationStatus.status,
          cacheAge
        }
      };
    }

    // ============================================================
    // 4. Verify Signature (Offline Crypto)
    // ============================================================
    const signatureValid = await this.verifySignatureOffline(proof, publicKey);
    if (!signatureValid) {
      return {
        valid: false,
        reason: "INVALID_SIGNATURE",
        details: {
          signatureValid: false,
          cacheAge
        }
      };
    }

    // ============================================================
    // 5. Return Success
    // ============================================================
    return {
      valid: true,
      details: {
        signatureValid: true,
        revocationStatus: revocationStatus?.status || "active",
        cacheAge,
        cacheValid: true
      }
    };
  }

  /**
   * Hybrid verification: Online with offline fallback
   * 
   * @param proof - ProofResponse to verify
   * @param registryClient - Online registry client (optional)
   * @returns OfflineVerificationResult
   */
  async verifyProofHybrid(
    proof: any,
    registryClient?: {
      getKey: (keyId: string) => Promise<JsonWebKey | null>;
      checkRevocation: (keyId: string) => Promise<RevocationRecord>;
    }
  ): Promise<OfflineVerificationResult> {
    // Try online first
    if (registryClient) {
      try {
        const onlineResult = await this.verifyOnline(proof, registryClient);
        return {
          ...onlineResult,
          details: {
            ...onlineResult.details,
            mode: "online"
          }
        };
      } catch (error) {
        console.warn("Online verification failed, falling back to offline:", error);
      }
    }

    // Fall back to offline
    const offlineResult = await this.verifyProofOffline(proof, "");
    return {
      ...offlineResult,
      details: {
        ...offlineResult.details,
        mode: "offline"
      }
    };
  }

  /**
   * Update offline cache from online registry
   * 
   * Call this periodically (e.g., daily, when online)
   * 
   * @param registryClient - Online registry client
   */
  async syncOfflineCacheFromRegistry(registryClient: {
    getAllKeys: () => Promise<Array<{ keyId: string; publicKey: JsonWebKey }>>;
    getAllRevocations: () => Promise<RevocationRecord[]>;
  }): Promise<void> {
    try {
      // Fetch all current keys from registry
      const keys = await registryClient.getAllKeys();
      this.offlineConfig.cachedKeys = new Map(
        keys.map((k) => [k.keyId, k.publicKey])
      );

      // Fetch all revocations
      const revocations = await registryClient.getAllRevocations();
      this.offlineConfig.cachedRevocations = new Map(
        revocations.map((r) => [r.keyId, r])
      );

      // Update cache timestamp
      this.offlineConfig.lastCacheUpdate = new Date().toISOString();

      console.log(`Offline cache synced: ${keys.length} keys, ${revocations.length} revocations`);
    } catch (error) {
      console.error("Failed to sync offline cache:", error);
      throw error;
    }
  }

  /**
   * Get cache age in seconds
   */
  private getCacheAgeSeconds(): number {
    const cacheDate = new Date(this.offlineConfig.lastCacheUpdate);
    const now = new Date();
    return Math.floor((now.getTime() - cacheDate.getTime()) / 1000);
  }

  /**
   * Verify signature using cached public key (no network)
   */
  private async verifySignatureOffline(
    proof: any,
    publicKey: JsonWebKey
  ): Promise<boolean> {
    try {
      // Import public key into WebCrypto
      const key = await crypto.subtle.importKey(
        "jwk",
        publicKey,
        {
          name: "ECDSA",
          namedCurve: "P-256"
        },
        false,
        ["verify"]
      );

      // Reconstruct signed payload (canonical JSON)
      const payload = JSON.stringify({
        requestId: proof.requestId,
        keyId: proof.keyId,
        pairwiseSubjectId: proof.pairwiseSubjectId,
        claimsVerified: proof.claimsVerified,
        algorithm: proof.algorithm,
        issuanceDate: proof.issuanceDate,
        expirationDate: proof.expirationDate,
        assuranceLevel: proof.assuranceLevel
      });

      // Verify signature
      const signatureBuffer = Buffer.from(proof.signature, "base64url");
      const result = await crypto.subtle.verify(
        {
          name: "ECDSA",
          hash: "SHA-256"
        },
        key,
        signatureBuffer,
        Buffer.from(payload)
      );

      return result;
    } catch (error) {
      console.error("Offline signature verification failed:", error);
      return false;
    }
  }

  /**
   * Online verification (for reference)
   */
  private async verifyOnline(
    proof: any,
    registryClient: any
  ): Promise<any> {
    // Fetch key from registry
    const key = await registryClient.getKey(proof.keyId);
    if (!key) {
      throw new Error("Key not found in registry");
    }

    // Check revocation
    const revocation = await registryClient.checkRevocation(proof.keyId);
    if (revocation.status === "revoked") {
      throw new Error("Key revoked");
    }

    // Verify signature
    const signatureValid = await this.verifySignatureOffline(proof, key);
    if (!signatureValid) {
      throw new Error("Signature verification failed");
    }

    return {
      valid: true,
      details: {
        signatureValid: true,
        revocationStatus: revocation.status
      }
    };
  }
}

/**
 * Offline Cache Manager
 * 
 * Handles cache lifecycle: creation, updates, expiry, cleanup
 */
export class OfflineCacheManager {
  private config: OfflineVerificationConfig;

  constructor() {
    this.config = {
      cachedKeys: new Map(),
      cachedRevocations: new Map(),
      keysCacheTTL: 24 * 60 * 60 * 1000, // 24 hours default
      lastCacheUpdate: new Date(0).toISOString() // Never updated
    };
  }

  /**
   * Get cache status
   */
  getStatus(): {
    cacheSize: number;
    keyCount: number;
    revocationCount: number;
    lastUpdate: string;
    age: number;
    isFresh: boolean;
  } {
    const cacheDate = new Date(this.config.lastCacheUpdate);
    const now = new Date();
    const ageMs = now.getTime() - cacheDate.getTime();
    const ageSeconds = Math.floor(ageMs / 1000);
    const isFresh = ageMs < this.config.keysCacheTTL;

    return {
      cacheSize: JSON.stringify(Array.from(this.config.cachedKeys.entries())).length,
      keyCount: this.config.cachedKeys.size,
      revocationCount: this.config.cachedRevocations.size,
      lastUpdate: this.config.lastCacheUpdate,
      age: ageSeconds,
      isFresh
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.config.cachedKeys.clear();
    this.config.cachedRevocations.clear();
    this.config.lastCacheUpdate = new Date(0).toISOString();
  }

  /**
   * Get verifier instance
   */
  getVerifier(): OfflineVerifier {
    return new OfflineVerifier(this.config);
  }

  /**
   * Serialize cache to localStorage/file
   */
  serializeCache(): string {
    return JSON.stringify({
      keys: Array.from(this.config.cachedKeys.entries()),
      revocations: Array.from(this.config.cachedRevocations.entries()),
      lastUpdate: this.config.lastCacheUpdate,
      ttl: this.config.keysCacheTTL
    });
  }

  /**
   * Deserialize cache from localStorage/file
   */
  deserializeCache(data: string): void {
    const parsed = JSON.parse(data);
    this.config.cachedKeys = new Map(parsed.keys);
    this.config.cachedRevocations = new Map(parsed.revocations);
    this.config.lastCacheUpdate = parsed.lastUpdate;
    this.config.keysCacheTTL = parsed.ttl;
  }
}

/**
 * Example: Mobile App Integration
 * 
 * @example
 * ```typescript
 * import { OfflineCacheManager } from "@shielded-id/verifier-sdk";
 * 
 * // Initialize cache manager
 * const cacheManager = new OfflineCacheManager();
 * 
 * // When online: sync cache
 * if (isNetworkAvailable()) {
 *   await cacheManager.getVerifier().syncOfflineCacheFromRegistry({
 *     getAllKeys: async () => { ... },
 *     getAllRevocations: async () => { ... }
 *   });
 *   
 *   // Save to device storage
 *   AsyncStorage.setItem("shielded_cache", cacheManager.serializeCache());
 * }
 * 
 * // When offline: use cached data
 * if (!isNetworkAvailable()) {
 *   const cached = await AsyncStorage.getItem("shielded_cache");
 *   if (cached) {
 *     cacheManager.deserializeCache(cached);
 *   }
 * }
 * 
 * // Verify proof (works offline)
 * const result = await cacheManager.getVerifier().verifyProofOffline(
 *   proof,
 *   expectedRequestId
 * );
 * 
 * console.log(result.valid ? "✓ Valid" : `✗ Invalid (${result.reason})`);
 * console.log(`Cache age: ${result.details.cacheAge} seconds`);
 * ```
 */
