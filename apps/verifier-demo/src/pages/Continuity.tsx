import { ProofRequestUI } from "../components/ProofRequestUI";

export function Continuity() {
  return (
    <div style={{ padding: "20px" }}>
      <h2>Continuity Verification</h2>
      <p>Request proof of continuity: unique, verifiable identity binding.</p>
      <ProofRequestUI
        requestedClaims={[
          { type: "CONTINUITY" }
        ]}
        title="Continuity Verification"
        description="This service uses continuity proofs to prevent sybil attacks while maintaining your privacy. Your pairwise subject ID is unique to this verifier and cannot be linked to other services."
      />
    </div>
  );
}
