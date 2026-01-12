import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Settings } from "../../src/components/Settings";

// Mock the wallet store
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn(() => ({
    lockVault: vi.fn()
  }))
}));

// Mock the zk-agent
vi.mock("../../src/lib/zk-agent", () => ({
  zkAgent: {
    isAgentAvailable: vi.fn(() => Promise.resolve(false))
  }
}));

describe("Settings", () => {
  it("renders settings panel", () => {
    render(<Settings />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows ZK agent status", () => {
    render(<Settings />);
    expect(screen.getByText("Zero-Knowledge Agent")).toBeInTheDocument();
  });

  it("shows recovery options", () => {
    render(<Settings />);
    expect(screen.getByText("Recovery options")).toBeInTheDocument();
  });

  it("shows consent history", () => {
    render(<Settings />);
    expect(screen.getByText("Consent history")).toBeInTheDocument();
  });

  it("renders lock vault button", () => {
    render(<Settings />);
    expect(screen.getByText("Lock Vault")).toBeInTheDocument();
  });
});