import { useEffect, useState } from "react";
import QrCode from "qrcode-reader";
import { useWalletStore } from "../store/wallet.store";
import type { ProofRequest } from "../lib/proof-generator";
import { zkAgent } from "../lib/zk-agent";

function parseProofLink(link: string): ProofRequest | null {
  try {
    const url = new URL(link);
    if (url.protocol !== "shielded-id:") return null;
    const requestId = url.searchParams.get("request_id");
    const nonce = url.searchParams.get("nonce");
    const verifierOrigin = url.searchParams.get("verifier_origin");
    const expiresAt = url.searchParams.get("expires_at");
    if (!requestId || !nonce || !verifierOrigin) return null;
    return {
      requestId,
      nonce,
      verifierOrigin,
      expiresAt: expiresAt || undefined,
      requestedClaims: []
    };
  } catch {
    return null;
  }
}

export function ProofFlow() {
  const generateProof = useWalletStore((state) => state.generateProof);
  const [request, setRequest] = useState<ProofRequest | null>(null);
  const [step, setStep] = useState<"scan" | "preview" | "confirm" | "receipt">("scan");
  const [proofResult, setProofResult] = useState<unknown>(null);
  const [claimSelection, setClaimSelection] = useState({
    ageOver: true,
    kycLevel: true,
    continuity: true
  });
  const [zkAgentAvailable, setZkAgentAvailable] = useState<boolean | null>(null);

  // Check ZK agent availability on mount
  useEffect(() => {
    zkAgent.isAgentAvailable().then(setZkAgentAvailable).catch(() => setZkAgentAvailable(false));
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const qr = new QrCode();

    const scan = async () => {
      const video = document.querySelector("video#qr-cam") as HTMLVideoElement | null;
      if (!video || !context) return;
      if (video.videoWidth === 0) {
        rafId = requestAnimationFrame(scan);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      qr.callback = (err, value) => {
        if (err || !value?.result) {
          rafId = requestAnimationFrame(scan);
          return;
        }
        const parsed = parseProofLink(value.result);
        if (parsed) {
          setRequest(parsed);
          setStep("preview");
        } else {
          rafId = requestAnimationFrame(scan);
        }
      };
      qr.decode(imageData);
    };

    const setup = async () => {
      const video = document.querySelector("video#qr-cam") as HTMLVideoElement | null;
      if (!video) return;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      rafId = requestAnimationFrame(scan);
    };

    if (step === "scan") {
      setup().catch(() => undefined);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [step]);

  const handleConfirm = async () => {
    if (!request) return;
    const requestedClaims = [] as ProofRequest["requestedClaims"];
    if (claimSelection.ageOver) requestedClaims.push({ type: "AGE_OVER" });
    if (claimSelection.kycLevel) requestedClaims.push({ type: "KYC_LEVEL", minLevel: 2 });
    if (claimSelection.continuity) requestedClaims.push({ type: "CONTINUITY" });
    const proof = await generateProof({ ...request, requestedClaims });
    setProofResult(proof);
    setStep("receipt");
  };

  return (
    <div className="stack">
      {step === "scan" && (
        <div className="panel">
          <h2>Scan Verifier QR</h2>
          <video id="qr-cam" autoPlay playsInline style={{ width: "100%", borderRadius: 12 }} />
        </div>
      )}
      {step === "preview" && request && (
        <div className="panel">
          <h2>Disclosure Preview</h2>
          <p>Verifier: {request.verifierOrigin}</p>

          {/* ZK Agent Status */}
          <div className="field">
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: zkAgentAvailable === true ? '#e8f5e8' : zkAgentAvailable === false ? '#ffe8e8' : '#f5f5f5',
              border: `1px solid ${zkAgentAvailable === true ? '#4caf50' : zkAgentAvailable === false ? '#f44336' : '#ccc'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: zkAgentAvailable === true ? '#4caf50' : zkAgentAvailable === false ? '#f44336' : '#ccc'
                }} />
                <span style={{ fontSize: '14px', fontWeight: '500' }}>
                  {zkAgentAvailable === true && "ZK Agent: Real proofs active"}
                  {zkAgentAvailable === false && "ZK Agent: Not available - using fallback"}
                  {zkAgentAvailable === null && "ZK Agent: Checking..."}
                </span>
              </div>
              {zkAgentAvailable === false && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  For enhanced privacy, install the ZK agent from the settings menu.
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={claimSelection.ageOver}
                onChange={(event) =>
                  setClaimSelection((prev) => ({ ...prev, ageOver: event.target.checked }))
                }
              />
              Age over 18 {zkAgentAvailable ? "(Zero-knowledge proof)" : "(Signed predicate)"}
            </label>
            <label>
              <input
                type="checkbox"
                checked={claimSelection.kycLevel}
                onChange={(event) =>
                  setClaimSelection((prev) => ({ ...prev, kycLevel: event.target.checked }))
                }
              />
              KYC level {zkAgentAvailable ? "(Zero-knowledge proof)" : "(Signed predicate)"}
            </label>
            <label>
              <input
                type="checkbox"
                checked={claimSelection.continuity}
                onChange={(event) =>
                  setClaimSelection((prev) => ({ ...prev, continuity: event.target.checked }))
                }
              />
              Continuity (pairwise ID)
            </label>
          </div>
          <button className="primary" onClick={() => setStep("confirm")}>
            Continue
          </button>
        </div>
      )}
      {step === "confirm" && (
        <div className="panel">
          <h2>Confirm Proof</h2>
          <p>Unlock and approve proof sharing.</p>
          <button className="primary" onClick={handleConfirm}>
            Send Proof
          </button>
        </div>
      )}
      {step === "receipt" && (
        <div className="panel">
          <h2>Receipt</h2>
          <pre>{JSON.stringify(proofResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
