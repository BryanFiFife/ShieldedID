# Shielded ID Wallet User Guide

**Status**: Fully Functional  
**Version**: 1.0  
**Last Updated**: January 2026

---

## Quick Start

### First Time Setup (New User)

1. **Open the Wallet**: Navigate to `http://localhost:5174` (or your configured wallet URL)
2. **See Enrollment Screen**: The wallet will automatically detect you're new and show the enrollment flow
3. **Set Your Passphrase**: 
   - Choose a strong passphrase (12-20 characters)
   - Confirm the passphrase
   - ⚠️ **Save this passphrase - wallet loss = credential loss (by design)**
4. **Capture Document**:
   - Allow camera access
   - Click "Capture + OCR" to scan your document (ID, passport, etc.)
   - The system will automatically extract: name, DOB, document type, issuer, dates
   - Confirm or edit each field
5. **Complete Registration**:
   - Click "Complete Enrollment"
   - Your wallet is now created and unlocked
   - Your signing keys are generated and registered with the registry

### Returning Users (Unlock Existing Wallet)

1. **Open the Wallet**: Navigate to `http://localhost:5174`
2. **See Unlock Screen**: If you have an existing vault, you'll be prompted to unlock
3. **Enter Passphrase**: Type the passphrase you set during enrollment
4. **Access Your Wallet**: Upon successful unlock, you'll see the main dashboard

---

## Dashboard Navigation

Once unlocked, you'll see the main wallet interface with these buttons:

| Button | Purpose | Features |
|--------|---------|----------|
| **Enroll** | Add or re-enroll credentials | Capture documents, set passphrases |
| **Proof** | Create zero-knowledge proofs | Scan verifier QR codes, submit proofs |
| **Companion** | Chat with integrated LLM | Ask questions, get guidance, upload documents for OCR |
| **Settings** | Wallet controls | Lock vault, view audit log, recovery options |

---

## Feature Walkthrough

### 1. Enroll (Add/Update Credentials)

**Purpose**: Store claims (age, identity, continuity) in your wallet

**Steps**:
1. Click **Enroll** button
2. Set a vault passphrase (12-20 chars, min complexity)
3. Capture your document with camera:
   - Position document in frame
   - Click "Capture + OCR"
   - Wait for extraction
4. Verify extracted fields:
   - Given Name
   - Family Name
   - Date of Birth
   - Document Type
   - Issuer
   - Issued Date
   - Expiry Date
5. Click "Complete Enrollment"

**Under the Hood**:
- Your document data is **never sent to servers**
- Cryptographic commitments are created for each claim (age, name, etc.)
- Keys are generated locally and stored encrypted in browser
- A pairwise ID is created for each service you prove to

---

### 2. Proof (Create and Submit Proofs)

**Purpose**: Generate zero-knowledge proofs to prove claims to services

**Steps**:
1. Click **Proof** button
2. **Scan QR Code**:
   - Service (verifier) shows you a `shielded-id://` QR code
   - Click "Scan" and allow camera access
   - Point camera at QR code
   - Wallet automatically parses the verification request
3. **Preview Request**:
   - See what claims are being requested (e.g., "age > 18")
   - See the service URL
4. **Confirm Claims**:
   - Select which claims to prove
   - All claims are **optional** - you can choose not to prove something
5. **Submit Proof**:
   - Wallet generates cryptographic proof
   - Proof is sent to service's callback endpoint
6. **View Receipt**:
   - See confirmation that service received your proof
   - A consent receipt is saved in your audit log

**Privacy Properties**:
- ✅ Service never sees your name or identity
- ✅ Service cannot link your proofs across different services
- ✅ Only requested claims are revealed (e.g., "over 18", not exact age)
- ✅ No data is stored on any server after proof

---

### 3. Companion (LLM Integration)

**Purpose**: Chat with an integrated AI assistant for guidance and document processing

**Features**:

#### Chat Interface
- Text chat with AI companion
- Local processing (no data sent outside your device)
- Two modes:
  - **Rules Mode**: Basic rule-based responses (privacy-first)
  - **LLM Mode**: Full LLM integration (if configured)

#### Commands & Interactions
- "Tell me about Shielded ID" → Get protocol explanation
- "How do I prove my age?" → Get step-by-step instructions
- "My name is John and I live in NYC" → Companion learns your profile
- "What claims have I shared?" → View your audit log

#### Document OCR
1. Click "Upload an image for OCR"
2. Select an image (photo of ID, driver's license, etc.)
3. Companion extracts text and stores in chat history
4. Ask questions about extracted data

#### Example Conversation
```
You: "How does the proof work?"
Companion: "When you create a proof, your wallet generates a 
cryptographic commitment to your claims. The verifier can check 
this commitment is valid without seeing your actual data. It's 
like proving you're over 18 without showing your birthday."

You: "Can the service track me across other sites?"
Companion: "No. Each service gets a unique ID from your wallet. 
The same user on different services appears as different people. 
This prevents tracking and correlation attacks."
```

---

### 4. Settings (Vault Controls & Audit Log)

**Purpose**: Manage your wallet and view your privacy audit

**Features**:

#### Lock Vault
- Click "Lock Vault" to lock without closing the app
- Requires passphrase to unlock again

#### Consent History
- View complete audit log of all proofs you've generated
- See which services requested what claims
- Export audit log (without PII) for compliance

#### Safety Mode
- **Decoy Wallet**: Create a fake wallet to show if wallet is stolen
- **Panic Wipe**: Instantly delete all wallet data
- Safety mode is **enabled by default**

#### Recovery Options
- Passphrase recovery procedures
- No social recovery (intentional - your wallet is your identity)

---

## Privacy & Security

### What's Stored Locally (On Your Device)

✅ **Encrypted in browser storage**:
- Your document data (name, DOB, etc.)
- Cryptographic keys (signing keys, encryption keys)
- Chat history with companion
- Audit log of proofs

❌ **NOT stored anywhere**:
- Raw credential data is never sent to servers
- Proofs are generated locally, then sent only once to the service requesting them
- No server maintains copies of your proofs

### Key Security Properties

| Property | Guarantee | How It Works |
|----------|-----------|-------------|
| **No Identity Disclosure** | Service never sees your name | Proofs only reveal requested claims (e.g., "age > 18") |
| **No Cross-Service Tracking** | Can't link you across services | Each service gets unique pairwise ID from your wallet |
| **Non-Replay** | Proof can't be reused | Nonce + timestamp + verifier origin binding in proof |
| **Revocation Control** | You control when credentials expire | You can revoke directly in Settings |
| **Offline-First** | Works without internet | Wallet generates proofs offline; only needs net to submit |

### Wallet Loss = Credential Loss

⚠️ **This is intentional**:
- No backup or recovery (by design)
- Losing your device = losing credentials
- Users must re-enroll to get new credentials
- **Upside**: No one can take over your wallet (no account takeover)

---

## Common Scenarios

### Scenario 1: Prove Age to Website

```
1. Visit website that requires age verification
2. Click "Verify with Shielded ID"
   → Website shows QR code with proof request
3. Open Shielded ID wallet app
4. Click Proof → Scan QR code
5. Wallet shows: "Service X wants to know: age > 18"
6. Click Confirm
7. Wallet generates proof (showing you're over 18 without revealing exact age)
8. Website receives proof, confirms verification
9. You access age-restricted content ✓
```

**Privacy**: Website never sees your name, DOB, or any PII

---

### Scenario 2: Share KYC Status with Financial App

```
1. Open financial app
2. App asks: "Verify you're KYC level 2"
3. Scan app's QR code in wallet
4. Wallet shows: "Service Y wants: KYC level 2"
5. You confirm
6. Proof generated and sent
7. App unlocks feature access ✓
```

**Privacy**: App only sees "KYC level 2", not your identity, address, or documents

---

### Scenario 3: Get Help from Companion

```
1. Click Companion button
2. Ask: "How do I verify with a service?"
3. Companion explains proof flow step-by-step
4. Upload photo of your ID for OCR
5. Companion extracts text
6. Ask follow-up questions about your data
```

**Privacy**: All processing happens on your device

---

## Troubleshooting

### "Blank White Page on Startup"
**Solution**: 
- Refresh the page (Ctrl+R or Cmd+R)
- Clear browser cache if issue persists
- Check browser console for errors (F12 → Console)

### "Passphrase Wrong When Unlocking"
**Problem**: You entered an incorrect passphrase
**Solution**:
- Passphrase is case-sensitive
- Try again with correct capitalization
- If still stuck: Your vault data is lost (wallet loss = data loss, by design)

### "Camera Not Working for Document Capture"
**Solution**:
- Allow camera permissions when prompted
- Check browser permissions (Settings → Privacy → Camera)
- Use an HTTPS connection (required for camera access)
- Try different browser if issue persists

### "QR Code Won't Scan"
**Solution**:
- Ensure good lighting
- Keep QR code steady in frame
- Move closer/further to focus camera
- Check that code is `shielded-id://` scheme (not regular http QR)

### "Companion Says 'Initializing...'"
**Solution**:
- Wait 2-3 seconds for LLM to load
- Check browser console for errors
- Companion works offline with rules mode if LLM unavailable

### "Proof Submission Failed"
**Problem**: Verifier returned error
**Solution**:
- Check that you're connected to internet
- Ensure verifier URL is correct and accessible
- Verify the verifier is running (`http://localhost:5174` for demo)
- Check proof request expiry (proofs expire after verifier-specified maxAge)

---

## Advanced Features

### Offline Mode

The wallet works offline for most operations:

| Operation | Offline | Requires Internet |
|-----------|---------|-------------------|
| Create enrollment | ✅ | ✅ (to register with registry) |
| Generate proof | ✅ | ❌ No |
| Submit proof | ❌ | ✅ Yes (to verifier) |
| Chat with companion | ✅ | ❌ (rules mode); ✅ (LLM mode) |
| Manage vault | ✅ | ❌ No |

---

### Consent Audit Log

Every proof you create is recorded:

```json
{
  "verifierOrigin": "https://example.com",
  "claims": ["age", "kycLevel", "continuity"],
  "timestamp": "2026-01-07T12:00:00Z"
}
```

**Use Cases**:
- Privacy audit: See all services you've proven to
- Compliance: Export for GDPR/CCPA audits
- Revocation: See which services have your proofs

---

### Decoy Wallet (Safety Mode)

For coercive scenarios (border crossing, police, etc.):

1. During setup or in Settings, create a decoy wallet with PIN
2. If forced to open wallet, use decoy PIN
3. Decoy wallet opens instead of real vault
4. Decoy contains fake, non-sensitive data
5. Real wallet data stays encrypted

---

## Support & Documentation

- **User Guide**: This document
- **Protocol Spec**: [ADOPTERS.md](ADOPTERS.md) - For integration partners
- **FAQ**: [START_HERE.md](START_HERE.md) - Quick overview
- **SDK Integration**: [README.md](packages/verifier-sdk/README.md) - For developers building verifiers

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 7, 2026 | Initial release: enrollment, proof, companion, settings |

---

## Legal & Terms

**Use Case Suitability**:
- ✅ Age verification (18+, 21+)
- ✅ KYC level gating (AML/CFT)
- ✅ Account continuity verification
- ✅ Privacy-first identity verification

**Not Suitable For**:
- ❌ Government ID verification (passports, driver's licenses)
- ❌ Full identity recovery ("What is user's legal name?")
- ❌ Account recovery ("User forgot password")
- ❌ Cross-service user linking ("Track user across services")

---

**Created**: January 2026  
**License**: Apache 2.0
