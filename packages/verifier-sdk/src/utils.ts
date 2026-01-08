const encoder = new TextEncoder();

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries
      .map(([key, val]) => `"${key}":${stableStringify(val)}`)
      .join(",");
    return `{${body}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function bytesToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(input: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(input, "base64"));
  }
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlEncode(data: Uint8Array): string {
  return bytesToBase64(data)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return base64ToBytes(normalized + padding);
}

export function toUint8(input: string): Uint8Array {
  return encoder.encode(input);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(iso: string, seconds: number): string {
  const date = new Date(iso);
  date.setSeconds(date.getSeconds() + seconds);
  return date.toISOString();
}

export function ensureFetch(): typeof fetch {
  if (typeof fetch === "undefined") {
    throw new Error("FETCH_NOT_AVAILABLE");
  }
  return fetch;
}
