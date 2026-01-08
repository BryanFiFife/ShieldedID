import { useEffect, useState } from "react";

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false); // Only show when PWA install is available
  const [showModal, setShowModal] = useState(false);
  const [hasInstallPrompt, setHasInstallPrompt] = useState(false);

  useEffect(() => {
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setHasInstallPrompt(true);
      setShowBanner(true); // Show banner when PWA install is available
    };

    const appInstalledHandler = () => {
      setShowBanner(false);
      setShowModal(false);
      setHasInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    window.addEventListener("appinstalled", appInstalledHandler);
    
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstallClick = () => {
    setShowBanner(false);
    setShowModal(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      console.log("User accepted the PWA install");
    }
    
    setDeferredPrompt(null);
    setHasInstallPrompt(false);
    setShowModal(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowModal(false);
  };

  return (
    <>
      {/* Banner at top */}
      {showBanner && hasInstallPrompt && !showModal && (
        <div className="pwa-install-banner">
          <div className="pwa-banner-content">
            <span className="pwa-banner-icon">📱</span>
            <span className="pwa-banner-text">Install Shielded ID Wallet for offline access</span>
            <button className="pwa-banner-btn" onClick={handleInstallClick}>
              Install
            </button>
            <button className="pwa-banner-close" onClick={handleDismiss}>×</button>
          </div>
        </div>
      )}

      {/* Modal when install is clicked */}
      {showModal && hasInstallPrompt && (
        <div className="pwa-install-modal-overlay">
          <div className="pwa-install-modal">
            <div className="pwa-install-icon">📱</div>
            <div className="pwa-install-content">
              <h3>Install Shielded ID Wallet</h3>
              <p>Install this app on your device for:</p>
              <ul className="pwa-features">
                <li>⚡ Offline access and fast load times</li>
                <li>🔐 Secure privacy-preserving identity vault</li>
                <li>📱 Native app experience</li>
                <li>🔄 Automatic updates</li>
              </ul>
            </div>
            <div className="pwa-modal-buttons">
              <button className="btn-primary" onClick={handleInstall}>
                Install Now
              </button>
              <button className="btn-secondary" onClick={handleDismiss}>
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
