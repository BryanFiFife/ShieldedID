# Shielded ID Asset Management Guidance

**Applies to:** ShieldedID v1.6.x deployments  
**Status:** Operator guidance - not evidence of ISO/IEC 27001 compliance

## Purpose

This document identifies ShieldedID-related asset classes and the decisions a deployer should make when building its own asset-management process. The repository does not claim that an organisation has completed inventories, classifications, access reviews, media-destruction procedures or retention schedules merely by deploying ShieldedID.

The previous version of this file described quarterly audits, employee roles, HSM use, seven-year records, physical-media destruction, transport controls and other operational practices as if they were already implemented. Those statements were not repository-verifiable and have been removed.

## Relevant ShieldedID asset classes

A deployment should consider at least:

- issuer private keys and issuer registration/revocation credentials;
- wallet proof-signing keys and encrypted wallet vaults;
- public issuer/wallet keys and registry status records;
- credential witnesses and Pedersen blindings held by wallets;
- registry databases, backups and audit records;
- verifier configuration, signing/trust configuration and request logs;
- source code, generated WASM, dependency lockfiles and build artifacts;
- CI/CD credentials, repository permissions and release tags;
- infrastructure secrets, TLS keys and deployment configuration;
- documentation, incident records and external assessment reports.

## Classification considerations

Classification should be determined by the deploying organisation's own policy and risk assessment. A reasonable starting point is:

| Asset | Typical sensitivity consideration |
| --- | --- |
| Issuer private keys / admin secrets | Highest sensitivity; compromise can affect credential trust |
| Wallet private witnesses / blindings / signing keys | Sensitive local secrets; compromise can affect privacy or proof authenticity |
| Registry database and audit records | Potentially sensitive operational/security data; assess whether identifiers are personal data in context |
| Public keys and public status data | Intended for verifier trust decisions but still subject to integrity requirements |
| Source code and public documentation | May be public, but release integrity and provenance still matter |
| CI secrets and deployment credentials | Privileged operational secrets |

Do not copy these labels mechanically into an ISMS. The organisation should define its own classification scheme, owners, handling requirements and review process.

## Inventory requirements for a deployment

An operator should maintain an inventory that records, where applicable:

- asset identifier and owner;
- purpose and data classification;
- storage/hosting location;
- dependencies and third parties;
- key lifecycle and rotation owner;
- backup/restore requirements;
- retention/deletion requirements;
- access roles;
- monitoring requirements;
- disposal/decommissioning method.

The ShieldedID repository does not automatically create or maintain this organisational inventory.

## Key and secret handling

For production deployments:

- keep issuer private keys and administrative credentials out of source control;
- use platform-appropriate secure key storage and rotation procedures;
- restrict access to the minimum authorised roles;
- document recovery and revocation procedures;
- test key-compromise response;
- maintain secure backups only where recovery requirements justify them;
- ensure any backup of key material has protections appropriate to the key's sensitivity.

The repository does not require or prove use of a particular HSM, cloud KMS or physical security model.

## Deletion and disposal

Deletion requirements depend on storage medium, platform, legal obligations and threat model. Do not rely on generic commands such as `shred` as a universal guarantee of secure erasure, particularly on SSDs, copy-on-write filesystems, virtual disks or cloud storage.

Operators should define a documented disposal method appropriate to each asset type and verify that the underlying platform supports the intended sanitisation or cryptographic-erasure property.

## Access review

ShieldedID implements application-level key/status controls, but organisational access reviews are external. A deployer should define who can:

- administer issuer trust;
- access registry infrastructure and backups;
- manage CI/CD and release credentials;
- view logs and audit records;
- rotate or revoke issuer/wallet keys;
- change production configuration.

Review cadence and approval requirements should be set by the organisation based on risk rather than assumed by this document.

## Evidence boundary

This file is a deployment checklist. It is not a statement that the listed organisational controls exist or operate effectively in any particular environment. See `COMPLIANCE.md` and `docs/compliance/iso27001-mapping.md` for the project-wide compliance boundary.