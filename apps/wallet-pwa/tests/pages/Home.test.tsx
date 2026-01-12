import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Home } from "../../src/pages/Home";

describe("Home", () => {
  it("renders home panel", () => {
    render(<Home />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});