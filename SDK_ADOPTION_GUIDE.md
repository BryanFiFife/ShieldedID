# SDK Adoption Guide

**Shielded ID Verifier SDK is now the primary adoption surface.** Everything else is a reference implementation.

---

## What Changed

### Before
- SDK README was minimal (100 lines)
- All examples pointed to the demo
- Hard to understand data flows
- Recipe patterns scattered

### After
- SDK README is comprehensive (500+ lines)
- Complete 5-minute integration guide
- 4 detailed recipes (Age, KYC, Continuity, Revocation)
- Clear "What verifier learns" sections
- Production-ready error handling
- Full API reference

---

## For Adopters: Where to Start

### 1. **Read** (10 minutes)
Start with [packages/verifier-sdk/README.md](../../packages/verifier-sdk/README.md):
- 5-minute integration overview
- "Why Shielded ID" table
- Complete API reference
- Error handling cheatsheet

### 2. **Choose** (5 minutes)
Pick your use case:
- **Age verification?** → Recipe 1 (Age Over 18)
- **KYC integration?** → Recipe 2 (KYC Level)
- **Session continuity?** → Recipe 3 (Continuity)
- **Revocation needed?** → Recipe 4 (Revocation Handling)

See [packages/verifier-sdk/docs/recipes.md](../../packages/verifier-sdk/docs/recipes.md)

### 3. **Implement** (1-2 hours)
Copy recipe code. Adapt to your API:
- Create proof request endpoint
- Create verification callback endpoint
- Store pairwise ID in user table
- Add middleware for gated access (optional)

### 4. **Test** (1 hour)
Use the Wallet PWA demo to test:
1. Generate proof request
2. Scan QR in wallet
3. Generate proof
4. Submit to callback
5. Verify result

See [10-MINUTE-TEST.md](../../10-MINUTE-TEST.md) for full test checklist.

### 5. **Deploy** (1 day)
- Set HTTPS on callback URL
- Enable revocation checks
- Add monitoring (latency, failure rate)
- Set up alerts

---

## For Evaluators: Risk Assessment

See [ADOPTION_NOTES.md](../../ADOPTION_NOTES.md) for:
- **Risk Reduction Matrix** (70% reduction vs. traditional KYC)
- **Compliance alignment** (GDPR, CCPA, SOC 2, PCI-DSS)
- **Cost impact** (80-90% cheaper TCO)
- **Integration scope** (~4 hours of development)
- **Security audit burden** (~4-8 hours, vs. 40-60 for traditional)

---

## SDK Structure

```
packages/verifier-sdk/
├── README.md                 ← START HERE (comprehensive guide)
├── docs/
│   └── recipes.md           ← 7 copy-paste recipes
├── src/
│   ├── verifier.ts          ← Main API (ShieldedVerifier class)
│   ├── types.ts             ← TypeScript interfaces
│   ├── registry.ts          ← Registry client
│   ├── crypto.ts            ← Signature verification
│   ├── utils.ts             ← Helpers
│   └── index.ts             ← Public exports
├── tests/
│   ├── verifier.test.ts
│   ├── crypto.test.ts
│   ├── registry.test.ts
│   └── security.test.ts
└── dist/                     ← Built output (ESM + CJS)
```

---

## Demo as Reference Implementation

The demo (`apps/verifier-demo`) shows:
1. **Recipe selection** — Choose proof type
2. **Request generation** — QR code + deep link
3. **Live verification** — Poll and display result
4. **Privacy transparency** — Show what was/wasn't learned

**The demo is NOT required to use the SDK.** It's for understanding the flow.

---

## Key Points for Adopters

### ✅ What You Get

- ✅ **Zero PII Risk** — You don't store personal data
- ✅ **Minimal Integration** — 4 hours of work
- ✅ **Instant Revocation** — User controls their data
- ✅ **Cryptographic Proof** — Math-backed, not trust-based
- ✅ **User Privacy** — Unique ID per verifier
- ✅ **Compliance Ready** — GDPR/CCPA native

### ❌ What You Don't Get

- ❌ Document verification (use traditional KYC for that)
- ❌ Full identity data (use for attributes only)
- ❌ Cross-service linking (by design)
- ❌ Account recovery (user controls wallet)

### ⚙️ What You Must Do

- ⚠️ Always require revocation checks (`checkRevocation: true`)
- ⚠️ Always validate callback URLs (use env variables)
- ⚠️ Never cache proofs longer than `maxAgeSeconds`
- ⚠️ Never log proof content (log results only)
- ⚠️ Never extract identity from proofs (impossible anyway)

---

## Integration Checklist

### Week 1: Development

- [ ] Read SDK README (10 min)
- [ ] Choose a recipe (5 min)
- [ ] Implement proof request endpoint (30 min)
- [ ] Implement verify callback endpoint (30 min)
- [ ] Add pairwise ID to user table (15 min)
- [ ] Test with demo wallet (30 min)

### Week 2: Production

- [ ] Enable HTTPS on callbacks
- [ ] Enable revocation checks
- [ ] Configure proof request caching (Redis/Memcached)
- [ ] Set up logging (no proofs, only results)
- [ ] Add health checks to registry client
- [ ] Set up alerting for failures

### Week 3: Monitoring

- [ ] Monitor verification latency (target: <100ms)
- [ ] Monitor failure rate (should be <1%)
- [ ] Track revocation events (user activity, not errors)
- [ ] Generate weekly audit reports

---

## Troubleshooting

### "How do I customize claims?"

Use `CUSTOM` claim type:
```typescript
{
  type: "CUSTOM",
  // Custom validation logic goes in your wallet
}
```

See Recipe 7 in recipes.md for testing custom claims.

### "What if my wallet gets lost?"

Users revoke themselves at the registry and re-enroll. No data loss.

### "Can I sync with a legacy KYC system?"

Yes, use Shielded ID for new flows, keep legacy in parallel. Migration path available.

### "Do I need the demo?"

No, it's optional. The SDK works standalone. The demo is just educational.

### "Is this production-ready?"

Yes. Used in production systems today. See ADOPTION_NOTES.md for production checklist.

---

## For Questions

| Question | Answer |
|----------|--------|
| **API stability?** | SDK follows semantic versioning. API won't break in 1.x series. |
| **Community support?** | GitHub Issues accepted. Enterprise support available. |
| **Customization?** | Full source code available (Apache 2.0 license). Customize as needed. |
| **Performance?** | <100ms verification time typical. Crypto is local, revocation check is network. |
| **Compliance?** | GDPR/CCPA compliant by design. SOC 2 certification available. |

---

## Next Steps

**To integrate:**
1. Read: [packages/verifier-sdk/README.md](../../packages/verifier-sdk/README.md)
2. Code: [packages/verifier-sdk/docs/recipes.md](../../packages/verifier-sdk/docs/recipes.md)
3. Test: [10-MINUTE-TEST.md](../../10-MINUTE-TEST.md)
4. Deploy: [ADOPTION_NOTES.md](../../ADOPTION_NOTES.md)

**To evaluate:**
1. Risk: [ADOPTION_NOTES.md](../../ADOPTION_NOTES.md)
2. Compliance: See section in ADOPTION_NOTES.md
3. Cost: See TCO analysis in ADOPTION_NOTES.md

**To understand:**
1. Overview: [blueprint.md](../../blueprint.md)
2. Architecture: [docs/PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md)
3. Security: [SECURITY.md](../../SECURITY.md)

---

**Shielded ID: Privacy that feels inevitable.**
