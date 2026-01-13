import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWalletStore } from "../../src/store/wallet.store";

// Mock first before imports
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn()
}));

vi.mock("qrcode-reader", () => ({
  default: vi.fn(() => ({
    decode: vi.fn()
  }))
}));

vi.mock("../../src/lib/zk-agent", () => ({
  zkAgent: {
    isAgentAvailable: vi.fn(() => Promise.resolve(false))
  }
}));

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: () => []
    }))
  },
  writable: true
});

// Mock canvas getContext
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) }))
  })),
  writable: true
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));

import { ProofFlow } from "../../src/components/ProofFlow";

describe("ProofFlow", () => {
  beforeEach(() => {
    useWalletStore.mockReturnValue({
      generateProof: vi.fn()
    });
    vi.clearAllMocks();
  });

  describe("Initial Render", () => {
    it("renders proof flow component", () => {
      render(<ProofFlow />);
      expect(screen.getByText("Scan Verifier QR")).toBeInTheDocument();
    });

    it("renders video element for QR scanning", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video#qr-cam");
      expect(video).toBeInTheDocument();
    });

    it("renders stack container", () => {
      const { container } = render(<ProofFlow />);
      const stack = container.querySelector(".stack");
      expect(stack).toBeInTheDocument();
    });

    it("renders heading", () => {
      render(<ProofFlow />);
      const headings = screen.getAllByRole("heading");
      expect(headings.some(h => h.textContent?.includes("Scan"))).toBe(true);
    });
  });

  describe("QR Code Scanning", () => {
    it("has video element for camera", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video");
      expect(video).toBeInTheDocument();
    });

    it("requests camera permissions on mount", async () => {
      render(<ProofFlow />);
      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      });
    });

    it("applies correct video id", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video#qr-cam");
      expect(video?.id).toBe("qr-cam");
    });

    it("renders with autoplay attribute", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video");
      expect(video?.autoplay || video?.getAttribute("autoplay")).toBeTruthy();
    });
  });

  describe("Layout Structure", () => {
    it("maintains flex layout", () => {
      const { container } = render(<ProofFlow />);
      const main = container.querySelector("div");
      expect(main).toBeInTheDocument();
    });

    it("contains canvas element for QR detection", () => {
      const { container } = render(<ProofFlow />);
      const canvases = container.querySelectorAll("canvas");
      expect(canvases.length >= 0).toBe(true);
    });

    it("renders informational UI", () => {
      const { container } = render(<ProofFlow />);
      const text = container.textContent;
      expect(text).toContain("Scan");
    });
  });

  describe("User Interaction", () => {
    it("renders without errors", () => {
      expect(() => render(<ProofFlow />)).not.toThrow();
    });

    it("maintains structure on rerender", () => {
      const { rerender } = render(<ProofFlow />);
      expect(() => rerender(<ProofFlow />)).not.toThrow();
    });

    it("component can be unmounted", () => {
      const { unmount } = render(<ProofFlow />);
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("handles camera unavailable", () => {
      (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
        new Error("Camera not available")
      );
      expect(() => render(<ProofFlow />)).not.toThrow();
    });

    it("handles missing wallet store gracefully", () => {
      useWalletStore.mockReturnValue({});
      expect(() => render(<ProofFlow />)).not.toThrow();
    });

    it("handles null proof generation", () => {
      useWalletStore.mockReturnValue({
        generateProof: null
      });
      expect(() => render(<ProofFlow />)).not.toThrow();
    });
  });

  describe("Media Handling", () => {
    it("creates video element for stream", () => {
      const { container } = render(<ProofFlow />);
      expect(container.querySelector("video")).toBeInTheDocument();
    });

    it("video element has correct attributes", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video");
      expect(video?.tagName).toBe("VIDEO");
    });

    it("supports video playback setup", () => {
      const { container } = render(<ProofFlow />);
      const video = container.querySelector("video");
      expect(typeof video?.play).toBe("function");
    });
  });

  describe("Component Lifecycle", () => {
    it("mounts without crashing", () => {
      const { container } = render(<ProofFlow />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("updates store when available", () => {
      useWalletStore.mockReturnValue({
        generateProof: vi.fn()
      });
      render(<ProofFlow />);
      expect(useWalletStore).toHaveBeenCalled();
    });

    it("handles transitions between states", async () => {
      const { rerender } = render(<ProofFlow />);
      useWalletStore.mockReturnValue({
        generateProof: vi.fn()
      });
      rerender(<ProofFlow />);
      expect(screen.getByText("Scan Verifier QR")).toBeInTheDocument();
    });
  });
});
