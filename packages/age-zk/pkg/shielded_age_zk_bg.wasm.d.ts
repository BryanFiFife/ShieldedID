/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_proofbundle_free: (a: number, b: number) => void;
export const main: () => void;
export const proofbundle_commitment: (a: number) => [number, number];
export const proofbundle_proof: (a: number) => [number, number];
export const proofbundle_public_inputs: (a: number) => [number, number];
export const prove_age_range: (a: bigint, b: bigint, c: bigint, d: number, e: number) => [number, number, number];
export const prove_birth_year: (a: bigint, b: bigint, c: number, d: number) => [number, number, number];
export const prove_ge: (a: bigint, b: bigint, c: number, d: number) => [number, number, number];
export const prove_membership_in_list: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const prove_not_in_list: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const prove_string_equality: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const prove_string_prefix: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
export const verify_age_range_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: bigint, i: number, j: number) => [number, number, number];
export const verify_ge: (a: number, b: bigint, c: number, d: number) => [number, number, number];
export const verify_ge_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint, h: number, i: number) => [number, number, number];
export const verify_membership_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
export const verify_string_equality_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
export const verify_string_prefix_components: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
