import type { Knex } from "knex";

/**
 * Shielded ID Registry Database Schema v1.0
 * Migration: 001_initial_schema.ts
 * Date: January 11, 2026
 * 
 * Replaces SQLite with PostgreSQL for production deployment
 */

export async function up(knex: Knex): Promise<void> {
  /**
   * TABLE: wallets
   * Stores user public keys and metadata
   * Does NOT store PII (privacy-by-design)
   */
  await knex.schema.createTable("wallets", (table) => {
    table.uuid("wallet_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    
    // Hash of pairwise ID for lookups without storing plaintext
    table.string("pairwise_id_hash", 64).notNullable().unique();
    
    // JSON array of active public keys
    table.jsonb("public_keys").notNullable().defaultTo("[]");
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("deleted_at").nullable(); // Soft delete for audit trail
    
    // Indexes
    table.index(["created_at"]);
    table.index(["pairwise_id_hash"]);
  });

  /**
   * TABLE: keys
   * Individual credential keys and their metadata
   */
  await knex.schema.createTable("keys", (table) => {
    table.uuid("key_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("wallet_id").notNullable().references("wallets.wallet_id").onDelete("CASCADE");
    
    // Public key (JWK format)
    table.jsonb("public_key").notNullable();
    
    // Signature algorithm
    table.string("algorithm", 50).notNullable(); // ECDSA_P256_SHA256_1.0.0, etc.
    
    // Key lifecycle
    table.string("status", 20).notNullable().defaultTo("ACTIVE"); // ACTIVE, REVOKED, EXPIRED, SUSPENDED
    table.timestamp("issued_at").notNullable();
    table.timestamp("expires_at").notNullable();
    table.timestamp("revoked_at").nullable();
    
    // Revocation metadata
    table.string("revocation_reason", 50).nullable(); // COMPROMISED, USER_INITIATED, etc.
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    
    // Indexes for fast lookups and filtering
    table.index(["wallet_id"]);
    table.index(["key_id", "status"]);
    table.index(["expires_at"]);
    table.index(["revoked_at"]);
  });

  /**
   * TABLE: revocations
   * Audit trail of all key revocations
   * Immutable for compliance
   */
  await knex.schema.createTable("revocations", (table) => {
    table.uuid("revocation_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("key_id").notNullable().references("keys.key_id").onDelete("RESTRICT");
    
    // Revocation details
    table.timestamp("revoked_at").notNullable();
    table.string("reason", 50).notNullable();
    table.string("revocation_signature", 256).notNullable(); // Proof of authorization
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index(["key_id"]);
    table.index(["revoked_at"]);
    table.unique(["key_id"]);
  });

  /**
   * TABLE: audit_logs
   * Immutable audit trail of all operations
   * No PII stored (privacy-by-design)
   */
  await knex.schema.createTable("audit_logs", (table) => {
    table.uuid("log_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    
    // Event classification
    table.string("event_type", 50).notNullable(); // PROOF_VERIFIED, KEY_REVOKED, etc.
    table.string("result", 20).notNullable(); // SUCCESS, FAILURE, ERROR
    table.string("error_reason", 100).nullable(); // INVALID_SIGNATURE, KEY_REVOKED, etc.
    
    // Request context (NO PII)
    table.string("request_id", 100).notNullable();
    table.string("key_id", 36).notNullable();
    table.string("origin_domain", 255).nullable(); // From request context
    
    // Metrics
    table.integer("duration_ms").notNullable(); // How long operation took
    table.string("ip_address_hash", 64).nullable(); // Hashed IP (GDPR safe)
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    
    // Indexes for querying
    table.index(["event_type", "created_at"]);
    table.index(["result", "created_at"]);
    table.index(["key_id"]);
    table.index(["request_id"]);
  });

  /**
   * TABLE: proof_cache
   * Replay attack prevention cache
   * Stores hashes of seen nonces
   */
  await knex.schema.createTable("proof_cache", (table) => {
    table.string("nonce_hash", 64).primary();
    table.string("request_id", 100).notNullable();
    table.string("key_id", 36).notNullable();
    
    // Cache expiration (24 hours TTL)
    table.timestamp("expires_at").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index(["expires_at"]);
  });

  /**
   * TABLE: metrics_hourly
   * Pre-aggregated metrics for dashboarding
   */
  await knex.schema.createTable("metrics_hourly", (table) => {
    table.uuid("metric_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    
    // Time bucket
    table.timestamp("hour").notNullable(); // ISO 8601 hour boundary
    
    // Counters
    table.integer("proofs_verified").notNullable().defaultTo(0);
    table.integer("proofs_failed").notNullable().defaultTo(0);
    table.integer("revocations_processed").notNullable().defaultTo(0);
    table.integer("keys_registered").notNullable().defaultTo(0);
    
    // Latency percentiles (milliseconds)
    table.integer("latency_p50").notNullable().defaultTo(0);
    table.integer("latency_p95").notNullable().defaultTo(0);
    table.integer("latency_p99").notNullable().defaultTo(0);
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    
    // Indexes
    table.index(["hour"]);
    table.unique(["hour"]);
  });

  /**
   * TABLE: issuer_registry
   * Tracks known credential issuers (for federation)
   */
  await knex.schema.createTable("issuer_registry", (table) => {
    table.uuid("issuer_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    
    // Issuer metadata
    table.string("issuer_name", 255).notNullable();
    table.string("issuer_url", 255).notNullable().unique();
    table.string("issuer_did", 255).notNullable().unique(); // Decentralized identifier
    
    // Trust metadata
    table.string("status", 20).notNullable().defaultTo("ACTIVE"); // ACTIVE, SUSPENDED, REVOKED
    table.text("verification_notes").nullable();
    
    // Public key for verifying issuer credentials
    table.jsonb("public_key").nullable();
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("verified_at").nullable();
    
    // Indexes
    table.index(["status"]);
  });

  /**
   * TABLE: continuous_sessions
   * For continuous authentication (session binding)
   */
  await knex.schema.createTable("continuous_sessions", (table) => {
    table.uuid("session_id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    
    // Session identifiers
    table.string("pairwise_subject_id", 255).notNullable();
    table.string("verifier_origin", 255).notNullable();
    
    // Session state
    table.string("status", 20).notNullable().defaultTo("ACTIVE"); // ACTIVE, EXPIRED, INVALIDATED
    
    // Device binding
    table.jsonb("device_fingerprint").notNullable(); // { userAgent, timezone, etc }
    
    // Metadata
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("last_activity_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    
    // Indexes
    table.index(["pairwise_subject_id", "verifier_origin"]);
    table.index(["status", "expires_at"]);
  });

  /**
   * MATERIALIZED VIEW: active_keys_summary
   * Fast access to currently active keys
   */
  await knex.schema.raw(`
    CREATE MATERIALIZED VIEW active_keys_summary AS
    SELECT
      k.key_id,
      k.wallet_id,
      k.algorithm,
      k.issued_at,
      k.expires_at,
      COUNT(*) FILTER (WHERE l.event_type = 'PROOF_VERIFIED') as proof_count,
      MAX(l.created_at) as last_used_at
    FROM keys k
    LEFT JOIN audit_logs l ON k.key_id = l.key_id
    WHERE k.status = 'ACTIVE'
    GROUP BY k.key_id, k.wallet_id, k.algorithm, k.issued_at, k.expires_at
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order of dependencies
  await knex.schema.raw("DROP MATERIALIZED VIEW IF EXISTS active_keys_summary");
  await knex.schema.dropTableIfExists("continuous_sessions");
  await knex.schema.dropTableIfExists("issuer_registry");
  await knex.schema.dropTableIfExists("metrics_hourly");
  await knex.schema.dropTableIfExists("proof_cache");
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("revocations");
  await knex.schema.dropTableIfExists("keys");
  await knex.schema.dropTableIfExists("wallets");
}
