import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { zkAgent } from "../../src/lib/zk-agent";

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("ZK Agent Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required environment variable for tests
    process.env.EXPECTED_AGENT_HASH = 'mocked-hash';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        status: "healthy",
        agent: "shielded-id-zk-agent",
        version: "1.0.0"
      }),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5]).buffer)
    });
    // Mock the hash computation to avoid crypto issues in test environment
    vi.spyOn(zkAgent as any, 'computeAgentHash').mockResolvedValue('mocked-hash');
    // Reset the singleton instance for each test
    (zkAgent as any).agentAvailable = false;
    (zkAgent as any).checkPromise = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isAgentAvailable", () => {
    it("returns true when agent responds to health check", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status: "healthy",
          agent: "shielded-id-zk-agent",
          version: "1.0.0"
        })
      });

      const available = await zkAgent.isAgentAvailable();
      expect(available).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3030/health', expect.any(Object));
    });

    it("returns false when agent is not responding", async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const available = await zkAgent.isAgentAvailable();
      expect(available).toBe(false);
    });

    it("returns false when agent returns non-ok status", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const available = await zkAgent.isAgentAvailable();
      expect(available).toBe(false);
    });

    it("times out after 2 seconds", async () => {
      fetchMock.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 3000)));

      const startTime = Date.now();
      const available = await zkAgent.isAgentAvailable();
      const endTime = Date.now();

      expect(available).toBe(false);
      expect(endTime - startTime).toBeGreaterThan(1900); // Should have waited at least 1.9 seconds
      expect(endTime - startTime).toBeLessThan(3500); // But not more than 3.5 seconds
    });

    it("handles concurrent calls properly", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status: "healthy",
          agent: "shielded-id-zk-agent",
          version: "1.0.0"
        })
      });

      // Multiple concurrent calls should work
      const [result1, result2] = await Promise.all([
        zkAgent.isAgentAvailable(),
        zkAgent.isAgentAvailable()
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("generateAgeProof", () => {
    it("successfully generates age proof", async () => {
      const mockResponse = {
        success: true,
        proof_bundle: {
          commitment: "test-commitment",
          proof: "test-proof",
          publicInputs: "test-public-inputs"
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await zkAgent.generateAgeProof(25, "https://verifier.com", "nonce123", "2024-12-31");

      expect(result).toEqual(mockResponse.proof_bundle);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3030/prove/age', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          value: 25,
          min: 18,
          suite: 'AGE_ZK_BULLETPROOFS_V1',
          verifier_origin: 'https://verifier.com',
          nonce: 'nonce123',
          expiry: '2024-12-31'
        })
      });
    });

    it("throws error when agent returns failure", async () => {
      const mockResponse = {
        success: false,
        error: "Proof generation failed"
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      await expect(zkAgent.generateAgeProof(25, "https://verifier.com", "nonce123", "2024-12-31"))
        .rejects.toThrow("Proof generation failed");
    });

    it("throws error when HTTP request fails", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(zkAgent.generateAgeProof(25, "https://verifier.com", "nonce123", "2024-12-31"))
        .rejects.toThrow("ZK agent request failed: 500");
    });
  });

  describe("generateAssuranceProof", () => {
    it("successfully generates assurance proof", async () => {
      const mockResponse = {
        success: true,
        proof_bundle: {
          commitment: "test-commitment",
          proof: "test-proof",
          publicInputs: "test-public-inputs"
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await zkAgent.generateAssuranceProof(2, 1, "https://verifier.com", "nonce123", "2024-12-31");

      expect(result).toEqual(mockResponse.proof_bundle);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3030/prove/assurance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({
          value: 2,
          min: 1,
          suite: 'KYC_ZK_BULLETPROOFS_V1',
          verifier_origin: 'https://verifier.com',
          nonce: 'nonce123',
          expiry: '2024-12-31'
        })
      });
    });
  });
});