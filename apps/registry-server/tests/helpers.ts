import { buildApp } from "../src/app.js";
import { getDb, initDb } from "../src/db/init.js";

export async function setupTestApp() {
  process.env.DATABASE_URL = ":memory:";
  initDb(process.env.DATABASE_URL);
  const app = await buildApp();
  return app;
}

export function resetDatabase() {
  const db = getDb();
  db.exec("DELETE FROM audit_events; DELETE FROM backups; DELETE FROM revocations; DELETE FROM wallet_keys; DELETE FROM wallets;");
}
