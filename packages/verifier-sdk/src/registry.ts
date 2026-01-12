import { ensureFetch } from "./utils.js";

export interface CachedEntry<T> {
  value: T;
  expiresAt: number;
}

export interface RegistryClientOptions {
  registryUrl: string;
  cacheTtlMs?: number;
}

export interface WalletStatusResponse {
  walletId: string;
  status?: string;
  keys?: Array<{
    keyId?: string;
    status?: string;
    revokedAt?: string | null;
    publicKey?: JsonWebKey;
    keyMaterial?: JsonWebKey;
  }>;
}

export interface RevocationStatus {
  revoked: boolean;
  revokedAt?: string;
  reason?: string;
  // SECURITY FIX #2: Add expiration tracking
  expiresAt?: string;
  expired?: boolean;
}

export class RegistryClient {
  private cache = new Map<string, CachedEntry<unknown>>();
  private readonly registryUrl: string;
  private readonly cacheTtlMs: number;
  // SECURITY FIX #3: Circuit breaker for registry resilience
  private circuitBreaker = {
    failures: 0,
    threshold: 5, // Open circuit after 5 failures
    resetTime: 60000, // 60 seconds
    lastFailureTime: 0
  };

  constructor(options: RegistryClientOptions) {
    this.registryUrl = options.registryUrl.replace(/\/$/, "");
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  }

  private checkCircuitBreaker(): boolean {
    // Reset circuit breaker if enough time has passed
    if (this.circuitBreaker.failures > 0 && Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTime) {
      this.circuitBreaker.failures = 0;
    }
    // Circuit is open if failures exceed threshold
    return this.circuitBreaker.failures < this.circuitBreaker.threshold;
  }

  private recordFailure() {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTime = Date.now();
  }

  private recordSuccess() {
    this.circuitBreaker.failures = 0;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CachedEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCache<T>(key: string, value: T) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  async getWalletStatus(walletId: string): Promise<WalletStatusResponse | null> {
    const cacheKey = `wallet:${walletId}`;
    const cached = this.getFromCache<WalletStatusResponse>(cacheKey);
    if (cached) return cached;

    // SECURITY FIX #3: Check circuit breaker and use stale cache if circuit open
    if (!this.checkCircuitBreaker()) {
      // Circuit breaker open - use stale cache if available
      const staleEntry = this.cache.get(cacheKey) as CachedEntry<WalletStatusResponse> | undefined;
      if (staleEntry) {
        return staleEntry.value;
      }
      throw new Error("REGISTRY_CIRCUIT_OPEN");
    }

    try {
      const url = `${this.registryUrl}/v1/status/${walletId}`;
      const response = await ensureFetch()(url);
      if (response.status === 404) {
        this.recordSuccess();
        return null;
      }
      if (!response.ok) {
        this.recordFailure();
        throw new Error("REGISTRY_ERROR");
      }
      const data = (await response.json()) as WalletStatusResponse;
      this.recordSuccess();
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  // DEPRECATED: Use getKeyStatusViaNewEndpoint instead
  // Left as no-op for backward compatibility, will be removed in future version

  // SECURITY FIX #2B: Use dedicated key-specific status endpoint
  async getKeyStatusViaNewEndpoint(keyId: string): Promise<RevocationStatus> {
    const cacheKey = `key-new:${keyId}`;
    const cached = this.getFromCache<RevocationStatus>(cacheKey);
    if (cached) return cached;

    if (!this.checkCircuitBreaker()) {
      throw new Error("REGISTRY_CIRCUIT_OPEN");
    }

    try {
      const url = `${this.registryUrl}/v1/keys/${keyId}/status`;
      const response = await ensureFetch()(url);
      if (response.status === 404) {
        this.recordSuccess();
        return { revoked: false };
      }
      if (!response.ok) {
        this.recordFailure();
        throw new Error("REGISTRY_ERROR");
      }
      const data = (await response.json()) as { 
        status: string; 
        revokedAt?: string | null; 
        expiresAt: string;
        createdAt: string;
      };
      
      // Check if key is expired
      const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
      const isExpired = expiresAt ? Date.now() > expiresAt : false;
      
      const status: RevocationStatus = { 
        revoked: data.status === "REVOKED",
        revokedAt: data.revokedAt ?? undefined,
        expiresAt: data.expiresAt,
        expired: isExpired
      };
      
      this.recordSuccess();
      this.setCache(cacheKey, status);
      return status;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  async fetchIssuerKeys(issuerBaseUrl: string): Promise<{ keys: Array<JsonWebKey & { kid?: string }> }> {
    const cacheKey = `issuer:${issuerBaseUrl}`;
    const cached = this.getFromCache<{ keys: Array<JsonWebKey & { kid?: string }> }>(cacheKey);
    if (cached) return cached;

    const base = issuerBaseUrl.replace(/\/$/, "");
    const url = `${base}/.well-known/shielded-id-keys.json`;
    const response = await ensureFetch()(url);
    if (!response.ok) {
      throw new Error("ISSUER_KEYS_NOT_FOUND");
    }
    const data = (await response.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
    this.setCache(cacheKey, data);
    return data;
  }

  // Test-only method to reset circuit breaker state
  resetCircuitBreaker(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = 0;
    this.cache.clear();
  }
}
