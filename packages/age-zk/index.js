import init, {
  commit_value as wasmCommitValue,
  prove_ge_bound as wasmProveGeBound,
  prove_le_bound as wasmProveLeBound,
  verify_ge_components_with_entropy as wasmVerifyGe,
  verify_le_components_with_entropy as wasmVerifyLe,
  source_commitment_from_public_inputs as wasmSourceCommitment,
  base64url_encode,
  base64url_decode
} from "./pkg/shielded_age_zk.js";

let initPromise;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
      if (isNode) {
        const { readFile } = await import("node:fs/promises");
        const wasm = await readFile(new URL("./pkg/shielded_age_zk_bg.wasm", import.meta.url));
        await init({ module_or_path: wasm });
      } else {
        await init();
      }
    })();
  }
  await initPromise;
}

function secureRandom32() {
  const bytes = new Uint8Array(32);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("SECURE_RANDOM_UNAVAILABLE");
  }
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function normalizeU64(value, label) {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  if (bigint < 0n || bigint > 0xffffffffffffffffn) {
    throw new RangeError(`${label} must fit unsigned 64-bit range`);
  }
  return bigint;
}

function normalizeBlinding(blinding) {
  if (blinding instanceof Uint8Array) return blinding;
  if (typeof blinding === "string") return base64url_decode(blinding);
  throw new TypeError("blinding must be Uint8Array or base64url string");
}

function bundleToObject(bundle) {
  return {
    commitment: new Uint8Array(bundle.commitment),
    proof: new Uint8Array(bundle.proof),
    public_inputs: new Uint8Array(bundle.public_inputs)
  };
}

export async function create_numeric_commitment(value, blinding = secureRandom32()) {
  await ensureInitialized();
  const secret = normalizeBlinding(blinding);
  const commitment = wasmCommitValue(normalizeU64(value, "value"), secret);
  return {
    commitment: base64url_encode(commitment),
    blinding: base64url_encode(secret)
  };
}

export async function prove_ge_attested(value, min, context, blinding) {
  await ensureInitialized();
  const bundle = wasmProveGeBound(
    normalizeU64(value, "value"),
    normalizeU64(min, "min"),
    context,
    normalizeBlinding(blinding),
    secureRandom32()
  );
  return bundleToObject(bundle);
}

export async function prove_le_attested(value, max, context, blinding) {
  await ensureInitialized();
  const bundle = wasmProveLeBound(
    normalizeU64(value, "value"),
    normalizeU64(max, "max"),
    context,
    normalizeBlinding(blinding),
    secureRandom32()
  );
  return bundleToObject(bundle);
}

// Compatibility helper for locally held attributes. This is cryptographically
// sound but self-attested: production identity/KYC verification must additionally
// validate an issuer signature over the source commitment carried in public inputs.
export async function prove_ge(value, min, context) {
  const { blinding } = await create_numeric_commitment(value);
  return prove_ge_attested(value, min, context, blinding);
}

export async function verify_ge_components(commitment, proof, publicInputs, min, context) {
  await ensureInitialized();
  return wasmVerifyGe(
    commitment,
    proof,
    publicInputs,
    normalizeU64(min, "min"),
    context,
    secureRandom32()
  );
}

export async function verify_le_components(commitment, proof, publicInputs, max, context) {
  await ensureInitialized();
  return wasmVerifyLe(
    commitment,
    proof,
    publicInputs,
    normalizeU64(max, "max"),
    context,
    secureRandom32()
  );
}

export async function source_commitment_from_public_inputs(publicInputs) {
  await ensureInitialized();
  return new Uint8Array(wasmSourceCommitment(publicInputs));
}

export { base64url_encode, base64url_decode };
