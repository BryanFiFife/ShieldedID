# Production Readiness Checklist (Shielded ID)

Status: ZK-2 (native Bulletproofs agent with gated E2E coverage)  
Last Updated: 2026-01

## Cryptographic Foundations
- Proof system: Bulletproofs over Ristretto255 with Merlin transcripts (range proof for `value >= threshold`).
- Context binding: verifier origin + nonce + expiresAt embedded in transcript; replay requires re-proving.
- Signing: Wallet/issuer signatures use ECDSA P-256 via WebCrypto; verifier checks registry revocation before acceptance.
- No alternate curves or legacy fallbacks; disabling/altering suites is unsupported.

## ZK Agent Requirements
- Required runtime: WASM produced by the Rust agent (`packages/age-zk`); loaded via wasm-bindgen glue.
- Browser prerequisites: WebCrypto + WASM enabled; failures in restricted environments must fail closed.
- Server-side verification: `@shielded-id/age-zk` bindings are used directly; no mocks permitted outside test doubles for the registry.

## Transport & Deployment
- HTTPS is mandatory in production (localhost-only exemption for dev). Set HSTS at the edge if possible.
- Registry must be reachable over TLS for key status/revocation checks; cache timeouts should honor real status.
- Service isolation: run registry, verifier, and wallet hosting behind a reverse proxy/WAF with rate limiting.

## Replay & Freshness Controls
- Proof requests must include nonce, issuedAt, expiresAt, and claim policy; verifier rejects on any mismatch.
- ZK proofs bind the same context (origin + nonce + expiry) to prevent reuse across verifiers or time windows.
- Clock synchronization: production verifiers should run NTP and log clock skew events.

## Monitoring & Logging
- Minimum signals: registry revocation lookups (success/fail), verifier proof outcomes (valid/invalid + reason), WASM load failures.
- Alerting: sustained ZK_PROOF_INVALID spikes, registry 5xx/timeout, and signature verification failures.
- Preserve logs without PII; pairwiseSubjectId is acceptable for correlation.

## Upgrade & Migration Notes
- WASM regeneration: rebuild `@shielded-id/age-zk` after Rust/Cargo updates; re-pin hashes if using SRI at the edge.
- Rolling upgrades: ensure verifiers and registry share compatible request/response schemas (see `docs/ROUTES_AND_GUARANTEES.md`).
- Key rotation: rotate wallet/issuer keys via registry; verifier SDK already selects active keys.

## Threat Model Boundaries
- In scope: proof forgery, replay across verifiers/time, registry key revocation, minimal disclosure enforcement.
- Out of scope: device compromise, side-channel leakage inside browser/OS, availability during DoS, nation-state traffic tampering without TLS.

## Readiness Checklist (must be true for production)
- [ ] HTTPS termination in place for verifier + registry.
- [ ] Registry availability and revocation data monitored.
- [ ] Verifier clock synchronized (NTP) and skew alerts configured.
- [ ] ZK agent WASM served with correct MIME type and integrity checks (if using SRI).
- [ ] ZK E2E test suite (`ZK_E2E=1 pnpm -F verifier-sdk test`) passes in staging with production-like configs.
- [ ] Rate limits and WAF rules deployed for verifier and registry.
- [ ] Secrets (.env) populated with strong values; no defaults in production.
- [ ] Backup/restore tested for registry database.
- [ ] Incident runbook includes steps for revocation, key rollover, and WASM redeploy.
