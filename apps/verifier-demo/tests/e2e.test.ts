// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { buildApp } from "../../registry-server/src/app.ts";
import { createEmptyVault, encryptVault, decryptVault, generateSalt } from "../../wallet-pwa/src/lib/vault";
import { createSigningKey, decryptSigningKey } from "../../wallet-pwa/src/lib/keys";
import { generateProof } from "../../wallet-pwa/src/lib/proof-generator";
import { deriveMasterSecret, generatePairwiseSubjectId } from "../../wallet-pwa/src/lib/pairwise-id";
import { ShieldedVerifier } from "../../../packages/verifier-sdk/src/verifier.ts";

const encoder = new TextEncoder();

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries.map(([k, v]) => `"${k}":${stableStringify(v)}`).join(",");
    return `{${body}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64FromString(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

async function signPayload(privateKey: CryptoKey, payload: unknown): Promise<string> {
  const data = encoder.encode(stableStringify(payload));
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data
  );
  return bytesToBase64(new Uint8Array(signature));
}

async function startIssuerServer(keys: JsonWebKey[]) {
  const server = createServer((req, res) => {
    if (req.url === "/.well-known/shielded-id-keys.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("ISSUER_SERVER_FAILED");
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

let registryUrl = "";
let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(async () => {
  globalThis.crypto = webcrypto as unknown as Crypto;
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { self?: unknown }).self = globalThis;
  if (!globalThis.btoa) {
    globalThis.btoa = (value: string) => Buffer.from(value, "binary").toString("base64");
  }
  if (!globalThis.atob) {
    globalThis.atob = (value: string) => Buffer.from(value, "base64").toString("binary");
  }
  process.env.DATABASE_URL = ":memory:";
  app = await buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("REGISTRY_FAILED");
  }
  registryUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (app) {
    await app.close();
  }
});

describe("Shielded ID end-to-end", () => {
  it("enrollment flow: vault encrypt + register wallet", async () => {
    const salt = generateSalt();
    const vault = {
      ...createEmptyVault(),
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      },
      masterSecret: base64FromString("master"),
      consentReceipts: []
    };
    const envelope = await encryptVault(vault, "strong-passphrase", salt);
    const decrypted = await decryptVault(envelope, "strong-passphrase");
    expect(decrypted.profile?.givenName).toBe("ALICE");

    const signingKey = await createSigningKey("strong-passphrase");
    const privateKey = await decryptSigningKey("strong-passphrase", signingKey.encryptedPrivateKey);

    const payload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingKey.publicKeyJwk },
      webauthnCredentialId: base64FromString("cred"),
      suiteVersion: "1.0"
    };
    const signature = await signPayload(privateKey, payload);

    const response = await fetch(`${registryUrl}/v1/wallet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, signature })
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.walletId).toBeTruthy();
  });

  it("proof generation + verification", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);
    const privateKey = await decryptSigningKey(passphrase, signingKey.encryptedPrivateKey);

    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingKey.publicKeyJwk },
      webauthnCredentialId: base64FromString("cred"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);

    const registerResponse = await fetch(`${registryUrl}/v1/wallet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registerPayload, signature: registerSignature })
    });

    const registerResult = await registerResponse.json();
    const statusResponse = await fetch(`${registryUrl}/v1/status/${registerResult.walletId}`);
    const status = await statusResponse.json();
    const keyId = status.keys[0].keyId as string;

    const verifier = new ShieldedVerifier({
      origin: "https://demo.local",
      registryUrl
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://demo.local/verify-callback" }
    });

    const vault = {
      ...createEmptyVault(),
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      },
      masterSecret: bytesToBase64(webcrypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: bytesToBase64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined
    };

    const proof = await generateProof(request, vault, {
      walletId: registerResult.walletId,
      keyId,
      passphrase
    });

    const result = await verifier.verifyProof(request, proof, { checkRevocation: true });
    expect(result.valid).toBe(true);
    expect(result.pairwiseSubjectId).toBeTruthy();
  });

  it("revocation rejects proofs", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);
    const privateKey = await decryptSigningKey(passphrase, signingKey.encryptedPrivateKey);

    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingKey.publicKeyJwk },
      webauthnCredentialId: base64FromString("cred"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);

    const registerResponse = await fetch(`${registryUrl}/v1/wallet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registerPayload, signature: registerSignature })
    });
    const registerResult = await registerResponse.json();

    const statusResponse = await fetch(`${registryUrl}/v1/status/${registerResult.walletId}`);
    const status = await statusResponse.json();
    const keyId = status.keys[0].keyId as string;

    const revokePayload = {
      action: "WALLET_REVOKE",
      walletId: registerResult.walletId,
      targetType: "KEY",
      targetIds: [keyId],
      reason: "COMPROMISED"
    };
    const revokeSignature = await signPayload(privateKey, revokePayload);
    await fetch(`${registryUrl}/v1/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletId: registerResult.walletId,
        targetType: "KEY",
        targetIds: [keyId],
        reason: "COMPROMISED",
        signature: revokeSignature
      })
    });

    const verifier = new ShieldedVerifier({
      origin: "https://demo.local",
      registryUrl
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "AGE_OVER", threshold: 18 }],
      policy: { requireStatusCheck: true, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://demo.local/verify-callback" }
    });

    const vault = {
      ...createEmptyVault(),
      profile: {
        givenName: "ALICE",
        familyName: "DOE",
        dateOfBirth: "1990-05-15",
        documentType: "ID",
        issuer: "USA",
        issuedDate: "2020-01-01",
        expiryDate: "2030-01-01"
      },
      masterSecret: bytesToBase64(webcrypto.getRandomValues(new Uint8Array(32))),
      signingKeyEncrypted: bytesToBase64(signingKey.encryptedPrivateKey),
      webauthnCredentialId: undefined
    };

    const proof = await generateProof(request, vault, {
      walletId: registerResult.walletId,
      keyId,
      passphrase
    });

    const result = await verifier.verifyProof(request, proof, { checkRevocation: true });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("KEY_REVOKED");
  });

  it("multiple attesters verify issuer signature", async () => {
    const passphrase = "strong-passphrase";
    const signingKey = await createSigningKey(passphrase);
    const privateKey = await decryptSigningKey(passphrase, signingKey.encryptedPrivateKey);

    const registerPayload = {
      action: "WALLET_REGISTER",
      publicKeys: { signing: signingKey.publicKeyJwk },
      webauthnCredentialId: base64FromString("cred"),
      suiteVersion: "1.0"
    };
    const registerSignature = await signPayload(privateKey, registerPayload);
    const registerResponse = await fetch(`${registryUrl}/v1/wallet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registerPayload, signature: registerSignature })
    });
    const registerResult = await registerResponse.json();

    const bankKeyPair = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const bankJwk = (await webcrypto.subtle.exportKey("jwk", bankKeyPair.publicKey)) as JsonWebKey;

    const bankServer = await startIssuerServer([bankJwk]);

    const verifier = new ShieldedVerifier({
      origin: "https://demo.local",
      registryUrl
    });

    const request = verifier.createProofRequest({
      requestedClaims: [{ type: "CUSTOM" }],
      policy: { requireStatusCheck: false, maxAgeSeconds: 300 },
      callback: { method: "POST", url: "https://demo.local/verify-callback" }
    });

    const claimPayload = {
      type: "CUSTOM",
      value: 42,
      expiresAt: null,
      evidence: null,
      issuer: { did: bankServer.url, keyId: null }
    };
    const issuerSignatureBytes = await webcrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      bankKeyPair.privateKey,
      encoder.encode(stableStringify(claimPayload))
    );
    const issuerSignature = bytesToBase64(new Uint8Array(issuerSignatureBytes));

    const proofResponse = {
      requestId: request.requestId,
      nonce: request.nonce,
      walletId: registerResult.walletId,
      keyId: undefined,
      pairwiseSubjectId: "pairwise-1",
      claims: [
        {
          type: "CUSTOM",
          value: 42,
          issuer: { did: bankServer.url, signature: issuerSignature }
        }
      ],
      suite: "P256",
      signature: ""
    };

    const proofPayload = { ...proofResponse } as Record<string, unknown>;
    delete proofPayload.signature;
    proofResponse.signature = await signPayload(privateKey, proofPayload);

    const result = await verifier.verifyProof(request, proofResponse, { checkRevocation: false });
    expect(result.valid).toBe(true);

    await new Promise<void>((resolve) => bankServer.server.close(() => resolve()));
  });

  it("pairwise subject IDs differ per verifier", async () => {
    const masterSecret = deriveMasterSecret();
    const idA = await generatePairwiseSubjectId(masterSecret, "https://a.example");
    const idB = await generatePairwiseSubjectId(masterSecret, "https://b.example");
    expect(idA).not.toBe(idB);
  });
});
