/**
 * Shielded ID Error Codes & Custom Error Class
 * File: packages/verifier-sdk/src/errors.ts
 * 
 * RFC-style error codes for consistent error handling across implementations
 */

/**
 * Shielded ID Error Code Registry
 * Format: SHIELDED_ERROR_<CATEGORY>_<SPECIFIC>
 * 
 * Categories:
 *   - CRYPTO: Cryptographic operations
 *   - REVOCATION: Key revocation checking
 *   - PROOF: Proof validation
 *   - CONTEXT: Request/response context validation
 *   - NETWORK: Network/connectivity issues
 *   - CONFIG: Configuration errors
 */
export enum ShieldedErrorCode {
  // Cryptographic operation errors
  INVALID_SIGNATURE = "SHIELDED_ERROR_CRYPTO_INVALID_SIGNATURE",
  UNSUPPORTED_ALGORITHM = "SHIELDED_ERROR_CRYPTO_UNSUPPORTED_ALGORITHM",
  KEY_NOT_FOUND = "SHIELDED_ERROR_CRYPTO_KEY_NOT_FOUND",
  KEY_IMPORT_FAILED = "SHIELDED_ERROR_CRYPTO_KEY_IMPORT_FAILED",
  DECRYPTION_FAILED = "SHIELDED_ERROR_CRYPTO_DECRYPTION_FAILED",

  // Revocation checking errors
  KEY_REVOKED = "SHIELDED_ERROR_REVOCATION_KEY_REVOKED",
  // SECURITY FIX #2: Add key expiration error
  KEY_EXPIRED = "SHIELDED_ERROR_REVOCATION_KEY_EXPIRED",
  REVOCATION_CHECK_FAILED = "SHIELDED_ERROR_REVOCATION_CHECK_FAILED",
  REGISTRY_UNAVAILABLE = "SHIELDED_ERROR_REVOCATION_REGISTRY_UNAVAILABLE",
  // SECURITY FIX #4: Fail on circuit breaker instead of stale cache
  REGISTRY_CIRCUIT_OPEN = "SHIELDED_ERROR_REVOCATION_CIRCUIT_OPEN",
  REVOCATION_CACHE_STALE = "SHIELDED_ERROR_REVOCATION_CACHE_STALE",

  // Proof validation errors
  INVALID_PROOF_FORMAT = "SHIELDED_ERROR_PROOF_INVALID_FORMAT",
  INVALID_NONCE = "SHIELDED_ERROR_PROOF_INVALID_NONCE",
  PROOF_EXPIRED = "SHIELDED_ERROR_PROOF_EXPIRED",
  INVALID_CLAIM_VALUE = "SHIELDED_ERROR_PROOF_INVALID_CLAIM_VALUE",
  REPLAY_ATTEMPT = "SHIELDED_ERROR_PROOF_REPLAY_ATTEMPT",
  MISSING_PROOF_FIELD = "SHIELDED_ERROR_PROOF_MISSING_FIELD",

  // Request/response context errors
  INVALID_REQUEST_ID = "SHIELDED_ERROR_CONTEXT_INVALID_REQUEST_ID",
  INVALID_TIMESTAMP = "SHIELDED_ERROR_CONTEXT_INVALID_TIMESTAMP",
  CONTEXT_BINDING_FAILED = "SHIELDED_ERROR_CONTEXT_BINDING_FAILED",
  CLOCK_SKEW_TOO_HIGH = "SHIELDED_ERROR_CONTEXT_CLOCK_SKEW_TOO_HIGH",
  REQUEST_ID_MISMATCH = "SHIELDED_ERROR_CONTEXT_REQUEST_ID_MISMATCH",

  // Network/transport errors
  NETWORK_ERROR = "SHIELDED_ERROR_NETWORK_ERROR",
  NETWORK_TIMEOUT = "SHIELDED_ERROR_NETWORK_TIMEOUT",
  TLS_CERTIFICATE_INVALID = "SHIELDED_ERROR_NETWORK_TLS_INVALID",

  // Configuration errors
  INVALID_CONFIG = "SHIELDED_ERROR_CONFIG_INVALID_CONFIG",
  MISSING_CONFIG = "SHIELDED_ERROR_CONFIG_MISSING_CONFIG",
  INVALID_ALGORITHM_ID = "SHIELDED_ERROR_CONFIG_INVALID_ALGORITHM_ID",
  // SECURITY FIX #3: WASM integrity errors
  WASM_INTEGRITY_FAILED = "SHIELDED_ERROR_CONFIG_WASM_INTEGRITY_FAILED",
  WASM_VERIFICATION_FAILED = "SHIELDED_ERROR_CONFIG_WASM_VERIFICATION_FAILED",

  // General errors
  UNKNOWN_ERROR = "SHIELDED_ERROR_UNKNOWN",
  NOT_IMPLEMENTED = "SHIELDED_ERROR_NOT_IMPLEMENTED",
}

/**
 * HTTP Status Code Mapping for Shielded ID Errors
 */
export const errorCodeToHttpStatus: Record<ShieldedErrorCode, number> = {
  // 4xx Client Errors
  [ShieldedErrorCode.INVALID_SIGNATURE]: 401,
  [ShieldedErrorCode.KEY_REVOKED]: 401,
  [ShieldedErrorCode.KEY_EXPIRED]: 401, // SECURITY FIX #2
  [ShieldedErrorCode.REPLAY_ATTEMPT]: 401,
  [ShieldedErrorCode.INVALID_PROOF_FORMAT]: 400,
  [ShieldedErrorCode.INVALID_NONCE]: 400,
  [ShieldedErrorCode.INVALID_REQUEST_ID]: 400,
  [ShieldedErrorCode.INVALID_TIMESTAMP]: 400,
  [ShieldedErrorCode.INVALID_CLAIM_VALUE]: 400,
  [ShieldedErrorCode.REQUEST_ID_MISMATCH]: 403,
  [ShieldedErrorCode.CONTEXT_BINDING_FAILED]: 403,
  [ShieldedErrorCode.CLOCK_SKEW_TOO_HIGH]: 400,
  [ShieldedErrorCode.MISSING_PROOF_FIELD]: 400,
  [ShieldedErrorCode.INVALID_CONFIG]: 400,
  [ShieldedErrorCode.INVALID_ALGORITHM_ID]: 400,
  [ShieldedErrorCode.TLS_CERTIFICATE_INVALID]: 400,

  // 5xx Server Errors
  [ShieldedErrorCode.KEY_NOT_FOUND]: 500,
  [ShieldedErrorCode.UNSUPPORTED_ALGORITHM]: 501,
  [ShieldedErrorCode.REVOCATION_CHECK_FAILED]: 502,
  [ShieldedErrorCode.REGISTRY_UNAVAILABLE]: 503,
  [ShieldedErrorCode.REGISTRY_CIRCUIT_OPEN]: 503, // SECURITY FIX #4
  [ShieldedErrorCode.REVOCATION_CACHE_STALE]: 503,
  [ShieldedErrorCode.WASM_INTEGRITY_FAILED]: 500, // SECURITY FIX #3
  [ShieldedErrorCode.WASM_VERIFICATION_FAILED]: 500, // SECURITY FIX #3
  [ShieldedErrorCode.KEY_IMPORT_FAILED]: 500,
  [ShieldedErrorCode.DECRYPTION_FAILED]: 500,
  [ShieldedErrorCode.PROOF_EXPIRED]: 401,
  [ShieldedErrorCode.NETWORK_ERROR]: 503,
  [ShieldedErrorCode.NETWORK_TIMEOUT]: 504,
  [ShieldedErrorCode.MISSING_CONFIG]: 500,
  [ShieldedErrorCode.UNKNOWN_ERROR]: 500,
  [ShieldedErrorCode.NOT_IMPLEMENTED]: 501,
};

/**
 * Shielded ID Custom Error Class
 * 
 * Extends Error with structured information for logging, monitoring, and client communication
 */
export class ShieldedError extends Error {
  /**
   * @param code - Standard error code (enables monitoring & i18n)
   * @param message - Human-readable message
   * @param details - Additional context (cause, recovery hints, etc)
   * @param httpStatus - Override HTTP status code (default derived from code)
   */
  constructor(
    public code: ShieldedErrorCode,
    message: string,
    public details?: Record<string, unknown>,
    public httpStatus?: number
  ) {
    super(message);
    this.name = "ShieldedError";
    Object.setPrototypeOf(this, ShieldedError.prototype);
    
    // Auto-derive HTTP status if not provided
    if (!this.httpStatus) {
      this.httpStatus = errorCodeToHttpStatus[code] || 500;
    }
  }

  /**
   * Serialize to JSON for API responses and logging
   */
  toJSON() {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
      httpStatus: this.httpStatus
    };
  }

  /**
   * Serialize to structured log entry
   */
  toLogEntry() {
    return {
      errorCode: this.code,
      errorMessage: this.message,
      errorDetails: this.details,
      errorName: this.name,
      stack: this.stack,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get client-safe error message (hides internals in production)
   */
  getClientMessage(isProduction: boolean = true): string {
    if (!isProduction) {
      return this.message;
    }

    // Production: return generic messages
    const clientMessages: Record<ShieldedErrorCode, string> = {
      [ShieldedErrorCode.INVALID_SIGNATURE]: "Proof verification failed",
      [ShieldedErrorCode.KEY_REVOKED]: "Key has been revoked",
      [ShieldedErrorCode.KEY_EXPIRED]: "Key has expired",
      [ShieldedErrorCode.REPLAY_ATTEMPT]: "Proof cannot be reused",
      [ShieldedErrorCode.INVALID_PROOF_FORMAT]: "Invalid proof format",
      [ShieldedErrorCode.INVALID_NONCE]: "Invalid or missing nonce",
      [ShieldedErrorCode.PROOF_EXPIRED]: "Proof has expired",
      [ShieldedErrorCode.INVALID_CLAIM_VALUE]: "Claim value does not match request",
      [ShieldedErrorCode.REGISTRY_UNAVAILABLE]: "Registry service temporarily unavailable",
      [ShieldedErrorCode.REGISTRY_CIRCUIT_OPEN]: "Registry service temporarily unavailable",
      [ShieldedErrorCode.NETWORK_TIMEOUT]: "Request timed out",
      [ShieldedErrorCode.UNKNOWN_ERROR]: "An error occurred during verification",
      [ShieldedErrorCode.INVALID_REQUEST_ID]: "Request validation failed",
      [ShieldedErrorCode.INVALID_TIMESTAMP]: "Request timestamp invalid",
      [ShieldedErrorCode.CONTEXT_BINDING_FAILED]: "Request context validation failed",
      [ShieldedErrorCode.CLOCK_SKEW_TOO_HIGH]: "Clock skew too high",
      [ShieldedErrorCode.REQUEST_ID_MISMATCH]: "Request mismatch",
      [ShieldedErrorCode.KEY_NOT_FOUND]: "Key not found",
      [ShieldedErrorCode.UNSUPPORTED_ALGORITHM]: "Algorithm not supported",
      [ShieldedErrorCode.REVOCATION_CHECK_FAILED]: "Revocation check failed",
      [ShieldedErrorCode.REVOCATION_CACHE_STALE]: "Revocation information may be stale",
      [ShieldedErrorCode.KEY_IMPORT_FAILED]: "Key import failed",
      [ShieldedErrorCode.DECRYPTION_FAILED]: "Decryption failed",
      [ShieldedErrorCode.MISSING_PROOF_FIELD]: "Missing required proof field",
      [ShieldedErrorCode.INVALID_CONFIG]: "Configuration error",
      [ShieldedErrorCode.MISSING_CONFIG]: "Configuration missing",
      [ShieldedErrorCode.INVALID_ALGORITHM_ID]: "Invalid algorithm identifier",
      [ShieldedErrorCode.WASM_INTEGRITY_FAILED]: "Cryptographic module verification failed",
      [ShieldedErrorCode.WASM_VERIFICATION_FAILED]: "Cryptographic module validation failed",
      [ShieldedErrorCode.NETWORK_ERROR]: "Network error occurred",
      [ShieldedErrorCode.TLS_CERTIFICATE_INVALID]: "TLS certificate validation failed",
      [ShieldedErrorCode.NOT_IMPLEMENTED]: "Feature not implemented",
    };

    return clientMessages[this.code] || clientMessages[ShieldedErrorCode.UNKNOWN_ERROR];
  }
}

/**
 * Specialized Error Classes (convenience)
 */

export class CryptoError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "CryptoError";
  }
}

export class RevocationError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "RevocationError";
  }
}

export class ProofValidationError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ProofValidationError";
  }
}

export class ContextError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ContextError";
  }
}

export class ConfigError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ConfigError";
  }
}

export class NetworkError extends ShieldedError {
  constructor(message: string, code: ShieldedErrorCode, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "NetworkError";
  }
}

/**
 * Error Code Categories (for metrics & monitoring)
 */
export const errorCategories: Record<ShieldedErrorCode, string> = {
  [ShieldedErrorCode.INVALID_SIGNATURE]: "security",
  [ShieldedErrorCode.UNSUPPORTED_ALGORITHM]: "config",
  [ShieldedErrorCode.KEY_NOT_FOUND]: "data",
  [ShieldedErrorCode.KEY_IMPORT_FAILED]: "crypto",
  [ShieldedErrorCode.DECRYPTION_FAILED]: "crypto",
  [ShieldedErrorCode.KEY_REVOKED]: "security",
  [ShieldedErrorCode.KEY_EXPIRED]: "security",
  [ShieldedErrorCode.REVOCATION_CHECK_FAILED]: "network",
  [ShieldedErrorCode.REGISTRY_UNAVAILABLE]: "network",
  [ShieldedErrorCode.REGISTRY_CIRCUIT_OPEN]: "network",
  [ShieldedErrorCode.REVOCATION_CACHE_STALE]: "cache",
  [ShieldedErrorCode.INVALID_PROOF_FORMAT]: "validation",
  [ShieldedErrorCode.INVALID_NONCE]: "validation",
  [ShieldedErrorCode.PROOF_EXPIRED]: "validation",
  [ShieldedErrorCode.INVALID_CLAIM_VALUE]: "validation",
  [ShieldedErrorCode.REPLAY_ATTEMPT]: "security",
  [ShieldedErrorCode.MISSING_PROOF_FIELD]: "validation",
  [ShieldedErrorCode.INVALID_REQUEST_ID]: "validation",
  [ShieldedErrorCode.INVALID_TIMESTAMP]: "validation",
  [ShieldedErrorCode.CONTEXT_BINDING_FAILED]: "validation",
  [ShieldedErrorCode.CLOCK_SKEW_TOO_HIGH]: "validation",
  [ShieldedErrorCode.REQUEST_ID_MISMATCH]: "validation",
  [ShieldedErrorCode.NETWORK_ERROR]: "network",
  [ShieldedErrorCode.NETWORK_TIMEOUT]: "network",
  [ShieldedErrorCode.TLS_CERTIFICATE_INVALID]: "security",
  [ShieldedErrorCode.INVALID_CONFIG]: "config",
  [ShieldedErrorCode.MISSING_CONFIG]: "config",
  [ShieldedErrorCode.INVALID_ALGORITHM_ID]: "config",
  [ShieldedErrorCode.WASM_INTEGRITY_FAILED]: "security",
  [ShieldedErrorCode.WASM_VERIFICATION_FAILED]: "security",
  [ShieldedErrorCode.UNKNOWN_ERROR]: "unknown",
  [ShieldedErrorCode.NOT_IMPLEMENTED]: "config",
};
