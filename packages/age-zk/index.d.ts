export interface BoundProofBundle {
  commitment: Uint8Array;
  proof: Uint8Array;
  public_inputs: Uint8Array;
}

export interface NumericCommitment {
  commitment: string;
  blinding: string;
}

export function create_numeric_commitment(value: number | bigint, blinding?: Uint8Array | string): Promise<NumericCommitment>;
export function prove_ge_attested(value: number | bigint, min: number | bigint, context: string, blinding: Uint8Array | string): Promise<BoundProofBundle>;
export function prove_le_attested(value: number | bigint, max: number | bigint, context: string, blinding: Uint8Array | string): Promise<BoundProofBundle>;
export function prove_ge(value: number | bigint, min: number | bigint, context: string): Promise<BoundProofBundle>;
export function verify_ge_components(commitment: Uint8Array, proof: Uint8Array, publicInputs: Uint8Array, min: number | bigint, context: string): Promise<boolean>;
export function verify_le_components(commitment: Uint8Array, proof: Uint8Array, publicInputs: Uint8Array, max: number | bigint, context: string): Promise<boolean>;
export function source_commitment_from_public_inputs(publicInputs: Uint8Array): Promise<Uint8Array>;
export function base64url_encode(bytes: Uint8Array): string;
export function base64url_decode(value: string): Uint8Array;
