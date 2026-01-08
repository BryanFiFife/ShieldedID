import init, {
  prove_ge as wasm_prove_ge,
  verify_ge_components as wasm_verify_ge_components,
  base64url_encode,
  base64url_decode,
  ProofBundle
} from '../pkg/shielded_age_zk.js';

// Domain separation labels
const SUITE_ID = "AGE_ZK_BULLETPROOFS_V1";
const DOMAIN_SEPARATOR = "shielded-id-zk-context-v1";

let initialized = false;

/// Initialize the WASM module
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await init();
    initialized = true;
  }
}

/// Create context string for proof binding
function createContext(verifierOrigin: string, nonce: string, expiry: string): string {
  return `${DOMAIN_SEPARATOR}|${SUITE_ID}|${verifierOrigin}|${nonce}|${expiry}`;
}

/// Generate a zero-knowledge proof that value >= min
export async function proveGE(
  value: number,
  min: number,
  verifierOrigin: string,
  nonce: string,
  expiry: string
): Promise<{
  commitment: string;
  proof: string;
  publicInputs: string;
}> {
  await ensureInitialized();

  const context = createContext(verifierOrigin, nonce, expiry);

  const bundle = wasm_prove_ge(BigInt(value), BigInt(min), context);
  if (!bundle) {
    throw new Error("Proof generation failed");
  }

  return {
    commitment: base64url_encode(bundle.commitment),
    proof: base64url_encode(bundle.proof),
    publicInputs: base64url_encode(bundle.public_inputs)
  };
}

/// Verify a zero-knowledge proof that the committed value >= min
export async function verifyGE(
  proof: {
    commitment: string;
    proof: string;
    publicInputs: string;
  },
  min: number,
  verifierOrigin: string,
  nonce: string,
  expiry: string
): Promise<boolean> {
  await ensureInitialized();

  const context = createContext(verifierOrigin, nonce, expiry);

  // Reconstruct the proof bundle
  const commitmentBytes = base64url_decode(proof.commitment);
  const proofBytes = base64url_decode(proof.proof);
  const publicInputsBytes = base64url_decode(proof.publicInputs);

  return wasm_verify_ge_components(commitmentBytes, proofBytes, publicInputsBytes, BigInt(min), context);
}

// Legacy compatibility exports (will be removed)
export class PedersenCommitment {
  constructor() {
    throw new Error("Legacy PedersenCommitment removed - use WASM ZK proofs");
  }
}

export class RangeProof {
  constructor() {
    throw new Error("Legacy RangeProof removed - use WASM ZK proofs");
  }
}

export class AgeProof {
  constructor() {
    throw new Error("Legacy AgeProof removed - use WASM ZK proofs");
  }
}

export class AssuranceProof {
  constructor() {
    throw new Error("Legacy AssuranceProof removed - use WASM ZK proofs");
  }
}