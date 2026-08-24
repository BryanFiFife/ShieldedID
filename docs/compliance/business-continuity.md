# Shielded ID Business Continuity and Recovery Guidance

**Applies to:** ShieldedID v1.6.x deployments  
**Status:** Operator guidance - not evidence of tested continuity capability

## Purpose

ShieldedID's repository does not define a deployer's business continuity plan, recovery objectives, hosting topology, staffing model or disaster-recovery capability. This document identifies continuity questions that operators should resolve when deploying the system.

The previous version asserted fixed RTO/RPO targets, multi-AZ architecture, database replication, cloud failover, backup schedules, 99.9/99.99% service levels and regular disaster-recovery exercises. Those are deployment-specific facts and were not established by this source repository. They have been withdrawn.

## Critical trust-path dependencies

A production deployment should identify dependencies for at least:

- registry availability for current issuer and wallet key status;
- registry database integrity and recoverability;
- issuer key custody and revocation authority;
- verifier availability and time synchronisation;
- wallet hosting/distribution where applicable;
- DNS, TLS termination and network connectivity;
- logging/monitoring systems used to detect failure or compromise;
- CI/CD and artifact/release recovery.

The default verifier trust path is fail closed when required registry trust state cannot be resolved. This is a security property, but it also means registry outages can prevent successful verification.

## Business impact analysis

Each operator should define its own:

- maximum tolerable verification outage;
- recovery time objective (RTO);
- recovery point objective (RPO) for registry/audit data;
- acceptable degraded modes, if any;
- required support/on-call coverage;
- contractual or regulatory notification obligations;
- dependencies whose failure can halt verification.

No RTO, RPO or uptime percentage is guaranteed by the ShieldedID repository.

## Backup and restoration

A deployment should decide what must be backed up and how restoration will be validated. Candidates include:

- registry database and schema state;
- configuration required to recreate the service;
- audit records subject to retention requirements;
- issuer trust metadata;
- deployment manifests and infrastructure configuration;
- private key material only where the operator's recovery design explicitly requires recoverable keys and provides appropriate protection.

Backups should be tested through restoration, not assumed valid because a backup job reports success.

## Recovery testing

Operators should design exercises appropriate to their threat model, such as:

- registry database loss or corruption;
- issuer key compromise and emergency revocation;
- wallet signing-key compromise;
- loss of a deployment region or host;
- dependency or DNS/TLS failure;
- expired or unavailable secrets;
- bad release rollback;
- time synchronisation failure affecting request validity;
- denial-of-service conditions against the registry or verifier.

Cadence and pass criteria are organisational decisions. This repository does not claim that any operator has performed these exercises.

## Recovery security requirements

Recovery procedures should preserve the security model. In particular:

- do not restore known-revoked keys as active;
- ensure restored registry state preserves issuer/wallet revocation history as required;
- verify integrity and provenance of restored binaries/WASM/build artifacts;
- rotate credentials suspected of compromise;
- validate system time before resuming verification;
- test the verifier's fail-closed behaviour after recovery;
- document exceptional/manual trust decisions, if an operator permits them at all.

## Monitoring signals

Useful signals can include:

- registry availability and latency;
- failed trust/status lookups;
- issuer/wallet key revocation events;
- repeated signature or proof-verification failures;
- database health and backup/restore results;
- certificate/DNS expiry risk;
- CI/release-gate failures.

Alert thresholds and incident ownership are deployment responsibilities.

## Evidence boundary

This file is a continuity planning checklist. It does not establish ISO/IEC 27001 conformity, tested disaster recovery, specific availability targets or an operational incident-response organisation. See `COMPLIANCE.md` and `docs/compliance/iso27001-mapping.md` for the wider assurance boundary.