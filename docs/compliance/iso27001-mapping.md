# Shielded ID ISO/IEC 27001 Implementation Notes

**Applies to:** ShieldedID v1.6.x  
**Status:** Technical implementation guidance only - not certification

## Scope and limitation

ShieldedID is **not ISO/IEC 27001 certified** and this repository does not constitute an information security management system (ISMS).

ISO/IEC 27001:2022 Annex A contains 93 controls grouped into organisational, people, physical and technological themes. Whether a control is applicable, implemented and effective is determined within an organisation's scoped ISMS through risk assessment and its Statement of Applicability. A source repository cannot truthfully declare 100% control coverage.

The previous version of this file claimed a complete ISMS, 100% ISO coverage, staff/background-check procedures, cloud-provider physical controls, penetration testing, operational review schedules and other deployment facts that are not established by this repository. Those claims are withdrawn.

## Repository controls that may support an ISMS

The following are technical implementation facts that a deploying organisation may use as evidence when relevant to its own risk treatment. They are not ISO control certifications.

| Technical area | Repository evidence | Organisational boundary |
| --- | --- | --- |
| Cryptographic verification | Issuer-bound Bulletproof numeric predicates, P-256 signatures, AES-256-GCM vault encryption and Argon2id passphrase derivation | Algorithm approval, key custody, cryptographic policy and operational key management remain deployment responsibilities |
| Access/trust decisions | Registry-backed issuer and wallet key state, signature validation, request binding and fail-closed verification | Identity governance, privileged access, onboarding/offboarding and administrative access processes are external to the repository |
| Secure development | Blocking CI, adversarial ZK tests, frozen dependency installs, generated-WASM reproducibility checks and dependency advisory gates | Branch protection, reviewer independence, release authority and developer access are repository/operator governance decisions |
| Logging/audit data | Registry records defined wallet/key lifecycle and status events | Retention, monitoring, alerting, access to logs and incident escalation are deployment responsibilities |
| Data minimisation | Supported AGE_OVER and KYC_LEVEL paths avoid sending raw numeric witnesses to the verifier | Data mapping, lawful processing, retention and downstream handling depend on the deployment |
| Revocation | Issuer and wallet key revocation/status paths are implemented and exercised by integration tests | Availability targets, incident procedures and revocation authority remain operational decisions |
| Input handling | Fastify schemas/Zod validation and parameterised database operations are used in security-sensitive paths | Infrastructure controls, WAF policy, network segmentation and deployment configuration are external |
| Dependency management | CI performs JavaScript advisory review and RustSec auditing of committed Rust lockfiles | Remediation SLAs, exception handling and supply-chain governance must be defined by the operator |

## Areas this repository cannot claim to implement

The source tree does not establish organisational or physical facts such as:

- employment screening, contracts, training or disciplinary procedures;
- segregation of organisational duties outside code paths;
- contact arrangements with regulators, law enforcement or specialist groups;
- office, datacentre or physical media security;
- supplier due diligence and contractual controls;
- business continuity objectives, RTOs/RPOs or tested disaster-recovery capability for a particular deployment;
- an incident response team, on-call coverage or exercised response plan;
- approved retention schedules or records-management policy;
- legal/regulatory conformity;
- accredited certification audit evidence.

A deployer may implement these controls, but they must be evidenced in the deployer's own ISMS rather than inferred from ShieldedID source code.

## Suggested certification evidence package

An organisation seeking ISO/IEC 27001 certification should build its own evidence set around the deployed system, including as applicable:

1. defined ISMS scope and interested parties;
2. information-security risk assessment and treatment methodology;
3. Statement of Applicability covering the 93 Annex A controls;
4. policies and assigned responsibilities;
5. asset/data inventory and classification;
6. access and key-management procedures;
7. supplier/cloud assurance records;
8. vulnerability and patch-management process;
9. logging, monitoring and incident-response evidence;
10. backup, restoration and continuity test evidence;
11. secure-development and release records, including ShieldedID CI evidence;
12. internal audits, management review and corrective actions;
13. evidence from the accredited certification process.

## Relationship to ShieldedID CI

A green ShieldedID CI run is useful technical evidence for the exact commit tested. It does not establish control operating effectiveness across an organisation or over time, and it does not replace an ISO/IEC 27001 audit.

See `COMPLIANCE.md`, `SECURITY.md` and `audit.md` for the current project assurance boundary.