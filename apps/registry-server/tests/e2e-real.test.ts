import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes, webcrypto } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { buildApp } from "../src/app.js";
import { ShieldedAttester } from "../../../packages/attester-sdk/src/attester.ts";
import { ShieldedVerifier } from "../../../packages/verifier-sdk/src/verifier.ts";
import {
  createSigningKey,
  decryptSigningKey,
  signWithSoftwareKey
} from "../../wallet-pwa/src/lib/keys.ts";
import {
  generateProof as generateWalletProof,
  stableStringify as walletStableStringify
} from "../../wallet-pwa/src/lib/proof-generator.ts";
import type { VaultPayload } from "../../wallet-pwa/src/lib/vault.ts";

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function signPayload(privateKey: CryptoKey, payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(walletStableStringify(payload));
  return toBase64(await signWithSoftwareKey(bytes, privateKey));
}

describe.sequential("real issuer → registry → wallet → verifier flow", () => {
  const issuerToken = "integration-issuer-registration-token-0123456789abcdef";
  const passphrase = "integration-wallet-passphrase-123";
  const databasePath = join(tmpdir(), `shielded-id-e2e-${process.pid}-${Date.now()}.sqlite`);

  let app: Awaited<ReturnType<typeof buildApp>>;
  let registryUrl = "";

  beforeAll(async () => {
    if (!globalThis.crypto?.subtle) {
      Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    }
    process.env.DATABASE_URL = `file:${databasePath}`;
    process.env.ISSUER_REGISTRATION_TOKEN = issuerToken;
    process.env.ALLOWED_ORIGINS = "https://verifier.example";

    app = await buildApp();
    registryUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  });

  afterAll(async () => {
    await app?.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      await rm(`${databasePath}${suffix}`, { force: true }).catch(() => undefined);
    }
  });

  it("accepts a genuine issuer-bound proof and rejects both issuer and wallet revocation", async () => {
    const { privateKey: issuerPrivatePem, publicKey: issuerPublicPem } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" }
    });

    const attester = new ShieldedAttester({
      attesterId: "e2e-issuer",
      attestorName: "Shielded ID E2E Issuer",
      attestorUrl: "https://issuer.example",
      registryUrl,
      privateKeyPem: issuerPrivatePem,
      publicKeyPem: issuerPublicPem,
      registryAuthToken: issuerToken,
      keyId: "e2e-issuer#signing-1"
    });

    const issuerRegistration = await attester.registerPublicKey();
    expect(issuerRegistration.success).toBe(true);
    expect(issuerRegistration.keyId).toBe("e2e-issuer#signing-1");

    const credential = await attester.issueCredential(
      "subject-e2e",
      {
        dateOfBirth: "1990-01-01",
        kycLevel: 2
      },
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );

    expect(credential.numericWitnesses.DOB_YYYYMMDD).toBeDefined();
    expect(credential.numericWitnesses.KYC_LEVEL).toBeDefined();
    expect(await attester.verifyCredential(credential.credential, credential.signature)).toBe(true);
    expect(await attester.verifyCommitmentAttestation(credential.numericWitnesses.DOB_YYYYMMDD!.attestation)).toBe(true);
    expect(await attester.verifyCommitmentAttestation(credential.numericWitnesses.KYC_LEVEL!.attestation)).toBe(true);

    const signing = await createSigningKey(passphrase);
    const walletPrivateKey = await decryptSigningKey(passphrase, signing.encryptedPrivateKey);
    const webauthnCredentialId = randomBytes(24).toString("base64");
    const registrationPayload = {
      action: "WALLET_REGISTER" as const,
      publicKeys: { signing: signing.publicKeyJwk },
      webauthnCredentialId,
      suiteVersion: "2.0"
    };
    const registrationSignature = await signPayload(walletPrivateKey, registrationPayload);

    const walletRegistrationResponse = await fetch(`${registryUrl}/v1/wallet/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registrationPayload, signature: registrationSignature })
    });
    expect(walletRegistrationResponse.status).toBe(201);
    const walletRegistration = await walletRegistrationResponse.json() as {
      walletId: string;
      keyId: string;
      status: string;
    };
    expect(walletRegistration.status).toBe("ACTIVE");
    expect(walletRegistration.walletId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(walletRegistration.keyId).toMatch(/^[0-9a-f-]{36}$/i);

    const statusResponse = await fetch(`${registryUrl}/v1/status/${walletRegistration.walletId}`);
    expect(statusResponse.status).toBe(200);
    const walletStatus = await statusResponse.json() as {
      keys: Array<{ keyId: string; publicKey: JsonWebKey }>;
    };
    expect(walletStatus.keys).toHaveLength(1);
    expect(walletStatus.keys[0].keyId).toBe(walletRegistration.keyId);
    expect(walletStatus.keys[0].publicKey.x).toBe(signing.publicKeyJwk.x);
    expect(walletStatus.keys[0].publicKey.y).toBe(signing.publicKeyJwk.y);

    const verifier = new ShieldedVerifier({
      origin: "https://verifier.example",
      registryUrl
    });
    const request = verifier.createProofRequest({
      requestedClaims: [
        { type: "AGE_OVER", operator: "LE", threshold: 18 },
        { type: "KYC_LEVEL", operator: "GE", minLevel: 2 },
        { type: "CONTINUITY" }
      ],
      policy: {
        requireStatusCheck: true,
        maxAgeSeconds: 120,
        forbidPII: ["dateOfBirth", "name", "email"]
      },
      callback: {
        method: "POST",
        url: "https://verifier.example/callback"
      }
    });

    const vault: VaultPayload = {
      profile: null,
      attributes: [],
      numericWitnesses: credential.numericWitnesses,
      masterSecret: randomBytes(32).toString("base64"),
      walletId: walletRegistration.walletId,
      signingKeyId: walletRegistration.keyId,
      signingKeyEncrypted: toBase64(signing.encryptedPrivateKey),
      consentReceipts: [],
      safety: { decoyEnabled: false }
    };

    const proof = await generateWalletProof(request, vault, {
      walletId: walletRegistration.walletId,
      keyId: walletRegistration.keyId,
      passphrase
    });

    expect(proof.claims.map((claim) => claim.value)).toEqual([true, true, proof.pairwiseSubjectId]);
    expect(proof.suite).toBe("BULLETPROOFS_RISTRETTO_BOUND_V2");
    expect(JSON.stringify(proof)).not.toContain("1990-01-01");
    expect(JSON.stringify(proof)).not.toContain('"kycLevel":2');

    const valid = await verifier.verifyProof(request, proof, { checkRevocation: true });
    expect(valid.valid, valid.reason).toBe(true);
    expect(valid.assuranceLevel).toBe(2);
    expect(valid.pairwiseSubjectId).toBe(proof.pairwiseSubjectId);

    await attester.revokeAllCredentials("E2E issuer revocation");
    const afterIssuerRevocation = await verifier.verifyProof(request, proof, { checkRevocation: true });
    expect(afterIssuerRevocation.valid).toBe(false);
    expect(afterIssuerRevocation.reason).toBe("ZK_OR_ISSUER_PROOF_INVALID");

    const revokePayload = {
      action: "WALLET_REVOKE" as const,
      walletId: walletRegistration.walletId,
      targetType: "KEY" as const,
      targetIds: [walletRegistration.keyId],
      reason: "E2E key revocation"
    };
    const revokeSignature = await signPayload(walletPrivateKey, revokePayload);
    const revokeResponse = await fetch(`${registryUrl}/v1/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...revokePayload, signature: revokeSignature })
    });
    expect(revokeResponse.status).toBe(200);
    const revokeResult = await revokeResponse.json() as { ok: boolean; revokedCount: number };
    expect(revokeResult.ok).toBe(true);
    expect(revokeResult.revokedCount).toBe(1);

    const keyStatusResponse = await fetch(`${registryUrl}/v1/keys/${walletRegistration.keyId}/status`);
    expect(keyStatusResponse.status).toBe(200);
    const keyStatus = await keyStatusResponse.json() as { status: string };
    expect(keyStatus.status).toBe("REVOKED");

    const afterWalletRevocation = await verifier.verifyProof(request, proof, { checkRevocation: true });
    expect(afterWalletRevocation.valid).toBe(false);
    expect(afterWalletRevocation.reason).toBe("NO_ACTIVE_MATCHING_KEY");
  }, 60_000);
});
