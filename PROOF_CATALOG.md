# Shielded ID: Complete Proof Catalog

## Current Implemented Proofs (30 Total)

### Phase 1: Core Predicates (22 Total)

#### Age Verification (4 proofs)
1. **AGE_OVER** - Prove user is 18+, 21+, 25+, etc.
   - Parameters: `threshold` (minimum age)
   - Use case: Legal drinking, voting, financial products
   - Example: `{ type: "AGE_OVER", threshold: 21 }`

2. **AGE_RANGE** - Prove age falls within specific range
   - Parameters: `minValue`, `maxValue`
   - Use case: Insurance pricing, demographic targeting
   - Example: `{ type: "AGE_RANGE", minValue: 18, maxValue: 65 }`

3. **BORN_AFTER** - Prove birth year is after specific year
   - Parameters: `expectedValue` (year)
   - Use case: Generational verification, eligibility checks
   - Example: `{ type: "BORN_AFTER", expectedValue: 1960 }`

4. **AGE_EXACT** - Prove exact age or age within birth year
   - Parameters: `expectedValue` (age or year)
   - Use case: Age-specific services, precise verification
   - Example: `{ type: "AGE_EXACT", expectedValue: 25 }`

#### Location Verification (5 proofs)
5. **COUNTRY** - Prove user is from specific country
   - Parameters: `expectedCountry` (ISO code)
   - Use case: Geo-restriction, compliance, taxation
   - Example: `{ type: "COUNTRY", expectedCountry: "US" }`

6. **EU_RESIDENT** - Prove residency in EU (membership proof)
   - Parameters: none (set membership across 27 countries)
   - Use case: GDPR compliance, VAT rules, data residency
   - Example: `{ type: "EU_RESIDENT" }`

7. **STATE_OR_PROVINCE** - Prove residency in specific state
   - Parameters: `expectedState` (e.g., "CA", "ON")
   - Use case: US/Canada regional regulations, licensing
   - Example: `{ type: "STATE_OR_PROVINCE", expectedState: "CA" }`

8. **POSTAL_CODE_PREFIX** - Prove postal code starts with prefix
   - Parameters: `expectedValue` (prefix, e.g., "90210")
   - Use case: Geographic targeting, service areas, micro-targeting
   - Example: `{ type: "POSTAL_CODE_PREFIX", expectedValue: "90" }`

9. **REGION** - Prove region/district (custom geographic boundaries)
   - Parameters: `expectedValue` (region identifier)
   - Use case: Custom service areas, local regulations
   - Example: `{ type: "REGION", expectedValue: "US-CA-SF" }`

#### KYC Verification (5 proofs)
10. **KYC_LEVEL** - Prove user has KYC verification level
    - Parameters: `minLevel` (1, 2, 3, etc.)
    - Use case: Transaction limits, access tiers, compliance
    - Example: `{ type: "KYC_LEVEL", minLevel: 2 }`

11. **KYC_VERIFIED** - Prove user is KYC verified (boolean)
    - Parameters: none (identity checked)
    - Use case: Basic financial service access
    - Example: `{ type: "KYC_VERIFIED" }`

12. **AML_CLEAR** - Prove user passes AML (Anti-Money Laundering) screening
    - Parameters: none (not flagged in AML databases)
    - Use case: Financial compliance, transaction authorization
    - Example: `{ type: "AML_CLEAR" }`

13. **SANCTIONS_CLEAR** - Prove user is not on sanctions lists
    - Parameters: none (not on OFAC/CFTS lists)
    - Use case: International compliance, trade regulations
    - Example: `{ type: "SANCTIONS_CLEAR" }`

14. **DOCUMENT_TYPE** - Prove user has specific document type
    - Parameters: `expectedValue` (passport, license, id_card, etc.)
    - Use case: Identity verification, access control
    - Example: `{ type: "DOCUMENT_TYPE", expectedValue: "passport" }`

#### Driving License Verification (5 proofs)
15. **LICENSE_CLASS** - Prove driver license has minimum class
    - Parameters: `threshold` (class A, B, C, etc.)
    - Use case: Vehicle rental, commercial driving, access control
    - Example: `{ type: "LICENSE_CLASS", threshold: 2 }`

16. **VEHICLE_CATEGORY** - Prove license covers vehicle type
    - Parameters: `expectedValue` (car, truck, motorcycle, etc.)
    - Use case: Vehicle rental eligibility, fleet management
    - Example: `{ type: "VEHICLE_CATEGORY", expectedValue: "car" }`

17. **ENDORSEMENT** - Prove license has required endorsement
    - Parameters: `requiredEndorsement` (HGV, towing, etc.)
    - Use case: Professional driving, specialized services
    - Example: `{ type: "ENDORSEMENT", requiredEndorsement: "towing" }`

18. **RESTRICTION** - Prove license does NOT have restriction
    - Parameters: `forbiddenRestriction` (corrective_lenses, manual_only, etc.)
    - Use case: Access to restricted activities, safety compliance
    - Example: `{ type: "RESTRICTION", forbiddenRestriction: "corrective_lenses" }`

19. **LICENSE_VALID** - Prove driver license is valid/not expired
    - Parameters: none (freshness verified)
    - Use case: Current eligibility verification
    - Example: `{ type: "LICENSE_VALID" }`

#### Document & Credential Validation (7 proofs)
20. **DOCUMENT_VALID** - Prove document is valid/not expired
    - Parameters: none
    - Use case: All identity documents, freshness verification
    - Example: `{ type: "DOCUMENT_VALID" }`

21. **DOCUMENT_TYPE_MATCH** - Prove document matches expected type
    - Parameters: `allowedDocumentType`
    - Use case: Strict identity verification, workflow control
    - Example: `{ type: "DOCUMENT_TYPE_MATCH", allowedDocumentType: "passport" }`

22. **ISSUER_COUNTRY** - Prove document issued by country
    - Parameters: `issuerCountry`
    - Use case: Trust verification, origin validation
    - Example: `{ type: "ISSUER_COUNTRY", issuerCountry: "US" }`

23. **DOCUMENT_AGE** - Prove document age is recent
    - Parameters: `minDocumentAge` (days or timestamp)
    - Use case: Address verification, recent proof, anti-fraud
    - Example: `{ type: "DOCUMENT_AGE", minDocumentAge: 180 }`

24. **CREDENTIAL_VALID** - Prove credential is valid/not expired
    - Parameters: none
    - Use case: Professional licenses, certifications
    - Example: `{ type: "CREDENTIAL_VALID" }`

25. **CREDENTIAL_ACTIVE** - Prove credential is actively maintained
    - Parameters: none
    - Use case: Professional credentials, insurance, licenses
    - Example: `{ type: "CREDENTIAL_ACTIVE" }`

26. **CREDENTIAL_LEVEL** - Prove credential has minimum level
    - Parameters: `minLevel`
    - Use case: Tiered access, professional hierarchies
    - Example: `{ type: "CREDENTIAL_LEVEL", minLevel: 3 }`

#### System Predicates (2 proofs)
27. **CONTINUITY** - Prove continuous device/wallet ownership
    - Parameters: none (proof of account age/stability)
    - Use case: Fraud prevention, trust building, account recovery
    - Example: `{ type: "CONTINUITY" }`

28. **CUSTOM** - Extensible custom predicate
    - Parameters: user-defined
    - Use case: Future extensibility, custom business logic
    - Example: `{ type: "CUSTOM" }`

---

### Phase 2: Advanced Predicates (8 Total)

#### Consent & Privacy (1 proof)
29. **CONSENT_REQUIRED** - Prove user gave explicit consent
    - Parameters: `consentType` (DATA_SHARING, MARKETING, HEALTH_DATA, etc.), `minConsentVersion`, `consentDate`
    - Use case: GDPR, privacy regulations, opt-in verification
    - Example: `{ type: "CONSENT_REQUIRED", consentType: "DATA_SHARING", minConsentVersion: 2 }`

#### Credential Management (1 proof)
30. **CREDENTIAL_CHAIN** - Prove credential provenance chain
    - Parameters: `chainLength`, `requiredIssuers`
    - Use case: Trust chain validation, delegated credentials, issuer verification
    - Example: `{ type: "CREDENTIAL_CHAIN", chainLength: 2, requiredIssuers: ["issuer1", "issuer2"] }`

#### Risk & Financial (3 proofs)
31. **RISK_SCORE** - Prove risk assessment is below threshold
    - Parameters: `maxRiskScore`, `riskAssessmentDate`
    - Use case: Fraud prevention, transaction limits, access control
    - Example: `{ type: "RISK_SCORE", maxRiskScore: 25 }`

32. **TRANSACTION_LIMIT** - Prove available transaction limit
    - Parameters: `minAvailableLimit`, `limitType` (DAILY/MONTHLY/CUMULATIVE), `limitResetDate`
    - Use case: Financial authorization, spending controls
    - Example: `{ type: "TRANSACTION_LIMIT", minAvailableLimit: 50000, limitType: "DAILY" }`

33. **REPUTATION_SCORE** - Prove user/entity reputation meets threshold
    - Parameters: `minReputationScore`, `reputationSource`, `maxScoreAge`
    - Use case: Marketplace verification, seller trust, platform eligibility
    - Example: `{ type: "REPUTATION_SCORE", minReputationScore: 80 }`

#### Compliance (2 proofs)
34. **DEVICE_COMPLIANCE** - Prove device meets security standards
    - Parameters: `osVersion`, `hasEncryption`, `hasMFA`, `maxComplianceAge`
    - Use case: HIPAA compliance, secure access, device security
    - Example: `{ type: "DEVICE_COMPLIANCE", hasEncryption: true, hasMFA: true }`

35. **COMPLIANCE_STATUS** - Prove regulatory compliance in jurisdiction
    - Parameters: `jurisdiction`, `complianceLevel`, `lastAuditDate`
    - Use case: Multi-jurisdiction compliance, regulatory verification
    - Example: `{ type: "COMPLIANCE_STATUS", jurisdiction: "EU", complianceLevel: 3 }`

#### Attributes (1 proof)
36. **CREDENTIAL_METADATA** - Prove metadata attributes meet criteria
    - Parameters: `metadataKey`, `metadataValue`, `comparisonOperator` (EQ/GE/LE/GT/LT)
    - Use case: Business requirements, RBAC, flexible attribute verification
    - Example: `{ type: "CREDENTIAL_METADATA", metadataKey: "department", metadataValue: "engineering" }`

---

## 📋 Summary: Current Implementation

| Category | Count | Predicates |
|----------|-------|-----------|
| Age | 4 | AGE_OVER, AGE_RANGE, BORN_AFTER, AGE_EXACT |
| Location | 5 | COUNTRY, EU_RESIDENT, STATE_OR_PROVINCE, POSTAL_CODE_PREFIX, REGION |
| KYC | 5 | KYC_LEVEL, KYC_VERIFIED, AML_CLEAR, SANCTIONS_CLEAR, DOCUMENT_TYPE |
| Driving | 5 | LICENSE_CLASS, VEHICLE_CATEGORY, ENDORSEMENT, RESTRICTION, LICENSE_VALID |
| Documents | 7 | DOCUMENT_VALID, DOCUMENT_TYPE_MATCH, ISSUER_COUNTRY, DOCUMENT_AGE, CREDENTIAL_VALID, CREDENTIAL_ACTIVE, CREDENTIAL_LEVEL |
| System | 2 | CONTINUITY, CUSTOM |
| **Phase 2** | **8** | CONSENT_REQUIRED, CREDENTIAL_CHAIN, RISK_SCORE, DEVICE_COMPLIANCE, TRANSACTION_LIMIT, REPUTATION_SCORE, COMPLIANCE_STATUS, CREDENTIAL_METADATA |
| **TOTAL** | **36** | All predicates listed above |

---

## 🚀 Suggested Phase 4: Enhanced Predicates (12+ New Proofs)

### Phase 4a: Temporal & Time-Based Predicates (4 new)

37. **TIME_WINDOW** - Prove request is within valid time window
    - Parameters: `startTime`, `endTime`, `timezone` (optional)
    - Use case: Scheduled access, time-based access control, office hours verification
    - Security: Prevents replay attacks outside valid windows
    - Example: `{ type: "TIME_WINDOW", startTime: 1704067200, endTime: 1704153600 }`

38. **ACCOUNT_AGE** - Prove account/credential age in days/months
    - Parameters: `minAccountAgeDays`, `maxAccountAgeDays` (optional, for fraud detection)
    - Use case: Spam prevention, anti-fraud, trust building, graduation requirements
    - Security: Detects new accounts, suspicious age patterns
    - Example: `{ type: "ACCOUNT_AGE", minAccountAgeDays: 30 }`

39. **ACTIVITY_FREQUENCY** - Prove minimum activity frequency
    - Parameters: `minActivityCount`, `activityPeriodDays`, `activityType`
    - Use case: Account reactivation, active user verification, engagement requirements
    - Example: `{ type: "ACTIVITY_FREQUENCY", minActivityCount: 10, activityPeriodDays: 30 }`

40. **LAST_LOGIN_RECENCY** - Prove recent login within X days
    - Parameters: `maxDaysSinceLogin`
    - Use case: Active account verification, session management, security checks
    - Example: `{ type: "LAST_LOGIN_RECENCY", maxDaysSinceLogin: 30 }`

### Phase 4b: Attribute-Based Access Control (ABAC) (3 new)

41. **ATTRIBUTE_RANGE** - Prove numeric attribute within range
    - Parameters: `attributeName`, `minValue`, `maxValue`
    - Use case: Flexible access control, salary bands, age ranges, skill levels
    - More flexible than CREDENTIAL_METADATA
    - Example: `{ type: "ATTRIBUTE_RANGE", attributeName: "salary_band", minValue: 50000, maxValue: 150000 }`

42. **ATTRIBUTE_SET_MEMBERSHIP** - Prove attribute in allowed set
    - Parameters: `attributeName`, `allowedValues` (array)
    - Use case: Role-based access, department verification, category matching
    - Example: `{ type: "ATTRIBUTE_SET_MEMBERSHIP", attributeName: "department", allowedValues: ["eng", "ops", "finance"] }`

43. **ATTRIBUTE_HIERARCHY** - Prove position in organizational hierarchy
    - Parameters: `hierarchyPath` (e.g., "department.team.role"), `minLevel`, `requiredDepartments`
    - Use case: Org chart verification, chain-of-command, approval workflows
    - Example: `{ type: "ATTRIBUTE_HIERARCHY", hierarchyPath: "department.engineering", minLevel: 3 }`

### Phase 4c: Behavioral & Pattern Verification (3 new)

44. **TRANSACTION_HISTORY** - Prove transaction history pattern
    - Parameters: `minTransactionCount`, `minAverageTxAmount`, `periodDays`, `requiredSuccessRate`
    - Use case: Trusted merchant verification, transaction volume thresholds, historical verification
    - Example: `{ type: "TRANSACTION_HISTORY", minTransactionCount: 100, periodDays: 180 }`

45. **GEOGRAPHIC_CONSISTENCY** - Prove location is consistent with history
    - Parameters: `maxDistanceFromAverage` (km), `confidenceLevel` (80-99%)
    - Use case: Fraud detection, unusual activity alerts, account takeover prevention
    - Example: `{ type: "GEOGRAPHIC_CONSISTENCY", maxDistanceFromAverage: 500 }`

46. **VELOCITY_LIMIT** - Prove action frequency below threshold
    - Parameters: `action` (login, transaction, api_call), `maxActionsPerHour`
    - Use case: Rate limiting, brute force prevention, API abuse detection
    - Example: `{ type: "VELOCITY_LIMIT", action: "transaction", maxActionsPerHour: 10 }`

### Phase 4d: Relationship & Network Verification (2 new)

47. **SOCIAL_TRUST_NETWORK** - Prove connections in trust network
    - Parameters: `minConnectionCount`, `minConnectionAge`, `networkType` (verified_friends, colleagues, etc.)
    - Use case: Fraud prevention, social verification, community trust
    - Example: `{ type: "SOCIAL_TRUST_NETWORK", minConnectionCount: 50, networkType: "verified_friends" }`

48. **SHARED_ATTRIBUTE_WITH_VERIFIER** - Prove shared attribute with another verified party
    - Parameters: `sharedAttribute` (address, phone, email_domain), `otherPartyId`
    - Use case: Account linking, platform verification, mutual validation
    - Example: `{ type: "SHARED_ATTRIBUTE_WITH_VERIFIER", sharedAttribute: "email_domain", otherPartyId: "employer_id" }`

### Phase 4e: Educational & Professional Verification (2 new)

49. **EDUCATION_CREDENTIAL** - Prove education level/degree
    - Parameters: `degreeType` (highschool, bachelor, master, phd), `fieldOfStudy`, `minimumGPA`, `issuer` (optional)
    - Use case: Employment verification, access to professional services, credential verification
    - Example: `{ type: "EDUCATION_CREDENTIAL", degreeType: "bachelor", fieldOfStudy: "Computer Science" }`

50. **PROFESSIONAL_CERTIFICATION** - Prove active professional certification
    - Parameters: `certificationName`, `issuingBody`, `minimumScore`, `renewalDueDate`
    - Use case: Professional services access, expert verification, licensing compliance
    - Example: `{ type: "PROFESSIONAL_CERTIFICATION", certificationName: "AWS Solutions Architect" }`

### Phase 4f: Financial & Income Verification (2 new)

51. **INCOME_LEVEL** - Prove income/earnings in range
    - Parameters: `minAnnualIncome`, `maxAnnualIncome` (optional for fraud), `verificationMethod` (tax, bank, employer)
    - Use case: Loan eligibility, insurance underwriting, premium access
    - Example: `{ type: "INCOME_LEVEL", minAnnualIncome: 50000 }`

52. **CREDIT_SCORE_RANGE** - Prove credit score within acceptable range
    - Parameters: `minCreditScore`, `maxCreditScore` (fraud detection), `bureauVerification`
    - Use case: Financial product access, lending decisions, credit decisions
    - Example: `{ type: "CREDIT_SCORE_RANGE", minCreditScore: 700 }`

### Phase 4g: Biometric & Identity Enrichment (2 new)

53. **BIOMETRIC_VERIFICATION** - Prove biometric verification type
    - Parameters: `biometricType` (fingerprint, facial, iris, voice), `lastVerificationRecency` (days)
    - Use case: High-security access, identity proofing, liveness verification
    - Security: Prevent spoofing with freshness guarantees
    - Example: `{ type: "BIOMETRIC_VERIFICATION", biometricType: "facial", lastVerificationRecency: 7 }`

54. **IDENTITY_ENRICHMENT_SCORE** - Prove identity data completeness
    - Parameters: `minEnrichmentScore` (0-100%), `requiredFields` (address, phone, email, etc.)
    - Use case: Fraud prevention, data quality verification, risk assessment
    - Example: `{ type: "IDENTITY_ENRICHMENT_SCORE", minEnrichmentScore: 80, requiredFields: ["address", "phone"] }`

---

## 📊 Phase 4 Summary (12 new predicates)

| Phase 4 Category | Count | New Predicates |
|------------------|-------|----------------|
| Temporal | 4 | TIME_WINDOW, ACCOUNT_AGE, ACTIVITY_FREQUENCY, LAST_LOGIN_RECENCY |
| ABAC | 3 | ATTRIBUTE_RANGE, ATTRIBUTE_SET_MEMBERSHIP, ATTRIBUTE_HIERARCHY |
| Behavioral | 3 | TRANSACTION_HISTORY, GEOGRAPHIC_CONSISTENCY, VELOCITY_LIMIT |
| Network | 2 | SOCIAL_TRUST_NETWORK, SHARED_ATTRIBUTE_WITH_VERIFIER |
| Education | 2 | EDUCATION_CREDENTIAL, PROFESSIONAL_CERTIFICATION |
| Financial | 2 | INCOME_LEVEL, CREDIT_SCORE_RANGE |
| Biometric | 2 | BIOMETRIC_VERIFICATION, IDENTITY_ENRICHMENT_SCORE |
| **TOTAL** | **12** | **All new Phase 4 predicates** |

---

## 🎯 Full Roadmap: Current & Proposed

| Phase | Predicates | Status | Use Cases |
|-------|-----------|--------|-----------|
| **Phase 1** | 22 | ✅ Complete | Core identity, location, KYC, driving, documents |
| **Phase 2** | 8 | ✅ Complete | Consent, credentials, risk, compliance, reputation, metadata |
| **Phase 3** | 6 | ✅ Complete | ZK proofs, E2E testing, enterprise scenarios |
| **Phase 4** | 12 | 📋 Proposed | Temporal, ABAC, behavioral, biometric, financial |
| **Phase 5** | TBD | 💭 Future | Machine learning, predictive verification, dynamic risk |
| **TOTAL** | **48+** | - | Enterprise-grade universal verification |

---

## 💡 Implementation Priority for Phase 4

### Quick Wins (1-2 days each)
1. ✨ **TIME_WINDOW** - Simple timestamp range check, high impact for access control
2. ✨ **ACCOUNT_AGE** - Straightforward date difference calculation, fraud prevention
3. ✨ **ATTRIBUTE_RANGE** - Generalization of existing numeric comparisons

### High Impact (2-3 days each)
4. 🚀 **VELOCITY_LIMIT** - Critical for fraud prevention, API abuse detection
5. 🚀 **GEOGRAPHIC_CONSISTENCY** - Advanced fraud detection using location history
6. 🚀 **TRANSACTION_HISTORY** - Essential for financial services

### Strategic (3-5 days each)
7. 🔧 **BIOMETRIC_VERIFICATION** - Future-proofs against impersonation
8. 🔧 **EDUCATION_CREDENTIAL** - Opens employment verification market
9. 🔧 **PROFESSIONAL_CERTIFICATION** - Professional services compliance

### Advanced (5+ days each, requires external integrations)
10. 💎 **CREDIT_SCORE_RANGE** - Requires credit bureau integration
11. 💎 **SOCIAL_TRUST_NETWORK** - Requires social graph integration
12. 💎 **INCOME_LEVEL** - Requires tax/bank integration

---

## 🎁 Bonus: Conditional Logic Operators (Phase 4+)

Once Phase 4 predicates are in place, consider adding:

- **AND** - All predicates must pass (current default)
- **OR** - At least one predicate must pass
- **NOT** - Negate a predicate (e.g., NOT_HIGH_RISK)
- **WITHIN_DAYS** - Aggregate time-based checks
- **SCORED** - Weighted scoring across predicates (not just boolean)

Example future request:
```typescript
{
  operator: "OR",
  requestedClaims: [
    { type: "CREDIT_SCORE_RANGE", minCreditScore: 700 },
    { type: "INCOME_LEVEL", minAnnualIncome: 100000 }
  ]
}
```

---

## Summary

**Current State:** 36 predicates covering identity, location, KYC, compliance, and advanced risk management ✅

**Recommended Next:** Phase 4 with 12 new predicates focusing on temporal, behavioral, ABAC, and biometric verification 🚀

**Long Term:** 50+ total predicates for truly universal identity verification across all industries 🌟
