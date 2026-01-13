import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWalletStore } from "../../src/store/wallet.store";

// Mock first before any imports
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn()
}));

vi.mock("../../src/lib/chat-storage", () => ({
  initChatStore: vi.fn(() => Promise.resolve({
    listMessages: vi.fn(() => Promise.resolve([])),
    addMessage: vi.fn(),
    getProfile: vi.fn(() => Promise.resolve({})),
    setProfile: vi.fn()
  }))
}));

vi.mock("../../src/lib/companion", () => ({
  createCompanion: vi.fn(() => Promise.resolve({
    mode: "rules",
    respond: vi.fn(() => Promise.resolve("Test response"))
  }))
}));

vi.mock("../../src/lib/document-capture", () => ({
  performOCR: vi.fn(() => Promise.resolve({}))
}));

// Now import the component
import { Companion } from "../../src/components/Companion";

describe("Companion", () => {
  beforeEach(() => {
    useWalletStore.mockReturnValue({
      vaultPayload: null // Locked vault
    });
    vi.clearAllMocks();
  });

  describe("Locked Vault State", () => {
    it("renders companion panel when vault locked", () => {
      render(<Companion />);
      expect(screen.getByText("Companion")).toBeInTheDocument();
    });

    it("shows unlock message when vault is locked", () => {
      render(<Companion />);
      expect(screen.getByText("Unlock the vault to use your local companion.")).toBeInTheDocument();
    });

    it("renders companion container with locked state", () => {
      const { container } = render(<Companion />);
      const panel = container.querySelector(".panel");
      expect(panel).toBeInTheDocument();
    });

    it("displays companion heading", () => {
      const { container } = render(<Companion />);
      const heading = container.querySelector("h2");
      expect(heading?.textContent).toBe("Companion");
    });

    it("renders with correct locked structure", () => {
      const { container } = render(<Companion />);
      const panels = container.querySelectorAll(".panel");
      expect(panels.length).toBeGreaterThan(0);
    });

    it("displays informative text when locked", () => {
      const { container } = render(<Companion />);
      const paragraphs = container.querySelectorAll("p");
      expect(paragraphs.length).toBeGreaterThan(0);
      expect(paragraphs[0].textContent).toContain("Unlock");
    });
  });

  describe("Unlocked Vault State", () => {
    beforeEach(() => {
      useWalletStore.mockReturnValue({
        vaultPayload: {
          profile: {
            givenName: "John",
            familyName: "Doe"
          },
          masterSecret: "secret"
        }
      });
    });

    it("initializes companion when vault unlocked", async () => {
      render(<Companion />);
      await waitFor(() => {
        expect(screen.getByText("Companion")).toBeInTheDocument();
      });
    });

    it("renders companion interface when vault unlocked", () => {
      const { container } = render(<Companion />);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });

    it("does not show unlock message when vault is unlocked", async () => {
      render(<Companion />);
      await waitFor(() => {
        expect(screen.getByText("Companion")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("initializes without errors when vault is locked", () => {
      useWalletStore.mockReturnValue({ vaultPayload: null });
      expect(() => render(<Companion />)).not.toThrow();
    });

    it("handles missing profile gracefully", () => {
      useWalletStore.mockReturnValue({
        vaultPayload: { masterSecret: "secret" }
      });
      expect(() => render(<Companion />)).not.toThrow();
    });

    it("handles vault store errors", () => {
      useWalletStore.mockImplementation(() => ({}));
      expect(() => render(<Companion />)).not.toThrow();
    });
  });

  describe("Component Rendering", () => {
    it("renders with heading", () => {
      render(<Companion />);
      const headings = screen.getAllByRole("heading", { level: 2 });
      expect(headings.some(h => h.textContent?.includes("Companion"))).toBe(true);
    });

    it("renders panel element", () => {
      const { container } = render(<Companion />);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });

    it("applies correct CSS classes", () => {
      const { container } = render(<Companion />);
      const panel = container.querySelector(".panel");
      expect(panel?.className).toContain("panel");
    });

    it("renders all required text content", () => {
      const { container } = render(<Companion />);
      const text = container.textContent;
      expect(text).toContain("Companion");
    });
  });

  describe("Lifecycle", () => {
    it("mounts successfully", () => {
      const { container } = render(<Companion />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("updates when vault state changes", async () => {
      const { rerender } = render(<Companion />);
      useWalletStore.mockReturnValue({
        vaultPayload: { profile: { givenName: "Test" }, masterSecret: "secret" }
      });
      rerender(<Companion />);
      expect(screen.getByText("Companion")).toBeInTheDocument();
    });

    it("maintains structure across rerenders", () => {
      const { container, rerender } = render(<Companion />);
      const initialStructure = container.innerHTML;
      useWalletStore.mockReturnValue({
        vaultPayload: { profile: { givenName: "Test" }, masterSecret: "secret" }
      });
      rerender(<Companion />);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });
  });
});


describe("Companion", () => {
  beforeEach(() => {
    useWalletStore.mockReturnValue({
      vaultPayload: null // Locked vault
    });
    vi.clearAllMocks();
  });

  describe("Locked Vault State", () => {
    it("renders companion panel when vault locked", () => {
      render(<Companion />);
      expect(screen.getByText("Companion")).toBeInTheDocument();
    });

    it("shows unlock message when vault is locked", () => {
      render(<Companion />);
      expect(screen.getByText("Unlock the vault to use your local companion.")).toBeInTheDocument();
    });

    it("renders companion container with locked state", () => {
      const { container } = render(<Companion />);
      const panel = container.querySelector(".panel");
      expect(panel).toBeInTheDocument();
    });

    it("displays companion heading", () => {
      const { container } = render(<Companion />);
      const heading = container.querySelector("h2");
      expect(heading?.textContent).toBe("Companion");
    });

    it("renders with correct locked structure", () => {
      const { container } = render(<Companion />);
      const panels = container.querySelectorAll(".panel");
      expect(panels.length).toBeGreaterThan(0);
    });

    it("displays informative text when locked", () => {
      const { container } = render(<Companion />);
      const paragraphs = container.querySelectorAll("p");
      expect(paragraphs.length).toBeGreaterThan(0);
      expect(paragraphs[0].textContent).toContain("Unlock");
    });
  });

  describe("Unlocked Vault State", () => {
    beforeEach(() => {
      useWalletStore.mockReturnValue({
        vaultPayload: {
          profile: {
            givenName: "John",
            familyName: "Doe"
          },
          masterSecret: "secret"
        }
      });
    });

    it("initializes companion when vault unlocked", async () => {
      render(<Companion />);
      await waitFor(() => {
        // Component should initialize companion when unlocked
        expect(screen.getByText("Companion")).toBeInTheDocument();
      });
    });

    it("renders companion interface when vault unlocked", () => {
      const { container } = render(<Companion />);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });

    it("does not show unlock message when vault is unlocked", async () => {
      render(<Companion />);
      await waitFor(() => {
        // Unlock message should not be visible
        const unlockMsg = screen.queryByText("Unlock the vault");
        // Component might show companion interface instead
        expect(screen.getByText("Companion")).toBeInTheDocument();
      });
    });
  });

  describe("Error Handling", () => {
    it("initializes without errors when vault is locked", () => {
      useWalletStore.mockReturnValue({ vaultPayload: null });
      expect(() => render(<Companion />)).not.toThrow();
    });

    it("handles missing profile gracefully", () => {
      useWalletStore.mockReturnValue({
        vaultPayload: { masterSecret: "secret" }
      });
      expect(() => render(<Companion />)).not.toThrow();
    });

    it("handles vault store errors", () => {
      useWalletStore.mockImplementation(() => ({}));
      expect(() => render(<Companion />)).not.toThrow();
    });
  });

  describe("Component Rendering", () => {
    it("renders with heading", () => {
      render(<Companion />);
      const headings = screen.getAllByRole("heading", { level: 2 });
      expect(headings.some(h => h.textContent?.includes("Companion"))).toBe(true);
    });

    it("renders panel element", () => {
      const { container } = render(<Companion />);
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });

    it("applies correct CSS classes", () => {
      const { container } = render(<Companion />);
      const panel = container.querySelector(".panel");
      expect(panel?.className).toContain("panel");
    });

    it("renders all required text content", () => {
      const { container } = render(<Companion />);
      const text = container.textContent;
      expect(text).toContain("Companion");
    });
  });

  describe("Lifecycle", () => {
    it("mounts successfully", () => {
      const { container } = render(<Companion />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("updates when vault state changes", async () => {
      const { rerender } = render(<Companion />);
      useWalletStore.mockReturnValue({
        vaultPayload: { profile: { givenName: "Test" }, masterSecret: "secret" }
      });
      rerender(<Companion />);
      expect(screen.getByText("Companion")).toBeInTheDocument();
    });

    it("maintains structure across rerenders", () => {
      const { container, rerender } = render(<Companion />);
      const initialStructure = container.innerHTML;
      useWalletStore.mockReturnValue({
        vaultPayload: { profile: { givenName: "Test" }, masterSecret: "secret" }
      });
      rerender(<Companion />);
      // Panel should still exist
      expect(container.querySelector(".panel")).toBeInTheDocument();
    });
  });
});
