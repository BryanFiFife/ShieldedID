# Shielded ID Protocol Specification

**Protocol line:** v1.6.x hardened implementation  
**Document status:** Project specification, not an IETF Standards Track document  
**Last updated:** 2026-08-24

## 1. Scope

Shielded ID is a minimal-disclosure identity verification protocol built around issuer-authenticated Pedersen commitments, Bulletproofs over Ristretto255, signed wallet responses, and registry-backed issuer/wallet key status.

The production proof surface in v1.6.x is intentionally limited to:

- `AGE_OVER`
- `KYC_LEVEL`
- `CONTINUITY`

Historical prototype predicates that do not have a real cryptographic verification path are unsupported and must fail closed.

The TypeScript/Rust source and schemas are authoritative where this explanatory document and code differ.

## 2. Parties

### Issuer / Attester

Performs the external identity/KYC process, creates credential material, creates an issuer-authenticated numeric source commitment, and signs commitment-attestation metadata with an issuer P-256 key.

The protocol does not determine whether an issuer's real-world identity/KYC process is trustworthy. Issuer governance is a deployment decision.

### Wallet

Stores the private credential witness and Pedersen blinding locally, generates bound proofs, derives verifier-specific continuity identifiers, and signs the complete proof response with its dedicated registered P-256 proof-signing key.

### Registry

Stores public trust material and lifecycle state required for online verification, including wallet public keys/status and issuer public keys/status. It is not intended to receive the raw private DOB/KYC witness or Pedersen blinding for the supported proof flow.

### Verifier

Creates a time-bounded proof request, validates the signed response, resolves the exact wallet and issuer keys from the registry, verifies the issuer commitment attestation, and verifies the requested Bulletproof relation against the request context.

## 3. Supported claims

### 3.1 AGE_OVER

The issuer credential contains a private date-of-birth value represented numerically as `YYYYMMDD`, plus the blinding used for its Pedersen source commitment.

For a request such as "age >= 18", the wallet derives the date cutoff from the verifier request's `issuedAt` time and requested threshold, then proves that the issuer-attested DOB value is less than or equal to that cutoff.

The raw DOB and exact age are not included in the supported proof public inputs.

### 3.2 KYC_LEVEL

The issuer credential contains a private numeric assurance/KYC level plus the blinding used for its Pedersen source commitment.

For a request such as "KYC level >= 2", the wallet produces a greater-than-or-equal bound proof cryptographically linked to the issuer-attested source commitment.

The private numeric KYC level is not included in supported proof public inputs.

### 3.3 CONTINUITY

The wallet derives a verifier-origin-specific subject identifier and includes it in the signed wallet response. This reduces direct reuse of the same subject identifier across verifier origins.

`CONTINUITY` is not a Bulletproof numeric predicate.

## 4. Numeric commitment attestation

For supported numeric credentials, the issuer signs metadata that identifies at least the credential/attribute context, issuer identity, issuer key ID, validity metadata and Pedersen source commitment.

The wallet retains the private numeric value and blinding needed to prove a bound against that same commitment.

The verifier must:

1. resolve the exact issuer/key pair from the registry;
2. require the issuer key to be acceptable/current under the registry policy;
3. verify the issuer P-256 signature over the unsigned commitment-attestation payload;
4. extract the source commitment encoded in the proof public inputs;
5. require exact equality between that source commitment and the issuer-attested commitment.

A proof over an unrelated holder-chosen commitment must not be accepted as an issuer-bound credential proof.

## 5. Bound-proof construction

The Rust/WASM implementation uses Bulletproofs over Ristretto255 and Pedersen commitments.

### 5.1 Greater-than-or-equal proof

For a private value `v` and public minimum `m`:

- the prover computes `delta = v - m`;
- the Bulletproof proves `delta` is within the supported non-negative range;
- the range-proof commitment uses the same blinding as the issuer source commitment;
- the verifier checks the algebraic relation between the delta commitment and source commitment.

Conceptually:

`C_delta = C_source - m*B`

where `B` is the value base point used by the Pedersen commitment construction.

If `v < m`, proof generation must fail.

### 5.2 Less-than-or-equal proof

For a private value `v` and public maximum `M`:

- the prover computes `delta = M - v`;
- the Bulletproof proves `delta` is within the supported non-negative range;
- the commitment relation links the range proof to the same issuer source commitment.

Conceptually:

`C_delta = M*B - C_source`

If `v > M`, proof generation must fail.

### 5.3 Randomness

Browser-side proving/blinding entropy is sourced from WebCrypto CSPRNG output and passed into the Rust/WASM proving functions. Proof material must not be deterministically derived solely from witness, threshold, nonce or context.

## 6. Request binding

A verifier request includes identifiers and timing/context information used to prevent replay and cross-context reuse. The hardened proof context binds the proof to the intended verifier/request using verifier origin, nonce and expiry.

The verifier must require consistency between the request and response, including the exact request identifier, nonce, verifier origin/context, claim ordering/types and validity window expected by the current source types.

Fresh nonces and reasonably synchronized clocks are deployment requirements.

## 7. Wallet response authentication

The wallet signs the complete response with a dedicated registered P-256 proof-signing key.

The verifier must:

1. require the response `keyId` to resolve to that exact wallet key;
2. reject revoked/expired/unacceptable wallet key state;
3. verify the wallet P-256 signature before treating proof content as authenticated.

WebAuthn assertions are not generic signatures over arbitrary proof JSON and are not used as a substitute for this proof-signing key path.

## 8. Registry trust and revocation

The default verifier trust path is online and fail closed.

For supported identity/KYC proofs, successful verification depends on current wallet-key and issuer-key trust state. If required trust state cannot be resolved or validated, the verifier rejects rather than accepting stale or weaker trust data.

The registry reference implementation includes issuer/wallet key registration, lookup, status/expiry and revocation paths. Deployment availability and governance of those operations remain operator responsibilities.

## 9. Verification algorithm

For a supported AGE_OVER or KYC_LEVEL proof, a verifier should conceptually perform the following sequence:

1. validate request and response timing/identifier consistency;
2. validate verifier origin/context and nonce binding;
3. validate the exact expected claim type and predicate/operator;
4. resolve the exact wallet signing key and require acceptable current state;
5. verify the wallet response signature;
6. require complete commitment-attestation evidence for each numeric claim;
7. resolve the exact issuer/key pair and require acceptable current state;
8. verify the issuer signature over the commitment attestation;
9. require the proof source commitment to equal the issuer-attested commitment;
10. recompute the expected public threshold/cutoff from the request;
11. verify the real Bulletproof components for that threshold and context;
12. enforce minimal-disclosure policy;
13. reject any unsupported predicate or extra/unexpected proof surface.

The actual verifier source is normative for field names and error handling.

## 10. Privacy properties

### 10.1 Minimal disclosure

The supported numeric proof paths are designed so the verifier does not receive the raw DOB, exact age, private KYC level or raw numeric witness merely to verify the requested bound.

### 10.2 Pairwise identifiers

Verifier-specific continuity identifiers reduce direct reuse of a common subject identifier across origins.

### 10.3 Correlation limitation

Shielded ID v1.6.x does **not** claim full anonymous-credential unlinkability.

The issuer signs a persistent Pedersen source commitment. If the same commitment is presented to multiple colluding verifiers, it can act as a correlation handle even when proofs themselves are randomized and pairwise subject IDs differ.

A future unlinkable protocol would require an appropriately reviewed rerandomizable credential/signature construction or equivalent mechanism.

## 11. Security boundaries

The protocol is designed to address proof forgery, request/context replay, holder substitution of an unrelated witness, issuer/wallet key revocation and unnecessary disclosure in the supported proof surface.

The following remain outside the guarantees of repository code alone:

- correctness of an issuer's real-world KYC/identity process;
- compromised wallet/browser/OS environments;
- side channels not addressed by the underlying implementations;
- deployment TLS/network/IAM/secrets configuration;
- registry availability;
- organisational incident response;
- legal/regulatory compliance;
- independent cryptographic or penetration-test assurance.

## 12. Protocol evolution

New predicate families must not be added by reinterpreting plaintext public inputs as proofs. A new production claim type requires an explicit cryptographic construction, issuer binding where appropriate, adversarial tests, fail-closed verifier support, privacy analysis and protocol/version migration rules.

Security-significant changes should be released under an explicit protocol/package version and must pass the complete release gate before tagging.

## 13. Assurance statement

Repository CI includes real cryptographic/adversarial checks, live issuer-registry-wallet-verifier integration, generated-WASM reproducibility, dependency advisory gates and cross-platform tests. Passing CI is internal evidence for the exact tested commit.

It is not an IETF approval, formal certification, independent cryptographic audit, penetration test or proof that the implementation has zero vulnerabilities.
