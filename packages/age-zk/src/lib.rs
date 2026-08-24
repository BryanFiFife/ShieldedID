use base64::{engine::general_purpose, Engine as _};
use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::CompressedRistretto;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use wasm_bindgen::prelude::*;

const DOMAIN_TRANSCRIPT: &[u8] = b"shielded-id-bound-proof-v2";
const SUITE: &[u8] = b"BULLETPROOFS_RISTRETTO_BOUND_V2";
const PUBLIC_INPUT_VERSION: &str = "sid-zk-v2";
const BITS: usize = 64;

#[wasm_bindgen]
#[derive(Clone, Debug)]
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

fn require_32(input: &[u8], label: &str) -> Result<[u8; 32], JsValue> {
    if input.len() != 32 {
        return Err(JsValue::from_str(&format!("{label} must be exactly 32 bytes")));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(input);
    Ok(out)
}

fn scalar_from_blinding(input: &[u8]) -> Result<Scalar, JsValue> {
    Ok(Scalar::from_bytes_mod_order(require_32(input, "blinding")?))
}

fn rng_from_entropy(input: &[u8]) -> Result<ChaCha20Rng, JsValue> {
    Ok(ChaCha20Rng::from_seed(require_32(input, "entropy")?))
}

fn encode_public_inputs(op: &str, bound: u64, source_commitment: &[u8; 32], context: &str) -> Vec<u8> {
    let source = general_purpose::URL_SAFE_NO_PAD.encode(source_commitment);
    format!("{PUBLIC_INPUT_VERSION}|{op}|{bound}|{source}|{context}").into_bytes()
}

struct ParsedPublicInputs {
    op: String,
    bound: u64,
    source_commitment: [u8; 32],
    context: String,
}

fn parse_public_inputs(input: &[u8]) -> Result<ParsedPublicInputs, JsValue> {
    let text = std::str::from_utf8(input).map_err(|_| JsValue::from_str("invalid public inputs utf-8"))?;
    let mut parts = text.splitn(5, '|');
    let version = parts.next().ok_or_else(|| JsValue::from_str("missing public input version"))?;
    let op = parts.next().ok_or_else(|| JsValue::from_str("missing operator"))?;
    let bound = parts
        .next()
        .ok_or_else(|| JsValue::from_str("missing bound"))?
        .parse::<u64>()
        .map_err(|_| JsValue::from_str("invalid bound"))?;
    let source_b64 = parts.next().ok_or_else(|| JsValue::from_str("missing source commitment"))?;
    let context = parts.next().ok_or_else(|| JsValue::from_str("missing context"))?;

    if version != PUBLIC_INPUT_VERSION {
        return Err(JsValue::from_str("unsupported public input version"));
    }

    let source_vec = general_purpose::URL_SAFE_NO_PAD
        .decode(source_b64)
        .map_err(|_| JsValue::from_str("invalid source commitment encoding"))?;
    if source_vec.len() != 32 {
        return Err(JsValue::from_str("invalid source commitment length"));
    }
    let mut source_commitment = [0u8; 32];
    source_commitment.copy_from_slice(&source_vec);

    Ok(ParsedPublicInputs {
        op: op.to_owned(),
        bound,
        source_commitment,
        context: context.to_owned(),
    })
}

fn transcript(op: &[u8], bound: u64, source_commitment: &[u8; 32], context: &str) -> Transcript {
    let mut transcript = Transcript::new(DOMAIN_TRANSCRIPT);
    transcript.append_message(b"suite", SUITE);
    transcript.append_message(b"operator", op);
    transcript.append_u64(b"bound", bound);
    transcript.append_message(b"source-commitment", source_commitment);
    transcript.append_message(b"context", context.as_bytes());
    transcript
}

/// Commit to a numeric value using a caller-supplied 32-byte blinding secret.
/// The blinding secret must be generated with a CSPRNG and kept private.
#[wasm_bindgen]
pub fn commit_value(value: u64, blinding: &[u8]) -> Result<Vec<u8>, JsValue> {
    let blinding = scalar_from_blinding(blinding)?;
    let pc_gens = PedersenGens::default();
    Ok(pc_gens.commit(Scalar::from(value), blinding).compress().to_bytes().to_vec())
}

/// Prove that the source commitment opens to a value >= min.
///
/// The proof is a real Bulletproof range proof over delta = value - min. The
/// proof commitment is algebraically tied to the source commitment so a prover
/// cannot substitute an unrelated in-range value. Neither `value` nor the
/// blinding secret is serialized into public inputs.
#[wasm_bindgen]
pub fn prove_ge_bound(
    value: u64,
    min: u64,
    context: &str,
    blinding: &[u8],
    entropy: &[u8],
) -> Result<ProofBundle, JsValue> {
    let delta = value
        .checked_sub(min)
        .ok_or_else(|| JsValue::from_str("value does not satisfy >= bound"))?;
    let blinding_scalar = scalar_from_blinding(blinding)?;
    let mut rng = rng_from_entropy(entropy)?;

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(BITS, 1);
    let source_commitment = pc_gens
        .commit(Scalar::from(value), blinding_scalar)
        .compress()
        .to_bytes();
    let mut transcript = transcript(b"GE", min, &source_commitment, context);

    let (proof, delta_commitment) = RangeProof::prove_single_with_rng(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        delta,
        &blinding_scalar,
        BITS,
        &mut rng,
    )
    .map_err(|e| JsValue::from_str(&format!("proof generation failed: {e}")))?;

    // Enforce the algebraic binding explicitly during generation as a defence
    // against accidental future changes to the commitment construction.
    let expected = (pc_gens
        .commit(Scalar::from(value), blinding_scalar)
        - pc_gens.B * Scalar::from(min))
        .compress();
    if delta_commitment != expected {
        return Err(JsValue::from_str("internal commitment relation mismatch"));
    }

    Ok(ProofBundle {
        commitment: delta_commitment.to_bytes().to_vec(),
        proof: proof.to_bytes(),
        public_inputs: encode_public_inputs("GE", min, &source_commitment, context),
    })
}

/// Prove that the source commitment opens to a value <= max.
/// The proof is over delta = max - value and uses the negated source blinding,
/// allowing the verifier to check C_delta == max*B - C_source.
#[wasm_bindgen]
pub fn prove_le_bound(
    value: u64,
    max: u64,
    context: &str,
    blinding: &[u8],
    entropy: &[u8],
) -> Result<ProofBundle, JsValue> {
    let delta = max
        .checked_sub(value)
        .ok_or_else(|| JsValue::from_str("value does not satisfy <= bound"))?;
    let source_blinding = scalar_from_blinding(blinding)?;
    let delta_blinding = -source_blinding;
    let mut rng = rng_from_entropy(entropy)?;

    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(BITS, 1);
    let source_commitment = pc_gens
        .commit(Scalar::from(value), source_blinding)
        .compress()
        .to_bytes();
    let mut transcript = transcript(b"LE", max, &source_commitment, context);

    let (proof, delta_commitment) = RangeProof::prove_single_with_rng(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        delta,
        &delta_blinding,
        BITS,
        &mut rng,
    )
    .map_err(|e| JsValue::from_str(&format!("proof generation failed: {e}")))?;

    let expected = (pc_gens.B * Scalar::from(max)
        - pc_gens.commit(Scalar::from(value), source_blinding))
        .compress();
    if delta_commitment != expected {
        return Err(JsValue::from_str("internal commitment relation mismatch"));
    }

    Ok(ProofBundle {
        commitment: delta_commitment.to_bytes().to_vec(),
        proof: proof.to_bytes(),
        public_inputs: encode_public_inputs("LE", max, &source_commitment, context),
    })
}

fn verify_bound(
    expected_op: &str,
    commitment: &[u8],
    proof: &[u8],
    public_inputs: &[u8],
    bound: u64,
    context: &str,
    entropy: &[u8],
) -> Result<bool, JsValue> {
    if commitment.len() != 32 {
        return Ok(false);
    }

    let parsed = match parse_public_inputs(public_inputs) {
        Ok(parsed) => parsed,
        Err(_) => return Ok(false),
    };
    if parsed.op != expected_op || parsed.bound != bound || parsed.context != context {
        return Ok(false);
    }

    let delta_commitment = CompressedRistretto::from_slice(commitment);
    let source_compressed = CompressedRistretto::from_slice(&parsed.source_commitment);
    let source_point = match source_compressed.decompress() {
        Some(point) => point,
        None => return Ok(false),
    };

    let pc_gens = PedersenGens::default();
    let expected_delta = match expected_op {
        "GE" => (source_point - pc_gens.B * Scalar::from(bound)).compress(),
        "LE" => (pc_gens.B * Scalar::from(bound) - source_point).compress(),
        _ => return Ok(false),
    };
    if delta_commitment != expected_delta {
        return Ok(false);
    }

    let proof = match RangeProof::from_bytes(proof) {
        Ok(proof) => proof,
        Err(_) => return Ok(false),
    };
    let bp_gens = BulletproofGens::new(BITS, 1);
    let mut transcript = transcript(
        if expected_op == "GE" { b"GE" } else { b"LE" },
        bound,
        &parsed.source_commitment,
        context,
    );
    let mut rng = rng_from_entropy(entropy)?;

    Ok(proof
        .verify_single_with_rng(
            &bp_gens,
            &pc_gens,
            &mut transcript,
            &delta_commitment,
            BITS,
            &mut rng,
        )
        .is_ok())
}

#[wasm_bindgen]
pub fn verify_ge_components_with_entropy(
    commitment: &[u8],
    proof: &[u8],
    public_inputs: &[u8],
    min: u64,
    context: &str,
    entropy: &[u8],
) -> Result<bool, JsValue> {
    verify_bound("GE", commitment, proof, public_inputs, min, context, entropy)
}

#[wasm_bindgen]
pub fn verify_le_components_with_entropy(
    commitment: &[u8],
    proof: &[u8],
    public_inputs: &[u8],
    max: u64,
    context: &str,
    entropy: &[u8],
) -> Result<bool, JsValue> {
    verify_bound("LE", commitment, proof, public_inputs, max, context, entropy)
}

#[wasm_bindgen]
pub fn source_commitment_from_public_inputs(public_inputs: &[u8]) -> Result<Vec<u8>, JsValue> {
    Ok(parse_public_inputs(public_inputs)?.source_commitment.to_vec())
}

#[wasm_bindgen]
pub fn base64url_encode(bytes: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[wasm_bindgen]
pub fn base64url_decode(value: &str) -> Result<Vec<u8>, JsValue> {
    general_purpose::URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| JsValue::from_str("invalid base64url"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blind() -> [u8; 32] {
        [7u8; 32]
    }

    fn prover_entropy() -> [u8; 32] {
        [11u8; 32]
    }

    fn verifier_entropy() -> [u8; 32] {
        [19u8; 32]
    }

    #[test]
    fn ge_round_trip_is_real_and_private() {
        let bundle = prove_ge_bound(25, 18, "origin|nonce|expiry", &blind(), &prover_entropy()).unwrap();
        let text = String::from_utf8(bundle.public_inputs.clone()).unwrap();
        assert!(!text.contains("|25|"));
        assert!(verify_ge_components_with_entropy(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            18,
            "origin|nonce|expiry",
            &verifier_entropy(),
        ).unwrap());
    }

    #[test]
    fn ge_rejects_under_bound() {
        assert!(prove_ge_bound(17, 18, "ctx", &blind(), &prover_entropy()).is_err());
    }

    #[test]
    fn ge_rejects_wrong_bound_context_and_tampering() {
        let bundle = prove_ge_bound(25, 18, "ctx", &blind(), &prover_entropy()).unwrap();
        assert!(!verify_ge_components_with_entropy(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            21,
            "ctx",
            &verifier_entropy(),
        ).unwrap());
        assert!(!verify_ge_components_with_entropy(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            18,
            "other",
            &verifier_entropy(),
        ).unwrap());

        let mut tampered = bundle.proof.clone();
        tampered[0] ^= 0x01;
        assert!(!verify_ge_components_with_entropy(
            &bundle.commitment,
            &tampered,
            &bundle.public_inputs,
            18,
            "ctx",
            &verifier_entropy(),
        ).unwrap());
    }

    #[test]
    fn le_round_trip_and_relation_tamper_rejection() {
        let bundle = prove_le_bound(100, 120, "ctx", &blind(), &prover_entropy()).unwrap();
        assert!(verify_le_components_with_entropy(
            &bundle.commitment,
            &bundle.proof,
            &bundle.public_inputs,
            120,
            "ctx",
            &verifier_entropy(),
        ).unwrap());

        let other_blind = [8u8; 32];
        let other_source = commit_value(100, &other_blind).unwrap();
        let mut text = String::from_utf8(bundle.public_inputs.clone()).unwrap();
        let original = general_purpose::URL_SAFE_NO_PAD.encode(commit_value(100, &blind()).unwrap());
        let replacement = general_purpose::URL_SAFE_NO_PAD.encode(other_source);
        text = text.replace(&original, &replacement);
        assert!(!verify_le_components_with_entropy(
            &bundle.commitment,
            &bundle.proof,
            text.as_bytes(),
            120,
            "ctx",
            &verifier_entropy(),
        ).unwrap());
    }
}
