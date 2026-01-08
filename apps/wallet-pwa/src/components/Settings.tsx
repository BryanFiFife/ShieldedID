import { useEffect, useState } from "react";
import { useWalletStore } from "../store/wallet.store";
import { zkAgent } from "../lib/zk-agent";

export function Settings() {
  const lockVault = useWalletStore((state) => state.lockVault);
  const [zkAgentAvailable, setZkAgentAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    zkAgent.isAgentAvailable().then(setZkAgentAvailable).catch(() => setZkAgentAvailable(false));
  }, []);

  return (
    <div className="panel">
      <h2>Settings</h2>

      {/* ZK Agent Status */}
      <div className="field">
        <label>Zero-Knowledge Agent</label>
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: zkAgentAvailable === true ? '#e8f5e8' : zkAgentAvailable === false ? '#ffe8e8' : '#f5f5f5',
          border: `1px solid ${zkAgentAvailable === true ? '#4caf50' : zkAgentAvailable === false ? '#f44336' : '#ccc'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: zkAgentAvailable === true ? '#4caf50' : zkAgentAvailable === false ? '#f44336' : '#ccc'
            }} />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>
              {zkAgentAvailable === true && "Agent Active"}
              {zkAgentAvailable === false && "Agent Not Installed"}
              {zkAgentAvailable === null && "Checking..."}
            </span>
          </div>

          {zkAgentAvailable === false && (
            <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Enhanced Privacy Available</strong>
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                Install the ZK agent for real zero-knowledge proofs instead of signed predicates.
                Your age and KYC level will be cryptographically proven without revealing the actual values.
              </p>
              <div style={{ backgroundColor: '#f9f9f9', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
                <div>1. Download from: https://github.com/shielded-id/zk-agent</div>
                <div>2. Run: cargo build --release</div>
                <div>3. Start: ./target/release/zk-agent</div>
              </div>
            </div>
          )}

          {zkAgentAvailable === true && (
            <div style={{ fontSize: '14px', color: '#2e7d32' }}>
              ✓ Real Bulletproofs zero-knowledge proofs active
              <br />
              ✓ Enhanced privacy protection enabled
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label>Recovery options</label>
        <p>Passphrase recovery and social recovery are configured here.</p>
      </div>
      <div className="field">
        <label>Consent history</label>
        <p>Export your audit log without PII.</p>
      </div>
      <button onClick={lockVault}>Lock Vault</button>
    </div>
  );
}
