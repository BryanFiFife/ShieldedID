# Shielded ID Registry Server

Privacy-first registry server for wallet key registration, key rotation, revocation tracking, and status checks. The server stores no PII and requires ECDSA P-256 signatures for sensitive operations.

## Requirements
- Node.js 20+
- SQLite (embedded via `better-sqlite3`)

## Environment
- `DATABASE_URL` (default: `./data/registry.db`)
- `RATE_LIMIT_REDIS_URL` (optional, not used in MVP)
- `PORT` (default: `3000`)
- `ALLOWED_ORIGINS` (optional CSV for CORS)

## Run locally
```bash
cd apps/registry-server
npm install
npm run dev
```

## Docker
```bash
cd apps/registry-server
docker compose up --build
```

## Signature payloads
Signatures are computed over a canonical JSON string with sorted keys. The server includes an `action` field in the payload that is **not** sent in the request body.

Actions and payloads:
- `WALLET_REGISTER`
- `WALLET_ADD_KEY`
- `WALLET_REVOKE`
- `WALLET_BACKUP`

## Endpoints
Swagger UI: `GET /docs`

### POST /v1/wallet/register
```bash
curl -X POST http://localhost:3000/v1/wallet/register \
  -H "content-type: application/json" \
  -d '{
    "publicKeys": {"signing": {"kty":"EC","crv":"P-256","x":"...","y":"..."}},
    "webauthnCredentialId": "YmFzZTY0LWNyZWQ=",
    "suiteVersion": "1.0",
    "signature": "BASE64_DER_SIGNATURE"
  }'
```

### POST /v1/wallet/:walletId/keys
```bash
curl -X POST http://localhost:3000/v1/wallet/UUID/keys \
  -H "content-type: application/json" \
  -d '{
    "keyType": "DEVICE",
    "publicKey": {"kty":"EC","crv":"P-256","x":"...","y":"..."},
    "suiteVersion": "1.0",
    "signature": "BASE64_DER_SIGNATURE",
    "replaceKeyId": "UUID"
  }'
```

### GET /v1/status/:walletId
```bash
curl http://localhost:3000/v1/status/UUID
```

### POST /v1/revoke
```bash
curl -X POST http://localhost:3000/v1/revoke \
  -H "content-type: application/json" \
  -d '{
    "walletId": "UUID",
    "targetType": "KEY",
    "targetIds": ["UUID"],
    "reason": "COMPROMISED",
    "signature": "BASE64_DER_SIGNATURE"
  }'
```

### POST /v1/backup
```bash
curl -X POST http://localhost:3000/v1/backup \
  -H "content-type: application/json" \
  -d '{
    "walletId": "UUID",
    "ciphertext": "BASE64_PAYLOAD",
    "algorithm": "AES-256-GCM",
    "signature": "BASE64_DER_SIGNATURE"
  }'
```
