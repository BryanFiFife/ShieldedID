# 10-Minute Standard Test Checklist

**Use this checklist to verify Shielded ID is working end-to-end in under 10 minutes.**

This test demonstrates:
- Issue (register public key)
- Store (wallet creates vault)
- Prove (generate zero-knowledge proof)
- Verify (verifier checks proof)
- Revoke (mark credential invalid)
- Fail (verification rejects revoked credential)

---

## Prerequisite (1 minute)

- [ ] Ran: `pnpm install` from repository root
- [ ] Ran: `pnpm dev` from repository root
- [ ] Wait for all 4 services to start (see QUICKSTART.md for what to look for)
- [ ] All services started? (Registry 3000, Wallet 5173, Verifier 5174, Backend 5050)

---

## Phase 1: Setup & Register (2 minutes)

**Open 3 browser tabs:**
- Tab 1: **Wallet** → http://localhost:5173
- Tab 2: **Admin** → http://localhost:3000/admin
- Tab 3: **Verifier** → http://localhost:5174

**Tab 1 (Wallet):**

- [ ] Page loads without errors
- [ ] Click "Create Vault"
- [ ] Enter passphrase: `TestPass123!`
- [ ] Click "Enroll"
- [ ] See message: "Vault created successfully"
- [ ] Copy your **Wallet ID** (shown on screen) — **save this!**
- [ ] Click "Register Key"
- [ ] Click "Register with Registry"
- [ ] See: "✅ Key registered!"
- [ ] Status shows: **ACTIVE**

---

## Phase 2: Generate Proof (2 minutes)

**Tab 1 (Wallet) - still here:**

- [ ] Click "Generate Proof"
- [ ] Select proof type: "Age Over 18" (or equivalent)
- [ ] Click "Generate"
- [ ] See a cryptographic proof (base64 string or QR code)
- [ ] Copy the **proof data** or note the QR code

**Key Question: What information is in this proof?**
- ✅ Zero-knowledge signature (proof of claim)
- ❌ NOT your age, NOT your name, NOT your wallet secret
- ✅ Can be verified on the registry using your public key

---

## Phase 3: Verify Proof (1 minute)

**Tab 3 (Verifier):**

- [ ] Page loads without errors
- [ ] Click "Age Verification" (or equivalent proof type)
- [ ] Click "Generate Request" or "Create Proof Request"
- [ ] See a **Request ID** and **QR code**
- [ ] Copy the **Request ID** — **save this!**

**Tab 1 (Wallet) - switch back:**

- [ ] Click "Submit to Verifier" or similar
- [ ] Paste the Request ID (or scan QR code)
- [ ] Click "Submit"
- [ ] See: "Submitted to verifier"

**Tab 3 (Verifier) - switch back:**

- [ ] Refresh the page (or wait for auto-update)
- [ ] See result: **✅ VERIFIED** (in GREEN)
- [ ] Click "View Session History"
- [ ] See your session with:
  - [ ] Status: `valid: true`
  - [ ] Pairwise Subject ID: (a long random ID)
  - [ ] Timestamp: (current time)
  - [ ] Claims: Age verified

**Key Question: What did the Verifier learn?**
- ✅ Verifier knows: "This session proved age 18+"
- ✅ Verifier knows: A unique pairwise ID for this person
- ❌ Verifier does NOT know: Your wallet ID, your name, your actual age
- ❌ Verifier does NOT know: Your public key
- ❌ Verifier does NOT know: Your real identity
- ⚠️ If you prove to a different verifier, you get a DIFFERENT pairwise ID (privacy feature)

---

## Phase 4: Revoke Credential (1 minute)

**Tab 2 (Admin):**

- [ ] Click "Revoke Wallet"
- [ ] Paste your **Wallet ID** (from Phase 1)
- [ ] Click "Revoke"
- [ ] See: "✅ Wallet revoked" or "Revocation complete"

**Tab 1 (Wallet):**

- [ ] Status changes to: **REVOKED** (or similar)

---

## Phase 5: Verify Fails After Revocation (1 minute)

**Tab 1 (Wallet):**

- [ ] Click "Generate Proof" again
- [ ] Select same proof type: "Age Over 18"
- [ ] Click "Generate"
- [ ] See a new proof (wallet still works locally)

**Tab 3 (Verifier):**

- [ ] Click "Generate Request" again (new request ID)
- [ ] Copy the new **Request ID** — **save this!**

**Tab 1 (Wallet):**

- [ ] Click "Submit to Verifier"
- [ ] Paste the NEW Request ID
- [ ] Click "Submit"

**Tab 3 (Verifier):**

- [ ] Refresh the page (or wait for auto-update)
- [ ] See result: **❌ VERIFICATION FAILED** (in RED or with error icon)
- [ ] Reason shown: `WALLET_REVOKED` or `REVOCATION_CHECK_FAILED` or similar
- [ ] Session history still shows: Previous successful verification (from Phase 3) AND current failed verification

**Key Insight:**
- ✅ Revocation is **immediate and verifiable**
- ✅ Revocation **doesn't delete history** (compliance audit trail)
- ✅ Verifier **actively checks** registry at verification time
- ✅ Even with a valid cryptographic signature, revoked wallets cannot verify

---

## Verification Summary

All 6 flows completed? ✅ **You've tested the entire system!**

| Flow | Action | Status | Evidence |
|------|--------|--------|----------|
| 1️⃣ **Issue** | Register public key with registry | ✅ | Key registered, wallet status ACTIVE |
| 2️⃣ **Store** | Wallet creates vault | ✅ | Vault created, passphrase secured |
| 3️⃣ **Prove** | Generate zero-knowledge proof | ✅ | Proof generated without revealing data |
| 4️⃣ **Verify** | Verifier checks proof + registry | ✅ | Result: ✅ VERIFIED (green) |
| 5️⃣ **Revoke** | Revoke wallet in registry | ✅ | Wallet status: REVOKED |
| 6️⃣ **Fail** | Verification rejects revoked proofs | ✅ | Result: ❌ VERIFICATION FAILED (red) |

---

## Health Checks (Optional - for debugging)

Run these from a new terminal to verify services:

```bash
# Registry Server
curl http://localhost:3000/health
# Expected: { "ok": true, "service": "registry-server" }

# Verifier Backend
curl http://localhost:5050/health
# Expected: { "ok": true, "service": "verifier-backend" }

# Verifier Status
curl http://localhost:5050/api/status
# Expected: { "ok": true, "endpoints": [...] }
```

---

## Zero-Knowledge Proof: What the Verifier Learned

### ✅ Verifier Learned:
1. You have a registered wallet (public key is valid)
2. You proved a claim (age 18+) cryptographically
3. Your wallet is not revoked (at verification time)
4. You are a unique person (pairwise subject ID)
5. The proof was submitted at a specific time
6. The proof matches a specific proof request (no replay)

### ❌ Verifier Did NOT Learn:
1. Your real name
2. Your actual age
3. Your wallet ID
4. Your public key (signature verified it, but public key not exposed)
5. Any personal information
6. Your history of other verifications
7. Your identity at other verifiers (pairwise ID is unique per verifier)

### 🔐 Security Guarantees:
- **Revocation is mandatory** — Verifier checks registry every time
- **Proofs are non-transferable** — Can't be reused at different verifiers
- **Proofs are non-forwardable** — Different request ID = different proof needed
- **No PII stored** — Registry has only public keys and status
- **Wallet is offline-capable** — Proof generation doesn't require internet (registry only checked at verification)

---

## Next Steps

**After this test, you can:**

- **Explore code**: See [DOCUMENTATION_INDEX.md](../DOCUMENTATION_INDEX.md)
- **Run full test suite**: `pnpm test`
- **Check architecture**: See [blueprint.md](../blueprint.md)
- **Deploy to production**: See [PRODUCTION_HARDENING_REPORT.md](../PRODUCTION_HARDENING_REPORT.md)

---

## Troubleshooting This Test

### "Wallet page won't load"
- [ ] Is pnpm dev running? Check terminal
- [ ] Is port 5173 in use? Try: `lsof -i :5173`
- [ ] Refresh browser, clear cache

### "Cannot register key with registry"
- [ ] Is registry running? Try: `curl http://localhost:3000/health`
- [ ] Check browser console for errors
- [ ] Restart registry-server: `Ctrl+C`, then `pnpm dev`

### "Admin page shows login screen but credentials don't work"
- [ ] Email must be: `admin@example.com` (lowercase)
- [ ] Password is likely: `admin` or check terminal output
- [ ] Registry service restarted? Session lost. Log in again.

### "Verification shows FAILED instead of VERIFIED"
- [ ] Did you register the wallet? (Phase 1, step "Register Key")
- [ ] Did you use the correct Request ID? Copy exactly, no spaces.
- [ ] Is wallet REVOKED? (You should be testing Phase 5 if it is)

### "One service didn't start"
- [ ] Stop everything: `Ctrl+C`
- [ ] Run: `pnpm install`
- [ ] Run: `pnpm dev` again
- [ ] Check terminal for error messages

---

**Test complete! Your Shielded ID system is working end-to-end.** ✅
