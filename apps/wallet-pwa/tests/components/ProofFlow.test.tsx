import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProofFlow } from "../../src/components/ProofFlow";

// Mock the wallet store
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn(() => ({
    generateProof: vi.fn()
  }))
}));

// Mock qrcode-reader
vi.mock("qrcode-reader", () => ({
  default: vi.fn(() => ({
    decode: vi.fn()
  }))
}));

// Mock zk-agent
vi.mock("../../src/lib/zk-agent", () => ({
  zkAgent: {
    isAgentAvailable: vi.fn(() => Promise.resolve(false))
  }
}));

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: () => []
    }))
  },
  writable: true
});

describe("ProofFlow", () => {
  it("renders proof flow", () => {
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

  it("renders panel with heading", () => {
    const { container } = render(<ProofFlow />);
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Scan Verifier QR");
  });

  it("initializes with scan step", () => {
    const { container } = render(<ProofFlow />);
    // Check for video element which is shown in scan step
    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video?.id).toBe("qr-cam");
  });

  it("video element has correct attributes", () => {
    const { container } = render(<ProofFlow />);
    const video = container.querySelector("video#qr-cam") as HTMLVideoElement | null;
    expect(video?.autoplay).toBe(true);
    expect(video?.getAttribute("playsinline")).toBe("");
  });

  it("mounts without errors", () => {
    expect(() => render(<ProofFlow />)).not.toThrow();
  });
});