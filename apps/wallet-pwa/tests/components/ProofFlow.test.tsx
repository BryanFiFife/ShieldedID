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
});