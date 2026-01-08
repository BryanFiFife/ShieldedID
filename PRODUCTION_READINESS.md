# Production Readiness

## 1. Scope & Definition

Production readiness for Shielded ID refers to the protocol's correctness, the reproducibility of builds, and the security posture of the reference implementation. It does not imply vendor-hosted availability, global scale deployment, or zero defects. Shielded ID is designed as a self-hosted, operator-run system where organizations deploy and maintain their own instances of the registry, wallet, and verifier components.

## 2. System Components & Readiness Status

### Registry Server
**Status**: Production-ready when deployed behind HTTPS with revocation persistence enabled.  
**Preconditions**: Database for user and credential storage (e.g., SQLite or cloud database).  
**Exclusions**: No built-in high-availability features; operators must configure redundancy.

### Wallet PWA
**Status**: Production-ready for user enrollment and proof generation.  
**Preconditions**: HTTPS deployment; camera access for document capture.  
**Exclusions**: No built-in backup or recovery mechanisms; wallet loss results in credential loss.

### Verifier SDK
**Status**: Production-ready for integrating proof verification into applications.  
**Preconditions**: HTTPS callback URLs; nonce validation and request storage.  
**Exclusions**: No automatic monitoring or alerting; operators must implement.

### Verifier Demo
**Status**: Demo-only.  
**Preconditions**: None for testing.  
**Exclusions**: Not intended for production use; lacks security hardening.

### ZK Agent
**Status**: Conditionally production-ready when installed and configured for ZK proofs.  
**Preconditions**: Native agent deployment; fallback to signed predicates if ZK unavailable.  
**Exclusions**: ZK proofs are optional; performance may vary by hardware.

## 3. Cryptographic Readiness

Shielded ID relies on established cryptographic primitives: ECDSA P-256 for signatures, Argon2id for key derivation, AES-GCM for encryption, and Bulletproofs for zero-knowledge proofs. ZK proofs are delivered via a local/native ZK Agent, not implemented in the browser. Browsers orchestrate proofs but do not perform heavy cryptographic computations. ZK verification is real but optional and gated; legacy signed predicates remain available as a fallback.

### Zero-Knowledge Maturity Level
Shielded ID operates at **ZK-2 (Agent-based Zero-Knowledge)**: proofs are computed by a dedicated agent using Bulletproofs, with verification handled by the SDK. This is not browser-native SNARKs or universal circuits; it provides efficient range proofs for claims like age thresholds.

## 4. Security Boundaries

Shielded ID is designed to protect against certain threats within defined boundaries but explicitly does not protect against others.

**Protects Against**:
- Identity disclosure to verifiers.
- Cross-service user correlation.
- Proof replay via nonce and timestamp binding.

**Does Not Protect Against**:
- Device compromise (e.g., malware stealing wallet keys).
- Malicious verifiers (e.g., logging proof requests).
- User coercion (e.g., forced proof generation).
- Operator misconfiguration (e.g., insecure key storage).
- Browser compromise (e.g., extension tampering).
- Supply-chain attacks on dependencies.

## 5. Operational Requirements

Operators must provide the following for production deployment:

- **HTTPS**: All services must use HTTPS with valid certificates.
- **Key Storage Durability**: Secure storage for registry keys with backup.
- **Revocation Persistence**: Database-backed revocation status.
- **Logging**: Non-PII audit logs (e.g., request IDs, timestamps).
- **Rate Limiting**: On verifier endpoints to prevent abuse.
- **Backup Strategy**: Regular backups of registry data.
- **Monitoring & Alerting**: For service availability and error rates.

No cloud-specific assumptions are made; these apply to self-hosted or cloud deployments.

## 6. Testing & Verification Status

- **Unit Tests**: Comprehensive for core functions (e.g., crypto, SDK).
- **Integration Tests**: Cover wallet-registry-verifier interactions.
- **End-to-End Golden Path Tests**: Validate enrollment and proof flows.
- **ZK E2E Tests**: Gated via `ZK_E2E=1` environment variable due to performance and determinism constraints.

Default CI runs unit, integration, and golden path tests. ZK tests are intentionally gated to avoid CI slowdowns; operators should run them separately for ZK-enabled deployments.

## 7. Deployment Checklist

[ ] All services deployed behind HTTPS with valid certificates  
[ ] Registry database configured and backed up  
[ ] Revocation persistence enabled and tested  
[ ] ZK agent installed and fallback path verified (if ZK enabled)  
[ ] Nonce validation and request storage implemented  
[ ] Audit logging enabled (no PII)  
[ ] Rate limiting configured on verifier endpoints  
[ ] Monitoring for latency, errors, and availability set up  
[ ] Backup strategy documented and tested  

## 8. Legal & Licensing Notes

Shielded ID is licensed under Apache-2.0. It provides no warranty of any kind. It makes no claims to be an identity authority or to guarantee compliance with laws or regulations. Operators are responsible for their deployments, including legal compliance and security.

## 9. Known Limitations

- Browser limitations: Relies on modern browser APIs (e.g., camera, crypto).
- ZK agent requirement: ZK proofs require native agent installation.
- No account recovery: Wallet loss results in permanent credential loss.
- No cross-service identity linking: Pairwise IDs prevent correlation by design.
- No document verification: Does not validate real-world documents or biometrics.

## 10. Conclusion

Shielded ID is production-ready when deployed according to this document, within its defined scope and trust boundaries. It provides cryptographic guarantees for privacy-preserving claim verification but requires careful operational setup and adherence to security boundaries.