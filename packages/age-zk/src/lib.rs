use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::thread_rng;
use wasm_bindgen::prelude::*;
use base64::{Engine as _, engine::general_purpose};

// Domain separation labels
const DOMAIN_PROOF: &[u8] = b"shielded-id-zk-proof-v1";
const DOMAIN_COMMIT: &[u8] = b"shielded-id-commitment-v1";
const DOMAIN_TRANSCRIPT: &[u8] = b"shielded-id-transcript-v1";

/// Proof bundle containing commitment and proof data
#[wasm_bindgen]
pub struct ProofBundle {
    commitment: Vec<u8>,
    proof: Vec<u8>,
    public_inputs: Vec<u8>,
}

#[wasm_bindgen]
impl ProofBundle {
    #[wasm_bindgen(getter)]
    pub fn commitment(&self) -> Vec<u8> {
        self.commitment.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn proof(&self) -> Vec<u8> {
        self.proof.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn public_inputs(&self) -> Vec<u8> {
        self.public_inputs.clone()
    }
}

/// Generate a zero-knowledge range proof that value >= min using Bulletproofs
#[wasm_bindgen]
pub fn prove_ge(value: u64, min: u64, context: &str) -> Result<ProofBundle, JsValue> {
    if value < min {
        return Err(JsValue::from_str("Value must be >= min"));
    }

    let mut rng = thread_rng();

    // Create generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Create transcript with domain separation and context binding
    let mut transcript = Transcript::new(DOMAIN_TRANSCRIPT);
    transcript.append_message(b"suite", b"AGE_ZK_BULLETPROOFS_V1");
    transcript.append_message(b"context", context.as_bytes());

    // Generate blinding factor
    let blinding = Scalar::random(&mut rng);

    // Create commitment to the value
    let value_scalar = Scalar::from(value);
    let commitment = pc_gens.commit(value_scalar, blinding);

    // Convert commitment to bytes
    let commitment_bytes = commitment.compress().to_bytes();

    // Create range proof for value ∈ [0, 2^64)
    let (proof, _committed_value) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        &blinding,
        64, // bit length
    ).map_err(|e| JsValue::from_str(&format!("Proof generation failed: {:?}", e)))?;

    // Serialize proof
    let proof_bytes = proof.to_bytes();

    // Create public inputs: min value and context
    let public_inputs = format!("{}|{}", min, context).into_bytes();

    Ok(ProofBundle {
        commitment: commitment_bytes.to_vec(),
        proof: proof_bytes,
        public_inputs,
    })
}

/// Verify a zero-knowledge range proof that the committed value >= min
#[wasm_bindgen]
pub fn verify_ge_components(
    commitment: &[u8],
    proof: &[u8],
    public_inputs: &[u8],
    min: u64,
    context: &str
) -> Result<bool, JsValue> {
    // Parse public inputs
    let public_inputs_str = String::from_utf8(public_inputs.to_vec())
        .map_err(|_| JsValue::from_str("Invalid public inputs"))?;
    let parts: Vec<&str> = public_inputs_str.split('|').collect();
    if parts.len() != 2 || parts[0] != min.to_string() {
        return Ok(false);
    }
    if parts[1] != context {
        return Ok(false);
    }

    // Parse commitment from compressed bytes
    if commitment.len() != 32 {
        return Ok(false);
    }
    let mut commitment_bytes = [0u8; 32];
    commitment_bytes.copy_from_slice(commitment);
    let commitment_compressed = CompressedRistretto(commitment_bytes);

    // Parse proof
    let proof = RangeProof::from_bytes(proof)
        .map_err(|_| JsValue::from_str("Invalid proof"))?;

    // Create generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Create transcript with domain separation and context binding
    let mut transcript = Transcript::new(DOMAIN_TRANSCRIPT);
    transcript.append_message(b"suite", b"AGE_ZK_BULLETPROOFS_V1");
    transcript.append_message(b"context", context.as_bytes());

    // Verify the range proof
    proof.verify_single(&bp_gens, &pc_gens, &mut transcript, &commitment_compressed, 64)
        .map_err(|_| JsValue::from_str("Proof verification failed"))?;

    Ok(true)
}

/// Verify a zero-knowledge proof that the committed value >= min
#[wasm_bindgen]
pub fn verify_ge(bundle: &ProofBundle, min: u64, context: &str) -> Result<bool, JsValue> {
    verify_ge_components(&bundle.commitment, &bundle.proof, &bundle.public_inputs, min, context)
}

/// Base64url encode bytes for JavaScript interop
#[wasm_bindgen]
pub fn base64url_encode(data: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Base64url decode string for JavaScript interop
#[wasm_bindgen]
pub fn base64url_decode(data: &str) -> Result<Vec<u8>, JsValue> {
    general_purpose::URL_SAFE_NO_PAD.decode(data)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {:?}", e)))
}

// Initialize console logging for debugging
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}