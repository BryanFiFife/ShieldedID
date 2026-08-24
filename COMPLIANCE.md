# Shielded ID Compliance and Control Notes

**Applies to:** v1.6 hardened protocol

This document describes security/privacy-relevant controls present in the Shielded ID codebase. It is **not a certification, legal opinion, conformity assessment, or statement that any deployment is automatically compliant with a regulatory framework**.

Compliance is an organisational and deployment property. It depends on matters the repository cannot determine, including controller/processor roles, lawful basis, notices, data retention, hosting, access governance, incident management, staff practices, contracts, risk assessment and jurisdiction.

## Current technical controls

| Area | Implemented technical control | Boundary |
| --- | --- | --- |
| Data minimisation | Age and KYC threshold proofs do not send the raw numeric witness | Issuer commitment metadata and cryptographic proof material still exist and must be assessed by the operator |
| Credential provenance | Issuer P-256 signature over the commitment attestation | Trust in the issuer and its enrolment process is deployment-specific |
| Wallet authentication | Dedicated P-256 proof-signing key registered with the registry | Key protection and device compromise remain operational risks |
| Replay resistance | Verifier origin, nonce and expiry are bound into proof context | Verifiers must create fresh nonces and keep accurate time |
| Revocation | Registry tracks wallet and issuer key state; verifier checks current state | Registry availability is required for the default fail-closed verification path |
| Local confidentiality | AES-256-GCM encrypted vault with Argon2id-derived key | Passphrase quality and endpoint security remain user/operator responsibilities |
| Auditability | Registry records wallet/status/revocation and issuer-key lifecycle events | Log retention, monitoring and access controls are deployment responsibilities |
| Input handling | Fastify JSON schemas/Zod validation and parameterised SQLite queries | Application-level validation does not replace infrastructure hardening |
| Generated-code integrity | CI rebuilds Rust/WASM and rejects a stale committed generated package | Supply-chain and runner trust still require normal CI governance |

## ISO/IEC 27001

The project is **not ISO/IEC 27001 certified**. ISO/IEC 27001 is an information security management system standard that covers organisational governance well beyond application code. A source repository cannot self-declare certification by counting controls.

Technical features in this repository may contribute evidence to an organisation's risk treatment and control implementation, particularly around cryptography, access control, logging, secure development and key lifecycle. An organisation seeking certification would still need an appropriately scoped ISMS, risk assessment, Statement of Applicability, policies, operational evidence and an accredited certification process.

The previous repository claim of “100% ISO 27001:2022 / 114 controls” has been removed. That wording also conflated control sets from different editions/structures of the standard.

## GDPR / UK GDPR

Shielded ID is designed to reduce disclosure of identity attributes, but the codebase is **not automatically GDPR or UK GDPR compliant**. A deployer should determine, among other things:

- whether proof/registry identifiers are personal data or pseudonymous data in its context;
- controller and processor roles;
- Article 6 lawful basis and any Article 9 implications;
- transparency information and data-subject rights handling;
- retention/deletion periods for registry and audit data;
- DPIA requirements, especially for identity/age/KYC decisions;
- international transfer and processor/subprocessor arrangements;
- security measures appropriate to risk;
- incident and breach-response procedures.

Cryptographic minimisation can reduce the data exposed to a verifier, but it does not by itself remove all data-protection obligations.

## CCPA / CPRA and other privacy regimes

No blanket CCPA/CPRA compliance claim is made. A deploying business must classify the data and parties involved, determine applicable consumer rights and notices, and implement the operational processes required by the law that applies to it.

## NIST / OWASP

The repository uses practices that overlap with guidance from NIST and OWASP, including cryptographic verification, replay controls, strict input validation, parameterised database access, key revocation, rate limiting and security-focused CI. This is **alignment with individual practices, not a NIST or OWASP certification or percentage score**.

A deployment should still perform threat modelling, dependency/vulnerability management, infrastructure hardening, secrets management, penetration testing, logging/alerting and incident-response exercises appropriate to its risk profile.

## Security assessment status

Passing the project's CI proves that the checked behaviours and build gates passed for that commit. It does not prove absence of vulnerabilities.

Before high-risk or regulated production use, recommended external assurance includes:

- independent cryptographic review of the issuer-bound Bulletproof construction and transcript/context design;
- application security review and penetration testing of wallet, registry and verifier integrations;
- dependency and supply-chain review;
- privacy/legal assessment for the intended jurisdictions and use cases;
- operational controls review for issuer onboarding, key custody, registry availability, logging and incident response.

## Privacy limitation: correlation

Verifier-specific pairwise subject IDs prevent simple reuse of the same subject identifier across origins. However, the current issuer signature covers a persistent Pedersen commitment. If the same commitment is presented to colluding verifiers, it may act as a correlation handle. Therefore Shielded ID v1.6 does **not** claim full anonymous-credential unlinkability.

A future protocol seeking that property should use an appropriately reviewed rerandomizable credential/signature construction.

## Change-control requirement

Compliance/security documentation must track the actual implementation. CI tests and this document should be updated whenever the proof suite, credential format, registry trust model or supported predicates change. Marketing statements must not upgrade a technical control into a certification claim without independent evidence.
