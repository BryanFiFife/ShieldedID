# Shielded ID OWASP Top 10 Risk Mapping

**Applies to:** ShieldedID v1.6.x  
**Status:** Security implementation notes - not certification or complete coverage

## Purpose

This document maps repository controls to OWASP Top 10:2021 risk areas. It is not an OWASP certification, ASVS assessment, penetration-test report or statement of 100% coverage.

The previous version claimed complete OWASP coverage, FIPS compliance, TLS 1.3 enforcement, signed releases, immutable cryptographic audit logs, automated patching, external penetration testing, ASVS Level 3 compliance, NIST implementation, fixed security response metrics and other facts that were not established by this repository. Those claims are withdrawn.

## Risk-oriented mapping

| OWASP Top 10:2021 area | Relevant ShieldedID controls | Remaining/deployment considerations |
| --- | --- | --- |
| A01 Broken Access Control | Registry/admin route controls, signature-based wallet/issuer trust, status/revocation checks, request binding | Operator account governance, infrastructure IAM, reverse proxy policy and administrative access require deployment review |
| A02 Cryptographic Failures | Bulletproofs/Ristretto255, Pedersen commitments, ECDSA P-256 signatures, AES-256-GCM vault encryption, Argon2id | Independent cryptographic review, endpoint compromise, key custody and platform implementation remain relevant |
| A03 Injection | Fastify request schemas/Zod validation and parameterised database access in security-sensitive paths | Review every newly added query/parser and deployment-specific integrations |
| A04 Insecure Design | Fail-closed verifier trust model, minimal-disclosure supported predicates, issuer-bound commitment proofs, explicit unsupported-predicate rejection | Threat model must be revisited as new claim types, offline modes or trust paths are introduced |
| A05 Security Misconfiguration | Security middleware, rate limiting, explicit environment secrets, CI builds | TLS, headers, secrets, CORS, reverse proxies, databases and hosting configuration are deployment responsibilities |
| A06 Vulnerable and Outdated Components | Frozen lockfile install, `pnpm audit` gate, RustSec `cargo-audit`, generated-WASM reproducibility check | Advisory feeds are not exhaustive; remediation and update policy remain operator responsibilities |
| A07 Identification and Authentication Failures | Wallet proof-of-possession registration, exact key-ID verification, issuer/wallet revocation, dedicated proof-signing key, WebAuthn kept in its correct authenticator role | Account recovery, admin authentication and deployment IAM require separate testing |
| A08 Software and Data Integrity Failures | Signed proof responses, issuer signatures, reproducible Rust/WASM build comparison, release CI gate | Git tag signing, branch protection, trusted build runners and artifact provenance are repository/operator governance choices |
| A09 Security Logging and Monitoring Failures | Registry audit events and application logging hooks | Log completeness, retention, alerting, SIEM integration, access control and incident response are deployment-specific |
| A10 Server-Side Request Forgery | Current core trust lookups target configured registry endpoints rather than arbitrary user-supplied destinations | Any future URL-fetching or webhook feature requires dedicated SSRF analysis and egress controls |

## Cryptographic scope

The production ZK surface is intentionally narrow:

- `AGE_OVER` uses an issuer-attested date-of-birth commitment and a bound proof;
- `KYC_LEVEL` uses an issuer-attested assurance-level commitment and a bound proof;
- `CONTINUITY` is protected by the signed wallet response and verifier-specific subject derivation.

Earlier prototype predicates that lack real cryptographic verification fail closed and are not part of the supported security surface.

## CI evidence

The blocking CI pipeline currently checks:

- real Rust/WASM proof generation and verification;
- wrong-bound, wrong-context, tampered-proof and under-threshold rejection;
- witness non-disclosure in supported proof public inputs;
- generated-WASM reproducibility;
- unit/build coverage on Linux and unit coverage on Windows;
- live issuer-registry-wallet-verifier integration, including revocation paths;
- known placeholder/simulated cryptographic coverage markers;
- high/critical JavaScript dependency advisories;
- RustSec advisories for committed Rust lockfiles.

Passing these checks is useful evidence for the exact commit. It does not prove that every OWASP weakness is absent.

## What is not claimed

ShieldedID does not claim, unless supported by separately identified external evidence:

- OWASP Top 10 "100% coverage";
- OWASP ASVS certification or any ASVS level;
- NIST Cybersecurity Framework certification or complete implementation;
- FIPS validation of the application or its cryptographic modules;
- external penetration testing;
- zero vulnerabilities;
- immutable or cryptographically complete audit logging;
- signed GitHub releases;
- 24/7 security operations or fixed MTTD/MTTR metrics.

## Recommended external assurance

Before high-risk production use, perform deployment-specific threat modelling, application penetration testing, dependency/supply-chain review, cryptographic review, secrets/IAM assessment, infrastructure hardening review and incident-response testing.

See `SECURITY.md`, `audit.md` and `COMPLIANCE.md` for the current assurance boundary.