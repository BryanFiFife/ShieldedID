# Shielded ID Production Deployment Readiness Checklist

**Applies to:** ShieldedID v1.6.x  
**Last updated:** 2026-08-24  
**Status:** Deployment checklist, not a declaration that a deployment is production ready

## Repository-level prerequisites

Before treating a commit as an internally verified release candidate:

- [ ] The exact candidate commit passes the full pull-request CI suite.
- [ ] The exact merged `master` SHA passes a fresh push-triggered CI run.
- [ ] The release tag points to that exact green `master` SHA.
- [ ] Rust/WASM reproducibility check passes.
- [ ] Linux unit/build/E2E jobs pass.
- [ ] Windows unit jobs pass.
- [ ] Cryptographic truth gate passes.
- [ ] JavaScript dependency advisory gate passes at the configured high/critical threshold.
- [ ] RustSec `cargo-audit` passes for committed Rust lockfiles.

These checks establish repository-level release evidence only. They do not make a deployment automatically safe, compliant or independently audited.

## Cryptographic foundations

The supported v1.6.x proof surface is intentionally limited to:

- `AGE_OVER`: issuer-attested DOB threshold proof;
- `KYC_LEVEL`: issuer-attested assurance-level threshold proof;
- `CONTINUITY`: verifier-specific continuity identifier under the signed wallet response.

Operational expectations:

- [ ] Unsupported historical predicates remain fail closed.
- [ ] Issuer and wallet keys used by the deployment are registered and have valid lifecycle procedures.
- [ ] Verifier requests use fresh nonces and bounded validity windows.
- [ ] System clocks are synchronized sufficiently for request/expiry validation.
- [ ] Registry trust lookups remain fail closed rather than accepting stale trust state.

## Transport and hosting

The repository does not configure the operator's production network automatically.

A production deployment should establish, test and document:

- [ ] HTTPS/TLS termination for registry, issuer administration and verifier endpoints.
- [ ] Secure DNS and certificate renewal processes.
- [ ] Network exposure appropriate to each service.
- [ ] Rate limiting and abuse controls suitable for the deployment.
- [ ] Secure storage of environment secrets and administrative tokens.
- [ ] No production secrets committed to source control.
- [ ] Hosting/infrastructure security appropriate to the risk profile.

## Registry availability and recovery

The registry is part of the online verifier trust path. An outage can correctly cause verification to fail closed.

Operators should define and test:

- [ ] Availability objectives appropriate to the business use case.
- [ ] Database backup and restoration.
- [ ] Preservation of revocation state during restoration.
- [ ] Recovery from issuer-key or wallet-key compromise.
- [ ] Monitoring for registry failures, latency and trust lookup errors.
- [ ] Recovery procedures that do not reactivate revoked trust material.

No RTO, RPO or uptime percentage is guaranteed by the repository.

## Key custody and administrative access

- [ ] Issuer private keys are stored using controls appropriate to their impact.
- [ ] Issuer registration/revocation credentials are restricted and rotated as required.
- [ ] Registry/admin privileges are granted to the minimum required identities.
- [ ] CI/CD and release credentials are protected separately from application credentials.
- [ ] Key compromise and emergency revocation procedures have been tested.
- [ ] Backup of private key material, if permitted, follows an explicit recovery and protection policy.

## Logging and incident response

The application exposes audit/logging mechanisms, but an operator must decide how they are used.

- [ ] Security-relevant registry and verifier events are collected.
- [ ] Logs are protected from unauthorised access.
- [ ] Retention is defined by the operator's legal/security requirements.
- [ ] Alerts exist for meaningful failure patterns.
- [ ] Incident procedures cover issuer compromise, wallet-key compromise, registry compromise and bad releases.
- [ ] Incident contacts and decision authority are documented.

## Privacy and legal readiness

- [ ] The operator has mapped data flows and identifiers used by its deployment.
- [ ] Controller/processor roles and lawful basis have been assessed where applicable.
- [ ] Retention/deletion requirements are defined.
- [ ] DPIA or equivalent privacy assessment has been considered for identity/KYC use cases.
- [ ] The persistent issuer-signed commitment correlation limitation is understood and acceptable for the intended use.
- [ ] No claim of full anonymous-credential unlinkability is made for v1.6.x.

## External assurance

For high-risk or regulated use, the following should be completed independently of repository CI:

- [ ] Cryptographic review of the issuer-bound Bulletproof construction and transcript/context design.
- [ ] Application penetration testing of wallet, registry and verifier integrations.
- [ ] Infrastructure/IAM/secrets review.
- [ ] Dependency and software-supply-chain review beyond automated advisory checks where warranted.
- [ ] Privacy/legal review for the intended jurisdictions and decision context.
- [ ] Operational continuity and incident-response exercise.

## Acceptance rule

Do not describe a deployment as "production ready" merely because this checklist file exists or repository CI is green. Readiness is a deployment-specific decision that requires both technical release evidence and the operator's own operational, security, privacy and legal controls.
