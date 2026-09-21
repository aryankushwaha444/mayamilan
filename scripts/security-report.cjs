#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

const projects = [
  { name: "Backend", path: "server" },
  { name: "Frontend", path: "client" },
];

console.log("🔒 Security Audit Report\n");
console.log("=".repeat(60));

let hasVulnerabilities = false;

projects.forEach((project) => {
  const projectDir = path.join(PROJECT_ROOT, project.path);
  
  console.log(`\n📦 ${project.name} (${project.path})`);
  console.log("-".repeat(60));

  try {
    // Run npm audit (--json outputs JSON, exits with code 1 if vulns found)
    const auditOutput = execSync(`cd "${projectDir}" && npm audit --json`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const audit = JSON.parse(auditOutput);
    printAuditSummary(audit);
  } catch (error) {
    // npm audit exits with code 1 when vulnerabilities are found
    // but still outputs valid JSON to stdout
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        printAuditSummary(audit, true);
        hasVulnerabilities = true;
      } catch (parseError) {
        console.log(`\n❌ Error parsing audit output: ${parseError.message}`);
      }
    } else {
      console.log(`\n⚠️  Skipping ${project.name} (directory not found or no package.json)`);
    }
  }
});

console.log("\n" + "=".repeat(60));
console.log("\n💡 Run 'npm run audit:fix' in server/ or client/ to auto-fix");
console.log("💡 Run 'npx snyk test' for comprehensive Snyk analysis\n");

process.exit(hasVulnerabilities ? 1 : 0);

function printAuditSummary(audit, hasIssues = false) {
  const metadata = audit.metadata?.vulnerabilities || {};
  
  console.log(`\n📊 Vulnerability Summary:`);
  console.log(`   Critical: ${metadata.critical || 0}`);
  console.log(`   High:     ${metadata.high || 0}`);
  console.log(`   Moderate: ${metadata.moderate || 0}`);
  console.log(`   Low:      ${metadata.low || 0}`);
  console.log(`   Info:     ${metadata.info || 0}`);

  if (audit.vulnerabilities && Object.keys(audit.vulnerabilities).length > 0) {
    console.log(`\n⚠️  Top Vulnerabilities:`);
    Object.entries(audit.vulnerabilities)
      .slice(0, 5)
      .forEach(([name, vuln]) => {
        console.log(`   • ${name}@${vuln.range} - ${vuln.severity.toUpperCase()}`);
        console.log(`     ${vuln.title}`);
      });
  } else if (!hasIssues) {
    console.log(`\n✅ No known vulnerabilities found!`);
  }
}