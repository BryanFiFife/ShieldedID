import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Idle } from "../../src/pages/Idle";

describe("Idle", () => {
  it("renders idle panel", () => {
    render(<Idle />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });
});