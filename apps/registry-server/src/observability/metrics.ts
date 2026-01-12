import { Registry, Counter, Histogram, Gauge } from "prom-client";

/**
 * Shielded ID Observability Metrics (Prometheus)
 * File: apps/registry-server/src/observability/metrics.ts
 * 
 * Exposes production-grade metrics for monitoring and alerting
 */

export const metricsRegistry = new Registry();

// ============================================================
// Proof Verification Metrics
// ============================================================

export const proofVerificationDuration = new Histogram({
  name: "shielded_proof_verification_duration_ms",
  help: "Proof verification latency in milliseconds",
  labelNames: ["algorithm", "algorithm_success"],
  buckets: [10, 50, 100, 500, 1000, 2000, 5000],
  registers: [metricsRegistry]
});

export const proofVerificationTotal = new Counter({
  name: "shielded_proof_verification_total",
  help: "Total proof verification attempts",
  labelNames: ["algorithm", "result"], // result: success, failure, error
  registers: [metricsRegistry]
});

export const proofVerificationFailures = new Counter({
  name: "shielded_proof_verification_failures_total",
  help: "Total verification failures by reason",
  labelNames: ["reason"], // INVALID_SIGNATURE, KEY_REVOKED, EXPIRED, INVALID_NONCE, etc.
  registers: [metricsRegistry]
});

// ============================================================
// Revocation Check Metrics
// ============================================================

export const revocationCheckDuration = new Histogram({
  name: "shielded_revocation_check_duration_ms",
  help: "Revocation status check latency",
  labelNames: ["cache_hit"],
  buckets: [5, 20, 50, 200, 1000],
  registers: [metricsRegistry]
});

export const revocationCheckTotal = new Counter({
  name: "shielded_revocation_check_total",
  help: "Total revocation status checks",
  labelNames: ["result", "cache_hit"], // result: active, revoked, error
  registers: [metricsRegistry]
});

export const revokedKeysTotal = new Gauge({
  name: "shielded_revoked_keys_total",
  help: "Total number of revoked keys in registry",
  registers: [metricsRegistry]
});

// ============================================================
// Registry Availability & Health
// ============================================================

export const registryAvailability = new Gauge({
  name: "shielded_registry_available",
  help: "Registry availability status (1=healthy, 0=unhealthy)",
  registers: [metricsRegistry]
});

export const databaseConnectionPoolSize = new Gauge({
  name: "shielded_database_connections_active",
  help: "Active database connections in pool",
  registers: [metricsRegistry]
});

export const cacheHitRate = new Counter({
  name: "shielded_cache_hits_total",
  help: "Cache hit count by type",
  labelNames: ["cache_type"], // keys, revocations, proofs
  registers: [metricsRegistry]
});

// ============================================================
// API Endpoint Metrics
// ============================================================

export const httpRequestDuration = new Histogram({
  name: "shielded_http_request_duration_ms",
  help: "HTTP request latency by endpoint",
  labelNames: ["method", "endpoint", "status"],
  buckets: [10, 50, 100, 500, 1000, 5000],
  registers: [metricsRegistry]
});

export const httpRequestTotal = new Counter({
  name: "shielded_http_requests_total",
  help: "Total HTTP requests by endpoint",
  labelNames: ["method", "endpoint", "status"],
  registers: [metricsRegistry]
});

// ============================================================
// Key Management Metrics
// ============================================================

export const keysRegisteredTotal = new Counter({
  name: "shielded_keys_registered_total",
  help: "Total keys registered with registry",
  labelNames: ["algorithm"],
  registers: [metricsRegistry]
});

export const activeKeysGauge = new Gauge({
  name: "shielded_active_keys_total",
  help: "Total active keys in registry",
  registers: [metricsRegistry]
});

export const keyRotationCount = new Counter({
  name: "shielded_key_rotations_total",
  help: "Total key rotations performed",
  registers: [metricsRegistry]
});

// ============================================================
// Security Metrics
// ============================================================

export const replayAttackAttempts = new Counter({
  name: "shielded_replay_attack_attempts_total",
  help: "Attempts to replay proofs (blocked)",
  registers: [metricsRegistry]
});

export const forgedProofAttempts = new Counter({
  name: "shielded_forged_proof_attempts_total",
  help: "Attempts to forge proofs (blocked)",
  registers: [metricsRegistry]
});

export const csrfPrevention = new Counter({
  name: "shielded_csrf_prevention_triggers_total",
  help: "CSRF prevention triggers (request ID mismatches)",
  registers: [metricsRegistry]
});

// ============================================================
// User & Session Metrics
// ============================================================

export const uniqueWalletsTotal = new Gauge({
  name: "shielded_unique_wallets_total",
  help: "Total unique wallet instances registered",
  registers: [metricsRegistry]
});

export const activeSessions = new Gauge({
  name: "shielded_active_sessions_total",
  help: "Total active continuous authentication sessions",
  registers: [metricsRegistry]
});

// ============================================================
// Business Logic Metrics
// ============================================================

export const proofsByClaimType = new Counter({
  name: "shielded_proofs_by_claim_type_total",
  help: "Proofs generated by claim type",
  labelNames: ["claim_type"],
  registers: [metricsRegistry]
});

export const assuranceLevelDistribution = new Gauge({
  name: "shielded_assurance_level_distribution",
  help: "Distribution of proofs by assurance level",
  labelNames: ["level"],
  registers: [metricsRegistry]
});

// ============================================================
// Error Metrics
// ============================================================

export const errorCounter = new Counter({
  name: "shielded_errors_total",
  help: "Total errors by type",
  labelNames: ["error_code", "error_type"],
  registers: [metricsRegistry]
});

// ============================================================
// Utility Functions for Middleware
// ============================================================

/**
 * Record proof verification metric
 */
export function recordProofVerification(
  durationMs: number,
  algorithm: string,
  success: boolean,
  reason?: string
) {
  proofVerificationDuration.labels(algorithm, success ? "true" : "false").observe(durationMs);
  proofVerificationTotal.labels(algorithm, success ? "success" : "failure").inc();
  
  if (!success && reason) {
    proofVerificationFailures.labels(reason).inc();
  }
}

/**
 * Record revocation check metric
 */
export function recordRevocationCheck(
  durationMs: number,
  cacheHit: boolean,
  status: "active" | "revoked" | "error"
) {
  revocationCheckDuration.labels(cacheHit ? "true" : "false").observe(durationMs);
  revocationCheckTotal.labels(status, cacheHit ? "true" : "false").inc();
}

/**
 * Record HTTP request metric
 */
export function recordHttpRequest(
  method: string,
  endpoint: string,
  statusCode: number,
  durationMs: number
) {
  httpRequestDuration.labels(method, endpoint, statusCode.toString()).observe(durationMs);
  httpRequestTotal.labels(method, endpoint, statusCode.toString()).inc();
}

/**
 * Record security event
 */
export function recordSecurityEvent(
  eventType: "replay_attempt" | "forged_proof" | "csrf_prevention"
) {
  switch (eventType) {
    case "replay_attempt":
      replayAttackAttempts.inc();
      break;
    case "forged_proof":
      forgedProofAttempts.inc();
      break;
    case "csrf_prevention":
      csrfPrevention.inc();
      break;
  }
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetricsString(): Promise<string> {
  return metricsRegistry.metrics();
}
