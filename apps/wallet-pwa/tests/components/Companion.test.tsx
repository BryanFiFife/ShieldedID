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
});