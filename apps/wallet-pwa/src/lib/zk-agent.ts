/**
 * ZK Agent Service
 * Communicates with the local ZK agent for real Bulletproofs generation
 */

export interface ProofBundle {
  commitment: string;
  proof: string;
  publicInputs: string;
}

export interface AgentProofRequest {
  value: number;
  min: number;
  suite: string;
  verifier_origin: string;
  nonce: string;
  expiry: string;
}

export interface AgentProofResponse {
  success: boolean;
  proof_bundle?: ProofBundle;
  error?: string;
}

class ZKAgentService {
  private static instance: ZKAgentService;
  private agentAvailable: boolean = false;
  private checkPromise: Promise<boolean> | null = null;

  static getInstance(): ZKAgentService {
    if (!ZKAgentService.instance) {
      ZKAgentService.instance = new ZKAgentService();
    }
    return ZKAgentService.instance;
  }

  /**
   * Check if the ZK agent is available
   */
  async isAgentAvailable(): Promise<boolean> {
    if (this.checkPromise) {
      return this.checkPromise;
    }

    this.checkPromise = this.checkAgentHealth();
    try {
      this.agentAvailable = await this.checkPromise;
    } catch {
      this.agentAvailable = false;
    } finally {
      this.checkPromise = null;
    }

    return this.agentAvailable;
  }

  private async checkAgentHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

      const response = await fetch('http://localhost:3030/health', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Origin': window.location.origin
        }
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return false;
      }

      // SECURITY FIX #5C: Verify agent binary integrity
      const data = await response.json() as { status?: string; agent?: string; version?: string };
      
      // Verify agent identifies correctly
      if (data.status !== "healthy" || data.agent !== "shielded-id-zk-agent") {
        console.error("Agent integrity check failed: invalid response");
        return false;
      }

      // SECURITY FIX #6: Implement agent binary integrity verification
      const agentHash = await this.computeAgentHash();
      const expectedHash = process.env.EXPECTED_AGENT_HASH;
      if (!expectedHash) {
        console.error("EXPECTED_AGENT_HASH not configured");
        return false;
      }
      if (agentHash !== expectedHash) {
        console.error("Agent binary integrity verification failed");
        return false;
      }

      return true;
    } catch (err) {
      console.debug("Agent health check failed:", err);
      return false;
    }
  }

  /**
   * Generate age proof using the ZK agent
   */
  async generateAgeProof(
    value: number,
    verifierOrigin: string,
    nonce: string,
    expiry: string
  ): Promise<ProofBundle> {
    const request: AgentProofRequest = {
      value,
      min: 18,
      suite: 'AGE_ZK_BULLETPROOFS_V1',
      verifier_origin: verifierOrigin,
      nonce,
      expiry
    };

    return this.generateProof('/prove/age', request);
  }

  /**
   * Generate assurance proof using the ZK agent
   */
  async generateAssuranceProof(
    value: number,
    min: number,
    verifierOrigin: string,
    nonce: string,
    expiry: string
  ): Promise<ProofBundle> {
    const request: AgentProofRequest = {
      value,
      min,
      suite: 'KYC_ZK_BULLETPROOFS_V1',
      verifier_origin: verifierOrigin,
      nonce,
      expiry
    };

    return this.generateProof('/prove/assurance', request);
  }

  private async computeAgentHash(): Promise<string> {
    try {
      const response = await fetch('http://localhost:3030/binary');
      if (!response.ok) {
        throw new Error('Failed to fetch agent binary');
      }
      const buffer = await response.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.error('Agent hash computation failed:', err);
      throw err;
    }
  }

  private async generateProof(endpoint: string, request: AgentProofRequest): Promise<ProofBundle> {
    const response = await fetch(`http://localhost:3030${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`ZK agent request failed: ${response.status}`);
    }

    const result: AgentProofResponse = await response.json();

    if (!result.success || !result.proof_bundle) {
      throw new Error(result.error || 'ZK agent returned error');
    }

    return result.proof_bundle;
  }
}

export const zkAgent = ZKAgentService.getInstance();