import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SafetyMode } from "../../src/components/SafetyMode";

vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn(() => ({
    safetyModeEnabled: true,
    decoyModeActive: true,
    panicWipe: vi.fn(),
    setSafetyMode: vi.fn(),
    toggleDecoyMode: vi.fn(),
    createDecoyVault: vi.fn()
  }))
}));

describe("SafetyMode", () => {
  it("renders safety mode panel", () => {
    render(<SafetyMode />);
    expect(screen.getByText("Safety Mode")).toBeInTheDocument();
  });

  it("renders panic wipe button", () => {
    render(<SafetyMode />);
    expect(screen.getByText("Panic Wipe")).toBeInTheDocument();
  });

  it("renders safety mode checkbox", () => {
    render(<SafetyMode />);
    expect(screen.getByLabelText("Safety mode enabled")).toBeInTheDocument();
  });

  it("renders decoy wallet active checkbox", () => {
    render(<SafetyMode />);
    expect(screen.getByLabelText("Decoy wallet active")).toBeInTheDocument();
  });
});
