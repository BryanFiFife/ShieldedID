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

// SECURITY FIX #3: WASM module integrity verification
// Expected SHA-256 hash of the compiled WASM module (update after each build)
const EXPECTED_WASM_HASH = process.env.WASM_MODULE_HASH || "development-mode-skip-verification";
const SKIP_INTEGRITY_CHECK = process.env.NODE_ENV === "development" || EXPECTED_WASM_HASH === "development-mode-skip-verification";

let initialized = false;

// Helper function for SHA-256 hashing (browser-compatible)
async function calculateSHA256Hash(data: ArrayBuffer): Promise<string> {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj?.subtle) {
    throw new Error("CRYPTO_NOT_AVAILABLE");
  }
  const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/// Initialize the WASM module
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    // SECURITY FIX #3: Verify WASM integrity before loading
    if (!SKIP_INTEGRITY_CHECK) {
      try {
        const response = await fetch("../pkg/shielded_age_zk_bg.wasm");
        if (!response.ok) {
          throw new Error("WASM_FETCH_FAILED");
        }
        const wasmData = await response.arrayBuffer();
        const actualHash = await calculateSHA256Hash(wasmData);
        
        if (actualHash !== EXPECTED_WASM_HASH) {
          throw new Error(`WASM_INTEGRITY_CHECK_FAILED: expected ${EXPECTED_WASM_HASH}, got ${actualHash}`);
        }
        console.debug("[ZK] WASM module integrity verified");
      } catch (err) {
        console.error("[ZK] WASM integrity verification failed:", err);
        throw new Error("WASM_INTEGRITY_VERIFICATION_FAILED");
      }
    }
    
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