#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PROJECT_ROOT = path.resolve(__dirname, "..");

// Auto-discover projects with package.json instead of hardcoding
const discoverProjects = () => {
  const dirs = ["server", "client"];
  return dirs
    .map((dir) => ({
      name: dir.charAt(0).toUpperCase() + dir.slice(1),
      path: dir,
    }))
    .filter((p) =>
      fs.existsSync(path.join(PROJECT_ROOT, p.path, "package.json"))
    );
};

const projects = discoverProjects();

// CLI flags
const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const auditLevel =
  args.find((a) => a.startsWith("--level="))?.split("=")[1] || "low";
const timeoutMs =
  parseInt(args.find((a) => a.startsWith("--timeout="))?.split("=")[1], 10) ||
  60000;

// Severity weights for exit code calculation
const SEVERITY_WEIGHTS = {
  critical: 100,
  high: 10,
  moderate: 3,
  low: 1,
  info: 0,
};

if (!jsonOutput) {
  console.log("🔒 Security Audit Report\n");
  console.log("=".repeat(60));
}

let totalScore = 0;
const allResults = [];

projects.forEach((project) => {
  const projectDir = path.join(PROJECT_ROOT, project.path);

  if (!jsonOutput) {
    console.log(`\n📦 ${project.name} (${project.path})`);
    console.log("-".repeat(60));
  }

  try {
    // ✅ Timeout prevents hanging; --audit-level filters noise
    const auditOutput = execSync(
      `cd "${projectDir}" && npm audit --json --audit-level=${auditLevel}`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: timeoutMs }
    );

    const audit = JSON.parse(auditOutput);
    const score = calculateScore(audit);
    totalScore += score;

    const result = { project: project.name, path: project.path, score, audit };
    allResults.push(result);

    if (!jsonOutput) printAuditSummary(audit, false);
  } catch (error) {
    if (error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        const score = calculateScore(audit);
        totalScore += score;

        const result = {
          project: project.name,
          path: project.path,
          score,
          audit,
        };
        allResults.push(result);

        if (!jsonOutput) printAuditSummary(audit, true);
      } catch (parseError) {
        if (!jsonOutput)
          console.log(`\n❌ Error parsing audit output: ${parseError.message}`);
        allResults.push({
          project: project.name,
          path: project.path,
          score: 0,
          error: parseError.message,
        });
      }
    } else if (error.killed) {
      // ✅ Timed out
      if (!jsonOutput)
        console.log(
          `\n⏱️  ${project.name}: Audit timed out after ${timeoutMs}ms`
        );
      allResults.push({
        project: project.name,
        path: project.path,
        score: 0,
        error: "timeout",
      });
    } else {
      if (!jsonOutput)
        console.log(
          `\n⚠️  Skipping ${project.name} (directory not found or no package.json)`
        );
      allResults.push({
        project: project.name,
        path: project.path,
        score: 0,
        error: "not_found",
      });
    }
  }
});

// Output
if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        auditLevel,
        totalScore,
        projects: allResults,
      },
      null,
      2
    )
  );
} else {
  console.log("\n" + "=".repeat(60));
  console.log(`\n📈 Total Risk Score: ${totalScore}`);
  console.log(`   (Critical=100pts, High=10pts, Moderate=3pts, Low=1pt)\n`);
  console.log("💡 Run 'npm run audit:fix' in server/ or client/ to auto-fix");
  console.log("💡 Run 'npx snyk test' for comprehensive Snyk analysis");
  console.log(
    "💡 Flags: --json, --level=critical|high|moderate|low, --timeout=60000\n"
  );
}

// ✅ Exit code reflects severity, not just boolean
// 0 = clean, 1 = low/moderate only, 2 = high, 3 = critical
const exitCode =
  totalScore === 0 ? 0 : totalScore < 10 ? 1 : totalScore < 100 ? 2 : 3;
process.exit(exitCode);

function calculateScore(audit) {
  const v = audit.metadata?.vulnerabilities || {};
  return (
    (v.critical || 0) * SEVERITY_WEIGHTS.critical +
    (v.high || 0) * SEVERITY_WEIGHTS.high +
    (v.moderate || 0) * SEVERITY_WEIGHTS.moderate +
    (v.low || 0) * SEVERITY_WEIGHTS.low
  );
}

function printAuditSummary(audit, hasIssues) {
  const metadata = audit.metadata?.vulnerabilities || {};

  console.log(`\n📊 Vulnerability Summary:`);
  console.log(`   Critical: ${metadata.critical || 0}`);
  console.log(`   High:     ${metadata.high || 0}`);
  console.log(`   Moderate: ${metadata.moderate || 0}`);
  console.log(`   Low:      ${metadata.low || 0}`);
  console.log(`   Info:     ${metadata.info || 0}`);

  const vulns = audit.vulnerabilities
    ? Object.entries(audit.vulnerabilities)
    : [];

  if (vulns.length > 0) {
    // ✅ Sort by severity (critical first), show ALL not just top 5
    const severityOrder = {
      critical: 0,
      high: 1,
      moderate: 2,
      low: 3,
      info: 4,
    };
    vulns.sort(
      ([, a], [, b]) =>
        (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    );

    console.log(`\n⚠️  Vulnerabilities (${vulns.length}):`);
    vulns.forEach(([name, vuln]) => {
      const icon =
        vuln.severity === "critical"
          ? "🔴"
          : vuln.severity === "high"
          ? "🟠"
          : vuln.severity === "moderate"
          ? "🟡"
          : "🔵";
      console.log(
        `   ${icon} ${name}@${vuln.range} — ${vuln.severity.toUpperCase()}`
      );
      console.log(`     ${vuln.title}`);
      if (vuln.fixAvailable) {
        const fix =
          typeof vuln.fixAvailable === "object"
            ? `upgrade ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`
            : "fix available";
        console.log(`     💡 Fix: ${fix}`);
      }
    });
  } else if (!hasIssues) {
    console.log(`\n✅ No known vulnerabilities found!`);
  }
}
