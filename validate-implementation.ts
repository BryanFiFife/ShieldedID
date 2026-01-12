#!/usr/bin/env node

/**
 * Shielded ID Implementation Validation
 * Checks that all new implementations are properly structured
 */

const fs = require("fs");
const path = require("path");

const __dirname = path.dirname(path.resolve(__filename));

interface ValidationResult {
  name: string;
  path: string;
  exists: boolean;
  lines: number;
  status: "✅" | "⚠️" | "❌";
  message: string;
}

const results: ValidationResult[] = [];

function checkFile(
  name: string,
  filePath: string,
  minLines: number = 50
): ValidationResult {
  const fullPath = path.join(__dirname, filePath);
  const exists = fs.existsSync(fullPath);

  let result: ValidationResult = {
    name,
    path: filePath,
    exists,
    lines: 0,
    status: "❌",
    message: "File not found"
  };

  if (exists) {
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n").length;
    result.lines = lines;

    if (lines >= minLines) {
      result.status = "✅";
      result.message = `${lines} lines (expected ≥${minLines})`;
    } else {
      result.status = "⚠️";
      result.message = `${lines} lines (expected ≥${minLines})`;
    }
  }

  results.push(result);
  return result;
}

console.log("\n🔍 Shielded ID Implementation Validation\n");

// Phase A: Protocol Specification
console.log("📋 PHASE A: Protocol Standardization");
checkFile(
  "RFC Protocol Spec",
  "docs/spec/protocol-rfc.md",
  3000
);
checkFile(
  "OAuth 2.0 Profile",
  "docs/spec/oauth2-profile.md",
  400
);
checkFile(
  "ABNF Grammars",
  "docs/spec/formats.abnf",
  200
);

// Phase B: Implementation
console.log("\n💾 PHASE B: Implementation Modernization");
checkFile(
  "PostgreSQL Migration",
  "apps/registry-server/migrations/001_initial_schema.ts",
  250
);
checkFile(
  "Prometheus Metrics",
  "apps/registry-server/src/observability/metrics.ts",
  250
);
checkFile(
  "Admin Dashboard",
  "apps/registry-server/src/admin/Dashboard.tsx",
  300
);
checkFile(
  "Error Codes",
  "packages/verifier-sdk/src/errors.ts",
  300
);

// Phase C: Security
console.log("\n🔒 PHASE C: Security & Compliance");
checkFile(
  "Security Middleware",
  "apps/registry-server/src/middleware/security.ts",
  100
);
checkFile(
  "OWASP & ISO 27001 Compliance",
  "COMPLIANCE.md",
  50
);

// Phase D: Ecosystem
console.log("\n🌍 PHASE D: Ecosystem Expansion");
checkFile(
  "Attester SDK",
  "packages/attester-sdk/src/attester.ts",
  350
);
checkFile(
  "Continuous Auth",
  "packages/verifier-sdk/src/continuous-auth.ts",
  350
);
checkFile(
  "Offline Mode",
  "packages/verifier-sdk/src/offline-mode.ts",
  300
);

// Phase E: Testing
console.log("\n🧪 PHASE E: Testing & Validation");
checkFile(
  "E2E Tests",
  "apps/integration-tests/e2e-flows.test.ts",
  500
);
checkFile(
  "Chaos Tests",
  "apps/registry-server/tests/chaos.test.ts",
  400
);

// Configuration
console.log("\n⚙️  CONFIGURATION");
checkFile(
  "Knexfile",
  "knexfile.ts",
  40
);
checkFile(
  ".env.example",
  ".env.example",
  20
);

// Package.json files
console.log("\n📦 PACKAGE CONFIGURATION");
checkFile(
  "Registry Server package.json",
  "apps/registry-server/package.json",
  30
);
checkFile(
  "Verifier SDK package.json",
  "packages/verifier-sdk/package.json",
  30
);
checkFile(
  "Attester SDK package.json",
  "packages/attester-sdk/package.json",
  30
);
checkFile(
  "Integration Tests package.json",
  "apps/integration-tests/package.json",
  15
);

// Print Results
console.log("\n" + "=".repeat(70));
console.log("📊 VALIDATION RESULTS");
console.log("=".repeat(70) + "\n");

const grouped = {
  "✅": results.filter((r) => r.status === "✅"),
  "⚠️": results.filter((r) => r.status === "⚠️"),
  "❌": results.filter((r) => r.status === "❌")
};

for (const [status, items] of Object.entries(grouped)) {
  if (items.length > 0) {
    console.log(`${status} ${status === "✅" ? "PASSED" : status === "⚠️" ? "WARNING" : "FAILED"} (${items.length}/${results.length})`);
    for (const result of items) {
      console.log(
        `   ${result.status} ${result.name.padEnd(30)} ${result.message}`
      );
    }
    console.log();
  }
}

// Summary
const passed = grouped["✅"].length;
const total = results.length;
const percentage = Math.round((passed / total) * 100);

console.log("=".repeat(70));
console.log(`✨ Overall: ${passed}/${total} checks passed (${percentage}%)`);
console.log("=".repeat(70));

process.exit(passed === total ? 0 : 1);
