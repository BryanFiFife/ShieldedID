import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { App } from "../src/App";
import { useWalletStore } from "../src/store/wallet.store";

vi.mock("../src/store/wallet.store", () => {
  const useWalletStore = () => stableMockStore;
  useWalletStore.getState = () => stableMockStore;
  
  return {
    useWalletStore
  };
});

// Create a stable mock store reference for testing
const stableMockStore = {
  currentFlow: "idle" as const,
  vaultLocked: false,
  initState: "loading" as const,
  unlockVault: vi.fn(),
  setFlow: vi.fn(),
  setInitState: vi.fn((state) => { stableMockStore.initState = state; }),
  getState: vi.fn(() => stableMockStore)
};

// Reset mock store to initial state before each test
beforeEach(async () => {
  stableMockStore.currentFlow = "idle";
  stableMockStore.vaultLocked = false;
  stableMockStore.initState = "loading";
  stableMockStore.unlockVault.mockClear();
  stableMockStore.setFlow.mockClear();
  stableMockStore.setInitState.mockClear();
  stableMockStore.getState.mockClear();
  
  // Reset vault storage mock to default (no vault exists)
  const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
  loadVaultEnvelope.mockResolvedValue(null);
});

// Mock vault storage
vi.mock("../src/lib/vault-storage", () => ({
  loadVaultEnvelope: vi.fn().mockResolvedValue(null) // Default: no vault exists
}));

// Mock service worker
vi.mock("../src/components/PWAInstallPrompt", () => ({
  PWAInstallPrompt: () => <div data-testid="pwa-install-prompt">PWA Install Prompt</div>
}));

// Mock components
vi.mock("../src/components/EnrollmentFlow", () => ({
  EnrollmentFlow: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="enrollment-flow">
      <button onClick={onComplete} data-testid="complete-enrollment">Complete Enrollment</button>
    </div>
  )
}));

vi.mock("../src/components/ProofFlow", () => ({
  ProofFlow: () => <div data-testid="proof-flow">Proof Flow</div>
}));

vi.mock("../src/components/SafetyMode", () => ({
  SafetyMode: () => <div data-testid="safety-mode">Safety Mode</div>
}));

vi.mock("../src/components/Settings", () => ({
  Settings: () => <div data-testid="settings">Settings</div>
}));

vi.mock("../src/components/Companion", () => ({
  Companion: () => <div data-testid="companion">Companion</div>
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock store state
    stableMockStore.currentFlow = "idle";
    stableMockStore.vaultLocked = false;
    stableMockStore.initState = "loading";

    // Mock service worker
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue({})
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("shows loading state initially", () => {
      render(<App />);
      expect(screen.getByText("Initializing...")).toBeInTheDocument();
      expect(screen.getByText("Loading wallet...")).toBeInTheDocument();
    });

    it("registers service worker on mount", async () => {
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue(null);

      render(<App />);

      await waitFor(() => {
        expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/service-worker.js");
      });
    });

    it("handles service worker registration failure gracefully", async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue(null);

      (navigator.serviceWorker.register as any).mockRejectedValue(new Error("SW failed"));

      render(<App />);

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith("Service worker registration failed:", expect.any(Error));
      });

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Unlock Flow", () => {
    beforeEach(async () => {
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue({}); // Vault exists
      stableMockStore.initState = "unlock";
    });

    it("shows unlock screen when vault exists", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Unlock Wallet")).toBeInTheDocument();
      });
    });

    it("handles successful vault unlock", async () => {
      stableMockStore.unlockVault.mockResolvedValue(undefined);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Unlock Wallet")).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Enter passphrase");
      const button = screen.getByRole("button", { name: "Unlock" });

      fireEvent.change(input, { target: { value: "test-passphrase" } });
      fireEvent.click(button);

      await waitFor(() => {
        expect(stableMockStore.unlockVault).toHaveBeenCalledWith("test-passphrase");
        expect(stableMockStore.setFlow).toHaveBeenCalledWith("idle");
      });
    });

    it("handles unlock failure", async () => {
      stableMockStore.unlockVault.mockRejectedValue(new Error("Invalid passphrase"));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("Unlock Wallet")).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Enter passphrase");
      const button = screen.getByRole("button", { name: "Unlock" });

      fireEvent.change(input, { target: { value: "wrong-passphrase" } });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText("Unlock failed: Invalid passphrase")).toBeInTheDocument();
      });
    });
  });

  describe("Enrollment Flow", () => {
    beforeEach(async () => {
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue(null); // No vault
      stableMockStore.initState = "enroll";
    });

    it("shows enrollment flow when no vault exists", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();
      });
    });

    it("transitions to ready state after enrollment completion", async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();
      });

      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      await waitFor(() => {
        expect(stableMockStore.setFlow).toHaveBeenCalledWith("idle");
      });
    });
  });

  describe("Main Wallet Interface", () => {
    beforeEach(async () => {
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue(null); // No vault initially

      // Mock fetch for auth flows
      global.fetch = vi.fn();
    });

    it("renders main interface after initialization", async () => {
      stableMockStore.initState = "enroll";
      
      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      expect(screen.getByText("Shielded ID Wallet")).toBeInTheDocument();
      expect(screen.getByTestId("pwa-install-prompt")).toBeInTheDocument();
    });

    it("shows vault locked message when vault is locked", () => {
      stableMockStore.initState = "ready";
      stableMockStore.vaultLocked = true;

      render(<App />);

      expect(screen.getByText("Vault locked. Unlock to continue.")).toBeInTheDocument();
    });

    it("renders different flows based on currentFlow", async () => {
      stableMockStore.initState = "ready";
      
      // Test enrollment flow
      stableMockStore.currentFlow = "enrollment";
      const { rerender } = render(<App />);
      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      // Test proof flow
      stableMockStore.currentFlow = "proof";
      rerender(<App />);
      expect(screen.getByTestId("proof-flow")).toBeInTheDocument();

      // Test settings flow
      stableMockStore.currentFlow = "settings";
      rerender(<App />);
      expect(screen.getByTestId("settings")).toBeInTheDocument();

      // Test companion flow
      stableMockStore.currentFlow = "companion";
      rerender(<App />);
      expect(screen.getByTestId("companion")).toBeInTheDocument();

      // Test idle flow (default)
      stableMockStore.currentFlow = "idle";
      rerender(<App />);
      expect(screen.getByTestId("safety-mode")).toBeInTheDocument();
    });

    it("provides navigation buttons for different flows", async () => {
      stableMockStore.initState = "enroll";
      
      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      const enrollButton = screen.getByRole("button", { name: "Enroll" });
      const proofButton = screen.getByRole("button", { name: "Proof" });
      const companionButton = screen.getByRole("button", { name: "Companion" });
      const settingsButton = screen.getByRole("button", { name: "Settings" });

      fireEvent.click(enrollButton);
      expect(stableMockStore.setFlow).toHaveBeenCalledWith("enrollment");

      fireEvent.click(proofButton);
      expect(stableMockStore.setFlow).toHaveBeenCalledWith("proof");

      fireEvent.click(companionButton);
      expect(stableMockStore.setFlow).toHaveBeenCalledWith("companion");

      fireEvent.click(settingsButton);
      expect(stableMockStore.setFlow).toHaveBeenCalledWith("settings");
    });
  });

  describe("Authentication Flow", () => {
    beforeEach(async () => {
      const { loadVaultEnvelope } = await import("../src/lib/vault-storage");
      (loadVaultEnvelope as any).mockResolvedValue(null);

      stableMockStore.initState = "enroll";

      // Mock fetch
      global.fetch = vi.fn();
    });

    it("shows login form when auth mode is login", async () => {
      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      // Complete enrollment to get to main interface
      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      const loginButton = screen.getByRole("button", { name: "Login" });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      });
    });

    it("handles successful login", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true })
      });

      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      // Navigate to login
      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      const loginButton = screen.getByRole("button", { name: "Login" });
      fireEvent.click(loginButton);

      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText("Email");
        const passwordInput = screen.getByPlaceholderText("Password");
        const submitButton = screen.getByRole("button", { name: "Login" });

        fireEvent.change(emailInput, { target: { value: "test@example.com" } });
        fireEvent.change(passwordInput, { target: { value: "password123" } });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/user/login",
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email: "test@example.com", password: "password123" })
          })
        );
      });
    });

    it("shows signup form when auth mode is signup", async () => {
      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      // Navigate to login first, then signup
      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      const loginButton = screen.getByRole("button", { name: "Login" });
      fireEvent.click(loginButton);

      await waitFor(() => {
        const signupButton = screen.getByRole("button", { name: "Create Account" });
        fireEvent.click(signupButton);
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Password (min 12 chars)")).toBeInTheDocument();
      });
    });

    it("validates password length during signup", async () => {
      const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(() => Promise.resolve(new Response()));

      const { rerender } = render(<App />);

      expect(screen.getByTestId("enrollment-flow")).toBeInTheDocument();

      // Navigate to signup
      const completeButton = screen.getByTestId("complete-enrollment");
      fireEvent.click(completeButton);

      stableMockStore.initState = "ready";
      rerender(<App />);

      const loginButton = screen.getByRole("button", { name: "Login" });
      fireEvent.click(loginButton);

      await waitFor(() => {
        const signupButton = screen.getByRole("button", { name: "Create Account" });
        fireEvent.click(signupButton);
      });

      await waitFor(() => {
        const emailInput = screen.getByPlaceholderText("Email");
        const passwordInput = screen.getByPlaceholderText("Password (min 12 chars)");
        const submitButton = screen.getByRole("button", { name: "Sign Up" });

        act(() => {
          fireEvent.change(emailInput, { target: { value: "test@example.com" } });
          fireEvent.change(passwordInput, { target: { value: "short" } });
        });
        
        // Wait for the password to be set
        expect(passwordInput).toHaveValue("short");
        
        act(() => {
          fireEvent.click(submitButton);
        });
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});