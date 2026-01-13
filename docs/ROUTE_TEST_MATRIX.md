# Route Test Matrix: Shielded ID

**Version:** 1.0  
**Last Updated:** 2026-01-13

## Test Environment

```bash
# Start all services
docker-compose up -d

# Services running:
Registry:      http://localhost:3000
Wallet PWA:    http://localhost:5173
Verifier Demo: http://localhost:5174 (frontend), http://localhost:5050 (backend)
```

---

## 1. Wallet Routes (`/v1/*`)

### `POST /v1/wallet/register`

| Test Case | Request | Expected Status | Expected Response | Notes |
|-----------|---------|-----------------|-------------------|-------|
| Happy path | Valid EC P-256 JWK | 200 | `ok: true, walletId: uuid` | Generates new wallet ID |
| Duplicate key | Same JWK submitted twice | 200 | `ok: true, walletId: <same>` | Idempotent (same ID) |
| Invalid JWK | Missing `kty` field | 400 | `ok: false, error: INVALID_REQUEST` | Schema validation |
| Malformed JSON | `{invalid json}` | 400 | Error response | JSON parse error |

**Command:**

```bash
curl -X POST http://localhost:3000/v1/wallet/register \
  -H "Content-Type: application/json" \
  -d '{
    "publicKeyJwk": {
      "kty": "EC",
      "crv": "P-256",
      "x": "WKn33HgSvzU8z8YkO0MgZWVDMq34aXYqorZjXIPAGmI",
      "y": "y77t-RvAHRKTsSGdIYUfweuOvwrvDD-Q3Hv5J0fSKcE"
    }
  }'
```

---

### `GET /v1/wallet/:id/keys`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Existing wallet | Valid wallet ID | 200 | `ok: true, keys: [...]` | Lists all keys |
| Non-existent wallet | Invalid UUID | 200 | `ok: false, error: WALLET_NOT_FOUND` | No 404 policy |
| Malformed ID | Not a UUID | 200 | `ok: false, error: WALLET_NOT_FOUND` | Graceful error |

**Command:**

```bash
# Replace WALLET_ID with from register test
curl http://localhost:3000/v1/wallet/WALLET_ID/keys
```

---

### `GET /v1/status/:walletId`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Active wallet | Valid ID | 200 | `ok: true, status: ACTIVE` | Real-time status |
| Revoked wallet | ID of revoked wallet | 200 | `ok: true, status: REVOKED` | Shows revocation |
| Unknown wallet | Random UUID | 200 | `ok: false, error: WALLET_NOT_FOUND` | No 404 |

**Command:**

```bash
curl http://localhost:3000/v1/status/WALLET_ID
```

---

### `POST /v1/revoke`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid revocation | Signed with key | 200 | `ok: true, revocationId: uuid` | Requires valid signature |
| Invalid signature | Wrong key signature | 200 | `ok: false, error: INVALID_SIGNATURE` | Signature verification fails |
| Unknown key | Non-existent keyId | 200 | `ok: false, error: KEY_NOT_FOUND` | Graceful error |

**Command:**

```bash
curl -X POST http://localhost:3000/v1/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "KEY",
    "targetId": "key-uuid",
    "reasonCode": "KEY_COMPROMISE",
    "signature": "base64-encoded-signature"
  }'
```

---

### `POST /v1/backup`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid backup | Wallet ID + ciphertext | 200 | `ok: true, backupId: uuid` | Stores encrypted data |
| Invalid algorithm | Non-AES-256-GCM | 200 | `ok: false, error: INVALID_ALGORITHM` | Only AES-256-GCM accepted |
| Missing wallet ID | No wallet ID | 400 | `ok: false, error: INVALID_REQUEST` | Schema validation |

**Command:**

```bash
curl -X POST http://localhost:3000/v1/backup \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "WALLET_ID",
    "ciphertext": "hex-encoded-ciphertext",
    "algorithm": "AES-256-GCM"
  }'
```

---

## 2. Admin Routes (`/api/admin/*`)

### `POST /api/admin/login`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid credentials | Correct email + password | 200 | `ok: true, email: ...` | Sets HTTPOnly cookie |
| Wrong password | Correct email, wrong password | 200 | `ok: false, error: INVALID_CREDENTIALS` | No timing leak |
| Non-existent email | Non-registered email | 200 | `ok: false, error: INVALID_CREDENTIALS` | Same error as wrong password |
| Weak password | Only 6 chars | 400 | `ok: false, error: PASSWORD_MIN_12_CHARS` | Client validation |
| Rate limit | 101 login attempts/min | 429 | `ok: false, error: TOO_MANY_REQUESTS` | 100 per minute limit |

**Command:**

```bash
# First, seed an admin (one-time)
docker-compose exec registry-server npm run seed:admin -- admin@test.com TestPass123!

# Then login
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "admin@test.com",
    "password": "TestPass123!"
  }'
```

---

### `POST /api/admin/logout`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid session | Logged-in user | 200 | `ok: true` | Cookie cleared |
| No session | No cookie | 200 | `ok: true` | Idempotent |

**Command:**

```bash
curl -X POST http://localhost:3000/api/admin/logout \
  -b cookies.txt
```

---

### `GET /api/admin/session`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Logged in | Valid session | 200 | `ok: true, email: ...` | Session active |
| Logged out | No session | 200 | `ok: false, email: null` | No error, just false |
| Expired | Old cookie > 24h | 200 | `ok: false` | Session expires after 24h |

**Command:**

```bash
curl http://localhost:3000/api/admin/session -b cookies.txt
```

---

### `GET /api/admin/inbox`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Logged in | Valid session | 200 | `ok: true, messages: [...]` | Lists all messages |
| Not logged in | No session | 200 | `ok: false, error: UNAUTHORIZED` | Requires auth |

**Command:**

```bash
curl http://localhost:3000/api/admin/inbox -b cookies.txt
```

---

### `GET /api/admin/messages/:id`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Existing message | Valid ID | 200 | `ok: true, message: {...}` | Shows full message |
| Non-existent ID | Random UUID | 200 | `ok: false, error: NOT_FOUND` | No 404 |
| Not authenticated | No session | 200 | `ok: false, error: UNAUTHORIZED` | Requires auth |

**Command:**

```bash
curl http://localhost:3000/api/admin/messages/MESSAGE_ID -b cookies.txt
```

---

### `POST /api/admin/messages/:id/status`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Update to READ | Valid status | 200 | `ok: true` | Marks read |
| Invalid status | Status not in list | 200 | May succeed (validation loose) | Consider stricter validation |
| Not authenticated | No session | 200 | `ok: false, error: UNAUTHORIZED` | Requires auth |

**Command:**

```bash
curl -X POST http://localhost:3000/api/admin/messages/MESSAGE_ID/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{ "status": "READ" }'
```

---

### `GET /api/admin/audit`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Logged in | Valid session | 200 | `ok: true, events: [...]` | Last 100 events |
| Not logged in | No session | 200 | `ok: false, error: UNAUTHORIZED` | Requires auth |

**Command:**

```bash
curl http://localhost:3000/api/admin/audit -b cookies.txt | jq '.events | length'
```

---

### `GET /api/admin/revocations`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Logged in | Valid session | 200 | `ok: true, revocations: [...]` | Last 50 revocations |
| Not logged in | No session | 200 | `ok: false, error: UNAUTHORIZED` | Requires auth |

**Command:**

```bash
curl http://localhost:3000/api/admin/revocations -b cookies.txt
```

---

## 3. User Routes (`/api/user/*`)

### `POST /api/user/register`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid new user | Unique email + strong password | 200 | `ok: true` | Account created |
| Duplicate email | Already registered | 200 | `ok: false, error: USER_EXISTS` | Prevents duplicates |
| Weak password | Only 10 chars | 400 | `ok: false, error: PASSWORD_MIN_12_CHARS` | 12 char minimum |
| No uppercase | `securepass123!` | 400 | `ok: false, error: PASSWORD_NEEDS_UPPERCASE` | Must have uppercase |
| No lowercase | `SECUREPASS123!` | 400 | `ok: false, error: PASSWORD_NEEDS_LOWERCASE` | Must have lowercase |
| No number | `SecurePass!!` | 400 | `ok: false, error: PASSWORD_NEEDS_NUMBER` | Must have digit |
| No special char | `SecurePass123` | 400 | `ok: false, error: PASSWORD_NEEDS_SPECIAL` | Must have special char |

**Command:**

```bash
curl -X POST http://localhost:3000/api/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

---

### `POST /api/user/login`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid credentials | Registered user | 200 | `ok: true` | Sets session cookie |
| Wrong password | Correct email, wrong pwd | 200 | `ok: false, error: INVALID_CREDENTIALS` | No timing leak |
| Not registered | Non-existent email | 200 | `ok: false, error: INVALID_CREDENTIALS` | Same error |

**Command:**

```bash
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -c user_cookies.txt \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

---

### `POST /api/user/logout`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Logged in | Valid session | 200 | `ok: true` | Cookie cleared |
| Not logged in | No session | 200 | `ok: true` | Idempotent |

---

### `POST /api/user/forgot-password`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid email | User email | 200 | `ok: true, message: ...` | (Stub: no email sent) |
| Non-existent email | Random email | 200 | `ok: true` | Doesn't leak registration status |

**Command:**

```bash
curl -X POST http://localhost:3000/api/user/forgot-password \
  -H "Content-Type: application/json" \
  -d '{ "email": "user@example.com" }'
```

---

## 4. Public Routes

### `POST /api/contact`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Valid message | All fields | 200 | `ok: true, id: uuid` | Stored in DB |
| Missing field | No subject | 400 | `ok: false, error: INVALID_REQUEST` | Schema validation |
| Rate limit | 6th request in 60s | 429 | Rate limit error | 5 per minute limit |
| Very long message | > 2000 chars | 400 | `ok: false` | Max length enforced |

**Command:**

```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Test",
    "message": "This is a test message."
  }'
```

---

## 5. Static Routes

### `GET /`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Root path | `/` | 200 | HTML (index.html) | SPA shell served |
| Unknown path | `/unknown/path` | 200 | HTML (index.html) | SPA routing |

**Command:**

```bash
curl -I http://localhost:3000/
```

---

### `GET /admin`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Admin path | `/admin` | 200 | HTML (admin/index.html) | Admin UI |

---

### `GET /docs`

| Test Case | Request | Expected Status | Response | Notes |
|-----------|---------|-----------------|----------|-------|
| Swagger UI | `/docs` | 200 | HTML (Swagger UI) | OpenAPI documentation |

**Command:**

```bash
curl -I http://localhost:3000/docs
```

---

## 6. Error Scenarios

### No-404 Policy

| Request | Expected Status | Response | Notes |
|---------|-----------------|----------|-------|
| `GET /api/unknown` | 200 | `ok: false, error: NOT_FOUND` | No HTTP 404 |
| `GET /v1/unknown` | 200 | `ok: false, error: NOT_FOUND` | No HTTP 404 |
| `POST /api/typo` | 200 | `ok: false, error: NOT_FOUND` | No HTTP 404 |

**Command:**

```bash
curl http://localhost:3000/api/unknown
```

---

### CORS Preflight

| Request | Expected Status | Headers | Notes |
|---------|-----------------|---------|-------|
| OPTIONS request | 200 | `Access-Control-Allow-Origin: http://localhost:5173` | CORS enabled for PWA |

**Command:**

```bash
curl -i -X OPTIONS http://localhost:3000/ \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

---

## 7. Performance Baselines

### Expected Response Times

| Endpoint | Typical | Max | Notes |
|----------|---------|-----|-------|
| `GET /v1/status/:id` | < 10ms | 50ms | DB lookup |
| `POST /v1/wallet/register` | < 20ms | 100ms | New wallet + DB insert |
| `POST /api/admin/login` | 50-100ms | 200ms | bcrypt compare (rate-limited) |
| `GET /api/admin/inbox` | < 50ms | 200ms | DB query limit 100 |
| `GET /docs` (Swagger) | < 50ms | 200ms | Static asset |

### Load Test (100 concurrent users, 30s)

```bash
# Using Apache Bench
ab -n 100 -c 10 http://localhost:3000/v1/status/test-wallet-id

# Using k6 (more realistic)
k6 run load-test.js
```

---

## 8. Manual QA Checklist

### Wallet PWA

- [ ] Login page loads (optional, can skip)
- [ ] "Use Local Mode" button works (skips registry)
- [ ] Post-login: Enrollment page accessible
- [ ] Enrollment: Can create wallet with passphrase
- [ ] Post-enrollment: Proof page accessible
- [ ] Proof page: Can generate proof request
- [ ] Proof: QR code displays
- [ ] Proof: Deep link generates correctly
- [ ] Settings: Can view vault, manage keys
- [ ] Service Worker: Registered in DevTools
- [ ] Offline: PWA works without internet

### Registry Admin

- [ ] Login: Admin login works
- [ ] Inbox: Contact messages list
- [ ] Message: View full message details
- [ ] Mark read: Status updates
- [ ] Audit log: Events displayed in order
- [ ] Logout: Session cleared

### Verifier Demo

- [ ] Home page: Displays all proof types
- [ ] Age verification: QR code displays
- [ ] KYC verification: Deep link works
- [ ] Continuity: Proof request generates
- [ ] Verification result: Shows success/failure
- [ ] Session history: Proof requests listed

### Security

- [ ] Passwords: 12+ char, mixed case, number, special required
- [ ] Session: Expires after 24 hours
- [ ] CSRF: sameSite=strict cookie
- [ ] Rate limit: Contact form blocks 6th req/min
- [ ] No 404: Unknown routes return 200 with error
- [ ] CORS: Requests from PWA allowed, others blocked
- [ ] HTTPOnly: Admin cookies not accessible from JS

---

## 9. Automated Test Commands

```bash
#!/bin/bash
# test-suite.sh - Run all tests

HOST="http://localhost:3000"

echo "=== Wallet Routes ==="
curl -s $HOST/v1/status/test-wallet | jq .
curl -s $HOST/v1/wallet/test/keys | jq .

echo "=== Public Routes ==="
curl -s -I $HOST/ | head -1
curl -s -I $HOST/docs | head -1

echo "=== Contact Form ==="
curl -s -X POST $HOST/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","subject":"Test","message":"Test"}' | jq .

echo "=== Error Handling ==="
curl -s $HOST/api/unknown | jq .

echo "All tests completed"
```

---

**End of Document**
