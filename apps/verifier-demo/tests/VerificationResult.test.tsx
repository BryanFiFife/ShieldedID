import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VerificationResult } from "../src/components/VerificationResult";

function mockFetch(responses: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : input.url;
    const body = responses[url] ?? null;
    return {
      ok: true,
      json: async () => body
    } as Response;
  }) as unknown as typeof fetch;
}

describe("VerificationResult", () => {
  it("shows fail state", async () => {
    mockFetch({
      "/api/sessions": [],
      "/api/latest-result": { valid: false, reason: "INVALID_SIGNATURE" }
    });

    render(<VerificationResult request={null} />);

    await waitFor(() => {
      expect(screen.getByText(/FAIL/)).toBeInTheDocument();
    });
  });
});
