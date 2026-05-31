import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");

type LegacyPattern = {
  id: string;
  pattern: RegExp;
};

export type Finding = {
  category: string;
  file: string;
  id: string;
  line: number;
  text: string;
};

export type ResidualLanguageAuditResult = {
  categoryCounts: Map<string, number>;
  findings: Finding[];
  patternCounts: Map<string, number>;
  scannedFileCount: number;
  undocumented: Finding[];
};

const skippedDirectories = new Set([
  ".agents",
  ".agds-data",
  ".astro",
  ".codex",
  ".cursor",
  ".git",
  ".next",
  ".od",
  ".od-e2e",
  ".tmp",
  ".vite",
  "dist",
  "generated",
  "node_modules",
  "out",
  "playwright-report",
  "reports",
  "test-results",
  "vendor",
]);

const scannedExtensions = new Set([
  ".astro",
  ".css",
  ".cts",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ps1",
  ".sh",
  ".svg",
  ".template",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const legacyPatterns: LegacyPattern[] = [
  { id: "legacy-product-name", pattern: /\b(?:Claude Design|Open CoDesign|Open Design|Open Game Design)\b/i },
  { id: "legacy-open-design-slug", pattern: /\bopen-design[-.][a-z0-9_.-]*/i },
  { id: "legacy-claude-design-slug", pattern: /\b(?:awesome-)?claude-design\b/i },
  { id: "legacy-design-system", pattern: /\bdesign systems?\b|\bdesign-system\b|\bdesignSystemId\b|\bdesign_system_id\b|\bdisabledDesignSystems\b|\binspirationDesignSystemIds\b|\/api\/design-systems\b|(?:^|[`"'(\s])(?:\.agds\/)?design-systems\//i },
  { id: "legacy-design-files-label", pattern: /\bDesign Files\b/i },
  { id: "legacy-design-skills-label", pattern: /\bdesign skills\b/i },
  { id: "legacy-ui-generator", pattern: /\b(web\/app UI generator|UI screen generator|UI generator|screen generator|app generator)\b/i },
  { id: "legacy-builder-surface", pattern: /\b(app builder|website builder|web builder|site builder|UI builder|app\/site builder|generic UI builder)\b/i },
  { id: "legacy-app-designer", pattern: /\b(app|website) designer\b/i },
  { id: "legacy-app-ui", pattern: /\b(app UI|website UI|web\/mobile|mobile\/web|app onboarding|app settings|UI toolkit)\b/i },
  { id: "legacy-web-app", pattern: /\bweb app\b/i },
  { id: "legacy-mobile-app", pattern: /\bmobile app\b|\bmobile-app generator\b/i },
  { id: "legacy-saas-surface", pattern: /\b(SaaS landing page|SaaS dashboard|SaaS tables?)\b/i },
  { id: "legacy-business-surface", pattern: /\b(pricing cards?|admin panels?|admin sidebars?|fintech dashboard|e-commerce app|business dashboards?)\b/i },
  { id: "legacy-ux", pattern: /\b(UI\/UX|UX\/UI|UX)\b/i },
  { id: "legacy-player-flow", pattern: /\b(user flows?|user journeys?|customer journeys?)\b/i },
  { id: "legacy-cta", pattern: /\bCTA\b|\.cta\b|data-od-id=["']cta["']/i },
  { id: "legacy-od-runtime", pattern: /\bOD_[A-Z0-9_]+\b|\bX-OD-[A-Za-z0-9-]+\b|\bod:\/\// },
  { id: "legacy-od-data-root", pattern: /(?:^|[^A-Za-z0-9_-])\.od(?:[\/\\]|\b)/ },
];

const compatibilityImplementationFiles = new Set([
  "apps/daemon/src/agents.ts",
  "apps/daemon/src/app-config.ts",
  "apps/daemon/src/app-version.ts",
  "apps/daemon/src/artifact-manifest.ts",
  "apps/daemon/src/cli.ts",
  "apps/daemon/src/db.ts",
  "apps/daemon/src/deploy.ts",
  "apps/daemon/src/game-art-bible-preview.ts",
  "apps/daemon/src/game-art-bible-showcase.ts",
  "apps/daemon/src/game-art-bibles.ts",
  "apps/daemon/src/legacy-data-migrator.ts",
  "apps/daemon/src/library-install.ts",
  "apps/daemon/src/lint-artifact.ts",
  "apps/daemon/src/mcp-daemon-url.ts",
  "apps/daemon/src/mcp-install-info.ts",
  "apps/daemon/src/mcp-live-artifacts-server.ts",
  "apps/daemon/src/mcp.ts",
  "apps/daemon/src/media-config.ts",
  "apps/daemon/src/media.ts",
  "apps/daemon/src/origin-validation.ts",
  "apps/daemon/src/project-watchers.ts",
  "apps/daemon/src/projects.ts",
  "apps/daemon/src/prompt-templates.ts",
  "apps/daemon/src/server.ts",
  "apps/daemon/src/skills.ts",
  "apps/daemon/src/tools-connectors-cli.ts",
  "apps/daemon/src/tools-live-artifacts-cli.ts",
  "apps/desktop/src/main/pdf-export.ts",
  "apps/desktop/src/main/index.ts",
  "apps/packaged/AGENTS.md",
  "apps/packaged/src/config.ts",
  "apps/packaged/src/headless.ts",
  "apps/packaged/src/identity.ts",
  "apps/packaged/src/paths.ts",
  "apps/packaged/src/protocol.ts",
  "apps/packaged/src/sidecars.ts",
  "apps/web/next.config.ts",
  "apps/web/public/od-notifications-sw.js",
  "apps/web/src/artifacts/manifest.ts",
  "apps/web/src/lib/parse-provenance.ts",
  "apps/web/src/providers/daemon.ts",
  "apps/web/src/runtime/exports.ts",
  "apps/web/src/state/config.ts",
  "apps/web/src/state/projects.ts",
  "packages/contracts/src/game-studio.ts",
  "packages/sidecar-proto/src/index.ts",
  "scripts/release-beta.ts",
  "scripts/release-stable.ts",
  "scripts/seed-test-projects.ts",
  "tools/dev/src/config.ts",
  "tools/dev/src/desktop-auth-gate.ts",
  "tools/dev/src/index.ts",
  "tools/dev/src/sidecar-client.ts",
  "tools/pack/src/config.ts",
  "tools/pack/src/linux.ts",
  "tools/pack/src/mac/app-config.ts",
  "tools/pack/src/mac/app.ts",
  "tools/pack/src/mac/constants.ts",
  "tools/pack/src/mac/paths.ts",
  "tools/pack/src/mac/workspace.ts",
  "tools/pack/src/package-source-hash.ts",
  "tools/pack/src/resources.ts",
  "tools/pack/src/win/app.ts",
  "tools/pack/src/win/constants.ts",
  "tools/pack/src/win/identity.ts",
  "tools/pack/src/win/paths.ts",
  "tools/pack/src/workspace-build.ts",
  "tools/pack/resources/linux/agds.desktop.template",
]);

function isCompatibilityImplementationFile(file: string): boolean {
  return compatibilityImplementationFiles.has(file);
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function hasScannedExtension(fileName: string): boolean {
  if (fileName.endsWith(".desktop.template")) return true;
  return scannedExtensions.has(path.extname(fileName));
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(fullPath);

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (!entry.isFile() || !hasScannedExtension(entry.name)) continue;
    files.push(repositoryPath);
  }
  return files;
}

function isCompatibilityLine(line: string): boolean {
  return /\b(legacy|deprecated|compat(?:ibility)?|migration|alias|retired|old product|negative|forbidden|reject|blocked?|guard(?:rail)?|allowlist|former|historical|do not|don't|never|avoid|instead of|non-game|not allowed|explicitly)\b|LEGACY_/i.test(line);
}

function isThirdPartyOrProtocolLine(line: string): boolean {
  return /https?:\/\/|github\.com|npm:|pnpm |cargo |mcp-design-system-extractor|mcp-server|Cloudflare Pages|pages\.dev|FormData|Array\.prototype|URLSearchParams|content-type|x-www-form-urlencoded/i.test(line);
}

function classifyFinding(file: string, line: string): string | null {
  if (file.startsWith("docs/assets/")) return "generated-doc-asset";
  if (file === "docs/game-design-compatibility-manifest.md") return "compatibility-manifest";
  if (
    file === "docs/game-design-completion-audit.md" ||
    file === "docs/game-design-transformation-audit.md" ||
    file === "docs/game-design-requirement-matrix.md"
  ) {
    return "historical-audit";
  }
  if (
    (file === "README.md" || file === "docs/architecture.md") &&
    /\bAGDS_LEGACY_DATA_DIR\b|(?:^|[^A-Za-z0-9_-])\.od(?:[\/\\]|\b)|\bOD_[A-Z0-9_]+\b|\bod:\/\//i.test(line)
  ) {
    return "compatibility-documentation";
  }
  if (file === "scripts/guard.ts" || file === "scripts/residual-language-audit.ts") return "guardrail-code";
  if (isCompatibilityImplementationFile(file)) return "compatibility-implementation";
  if (file.startsWith("game-art-bibles/.retired/")) return "retired-compatibility-art-bible";
  if (file === "CHANGELOG.md" || file.startsWith("specs/")) return "historical-reference";
  if (file.includes("/tests/") || file.startsWith("e2e/")) return "test-or-negative-fixture";
  if (isThirdPartyOrProtocolLine(line)) return "third-party-or-protocol-reference";
  if (isCompatibilityLine(line)) return "explicit-compatibility-context";
  return null;
}

function formatCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function previewLine(text: string): string {
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function isGeneratedBinaryPayloadLine(file: string, line: string): boolean {
  return file.startsWith("docs/assets/") && /data:image\/[a-zA-Z0-9.+-]+;base64,/.test(line);
}

export async function runResidualLanguageAudit(options: { print?: boolean } = {}): Promise<ResidualLanguageAuditResult> {
  const scannedFiles = await collectFiles(repoRoot);
  const findings: Finding[] = [];

  for (const file of scannedFiles.sort()) {
    const text = await readFile(path.join(repoRoot, file), "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (isGeneratedBinaryPayloadLine(file, line)) return;
      for (const { id, pattern } of legacyPatterns) {
        if (!pattern.test(line)) continue;
        findings.push({
          category: classifyFinding(file, line) ?? "undocumented",
          file,
          id,
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }

  const undocumented = findings.filter((finding) => finding.category === "undocumented");
  const categoryCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();

  for (const finding of findings) {
    categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + 1);
    patternCounts.set(finding.id, (patternCounts.get(finding.id) ?? 0) + 1);
  }

  const result: ResidualLanguageAuditResult = {
    categoryCounts,
    findings,
    patternCounts,
    scannedFileCount: scannedFiles.length,
    undocumented,
  };

  if (options.print ?? true) {
    console.log("# Residual Language Audit");
    console.log("");
    console.log(`Scanned files: ${result.scannedFileCount}`);
    console.log(`Legacy-language matches reviewed: ${result.findings.length}`);
    console.log(`Categories: ${formatCounts(result.categoryCounts) || "none"}`);
    console.log(`Patterns: ${formatCounts(result.patternCounts) || "none"}`);

    if (result.undocumented.length > 0) {
      console.error("");
      console.error("Undocumented legacy-language matches found:");
      for (const finding of result.undocumented.slice(0, 80)) {
        console.error(`- ${finding.file}:${finding.line} [${finding.id}] ${previewLine(finding.text)}`);
      }
      if (result.undocumented.length > 80) {
        console.error(`...and ${result.undocumented.length - 80} more`);
      }
      console.error("");
      console.error("Remove these matches or add explicit compatibility, negative-test, third-party, or historical context.");
    } else {
      console.log("");
      console.log("Residual language audit passed: all matches are classified as compatibility, negative tests, third-party/protocol references, or historical audit records.");
    }
  }

  return result;
}

const isDirectRun = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const result = await runResidualLanguageAudit();
  if (result.undocumented.length > 0) {
    process.exitCode = 1;
  }
}
