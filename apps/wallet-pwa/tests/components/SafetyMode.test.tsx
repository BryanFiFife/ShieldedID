import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SafetyMode } from "../../src/components/SafetyMode";

vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: () => ({
    panicWipe: vi.fn(),
    safetyModeEnabled: true,
    setSafetyMode: vi.fn(),
    decoyModeActive: false,
    toggleDecoyMode: vi.fn(),
    createDecoyVault: vi.fn()
  })
}));

describe("SafetyMode", () => {
  it("renders panic wipe", () => {
    render(<SafetyMode />);
    expect(screen.getByText("Panic Wipe")).toBeInTheDocument();
  });
});
