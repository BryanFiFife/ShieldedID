<div align="center">

🛡️ ShieldedID

Privacy-preserving identity verification with real zero-knowledge proofs

Prove what matters. Keep the underlying identity data private.













Bulletproofs · Pedersen commitments · Ristretto255 · P-256 signatures · encrypted wallet · revocation registry · fail-closed verification

Latest release ·
Security model ·
Architecture ·
Quick start ·
License

</div>

Why ShieldedID?

Most identity systems answer a simple verification question by collecting far more information than the verifier actually needs.

A service that needs to know whether someone is over 18 does not necessarily need their full date of birth. A service that needs a minimum assurance level does not necessarily need the exact underlying KYC value. A verifier that needs continuity does not necessarily need a reusable global identifier.

ShieldedID is designed around proving the required claim while minimizing disclosure of the underlying identity data.

The hardened v1.6.1 protocol surface combines issuer-attested Pedersen commitments, real Bulletproof range proofs over Ristretto255, signed wallet responses, registry-backed key status and fail-closed verification.

Verification should reveal the answer, not automatically reveal the data behind it.

What can it prove?

Claim

What the verifier learns

What is not sent as the claim

AGE_OVER

Whether an issuer-attested date of birth satisfies an age threshold

Raw date of birth

KYC_LEVEL

Whether an issuer-attested numeric assurance level meets a required minimum

Exact KYC / assurance value

CONTINUITY

A verifier-specific pairwise subject identifier under the signed wallet response

A reusable global subject identifier

Unsupported predicate families are intentionally rejected rather than silently treated as implemented.

How it works

flowchart LR
    I["Issuer / Attester"] -->|"Signed commitment attestation"| W["ShieldedID Wallet PWA"]
    W -->|"Private witness stays local"| W
    V["Verifier"] -->|"Origin + nonce + expiry + threshold"| W
    W -->|"Bound ZK proof + signed response"| V
    R["Registry"] -->|"Issuer key status"| V
    R -->|"Wallet key status / revocation"| V
    I -->|"Issuer key registration"| R
    W -->|"Wallet public key registration"| R

    style W fill:#111827,stroke:#14b8a6,color:#ffffff
    style V fill:#111827,stroke:#6366f1,color:#ffffff
    style I fill:#111827,stroke:#a855f7,color:#ffffff
    style R fill:#111827,stroke:#06b6d4,color:#ffffff

End-to-end verification flow

An issuer creates an attested Pedersen commitment for a supported numeric credential.

The wallet stores the private value and blinding witness locally.

A verifier creates a request bound to its origin, a fresh nonce, expiry and required threshold.

The wallet generates an issuer-bound Bulletproof for the requested predicate.

The wallet signs the complete response using its registered P-256 proof-signing key.

The verifier retrieves the exact wallet and issuer keys from the registry and checks their status.

The verifier validates signatures, attestation, request context, expiry and the Bulletproof.

Any failed trust, signature, context, revocation or proof check causes rejection.

Security model

A successful AGE_OVER or KYC_LEVEL verification requires all of the following:

an issuer-generated Pedersen commitment and private witness held by the wallet;

an issuer ECDSA P-256 signature over the commitment attestation;

an active matching issuer key in the registry;

a Bulletproof cryptographically bound to the issuer commitment and requested bound;

verifier-origin, nonce and expiry binding;

a signed wallet response using the exact registered wallet P-256 key;

an active, non-expired matching wallet key in the registry.

The verifier is designed to fail closed when these checks cannot be completed.

Privacy properties

Raw date-of-birth and KYC witness values do not enter the ZK public inputs and are not included in the proof claims.

The registry stores public keys, lifecycle/status information, revocation records and audit metadata rather than the private credential witnesses used to generate proofs.

Pairwise subject identifiers reduce direct identifier reuse between verifier origins.

Important privacy boundary

ShieldedID does not claim complete cross-verifier unlinkability.

An ordinary issuer-signed Pedersen commitment can become a stable correlation handle if the same commitment is disclosed to multiple colluding verifiers. Full anonymous-credential unlinkability would require a rerandomizable credential/signature construction and remains outside the current protocol.

Cryptography

Purpose

Construction

Zero-knowledge range proofs

Bulletproofs

Curve / group

Ristretto255

Credential commitments

Pedersen commitments

Issuer signatures

ECDSA P-256 / SHA-256

Wallet response signatures

ECDSA P-256 / SHA-256

Browser entropy

WebCrypto CSPRNG

Local vault encryption

AES-256-GCM

Vault passphrase derivation

Argon2id

The generated WASM package is rebuilt from Rust in CI and compared byte-for-byte with the committed generated package. A stale generated package blocks the release gate.

Architecture

ShieldedID
│
├── packages/
│   ├── age-zk/             Rust/WASM Bulletproof implementation
│   ├── attester-sdk/       Issuer credential + commitment issuance
│   └── verifier-sdk/       Request creation + fail-closed verification
│
├── apps/
│   ├── wallet-pwa/         Encrypted local wallet + proof generation
│   ├── registry-server/    Issuer/wallet key lifecycle + revocation
│   ├── verifier-demo/      Reference verifier integration
│   └── zk-agent/           Rust cryptographic component
│
└── .github/workflows/
    └── ci.yml              Blocking security, build and release gates

Core components

Component

Role

Issuer / Attester SDK

Creates credential commitments and signs attestations

Wallet PWA

Holds private witnesses locally and generates proofs

Registry Server

Maintains trusted issuer/wallet public keys, status and revocation

Verifier SDK

Generates requests and performs fail-closed verification

Verifier Demo

Demonstrates the integration path

Rust/WASM ZK package

Performs real Bulletproof proving and verification

Use cases

ShieldedID is suited to architectures where a verifier needs a specific fact rather than an unnecessary identity dossier.

Age-gated services: prove a user satisfies an age threshold without transmitting their date of birth as the claim.

Assurance / KYC gating: prove an issuer-attested assurance level meets a minimum threshold without revealing the exact level.

Privacy-preserving account continuity: use verifier-specific pairwise identifiers instead of a reusable global identity.

Data-minimizing onboarding: reduce unnecessary transmission of identity attributes between trusted issuers, wallets and relying services.

Regulated or high-privacy workflows: provide a technical foundation for minimal-disclosure verification, subject to the operator's legal, governance and security obligations.

ShieldedID is not a replacement for document verification, identity recovery, legal compliance analysis or an independent identity-assurance programme.

Release assurance

The repository's blocking CI pipeline includes:

reproducible Rust → WASM builds;

byte-for-byte generated-package integrity checks;

adversarial ZK checks for wrong bounds, wrong context and proof tampering;

rejection of under-threshold witnesses;

witness non-disclosure checks;

JavaScript dependency advisory auditing;

RustSec auditing for Rust lockfiles;

Linux unit, production-build and live E2E testing;

Windows unit testing;

a real issuer → registry → wallet → verifier integration flow;

issuer-key and wallet-key revocation rejection;

verifier backend boot validation;

a truth gate that rejects known placeholder or simulated cryptographic test markers.

A green CI run means the configured gates passed for that commit. It does not mean the project has received an independent cryptographic audit, penetration test or certification.

Quick start

Requirements

Node.js 20+

pnpm 9.x

Rust stable

wasm32-unknown-unknown

wasm-pack when rebuilding the ZK package

Clone and install

git clone https://github.com/BryanFiFife/ShieldedID.git
cd ShieldedID
pnpm install --frozen-lockfile

Run tests

pnpm -F @shielded-id/age-zk test
pnpm -r test

Build

pnpm build

Development workspace

pnpm dev

The complete release gate is defined in:

.github/workflows/ci.yml

Fail-closed philosophy

ShieldedID does not treat an unsupported claim, missing key, stale trust state, invalid signature or incomplete proof as "close enough".

Unknown predicate?       → REJECT
Invalid proof?           → REJECT
Wrong verifier context?  → REJECT
Expired request?         → REJECT
Revoked issuer key?      → REJECT
Revoked wallet key?      → REJECT
Missing trust state?     → REJECT

That behavior is intentional.

Deployment notes

For real deployments:

serve production registry and verifier endpoints over HTTPS;

protect issuer key-registration and revocation credentials as administrative secrets;

keep system clocks synchronized because proof requests are time-bounded;

treat registry availability as part of the verification dependency;

maintain appropriate monitoring, backups, incident handling and key-management controls;

commission independent security review before high-risk or regulated use.

Compliance and certification

ShieldedID contains technical controls that may support privacy and security obligations in a wider deployment.

It is not itself ISO/IEC 27001 certified, GDPR certified, CCPA certified, NIST certified, OWASP certified or guaranteed vulnerability-free.

Compliance depends on the complete operating environment, including lawful basis, policies, contracts, retention, hosting, incident response, governance and other organisational controls outside this repository.

See COMPLIANCE.md for the project's control-oriented implementation notes.

Known limitations

Production ZK predicates are currently limited to age-threshold and KYC-level threshold proofs.

CONTINUITY provides verifier-specific pairwise identification but is not a complete cryptographic unlinkability mechanism.

A stable issuer-attested Pedersen commitment can become a cross-verifier correlation handle.

WebAuthn is not treated as a generic proof-signing primitive; proof responses use a dedicated registered P-256 key.

Browser environments require WebCrypto and WASM support.

Legal and regulatory suitability remains deployment-specific.

The project does not claim an independent cryptographic or penetration-test audit.

Project status

Area

Current state

Latest release

v1.6.1

ZK implementation

Real Bulletproofs over Ristretto255

Issuer binding

Enforced

Wallet response signing

Dedicated registered P-256 key

Revocation

Issuer + wallet key status enforced

CI

Linux + Windows gates

Live E2E

Issuer → Registry → Wallet → Verifier

License

Apache-2.0

License

Licensed under the Apache License 2.0.

See LICENSE.

<div align="center">

🛡️ Prove the claim. Minimize the disclosure.

ShieldedID

Built as an open-source foundation for privacy-preserving identity verification.

⭐ Star the repository ·
📦 View releases ·
🏴 Caledapt

</div>
