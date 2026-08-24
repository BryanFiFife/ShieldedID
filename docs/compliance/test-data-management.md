# Shielded ID Development and Test Data Guidance

**Applies to:** ShieldedID v1.6.x development and deployment environments  
**Status:** Engineering guidance - not evidence of organisational compliance

## Purpose

This document describes safe practices for test data around ShieldedID. It does not claim that a deploying organisation has environment segmentation, employee roles, monitoring, retention schedules or production-data anonymisation controls in place.

The previous version presented those operational controls as already implemented and labelled the repository "Production Ready" and fully compliant with an ISO control. Those claims were not supported by repository evidence and are withdrawn.

## Default principle

Use synthetic data for automated and development tests wherever possible. Do not copy live identity or KYC data into tests merely to make fixtures realistic.

The hardened repository's cryptographic tests use generated keys, synthetic numeric witnesses, fresh randomness and local test registry state. Test fixtures should remain non-production unless a separately governed test programme explicitly authorises another approach.

## Sensitive test material

Treat the following as sensitive even when generated only for tests:

- test private signing keys;
- issuer administrative tokens/secrets;
- wallet passphrases and encrypted vault fixtures;
- Pedersen blindings and private numeric witnesses;
- database snapshots containing identifiers or operational metadata;
- CI secrets or credentials used to access external test services.

Do not commit real production keys, secrets or production credential witnesses to the repository.

## Synthetic data

Recommended properties:

- generated solely for the test run or clearly marked as non-production fixtures;
- no real names, addresses, dates of birth, government identifiers or KYC records unless a separately approved test basis exists;
- fresh cryptographic randomness for security-property tests where nondeterminism is part of the construction;
- deterministic fixtures only where reproducibility is the explicit purpose and the deterministic value cannot be mistaken for production entropy;
- isolated registry/database state for integration tests.

## Production-derived data

If an operator proposes using production-derived data in testing, it should first establish:

1. a lawful and documented reason for doing so;
2. whether anonymisation is genuinely irreversible for the intended context, rather than merely pseudonymisation;
3. who is authorised to approve and access the dataset;
4. the minimum fields required;
5. retention/deletion rules;
6. environment isolation and monitoring;
7. breach/incident handling expectations.

Hashing an identifier does not automatically make it anonymous. Re-identification risk depends on the data and context.

## Environment separation

The repository's CI creates test-scoped processes and data, but it does not prove separation between an operator's development, staging and production environments.

A production operator should independently enforce separation appropriate to its risk model, including credentials, databases, network access and administrative privileges.

## Cleanup and retention

Automated tests should clean up temporary state where practical. Operators should define retention rules for CI logs, test databases, coverage artifacts and security test output based on their own privacy, security and audit requirements.

Generic deletion commands are not a universal secure-erasure guarantee across cloud, SSD and copy-on-write storage. Use platform-appropriate sanitisation or cryptographic-erasure controls when sensitive data has actually been stored.

## Security testing

Security-focused tests should include adversarial cases rather than only success paths. ShieldedID CI currently exercises, among other things:

- wrong-bound proof rejection;
- wrong-context rejection;
- proof-byte tamper rejection;
- under-threshold proof rejection;
- witness non-disclosure checks;
- issuer and wallet-key revocation rejection;
- dependency advisory gates;
- detection of known simulated/placeholder cryptographic coverage.

These checks apply to the exact commit tested. They do not constitute a penetration test or formal compliance assessment.

## Evidence boundary

This file is engineering guidance. Organisational test-data governance, privacy compliance, environment controls and retention processes must be established and evidenced by the deploying organisation.