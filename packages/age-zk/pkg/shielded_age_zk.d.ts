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

/**
 * Initialize WASM panic handling
 */
export function main(): void;

/**
 * Prove age is within range: min_age <= age <= max_age
 */
export function prove_age_range(age: bigint, min_age: bigint, max_age: bigint, context: string): ProofBundle;

/**
 * Prove birth year >= min_year
 */
export function prove_birth_year(birth_year: bigint, min_year: bigint, context: string): ProofBundle;

/**
 * Generate a zero-knowledge range proof that value >= min using Bulletproofs
 */
export function prove_ge(value: bigint, min: bigint, context: string): ProofBundle;

/**
 * Prove membership in list (EU resident, endorsed, etc)
 */
export function prove_membership_in_list(value: string, list: string, context: string): ProofBundle;

/**
 * Prove NOT membership in list (no restrictions, etc)
 */
export function prove_not_in_list(value: string, forbidden_list: string, context: string): ProofBundle;

/**
 * Prove string equality (country, state, doc_type, etc)
 */
export function prove_string_equality(value: string, expected: string, context: string): ProofBundle;

/**
 * Prove string prefix match (postal code prefix, region, etc)
 */
export function prove_string_prefix(full_string: string, prefix: string, context: string): ProofBundle;

export function verify_age_range_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, min_age: bigint, max_age: bigint, context: string): boolean;

/**
 * Verify a proof bundle 
 */
export function verify_ge(bundle: ProofBundle, min: bigint, context: string): boolean;

/**
 * Verify a zero-knowledge proof that the committed value >= min
 */
export function verify_ge_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, min: bigint, context: string): boolean;

export function verify_membership_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, value: string, list: string, context: string): boolean;

export function verify_string_equality_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, expected_value: string, context: string): boolean;

export function verify_string_prefix_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, full_string: string, prefix: string, context: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_proofbundle_free: (a: number, b: number) => void;
  readonly main: () => void;
  readonly proofbundle_commitment: (a: number) => [number, number];
  readonly proofbundle_proof: (a: number) => [number, number];
  readonly proofbundle_public_inputs: (a: number) => [number, number];
  readonly prove_age_range: (a: bigint, b: bigint, c: bigint, d: number, e: number) => [number, number, number];
  readonly prove_birth_year: (a: bigint, b: bigint, c: number, d: number) => [number, number, number];
  readonly prove_ge: (a: bigint, b: bigint, c: number, d: number) => [number, number, number];
  readonly prove_membership_in_list: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly prove_not_in_list: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly prove_string_equality: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly prove_string_prefix: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly verify_age_range_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: bigint, i: number, j: number) => [number, number, number];
  readonly verify_ge: (a: number, b: bigint, c: number, d: number) => [number, number, number];
  readonly verify_ge_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => [number, number, number];
  readonly verify_membership_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
  readonly verify_string_equality_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
  readonly verify_string_prefix_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
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
