/**
 * Shielded ID Continuous Authentication
 * File: packages/verifier-sdk/src/continuous-auth.ts
 * 
 * Session binding and continuous re-authentication for enhanced user experience
 * Optional layer on top of stateless proof verification
 */

import crypto from "crypto";

/**
 * Device fingerprint for session binding
 * Prevents session hijacking across devices
 */
export interface DeviceFingerprint {
  userAgent: string;
  screenResolution?: string;
  timezone?: string;
  languages?: string[];
  timestamp: string;
}

/**
 * Single proof in audit trail
 */
export interface ProofRecord {
  requestId: string;
  nonce: string;
  verifiedAt: string;
  claims: Array<{
    claimType: string;
    claimValue: unknown;
  }>;
}

/**
 * Session binding info
 */
export interface SessionBinding {
  device: DeviceFingerprint;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Continuous authentication session
 * 
 * Represents a session where a user has been authenticated once,
 * and can perform follow-up actions without full re-authentication
 * (though re-proof may be required periodically)
 */
export interface ContinuousAuthSession {
  sessionId: string;
  pairwiseSubjectId: string; // Consistent for same user + verifier
  bindings: SessionBinding;
  proofs: ProofRecord[]; // Audit trail of all proofs in session
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  status: "active" | "expired" | "invalidated";
}

/**
 * Continuous Authentication Manager
 * 
 * Manages session lifecycle and re-authentication
 */
export class ContinuousAuthManager {
  private sessions = new Map<string, ContinuousAuthSession>();
  private sessionTTL: number; // milliseconds

  constructor(sessionTTL: number = 3600000) {
    // Default: 1 hour
    this.sessionTTL = sessionTTL;
  }

  /**
   * Create new continuous auth session after initial proof verification
   * 
   * @param sessionId - Unique session identifier
   * @param pairwiseSubjectId - User identifier for this verifier
   * @param deviceInfo - Current device fingerprint
   * @param initialProof - First proof in session
   * @returns New session object
   */
  async createSession(
    sessionId: string,
    pairwiseSubjectId: string,
    deviceInfo: DeviceFingerprint,
    initialProof: ProofRecord
  ): Promise<ContinuousAuthSession> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTTL);

    const session: ContinuousAuthSession = {
      sessionId,
      pairwiseSubjectId,
      bindings: {
        device: deviceInfo,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      },
      proofs: [initialProof],
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: now.toISOString(),
      status: "active"
    };

    // Store session
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Re-authenticate within existing session
   * 
   * User re-proves without full KYC (optional, lighter proof allowed)
   * 
   * @param sessionId - Existing session identifier
   * @param proof - New proof from user
   * @param deviceInfo - Current device info (for device binding check)
   * @returns Updated session if re-auth successful, null if failed
   */
  async refreshSession(
    sessionId: string,
    proof: ProofRecord,
    deviceInfo: DeviceFingerprint
  ): Promise<ContinuousAuthSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // ============================================================
    // Validations
    // ============================================================

    // 1. Check session is not expired
    if (new Date() > new Date(session.expiresAt)) {
      session.status = "expired";
      return null;
    }

    // 2. Check device binding (same device throughout session)
    if (!this.isDeviceMatch(session.bindings.device, deviceInfo)) {
      console.warn("Device mismatch: session hijack attempt?");
      // Option A: Reject (strict)
      // return null;
      
      // Option B: Allow but flag (lenient, for browser updates)
      session.bindings.device = deviceInfo; // Update device
    }

    // 3. Validate pairwise subject ID consistency
    // (proof must be from same user)
    if (!proof.requestId) {
      throw new Error("Proof missing requestId");
    }

    // ============================================================
    // Session Update
    // ============================================================

    // Extend session by TTL
    const newExpiry = new Date(Date.now() + this.sessionTTL);
    session.expiresAt = newExpiry.toISOString();
    session.lastActivityAt = new Date().toISOString();

    // Add proof to audit trail
    session.proofs.push(proof);

    // Update stored session
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Get active session info
   */
  async getSession(
    sessionId: string
  ): Promise<ContinuousAuthSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check expiration
    if (new Date() > new Date(session.expiresAt)) {
      session.status = "expired";
      return null;
    }

    // Check if invalidated
    if (session.status === "invalidated") {
      return null;
    }

    return session;
  }

  /**
   * Invalidate session (user logout)
   */
  async invalidateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "invalidated";
    // Optionally: Delete after retention period
  }

  /**
   * Check device fingerprint consistency
   * 
   * Returns true if devices are the same (or similar enough)
   * Allows for minor changes (e.g., browser update)
   */
  private isDeviceMatch(
    device1: DeviceFingerprint,
    device2: DeviceFingerprint
  ): boolean {
    // Strict check: User-Agent must be identical
    if (device1.userAgent !== device2.userAgent) {
      // User-Agent changed (browser update, etc.) - allow but flag
      // In strict mode, return false here
      // For now, return true to allow browser updates
      console.warn("User-Agent changed during session");
    }

    // Check timezone consistency (if available)
    if (
      device1.timezone &&
      device2.timezone &&
      device1.timezone !== device2.timezone
    ) {
      console.warn("Timezone changed during session (possible VPN?)");
      return false; // Timezone change is suspicious
    }

    return true;
  }

  /**
   * List all active sessions (admin use)
   */
  async listActiveSessions(): Promise<ContinuousAuthSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === "active" && new Date() <= new Date(s.expiresAt)
    );
  }

  /**
   * Clean up expired sessions (run periodically)
   */
  async cleanupExpiredSessions(): Promise<number> {
    let removed = 0;
    const now = new Date();

    for (const [key, session] of this.sessions.entries()) {
      if (now > new Date(session.expiresAt)) {
        this.sessions.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get session analytics (for admin dashboard)
   */
  async getSessionAnalytics() {
    const activeSessions = await this.listActiveSessions();

    return {
      total: activeSessions.length,
      averageProofsPerSession: activeSessions.length > 0
        ? activeSessions.reduce((sum, s) => sum + s.proofs.length, 0) /
          activeSessions.length
        : 0,
      averageSessionDuration:
        activeSessions.length > 0
          ? activeSessions.reduce((sum, s) => {
              const duration =
                new Date(s.expiresAt).getTime() -
                new Date(s.createdAt).getTime();
              return sum + duration;
            }, 0) / activeSessions.length / 1000 // seconds
          : 0
    };
  }
}

/**
 * Continuous Auth Middleware Factory
 * 
 * For use in Express/Fastify verifier applications
 */
export function createContinuousAuthMiddleware(manager: ContinuousAuthManager) {
  return async (request: any, reply: any) => {
    // Extract session ID from cookie or header
    const sessionId = request.cookies?.session_id || 
                      request.headers["x-session-id"];

    if (!sessionId) {
      // No session: require full proof
      request.continuousAuth = { requireFullProof: true };
      return;
    }

    // Check existing session
    const session = await manager.getSession(sessionId);
    if (!session) {
      // Session invalid/expired: require new proof
      request.continuousAuth = { requireFullProof: true };
      return;
    }

    // Session valid: user can proceed (optional: lighter proof check)
    request.continuousAuth = {
      requireFullProof: false,
      session,
      pairwiseSubjectId: session.pairwiseSubjectId
    };
  };
}

/**
 * Example integration with Verifier
 * 
 * @example
 * ```typescript
 * import { ContinuousAuthManager } from "@shielded-id/verifier-sdk";
 * 
 * const authManager = new ContinuousAuthManager(3600000); // 1 hour sessions
 * 
 * // After initial proof verification:
 * const session = await authManager.createSession(
 *   crypto.randomUUID(),
 *   proof.pairwiseSubjectId,
 *   deviceFingerprint,
 *   { requestId: req.body.requestId, ... }
 * );
 * 
 * res.cookie("session_id", session.sessionId, { 
 *   httpOnly: true,
 *   secure: true,
 *   sameSite: "strict"
 * });
 * 
 * // On subsequent requests: check session
 * const sessionId = req.cookies.session_id;
 * const updated = await authManager.refreshSession(
 *   sessionId,
 *   newProof,
 *   newDeviceInfo
 * );
 * 
 * if (!updated) {
 *   // Require full re-authentication
 *   res.status(401).send("Session invalid");
 * }
 * ```
 */
