# Shielded ID: Privacy-Preserving Signed Claims

**This is a protocol and reference implementation for privacy-preserving proof of user claims (age, KYC level, continuity) with cryptographic revocation.**

---

## What This Is

- **Protocol**: Formal specification for claim verification without unnecessary PII disclosure
- **Reference Implementation**: Complete working code (wallet, registry, verifier SDK)
- **Open Source**: Apache 2.0 license; community-auditable
- **Self-Hosted**: You run your own registry and verifier; we are not a data processor

---

## What This Is NOT

- **Not a hosted service**: No SaaS, no data collection, no vendor lock-in
- **Not identity verification**: Cannot verify documents (use traditional KYC for that)
- **Not account recovery**: Wallet loss = credential loss (intentional)
- **Not identity linking**: Cannot link users across services (by design)
- **Not a credential authority**: Users self-issue within their wallet

---

## Protocol Guarantees

**Cryptographic invariants**:
- No identity disclosure (verifier never sees name, address, SSN)
- No cross-service correlation (unique ID per verifier; cannot be linked)
- Proof is non-replayable (nonce + timestamp binding)
- User-authoritative revocation (user controls; takes effect immediately)
- No registry deanonymization (registry cannot connect IDs to user)

**See [ADOPTERS.md](ADOPTERS.md#protocol-guarantees-invariants) for full specification.**

---

## Quick Start

### Choose Your Path

**I want code examples**  
→ [packages/verifier-sdk/docs/recipes.md](packages/verifier-sdk/docs/recipes.md) (7 recipes, copy-paste ready)

**I want full documentation**  
→ [ADOPTERS.md](ADOPTERS.md) (protocol spec, guarantees, non-goals, hardening checklist)

**I want to understand risk/cost**  
→ [ADOPTION_NOTES.md](ADOPTION_NOTES.md) (compliance scope, cost breakdown, failure modes)

**I want the API reference**  
→ [packages/verifier-sdk/README.md](packages/verifier-sdk/README.md) (5-minute integration, complete API)

**I want to see it work**  
→ [10-MINUTE-TEST.md](10-MINUTE-TEST.md) (end-to-end test, demo walkthrough)

---

## Typical Integration

```
1. Read SDK README (10 min)
   ↓
2. Copy a recipe (5 min)
   ↓
3. Implement proof request + callback endpoints (2-3 hours)
   ↓
4. Add revocation checks + storage (30 min)
   ↓
5. Test with demo wallet (1 hour)
   ↓
6. Harden per checklist (see ADOPTERS.md)
   ↓
7. Deploy
```

**Total: ~4 hours from code to working integration.**

---

## Key Documents

| Document | Purpose |
|----------|---------|
| [ADOPTERS.md](ADOPTERS.md) | **Full specification** (guarantees, non-goals, checklist) |
| [docs/spec/disclosure.md](docs/spec/disclosure.md) | **Privacy specification** (what verifiers learn, disclosure guarantees) |
| [packages/verifier-sdk/README.md](packages/verifier-sdk/README.md) | API reference + integration examples |
| [packages/verifier-sdk/docs/recipes.md](packages/verifier-sdk/docs/recipes.md) | 7 copy-paste recipes (Age, KYC, Continuity, etc.) |
| [ADOPTION_NOTES.md](ADOPTION_NOTES.md) | Cost, compliance, risk analysis |
| [SDK_ADOPTION_GUIDE.md](SDK_ADOPTION_GUIDE.md) | Adoption roadmap and FAQ |
| [10-MINUTE-TEST.md](10-MINUTE-TEST.md) | End-to-end test checklist |
| [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) | Deployment guide |

---

## Use Cases

### Good Fit
- Age verification (beer, gambling, restricted content)
- KYC-level gating (fraud limits, high-risk activity)
- Session continuity (same user, different sessions)
- Revocation-required access (prevent account takeover)
- Zero PII compliance requirement

### Not a Good Fit
- Document verification (passport, driver's license)
- Full identity recovery
- Identity linking across services
- Account recovery after wallet loss
- Real-time credential updates (outside revocation)

---

## Cost & Scope

**Typical Year 1**: $5-20K (self-hosted)  
vs. $51-115K (traditional KYC)

**Important**: Cost estimates assume typical volumes (1K-100K verifications/year). See [ADOPTION_NOTES.md](ADOPTION_NOTES.md) for detailed breakdown and caveats.

---

## Production Readiness

Protocol and reference implementation are **stable and spec'd**. Production deployment requires:

- [ ] HTTPS enforcement on all callbacks
- [ ] Revocation check on every verification
- [ ] Nonce validation (SDK handles; verify in your code)
- [ ] Audit logging (no PII)
- [ ] Request storage (max 10 minutes TTL)
- [ ] Monitoring + alerting (latency, failures, revocations)
- [ ] Incident runbook

**See [ADOPTERS.md#production-hardening-checklist](ADOPTERS.md#production-hardening-checklist) for full list.**

---

## What to Read First

1. **Protocol overview**: This page (5 min read)
2. **Guarantees & non-goals**: [ADOPTERS.md](ADOPTERS.md) (20 min)
3. **Code examples**: [recipes.md](packages/verifier-sdk/docs/recipes.md) (15 min)
4. **Risk & compliance**: [ADOPTION_NOTES.md](ADOPTION_NOTES.md) (20 min)
5. **Full spec**: [SDK README](packages/verifier-sdk/README.md) (30 min)

---

## Design Philosophy

- **Boring, not flashy**: Explicit guarantees, no hype
- **Invariant-based**: Claims are cryptographic properties, not policy
- **User-controlled**: Revocation authority rests with user, not verifier
- **Privacy-first**: No PII collection, minimal data disclosure
- **Auditable**: Open source, math-backed, no black boxes

---

## Known Trade-Offs

- **Wallet loss** = credential loss (user-controlled, no recovery)
- **Offline** = limited (wallet can generate proofs offline; verifier always needs registry)
- **Credential expiry** = no extension (time-bound by design)
- **Cross-service linking** = impossible (pairwise IDs by design)

See [ADOPTERS.md#known-failure-modes](ADOPTERS.md#known-failure-modes--trade-offs) for detailed list.

---

**Next: Pick your path above. Start with [ADOPTERS.md](ADOPTERS.md) if you want the full picture.**
