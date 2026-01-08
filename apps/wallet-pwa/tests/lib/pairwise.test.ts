import { describe, it, expect } from "vitest";
import { deriveMasterSecret, generatePairwiseSubjectId } from "../../src/lib/pairwise-id";

describe("pairwise id", () => {
  it("generates deterministic ids per origin", async () => {
    const secret = deriveMasterSecret();
    const id1 = await generatePairwiseSubjectId(secret, "https://a.example");
    const id2 = await generatePairwiseSubjectId(secret, "https://a.example");
    const id3 = await generatePairwiseSubjectId(secret, "https://b.example");

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });
});
