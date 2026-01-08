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
      return response.ok;
    } catch {
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