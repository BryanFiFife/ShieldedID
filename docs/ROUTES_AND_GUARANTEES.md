# Routes & Guarantees: Shielded ID API

**Version:** 1.0  
**Last Updated:** 2025

## 1. Registry Server Routes

### Base URL

```
Development:  http://localhost:3000
Production:   https://api.zkdigitalid.com (example)
```

### Authentication

- **Admin routes** (`/api/admin/*`): Require `shielded_admin_session` cookie (24h expiry, HTTPOnly, sameSite=strict)
- **User routes** (`/api/user/*`): Require `shielded_admin_session` cookie
- **Wallet routes** (`/v1/*`): Stateless (signature verification)
- **Public routes** (`/api/contact`): Rate-limited (5 req/min)

### Error Handling

**All error responses follow this format:**

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description (optional)"
}
```

**Common error codes:**

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_CREDENTIALS` | 401 | Login failed (wrong email/password) |
| `UNAUTHORIZED` | 403 | Missing session cookie or expired |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `WALLET_NOT_FOUND` | 404 | Wallet ID doesn't exist in registry |
| `USER_EXISTS` | 409 | Email already registered |
| `PASSWORD_MIN_12_CHARS` | 400 | Password < 12 characters |
| `PASSWORD_NEEDS_UPPERCASE` | 400 | Password missing uppercase letter |
| `PASSWORD_NEEDS_LOWERCASE` | 400 | Password missing lowercase letter |
| `PASSWORD_NEEDS_NUMBER` | 400 | Password missing digit |
| `PASSWORD_NEEDS_SPECIAL` | 400 | Password missing special character |

---

## 2. Wallet Routes (`/v1/*`)

### `POST /v1/wallet/register`

**Purpose:** Register a new wallet in the registry.

**Request:**

```json
{
  "publicKeyJwk": {
    "kty": "EC",
    "crv": "P-256",
    "x": "base64-url-encoded-x",
    "y": "base64-url-encoded-y"
  },
  "webauthnCredentialId": "credential-id-hex (optional)"
}
```

**Response (Success):**

```json
{
  "ok": true,
  "walletId": "uuid-v4",
  "createdAt": "2025-01-01T12:00:00Z",
  "status": "ACTIVE"
}
```

**Response (Failure):**

```json
{
  "ok": false,
  "error": "INVALID_REQUEST",
  "message": "publicKeyJwk is required"
}
```

**Guarantees:**
- ✅ Idempotent: Multiple calls with same key → same `walletId`
- ✅ Status immediately: Wallet active after registration
- ✅ No PII stored: Only public key + metadata

---

### `GET /v1/wallet/:id/keys`

**Purpose:** Retrieve public keys for a wallet (for proof verification).

**Request:**

```
GET /v1/wallet/550e8400-e29b-41d4-a716-446655440000/keys
```

**Response:**

```json
{
  "ok": true,
  "walletId": "550e8400-e29b-41d4-a716-446655440000",
  "keys": [
    {
      "keyId": "key-uuid-1",
      "keyType": "SIGNING",
      "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
      "createdAt": "2025-01-01T12:00:00Z",
      "revokedAt": null
    }
  ]
}
```

**Guarantees:**
- ✅ Public endpoint: No authentication required
- ✅ Cached: CDN-safe (Cache-Control: max-age=3600)
- ✅ Revoked keys included: Shows `revokedAt` timestamp

---

### `GET /v1/status/:walletId`

**Purpose:** Check wallet status and revocation state.

**Request:**

```
GET /v1/status/550e8400-e29b-41d4-a716-446655440000
```

**Response:**

```json
{
  "ok": true,
  "walletId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ACTIVE",
  "revokedAt": null,
  "keysCount": 1,
  "lastActivityAt": "2025-01-15T10:30:00Z"
}
```

**Status values:** `ACTIVE`, `REVOKED`, `SUSPENDED`

**Guarantees:**
- ✅ Public endpoint: No authentication required
- ✅ Real-time: Reflects immediate revocations
- ✅ Privacy: No wallet contents disclosed

---

### `POST /v1/revoke`

**Purpose:** Revoke a key or entire wallet.

**Request:**

```json
{
  "targetType": "KEY",
  "targetId": "key-uuid-or-wallet-id",
  "reasonCode": "KEY_COMPROMISE",
  "signature": "base64-encoded-ECDSA-signature"
}
```

**Response:**

```json
{
  "ok": true,
  "revocationId": "uuid-v4",
  "effectiveAt": "2025-01-01T12:00:00Z"
}
```

**Target types:** `KEY`, `CREDENTIAL`, `WALLET`  
**Reason codes:** `KEY_COMPROMISE`, `USER_REQUEST`, `ADMIN_REVOCATION`

**Guarantees:**
- ✅ Immutable: Revocations cannot be undone
- ✅ Signed: Signature verified using corresponding key
- ✅ Timestamped: Effective timestamp included in audit trail

---

### `POST /v1/backup`

**Purpose:** Store encrypted vault backup on registry.

**Request:**

```json
{
  "walletId": "wallet-uuid",
  "ciphertext": "hex-encoded-AES-256-GCM-ciphertext",
  "algorithm": "AES-256-GCM"
}
```

**Response:**

```json
{
  "ok": true,
  "backupId": "uuid-v4",
  "createdAt": "2025-01-01T12:00:00Z"
}
```

**Guarantees:**
- ✅ Encrypted: Stored as ciphertext (server never sees plaintext)
- ✅ Retrievable: User provides passphrase to decrypt locally
- ✅ Versioned: Multiple backups allowed (latest retrievable)

---

## 3. Admin Routes (`/api/admin/*`)

### `POST /api/admin/login`

**Purpose:** Authenticate admin user.

**Request:**

```json
{
  "email": "admin@example.com",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "ok": true,
  "email": "admin@example.com"
}
```

**Guarantees:**
- ✅ Sets `shielded_admin_session` cookie (24h, HTTPOnly, sameSite=strict)
- ✅ Password hashed: bcrypt 10-round hash stored, plaintext never logged
- ✅ Rate-limited: 100 login attempts/min (per IP)

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit (0-9)
- At least one special character (!@#$%^&*()_+-=[]{}';:"\\|,.<>/?)

---

### `POST /api/admin/logout`

**Purpose:** Invalidate session.

**Request:**

```
POST /api/admin/logout (no body required)
```

**Response:**

```json
{
  "ok": true
}
```

**Guarantees:**
- ✅ Immediate: Session deleted from database
- ✅ Cookie cleared: Browser cookie removed

---

### `GET /api/admin/session`

**Purpose:** Check current session status.

**Request:**

```
GET /api/admin/session
```

**Response (Logged In):**

```json
{
  "ok": true,
  "email": "admin@example.com"
}
```

**Response (Not Logged In):**

```json
{
  "ok": false,
  "email": null
}
```

---

### `GET /api/admin/inbox`

**Purpose:** List contact messages.

**Response:**

```json
{
  "ok": true,
  "messages": [
    {
      "id": "msg-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "subject": "Question about...",
      "status": "NEW",
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Guarantees:**
- ✅ Sorted: Newest first
- ✅ Paginated: Limit 100 (add `limit`/`offset` if needed)

---

### `GET /api/admin/messages/:id`

**Purpose:** View message details.

**Response:**

```json
{
  "ok": true,
  "message": {
    "id": "msg-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Question about...",
    "message": "Full message body...",
    "status": "NEW",
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-01-15T10:30:00Z"
  }
}
```

---

### `POST /api/admin/messages/:id/status`

**Purpose:** Update message status (mark read, archive).

**Request:**

```json
{
  "status": "READ"
}
```

**Valid statuses:** `NEW`, `READ`, `ARCHIVED`

**Response:**

```json
{
  "ok": true
}
```

---

### `GET /api/admin/audit`

**Purpose:** View audit log (last 100 events).

**Response:**

```json
{
  "ok": true,
  "events": [
    {
      "id": 1,
      "eventType": "LOGIN_SUCCESS",
      "metadata": { "adminEmail": "admin@example.com" },
      "timestamp": "2025-01-15T10:30:00Z"
    },
    {
      "id": 2,
      "eventType": "KEY_ADDED",
      "metadata": { "walletId": "wallet-uuid", "keyType": "SIGNING" },
      "timestamp": "2025-01-15T10:31:00Z"
    }
  ]
}
```

**Event types:** `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `KEY_ADDED`, `KEY_REVOKED`, `WALLET_REGISTERED`, `WALLET_REVOKED`, `CONTACT_RECEIVED`, `CONTACT_VIEWED`, `CONTACT_STATUS`, `USER_REGISTERED`, `USER_LOGIN`

---

### `GET /api/admin/revocations`

**Purpose:** View revocation events (last 50).

**Response:**

```json
{
  "ok": true,
  "revocations": [
    {
      "revocationId": "rev-uuid",
      "targetType": "KEY",
      "targetId": "key-uuid",
      "reasonCode": "KEY_COMPROMISE",
      "effectiveAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

## 4. User Routes (`/api/user/*`)

### `POST /api/user/register`

**Purpose:** Create user account.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "ok": true
}
```

**Guarantees:**
- ✅ Email unique: Duplicate registration rejected
- ✅ Password strong: Server validates 12-char + complexity rules
- ✅ No login: Separate `/api/user/login` call required

---

### `POST /api/user/login`

**Purpose:** Authenticate user.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**

```json
{
  "ok": true
}
```

**Guarantees:**
- ✅ Sets session cookie (same as admin)
- ✅ Password compared: bcrypt.compare() only

---

### `POST /api/user/logout`

**Purpose:** Invalidate user session.

**Response:**

```json
{
  "ok": true
}
```

---

### `POST /api/user/forgot-password`

**Purpose:** Initiate password reset.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Password reset email sent"
}
```

**Note:** Current implementation returns success without sending email (future: integrate mail service).

---

## 5. Public Routes

### `POST /api/contact`

**Purpose:** Submit contact form (public, rate-limited).

**Request:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Feedback",
  "message": "Your product is great!"
}
```

**Response:**

```json
{
  "ok": true,
  "id": "msg-uuid"
}
```

**Rate limit:** 5 requests per minute per IP

**Guarantees:**
- ✅ PII collected: Name, email, message stored (PII notice required on UI)
- ✅ No spam: Rate limiting prevents abuse
- ✅ Stored: Accessible via `/api/admin/inbox`

---

## 6. Static Routes

### `GET /`

Serves PWA `index.html` (SPA shell).

### `GET /admin`

Serves admin dashboard `admin/index.html`.

### `GET /docs`

Swagger UI: OpenAPI documentation.

---

## 7. Error Handling & No-404 Policy

**All endpoints enforce a "no 404" policy for API routes:**

```
GET /api/unknown/route
↓
200 OK
{
  "ok": false,
  "error": "NOT_FOUND",
  "path": "/api/unknown/route"
}
```

**This prevents:**
- ✅ Enumeration attacks (route discovery)
- ✅ Leaking API structure
- ✅ Timing-based information disclosure

---

## 8. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/contact` | 5 | 1 minute |
| `/api/admin/login` | 100 | 1 minute |
| `/api/user/login` | 100 | 1 minute |
| `/v1/*` | 1000 | 1 minute (default) |

---

## 9. CORS Policy

**Development:**

```
Access-Control-Allow-Origin: http://localhost:5173, http://localhost:5174
```

**Production:**

```
Access-Control-Allow-Origin: https://wallet.zkdigitalid.com, https://verifier.zkdigitalid.com
```

---

## 10. Response Guarantees

### JSON Format

All responses are JSON (no XML, no plain text):

```json
{
  "ok": true|false,
  "error": "ERROR_CODE (if ok=false)",
  "data": "..." (endpoint-specific)
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success or handled error | Correct login, or `ok: false` with error code |
| 400 | Bad request | Invalid JSON, missing fields |
| 401 | Unauthorized (no auth) | Missing session cookie |
| 403 | Forbidden (wrong auth) | Invalid session cookie |
| 404 | Unknown route (API enforcement) | Returns 200 with `error: NOT_FOUND` |
| 429 | Too many requests | Rate limit exceeded |
| 500 | Server error | Database crash, uncaught exception |

---

## 11. Future Enhancements

- [ ] Pagination cursors (`/api/admin/audit?cursor=...&limit=50`)
- [ ] Bulk revocation endpoint
- [ ] Webhook delivery for revocation events
- [ ] Multi-factor authentication for admins
- [ ] Key rotation endpoint
- [ ] CORS dynamic configuration
- [ ] GraphQL alternative API

---

**End of Document**
