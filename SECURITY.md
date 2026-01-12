# Security Notes

## Zero-Knowledge Status
Shielded ID supports real zero-knowledge proofs via a native ZK agent using Bulletproofs. End-to-end ZK verification is exercised through gated tests (`ZK_E2E=1`) for performance reasons. The browser wallet acts as an orchestrator, not a prover. This design is intentional and aligns with production deployment constraints.

**Threat Model Boundaries**
- Registry is trusted for availability, not confidentiality
- Verifier is untrusted with respect to identity
- Wallet is user-controlled
- ZK agent is trusted for cryptographic soundness
- Network attackers are assumed (HTTPS required)

- Registry server is non-custodial: it stores only public keys, revocations, and audit metadata.
- No PII is accepted by default. Contact messages are the sole exception and are limited to name/email/subject/message.
- Wallet data is encrypted locally on-device using AES-GCM derived from the master secret.
- Admin sessions are cookie-based and scoped to minimal inbox/audit access.
- ZK end-to-end tests are gated (`ZK_E2E=1`) to avoid heavy WASM startup in routine CI; when enabled they execute the native. - - - Bulletproofs agent and verifier SDK without mocks.
