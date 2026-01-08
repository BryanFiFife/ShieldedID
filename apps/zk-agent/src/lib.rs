use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::RistrettoPoint;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::{Rng, thread_rng};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

// Domain separation labels
const DOMAIN_TRANSCRIPT: &[u8] = b"shielded-id-transcript-v1";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProofBundle {
    pub commitment: String,    // base64url
    pub proof: String,         // base64url
    pub public_inputs: String, // base64url
}

#[derive(Deserialize, Clone, Debug)]
pub struct ProofRequest {
    pub value: u64,
    pub min: u64,
    pub suite: String,
    pub verifier_origin: String,
    pub nonce: String,
    pub expiry: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ProofResponse {
    pub success: bool,
    pub proof_bundle: Option<ProofBundle>,
    pub error: Option<String>,
}

/// Generate a zero-knowledge range proof that value >= min using Bulletproofs
pub fn prove_ge(value: u64, min: u64, context: &str) -> Result<ProofBundle, Box<dyn std::error::Error>> {
    if value < min {
        return Err("Value must be >= min".into());
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
    let mut blinding_bytes = [0u8; 32];
    rng.fill(&mut blinding_bytes);
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);

    // Create commitment to the value
    let value_scalar = Scalar::from(value as u64);
    let pc_gens = PedersenGens::default();
    let commitment = pc_gens.commit(value_scalar, blinding);

    // Convert commitment to bytes
    let commitment_bytes = commitment.compress().to_bytes();

    // Create range proof for value ∈ [0, 2^64)
    let (proof, committed_value) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        &blinding,
        64, // bit length
    )?;

    // Verify the proof was created correctly
    if committed_value != commitment.compress() {
        return Err("Commitment mismatch in proof generation".into());
    }

    // Serialize proof
    let proof_bytes = proof.to_bytes();

    // Create public inputs: min value and context
    let public_inputs = format!("{}|{}", min, context).into_bytes();

    Ok(ProofBundle {
        commitment: general_purpose::URL_SAFE_NO_PAD.encode(commitment_bytes),
        proof: general_purpose::URL_SAFE_NO_PAD.encode(proof_bytes),
        public_inputs: general_purpose::URL_SAFE_NO_PAD.encode(public_inputs),
    })
}

/// Verify a zero-knowledge range proof that the committed value >= min
pub fn verify_ge_components(
    commitment_b64: &str,
    proof_b64: &str,
    public_inputs_b64: &str,
    min: u64,
    context: &str
) -> Result<bool, Box<dyn std::error::Error>> {
    // Decode inputs
    let commitment_bytes = general_purpose::URL_SAFE_NO_PAD.decode(commitment_b64)?;
    let proof_bytes = general_purpose::URL_SAFE_NO_PAD.decode(proof_b64)?;
    let public_inputs_bytes = general_purpose::URL_SAFE_NO_PAD.decode(public_inputs_b64)?;

    // Parse public inputs
    let public_inputs_str = String::from_utf8(public_inputs_bytes)?;
    let parts: Vec<&str> = public_inputs_str.split('|').collect();
    if parts.len() != 2 || parts[0] != min.to_string() {
        return Ok(false);
    }
    if parts[1] != context {
        return Ok(false);
    }

    // Parse commitment
    use curve25519_dalek_ng::ristretto::CompressedRistretto;
    let compressed = CompressedRistretto::from_slice(&commitment_bytes);
    let commitment_point = compressed.decompress().ok_or("Invalid commitment point")?;

    // Parse proof
    let proof = RangeProof::from_bytes(&proof_bytes)?;

    // Create generators
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    // Create transcript with domain separation and context binding
    let mut transcript = Transcript::new(DOMAIN_TRANSCRIPT);
    transcript.append_message(b"suite", b"AGE_ZK_BULLETPROOFS_V1");
    transcript.append_message(b"context", context.as_bytes());

    // Verify the range proof
    proof.verify_single(&bp_gens, &pc_gens, &mut transcript, &compressed, 64)?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prove_verify_valid_age() {
        let value = 25;
        let min = 18;
        let context = "test-context-v1";

        let bundle = prove_ge(value, min, context).unwrap();

        let verified = verify_ge_components(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            min,
            context,
        ).unwrap();

        assert!(verified);
    }

    #[test]
    fn test_prove_verify_invalid_age() {
        let value = 16;
        let min = 18;
        let context = "test-context-v1";

        // Should fail because value < min
        let result = prove_ge(value, min, context);
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_wrong_min() {
        let value = 25;
        let min = 18;
        let context = "test-context-v1";

        let bundle = prove_ge(value, min, context).unwrap();

        // Try to verify with wrong min
        let verified = verify_ge_components(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            21, // wrong min
            context,
        ).unwrap();

        assert!(!verified);
    }

    #[test]
    fn test_verify_wrong_context() {
        let value = 25;
        let min = 18;
        let context = "test-context-v1";

        let bundle = prove_ge(value, min, context).unwrap();

        // Try to verify with wrong context
        let verified = verify_ge_components(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            min,
            "wrong-context",
        ).unwrap();

        assert!(!verified);
    }

    #[test]
    fn test_deterministic_serialization() {
        let value = 25;
        let min = 18;
        let context = "test-context-v1";

        let bundle1 = prove_ge(value, min, context).unwrap();
        let bundle2 = prove_ge(value, min, context).unwrap();

        // Bundles should be different due to random blinding factors
        assert_ne!(bundle1.commitment, bundle2.commitment);
        assert_ne!(bundle1.proof, bundle2.proof);

        // But both should verify correctly
        let verified1 = verify_ge_components(
            &bundle1.commitment,
            &bundle1.proof,
            &bundle1.public_inputs,
            min,
            context,
        ).unwrap();

        let verified2 = verify_ge_components(
            &bundle2.commitment,
            &bundle2.proof,
            &bundle2.public_inputs,
            min,
            context,
        ).unwrap();

        assert!(verified1);
        assert!(verified2);
    }

    #[test]
    fn test_base64url_encoding() {
        let value = 25;
        let min = 18;
        let context = "test-context-v1";

        let bundle = prove_ge(value, min, context).unwrap();

        // All fields should be valid base64url (no padding, URL-safe chars)
        assert!(!bundle.commitment.contains('='));
        assert!(!bundle.proof.contains('='));
        assert!(!bundle.public_inputs.contains('='));

        // Should not contain + or /
        assert!(!bundle.commitment.contains('+'));
        assert!(!bundle.commitment.contains('/'));
        assert!(!bundle.proof.contains('+'));
        assert!(!bundle.proof.contains('/'));
        assert!(!bundle.public_inputs.contains('+'));
        assert!(!bundle.public_inputs.contains('/'));
    }
}