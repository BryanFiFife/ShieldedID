# ZK Agent

A native local ZK proof agent using real Bulletproofs range proofs for age and assurance verification.

## Overview

This agent provides zero-knowledge proofs for range verification (e.g., proving that an age is >= 18 without revealing the actual age). It uses audited Bulletproofs cryptography with proper context binding and domain separation.

## Features

- **Real Bulletproofs**: Uses the audited bulletproofs crate (v4.0) with Pedersen commitments on Ristretto255 curve
- **Context Binding**: Injects suite ID, verifier origin, nonce, and expiry into the Merlin transcript
- **Local Security**: Only accepts requests from localhost (127.0.0.1)
- **Base64url Encoding**: All outputs are URL-safe base64 encoded without padding
- **HTTP API**: Simple REST API for proof generation

## API Endpoints

### POST /prove/age

Generates a zero-knowledge proof that `value >= min` for age verification.

**Request Body:**
```json
{
  "value": 25,
  "min": 18,
  "suite": "AGE_ZK_BULLETPROOFS_V1",
  "verifier_origin": "https://verifier.example.com",
  "nonce": "abc123",
  "expiry": "2024-12-31T23:59:59Z"
}
```

### POST /prove/assurance

Generates a zero-knowledge proof that `value >= min` for assurance/KYC verification.

**Request Body:**
```json
{
  "value": 1,
  "min": 1,
  "suite": "KYC_ZK_BULLETPROOFS_V1",
  "verifier_origin": "https://verifier.example.com",
  "nonce": "def456",
  "expiry": "2024-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "proof_bundle": {
    "commitment": "base64url-encoded-commitment",
    "proof": "base64url-encoded-proof",
    "public_inputs": "base64url-encoded-public-inputs"
  },
  "error": null
}
```

## Building and Running

### Prerequisites

- Rust 1.70+
- Cargo

### Build

```bash
cargo build --release
```

### Run

```bash
./target/release/zk-agent
```

The server will start on `http://localhost:3030`.

### Test

```bash
cargo test
```

## Cryptographic Details

- **Proof System**: Bulletproofs range proofs
- **Curve**: Ristretto255
- **Transcript**: Merlin with domain separation (`shielded-id-transcript-v1`)
- **Context Binding**: Suite ID, verifier origin, nonce, and expiry are bound into the proof
- **Serialization**: Base64url encoding (RFC 4648)

## Security Considerations

- Only accepts connections from localhost
- Uses cryptographically secure random blinding factors
- Domain-separated transcripts prevent cross-protocol attacks
- All proofs are verified internally before returning

## Testing

Run the included test script:

```powershell
powershell -ExecutionPolicy Bypass -File test_api.ps1
```

This will start the server, test both age and assurance proof generation, and stop the server.