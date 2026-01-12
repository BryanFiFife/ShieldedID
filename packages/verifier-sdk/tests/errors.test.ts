import { describe, it, expect } from "vitest";
import {
  ShieldedError,
  ShieldedErrorCode,
  errorCodeToHttpStatus,
  errorCategories,
  CryptoError,
  RevocationError,
  ProofValidationError,
  ContextError,
  ConfigError,
  NetworkError
} from "../src/errors.js";

describe("ShieldedErrorCode enum", () => {
  it("contains all expected error codes", () => {
    expect(ShieldedErrorCode.INVALID_SIGNATURE).toBe("SHIELDED_ERROR_CRYPTO_INVALID_SIGNATURE");
    expect(ShieldedErrorCode.KEY_REVOKED).toBe("SHIELDED_ERROR_REVOCATION_KEY_REVOKED");
    expect(ShieldedErrorCode.KEY_EXPIRED).toBe("SHIELDED_ERROR_REVOCATION_KEY_EXPIRED");
    expect(ShieldedErrorCode.INVALID_PROOF_FORMAT).toBe("SHIELDED_ERROR_PROOF_INVALID_FORMAT");
    expect(ShieldedErrorCode.INVALID_REQUEST_ID).toBe("SHIELDED_ERROR_CONTEXT_INVALID_REQUEST_ID");
    expect(ShieldedErrorCode.NETWORK_ERROR).toBe("SHIELDED_ERROR_NETWORK_ERROR");
    expect(ShieldedErrorCode.INVALID_CONFIG).toBe("SHIELDED_ERROR_CONFIG_INVALID_CONFIG");
    expect(ShieldedErrorCode.UNKNOWN_ERROR).toBe("SHIELDED_ERROR_UNKNOWN");
  });
});

describe("errorCodeToHttpStatus mapping", () => {
  it("maps crypto errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_SIGNATURE]).toBe(401);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.UNSUPPORTED_ALGORITHM]).toBe(501);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.KEY_NOT_FOUND]).toBe(500);
  });

  it("maps revocation errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.KEY_REVOKED]).toBe(401);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.KEY_EXPIRED]).toBe(401);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.REVOCATION_CHECK_FAILED]).toBe(502);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.REGISTRY_UNAVAILABLE]).toBe(503);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.REGISTRY_CIRCUIT_OPEN]).toBe(503);
  });

  it("maps proof validation errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_PROOF_FORMAT]).toBe(400);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_NONCE]).toBe(400);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.PROOF_EXPIRED]).toBe(401);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_CLAIM_VALUE]).toBe(400);
  });

  it("maps context errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_REQUEST_ID]).toBe(400);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_TIMESTAMP]).toBe(400);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.REQUEST_ID_MISMATCH]).toBe(403);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.CONTEXT_BINDING_FAILED]).toBe(403);
  });

  it("maps network errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.NETWORK_ERROR]).toBe(503);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.NETWORK_TIMEOUT]).toBe(504);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.TLS_CERTIFICATE_INVALID]).toBe(400);
  });

  it("maps config errors to appropriate HTTP status codes", () => {
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_CONFIG]).toBe(400);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.MISSING_CONFIG]).toBe(500);
    expect(errorCodeToHttpStatus[ShieldedErrorCode.INVALID_ALGORITHM_ID]).toBe(400);
  });
});

describe("errorCategories mapping", () => {
  it("categorizes crypto errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.INVALID_SIGNATURE]).toBe("security");
    expect(errorCategories[ShieldedErrorCode.UNSUPPORTED_ALGORITHM]).toBe("config");
    expect(errorCategories[ShieldedErrorCode.KEY_NOT_FOUND]).toBe("data");
    expect(errorCategories[ShieldedErrorCode.KEY_IMPORT_FAILED]).toBe("crypto");
    expect(errorCategories[ShieldedErrorCode.DECRYPTION_FAILED]).toBe("crypto");
  });

  it("categorizes revocation errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.KEY_REVOKED]).toBe("security");
    expect(errorCategories[ShieldedErrorCode.KEY_EXPIRED]).toBe("security");
    expect(errorCategories[ShieldedErrorCode.REVOCATION_CHECK_FAILED]).toBe("network");
    expect(errorCategories[ShieldedErrorCode.REGISTRY_UNAVAILABLE]).toBe("network");
    expect(errorCategories[ShieldedErrorCode.REVOCATION_CACHE_STALE]).toBe("cache");
  });

  it("categorizes validation errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.INVALID_PROOF_FORMAT]).toBe("validation");
    expect(errorCategories[ShieldedErrorCode.INVALID_NONCE]).toBe("validation");
    expect(errorCategories[ShieldedErrorCode.PROOF_EXPIRED]).toBe("validation");
    expect(errorCategories[ShieldedErrorCode.INVALID_CLAIM_VALUE]).toBe("validation");
    expect(errorCategories[ShieldedErrorCode.REPLAY_ATTEMPT]).toBe("security");
  });

  it("categorizes network errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.NETWORK_ERROR]).toBe("network");
    expect(errorCategories[ShieldedErrorCode.NETWORK_TIMEOUT]).toBe("network");
    expect(errorCategories[ShieldedErrorCode.TLS_CERTIFICATE_INVALID]).toBe("security");
  });

  it("categorizes config errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.INVALID_CONFIG]).toBe("config");
    expect(errorCategories[ShieldedErrorCode.MISSING_CONFIG]).toBe("config");
    expect(errorCategories[ShieldedErrorCode.WASM_INTEGRITY_FAILED]).toBe("security");
    expect(errorCategories[ShieldedErrorCode.WASM_VERIFICATION_FAILED]).toBe("security");
  });
});

describe("ShieldedError class", () => {
  it("creates error with code and message", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.INVALID_SIGNATURE,
      "Signature verification failed"
    );

    expect(error.code).toBe(ShieldedErrorCode.INVALID_SIGNATURE);
    expect(error.message).toBe("Signature verification failed");
    expect(error.name).toBe("ShieldedError");
    expect(error.httpStatus).toBe(401);
  });

  it("creates error with details", () => {
    const details = { walletId: "test-wallet", keyId: "test-key" };
    const error = new ShieldedError(
      ShieldedErrorCode.KEY_REVOKED,
      "Key has been revoked",
      details
    );

    expect(error.details).toEqual(details);
    expect(error.httpStatus).toBe(401);
  });

  it("allows custom HTTP status override", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.INVALID_SIGNATURE,
      "Custom status test",
      undefined,
      418 // I'm a teapot
    );

    expect(error.httpStatus).toBe(418);
  });

  it("serializes to JSON correctly", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.NETWORK_ERROR,
      "Network failure",
      { retryAfter: 30 }
    );

    const json = error.toJSON();
    expect(json.error).toBe(ShieldedErrorCode.NETWORK_ERROR);
    expect(json.message).toBe("Network failure");
    expect(json.details).toEqual({ retryAfter: 30 });
    expect(json.httpStatus).toBe(503);
    expect(json.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("serializes to log entry correctly", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.INVALID_CONFIG,
      "Configuration error"
    );

    const logEntry = error.toLogEntry();
    expect(logEntry.errorCode).toBe(ShieldedErrorCode.INVALID_CONFIG);
    expect(logEntry.errorMessage).toBe("Configuration error");
    expect(logEntry.errorName).toBe("ShieldedError");
    expect(logEntry.stack).toBeDefined();
    expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns client-safe message in production", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.INVALID_SIGNATURE,
      "Detailed internal error message"
    );

    expect(error.getClientMessage(true)).toBe("Proof verification failed");
    expect(error.getClientMessage()).toBe("Proof verification failed"); // default is production
  });

  it("returns full message in development", () => {
    const error = new ShieldedError(
      ShieldedErrorCode.INVALID_SIGNATURE,
      "Detailed internal error message"
    );

    expect(error.getClientMessage(false)).toBe("Detailed internal error message");
  });
});

describe("Specialized Error Classes", () => {
  it("CryptoError sets correct name", () => {
    const error = new CryptoError("Crypto operation failed", ShieldedErrorCode.DECRYPTION_FAILED);
    expect(error.name).toBe("CryptoError");
    expect(error.code).toBe(ShieldedErrorCode.DECRYPTION_FAILED);
  });

  it("RevocationError sets correct name", () => {
    const error = new RevocationError("Key revoked", ShieldedErrorCode.KEY_REVOKED);
    expect(error.name).toBe("RevocationError");
    expect(error.code).toBe(ShieldedErrorCode.KEY_REVOKED);
  });

  it("ProofValidationError sets correct name", () => {
    const error = new ProofValidationError("Invalid proof", ShieldedErrorCode.INVALID_PROOF_FORMAT);
    expect(error.name).toBe("ProofValidationError");
    expect(error.code).toBe(ShieldedErrorCode.INVALID_PROOF_FORMAT);
  });

  it("ContextError sets correct name", () => {
    const error = new ContextError("Context binding failed", ShieldedErrorCode.CONTEXT_BINDING_FAILED);
    expect(error.name).toBe("ContextError");
    expect(error.code).toBe(ShieldedErrorCode.CONTEXT_BINDING_FAILED);
  });

  it("ConfigError sets correct name", () => {
    const error = new ConfigError("Invalid config", ShieldedErrorCode.INVALID_CONFIG);
    expect(error.name).toBe("ConfigError");
    expect(error.code).toBe(ShieldedErrorCode.INVALID_CONFIG);
  });

  it("NetworkError sets correct name", () => {
    const error = new NetworkError("Network timeout", ShieldedErrorCode.NETWORK_TIMEOUT);
    expect(error.name).toBe("NetworkError");
    expect(error.code).toBe(ShieldedErrorCode.NETWORK_TIMEOUT);
  });

  it("provides client-safe error messages", () => {
    const error = new ShieldedError(ShieldedErrorCode.INVALID_SIGNATURE, "Signature invalid");
    expect(error.getClientMessage()).toBe("Proof verification failed");
    
    const unknownError = new ShieldedError(ShieldedErrorCode.UNKNOWN_ERROR, "Something went wrong");
    expect(unknownError.getClientMessage()).toBe("An error occurred during verification");
  });

  it("falls back to unknown error message for unmapped codes", () => {
    // Use a code that's not in the clientMessages mapping
    const error = new ShieldedError("UNMAPPED_CODE" as ShieldedErrorCode, "Some unmapped error");
    expect(error.getClientMessage()).toBe("An error occurred during verification");
  });

  it("categorizes errors correctly", () => {
    expect(errorCategories[ShieldedErrorCode.INVALID_SIGNATURE]).toBe("security");
    expect(errorCategories[ShieldedErrorCode.KEY_NOT_FOUND]).toBe("data");
    expect(errorCategories[ShieldedErrorCode.NETWORK_ERROR]).toBe("network");
    expect(errorCategories[ShieldedErrorCode.INVALID_CONFIG]).toBe("config");
    expect(errorCategories[ShieldedErrorCode.UNKNOWN_ERROR]).toBe("unknown");
  });

  it("serializes to JSON correctly", () => {
    const error = new ShieldedError(ShieldedErrorCode.INVALID_SIGNATURE, "Test error", { extra: "data" });
    const json = error.toJSON();
    
    expect(json.error).toBe(ShieldedErrorCode.INVALID_SIGNATURE);
    expect(json.message).toBe("Test error");
    expect(json.details).toEqual({ extra: "data" });
    expect(json.httpStatus).toBe(401);
    expect(json.timestamp).toBeDefined();
  });

  it("auto-derives HTTP status when not provided", () => {
    const error = new ShieldedError(ShieldedErrorCode.INVALID_SIGNATURE, "Test");
    expect(error.httpStatus).toBe(401);
    
    const customError = new ShieldedError(ShieldedErrorCode.INVALID_SIGNATURE, "Test");
    customError.httpStatus = 400; // Manually set
    expect(customError.httpStatus).toBe(400);
  });
});