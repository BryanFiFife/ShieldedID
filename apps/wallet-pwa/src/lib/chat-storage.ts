import type { Database } from "sql.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (!("CompressionStream" in window)) {
    return data;
  }
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks = [] as Uint8Array[];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  if (!("DecompressionStream" in window)) {
    return data;
  }
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks = [] as Uint8Array[];
  const reader = stream.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function deriveKey(secretBase64: string) {
  const cryptoObj = crypto;
  const raw = base64ToBytes(secretBase64);
  const digest = await cryptoObj.subtle.digest("SHA-256", raw);
  return cryptoObj.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptPayload(secretBase64: string, payload: string) {
  const key = await deriveKey(secretBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(payload);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const merged = new Uint8Array(iv.length + ciphertext.byteLength);
  merged.set(iv, 0);
  merged.set(new Uint8Array(ciphertext), iv.length);
  return merged;
}

async function decryptPayload(secretBase64: string, blob: Uint8Array) {
  const key = await deriveKey(secretBase64);
  const iv = blob.slice(0, 12);
  const data = blob.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return decoder.decode(plaintext);
}

async function loadSqlJs() {
  const module = await import("sql.js");
  return module.default({ locateFile: (file) => `/sql/${file}` });
}

async function readFromOpfs(fileName: string): Promise<Uint8Array | null> {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(fileName, { create: true });
  const file = await handle.getFile();
  if (file.size === 0) return null;
  const arrayBuffer = await file.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function writeToOpfs(fileName: string, data: Uint8Array) {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readFromIdb(key: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("shielded-chat", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("data");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("data", "readonly");
      const getReq = tx.objectStore("data").get(key);
      getReq.onsuccess = () => resolve(getReq.result ?? null);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writeToIdb(key: string, data: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("shielded-chat", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("data");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("data", "readwrite");
      tx.objectStore("data").put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export async function initChatStore(masterSecretBase64: string) {
  const SQL = await loadSqlJs();
  const stored = (await readFromOpfs("chat.db")) ?? (await readFromIdb("chat.db"));
  const db = stored ? new SQL.Database(await decompress(stored)) : new SQL.Database();

  db.run(
    "CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, role TEXT, content BLOB, created_at TEXT)"
  );
  db.run("CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, data BLOB)");

  async function persist() {
    const exported = db.export();
    const compressed = await compress(exported);
    if (navigator.storage?.getDirectory) {
      await writeToOpfs("chat.db", compressed);
    } else {
      await writeToIdb("chat.db", compressed);
    }
  }

  async function addMessage(message: ChatMessage) {
    const encrypted = await encryptPayload(masterSecretBase64, message.content);
    db.run("INSERT INTO messages (id, role, content, created_at) VALUES (?, ?, ?, ?)", [
      message.id,
      message.role,
      encrypted,
      message.createdAt
    ]);
    await persist();
  }

  async function listMessages(): Promise<ChatMessage[]> {
    const result = db.exec("SELECT id, role, content, created_at FROM messages ORDER BY created_at ASC");
    if (result.length === 0) return [];
    const rows = result[0].values as Array<[string, string, Uint8Array, string]>;
    const messages = [] as ChatMessage[];
    for (const row of rows) {
      const content = await decryptPayload(masterSecretBase64, row[2]);
      messages.push({ id: row[0], role: row[1] as ChatMessage["role"], content, createdAt: row[3] });
    }
    return messages;
  }

  async function getProfile(): Promise<Record<string, unknown>> {
    const result = db.exec("SELECT data FROM profile WHERE id = 'primary' LIMIT 1");
    if (result.length === 0) return {};
    const blob = result[0].values[0][0] as Uint8Array;
    const content = await decryptPayload(masterSecretBase64, blob);
    return JSON.parse(content);
  }

  async function setProfile(profile: Record<string, unknown>) {
    const encrypted = await encryptPayload(masterSecretBase64, JSON.stringify(profile));
    db.run("INSERT OR REPLACE INTO profile (id, data) VALUES ('primary', ?)", [encrypted]);
    await persist();
  }

  return { addMessage, listMessages, getProfile, setProfile };
}
