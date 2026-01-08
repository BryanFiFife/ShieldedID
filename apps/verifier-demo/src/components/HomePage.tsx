import { useState } from "react";
import type { ProofType } from "../App";

interface HomePageProps {
  onSelect: (type: ProofType, useZk: boolean) => void;
}

export function HomePage({ onSelect }: HomePageProps) {
  const [useZkMode, setUseZkMode] = useState(true);

  return (
    <div className="panel">
      <h2>Choose a proof request</h2>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <input
            type="checkbox"
            checked={useZkMode}
            onChange={(e) => setUseZkMode(e.target.checked)}
          />
          <span>Use Zero-Knowledge Proofs (agent-backed when available)</span>
        </label>
        <p style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}>
          {useZkMode
            ? "Uses the Bulletproofs agent when configured; falls back to simulated output in the demo."
            : "Legacy mode reveals your exact KYC level - less private but backwards compatible."
          }
        </p>
      </div>

      <div className="grid">
        <button onClick={() => onSelect("AGE", useZkMode)}>Verify Age (Over 18)</button>
        <button onClick={() => onSelect("KYC", useZkMode)}>Assurance Tier 2</button>
        <button onClick={() => onSelect("CONTINUITY", useZkMode)}>Continuity (Same Account)</button>
      </div>
    </div>
  );
}
