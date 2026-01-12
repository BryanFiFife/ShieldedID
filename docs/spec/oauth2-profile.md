# Shielded ID as OAuth 2.0 Bearer Token
## Internet-Draft: draft-shielded-id-oauth2-profile-00

**Status**: Standards Track  
**Date**: January 11, 2026

---

## Abstract

This document defines a profile of OAuth 2.0 where Shielded ID ProofResponse messages serve as Bearer tokens. This enables Shielded ID to be used in OAuth 2.0-compliant applications without protocol changes.

---

## 1. Introduction

OAuth 2.0 [RFC6749] defines a framework for delegated access. The "Bearer Token" [RFC6750] is the most common token type. This document maps:

- **OAuth 2.0 Authorization Code Flow** ↔ **Shielded ID Proof Request/Response Flow**
- **Bearer Token** ↔ **ProofResponse (signed proof)**
- **Token Introspection** ↔ **Revocation Status Check**

### 1.1 Motivation

Organizations using OAuth 2.0 (most web/mobile apps) can integrate Shielded ID by:
1. Creating a Shielded ID ProofRequest in place of authorization_code flow
2. Accepting ProofResponse as Bearer token
3. Using registry revocation checks as token introspection

No protocol changes to OAuth 2.0. Only token format changes.

---

## 2. Shielded ID as OAuth 2.0 Bearer Token

### 2.1 Token Format

```
Authorization: Bearer {ProofResponse_Base64URL}
```

Where `{ProofResponse_Base64URL}` is:

```
Base64URL(JSON.stringify({
  requestId: string,
  keyId: string,
  pairwiseSubjectId: string,
  claimsVerified: Array,
  signature: string,
  algorithm: string,
  issuanceDate: string,
  expirationDate: string,
  assuranceLevel: number
}))
```

### 2.2 Token Scope Mapping

In OAuth 2.0, `scope` defines what resource access is granted. In Shielded ID context:

```
scope := claim_type ":" claim_value

Examples:
  scope = "AGE_OVER:18"           (prove age ≥ 18)
  scope = "KYC_LEVEL:2"           (prove KYC level ≥ 2)
  scope = "AGE_OVER:21 KYC_LEVEL:2"  (multiple claims)
```

Token is valid if `claimsVerified` covers requested scopes:

```
requested_scope = "AGE_OVER:18 KYC_LEVEL:1"
token.claimsVerified = [
  { claimType: "AGE_OVER", claimValue: 18 },  ✓ covers
  { claimType: "KYC_LEVEL", claimValue: 2 }   ✓ covers (2 ≥ 1)
]
Result: Token VALID for requested scope
```

---

## 3. Authorization Code Flow with Shielded ID

### 3.1 Flow Diagram

```
+--------+                             +-------+
|        | (1) Initiates login        |       |
|Client  |    with scope=AGE_OVER:18  |Wallet |
|(App)   |<-------------------------->|       |
|        |                             +-------+
+--------+                                  ↓
   ↓ (2) Redirects with proof request       |
   |     shielded-id://request?             |
   |     requestId=...&nonce=...&           |
   |     claims=AGE_OVER:18                 |
   |                                        │
   +──────────────────→ Wallet displays QR/Deep-link
                           │
                           ↓ (3) User approves
                           │
                           ✓ Proof generated
                           │
                        (4) Returns to App
                           │ with ProofResponse token
                           ↓
                        +--------+
                        |App/    |
                        |Verifier|
                        +--------+
                           │
                           ↓ (5) Validates signature
                               (6) Checks revocation
                               (7) Verifies claims
                           │
                        (8) Access granted ✓
```

### 3.2 Step-by-Step Protocol

#### (1) Resource Owner Initiates Login

User clicks "Login with Shielded ID" on app.

#### (2) App Creates ProofRequest

```
GET https://wallet.example.com/authorize?
  client_id=app-demo&
  redirect_uri=https://app.example.com/callback&
  scope=AGE_OVER:18+KYC_LEVEL:1&
  response_type=proof
```

App generates ProofRequest:

```json
{
  "requestId": "req-oauth2-001",
  "nonce": "random_32_bytes",
  "timestamp": "2026-01-11T12:34:56Z",
  "requestedClaims": [
    { "claimType": "AGE_OVER", "claimValue": 18 },
    { "claimType": "KYC_LEVEL", "claimValue": 1 }
  ],
  "context": {
    "origin": "https://app.example.com",
    "clientId": "app-demo",
    "state": "state-xyz-123"
  }
}
```

Encodes in URL:

```
shielded-id://authorize?
  requestId=req-oauth2-001&
  nonce=base64url&
  claims=AGE_OVER:18,KYC_LEVEL:1&
  clientId=app-demo&
  redirectUri=https://app.example.com/callback
```

#### (3) Wallet Processes and User Approves

User sees: "app-demo.example.com requests proof of: Age ≥ 18, KYC Level ≥ 1"

User taps "Approve" (or scans QR if prompted).

#### (4) Wallet Generates and Returns Proof

Wallet generates proof with pairwise subject ID specific to app-demo.example.com:

```
pairwiseSubjectId = SHA256(userID || "https://app-demo.example.com")
```

Deep-links back to app with encoded proof:

```
https://app.example.com/callback?
  code={ProofResponse_Base64URL}&
  state=state-xyz-123
```

#### (5-7) App Validates Proof

```typescript
// Pseudocode
const proofResponse = Base64URL.decode(urlParams.code);

// Verify signature
const isSignatureValid = crypto.verify(
  proofResponse.signature,
  canonicalJSON(proofResponse),
  registryKey[proofResponse.keyId]
);

// Check revocation
const revocationStatus = await registry.checkRevocation(
  proofResponse.keyId
);

// Check claims match scope
const requestedScope = parseScope("AGE_OVER:18 KYC_LEVEL:1");
const claimsMatch = proofResponse.claimsVerified.every(claim =>
  requestedScope.some(s =>
    s.type === claim.claimType && s.value <= claim.claimValue
  )
);

if (isSignatureValid && revocationStatus === "ACTIVE" && claimsMatch) {
  // ✓ Token valid
  session.userId = proofResponse.pairwiseSubjectId;
  session.claims = proofResponse.claimsVerified;
  session.expiresAt = proofResponse.expirationDate;
} else {
  // ✗ Token invalid
  throw new UnauthorizedError();
}
```

#### (8) Session Established

App creates session:

```json
{
  "sessionId": "sess-abc123",
  "userId": "subj-hash-app-demo",
  "claims": [
    { "claimType": "AGE_OVER", "claimValue": 18, "assuranceLevel": 2 },
    { "claimType": "KYC_LEVEL", "claimValue": 2, "assuranceLevel": 2 }
  ],
  "createdAt": "2026-01-11T12:35:00Z",
  "expiresAt": "2026-01-12T12:35:00Z"
}
```

---

## 4. Token Introspection (Revocation Checking)

OAuth 2.0 defines token introspection [RFC7662]. In Shielded ID:

### 4.1 Request Format

```
POST /oauth2/introspect
Content-Type: application/x-www-form-urlencoded

token={ProofResponse_Base64URL}&
client_id=verifier-client-id
```

### 4.2 Response Format

```json
{
  "active": true,
  "scope": "AGE_OVER:18 KYC_LEVEL:2",
  "client_id": "app-demo",
  "username": "subj-hash-app-demo",
  "token_type": "Bearer",
  "exp": 1694500200,
  "iat": 1694416800,
  "sub": "subj-hash-app-demo",
  "iss": "https://registry.shielded-id.app",
  "aud": "app-demo.example.com"
}
```

### 4.3 Implementation

```typescript
// Pseudocode
async function introspectToken(tokenBase64Url: string): Promise<TokenInfo> {
  try {
    const proofResponse = Base64URL.decode(tokenBase64Url);
    
    // Check revocation
    const revocationStatus = await registry.checkRevocation(
      proofResponse.keyId
    );
    
    const isActive = revocationStatus.status === "ACTIVE" &&
                    new Date(proofResponse.expirationDate) > new Date();
    
    return {
      active: isActive,
      scope: proofResponse.claimsVerified
        .map(c => `${c.claimType}:${c.claimValue}`)
        .join(" "),
      exp: Math.floor(new Date(proofResponse.expirationDate).getTime() / 1000),
      iat: Math.floor(new Date(proofResponse.issuanceDate).getTime() / 1000),
      sub: proofResponse.pairwiseSubjectId
    };
  } catch (e) {
    return { active: false };
  }
}
```

---

## 5. Token Refresh (Proof Re-authentication)

OAuth 2.0 supports refresh tokens for extending sessions. Shielded ID equivalent:

### 5.1 Continuous Authentication

Instead of refresh_token, Shielded ID uses continuous authentication:

```
App → Wallet: "Re-authenticate for continued access"
    (send new ProofRequest with same scope)

Wallet → User: "Approve continued access?"

User → Wallet: "Approve"

Wallet → App: ProofResponse (new proof)

App: Validate new proof, extend session
```

**Advantages**:
- User explicitly confirms each re-authentication
- No long-lived refresh tokens
- Revocation is immediate (no refresh token revocation lists)

### 5.2 Implementation Pattern

```typescript
// Pseudocode
async function refreshSession(oldProofResponse: ProofResponse) {
  // Create new ProofRequest for same claims
  const newProofRequest: ProofRequest = {
    requestId: generateRequestId(),
    nonce: generateNonce(),
    timestamp: new Date().toISOString(),
    requestedClaims: oldProofResponse.claimsVerified.map(c => ({
      claimType: c.claimType,
      claimValue: c.claimValue
    }))
  };
  
  // Request proof from wallet (via deep-link)
  const newProofResponse = await requestProofFromWallet(newProofRequest);
  
  // Validate
  if (!verifyProof(newProofRequest, newProofResponse)) {
    throw new Error("Re-authentication failed");
  }
  
  // Verify pairwise subject ID is consistent
  if (newProofResponse.pairwiseSubjectId !== oldProofResponse.pairwiseSubjectId) {
    throw new Error("Subject changed unexpectedly");
  }
  
  // Extend session
  session.expiresAt = new Date(newProofResponse.expirationDate);
  session.lastReauthenticated = new Date();
  
  return session;
}
```

---

## 6. Security Considerations

### 6.1 Bearer Token Exposure

Bearer tokens in URLs are visible in:
- Browser history
- Server logs
- Referrer headers
- Proxy logs

**Mitigations**:
1. Use POST (not GET) to pass ProofResponse
2. Use TLS 1.3+ with Forward Secrecy
3. Use fragment identifier (#) instead of query parameter where possible:
   ```
   https://app.example.com/callback#code={ProofResponse}
   (fragment not sent to server, only to browser)
   ```
4. Token lifetime ≤ 24 hours

### 6.2 CSRF Protection

ProofResponse includes `requestId` which MUST match the ProofRequest.

This prevents CSRF: attacker cannot forge a valid proof without the nonce.

### 6.3 TLS Certificate Pinning

For mobile apps, recommend HPKP:

```
Public-Key-Pins: pin-sha256="base64=="; max-age=5184000; includeSubDomains
```

---

## 7. Compatibility with OAuth 2.0 Servers

### 7.1 Integrating with Standard OAuth 2.0 Libraries

Most OAuth 2.0 implementations expect:
```
POST /token HTTP/1.1

grant_type=authorization_code&
code=AUTHORIZATION_CODE&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

For Shielded ID, adapt as:

```
grant_type=proof&
proof={ProofResponse_Base64URL}&
client_id=CLIENT_ID&
client_secret=CLIENT_SECRET
```

### 7.2 Backward Compatibility

Shielded ID can coexist with traditional OAuth 2.0:

```
switch (grant_type) {
  case "authorization_code":
    // Traditional OAuth
    return handleAuthorizationCode(code);
  case "proof":
    // Shielded ID
    return handleProof(proof);
  default:
    return error("unsupported_grant_type");
}
```

---

## 8. Example: Complete Flow

### User Logs into App

```
1. User visits https://app.example.com
2. Clicks "Login with Shielded ID"
3. App displays QR code with:
   shielded-id://authorize?requestId=req-001&nonce=abc123&claims=AGE_OVER:18

4. User scans with wallet app
5. Wallet shows: "app.example.com requests proof of age ≥ 18"
6. User taps "Approve"

7. Wallet generates proof, returns:
   https://app.example.com/callback?
   code=eyJyZXF1ZXN0SWQiOiAicmVxLTAwMSIsIC4uLn0

8. App receives code, validates signature + revocation
9. Session created: userId = pairwiseSubjectId
10. User logged in ✓
```

### User Data

App knows:
```json
{
  "userId": "subj-hash-app-demo",
  "claims": {
    "AGE_OVER": 18,
    "assuranceLevel": 2
  },
  "sessionExpires": "2026-01-12T12:35:00Z"
}
```

App does NOT know:
- User's real name
- User's actual birth date
- User's identity at other apps
- User's IP address (if using Tor/VPN)

---

## References

- [RFC2104] HMAC
- [RFC6234] US Secure Hash
- [RFC6749] OAuth 2.0 Authorization Framework
- [RFC6750] OAuth 2.0 Bearer Token Usage
- [RFC7662] OAuth 2.0 Token Introspection
- [draft-shielded-id-protocol-00] Shielded ID Protocol Specification
