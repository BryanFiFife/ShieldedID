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
  expiresAt?: string;
  expired?: boolean;
}

export interface IssuerKeyResponse {
  issuerDid: string;
  keyId: string;
  status: "ACTIVE" | "REVOKED" | "SUSPENDED";
  publicKey: JsonWebKey;
  createdAt: string;
  revokedAt?: string | null;
}

export class RegistryClient {
  private cache = new Map<string, CachedEntry<unknown>>();
  private readonly registryUrl: string;
  private readonly cacheTtlMs: number;
  private circuitBreaker = {
    failures: 0,
    threshold: 5,
    resetTime: 60_000,
    lastFailureTime: 0
  };

  constructor(options: RegistryClientOptions) {
    this.registryUrl = options.registryUrl.replace(/\/$/, "");
    // Revocation and trust metadata should not remain stale for minutes.
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
  }

  private checkCircuitBreaker(): void {
    if (
      this.circuitBreaker.failures > 0 &&
      Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.resetTime
    ) {
      this.circuitBreaker.failures = 0;
    }
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      // Identity verification is fail-closed: never serve stale trust data while
      // the registry is unreachable.
      throw new Error("REGISTRY_CIRCUIT_OPEN");
    }
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

  private async getJson<T>(url: string, notFoundCode: string): Promise<T> {
    this.checkCircuitBreaker();
    try {
      const response = await ensureFetch()(url);
      if (response.status === 404) {
        this.recordSuccess();
        throw new Error(notFoundCode);
      }
      if (!response.ok) {
        this.recordFailure();
        throw new Error(`REGISTRY_ERROR:${response.status}`);
      }
      const value = await response.json() as T;
      this.recordSuccess();
      return value;
    } catch (err) {
      if (err instanceof Error && err.message === notFoundCode) throw err;
      this.recordFailure();
      throw err;
    }
  }

  async getWalletStatus(walletId: string): Promise<WalletStatusResponse | null> {
    const cacheKey = `wallet:${walletId}`;
    const cached = this.getFromCache<WalletStatusResponse>(cacheKey);
    if (cached) return cached;
    try {
      const data = await this.getJson<WalletStatusResponse>(
        `${this.registryUrl}/v1/status/${encodeURIComponent(walletId)}`,
        "WALLET_NOT_FOUND"
      );
      this.setCache(cacheKey, data);
      return data;
    } catch (err) {
      if (err instanceof Error && err.message === "WALLET_NOT_FOUND") return null;
      throw err;
    }
  }

  async getKeyStatusViaNewEndpoint(keyId: string): Promise<RevocationStatus> {
    const cacheKey = `key:${keyId}`;
    const cached = this.getFromCache<RevocationStatus>(cacheKey);
    if (cached) return cached;

    const data = await this.getJson<{
      status: string;
      revokedAt?: string | null;
      expiresAt?: string;
      createdAt?: string;
    }>(`${this.registryUrl}/v1/keys/${encodeURIComponent(keyId)}/status`, "KEY_NOT_FOUND");

    const expiryMs = data.expiresAt ? Date.parse(data.expiresAt) : Number.NaN;
    const status: RevocationStatus = {
      revoked: data.status === "REVOKED",
      revokedAt: data.revokedAt ?? undefined,
      expiresAt: data.expiresAt,
      expired: Number.isFinite(expiryMs) ? Date.now() > expiryMs : false
    };
    this.setCache(cacheKey, status);
    return status;
  }

  async getIssuerKey(issuerDid: string, keyId: string): Promise<IssuerKeyResponse> {
    const cacheKey = `issuer:${issuerDid}:${keyId}`;
    const cached = this.getFromCache<IssuerKeyResponse>(cacheKey);
    if (cached) return cached;
    const data = await this.getJson<IssuerKeyResponse>(
      `${this.registryUrl}/v1/issuers/${encodeURIComponent(issuerDid)}/keys/${encodeURIComponent(keyId)}`,
      "ISSUER_KEY_NOT_FOUND"
    );
    if (data.issuerDid !== issuerDid || data.keyId !== keyId) {
      throw new Error("ISSUER_KEY_IDENTITY_MISMATCH");
    }
    this.setCache(cacheKey, data);
    return data;
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = 0;
    this.cache.clear();
  }
}
