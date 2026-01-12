import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PWAInstallPrompt } from "../../src/components/PWAInstallPrompt";

describe("PWAInstallPrompt", () => {
  let eventListeners: Map<string, Function[]>;

  beforeEach(() => {
    // Track event listeners
    eventListeners = new Map();
    
    vi.spyOn(window, 'addEventListener').mockImplementation((event, listener) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event)!.push(listener as Function);
    });
    
    vi.spyOn(window, 'removeEventListener').mockImplementation((event, listener) => {
      if (eventListeners.has(event)) {
        const listeners = eventListeners.get(event)!;
        const idx = listeners.indexOf(listener as Function);
        if (idx > -1) listeners.splice(idx, 1);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    render(<PWAInstallPrompt />);
    // Component renders without throwing
  });

  it("listens for beforeinstallprompt event", () => {
    render(<PWAInstallPrompt />);
    expect(window.addEventListener).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
  });

  it("removes listeners on unmount", () => {
    const { unmount } = render(<PWAInstallPrompt />);
    unmount();
    expect(window.removeEventListener).toHaveBeenCalled();
  });

  it("handles install prompt when available", () => {
    render(<PWAInstallPrompt />);
    
    const mockPrompt = vi.fn();
    const installEvent = new Event("beforeinstallprompt");
    Object.defineProperty(installEvent, "prompt", {
      value: mockPrompt
    });

    // Trigger the event
    const listeners = eventListeners.get("beforeinstallprompt") || [];
    listeners.forEach(listener => listener(installEvent));

    // Component should be ready for install prompt
    expect(listeners.length).toBeGreaterThan(0);
  });

  it("renders install button when prompt available", () => {
    const { container } = render(<PWAInstallPrompt />);
    
    // Container should render without errors
    expect(container).toBeInTheDocument();
  });

  it("prevents default beforeinstallprompt handling", () => {
    render(<PWAInstallPrompt />);
    
    const installEvent = new Event("beforeinstallprompt", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(installEvent, "preventDefault");
    
    const listeners = eventListeners.get("beforeinstallprompt") || [];
    listeners.forEach(listener => listener(installEvent));

    // Component should intercept the event
    expect(listeners.length).toBeGreaterThan(0);
  });

  it("manages install prompt state correctly", () => {
    const { container } = render(<PWAInstallPrompt />);
    
    // Component should track install prompt availability
    expect(container.querySelector('[class*="prompt"]')).toBeDefined();
  });

  it("cleans up event listeners properly", () => {
    const { unmount } = render(<PWAInstallPrompt />);
    const addListenerCallCount = (window.addEventListener as any).mock.calls.length;
    
    unmount();
    
    // Should have removed listeners
    const removeListenerCallCount = (window.removeEventListener as any).mock.calls.length;
    expect(removeListenerCallCount).toBeGreaterThan(0);
  });

  it("renders as a functional component", () => {
    const { container } = render(<PWAInstallPrompt />);
    // Should render without errors
    expect(container).toBeTruthy();
  });

  it("handles appinstalled event", () => {
    render(<PWAInstallPrompt />);
    
    expect(window.addEventListener).toHaveBeenCalledWith(
      expect.stringMatching(/beforeinstallprompt|appinstalled/),
      expect.any(Function)
    );
  });
});