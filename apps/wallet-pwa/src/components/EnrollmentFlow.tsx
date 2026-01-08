import { useEffect, useState } from "react";
import { captureDocumentImage, performOCR, normalizeAttribute } from "../lib/document-capture";
import { useWalletStore } from "../store/wallet.store";

interface EnrollmentFlowProps {
  onComplete?: () => void;
}

export function EnrollmentFlow({ onComplete }: EnrollmentFlowProps) {
  const enrollWallet = useWalletStore((state) => state.enrollWallet);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [ocrResult, setOcrResult] = useState({
    givenName: "",
    familyName: "",
    dateOfBirth: "",
    documentType: "",
    issuer: "",
    issuedDate: "",
    expiryDate: ""
  });
  const [busy, setBusy] = useState(false);

  const handleCapture = async () => {
    const video = document.querySelector("video#doc-cam") as HTMLVideoElement | null;
    if (!video) return;
    setBusy(true);
    try {
      const image = await captureDocumentImage(video, "front");
      const ocr = await performOCR(image);
      setOcrResult({
        givenName: normalizeAttribute(ocr.givenName, "givenName"),
        familyName: normalizeAttribute(ocr.familyName, "familyName"),
        dateOfBirth: normalizeAttribute(ocr.dateOfBirth, "dateOfBirth"),
        documentType: normalizeAttribute(ocr.documentType, "documentType"),
        issuer: normalizeAttribute(ocr.issuer, "issuer"),
        issuedDate: normalizeAttribute(ocr.issuedDate, "issuedDate"),
        expiryDate: normalizeAttribute(ocr.expiryDate, "expiryDate")
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    const setupCamera = async () => {
      const video = document.querySelector("video#doc-cam") as HTMLVideoElement | null;
      if (!video) return;
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
    };
    setupCamera().catch(() => undefined);
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleEnroll = async () => {
    if (passphrase.length < 12 || passphrase !== confirmPassphrase) {
      return;
    }
    setBusy(true);
    try {
      await enrollWallet(passphrase, ocrResult);
      onComplete?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="panel">
        <h2>Vault Passphrase</h2>
        <div className="field">
          <label>Passphrase (12-20 chars)</label>
          <input
            type="password"
            value={passphrase}
            minLength={12}
            maxLength={20}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </div>
        <div className="field">
          <label>Confirm passphrase</label>
          <input
            type="password"
            value={confirmPassphrase}
            minLength={12}
            maxLength={20}
            onChange={(event) => setConfirmPassphrase(event.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Document Capture</h2>
        <video id="doc-cam" autoPlay playsInline style={{ width: "100%", borderRadius: 12 }} />
        <button className="primary" onClick={handleCapture} disabled={busy}>
          Capture + OCR
        </button>
        <p>Confirm each field below.</p>
        {Object.entries(ocrResult).map(([key, value]) => (
          <div className="field" key={key}>
            <label>{key}</label>
            <input
              value={value}
              onChange={(event) =>
                setOcrResult((prev) => ({
                  ...prev,
                  [key]: event.target.value
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Key Generation + Registration</h2>
        <button className="primary" onClick={handleEnroll} disabled={busy}>
          Complete Enrollment
        </button>
      </div>
    </div>
  );
}
