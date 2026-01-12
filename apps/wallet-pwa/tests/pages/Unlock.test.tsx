import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Unlock } from "../../src/pages/Unlock";

describe("Unlock", () => {
  it("renders unlock panel", () => {
    render(<Unlock />);
    expect(screen.getByText("Unlock")).toBeInTheDocument();
  });
});