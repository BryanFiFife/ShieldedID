# Shielded ID

Shielded ID is a minimal-disclosure identity verification implementation built around issuer-attested Pedersen commitments, Bulletproofs over Ristretto255, signed wallet responses, and registry-backed key status.

The hardened v1.6 protocol surface supports three production claim types:

- `AGE_OVER`: proves an issuer-attested date of birth satisfies an age threshold without sending the date of birth.
- `KYC_LEVEL`: proves an issuer-attested numeric assurance level meets a requested minimum without sending the level.
- `CONTINUITY`: returns a verifier-specific pairwise subject identifier under the signed wallet response.

Other predicate families that appeared in earlier prototypes are intentionally **not** advertised as implemented. Unsupported predicates fail closed.

## Security model

A successful age/KYC verification requires all of the following:

1. an issuer-generated Pedersen commitment and private witness held by the wallet;
2. an issuer ECDSA P-256 signature over the commitment attestation;
3. an active matching issuer key in the registry;
4. a Bulletproof cryptographically bound to the issuer commitment and requested bound;
5. request binding to verifier origin, nonce and expiry;
6. a signed wallet response using the exact registered wallet P-256 key;
7. an active, non-expired matching wallet key in the registry.

The verifier fails closed when these checks cannot be completed.

### Privacy properties

Raw DOB and KYC witness values do not enter ZK public inputs and are not included in proof claims. The registry stores public keys, status/revocation records and audit metadata, rather than the private credential witnesses used to construct proofs.

Pairwise subject IDs reduce direct subject-identifier reuse between verifier origins. They are **not a complete unlinkability guarantee**: an ordinary issuer-signed Pedersen commitment can itself be a stable correlation handle if the same commitment is disclosed to multiple colluding verifiers. Full anonymous-credential unlinkability would require a rerandomizable credential/signature construction and is outside the current protocol.

## Cryptography

- Bulletproofs range proofs over Ristretto255.
- Pedersen commitments bound algebraically to range-proof commitments.
- ECDSA P-256/SHA-256 for issuer and wallet signatures.
- WebCrypto CSPRNG entropy for browser-side proving/verification orchestration.
- AES-256-GCM for local vault encryption.
- Argon2id for vault passphrase derivation.

Generated WASM is rebuilt from Rust in CI and compared byte-for-byte against the committed package. A stale generated package blocks CI.

## Architecture

```text
Issuer / Attester SDK
    ├── validates issuer inputs
    ├── creates private numeric witnesses
    ├── creates Pedersen commitments
    └── signs commitment attestations
             │
             ▼
Wallet PWA ─────── Registry Server ─────── Verifier SDK
    │                   │                       │
    │ private witness   │ wallet/issuer keys   │ request policy
    │ encrypted vault   │ revocation/status    │ signature checks
    │ Bulletproofs      │ audit metadata       │ Bulletproof checks
    └───────────────────┴───────────────────────┘
```

Components:

- `packages/age-zk`: Rust/WASM Bulletproof bound-proof implementation.
- `packages/attester-sdk`: issuer credential/commitment issuance and issuer-key registration.
- `apps/wallet-pwa`: local encrypted wallet, credential witness storage and proof generation.
- `apps/registry-server`: wallet/issuer key lifecycle, status and revocation service.
- `packages/verifier-sdk`: request generation and fail-closed verification.
- `apps/verifier-demo`: integration example.

## End-to-end flow

1. The issuer creates a signed commitment attestation for DOB and/or KYC level.
2. The wallet stores the private value/blinding witness locally.
3. A verifier creates a request containing the verifier origin, fresh nonce, expiry and requested threshold.
4. The wallet generates an issuer-bound Bulletproof and a verifier-specific continuity identifier.
5. The wallet signs the complete response using its registered P-256 proof-signing key.
6. The verifier retrieves the exact wallet key and issuer key from the registry, checks their state, verifies signatures, verifies the commitment attestation and verifies the Bulletproof against the requested context/bound.
7. Any failed trust, signature, context, expiry, revocation or proof check rejects the response.

## Testing and release gate

CI is blocking and includes:

- reproducible Rust → WASM rebuild;
- adversarial ZK checks for wrong bounds, wrong context, proof tampering and under-threshold witnesses;
- witness non-disclosure checks;
- frozen dependency installation;
- Linux unit tests and production builds;
- Windows unit tests;
- a live issuer → registry → wallet → verifier test using real cryptographic operations and live HTTP routes;
- issuer-key and wallet-key revocation rejection;
- a truth gate that rejects known placeholder/simulated cryptographic test markers.

A release should not be treated as independently security audited merely because these repository tests pass.

## Development

Requirements: Node.js 20+, pnpm 9.x, Rust stable with `wasm32-unknown-unknown`, and `wasm-pack` when rebuilding the ZK package.

```bash
pnpm install --frozen-lockfile
pnpm -F @shielded-id/age-zk test
pnpm -r test
pnpm build
```

The complete release gate is defined in `.github/workflows/ci.yml`.

## Compliance and certification

Shielded ID contains technical controls that can support a deployment's security/privacy obligations, but the repository is **not itself ISO 27001 certified, GDPR certified, CCPA certified, NIST certified, or guaranteed vulnerability-free**. Regulatory compliance depends on the operator, deployment, lawful basis, policies, contracts, retention, incident handling, hosting and other organisational measures outside this source tree.

See `COMPLIANCE.md` for a control-oriented implementation note rather than a certification claim.

## Deployment notes

- Production registry and verifier endpoints should be served over HTTPS.
- Protect issuer key-registration/revocation credentials as administrative secrets.
- Keep system clocks synchronized because proof requests are time bounded.
- Treat registry availability as part of the verification dependency; trust checks fail closed rather than accepting stale state by default.
- Maintain backups and monitoring appropriate to the deployment.
- Perform an independent security review before using the system for high-risk or regulated decisions.

## Known limitations

- Current ZK production predicates are limited to age threshold and KYC-level threshold proofs.
- `CONTINUITY` is pairwise by verifier origin but does not by itself provide full cryptographic unlinkability.
- WebAuthn is an authentication mechanism; proof responses use a dedicated registered P-256 signing key rather than treating WebAuthn assertions as generic signatures.
- Browser environments must provide WebCrypto and WASM support.
- Legal/regulatory suitability is deployment-specific.

## License

Apache License 2.0. See `LICENSE`.
