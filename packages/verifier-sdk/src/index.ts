/** Main verifier class for creating and validating proof requests. */
export { ShieldedVerifier } from "./verifier.js";
/** Registry client for wallet/key status and issuer keys. */
export { RegistryClient } from "./registry.js";
/** SDK types. */
export {
  type ProofRequest,
  type ProofResponse,
  type Claim,
  type VerificationResult,
  type VerifierConfig,
  type VerificationOptions,
  type ProofPolicy,
  type RequestedClaim,
  type ProofCallback,
  type ClaimType
} from "./types.js";
/** Crypto utilities for ECDSA verification and timestamp/nonce checks. */
export { verifyECDSAP256, validateNonce, validateTimestamp } from "./crypto.js";
