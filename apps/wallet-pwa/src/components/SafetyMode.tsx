import { useState } from "react";
import { useWalletStore } from "../store/wallet.store";

export function SafetyMode() {
  const panicWipe = useWalletStore((state) => state.panicWipe);
  const safetyModeEnabled = useWalletStore((state) => state.safetyModeEnabled);
  const setSafetyMode = useWalletStore((state) => state.setSafetyMode);
  const decoyModeActive = useWalletStore((state) => state.decoyModeActive);
  const toggleDecoyMode = useWalletStore((state) => state.toggleDecoyMode);
  const createDecoyVault = useWalletStore((state) => state.createDecoyVault);
  const [decoyPin, setDecoyPin] = useState("");

  return (
    <div className="panel">
      <h2>Safety Mode</h2>
      <label>
        <input
          type="checkbox"
          checked={safetyModeEnabled}
          onChange={(event) => setSafetyMode(event.target.checked)}
        />
        Safety mode enabled
      </label>
      <div className="field">
        <label>Decoy wallet PIN</label>
        <input
          type="password"
          value={decoyPin}
          onChange={(event) => setDecoyPin(event.target.value)}
        />
      </div>
      <label>
        <input
          type="checkbox"
          checked={decoyModeActive}
          onChange={async (event) => {
            if (event.target.checked && decoyPin.length >= 4) {
              await createDecoyVault(decoyPin);
            }
            toggleDecoyMode(event.target.checked);
          }}
        />
        Decoy wallet active
      </label>
      <button className="primary" onClick={() => void panicWipe()}>
        Panic Wipe
      </button>
    </div>
  );
}
