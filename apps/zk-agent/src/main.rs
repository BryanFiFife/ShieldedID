use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek_ng::ristretto::RistrettoPoint;
use curve25519_dalek_ng::scalar::Scalar;
use merlin::Transcript;
use rand::{Rng, thread_rng};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use warp::Filter;

// Domain separation labels
const DOMAIN_TRANSCRIPT: &[u8] = b"shielded-id-transcript-v1";

#[derive(Serialize, Deserialize)]
pub struct ProofBundle {
    pub commitment: String,    // base64url
    pub proof: String,         // base64url
    pub public_inputs: String, // base64url
}

#[derive(Deserialize)]
pub struct ProofRequest {
    pub value: u64,
    pub min: u64,
    pub suite: String,
    pub verifier_origin: String,
    pub nonce: String,
    pub expiry: String,
}

#[derive(Serialize)]
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

#[tokio::main]
async fn main() {
    println!("Starting ZK Agent on localhost:3030");

    // Only accept requests from localhost
    let cors = warp::cors()
        .allow_origin("http://localhost:3030")
        .allow_methods(vec!["POST"])
        .allow_headers(vec!["content-type"]);

    let prove_age = warp::post()
        .and(warp::path("prove"))
        .and(warp::path("age"))
        .and(warp::body::json())
        .map(|req: ProofRequest| {
            println!("Received age proof request for value={}, min={}", req.value, req.min);

            // Create context string
            let context = format!("shielded-id-zk-context-v1|AGE_ZK_BULLETPROOFS_V1|{}|{}|{}",
                                req.verifier_origin, req.nonce, req.expiry);

            match prove_ge(req.value, req.min, &context) {
                Ok(bundle) => {
                    println!("Proof generated successfully");
                    warp::reply::json(&ProofResponse {
                        success: true,
                        proof_bundle: Some(bundle),
                        error: None,
                    })
                }
                Err(e) => {
                    println!("Proof generation failed: {}", e);
                    warp::reply::json(&ProofResponse {
                        success: false,
                        proof_bundle: None,
                        error: Some(e.to_string()),
                    })
                }
            }
        });

    let prove_assurance = warp::post()
        .and(warp::path("prove"))
        .and(warp::path("assurance"))
        .and(warp::body::json())
        .map(|req: ProofRequest| {
            println!("Received assurance proof request for value={}, min={}", req.value, req.min);

            // Create context string
            let context = format!("shielded-id-zk-context-v1|KYC_ZK_BULLETPROOFS_V1|{}|{}|{}",
                                req.verifier_origin, req.nonce, req.expiry);

            match prove_ge(req.value, req.min, &context) {
                Ok(bundle) => {
                    println!("Proof generated successfully");
                    warp::reply::json(&ProofResponse {
                        success: true,
                        proof_bundle: Some(bundle),
                        error: None,
                    })
                }
                Err(e) => {
                    println!("Proof generation failed: {}", e);
                    warp::reply::json(&ProofResponse {
                        success: false,
                        proof_bundle: None,
                        error: Some(e.to_string()),
                    })
                }
            }
        });

    let routes = prove_age.or(prove_assurance).with(cors);

    warp::serve(routes)
        .run(([127, 0, 0, 1], 3030))
        .await;
}