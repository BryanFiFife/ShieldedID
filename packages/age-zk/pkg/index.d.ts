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
 * Base64url decode string for JavaScript interop
 */
export function base64url_decode(data: string): Uint8Array;

/**
 * Base64url encode bytes for JavaScript interop
 */
export function base64url_encode(data: Uint8Array): string;

export function main(): void;

/**
 * Generate a zero-knowledge range proof that value >= min using Bulletproofs
 */
export function prove_ge(value: bigint, min: bigint, context: string): ProofBundle;

/**
 * Verify a zero-knowledge proof that the committed value >= min
 */
export function verify_ge(bundle: ProofBundle, min: bigint, context: string): boolean;

/**
 * Verify a zero-knowledge range proof that the committed value >= min
 */
export function verify_ge_components(commitment: Uint8Array, proof: Uint8Array, public_inputs: Uint8Array, min: bigint, context: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_proofbundle_free: (a: number, b: number) => void;
  readonly base64url_decode: (a: number, b: number) => [number, number, number, number];
  readonly base64url_encode: (a: number, b: number) => [number, number];
  readonly main: () => void;
  readonly proofbundle_commitment: (a: number) => [number, number];
  readonly proofbundle_proof: (a: number) => [number, number];
  readonly proofbundle_public_inputs: (a: number) => [number, number];
  readonly prove_ge: (a: bigint, b: bigint, c: number, d: number) => [number, number, number];
  readonly verify_ge: (a: number, b: bigint, c: number, d: number) => [number, number, number];
  readonly verify_ge_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => [number, number, number];
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
