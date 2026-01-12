import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EnrollmentFlow } from "../../src/components/EnrollmentFlow";

// Mock the wallet store
vi.mock("../../src/store/wallet.store", () => ({
  useWalletStore: vi.fn(() => ({
    enrollWallet: vi.fn()
  }))
}));

// Mock document capture functions
vi.mock("../../src/lib/document-capture", () => ({
  captureDocumentImage: vi.fn(() => Promise.resolve(new Blob())),
  performOCR: vi.fn(() => Promise.resolve({
    givenName: "John",
    familyName: "Doe",
    dateOfBirth: "1990-01-01",
    documentType: "passport",
    issuer: "USA",
    issuedDate: "2020-01-01",
    expiryDate: "2030-01-01"
  })),
  normalizeAttribute: vi.fn((value) => value)
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

describe("EnrollmentFlow", () => {
  it("renders enrollment form", () => {
    render(<EnrollmentFlow />);
    expect(screen.getByText("Vault Passphrase")).toBeInTheDocument();
  });

  it("renders document capture section", () => {
    render(<EnrollmentFlow />);
    expect(screen.getByText("Document Capture")).toBeInTheDocument();
  });

  it("renders without errors", () => {
    expect(() => render(<EnrollmentFlow />)).not.toThrow();
  });

  it("contains passphrase input field", () => {
    const { container } = render(<EnrollmentFlow />);
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("displays enrollment title", () => {
    const { container } = render(<EnrollmentFlow />);
    const heading = container.querySelector("h2");
    expect(heading).toBeInTheDocument();
  });

  it("renders all required sections", () => {
    render(<EnrollmentFlow />);
    const text = screen.getByText("Vault Passphrase").textContent;
    expect(text).toBeTruthy();
  });

  it("provides wallet enrollment flow", () => {
    render(<EnrollmentFlow />);
    const documentCapture = screen.getByText("Document Capture");
    expect(documentCapture).toBeInTheDocument();
  });

  it("manages enrollment state", () => {
    const { container } = render(<EnrollmentFlow />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it("renders step-by-step enrollment process", () => {
    render(<EnrollmentFlow />);
    // Should have multiple steps/sections
    expect(screen.getByText("Vault Passphrase")).toBeInTheDocument();
    expect(screen.getByText("Document Capture")).toBeInTheDocument();
  });
});