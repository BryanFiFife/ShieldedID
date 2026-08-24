# ShieldedID Security and Release Assurance Report

**Applies to:** ShieldedID v1.6.x hardened protocol  
**Report date:** 2026-08-24  
**Assessment type:** Internal repository and CI assurance  
**Certification status:** Not certified  

## Purpose

This report replaces the obsolete v1.5.0 document that described ShieldedID as "100% ISO 27001 compliant", counted 114 ISO 27001:2022 controls, and made absolute production-readiness and security claims.

Those claims are withdrawn. A source repository cannot certify an organisation against ISO/IEC 27001, GDPR, UK GDPR, OWASP, NIST, or another organisational or regulatory framework. Passing automated tests also cannot prove that software is free of vulnerabilities.

This report records what the current implementation and release gates actually verify, what they do not verify, and the residual risks that remain.

## Current implementation assurance

### Cryptographic proof construction

The supported privacy-preserving numeric predicates are:

- `AGE_OVER`, implemented as a less-than-or-equal bound proof over an issuer-attested date-of-birth numeric commitment.
- `KYC_LEVEL`, implemented as a greater-than-or-equal bound proof over an issuer-attested KYC-level numeric commitment.
- `CONTINUITY`, implemented as the verifier-bound continuity identifier path rather than a numeric Bulletproof predicate.

Unsupported historical predicates fail closed. The verifier does not accept plaintext public-input assertions as substitutes for cryptographic verification.

The numeric proof implementation uses Bulletproofs over Ristretto255/Pedersen commitments. Bound proofs are linked algebraically to the issuer-attested source commitment. Proving and blinding randomness is supplied from CSPRNG-backed entropy rather than deterministic witness-derived randomness.

### Issuer binding and trust chain

The hardened flow is designed to enforce:

1. issuer key registration in the central registry;
2. issuer signature over commitment attestation metadata;
3. wallet import and storage of the private witness and blinding;
4. generation of a bound proof against the issuer-attested commitment;
5. wallet signature using the registered dedicated P-256 signing key;
6. verifier validation of request identifiers, origin/context, nonce, expiry, issuer signature, wallet signature, proof relation, proof-to-commitment binding, and key status;
7. fail-closed rejection when required trust material cannot be resolved or validated.

### Minimal disclosure

The supported AGE_OVER and KYC_LEVEL proof paths are designed not to disclose the raw date of birth, exact age, private KYC level, or raw numeric witness to the verifier.

This does not mean that every transmitted value is anonymous. In particular, the current issuer-signed Pedersen commitment is persistent. If the same commitment is presented to colluding verifiers it can act as a correlation handle. ShieldedID v1.6.x therefore does **not** claim full unlinkability or anonymous-credential properties.

### Wallet key architecture

WebAuthn/passkeys are treated as authenticator mechanisms, not as generic direct ECDSA signing functions for arbitrary proof payloads. Proof responses use a dedicated registered P-256 signing key whose identifier is persisted with the wallet state.

### Registry and revocation

The registry provides issuer-key and wallet-key registration, lookup, status, expiry and revocation paths. The verifier's default trust path is fail closed when required registry state cannot be obtained or validated.

## CI release gates

A release candidate is accepted only when the exact candidate commit passes all configured CI jobs.

The CI pipeline includes:

- Rust/WASM build from source;
- adversarial Bulletproof checks for valid proofs, wrong bounds, wrong contexts, tampering and under-bound witnesses;
- comparison of generated WASM against the committed package to detect stale generated cryptographic artifacts;
- Linux unit, build and real issuer-registry-wallet-verifier end-to-end tests;
- Windows unit tests;
- verifier backend boot check;
- truth-gate scanning for placeholder or simulated cryptographic coverage;
- JavaScript dependency advisory review using `pnpm audit`, failing on high or critical advisories;
- Rust dependency advisory review using RustSec `cargo-audit` for Rust lockfiles;
- an aggregate release gate that succeeds only when all required jobs succeed.

A tag or release should point to the exact `master` commit that passed a fresh post-merge `push` CI run. A successful pull-request run alone is not treated as final release evidence.

## What CI does not prove

A green pipeline demonstrates that the checked behaviours passed for that commit in the configured CI environments. It does not establish:

- absence of undiscovered vulnerabilities;
- mathematical or cryptographic correctness beyond the tested construction and library assumptions;
- resistance to every side channel or compromised endpoint;
- security of a particular deployment, issuer onboarding process, registry host, operator account or secret-management system;
- legal or regulatory compliance;
- ISO/IEC 27001 certification;
- complete unlinkability across verifiers;
- independent penetration-test or cryptographic-audit approval.

## Compliance position

### ISO/IEC 27001

ShieldedID is **not ISO/IEC 27001 certified**. ISO/IEC 27001:2022 Annex A contains 93 controls. Certification concerns a scoped information security management system and organisational evidence, not a repository-level checklist.

Technical controls in ShieldedID may contribute evidence to an organisation's risk treatment and Statement of Applicability, but certification requires appropriately scoped governance, policies, risk assessment, operational evidence and an accredited certification process.

### GDPR and UK GDPR

ShieldedID is designed to minimise disclosure, but use of the software does not make a deployment GDPR or UK GDPR compliant automatically. The deployer remains responsible for matters such as lawful basis, controller/processor roles, transparency, rights handling, retention, DPIAs, international transfers, security measures and incident response.

### OWASP, NIST and other frameworks

The repository implements practices that overlap with guidance from OWASP, NIST and other security frameworks. No percentage compliance score or certification is claimed.

## External assurance recommended

Before high-risk or regulated production deployment, independent assurance should include:

- cryptographic review of the issuer-bound Bulletproof construction, commitment binding and transcript/context design;
- application security review and penetration testing of wallet, registry and verifier integrations;
- dependency and software-supply-chain review;
- privacy and legal assessment for the intended use and jurisdictions;
- operational review of issuer onboarding, key custody, registry availability, access control, logging and incident response.

## Release claim policy

Project documentation and marketing must distinguish between:

- **implemented and tested technical controls**, which may be stated with evidence;
- **internal CI assurance**, which may be stated only for commits that actually passed the relevant jobs;
- **independent security or cryptographic audit**, which may be claimed only after an identified external review;
- **formal certification or regulatory compliance**, which may be claimed only with the appropriate external evidence and deployment scope.

Absolute statements such as "100% compliant", "zero vulnerabilities", "military-grade", "perfect security", or "production secure" are not supported by this repository and must not be used as release evidence.