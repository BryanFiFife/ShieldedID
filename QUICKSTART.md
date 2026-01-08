# 🚀 QUICKSTART: Shielded ID End-to-End

**Get the entire system running in under 10 minutes. One command. Zero decisions.**

---

## Prerequisites
- **Node.js** 18+ (check: `node --version`)
- **pnpm** 9.1+ (check: `pnpm --version`; install: `npm i -g pnpm@9.1.0`)
- **Git**

---

## Step 1: Clone & Install (2 minutes)

```bash
git clone <repo> ZKDigitalID
cd ZKDigitalID
pnpm install
```

**What this does:**
- Downloads code
- Installs all dependencies for all 3 apps
- Sets up monorepo workspace

---

## Step 2: Start Everything (1 command)

```bash
pnpm dev
```

**This starts all 4 services in parallel:**

| Service | URL | Port | Started? |
|---------|-----|------|----------|
| **Registry Server** | http://localhost:3000 | 3000 | ✓ Look for: `Fastify server listening` |
| **Wallet PWA** | http://localhost:5173 | 5173 | ✓ Look for: `Local: http://localhost:5173` |
| **Verifier Demo Frontend** | http://localhost:5174 | 5174 | ✓ Look for: `Local: http://localhost:5174` |
| **Verifier Backend** | http://localhost:5050 | 5050 | ✓ Look for: `✅ Verifier demo backend running` |

**If you see all 4, you're ready!** Press Ctrl+C to stop all services.

---

## Step 3: Health Check (1 minute)

Verify all services are responding:

```bash
# In a new terminal (leave pnpm dev running)
curl http://localhost:3000/health      # Registry
curl http://localhost:5050/health      # Verifier backend
```

**Expected response:**
```json
{ "ok": true, "service": "..." }
```

---

## Step 4: Run the 10-Minute Standard Test (6 minutes)

### The Proof Flow: Issue → Store → Prove → Verify → Revoke → Fail

Open **3 browser tabs:**

1. **Tab 1: Wallet PWA** — http://localhost:5173
2. **Tab 2: Registry Admin** — http://localhost:3000/admin
3. **Tab 3: Verifier Demo** — http://localhost:5174

---

### Flow 1: Issue & Store a Credential

**In Wallet Tab (http://localhost:5173):**

1. **Create Vault**
   - Click **"Create Vault"**
   - Enter passphrase: `TestPass123!` (or any 12+ char with mixed case + number + special)
   - Click **"Enroll"**
   - You should see: **"Vault created successfully"** and a wallet ID appears

2. **Register Public Key**
   - Click **"Register Key"**
   - Click **"Register with Registry"**
   - You should see: **"✅ Key registered!"**
   - This registered your wallet's public key with the registry (so proofs can be verified later)

3. **View Your Status**
   - Wallet shows your ID and status: **ACTIVE**
   - Note: No personal information is stored. Only your public key and a unique ID.

---

### Flow 2: Generate a Proof

**Still in Wallet Tab:**

1. Click **"Generate Proof"**
2. Select proof type: **"Age Over 18"**
3. Click **"Generate"**
4. You see the proof: A cryptographic commitment + signature
   - **What you've created**: A zero-knowledge proof that you *could* be 18+, **without revealing your actual age**

---

### Flow 3: Verify the Proof

**In Verifier Tab (http://localhost:5174):**

1. **Create Proof Request**
   - Click **"Age Verification"**
   - Click **"Generate Request"**
   - You see a proof request ID and **QR code**

2. **Submit Proof from Wallet**
   - Go back to **Wallet Tab**
   - Click **"Submit to Verifier"**
   - Paste the Request ID from Verifier tab, OR scan the QR code
   - Click **"Submit"**

3. **See the Result**
   - Go back to **Verifier Tab**
   - You should see: **✅ VERIFIED** (green, with checkmark)
   - Verifier learned: "This person proved age 18+" **but NOT who they are**
   - Proof includes: timestamp, request ID (prevents reuse)

---

### Flow 4: Check What the Verifier Learned

**In Verifier Tab:**

1. Click **"View Session History"**
2. You see the latest session:
   - **Verified**: true
   - **Pairwise Subject ID**: (a unique ID specific to this verifier, different per service)
   - **Verified At**: timestamp
   - **Claims**: Age verified

**KEY INSIGHT:**
- ✅ Verifier knows: "Person X proved age 18+"
- ❌ Verifier does NOT know: Your name, real age, wallet ID, or public key
- ✅ Even you (the wallet) don't know Verifier's identity (pairwise ID prevents deanonymization)

---

### Flow 5: Revoke the Credential

**In Registry Admin Tab (http://localhost:3000/admin):**

1. You should see **Admin Login**
   - **Email**: admin@example.com
   - **Password**: admin (or check console for default password)
2. Click **"Revoke Wallet"**
3. Paste your **Wallet ID** (from Wallet tab)
4. Click **"Revoke"**
5. You should see: **✅ Wallet revoked**

---

### Flow 6: Verify Fails After Revocation

**In Wallet Tab:**

1. Click **"Generate Proof"** again
2. Select **"Age Over 18"**
3. Click **"Generate"**

**In Verifier Tab:**

1. Create a new proof request
2. Submit the new proof from wallet
3. You should see: **❌ VERIFICATION FAILED** (red, with X)
   - Reason: **WALLET_REVOKED** or **REVOCATION_CHECK_FAILED**

**This proves:** The verifier **actually checks** revocation status on the registry.

---

## Summary: What Happened (Zero-Knowledge Explained)

| Action | What Happened | What Was Revealed |
|--------|---------------|-------------------|
| **Registered** | Public key sent to registry | Registry knows your public key (not your name) |
| **Generated Proof** | Cryptographic signature of claims | Only a mathematical proof, not the data |
| **Verified Proof** | Verifier checked signature + registry | Verifier: "Proof is valid". Does NOT know: your name, wallet ID, actual age |
| **Revoked** | Marked wallet as inactive in registry | Proof verification now fails, even with valid signature |
| **Verified Fails** | Revocation check prevents proof acceptance | Revocation status stored in registry, checked at verification time |

---

## Common Issues & Troubleshooting

### Problem: "Cannot connect to registry" in Wallet
- [ ] Check: Registry running? `curl http://localhost:3000/health`
- [ ] Check: Correct URL in Wallet? Should be `http://localhost:3000`
- [ ] Solution: Refresh browser, clear cache

### Problem: "Proof verification failed" in Verifier
- [ ] Check: Did you submit the proof to the *correct* proof request? IDs must match.
- [ ] Check: Is your wallet registered? Go to Wallet tab, click "Register Key"
- [ ] Check: Copy-paste request ID carefully (no extra spaces)

### Problem: "Admin login rejected"
- [ ] Check: Registry running? `curl http://localhost:3000/health`
- [ ] Check: Email is lowercase: `admin@example.com`
- [ ] Check: Password is default: `admin` (check console for auto-generated password)
- [ ] Solution: Restart registry-server, check logs

### Problem: One of the 4 services didn't start
- [ ] Check terminal output: does it show the service name with an error?
- [ ] Solution: Stop (`Ctrl+C`), run `pnpm install` again, then `pnpm dev`

### Problem: Port already in use (error: EADDRINUSE)
- [ ] Kill process: `lsof -ti:3000 | xargs kill -9` (Mac/Linux)
- [ ] Or: Change port in `.env` files and restart

---

## Environment Variables (Optional Customization)

All `.env.example` files are in the repo. For local development, defaults work fine.

**To customize:**

1. Copy `.env.example` to `.env` (or `.env.local` for Vite apps)
2. Edit values
3. Restart services: `Ctrl+C`, then `pnpm dev`

**Key variables:**
- `REGISTRY_URL`: Where verifier finds the registry (default: http://localhost:3000)
- `VERIFIER_ORIGIN`: Where verifier identifies itself (default: http://localhost:5174)
- `DATABASE_URL`: SQLite database for registry (default: /app/data/registry.db, auto-created)

---

## Next Steps

**For Developers:**
- Explore the codebase: [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)
- Run tests: `pnpm test`
- Type check: `pnpm type-check`

**For DevOps / Deployment:**
- Production docs: [PRODUCTION_HARDENING_REPORT.md](PRODUCTION_HARDENING_REPORT.md)
- Docker compose: [docker-compose.yml](docker-compose.yml)
- Helm / Kubernetes: Contact the team

**For Security Review:**
- Hardening report: [HARDENING_REPORT.md](HARDENING_REPORT.md)
- Code audit: [SECURITY.md](SECURITY.md)

---

## Architecture at a Glance

```
┌──────────────┐
│  Wallet PWA  │  (Your identity: vault, proof generation)
│  :5173       │
└──────┬───────┘
       │ register public key
       │ generate zero-knowledge proof
       v
┌──────────────────────┐
│  Registry Server     │  (Database: public keys, revocation status)
│  :3000 (API + UI)    │
│  SQLite: registry.db │
└──────┬───────────────┘
       ^ verify proof signature
       │
┌──────┴───────────────┐
│  Verifier Demo       │  (Frontend: proof request, result display)
│  :5174 (Vite)        │
│  :5050 (Express)     │
└──────────────────────┘
```

---

## Glossary

**Wallet**: Your vault storing a secret passphrase. Generates zero-knowledge proofs.

**Proof**: A cryptographic signature proving you meet a claim (e.g., "18+") *without revealing your actual age*.

**Registry**: A public database storing:
- Wallet public keys (not secrets)
- Wallet revocation status
- NOT: personal information, proofs, or secrets

**Verifier**: A service that:
- Receives proofs from wallets
- Checks signatures against the registry
- Learns: "Proof is valid" and a pairwise ID (unique per verifier)
- Does NOT learn: wallet ID, personal data, or actual values

**Pairwise ID**: A unique, pseudonymous identifier **per verifier**. The same person has different IDs at different verifiers (privacy-preserving).

**Revocation**: Invalidating a wallet's proofs without deleting history. Checked at verification time.

---

**Questions?** Check [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) or the `/docs` folder.

**Ready to deploy?** See [PRODUCTION_HARDENING_REPORT.md](PRODUCTION_HARDENING_REPORT.md) and [blueprint.md](blueprint.md).
