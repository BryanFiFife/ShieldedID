# Shielded ID Registry Routes and Contract Notes

**Applies to:** ShieldedID v1.6.x  
**Last updated:** 2026-08-24

## Source of truth

The authoritative HTTP contract is the Fastify route/schema implementation under `apps/registry-server/src/routes/` together with the generated OpenAPI documentation exposed by the running registry at `/docs`.

This document is a human-readable orientation layer. It deliberately avoids promising cache lifetimes, uptime, idempotency or deployment guarantees that are not enforced by the current source.

The previous version contained stale v1.5 request/response examples and several inaccurate guarantees, including long-lived caching for trust status and blanket "no PII" statements. Those claims have been removed.

## Core route groups

### Wallet registration and key lifecycle

Current wallet routes include:

- `POST /v1/wallet/register`
- `POST /v1/wallet/:walletId/keys`

Wallet registration requires proof of possession of the exact P-256 signing public key being registered. Successful registration returns both a `walletId` and the created signing `keyId`.

Adding/rotating a wallet key requires a signature from an already authorised wallet key and is subject to request validation, replay protection and rate limits.

Do not treat WebAuthn credential metadata as the proof-signing public key. The hardened wallet architecture uses a dedicated registered P-256 proof-signing key.

### Wallet/key status

Trust-sensitive status routes expose current wallet/key state for verifier decisions. The verifier uses exact wallet/key identifiers and fails closed when required trust state cannot be obtained or validated.

Trust/revocation responses should not be treated as indefinitely cacheable. Current hardened verification expects current key state and the registry route implementation sets trust-sensitive cache behaviour accordingly.

### Revocation

Wallet/key revocation routes require authenticated/signed authority according to the route implementation and record lifecycle state in the registry.

The integration test exercises rejection after wallet-key revocation. Operators should still define who is authorised to revoke keys and how emergency compromise response is handled.

### Issuer key registration and trust

Current issuer routes include the hardened issuer-key trust path under `/v1/issuers/:issuerDid/...`.

Issuer key registration/revocation is an administrative operation protected by the configured issuer registration secret. Public lookup returns the issuer public key/status required by verifiers.

Compatibility routes under `/api/attesters/...` exist only to preserve the attester SDK write surface while storing trust material in the hardened issuer-key registry model.

### Backup and administrative routes

The registry also contains backup, contact and administrative functionality. These are operational/application routes and are not part of the cryptographic proof soundness argument.

Because these routes may handle ordinary application data, the project does **not** make a blanket claim that the entire registry server stores no personal information. The narrower cryptographic claim is that raw private DOB/KYC witnesses and Pedersen blindings are not required to be stored by the registry for the supported proof flow.

## Contract invariants relevant to verification

For the hardened proof path, the verifier expects:

1. exact request ID and nonce agreement;
2. verifier origin/context and expiry binding;
3. the exact registered wallet signing `keyId`;
4. an active wallet/key state;
5. a valid wallet P-256 signature over the response;
6. issuer metadata that matches the claim evidence;
7. an active issuer/key state;
8. a valid issuer P-256 signature over the commitment attestation;
9. exact equality between the proof's source commitment and issuer-attested commitment;
10. a valid Bulletproof for the requested bound and context;
11. rejection of unsupported predicate families.

Any integration that bypasses these checks is outside the supported v1.6.x security contract.

## Error handling

Consumers should treat HTTP status and machine-readable error codes as part of the contract, but should not depend on undocumented human-readable error strings.

Unknown/malformed identifiers, missing required trust material, invalid signatures, revoked/expired keys and invalid proof/request state should be handled as verification failure rather than silently downgraded to a weaker trust path.

## Deployment boundary

The route implementation does not itself guarantee:

- public internet availability;
- a specific uptime/SLA;
- TLS termination;
- WAF/reverse-proxy policy;
- organisational admin/IAM procedures;
- data-retention policy;
- legal/regulatory compliance.

Those are deployment responsibilities. See `docs/PRODUCTION_READINESS.md`, `SECURITY.md` and `COMPLIANCE.md` for the current assurance boundary.