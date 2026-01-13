# ShieldedID Changelog

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
