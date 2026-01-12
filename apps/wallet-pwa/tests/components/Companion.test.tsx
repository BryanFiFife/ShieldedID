import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Companion } from "../../src/components/Companion";

// Mock the wallet store
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn(() => ({
    vaultPayload: null // No master secret initially
  }))
}));

// Mock chat storage
vi.mock("../../src/lib/chat-storage", () => ({
  initChatStore: vi.fn(() => Promise.resolve({
    listMessages: vi.fn(() => Promise.resolve([])),
    addMessage: vi.fn(),
    getProfile: vi.fn(() => Promise.resolve({})),
    setProfile: vi.fn()
  }))
}));

// Mock companion
vi.mock("../../src/lib/companion", () => ({
  createCompanion: vi.fn(() => Promise.resolve({
    mode: "rules",
    respond: vi.fn(() => Promise.resolve("Test response"))
  }))
}));

// Mock document capture
vi.mock("../../src/lib/document-capture", () => ({
  performOCR: vi.fn(() => Promise.resolve({}))
}));

describe("Companion", () => {
  it("renders companion panel", () => {
    render(<Companion />);
    expect(screen.getByText("Companion")).toBeInTheDocument();
  });

  it("shows unlock message when vault is locked", () => {
    render(<Companion />);
    expect(screen.getByText("Unlock the vault to use your local companion.")).toBeInTheDocument();
  });

  it("renders companion container", () => {
    const { container } = render(<Companion />);
    // Check that the panel class exists
    const panel = container.querySelector(".panel");
    expect(panel).toBeInTheDocument();
  });

  it("displays companion heading", () => {
    const { container } = render(<Companion />);
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Companion");
  });

  it("renders with correct structure", () => {
    const { container } = render(<Companion />);
    const panels = container.querySelectorAll(".panel");
    expect(panels.length).toBeGreaterThan(0);
  });

  it("displays information text", () => {
    const { container } = render(<Companion />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it("initializes without errors when vault is locked", () => {
    // Should render without throwing
    expect(() => render(<Companion />)).not.toThrow();
  });
});