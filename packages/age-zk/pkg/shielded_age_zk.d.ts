/* tslint:disable */
/* eslint-disable */

export class ProofBundle {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly commitment: Uint8Array;
  readonly public_inputs: Uint8Array;
  readonly proof: Uint8Array;
}

export function base64url_decode(value: string): Uint8Array;

export function base64url_encode(bytes: Uint8Array): string;

/**
 * Commit to a numeric value using a caller-supplied 32-byte blinding secret.
 * The blinding secret must be generated with a CSPRNG and kept private.
 */
export function commit_value(value: bigint, blinding: Uint8Array): Uint8Array;

/**
 * Prove that the source commitment opens to a value >= min.
 * The Bulletproof covers delta = value - min. The range-proof commitment is
 * algebraically tied to the source commitment, preventing substitution of an
 * unrelated in-range witness. Raw values never enter public inputs.
 */
export function prove_ge_bound(value: bigint, min: bigint, context: string, blinding: Uint8Array, entropy: Uint8Array): ProofBundle;

/**
 * Prove that the source commitment opens to a value <= max.
 * The proof covers delta = max - value with the negated source blinding, so
 * the verifier can enforce C_delta == max*B - C_source.
 */
export function prove_le_bound(value: bigint, max: bigint, context: string, blinding: Uint8Array, entropy: Uint8Array): ProofBundle;

export function source_commitment_from_public_inputs(public_inputs: Uint8Array): Uint8Array;

export function verify_ge_components_with_entropy(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, min: bigint, context: string, entropy: Uint8Array): boolean;

export function verify_le_components_with_entropy(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, max: bigint, context: string, entropy: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_proofbundle_free: (a: number, b: number) => void;
  readonly base64url_decode: (a: number, b: number) => [number, number, number, number];
  readonly base64url_encode: (a: number, b: number) => [number, number];
  readonly commit_value: (a: bigint, b: number, c: number) => [number, number, number, number];
  readonly proofbundle_commitment: (a: number) => [number, number];
  readonly proofbundle_proof: (a: number) => [number, number];
  readonly proofbundle_public_inputs: (a: number) => [number, number];
  readonly prove_ge_bound: (a: bigint, b: bigint, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly prove_le_bound: (a: bigint, b: bigint, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly source_commitment_from_public_inputs: (a: number, b: number) => [number, number, number, number];
  readonly verify_ge_components_with_entropy: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly verify_le_components_with_entropy: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
