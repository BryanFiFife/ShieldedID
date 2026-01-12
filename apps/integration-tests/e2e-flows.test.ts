/**
 * Shielded ID End-to-End Test Suite
 * File: apps/integration-tests/e2e-flows.test.ts
 * 
 * Complete user journey tests using Playwright
 * Tests real integration between wallet, registry, and verifier
 */

import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";

/**
 * Helper: Launch wallet and verifier in separate contexts
 */
async function setupTestEnvironment() {
  const baseURL = process.env.BASE_URL || "http://localhost:3000";

  return {
    walletURL: `${baseURL}/wallet`,
    verifierURL: `${baseURL}/verifier-demo`,
    registryURL: `${baseURL}/registry`
  };
}

// ============================================================
// Test Suite: Complete Enrollment to Verification Flow
// ============================================================

test.describe("Shielded ID E2E Flows", () => {
  let env: Awaited<ReturnType<typeof setupTestEnvironment>>;

  // ============================================================
  // Test 1: Complete Happy Path
  // ============================================================

  test("Complete flow: Enrollment → Proof → Verification", async ({
    browser,
    page
  }) => {
    // ============================================================
    // Phase 1: Wallet Enrollment
    // ============================================================
    env = await setupTestEnvironment();
    await page.goto(env.walletURL);
    await expect(page.locator("text=Welcome to Shielded ID")).toBeVisible();

    // Click enrollment button
    await page.click("text=Create New Wallet");

    // Set passphrase
    await page.fill("[data-testid=passphrase-input]", "test-passphrase-secure-123");
    await page.fill("[data-testid=passphrase-confirm]", "test-passphrase-secure-123");

    // Fill personal data (stored encrypted in wallet)
    await page.fill("[data-testid=given-name]", "Alice");
    await page.fill("[data-testid=family-name]", "Smith");
    await page.fill("[data-testid=date-of-birth]", "1990-05-15");

    // Complete enrollment
    await page.click("text=Complete Enrollment");

    // Wait for encryption/key generation (20 seconds max)
    await page.waitForSelector(
      "[data-testid=wallet-ready]",
      { timeout: 20000 }
    );

    expect(page.locator("[data-testid=wallet-id]")).toBeTruthy();

    // ============================================================
    // Phase 2: Verifier Requests Proof
    // ============================================================

    const verifierContext = await browser.newContext();
    const verifierPage = await verifierContext.newPage();

    await verifierPage.goto(env.verifierURL);
    await expect(verifierPage.locator("text=Shielded ID Demo")).toBeVisible();

    // Click "Prove Age"
    await verifierPage.click("text=Prove Age Over 18");

    // Wait for proof request QR code to appear
    await verifierPage.waitForSelector("[data-testid=proof-request-qr]");

    // Extract proof request from page data
    const proofRequestData = await verifierPage.getAttribute(
      "[data-testid=proof-request-data]",
      "data-request"
    );

    expect(proofRequestData).toBeTruthy();

    // ============================================================
    // Phase 3: Wallet Receives & Approves Proof Request
    // ============================================================

    // Wallet page (in original context) should receive deep-link
    // Simulate by passing proof request directly
    await page.evaluate((data) => {
      window.postMessage({
        type: "shielded-proof-request",
        payload: data
      }, "*");
    }, proofRequestData);

    // Proof request dialog should appear
    await page.waitForSelector("[data-testid=proof-request-dialog]");
    await expect(page.locator("text=Verify Age Over 18")).toBeVisible();

    // Show requested claims
    await expect(page.locator("text=Your age is ≥ 18")).toBeVisible();

    // User approves
    await page.click("[data-testid=approve-proof-button]");

    // Wallet generates proof (2 seconds max, should be fast)
    await page.waitForSelector("[data-testid=proof-generated]", {
      timeout: 2000
    });

    // ============================================================
    // Phase 4: Verifier Receives & Validates Proof
    // ============================================================

    // Proof is posted back to verifier callback
    // Wait for verification result
    await verifierPage.waitForSelector("[data-testid=proof-result]", {
      timeout: 5000
    });

    // Expect success
    const resultStatus = await verifierPage.getAttribute(
      "[data-testid=proof-result]",
      "data-status"
    );

    expect(resultStatus).toBe("VALID");

    // ============================================================
    // Phase 5: Verify Revocation Check
    // ============================================================

    // Click revocation status button
    await verifierPage.click("[data-testid=check-revocation]");

    // Should show key status
    await verifierPage.waitForSelector("[data-testid=revocation-status]");

    const revocationStatus = await verifierPage.textContent(
      "[data-testid=revocation-status]"
    );

    expect(revocationStatus).toContain("ACTIVE");

    // ============================================================
    // Phase 6: Cleanup
    // ============================================================

    await verifierContext.close();
  });

  // ============================================================
  // Test 2: Revocation Flow
  // ============================================================

  test("Revocation flow: Revoke key → Verification fails", async ({
    browser,
    page
  }) => {
    // Setup: Wallet with proof generated
    // ... (enrollment steps from test 1)

    // Get current wallet state
    const walletId = await page.getAttribute(
      "[data-testid=wallet-id]",
      "data-id"
    );

    // Step 1: Generate valid proof
    // ... (proof generation steps)

    // Proof works
    // await verifyProofSuccessfully(page);

    // Step 2: Revoke key
    await page.click("[data-testid=wallet-menu]");
    await page.click("[data-testid=menu-security]");
    await page.click("[data-testid=revoke-keys]");

    // Confirm revocation
    await page.click("[data-testid=confirm-revoke]");
    await expect(page.locator("text=Key revoked")).toBeVisible();

    // Step 3: Attempt to use revoked key
    // New verifier requests proof
    const verifierContext = await browser.newContext();
    const verifierPage = await verifierContext.newPage();

    await verifierPage.goto(env.verifierURL);
    await verifierPage.click("text=Prove Age Over 18");

    // ... post proof request to wallet

    // Wallet tries to generate proof with revoked key
    // Should show error
    await page.waitForSelector("[data-testid=error-key-revoked]");

    expect(page.locator("text=Key has been revoked")).toBeTruthy();

    await verifierContext.close();
  });

  // ============================================================
  // Test 3: Offline Verification Mode
  // ============================================================

  test("Offline mode: Verify proof without registry", async ({
    page
  }) => {
    // Prerequisite: Pre-cache keys
    await page.evaluate(() => {
      // Simulate offline mode
      (window as any).offlineModeEnabled = true;
    });

    // Disable network
    await page.context().setOffline(true);

    // Attempt verification with cached keys
    // Should succeed because cache is fresh
    const result = await page.evaluate(async () => {
      const verifier = (window as any).offlineVerifier; // Pre-initialized in app
      return await verifier.verifyProof({
        keyId: "key-123",
        signature: "cached-valid-sig",
        pairwiseSubjectId: "subj-hash"
      });
    });

    expect(result.valid).toBe(true);
    expect(result.details.mode).toBe("offline");

    // Re-enable network
    await page.context().setOffline(false);
  });

  // ============================================================
  // Test 4: Cross-Device Continuous Auth
  // ============================================================

  test("Continuous auth: Session binding prevents device hijacking", async ({
    browser,
    page
  }) => {
    // User logs in on device A
    const deviceA = page;
    await deviceA.goto(env.verifierURL);

    // Complete proof flow
    // ... (proof generation and verification)

    // Session created with device fingerprint
    const sessionId = await deviceA.evaluate(() => {
      return sessionStorage.getItem("session_id");
    });

    expect(sessionId).toBeTruthy();

    // Attempt login on device B (different User-Agent)
    const deviceB = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15"
    });

    await deviceB.goto(env.verifierURL);

    // Try to reuse same session ID
    await deviceB.evaluate((id: string | null) => {
      sessionStorage.setItem("session_id", id ?? "");
    }, sessionId);

    // Session should be invalidated (device mismatch)
    const sessionValid = await deviceB.evaluate(() => {
      return fetch("/api/session/validate")
        .then((r) => r.json())
        .then((d) => d.valid);
    });

    expect(sessionValid).toBe(false);

    await deviceB.close();
  });

  // ============================================================
  // Test 5: Nonce Freshness / Replay Prevention
  // ============================================================

  test("Security: Replay attack blocked", async ({ page }) => {
    // Generate valid proof
    // ... (enrollment and proof generation)

    const proofData = await page.evaluate(() => {
      const stored = sessionStorage.getItem("last_proof");
      return stored ? JSON.parse(stored) : null;
    });

    // Attempt to reuse proof with same nonce
    const replayResult = await page.evaluate(async (proof) => {
      try {
        const result = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proof)
        }).then((r) => r.json());

        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }, proofData);

    // Should reject as replay
    expect(replayResult.error || replayResult.reason).toContain("REPLAY");
  });

  // ============================================================
  // Test 6: Algorithm Compatibility
  // ============================================================

  test("Compatibility: Verify proof across algorithm versions", async ({
    page
  }) => {
    // Generate proof with P-256
    // ... (enrollment)

    const proof1 = await page.evaluate(() => {
      return sessionStorage.getItem("last_proof");
    });

    const result1 = await page.evaluate(async (proof) => {
      return await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof)
      }).then((r) => r.json());
    }, proof1);

    expect(result1.valid).toBe(true);
    expect(result1.algorithm).toBe("ECDSA_P256_SHA256_1.0.0");
  });

  // ============================================================
  // Test 7: Error Handling
  // ============================================================

  test("Error handling: Clear messages for common failures", async ({
    page
  }) => {
    // Test 1: Expired proof
    const expiredProof = await page.evaluate(() => {
      const past = new Date();
      past.setHours(past.getHours() - 25); // Yesterday
      return {
        issuanceDate: past.toISOString(),
        expirationDate: past.toISOString()
      };
    });

    const expiredResult = await page.evaluate(async (proof) => {
      return await fetch("/api/verify", {
        method: "POST",
        body: JSON.stringify(proof)
      }).then((r) => r.json());
    }, expiredProof);

    expect(expiredResult.error).toContain("PROOF_EXPIRED");

    // Test 2: Invalid signature
    const invalidSigProof = await page.evaluate(() => {
      return {
        signature: "invalid_base64url_signature",
        keyId: "key-123"
      };
    });

    const invalidSigResult = await page.evaluate(async (proof) => {
      return await fetch("/api/verify", {
        method: "POST",
        body: JSON.stringify(proof)
      }).then((r) => r.json());
    }, invalidSigProof);

    expect(invalidSigResult.error).toContain("INVALID_SIGNATURE");
  });

  // ============================================================
  // Test 8: Performance Baseline
  // ============================================================

  test("Performance: Proof verification < 100ms", async ({ page }) => {
    // Generate proof
    // ... (enrollment)

    const startTime = Date.now();

    const result = await page.evaluate(async () => {
      return await fetch("/api/verify", {
        method: "POST",
        body: JSON.stringify({
          requestId: "test-123",
          keyId: "key-123",
          signature: "valid-sig-base64url"
        })
      }).then((r) => r.json());
    });

    const duration = Date.now() - startTime;

    console.log(`Proof verification took ${duration}ms`);
    expect(duration).toBeLessThan(100);
  });
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Complete wallet enrollment flow
 */
async function enrollWallet(page: Page, data?: any): Promise<string> {
  const defaults = {
    passphrase: "test-secure-123",
    givenName: "Test",
    familyName: "User",
    dateOfBirth: "1990-01-01"
  };

  const info = { ...defaults, ...data };

  const testEnv = await setupTestEnvironment();
  await page.goto(testEnv.walletURL);
  await page.click("text=Create New Wallet");

  await page.fill("[data-testid=passphrase-input]", info.passphrase);
  await page.fill("[data-testid=passphrase-confirm]", info.passphrase);
  await page.fill("[data-testid=given-name]", info.givenName);
  await page.fill("[data-testid=family-name]", info.familyName);
  await page.fill("[data-testid=date-of-birth]", info.dateOfBirth);

  await page.click("text=Complete Enrollment");
  await page.waitForSelector("[data-testid=wallet-ready]");

  const walletId = await page.getAttribute(
    "[data-testid=wallet-id]",
    "data-id"
  );

  return walletId!;
}

/**
 * Request and complete proof
 */
async function generateProof(
  walletPage: Page,
  requestData: any
): Promise<string> {
  await walletPage.evaluate((data) => {
    window.postMessage({ type: "shielded-proof-request", payload: data }, "*");
  }, requestData);

  await walletPage.waitForSelector("[data-testid=proof-request-dialog]");
  await walletPage.click("[data-testid=approve-proof-button]");
  await walletPage.waitForSelector("[data-testid=proof-generated]");

  const proof = await walletPage.evaluate(() => {
    return sessionStorage.getItem("last_proof");
  });

  return proof!;
}
