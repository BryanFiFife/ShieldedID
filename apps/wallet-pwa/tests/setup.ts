import { expect, vi } from "vitest";
import "@testing-library/jest-dom";

globalThis.vi = vi;

import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Mock the age-zk WASM module
vi.mock('./src/lib/age-zk-mock.js', () => ({
  AgeProof: class {
    async generate_proof(age: number, nonce: string, expiresAt?: string) {
      this.commitment = new Uint8Array([1, 2, 3, 4]);
      this.proof = new Uint8Array([5, 6, 7, 8]);
      this.publicInputs = new Uint8Array([9, 10, 11, 12]);
    }
    get_commitment() { return this.commitment; }
    get_proof() { return this.proof; }
    get_public_inputs() { return this.publicInputs; }
  },
  KycProof: class {
    async generate_proof(kycLevel: number, minLevel: number, nonce: string, expiresAt?: string) {
      this.commitment = new Uint8Array([13, 14, 15, 16]);
      this.proof = new Uint8Array([17, 18, 19, 20]);
      this.publicInputs = new Uint8Array([21, 22, 23, 24]);
    }
    get_commitment() { return this.commitment; }
    get_proof() { return this.proof; }
    get_public_inputs() { return this.publicInputs; }
  }
}));

// Mock the age-zk module for dynamic imports
vi.mock('/age-zk/shielded_age_zk.js', () => ({
  default: {
    generate_proof: vi.fn(() => 'mocked-proof'),
    verify_proof: vi.fn(() => true)
  }
}), { virtual: true });
