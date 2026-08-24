use base64::{engine::general_purpose, Engine as _};
use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek::ristretto::CompressedRistretto;
use curve25519_dalek::scalar::Scalar;
use merlin::Transcript;
use rand::{thread_rng, Rng};
use serde::{Deserialize, Serialize};

const DOMAIN_TRANSCRIPT: &[u8] = b"shielded-id-bound-proof-v2";
const SUITE: &[u8] = b"BULLETPROOFS_RISTRETTO_BOUND_V2";
const PUBLIC_INPUT_VERSION: &str = "sid-zk-v2";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProofBundle {
    pub commitment: String,
    pub proof: String,
    pub public_inputs: String,
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

fn transcript(min: u64, source_commitment: &[u8; 32], context: &str) -> Transcript {
    let mut transcript = Transcript::new(DOMAIN_TRANSCRIPT);
    transcript.append_message(b"suite", SUITE);
    transcript.append_message(b"operator", b"GE");
    transcript.append_u64(b"bound", min);
    transcript.append_message(b"source-commitment", source_commitment);
    transcript.append_message(b"context", context.as_bytes());
    transcript
}

pub fn prove_ge(value: u64, min: u64, context: &str) -> Result<ProofBundle, Box<dyn std::error::Error>> {
    let delta = value.checked_sub(min).ok_or("value does not satisfy >= bound")?;
    let mut rng = thread_rng();
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    let mut blinding_bytes = [0u8; 32];
    rng.fill(&mut blinding_bytes);
    let blinding = Scalar::from_bytes_mod_order(blinding_bytes);
    let source_commitment = pc_gens.commit(Scalar::from(value), blinding).compress().to_bytes();
    let mut proof_transcript = transcript(min, &source_commitment, context);

    let (proof, delta_commitment) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut proof_transcript,
        delta,
        &blinding,
        64,
    )?;

    let expected = (pc_gens.commit(Scalar::from(value), blinding)
        - pc_gens.B * Scalar::from(min)).compress();
    if delta_commitment != expected {
        return Err("internal commitment relation mismatch".into());
    }

    let source_b64 = general_purpose::URL_SAFE_NO_PAD.encode(source_commitment);
    let public_inputs = format!("{PUBLIC_INPUT_VERSION}|GE|{min}|{source_b64}|{context}");

    Ok(ProofBundle {
        commitment: general_purpose::URL_SAFE_NO_PAD.encode(delta_commitment.to_bytes()),
        proof: general_purpose::URL_SAFE_NO_PAD.encode(proof.to_bytes()),
        public_inputs: general_purpose::URL_SAFE_NO_PAD.encode(public_inputs.as_bytes()),
    })
}

pub fn verify_ge_components(
    commitment_b64: &str,
    proof_b64: &str,
    public_inputs_b64: &str,
    min: u64,
    context: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let commitment_bytes = general_purpose::URL_SAFE_NO_PAD.decode(commitment_b64)?;
    let proof_bytes = general_purpose::URL_SAFE_NO_PAD.decode(proof_b64)?;
    let public_inputs_bytes = general_purpose::URL_SAFE_NO_PAD.decode(public_inputs_b64)?;
    if commitment_bytes.len() != 32 {
        return Ok(false);
    }

    let public_inputs_str = String::from_utf8(public_inputs_bytes)?;
    let mut parts = public_inputs_str.splitn(5, '|');
    if parts.next() != Some(PUBLIC_INPUT_VERSION) || parts.next() != Some("GE") {
        return Ok(false);
    }
    let encoded_bound = match parts.next() {
        Some(value) => value,
        None => return Ok(false),
    };
    if encoded_bound.parse::<u64>().ok() != Some(min) {
        return Ok(false);
    }
    let source_b64 = parts.next().ok_or("missing source commitment")?;
    let bound_context = parts.next().ok_or("missing context")?;
    if bound_context != context {
        return Ok(false);
    }

    let source_bytes = general_purpose::URL_SAFE_NO_PAD.decode(source_b64)?;
    if source_bytes.len() != 32 {
        return Ok(false);
    }
    let source_compressed = match CompressedRistretto::from_slice(&source_bytes) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };
    let source_point = match source_compressed.decompress() {
        Some(point) => point,
        None => return Ok(false),
    };
    let delta_compressed = match CompressedRistretto::from_slice(&commitment_bytes) {
        Ok(value) => value,
        Err(_) => return Ok(false),
    };

    let pc_gens = PedersenGens::default();
    let expected_delta = (source_point - pc_gens.B * Scalar::from(min)).compress();
    if delta_compressed != expected_delta {
        return Ok(false);
    }

    let proof = match RangeProof::from_bytes(&proof_bytes) {
        Ok(proof) => proof,
        Err(_) => return Ok(false),
    };
    let bp_gens = BulletproofGens::new(64, 1);
    let mut verify_transcript = transcript(min, &source_compressed.to_bytes(), context);

    Ok(proof.verify_single(
        &bp_gens,
        &pc_gens,
        &mut verify_transcript,
        &delta_compressed,
        64,
    ).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_bound_proof_verifies_without_witness_disclosure() {
        let bundle = prove_ge(25, 18, "test-context-v2").unwrap();
        let public = String::from_utf8(general_purpose::URL_SAFE_NO_PAD.decode(&bundle.public_inputs).unwrap()).unwrap();
        assert!(!public.contains("|25|"));
        assert!(verify_ge_components(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            18,
            "test-context-v2",
        ).unwrap());
    }

    #[test]
    fn under_bound_generation_fails() {
        assert!(prove_ge(17, 18, "ctx").is_err());
    }

    #[test]
    fn wrong_bound_or_context_fails() {
        let bundle = prove_ge(25, 18, "ctx").unwrap();
        assert!(!verify_ge_components(&bundle.commitment, &bundle.proof, &bundle.public_inputs, 21, "ctx").unwrap());
        assert!(!verify_ge_components(&bundle.commitment, &bundle.proof, &bundle.public_inputs, 18, "wrong").unwrap());
    }

    #[test]
    fn proofs_are_randomized() {
        let a = prove_ge(25, 18, "ctx").unwrap();
        let b = prove_ge(25, 18, "ctx").unwrap();
        assert_ne!(a.commitment, b.commitment);
        assert_ne!(a.proof, b.proof);
    }
}
