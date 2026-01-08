import { useMemo, useState } from "react";
import { HomePage } from "./components/HomePage";
import { ProofRequestUI } from "./components/ProofRequestUI";
import { VerificationResult } from "./components/VerificationResult";
import { SessionHistory } from "./components/SessionHistory";
import type { ProofRequest } from "@shielded-id/verifier-sdk";

export type ProofType = "AGE" | "KYC" | "CONTINUITY";

export function App() {
  const [activeType, setActiveType] = useState<ProofType | null>(null);
  const [useZkMode, setUseZkMode] = useState(true);
  const [request, setRequest] = useState<ProofRequest | null>(null);

  const title = useMemo(() => {
    if (!activeType) return "Shielded ID Verifier Demo";
    if (activeType === "AGE") return "Verify Age";
    if (activeType === "KYC") return "Verify Assurance Tier";
    return "Continuity Check";
  }, [activeType]);

  return (
    <div className="app-shell">
      <header>
        <div>
          <div className="badge">Reference Integration</div>
          <h1>{title}</h1>
        </div>
        <button className="secondary" onClick={() => setActiveType(null)}>
          Home
        </button>
      </header>
      <main>
        {!activeType && <HomePage onSelect={(type, useZk) => {
          setActiveType(type);
          setUseZkMode(useZk);
        }} />}
        {activeType && (
          <ProofRequestUI
            proofType={activeType}
            useZkMode={useZkMode}
            request={request}
            onRequest={setRequest}
            onCancel={() => {
              setRequest(null);
              setActiveType(null);
            }}
          />
        )}
        <VerificationResult request={request} />
        <SessionHistory />
      </main>
    </div>
  );
}
