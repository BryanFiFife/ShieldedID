import { useEffect, useState } from "react";
import type { ProofRequest } from "@shielded-id/verifier-sdk";

interface VerificationResultProps {
  request: ProofRequest | null;
}

interface SessionEntry {
  id: string;
  pairwiseSubjectId: string;
  verifiedAt: string;
  claims: Array<{ type: string; value: boolean | number }>;
  assuranceLevel?: number;
  suite?: string;
}

interface VerificationState {
  status: "pending" | "verified" | "failed" | null;
  data?: {
    result: SessionEntry;
    learned: string[];
    notLearned: string[];
    verifiedAt: string;
  };
  error?: {
    reason: string;
    message: string;
  };
}

export function VerificationResult({ request }: VerificationResultProps) {
  const [state, setState] = useState<VerificationState>({ status: null });
  const [dataSheet, setDataSheet] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const [sessionsResponse, resultResponse] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/latest-result")
        ]);

        if (resultResponse.ok) {
          const result = await resultResponse.json();

          if (result.valid === false && result.reason !== "PENDING") {
            setState({
              status: "failed",
              error: {
                reason: result.reason,
                message: getErrorMessage(result.reason)
              }
            });
            return;
          }
        }

        if (sessionsResponse.ok) {
          const sessions = (await sessionsResponse.json()) as { total: number; sessions: SessionEntry[] };
          const latest = sessions.sessions?.[0];

          if (latest) {
            const learned = getLearnedClaims(latest, request);
            const notLearned = getNotLearnedClaims(request, latest);

            setState({
              status: "verified",
              data: {
                result: latest,
                learned,
                notLearned,
                verifiedAt: latest.verifiedAt
              }
            });
            localStorage.setItem("lastPairwiseSubjectId", latest.pairwiseSubjectId);
            return;
          }
        }

        setState({ status: "pending" });
      } catch (err) {
        console.error("Poll error:", err);
        setState({ status: "pending" });
      }
    };

    const timer = window.setInterval(() => poll(), 2000);
    poll();
    return () => window.clearInterval(timer);
  }, [request]);

  if (state.status === null || state.status === "pending") {
    return (
      <div className="panel result-panel pending">
        <div className="spinner"></div>
        <h2>Waiting for Proof...</h2>
        <p>Scanning QR code? Generate a proof in the wallet and submit it here.</p>
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="panel result-panel failed">
        <div className="badge-fail">❌ VERIFICATION FAILED</div>
        <h2>Proof Could Not Be Verified</h2>
        <p className="error-reason">{state.error?.reason}</p>
        <details>
          <summary>What went wrong?</summary>
          <p>{state.error?.message}</p>
          <p className="hint">
            <strong>Next step:</strong> Try generating a new proof. Make sure you're using the correct proof request.
          </p>
        </details>
      </div>
    );
  }

  if (!state.data) {
    return null;
  }

  const { result, learned, notLearned, verifiedAt } = state.data;

  return (
    <div className="panel result-panel verified">
      <div className="badge-pass">✅ PROOF VERIFIED</div>

      <h2>Verification Successful</h2>
      <p className="verified-time">Verified at {new Date(verifiedAt).toLocaleTimeString()}</p>

      <div className="disclosure-section">
        <h3>What This Service Learned</h3>
        <ul className="learned-list">
          {learned.map((claim, i) => (
            <li key={i} className="learned-item">
              <span className="checkmark">✓</span> {claim}
            </li>
          ))}
          <li className="learned-item">
            <span className="checkmark">✓</span> <code>pairwiseSubjectId: {result.pairwiseSubjectId}</code>
            <span className="hint">(unique to this service only, different at other services)</span>
          </li>
          <li className="learned-item">
            <span className="checkmark">✓</span> Verification timestamp
          </li>
        </ul>
      </div>

      <div className="privacy-section">
        <h3>What This Service Does NOT Know</h3>
        <ul className="not-learned-list">
          {notLearned.map((claim, i) => (
            <li key={i} className="not-learned-item">
              <span className="cross">✗</span> {claim}
            </li>
          ))}
        </ul>
      </div>

      <div className="session-details">
        <h3>Session Details</h3>
        <table className="details-table">
          <tbody>
            <tr>
              <td>Session ID</td>
              <td>
                <code>{result.id}</code>
              </td>
            </tr>
            <tr>
              <td>Pairwise Subject ID</td>
              <td>
                <code>{result.pairwiseSubjectId}</code>
              </td>
            </tr>
            <tr>
              <td>Claims Verified</td>
              <td>
                {result.claims.map((c) => (
                  <span key={c.type}>
                    {c.type} ({c.value === true ? "Yes" : c.value === false ? "No" : `≥${c.value}`})
                  </span>
                ))}
              </td>
            </tr>
            {result.assuranceLevel !== undefined && (
              <tr>
                <td>Assurance Level</td>
                <td>{result.assuranceLevel}</td>
              </tr>
            )}
            <tr>
              <td>Verified At</td>
              <td>{new Date(result.verifiedAt).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="datasheet-section">
        <button className="secondary-small" onClick={() => setDataSheet(!dataSheet)}>
          {dataSheet ? "Hide" : "Show"} Privacy Datasheet
        </button>
        {dataSheet && (
          <div className="datasheet">
            <h4>Privacy Guarantees</h4>
            <dl>
              <dt>User Anonymity</dt>
              <dd>
                This service cannot identify you. Your pairwise subject ID is unique here; a different service would
                see a different ID for the same wallet.
              </dd>

              <dt>No Linkage Across Services</dt>
              <dd>
                Unlike traditional identity providers, Shielded ID ensures you cannot be tracked across different
                verifiers. Each service knows you only by a unique, opaque identifier.
              </dd>

              <dt>Minimal Data Disclosure</dt>
              <dd>
                The only information disclosed is what you explicitly proved. The wallet supports privacy-preserving
                cryptography, meaning the proof doesn't reveal the underlying data.
              </dd>

              <dt>User-Initiated Revocation</dt>
              <dd>
                You control your credential. If you revoke it at the registry, all proofs become invalid immediately.
                This service cannot prevent that—your control is absolute.
              </dd>

              <dt>Cryptographic Proof</dt>
              <dd>
                This service verified your proof using cryptographic signatures. The proof cannot be forged or reused.
                If the registry is compromised, old proofs still cannot be validated.
              </dd>

              <dt>No PII Storage</dt>
              <dd>
                This service stores only your pairwise ID and verification timestamp. No personal information is
                recorded.
              </dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function getLearnedClaims(result: SessionEntry, request?: ProofRequest | null): string[] {
  const claims = [];
  for (const claim of result.claims) {
    if (claim.type === "AGE_OVER") {
      const threshold = request?.requestedClaims.find(c => c.type === "AGE_OVER")?.threshold ?? 18;
      const isZk = result.suite === "AGE_ZK_v1";
      claims.push(`Proof of age ≥ ${threshold} years${isZk ? " (ZK proof - no DOB/age disclosed)" : ""}`);
    } else if (claim.type === "KYC_LEVEL") {
      const minLevel = request?.requestedClaims.find(c => c.type === "KYC_LEVEL")?.minLevel ?? 2;
      claims.push(`KYC Level ≥ ${minLevel} verified`);
    } else if (claim.type === "CONTINUITY") {
      claims.push("Proof of wallet continuity (same user as before)");
    } else {
      claims.push(`Claim: ${claim.type} = ${claim.value}`);
    }
  }
  return claims;
}

function getNotLearnedClaims(request: ProofRequest | null, result: SessionEntry): string[] {
  const claims = [
    "Your wallet ID or public key",
    "Your actual age (only that it meets the threshold)",
    "Your name, location, or any personal information",
    "Which other services you've verified with",
    "Your identity at other services (each has a different pairwise ID)",
    "Anything about the wallet software you use",
    "Your device information",
    "Your IP address or device fingerprint"
  ];
  return claims;
}

function getErrorMessage(reason: string): string {
  const messages: Record<string, string> = {
    WALLET_REVOKED: "Your wallet credential has been revoked. You can re-enroll at any time.",
    NONCE_MISMATCH:
      "The proof doesn't match the request. This usually means the proof was generated for a different request. Please generate a new proof.",
    TIMESTAMP_EXPIRED: "The proof has expired. Proofs are only valid for a few minutes. Please generate a new proof.",
    INVALID_SIGNATURE:
      "The proof signature is invalid. This could mean the proof was altered or tampered with. Please generate a new proof.",
    CLAIM_MISMATCH: "The proof doesn't contain the requested claims. Please check the proof request and try again.",
    REGISTRY_UNREACHABLE:
      "Cannot verify revocation status. The registry is temporarily unavailable. Please try again in a moment.",
    VERIFICATION_FAILED: "Proof verification failed for an unknown reason. Please try again.",
    INTERNAL_ERROR: "An internal error occurred. Please try again."
  };
  return messages[reason] || `Verification failed: ${reason}. Please try again.`;
}
