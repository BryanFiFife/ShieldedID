const fs = require("fs");

const checks = [
  ["RFC Spec", "docs/spec/protocol-rfc.md", 3000],
  ["OAuth2 Profile", "docs/spec/oauth2-profile.md", 400],
  ["ABNF Grammar", "docs/spec/formats.abnf", 200],
  ["PostgreSQL Migration", "apps/registry-server/migrations/001_initial_schema.ts", 250],
  ["Metrics", "apps/registry-server/src/observability/metrics.ts", 250],
  ["Dashboard", "apps/registry-server/src/admin/Dashboard.tsx", 300],
  ["Errors", "packages/verifier-sdk/src/errors.ts", 300],
  ["Security", "apps/registry-server/src/middleware/security.ts", 100],
  ["Compliance", "COMPLIANCE.md", 50],
  ["Attester", "packages/attester-sdk/src/attester.ts", 350],
  ["Continuous Auth", "packages/verifier-sdk/src/continuous-auth.ts", 350],
  ["Offline Mode", "packages/verifier-sdk/src/offline-mode.ts", 300],
  ["E2E Tests", "apps/integration-tests/e2e-flows.test.ts", 500],
  ["Chaos Tests", "apps/registry-server/tests/chaos.test.ts", 400]
];

console.log("\n✅ IMPLEMENTATION VALIDATION\n");

let passed = 0;
checks.forEach(([name, file, minLines]) => {
  const exists = fs.existsSync(file);
  if (exists) {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n").length;
    const ok = lines >= minLines;
    console.log(`${ok ? "✅" : "⚠️"} ${name.padEnd(20)} ${lines.toString().padStart(4)} lines (need ${minLines})`);
    if (ok) passed++;
  } else {
    console.log(`❌ ${name.padEnd(20)} NOT FOUND`);
  }
});

console.log(`\n${passed}/${checks.length} files OK\n`);
