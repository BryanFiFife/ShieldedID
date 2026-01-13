// Vitest setup file
import { vi } from 'vitest';

// Mock the age-zk module to avoid WASM loading in tests
vi.mock('@shielded-id/age-zk', () => ({
  prove_ge: vi.fn().mockImplementation(async (age: bigint, threshold: bigint, context: string) => {
    // Create proper public inputs with format "threshold|age|context"
    const publicInputsStr = `${threshold}|${age}|${context}`;
    const publicInputs = new TextEncoder().encode(publicInputsStr);

    return {
      commitment: new Uint8Array(32).fill(1), // Mock commitment
      proof: new Uint8Array(670).fill(2), // Mock proof
      public_inputs: publicInputs
    };
  }),
  proveGE: vi.fn().mockResolvedValue({
    commitment: 'mock-commitment',
    proof: 'mock-proof',
    publicInputs: 'mock-public-inputs'
  }),
  verify_ge: vi.fn().mockResolvedValue(true),
  verifyGE: vi.fn().mockResolvedValue(true),
  verify_ge_components: vi.fn().mockResolvedValue(true),
  verifyGEComponents: vi.fn().mockResolvedValue(true),
  init: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally
globalThis.fetch = vi.fn();

// Mock crypto.getRandomValues if not available
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: vi.fn((array) => array.fill(0)),
    randomUUID: vi.fn(() => 'mock-uuid'),
  } as any;
} else if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = vi.fn((array) => array.fill(0));
}

if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = vi.fn(() => 'mock-uuid');
}