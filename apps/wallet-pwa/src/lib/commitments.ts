const encoder = new TextEncoder();

function getCrypto(): Crypto {
  const cryptoObj = globalThis.crypto ?? (globalThis as { webcrypto?: Crypto }).webcrypto;
  if (!cryptoObj) {
    throw new Error("WEBCRYPTO_NOT_AVAILABLE");
  }
  return cryptoObj;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MerkleNode {
  hash: string;
  left?: string;
  right?: string;
}

export function createAttribute(type: string, value: string) {
  const salt = new Uint8Array(16);
  getCrypto().getRandomValues(salt);
  return {
    id: getCrypto().randomUUID(),
    type,
    normalizedValue: value.trim(),
    salt
  };
}

export async function commitAttribute(value: string, salt: Uint8Array): Promise<string> {
  const data = encoder.encode(`${value}:${toHex(salt)}`);
  const digest = await getCrypto().subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

async function hashPair(left: string, right: string): Promise<string> {
  const data = encoder.encode(`${left}:${right}`);
  const digest = await getCrypto().subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export async function buildMerkleTree(commitments: string[]): Promise<{ root: string; tree: MerkleNode[] }> {
  if (commitments.length === 0) {
    return { root: "", tree: [] };
  }
  let level = commitments.slice();
  const nodes: MerkleNode[] = commitments.map((hash) => ({ hash }));

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i];
      const parentHash = await hashPair(left, right);
      nodes.push({ hash: parentHash, left, right });
      nextLevel.push(parentHash);
    }
    level = nextLevel;
  }

  return { root: level[0], tree: nodes };
}

export async function verifyMerkleProof(
  value: string,
  salt: Uint8Array,
  root: string,
  proof: string[]
): Promise<boolean> {
  let hash = await commitAttribute(value, salt);
  for (const entry of proof) {
    const [direction, sibling] = entry.split(":");
    if (!sibling) return false;
    if (direction === "L") {
      hash = await hashPair(sibling, hash);
    } else {
      hash = await hashPair(hash, sibling);
    }
  }
  return hash === root;
}
