import { ProofRequestUI } from "../components/ProofRequestUI";

export function KYC() {
  return (
    <div style={{ padding: "20px" }}>
      <h2>Assurance Level Verification (Tier 2)</h2>
      <p>Request proof of assurance tier 2 (document-backed identity verification).</p>
      <ProofRequestUI
        requestedClaims={[
          { type: "KYC_LEVEL", minLevel: 2 }
        ]}
        title="Assurance Tier 2 Verification"
        description="This service requires identity verification. Use your Shielded ID wallet to prove your assurance level without sharing documents."
      />
    </div>
  );
}
