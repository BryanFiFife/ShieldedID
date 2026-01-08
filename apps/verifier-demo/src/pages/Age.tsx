import { ProofRequestUI } from "../components/ProofRequestUI";

export function Age() {
  return (
    <div style={{ padding: "20px" }}>
      <h2>Age Verification (18+)</h2>
      <p>Request proof that user is 18 or older.</p>
      <ProofRequestUI
        requestedClaims={[
          { type: "AGE_OVER", threshold: 18 }
        ]}
        title="Age 18+ Verification"
        description="This service requires you to be 18 years or older. Use your Shielded ID wallet to prove your age without sharing your ID."
      />
    </div>
  );
}
