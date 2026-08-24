# ShieldedID v1.6.1 Release Notes

**Release type:** Release-integrity and assurance patch  
**Date:** 2026-08-24

## Summary

ShieldedID v1.6.1 does not replace the cryptographic architecture introduced in v1.6.0. It tightens the release process and removes stale documentation that overstated compliance, audit status and production assurance.

The v1.6.x security model remains based on issuer-bound Bulletproof numeric predicates, CSPRNG-backed proving randomness, dedicated wallet proof-signing keys, central issuer/wallet key status checks, minimal disclosure for supported numeric claims, and fail-closed handling of unsupported predicates.

## Changes in v1.6.1

### Release-integrity hardening

- Added an explicit JavaScript dependency advisory gate using `pnpm audit`.
- Added a RustSec dependency advisory gate using `cargo-audit` for the Rust lockfiles.
- Added an aggregate CI release gate that depends on the WASM build/adversarial checks, Linux tests, Windows tests, cryptographic truth gate and dependency-audit job.
- Documented that a release tag must point to the exact `master` commit that passed a fresh post-merge `push` CI run. A successful pull-request run alone is not final release evidence.

### Documentation truth pass

- Replaced the obsolete v1.5 audit report that claimed "100% ISO 27001 compliance", "114 controls", "zero code quality issues", "enterprise-grade" security and absolute production readiness.
- Replaced obsolete v1.5 release notes with the current v1.6.1 release record.
- Retained the existing compliance position that ShieldedID is not ISO/IEC 27001 certified and that repository controls do not establish GDPR, UK GDPR, OWASP, NIST or other formal compliance.
- Explicitly records the residual correlation risk created by reuse of the persistent issuer-signed commitment. Full anonymous-credential unlinkability is not claimed.

### Version consistency

All JavaScript workspace package versions are updated from 1.6.0 to 1.6.1 for this release-integrity patch.

## Security functionality retained from v1.6.0

The following hardened behaviours remain part of the v1.6.x implementation:

- real Bulletproofs/Ristretto255 numeric bound proofs rather than simulated proof bytes;
- AGE_OVER and KYC_LEVEL proofs bound to issuer-authenticated Pedersen source commitments;
- no raw age, date of birth, private KYC level or numeric witness in supported proof public inputs;
- verifier checks for origin/context, nonce, expiry, request/claim consistency, issuer signature, wallet signature, proof relation and key status;
- issuer and wallet-key revocation paths exercised by the real integration test;
- CSPRNG-backed proving/blinding entropy;
- WebAuthn/passkeys kept separate from the dedicated proof-signing key path;
- unsupported historical predicates rejected rather than accepted through plaintext assertions;
- reproducible Rust/WASM generation checked by CI.

## Assurance boundary

A green ShieldedID CI run is evidence that the configured tests and security gates passed for that exact commit. It is not evidence that no vulnerability exists, and it is not an independent cryptographic audit, penetration test, legal opinion or certification.

Before high-risk or regulated production deployment, independent cryptographic review, application penetration testing, deployment-specific threat modelling, privacy/legal review and operational security review remain recommended.

## Release acceptance rule

A v1.6.1 release is considered internally verified only when:

1. the candidate changes pass the full pull-request CI suite;
2. the changes are merged to `master` without altering the tested content unexpectedly;
3. a fresh `push` CI run on the resulting `master` SHA succeeds;
4. the `v1.6.1` tag points to that exact green `master` SHA.

This rule is intentionally stricter than treating a pre-merge PR result as release evidence.