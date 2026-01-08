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
}

export class RegistryClient {
  private cache = new Map<string, CachedEntry<unknown>>();
  private readonly registryUrl: string;
  private readonly cacheTtlMs: number;

  constructor(options: RegistryClientOptions) {
    this.registryUrl = options.registryUrl.replace(/\/$/, "");
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
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

    const url = `${this.registryUrl}/v1/status/${walletId}`;
    const response = await ensureFetch()(url);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error("REGISTRY_ERROR");
    }
    const data = (await response.json()) as WalletStatusResponse;
    this.setCache(cacheKey, data);
    return data;
  }

  async getKeyStatus(keyId: string): Promise<RevocationStatus> {
    const cacheKey = `key:${keyId}`;
    const cached = this.getFromCache<RevocationStatus>(cacheKey);
    if (cached) return cached;

    const url = `${this.registryUrl}/v1/status/${keyId}`;
    const response = await ensureFetch()(url);
    if (response.status === 404) {
      return { revoked: false };
    }
    if (!response.ok) {
      throw new Error("REGISTRY_ERROR");
    }
    const data = (await response.json()) as { revokedAt?: string | null; reason?: string };
    const status = { revoked: Boolean(data.revokedAt), revokedAt: data.revokedAt ?? undefined, reason: data.reason };
    this.setCache(cacheKey, status);
    return status;
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
}
