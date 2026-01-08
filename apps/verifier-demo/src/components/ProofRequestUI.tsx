import { useEffect, useMemo, useState } from "react";
import type { ProofRequest } from "@shielded-id/verifier-sdk";
import { ShieldedVerifier } from "@shielded-id/verifier-sdk";
import type { ProofType } from "../App";

const verifier = new ShieldedVerifier({
  origin: import.meta.env.VITE_VERIFIER_ORIGIN ?? "http://localhost:5174",
  registryUrl: import.meta.env.VITE_REGISTRY_URL ?? "http://localhost:3000"
});

interface ProofRequestUIProps {
  proofType: ProofType;
  useZkMode: boolean;
  request: ProofRequest | null;
  onRequest: (request: ProofRequest) => void;
  onCancel: () => void;
}

function buildRequest(type: ProofType): ProofRequest {
  if (type === "AGE") {
    return verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: `${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5050"}/verify-callback` }
    });
  }
  if (type === "KYC") {
    return verifier.createProofRequest({
      requestedClaims: [{ type: "KYC_LEVEL", minLevel: 2 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: `${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5050"}/verify-callback` }
    });
  }
  return verifier.createProofRequest({
    requestedClaims: [{ type: "CONTINUITY" }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
    callback: { method: "POST", url: `${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5050"}/verify-callback` }
  });
}

async function registerRequest(request: ProofRequest) {
  await fetch("/api/proof-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
}

export function ProofRequestUI({ proofType, useZkMode, request, onRequest, onCancel }: ProofRequestUIProps) {
  const [qr, setQr] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(300);

  useEffect(() => {
    const nextRequest = buildRequest(proofType);
    onRequest(nextRequest);
    registerRequest(nextRequest).catch(() => undefined);
  }, [proofType, onRequest]);

  useEffect(() => {
    if (!request) return;
    let timer = 0;
    const tick = () => {
      const expiresAt = new Date(request.expiresAt).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setExpiresIn(remaining);
      if (remaining === 0) {
        const nextRequest = buildRequest(proofType);
        onRequest(nextRequest);
        registerRequest(nextRequest).catch(() => undefined);
      }
    };
    timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [request, proofType, onRequest]);

  useEffect(() => {
    let qrTimer = 0;
    const updateQr = async () => {
      if (!request) return;
      const dataUrl = await verifier.generateQR(request);
      setQr(dataUrl);
    };
    updateQr().catch(() => undefined);
    qrTimer = window.setInterval(() => updateQr().catch(() => undefined), 30000);
    return () => window.clearInterval(qrTimer);
  }, [request]);

  const deepLink = useMemo(() => {
    if (!request) return "";
    return verifier.generateDeepLink(request);
  }, [request]);

  return (
    <div className="panel">
      <div className="qr">
        <h2>Scan this QR with SHIELDED ID Wallet</h2>
        <div style={{ marginBottom: "10px", padding: "10px", backgroundColor: useZkMode ? "#e8f5e8" : "#fff3cd", borderRadius: "4px" }}>
          <strong>Proof Mode:</strong> {useZkMode ? "Zero-Knowledge (Recommended)" : "Legacy (Reveals exact values)"}
        </div>
        {qr && <img src={qr} alt="Proof request QR" />}
        <p>Request expires in {expiresIn} seconds.</p>
        <button
          className="secondary"
          onClick={() => navigator.clipboard.writeText(deepLink)}
        >
          Copy deep link
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
