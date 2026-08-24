import { describe, expect, it } from "vitest";
import {
  create_numeric_commitment,
  prove_ge_attested,
  prove_le_attested,
  source_commitment_from_public_inputs,
  verify_ge_components,
  verify_le_components
} from "../index.js";

const context = "https://verifier.example|nonce-123|2026-12-31T23:59:59Z";

function copy(bytes: Uint8Array) {
  return Uint8Array.from(bytes);
}

describe("real Bulletproof bound proofs", () => {
  it("proves >= without serializing the witness", async () => {
    const source = await create_numeric_commitment(25);
    const bundle = await prove_ge_attested(25, 18, context, source.blinding);

    const publicText = new TextDecoder().decode(bundle.public_inputs);
    expect(publicText).not.toContain("|25|");
    expect(await verify_ge_components(bundle.commitment, bundle.proof, bundle.public_inputs, 18, context)).toBe(true);

    const extracted = await source_commitment_from_public_inputs(bundle.public_inputs);
    const expectedSource = await create_numeric_commitment(25, source.blinding);
    expect(Array.from(extracted)).toEqual(Array.from(Buffer.from(expectedSource.commitment, "base64url")));
  });

  it("refuses to generate an under-threshold proof", async () => {
    const source = await create_numeric_commitment(17);
    await expect(prove_ge_attested(17, 18, context, source.blinding)).rejects.toThrow();
  });

  it("rejects bound, context, proof and commitment tampering", async () => {
    const source = await create_numeric_commitment(25);
    const bundle = await prove_ge_attested(25, 18, context, source.blinding);

    expect(await verify_ge_components(bundle.commitment, bundle.proof, bundle.public_inputs, 21, context)).toBe(false);
    expect(await verify_ge_components(bundle.commitment, bundle.proof, bundle.public_inputs, 18, "wrong-context")).toBe(false);

    const tamperedProof = copy(bundle.proof);
    tamperedProof[0] ^= 0x01;
    expect(await verify_ge_components(bundle.commitment, tamperedProof, bundle.public_inputs, 18, context)).toBe(false);

    const tamperedCommitment = copy(bundle.commitment);
    tamperedCommitment[0] ^= 0x01;
    expect(await verify_ge_components(tamperedCommitment, bundle.proof, bundle.public_inputs, 18, context)).toBe(false);
  });

  it("produces unlinkable proof transcripts for the same witness", async () => {
    const source = await create_numeric_commitment(25);
    const a = await prove_ge_attested(25, 18, context, source.blinding);
    const b = await prove_ge_attested(25, 18, context, source.blinding);

    expect(Buffer.from(a.proof).equals(Buffer.from(b.proof))).toBe(false);
    expect(await verify_ge_components(a.commitment, a.proof, a.public_inputs, 18, context)).toBe(true);
    expect(await verify_ge_components(b.commitment, b.proof, b.public_inputs, 18, context)).toBe(true);
  });

  it("proves <= for date/cutoff style predicates", async () => {
    const dobEpochDay = 9_000;
    const adultCutoffEpochDay = 15_000;
    const source = await create_numeric_commitment(dobEpochDay);
    const bundle = await prove_le_attested(dobEpochDay, adultCutoffEpochDay, context, source.blinding);

    expect(await verify_le_components(
      bundle.commitment,
      bundle.proof,
      bundle.public_inputs,
      adultCutoffEpochDay,
      context
    )).toBe(true);

    expect(await verify_le_components(
      bundle.commitment,
      bundle.proof,
      bundle.public_inputs,
      adultCutoffEpochDay - 7_000,
      context
    )).toBe(false);
  });
});
