# Shielded ID Implementation Roadmap

**Last updated:** 2026-08-24  
**Current stable protocol line:** v1.6.x hardened implementation  
**Status:** Supported proof surface implemented and CI-gated; external cryptographic/security review still recommended before high-risk deployment

## Current supported surface

ShieldedID v1.6.x intentionally supports only the claim types for which the current implementation has a real verification path:

- `AGE_OVER`: issuer-attested date-of-birth threshold proof;
- `KYC_LEVEL`: issuer-attested numeric assurance-level threshold proof;
- `CONTINUITY`: verifier-specific subject identifier protected by the signed wallet response.

Unsupported historical/prototype predicates fail closed. They are not counted as implemented merely because they can be represented as request metadata.

## Current architecture

### Wallet PWA

- encrypted local vault using AES-256-GCM;
- Argon2id passphrase derivation;
- private numeric witness/blinding storage;
- issuer-bound Bulletproof generation through the Rust/WASM package;
- dedicated registered P-256 proof-signing key;
- WebAuthn retained as an authentication mechanism rather than misused as generic signing.

### Registry server

- Fastify/SQLite reference implementation;
- wallet signing-key registration, lookup, expiry/status and revocation;
- issuer-key registration, lookup, status and revocation;
- audit events for defined trust/key lifecycle operations;
- fail-closed trust dependency for the default verifier path.

### Cryptography

- Bulletproofs over Ristretto255;
- Pedersen commitments;
- issuer-authenticated source commitments;
- algebraically linked bound proofs for supported numeric predicates;
- CSPRNG-backed proving/blinding entropy;
- transcript/request context binding;
- generated WASM rebuilt and compared in CI.

### Verifier SDK

- exact request/nonce/origin/expiry validation;
- exact wallet signing-key lookup;
- wallet P-256 signature verification;
- issuer key/status lookup and issuer attestation signature verification;
- source-commitment equality check;
- real Bulletproof verification for the requested bound/context;
- unsupported predicates rejected rather than plaintext-asserted.

## Release assurance

The release pipeline is expected to include:

- reproducible Rust/WASM build;
- adversarial proof checks;
- Linux unit/build/live E2E tests;
- Windows unit tests;
- issuer and wallet-key revocation rejection;
- placeholder/simulated cryptographic coverage rejection;
- frozen dependency installation;
- JavaScript high/critical advisory gate;
- RustSec advisory gate;
- fresh post-merge `master` CI before tagging.

Passing CI is internal release evidence for the exact commit. It is not an external cryptographic audit, penetration test or compliance certification.

## Known privacy limitation

Pairwise subject IDs reduce direct subject-ID reuse across verifier origins. They do **not** make the current credential presentation fully unlinkable.

The issuer currently signs a persistent Pedersen source commitment. Reuse of that same commitment can provide a correlation handle to colluding verifiers. ShieldedID v1.6.x therefore does not claim anonymous-credential unlinkability.

## Near-term roadmap

### 1. Independent assurance

Priority work before positioning the protocol for high-risk identity/KYC deployments:

- independent review of the issuer-bound Bulletproof construction;
- review of transcript/context binding and commitment relations;
- application penetration testing of wallet, registry and verifier integrations;
- dependency/supply-chain assessment;
- deployment threat model and secrets/IAM review.

### 2. Stronger unlinkable credential layer

Research target: replace or wrap the persistent issuer commitment with an independently reviewed rerandomizable credential/signature construction so a holder can prove predicates without presenting a stable cross-verifier commitment handle.

Any candidate must preserve:

- issuer binding;
- selective disclosure/minimal disclosure;
- predicate proof support;
- revocation strategy;
- browser/PWA feasibility;
- verifier interoperability;
- clear security assumptions and external reviewability.

This is research/roadmap work, not an implemented v1.6.x guarantee.

### 3. Additional predicates

Potential future predicates may include equality, set-membership, composite and expiry/location-style claims. None should be promoted to the production surface until it has:

1. an explicit credential representation and issuer binding;
2. a real cryptographic construction appropriate to that predicate;
3. adversarial tests showing invalid witnesses cannot be accepted;
4. privacy analysis for disclosed proof material;
5. verifier fail-closed behaviour;
6. protocol/versioning documentation;
7. CI coverage and preferably external cryptographic review for novel constructions.

A generic Bulletproof range proof is not automatically suitable for string equality, arbitrary set membership or every future predicate family.

### 4. Operational hardening

Potential implementation work includes:

- deployment templates and secret-management guidance;
- stronger branch/release provenance controls;
- observability and incident-response integration examples;
- backup/restoration test harnesses for the registry;
- scalable registry persistence options where required by deployment load;
- reproducible/signed release artifact provenance where appropriate.

## Design principles

- **Truthful capability surface:** advertise only predicates that have a real enforced verification path.
- **Fail closed:** missing trust state, unsupported predicates and invalid cryptographic material reject.
- **Issuer binding:** holder-generated proofs must remain bound to issuer-authenticated credential material.
- **Minimal disclosure:** do not expose the private witness merely to simplify verification.
- **Request binding:** proof use must be constrained to the intended verifier/request context.
- **Evidence before claims:** CI evidence, independent audits and formal certifications must not be conflated.
- **Protocol evolution by version:** security-significant format/construction changes require explicit versioning and migration rules.

## Out-of-scope claims

The roadmap does not assert:

- complete unlinkability;
- ISO/IEC 27001 certification;
- GDPR/UK GDPR compliance by default;
- OWASP/NIST percentage compliance;
- zero vulnerabilities;
- a completed external penetration test;
- complete production readiness for every deployment;
- support for historical prototype predicate families.

See `README.md`, `SECURITY.md`, `COMPLIANCE.md`, `audit.md` and `docs/PRODUCTION_READINESS.md` for the current supported security and assurance boundary.
