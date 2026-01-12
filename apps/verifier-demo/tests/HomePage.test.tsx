import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HomePage } from "../src/components/HomePage";

describe("HomePage", () => {
  it("renders request options", () => {
    render(<HomePage onSelect={() => undefined} />);
    expect(screen.getByText("Verify Age (Over 18)")).toBeInTheDocument();
    expect(screen.getByText("Assurance Tier 2")).toBeInTheDocument();
  });
});
