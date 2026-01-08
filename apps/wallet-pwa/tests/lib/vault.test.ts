import { describe, it, expect } from "vitest";
import { createEmptyVault, encryptVault, decryptVault, generateSalt } from "../../src/lib/vault";

const samplePayload = {
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
  masterSecret: "dGVzdA==",
  consentReceipts: []
};

describe("vault", () => {
  it("encrypts and decrypts payload", async () => {
    const salt = generateSalt();
    const envelope = await encryptVault(samplePayload, "strong-passphrase", salt);
    const decrypted = await decryptVault(envelope, "strong-passphrase");
    expect(decrypted.profile?.givenName).toBe("ALICE");
  });
});
