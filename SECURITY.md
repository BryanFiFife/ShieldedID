# Shielded ID Security Model

## Supported proof surface

The v1.6 hardened protocol intentionally limits production verification to:

- `AGE_OVER`: issuer-attested DOB threshold proof;
- `KYC_LEVEL`: issuer-attested assurance-level threshold proof;
- `CONTINUITY`: verifier-origin-specific subject identifier protected by the signed wallet response.

Unsupported predicates fail closed. Earlier prototype code/tests describing string equality, membership, prefix, arbitrary metadata or broad “30 predicate” ZK support do not represent the production security surface.

## Cryptographic trust chain

For an age/KYC response to be accepted, the verifier requires:

1. the request is inside its issued/expiry window;
2. request ID and nonce match;
3. the response uses the hardened `BULLETPROOFS_RISTRETTO_BOUND_V2` suite;
4. the exact response `keyId` is active in the wallet's registry record;
5. the wallet response signature verifies under that exact P-256 key;
6. every ZK claim includes a complete issuer commitment attestation;
7. the exact issuer/key pair is active in the registry;
8. the issuer P-256 signature over the attestation verifies;
9. the source commitment embedded in the proof public inputs equals the issuer-attested commitment;
10. the Bulletproof verifies for the requested bound and context;
11. key expiry/revocation and claim expiry checks pass;
12. minimal-disclosure policy checks pass.

Registry/trust lookup errors fail closed. Trust and revocation responses are fetched with no-store semantics by default rather than being accepted from stale cache.

## ZK construction

The Rust/WASM implementation uses Bulletproofs over Ristretto255 and Pedersen commitments.

For a `value >= min` proof, the prover proves the range of `delta = value - min`; the verifier additionally checks the algebraic relation between the range-proof commitment and the issuer's source commitment. For `value <= max`, the proof covers `delta = max - value` with the corresponding commitment relation. This prevents replacing the issuer-attested source with an unrelated in-range witness.

The raw numeric witness is not serialized into public inputs. Proving and verification receive CSPRNG entropy from WebCrypto. The transcript includes protocol/domain separation plus request context.

Generated WASM is rebuilt from Rust in CI and compared against the committed package. Mismatch blocks the release gate.

## Key roles

### Issuer key

A P-256 key signs commitment attestations. The registry holds its public key and current status. Issuer registration/revocation is an administrative operation protected by an explicit deployment secret; the SDK does not create unsigned self-issued bearer credentials.

### Wallet proof-signing key

A separate P-256 key signs proof responses and proves possession during wallet registration. The exact public JWK representation is canonicalized before it enters a signed registry payload. The encrypted private key remains in the wallet vault.

### WebAuthn

WebAuthn is used as an authentication mechanism. A WebAuthn assertion is not treated as a generic ECDSA signature over proof JSON because WebAuthn signs authenticator data and client-data structures, not arbitrary application bytes.

## Local vault

The wallet vault uses AES-256-GCM. The passphrase-derived encryption key uses Argon2id. Private credential values/blindings and the software proof-signing key are local wallet secrets.

Security of local secrets still depends on endpoint/browser integrity, passphrase quality and platform controls.

## Registry contents

The registry stores wallet public keys/status, issuer public keys/status, revocation records and audit metadata. It should not receive private DOB/KYC witness values or Pedersen blindings.

The repository also contains unrelated contact/admin functionality that can store ordinary contact information; “the entire server stores no PII” is therefore not a valid blanket claim.

## Replay and request binding

Verifier requests contain a cryptographically random nonce, verifier origin, issue time and expiry. ZK transcripts are bound to the verifier origin, nonce and expiry. Wallet responses are signed over the request identifiers, claims and proof structures.

Fresh nonces and synchronized clocks are deployment requirements.

## Correlation limitation

Pairwise subject IDs reduce direct subject-ID reuse between origins, but they do not make the current credential presentation fully unlinkable. The issuer signs a persistent source commitment; repeated disclosure of that same commitment can provide a correlation handle to colluding verifiers.

Shielded ID therefore does **not** claim anonymous-credential unlinkability in v1.6. A future unlinkable design would require an independently reviewed rerandomizable credential/signature scheme.

## Availability and fail-closed behaviour

The registry is part of the online verification trust path. If current wallet/issuer key state cannot be obtained, the default verifier rejects rather than accepting stale cached trust data.

Deployments must engineer registry availability appropriate to their risk tolerance.

## CI security gates

The blocking workflow includes:

- Rust→WASM rebuild and generated-package reproducibility check;
- valid range proof acceptance;
- wrong-bound and wrong-context rejection;
- proof-byte tamper rejection;
- under-threshold witness rejection;
- witness non-disclosure check;
- frozen dependency install;
- unit suites on Linux and Windows;
- production workspace builds;
- live issuer→registry→wallet→verifier E2E verification;
- issuer and wallet-key revocation rejection;
- detection of known placeholder/simulated cryptographic test markers.

These tests are evidence for checked behaviours, not a proof that the software has zero vulnerabilities.

## Deployment requirements

- HTTPS for registry/verifier/issuer administration endpoints.
- Secure storage/rotation of issuer administrative credentials and private keys.
- Accurate system clocks.
- Appropriate rate limiting, logging, monitoring and backups.
- Dependency and vulnerability management.
- Independent review before high-risk or regulated deployment.

## Reporting vulnerabilities

Please report suspected vulnerabilities privately to the project maintainer rather than publishing exploit details before a fix is available. Include affected version/commit, reproduction details and impact where possible.
