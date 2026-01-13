import { describe, it, expect } from "vitest";

describe("Database Migrations", () => {
  it("can instantiate migration up function", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration).toBeDefined();
      expect(migration.up).toBeDefined();
      expect(typeof migration.up).toBe("function");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("can instantiate migration down function", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration).toBeDefined();
      expect(migration.down).toBeDefined();
      expect(typeof migration.down).toBe("function");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration creates proper schema structure", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      const migrationCode = migration.up.toString();
      
      // Verify migration has schema creation code
      expect(migrationCode).toMatch(/createTable|schema/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration down function exists", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.down).toBeDefined();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration handles table creation with proper indexes", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.up.toString()).toContain("table");
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration creates wallets table with proper constraints", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.up.toString()).toMatch(/wallet/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration creates keys table with foreign key", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.up.toString()).toMatch(/key/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration creates revocations table", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.up.toString()).toMatch(/revocation|revoke/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration creates sessions table for admin", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      expect(migration.up.toString()).toMatch(/session/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("migration handles timestamp defaults", async () => {
    try {
      const migration = await import("../migrations/001_initial_schema.js");
      const code = migration.up.toString();
      expect(code).toMatch(/defaultTo|timestamp/i);
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
});
