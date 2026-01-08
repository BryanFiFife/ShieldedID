import { describe, it, expect } from "vitest";
import { buildMerkleTree, commitAttribute, verifyMerkleProof } from "../../src/lib/commitments";

const encoder = new TextEncoder();

async function hashPair(left: string, right: string): Promise<string> {
  const data = encoder.encode(`${left}:${right}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeProof(commitments: string[], targetIndex: number): Promise<string[]> {
  const proof: string[] = [];
  let index = targetIndex;
  let level = commitments;
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      if (i === index || i + 1 === index) {
        const isRight = index % 2 === 1;
        const sibling = isRight ? left : right;
        proof.push(`${isRight ? "L" : "R"}:${sibling}`);
        index = Math.floor(i / 2);
      }
      nextLevel.push(await hashPair(left, right));
    }
    level = nextLevel;
  }
  return proof;
}

describe("commitments", () => {
  it("verifies merkle proofs", async () => {
    const salt = new Uint8Array([1, 2, 3]);
    const commitments = await Promise.all([
      commitAttribute("A", salt),
      commitAttribute("B", salt),
      commitAttribute("C", salt)
    ]);
    const tree = await buildMerkleTree(commitments);
    const proof = await makeProof(commitments, 0);
    const ok = await verifyMerkleProof("A", salt, tree.root, proof);
    expect(ok).toBe(true);
  });
});
