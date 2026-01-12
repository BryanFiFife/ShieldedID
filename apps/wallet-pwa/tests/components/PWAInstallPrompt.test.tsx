import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PWAInstallPrompt } from "../../src/components/PWAInstallPrompt";

describe("PWAInstallPrompt", () => {
  beforeEach(() => {
    // Mock window event listeners
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  it("renders without crashing", () => {
    render(<PWAInstallPrompt />);
    // Component renders without throwing
  });
});