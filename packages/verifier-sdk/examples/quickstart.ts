import { ShieldedVerifier } from "../src/verifier.js";

async function main() {
  const verifier = new ShieldedVerifier({
    origin: "https://shop.example",
    registryUrl: "https://registry.example"
  });

  const request = verifier.createProofRequest({
    requestedClaims: [{ type: "AGE_OVER", threshold: 21 }],
    policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
    callback: { method: "POST", url: "https://shop.example/callback" }
  });

  const deepLink = verifier.generateDeepLink(request);
  const qr = await verifier.generateQR(request);

  console.log("Deep link:", deepLink);
  console.log("QR data URL:", qr.slice(0, 64) + "...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
