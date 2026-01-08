import { useEffect, useMemo, useState } from "react";
import { useWalletStore } from "./store/wallet.store";
import { EnrollmentFlow } from "./components/EnrollmentFlow";
import { ProofFlow } from "./components/ProofFlow";
import { SafetyMode } from "./components/SafetyMode";
import { Settings } from "./components/Settings";
import { Companion } from "./components/Companion";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { loadVaultEnvelope } from "./lib/vault-storage";
import "./styles.css";

const registryUrl = (import.meta.env as Record<string, string>).VITE_REGISTRY_URL || "http://localhost:3000";

export function App() {
  const { currentFlow, vaultLocked, unlockVault } = useWalletStore();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [initState, setInitState] = useState<"loading" | "unlock" | "enroll" | "ready">("loading");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState("");

  // Initialize: check if vault exists
  useEffect(() => {
    const init = async () => {
      try {
        const envelope = await loadVaultEnvelope("primary");
        if (envelope) {
          setInitState("unlock");
        } else {
          setInitState("enroll");
        }
      } catch (err) {
        console.warn("Vault check failed:", err);
        setInitState("enroll");
      }
    };
    init();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(err => {
        console.warn("Service worker registration failed:", err);
      });
    }
  }, []);

  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUnlockError("");
    try {
      await unlockVault(unlockPassphrase);
      setUnlockPassphrase("");
      setInitState("ready");
      useWalletStore.getState().setFlow("idle");
    } catch (err) {
      setUnlockError(`Unlock failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Show unlock screen
  if (initState === "unlock") {
    return (
      <div className="app-shell">
        <header className="app-header">
          <span>Shielded ID Wallet</span>
        </header>
        <main className="auth-container">
          <div className="auth-card">
            <h1>Unlock Wallet</h1>
            <p>Enter your vault passphrase to continue.</p>
            <form onSubmit={handleUnlockVault}>
              <div className="field">
                <label>Vault Passphrase</label>
                <input
                  type="password"
                  placeholder="Enter passphrase"
                  value={unlockPassphrase}
                  onChange={(e) => setUnlockPassphrase(e.target.value)}
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>
              {unlockError && <div className="error-message">{unlockError}</div>}
              <button type="submit" disabled={loading} className="primary">
                {loading ? "Unlocking..." : "Unlock"}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // Show enrollment screen
  if (initState === "enroll") {
    return (
      <div className="app-shell">
        <header className="app-header">
          <span>Shielded ID Wallet</span>
        </header>
        <main>
          <EnrollmentFlow 
            onComplete={() => {
              setInitState("ready");
              useWalletStore.getState().setFlow("idle");
            }}
          />
        </main>
      </div>
    );
  }

  // Show loading
  if (initState === "loading") {
    return (
      <div className="app-shell">
        <header className="app-header">
          <span>Shielded ID Wallet</span>
        </header>
        <main className="auth-container">
          <div className="auth-card">
            <h1>Initializing...</h1>
            <p>Loading wallet...</p>
          </div>
        </main>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${registryUrl}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      const result = await resp.json();
      if (result.ok) {
        setUserEmail(email);
        setAuthMode(null);
        setEmail("");
        setPassword("");
      } else {
        alert(`Login failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Login error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      alert("Password must be at least 12 characters");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${registryUrl}/api/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      const result = await resp.json();
      if (result.ok) {
        alert("Sign-up successful. Please log in.");
        setAuthMode("login");
        setEmail("");
        setPassword("");
      } else {
        alert(`Sign-up failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Sign-up error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await fetch(`${registryUrl}/api/user/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const result = await resp.json();
      alert(result.message || "Password reset link sent (if account exists)");
      setAuthMode("login");
      setEmail("");
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUserEmail(null);
    setAuthMode("login");
    setEmail("");
    setPassword("");
  };

  // Auth flow: optional login, then wallet
  if (!userEmail && authMode) {
    if (authMode === "login") {
      return (
        <div className="auth-container">
          <div className="auth-card">
            <h1>Shielded ID Wallet</h1>
            <h2>Login</h2>
            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
            </form>
            <button onClick={() => setAuthMode("signup")}>Create Account</button>
            <button onClick={() => setAuthMode("forgot")}>Forgot Password?</button>
            <button onClick={() => setAuthMode(null)}>Use Local Mode (No Account)</button>
          </div>
        </div>
      );
    }

    if (authMode === "signup") {
      return (
        <div className="auth-container">
          <div className="auth-card">
            <h1>Shielded ID Wallet</h1>
            <h2>Sign Up</h2>
            <form onSubmit={handleSignUp}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="password"
                placeholder="Password (min 12 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>{loading ? "Signing up..." : "Sign Up"}</button>
            </form>
            <button onClick={() => setAuthMode("login")}>Back to Login</button>
          </div>
        </div>
      );
    }

    if (authMode === "forgot") {
      return (
        <div className="auth-container">
          <div className="auth-card">
            <h1>Shielded ID Wallet</h1>
            <h2>Reset Password</h2>
            <form onSubmit={handleForgotPassword}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>{loading ? "Sending..." : "Send Reset Link"}</button>
            </form>
            <button onClick={() => setAuthMode("login")}>Back to Login</button>
          </div>
        </div>
      );
    }
  }

  // Wallet flow (with optional account header)
  const content = useMemo(() => {
    if (vaultLocked) {
      return <div className="panel">Vault locked. Unlock to continue.</div>;
    }
    switch (currentFlow) {
      case "enrollment":
        return <EnrollmentFlow />;
      case "proof":
        return <ProofFlow />;
      case "settings":
        return <Settings />;
      case "companion":
        return <Companion />;
      default:
        return (
          <div className="stack">
            <div className="panel">
              <h2>Shielded ID Wallet</h2>
              <p>Offline-first, privacy-preserving identity vault.</p>
            </div>
            <SafetyMode />
          </div>
        );
    }
  }, [currentFlow, vaultLocked]);

  return (
    <div className="app-shell">
      <PWAInstallPrompt />
      <header className="app-header">
        <span>Shielded ID {userEmail && `(${userEmail})`}</span>
        <nav className="app-nav">
          <button onClick={() => useWalletStore.getState().setFlow("enrollment")}>Enroll</button>
          <button onClick={() => useWalletStore.getState().setFlow("proof")}>Proof</button>
          <button onClick={() => useWalletStore.getState().setFlow("companion")}>Companion</button>
          <button onClick={() => useWalletStore.getState().setFlow("settings")}>Settings</button>
          {userEmail && <button onClick={handleLogout}>Logout</button>}
          {!userEmail && <button onClick={() => setAuthMode("login")}>Login</button>}
        </nav>
      </header>
      <main>{content}</main>
    </div>
  );
}
