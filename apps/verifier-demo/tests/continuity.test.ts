import { describe, it, expect } from "vitest";

function detectContinuity(sessions: Array<{ id: string; pairwiseSubjectId: string; verifiedAt: string }>) {
  const seen = new Map<string, string>();
  const results = new Map<string, string>();
  for (const session of sessions.slice().reverse()) {
    if (seen.has(session.pairwiseSubjectId)) {
      results.set(session.id, seen.get(session.pairwiseSubjectId)!);
    } else {
      seen.set(session.pairwiseSubjectId, session.verifiedAt);
    }
  }
  return results;
}

describe("continuity detection", () => {
  it("marks sessions with matching pairwise IDs", () => {
    const sessions = [
      { id: "1", pairwiseSubjectId: "A", verifiedAt: "2024-01-01T00:00:00Z" },
      { id: "2", pairwiseSubjectId: "B", verifiedAt: "2024-01-02T00:00:00Z" },
      { id: "3", pairwiseSubjectId: "A", verifiedAt: "2024-01-03T00:00:00Z" }
    ];
    const map = detectContinuity(sessions);
    expect(map.has("1")).toBe(true);
    expect(map.get("1")).toBe("2024-01-03T00:00:00Z");
  });
});
