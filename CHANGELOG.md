# ShieldedID Changelog

## [1.6.0] - 2026-08-24

### Security Improvements
- **Replaced simulated proofs with real issuer-bound Bulletproofs**: AGE_OVER and
  KYC_LEVEL predicates now prove the actual bound relation (`witness - threshold >= 0`)
  over an issuer-authenticated Pedersen commitment, not mere integer membership.
- **CSPRNG-backed proving randomness**: all proving/blinding randomness originates
  from WebCrypto-seeded RNG; proof material is not deterministically derived from
  witness, threshold, context or nonce.
- **Issuer trust chain enforced end-to-end**: issuer key registration → signed
  credential/commitment → wallet import → predicate proof → verifier checks issuer
  signature, requested predicate, context/origin/audience, nonce, expiry, issuer
  revocation and wallet signing-key revocation. Every stage fails closed.
- **Minimal disclosure enforced**: proofs no longer leak date of birth, exact age,
  private KYC level or raw witness values; a wallet cannot substitute a higher KYC
  level or a different age than its issuer-attested commitment.
- **Wallet signing-key architecture corrected**: WebAuthn/passkeys are no longer
  treated as generic ECDSA proof-signing functions; proofs are signed with the
  dedicated registered wallet signing key, with persist/restore/rotate/revoke.
- **Unsupported predicates fail closed**: historical predicates without real
  cryptography (STRING_EQUALS, MEMBERSHIP, NOT_IN_LIST, PREFIX, AGE_RANGE, COUNTRY,
  etc.) are rejected rather than accepted via publicInputs claims.
- **Dependency security**: axios bumped from ^1.7.4 to ^1.18.0 across the workspace,
  clearing all axios advisories (credential leak, proxy MITM, prototype pollution,
  DoS). No cryptographic dependency was altered.

### Features
- Real registry (Fastify + SQLite) with issuer/wallet key registration, lookup,
  status and revocation; expiry handling; malformed/unknown identifier rejection.
- Real end-to-end test booting the actual registry and exercising a genuine
  issuer → wallet → verifier round trip, including issuer revocation and wallet
  key revocation.
- CI gates for real cryptography and WASM reproducibility (no placeholder or
  simulated security coverage can merge).

### Bug Fixes
- Registry `/v1/status/:walletId` and `/v1/keys/:keyId/status` routes now declare
  404 response schemas, fixing the TypeScript production build.
- Aligned stale legacy test suites with the real hardened contract (removed mocked
  `verify_ge: () => true` and self-asserted claim fixtures).

### Operations
- All 8 workspace packages version-locked to 1.6.0.
- Documentation truth pass: replaced unsupported security/compliance claims with
  implementation-guidance wording; added concrete threat model and residual-risk
  notes (e.g. the persistent issuer-signed commitment is a cross-verifier
  correlation handle and full unlinkability is not claimed).

## [1.5.0] - 2026-01-13

### Security Improvements
- Enhanced service startup validation and health checks
- Improved build system reliability across all packages
- Strengthened end-to-end testing coverage

### Features
- Comprehensive monorepo testing with 358 passing tests
- Enhanced landing page validation for all services
- Improved version management and documentation consistency

### Bug Fixes
- Fixed wallet PWA build issues with missing ZK proof functions
- Resolved port conflicts in development environment
- Corrected documentation version inconsistencies

### Operations
- All packages successfully building and tested
- Registry server validated on port 3002
- Version numbers incremented across entire monorepo

## [1.4.0] - 2026-01-12

### Security Improvements
- Enhanced CONTINUITY claim validation with comprehensive type checking
- Strengthened error message handling for production environments
- Improved cryptographic validation coverage

### Features
- Extended CONTINUITY claim support for both string and boolean values
- Enhanced test coverage reaching near-100% across all components
- Improved client-safe error messaging system

### Bug Fixes
- Fixed CONTINUITY claim validation to accept boolean true values
- Corrected error message fallback for unmapped error codes
- Resolved test coverage gaps in claim validation edge cases

### Operations
- Comprehensive test suite with 186 passing tests
- Enhanced CI/CD pipeline with real ZK proof validation
- Improved documentation and release process automation

## [1.1.0] - 2026-01-12

### Security Improvements
- Implemented comprehensive security hardening across all components
- Added cryptographic integrity verification for agent binaries (SHA-256)
- Enhanced ZK proof validation with strict suite checking
- Implemented circuit breaker pattern for registry resilience
- Added WASM module integrity verification

### Features
- Real zero-knowledge proof generation using Bulletproofs Ristretto255
- Non-custodial wallet with continuous authentication
- Privacy-preserving identity verification with minimal PII disclosure
- Performance monitoring and metrics collection
- Async audit logging for compliance

### Bug Fixes
- Fixed type annotation consistency in database queries
- Resolved runtime errors in key status endpoints
- Implemented missing agent integrity verification method
- Fixed legacy API deprecation warnings
- Corrected database schema alignment

### Operations
- Added comprehensive health checks
- Enabled real ZK end-to-end tests in CI
- Implemented database indexing optimization
- Added async circuit breaker for external dependencies
- Enhanced error handling on all code paths

## [1.0.0] - Initial Release

### Core Features
- Zero-knowledge identity verification system
- Wallet PWA with ECDSA P-256 key management
- Registry server with key lifecycle management
- Verifier SDK for integration
- Age and KYC proof verification
- Bulletproofs ZK circuit implementation
