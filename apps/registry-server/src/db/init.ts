import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

let dbInstance: Db | null = null;

function resolveDatabasePath(input: string | undefined): string {
  if (!input || input.trim() === "") {
    return path.join(process.cwd(), "data", "registry.db");
  }
  if (input.startsWith("file:")) {
    return input.slice("file:".length);
  }
  return input;
}

export function initDb(databaseUrl?: string): Db {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = resolveDatabasePath(databaseUrl);
  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);

  dbInstance = db;
  seedAdmin(db);
  return db;
}

export function getDb(): Db {
  if (!dbInstance) {
    throw new Error("Database not initialized");
  }
  return dbInstance;
}

function seedAdmin(db: Db) {
  const exists = db
    .prepare("SELECT 1 FROM admins WHERE email = ? LIMIT 1")
    .get("admin@example.com");
  if (exists) {
    return;
  }
  const now = new Date().toISOString();
  // Password: SecurePass123!@#
  const passwordHash = "$2a$10$0AtbwTqsvBM1LLyhC.HnbuqnsB1Mx.VAHmEPhwwswKklWFFFjxBIy";
  db.prepare(
    "INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(
    randomUUID(),
    "admin@example.com",
    passwordHash,
    now
  );
}
