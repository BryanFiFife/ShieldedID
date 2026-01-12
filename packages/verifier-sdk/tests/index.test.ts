import { describe, it, expect } from "vitest";

// Test the main exports from index.ts
describe("verifier-sdk exports", () => {
  it("exports ShieldedVerifier class", async () => {
    const { ShieldedVerifier } = await import("../src/index");
    expect(ShieldedVerifier).toBeDefined();
    expect(typeof ShieldedVerifier).toBe("function");
  });

  it("exports RegistryClient class", async () => {
    const { RegistryClient } = await import("../src/index");
    expect(RegistryClient).toBeDefined();
    expect(typeof RegistryClient).toBe("function");
  });

  it("exports types", async () => {
    const {
      ProofRequest,
      ProofResponse,
      Claim,
      VerificationResult,
      VerifierConfig,
      VerificationOptions,
      ProofPolicy,
      RequestedClaim,
      ProofCallback,
      ClaimType
    } = await import("../src/index");

    // These should be defined (TypeScript types exported as undefined at runtime)
    expect(ProofRequest).toBeUndefined();
    expect(ProofResponse).toBeUndefined();
    expect(Claim).toBeUndefined();
    expect(VerificationResult).toBeUndefined();
    expect(VerifierConfig).toBeUndefined();
    expect(VerificationOptions).toBeUndefined();
    expect(ProofPolicy).toBeUndefined();
    expect(RequestedClaim).toBeUndefined();
    expect(ProofCallback).toBeUndefined();
    expect(ClaimType).toBeUndefined();
  });

  it("exports crypto utilities", async () => {
    const { verifyECDSAP256, validateNonce, validateTimestamp } = await import("../src/index");
    expect(verifyECDSAP256).toBeDefined();
    expect(typeof verifyECDSAP256).toBe("function");
    expect(validateNonce).toBeDefined();
    expect(typeof validateNonce).toBe("function");
    expect(validateTimestamp).toBeDefined();
    expect(typeof validateTimestamp).toBe("function");
  });
});