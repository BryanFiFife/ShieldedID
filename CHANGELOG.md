# ShieldedID Changelog

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
