# Shielded ID Wallet PWA

Offline-first wallet for SHIELDED ID. Encrypts user documents locally, generates proof responses, and never transmits raw identity data.

## Features
- AES-256-GCM vault encryption with Argon2id KDF
- WebAuthn passkey + software ECDSA fallback
- Pairwise subject IDs (HMAC-SHA256)
- Merkle commitments for attributes
- QR scanning for proof requests
- **Zero-Knowledge Proofs**: Real Bulletproofs via local ZK agent
- Safety modes (decoy + panic wipe)
- Offline support with service worker

## Zero-Knowledge Agent Integration

The wallet integrates with a local ZK agent for enhanced privacy:

### Automatic Detection
- Wallet automatically detects if ZK agent is running on `localhost:3030`
- Shows clear status indicators in proof flow and settings
- Falls back to signed predicates when agent unavailable

### Enhanced Privacy
- **Real ZK Proofs**: Uses audited Bulletproofs cryptography instead of signed predicates
- **No Value Leakage**: Age and KYC levels proven without revealing actual values
- **Context Binding**: Proofs bound to verifier origin, nonce, and expiry

### Installation
For enhanced privacy, install the ZK agent:
```bash
# Download from: https://github.com/shielded-id/zk-agent
cd zk-agent
cargo build --release
./target/release/zk-agent
```

## Development
```bash
cd apps/wallet-pwa
npm install
npm run dev
```

## Tests
```bash
npm test
```

## Environment
- `VITE_REGISTRY_URL` (optional) registry endpoint for wallet registration

## Notes
- OCR requires MediaPipe assets and model files under `/public/models`.
- No PII is persisted outside the encrypted vault.
- Service worker caches shell assets for offline use.
- ZK agent provides cryptographic soundness without degrading UX
