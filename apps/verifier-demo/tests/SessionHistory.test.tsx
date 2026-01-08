import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionHistory } from "../src/components/SessionHistory";

const sessions = [
  {
    id: "1",
    pairwiseSubjectId: "A",
    verifiedAt: "2024-01-01T00:00:00Z",
    claims: [{ type: "AGE_OVER", value: true }]
  },
  {
    id: "2",
    pairwiseSubjectId: "A",
    verifiedAt: "2024-01-02T00:00:00Z",
    claims: [{ type: "AGE_OVER", value: true }]
  }
];

describe("SessionHistory", () => {
  it("shows continuity for matching pairwise IDs", async () => {
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => sessions
      } as Response;
    }) as unknown as typeof fetch;

    render(<SessionHistory />);

    await waitFor(() => {
      expect(screen.getByText(/Same user as/)).toBeInTheDocument();
    });
  });
});
