import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContinuousAuthManager,
  DeviceFingerprint,
  ProofRecord,
  createContinuousAuthMiddleware
} from "../src/continuous-auth.js";

describe("ContinuousAuthManager", () => {
  let manager: ContinuousAuthManager;
  let mockDevice: DeviceFingerprint;
  let mockProof: ProofRecord;

  beforeEach(() => {
    manager = new ContinuousAuthManager(3600000); // 1 hour TTL
    mockDevice = {
      userAgent: "Mozilla/5.0 Test Browser",
      screenResolution: "1920x1080",
      timezone: "America/New_York",
      languages: ["en-US", "en"],
      timestamp: new Date().toISOString()
    };
    mockProof = {
      requestId: "test-request-123",
      nonce: "test-nonce-456",
      verifiedAt: new Date().toISOString(),
      claims: [
        { claimType: "AGE_OVER", claimValue: true },
        { claimType: "KYC_LEVEL", claimValue: true }
      ]
    };
  });

  describe("createSession", () => {
    it("creates a new session with correct properties", async () => {
      const session = await manager.createSession(
        "session-123",
        "user-456",
        mockDevice,
        mockProof
      );

      expect(session.sessionId).toBe("session-123");
      expect(session.pairwiseSubjectId).toBe("user-456");
      expect(session.bindings.device).toEqual(mockDevice);
      expect(session.proofs).toEqual([mockProof]);
      expect(session.status).toBe("active");
      expect(session.createdAt).toBeDefined();
      expect(session.expiresAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
    });

    it("sets expiration based on TTL", async () => {
      const before = new Date();
      const session = await manager.createSession(
        "session-123",
        "user-456",
        mockDevice,
        mockProof
      );
      const after = new Date();

      const createdAt = new Date(session.createdAt);
      const expiresAt = new Date(session.expiresAt);

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(expiresAt.getTime() - createdAt.getTime()).toBe(3600000); // 1 hour
    });
  });

  describe("refreshSession", () => {
    it("refreshes existing session successfully", async () => {
      // Create initial session
      await manager.createSession("session-123", "user-456", mockDevice, mockProof);

      // Refresh with new proof
      const newProof = { ...mockProof, requestId: "new-request-789" };
      const updatedSession = await manager.refreshSession("session-123", newProof, mockDevice);

      expect(updatedSession).toBeDefined();
      expect(updatedSession!.sessionId).toBe("session-123");
      expect(updatedSession!.proofs).toHaveLength(2);
      expect(updatedSession!.proofs[1]).toEqual(newProof);
      expect(updatedSession!.status).toBe("active");
    });

    it("extends session expiration on refresh", async () => {
      // Create initial session
      const initialSession = await manager.createSession("session-123", "user-456", mockDevice, mockProof);
      const initialExpiry = new Date(initialSession.expiresAt);
      const initialActivity = new Date(initialSession.lastActivityAt);

      // Wait a bit and refresh
      await new Promise(resolve => setTimeout(resolve, 10));
      const newProof = { ...mockProof, requestId: "new-request-789" };
      const updatedSession = await manager.refreshSession("session-123", newProof, mockDevice);

      expect(updatedSession).toBeDefined();
      expect(updatedSession!.expiresAt).toBeDefined();
      expect(updatedSession!.lastActivityAt).toBeDefined();
      
      const newExpiry = new Date(updatedSession!.expiresAt);
      const newActivity = new Date(updatedSession!.lastActivityAt);
      
      expect(newExpiry.getTime()).toBeGreaterThan(initialExpiry.getTime());
      expect(newActivity.getTime()).toBeGreaterThanOrEqual(initialActivity.getTime());
      
      // Verify the session was actually updated in storage
      const storedSession = manager['sessions'].get("session-123");
      expect(storedSession).toBe(updatedSession);
    });

    it("rejects refresh for non-existent session", async () => {
      await expect(
        manager.refreshSession("non-existent", mockProof, mockDevice)
      ).rejects.toThrow("Session not found");
    });

    it("rejects refresh for expired session", async () => {
      // Create session with very short TTL
      const shortManager = new ContinuousAuthManager(1); // 1ms TTL
      await shortManager.createSession("session-123", "user-456", mockDevice, mockProof);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to refresh
      const result = await shortManager.refreshSession("session-123", mockProof, mockDevice);
      expect(result).toBeNull();
    });

    it("handles device fingerprint changes gracefully", async () => {
      // Create initial session
      await manager.createSession("session-123", "user-456", mockDevice, mockProof);

      // Refresh with different device (same user agent, different timezone)
      const differentDevice = { ...mockDevice, timezone: "Europe/London" };
      const newProof = { ...mockProof, requestId: "new-request-789" };
      const updatedSession = await manager.refreshSession("session-123", newProof, differentDevice);

      expect(updatedSession).toBeDefined();
      // Device should be updated to new fingerprint
      expect(updatedSession!.bindings.device.timezone).toBe("Europe/London");
    });
  });

  describe("getSession", () => {
    it("returns active session", async () => {
      const createdSession = await manager.createSession("session-123", "user-456", mockDevice, mockProof);
      const retrievedSession = await manager.getSession("session-123");

      expect(retrievedSession).toEqual(createdSession);
    });

    it("returns null for non-existent session", async () => {
      const result = await manager.getSession("non-existent");
      expect(result).toBeNull();
    });

    it("returns null for expired session", async () => {
      // Create session with very short TTL
      const shortManager = new ContinuousAuthManager(1); // 1ms TTL
      await shortManager.createSession("session-123", "user-456", mockDevice, mockProof);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await shortManager.getSession("session-123");
      expect(result).toBeNull();
    });
  });

  describe("invalidateSession", () => {
    it("marks session as invalidated", async () => {
      await manager.createSession("session-123", "user-456", mockDevice, mockProof);
      await manager.invalidateSession("session-123");

      const session = await manager.getSession("session-123");
      expect(session).toBeNull();
    });

    it("handles non-existent session gracefully", async () => {
      await expect(manager.invalidateSession("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("listActiveSessions", () => {
    it("returns only active sessions", async () => {
      await manager.createSession("active-1", "user-1", mockDevice, mockProof);
      await manager.createSession("active-2", "user-2", mockDevice, mockProof);

      // Create and expire a session
      const shortManager = new ContinuousAuthManager(1);
      await shortManager.createSession("expired-1", "user-3", mockDevice, mockProof);
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for expiration

      const activeSessions = await manager.listActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.sessionId)).toEqual(
        expect.arrayContaining(["active-1", "active-2"])
      );
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("removes expired sessions", async () => {
      // Create sessions with short TTL
      const shortManager = new ContinuousAuthManager(1);
      await shortManager.createSession("session-1", "user-1", mockDevice, mockProof);
      await shortManager.createSession("session-2", "user-2", mockDevice, mockProof);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const removed = await shortManager.cleanupExpiredSessions();
      expect(removed).toBe(2);

      // Verify sessions are gone
      const active = await shortManager.listActiveSessions();
      expect(active).toHaveLength(0);
    });
  });

  describe("getSessionAnalytics", () => {
    it("calculates correct analytics", async () => {
      // Create sessions with different proof counts
      const session1 = await manager.createSession("session-1", "user-1", mockDevice, mockProof);
      await manager.refreshSession("session-1", { ...mockProof, requestId: "proof-2" }, mockDevice);
      await manager.refreshSession("session-1", { ...mockProof, requestId: "proof-3" }, mockDevice);

      const session2 = await manager.createSession("session-2", "user-2", mockDevice, mockProof);

      const analytics = await manager.getSessionAnalytics();

      expect(analytics.total).toBe(2);
      expect(analytics.averageProofsPerSession).toBe(2); // (3 + 1) / 2
      expect(analytics.averageSessionDuration).toBeGreaterThan(0);
    });

    it("handles empty session list", async () => {
      const analytics = await manager.getSessionAnalytics();

      expect(analytics.total).toBe(0);
      expect(analytics.averageProofsPerSession).toBe(0);
      expect(analytics.averageSessionDuration).toBe(0);
    });
  });
});

describe("Device Fingerprint Matching", () => {
  let manager: ContinuousAuthManager;

  beforeEach(() => {
    manager = new ContinuousAuthManager();
  });

  it("matches identical devices", () => {
    const device1: DeviceFingerprint = {
      userAgent: "Test Browser",
      screenResolution: "1920x1080",
      timezone: "UTC",
      languages: ["en"],
      timestamp: "2024-01-01T00:00:00Z"
    };
    const device2 = { ...device1 };

    // Access private method through type assertion
    const match = (manager as any).isDeviceMatch(device1, device2);
    expect(match).toBe(true);
  });

  it("allows user agent changes", () => {
    const device1: DeviceFingerprint = {
      userAgent: "Old Browser",
      timestamp: "2024-01-01T00:00:00Z"
    };
    const device2: DeviceFingerprint = {
      userAgent: "New Browser",
      timestamp: "2024-01-01T00:00:00Z"
    };

    const match = (manager as any).isDeviceMatch(device1, device2);
    expect(match).toBe(true);
  });

  it("rejects timezone changes", () => {
    const device1: DeviceFingerprint = {
      userAgent: "Test Browser",
      timezone: "America/New_York",
      timestamp: "2024-01-01T00:00:00Z"
    };
    const device2: DeviceFingerprint = {
      userAgent: "Test Browser",
      timezone: "Europe/London",
      timestamp: "2024-01-01T00:00:00Z"
    };

    const match = (manager as any).isDeviceMatch(device1, device2);
    expect(match).toBe(false);
  });
});

describe("createContinuousAuthMiddleware", () => {
  it("creates middleware function", () => {
    const manager = new ContinuousAuthManager();
    const middleware = createContinuousAuthMiddleware(manager);

    expect(typeof middleware).toBe("function");
  });

  it("middleware handles missing session ID", async () => {
    const manager = new ContinuousAuthManager();
    const middleware = createContinuousAuthMiddleware(manager);

    const mockRequest = { headers: {} } as any;
    const mockReply = {};

    await middleware(mockRequest, mockReply);

    expect(mockRequest.continuousAuth).toEqual({
      requireFullProof: true
    });
  });

  it("middleware handles valid session", async () => {
    const manager = new ContinuousAuthManager();
    const middleware = createContinuousAuthMiddleware(manager);

    // Create a session
    const mockDevice: DeviceFingerprint = {
      userAgent: "Test",
      timestamp: new Date().toISOString()
    };
    const mockProof: ProofRecord = {
      requestId: "test",
      nonce: "test",
      verifiedAt: new Date().toISOString(),
      claims: []
    };
    const session = await manager.createSession("session-123", "user-456", mockDevice, mockProof);

    const mockRequest = {
      cookies: { session_id: "session-123" }
    } as any;
    const mockReply = {};

    await middleware(mockRequest, mockReply);

    expect(mockRequest.continuousAuth).toEqual({
      requireFullProof: false,
      session,
      pairwiseSubjectId: "user-456"
    });
  });

  it("middleware handles invalid session", async () => {
    const manager = new ContinuousAuthManager();
    const middleware = createContinuousAuthMiddleware(manager);

    const mockRequest = {
      cookies: { session_id: "invalid-session" }
    } as any;
    const mockReply = {};

    await middleware(mockRequest, mockReply);

    expect(mockRequest.continuousAuth).toEqual({
      requireFullProof: true
    });
  });
});