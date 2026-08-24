import { describe, expect, it } from "vitest";
import * as zk from "../index.js";

/**
 * Regression gate for the v1.5.0 failure mode: unsupported predicates must not
 * be represented by deterministic byte blobs or plaintext witness checks.
 * Only primitives that perform cryptographic verification are exported.
 */
describe("cryptographic surface area", () => {
  it("exports only implemented bound-proof primitives", () => {
    expect(typeof zk.prove_ge_attested).toBe("function");
    expect(typeof zk.prove_le_attested).toBe("function");
    expect(typeof zk.verify_ge_components).toBe("function");
    expect(typeof zk.verify_le_components).toBe("function");
  });

  it.each([
    "prove_age_range",
    "prove_string_equality",
    "prove_membership_in_list",
    "prove_not_in_list",
    "prove_string_prefix"
  ])("does not advertise unimplemented predicate %s", (name) => {
    expect((zk as Record<string, unknown>)[name]).toBeUndefined();
  });
});
