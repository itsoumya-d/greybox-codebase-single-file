import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { runResidualLanguageAudit } from "./residual-language-audit.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

type GuardCheck = {
  name: string;
  run: () => Promise<boolean>;
};

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

const residualExtensions = new Set([".js", ".mjs", ".cjs"]);

const residualSkippedDirectories = new Set([
  ".agents",
  ".astro",
  ".claude",
  ".claude-sessions",
  ".codex",
  ".cursor",
  ".git",
  ".od",
  ".od-e2e",
  ".opencode",
  ".task",
  ".tmp",
  ".vite",
  "dist",
  "node_modules",
  "out",
]);

const residualAllowedExactPaths = new Set([
  // esbuild config entrypoints are executed directly by Node before package
  // dist output exists.
  "packages/contracts/esbuild.config.mjs",
  "packages/platform/esbuild.config.mjs",
  "packages/realtime/esbuild.config.mjs",
  "packages/sidecar/esbuild.config.mjs",
  "packages/sidecar-proto/esbuild.config.mjs",
  // Maintainer utility scripts ported from the media branch. They are
  // executed directly by Node and are not loaded by the studio runtime.
  "scripts/import-prompt-templates.mjs",
  "scripts/postinstall.mjs",
  "apps/packaged/esbuild.config.mjs",
  // Browser service workers must be served as JavaScript files.
  "apps/web/public/agds-notifications-sw.js",
  "scripts/verify-media-models.mjs",
  "tools/dev/bin/tools-dev.mjs",
  "tools/dev/esbuild.config.mjs",
  "tools/pack/bin/tools-pack.mjs",
  "tools/pack/esbuild.config.mjs",
  "tools/pack/resources/mac/notarize.cjs",
  // electron-builder hook path; CJS compatibility entry used by tools-pack desktop builds.
  "tools/pack/resources/web-standalone-after-pack.cjs",
]);

const residualAllowedPathPrefixes = [
  "apps/daemon/dist/",
  "apps/web/.next/",
  "apps/web/out/",
  "generated/",
  "e2e/playwright-report/",
  "e2e/reports/html/",
  "e2e/reports/playwright-html-report/",
  "e2e/reports/test-results/",
  "e2e/ui/.od-data/",
  "e2e/ui/reports/playwright-html-report/",
  "e2e/ui/reports/test-results/",
  "e2e/ui/test-results/",
  "test-results/",
  "vendor/",
];

const residualAllowedPathPatterns: RegExp[] = [];

function isResidualAllowedPath(repositoryPath: string): boolean {
  if (residualAllowedExactPaths.has(repositoryPath)) return true;
  if (residualAllowedPathPrefixes.some((prefix) => repositoryPath.startsWith(prefix))) return true;
  return residualAllowedPathPatterns.some((pattern) => pattern.test(repositoryPath));
}

function isResidualSkippedDirectoryName(directoryName: string): boolean {
  return (
    residualSkippedDirectories.has(directoryName) || directoryName === ".next" || directoryName.startsWith(".next-")
  );
}

async function collectResidualJavaScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const residualFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(fullPath);

    if (entry.isDirectory()) {
      if (isResidualSkippedDirectoryName(entry.name) || isResidualAllowedPath(`${repositoryPath}/`)) {
        continue;
      }

      residualFiles.push(...(await collectResidualJavaScript(fullPath)));
      continue;
    }

    if (!entry.isFile() || !residualExtensions.has(path.extname(entry.name))) {
      continue;
    }

    if (isResidualAllowedPath(repositoryPath)) {
      continue;
    }

    residualFiles.push(repositoryPath);
  }

  return residualFiles;
}

async function checkResidualJavaScript(): Promise<boolean> {
  const residualFiles = await collectResidualJavaScript(repoRoot);

  if (residualFiles.length > 0) {
    console.error("Residual project-owned JavaScript files found:");
    for (const filePath of residualFiles) {
      console.error(`- ${filePath}`);
    }
    console.error("Convert these files to TypeScript or add a documented generated/vendor/output allowlist entry.");
    return false;
  }

  console.log("Residual JavaScript check passed: project-owned code is TypeScript-only.");
  return true;
}

async function checkResidualLanguageAudit(): Promise<boolean> {
  const result = await runResidualLanguageAudit({ print: false });

  if (result.undocumented.length > 0) {
    console.error("Residual language audit found undocumented legacy-language matches:");
    for (const finding of result.undocumented.slice(0, 80)) {
      console.error(`- ${finding.file}:${finding.line} [${finding.id}] ${finding.text}`);
    }
    if (result.undocumented.length > 80) {
      console.error(`...and ${result.undocumented.length - 80} more`);
    }
    console.error("Remove these matches or classify them as compatibility, negative tests, third-party/protocol references, generated doc assets, or historical audit records.");
    return false;
  }

  console.log(`Residual language audit check passed: ${result.findings.length} legacy-language matches are classified.`);
  return true;
}

const testLayoutScopedDirectories = ["apps", "packages", "tools"];
const testLayoutSkippedDirectories = new Set([".next", ".od-data", "dist", "node_modules", "out", "reports", "test-results"]);

function isTestFile(fileName: string): boolean {
  return /\.test\.tsx?$/.test(fileName);
}

function expectedTestPath(repositoryPath: string): string {
  const [scope, project, ...relativeParts] = repositoryPath.split("/");
  if (!testLayoutScopedDirectories.includes(scope ?? "") || project == null || relativeParts.length === 0) {
    return repositoryPath;
  }

  const normalizedRelativeParts = relativeParts[0] === "src" ? relativeParts.slice(1) : relativeParts;
  return [scope, project, "tests", ...normalizedRelativeParts].join("/");
}

function isAllowedScopedTestPath(repositoryPath: string): boolean {
  const [scope, project, directory] = repositoryPath.split("/");
  return testLayoutScopedDirectories.includes(scope ?? "") && project != null && directory === "tests";
}

async function collectTestLayoutViolations(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const violations: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (testLayoutSkippedDirectories.has(entry.name)) {
        continue;
      }

      violations.push(...(await collectTestLayoutViolations(fullPath)));
      continue;
    }

    if (!entry.isFile() || !isTestFile(entry.name)) {
      continue;
    }

    const repositoryPath = toRepositoryPath(fullPath);
    if (!isAllowedScopedTestPath(repositoryPath)) {
      violations.push(repositoryPath);
    }
  }

  return violations;
}

async function checkTestLayout(): Promise<boolean> {
  const violations = (
    await Promise.all(
      testLayoutScopedDirectories.map((directory) => collectTestLayoutViolations(path.join(repoRoot, directory))),
    )
  ).flat();

  if (violations.length > 0) {
    console.error("Test files under apps/, packages/, and tools/ must live in tests/ sibling to src/:");
    for (const violation of violations) {
      console.error(`- ${violation} -> ${expectedTestPath(violation)}`);
    }
    return false;
  }

  console.log("Test layout check passed: apps/packages/tools tests live in sibling tests directories.");
  return true;
}

const e2ePackageJsonPath = path.join(repoRoot, "e2e", "package.json");
const e2eSkippedDirectories = new Set([".od-data", "node_modules", "reports", "test-results"]);
const e2eAllowedScripts = ["test", "typecheck"];

async function collectRepositoryFiles(directory: string, skippedDirectoryNames = new Set<string>()): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirectoryNames.has(entry.name)) continue;
      files.push(...(await collectRepositoryFiles(fullPath, skippedDirectoryNames)));
      continue;
    }
    if (entry.isFile()) files.push(toRepositoryPath(fullPath));
  }

  return files;
}

async function checkE2eLayout(): Promise<boolean> {
  const violations: string[] = [];
  const packageJson = JSON.parse(await readFile(e2ePackageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  const scriptNames = Object.keys(packageJson.scripts ?? {}).sort();
  if (scriptNames.join("\0") !== e2eAllowedScripts.join("\0")) {
    violations.push(
      `e2e/package.json scripts must be exactly ${e2eAllowedScripts.join(", ")} (found: ${scriptNames.join(", ")})`,
    );
  }

  const e2eRoot = path.join(repoRoot, "e2e");
  for (const repositoryPath of await collectRepositoryFiles(e2eRoot, e2eSkippedDirectories)) {
    if (
      repositoryPath === "e2e/package.json" ||
      repositoryPath === "e2e/tsconfig.json" ||
      repositoryPath === "e2e/vitest.config.ts" ||
      repositoryPath === "e2e/playwright.config.ts" ||
      repositoryPath === "e2e/AGENTS.md"
    ) {
      continue;
    }

    if (repositoryPath.startsWith("e2e/specs/")) {
      if (!/\.spec\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e specs must be *.spec.ts`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/tests/")) {
      if (!/\.test\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e tests must be *.test.ts`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/ui/")) {
      const relativePath = repositoryPath.slice("e2e/ui/".length);
      if (relativePath.includes("/") || !/\.test\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e UI files must be flat Playwright *.test.ts files under ui/`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/resources/")) {
      const relativePath = repositoryPath.slice("e2e/resources/".length);
      if (relativePath.includes("/") || !/\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e resources must be flat TypeScript files under resources/`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/lib/")) {
      if (!/\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e lib files must be TypeScript`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/scripts/")) {
      if (repositoryPath !== "e2e/scripts/playwright.ts") {
        violations.push(`${repositoryPath} -> e2e scripts currently allow only scripts/playwright.ts`);
      }
      continue;
    }

    violations.push(`${repositoryPath} -> e2e source files must live in specs/, tests/, ui/, resources/, lib/, or scripts/playwright.ts`);
  }

  if (violations.length > 0) {
    console.error("E2E package layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("E2E layout check passed: Vitest, Playwright UI, resources, lib, and scripts stay in their lanes.");
  return true;
}

const webTestSkippedDirectories = new Set([".od-data", "reports", "test-results"]);

async function checkWebTestLayout(): Promise<boolean> {
  const violations: string[] = [];
  const webTestsRoot = path.join(repoRoot, "apps", "web", "tests");

  for (const repositoryPath of await collectRepositoryFiles(webTestsRoot, webTestSkippedDirectories)) {
    if (repositoryPath.startsWith("apps/web/tests/vitest/") || repositoryPath.startsWith("apps/web/tests/playwright/")) {
      violations.push(`${repositoryPath} -> web tests should stay lightweight under apps/web/tests/ without vitest/playwright nesting`);
      continue;
    }

    if (/\.(spec|test)\.tsx?$/.test(repositoryPath) && !/\.test\.tsx?$/.test(repositoryPath)) {
      violations.push(`${repositoryPath} -> web Vitest test files must be *.test.ts or *.test.tsx`);
    }
  }

  if (violations.length > 0) {
    console.error("Web test layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Web test layout check passed: web tests stay lightweight and Vitest-only.");
  return true;
}

const toolsRootAllowlist = new Map<string, "directory" | "file">([
  // Keep top-level tools intentionally small. `tools/launcher` was an incoming
  // Windows shim experiment from PR #683 and is not an active repo boundary.
  ["AGENTS.md", "file"],
  ["dev", "directory"],
  ["pack", "directory"],
]);

async function checkToolsLayout(): Promise<boolean> {
  const toolsRoot = path.join(repoRoot, "tools");
  const entries = await readdir(toolsRoot, { withFileTypes: true });
  const seen = new Set<string>();
  const violations: string[] = [];

  for (const entry of entries) {
    const expected = toolsRootAllowlist.get(entry.name);
    const repositoryPath = `tools/${entry.name}${entry.isDirectory() ? "/" : ""}`;

    if (expected == null) {
      violations.push(`${repositoryPath} -> tools/ top-level entries are allowlisted; expected only AGENTS.md, dev/, and pack/`);
      continue;
    }

    seen.add(entry.name);
    if (expected === "directory" && !entry.isDirectory()) {
      violations.push(`${repositoryPath} -> expected tools/${entry.name}/ to be a directory`);
    }
    if (expected === "file" && !entry.isFile()) {
      violations.push(`${repositoryPath} -> expected tools/${entry.name} to be a file`);
    }
  }

  for (const [entryName, expected] of toolsRootAllowlist) {
    if (!seen.has(entryName)) {
      violations.push(`tools/${entryName}${expected === "directory" ? "/" : ""} -> required tools boundary is missing`);
    }
  }

  if (violations.length > 0) {
    console.error("Tools layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Tools layout check passed: tools/ top-level entries match the active boundary allowlist.");
  return true;
}

const gameLanguageRoots = [
  "AGENTS.md",
  "apps/AGENTS.md",
  "apps/landing-page/AGENTS.md",
  "apps/packaged/AGENTS.md",
  "apps/packaged/src",
  "apps/packaged/tests",
  "apps/desktop/src",
  "e2e/AGENTS.md",
  "e2e/specs",
  "packages/AGENTS.md",
  "packages/platform/tests",
  "packages/sidecar/tests",
  "tools/AGENTS.md",
  "tools/dev/tests",
  "tools/pack/AGENTS.md",
  "tools/pack/tests",
  "docs",
  "craft",
  "skills",
  "templates",
  "prompt-templates",
  "game-art-bibles",
  "apps/landing-page/app",
  "apps/web/src",
  "apps/daemon/src/mcp-config.ts",
  "apps/daemon/src/prompts",
  "packages/contracts/src/api/mcp.ts",
  "packages/contracts/src/prompts",
];

const gameLanguageSkippedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
]);

const forbiddenGameLanguagePatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "legacy-claude-design-product", pattern: /\bClaude Design\b/i },
  { id: "legacy-open-codesign-product", pattern: /\bOpen CoDesign\b/i },
  { id: "legacy-open-design-product", pattern: /\bOpen Design\b/i },
  { id: "legacy-open-game-design-product", pattern: /\bOpen Game Design\b/i },
  { id: "legacy-od-shorthand", pattern: /\bOD(?:'s)?\b/ },
  { id: "legacy-claude-design-slug", pattern: /\b(?:awesome-)?claude-design\b/i },
  { id: "legacy-design-files-label", pattern: /\bDesign Files\b/i },
  { id: "legacy-design-skills-label", pattern: /\bdesign skills\b/i },
  { id: "legacy-design-system-ui-surface", pattern: /\bDesign systems?\s+(picker|gallery)\b/i },
  { id: "legacy-design-system-copy", pattern: /\b(design-system (showcase|cards|specs|docs|catalog)|design-system-specific)\b|<span class='topic'>design-systems<\/span>/i },
  { id: "legacy-art-bible-catalog-count", pattern: /(<div class='num'>71<\/div>|<div class='num'>19<\/div>|\b(71 entries|71 systems|71 game art bibles|seventy-one game(?:-grade)? art bibles|~120 game art bibles|19 Skills)\b)/i },
  { id: "legacy-sync-design-systems-command", pattern: /\bsync-design-systems\.ts\b/i },
  { id: "legacy-nexu-labs-brand", pattern: /\bNexu Labs\b/i },
  { id: "website-generator", pattern: /\bwebsite generator\b/i },
  { id: "legacy-ui-generator", pattern: /\b(web\/app UI generator|UI screen generator|UI generator|screen generator|app generator)\b/i },
  { id: "legacy-builder-surface", pattern: /\b(app builder|website builder|web builder|site builder|UI builder|app\/site builder|generic UI builder)\b/i },
  { id: "legacy-mobile-app-copy", pattern: /\b(mobile app|mobile-app generator)\b/i },
  { id: "legacy-web-app-copy", pattern: /\bweb app\b/i },
  { id: "legacy-app-ui-copy", pattern: /\b(app UI|website UI|web\/mobile|mobile\/web|app onboarding|app settings|UI toolkit)\b/i },
  { id: "legacy-mini-app-kind", pattern: /\bmini[- ]app\b/i },
  { id: "legacy-connector-app-copy", pattern: /\bfor this app\b/i },
  { id: "legacy-ux-copy", pattern: /\b(UI\/UX|UX\/UI|UX)\b/i },
  { id: "legacy-player-flow-copy", pattern: /\b(user flows?|user journeys?|customer journeys?)\b/i },
  { id: "legacy-form-validation-craft", pattern: /\bform-validation\b/i },
  { id: "legacy-feature-copy", pattern: /\b(add a feature|feature work|feature-depth|features, roadmap|market, features|feature-heavy)\b/i },
  { id: "legacy-component-copy", pattern: /(## 6\. Components|##\s+\d+\.\s+Component Styling|references\/components\.md|references\/\{themes,layouts,components,checklist\}\.md|sections:\s*\[[^\]]*\bcomponents\b|Gameplay Modules & HUD Components|component rules treated as|component patterns from)/i },
  { id: "legacy-ui-components-category", pattern: /\bui-components\b/i },
  { id: "legacy-screen-form-copy", pattern: /(turn-1 form|turn-2 brand branch|single-screen|screen count|screen\/state|game prototype \/ screen-flow|layouts\/screens|(?<!game-)screen journey|design screens players|\|\s*screen\s*\|)/i },
  { id: "legacy-visible-form-copy", pattern: /(Form authoring rules|Form input labels|Forms in RTL|Form fields commonly|DESIGN\.md Form|emit a form on|direction-form|form-completion bar|form-error wiring|form-input label)/i },
  { id: "legacy-brand-copy", pattern: /(brand-spec|brand-asset protocol|branch on brand|brand tokens|Brand name and DESIGN\.md|no brand info|generic brand tokens|brand-specific (motion|tokens)|brand visual language|design-systems\/<brand>|specified a brand|brand appearance|brand color|brand-bright|brand consistency|Brand-agnostic|brand logos?|proprietary brand assets|product\/brand marketing)/i },
  { id: "legacy-theme-copy", pattern: /(Visual Theme & Atmosphere|visual theme|theme presets|theme rhythm|Dark tactical theme|season theme|events: theme|reinforce theme|extreme themes|neutral light theme|generic visual-identity\/theme presets)/i },
  { id: "app-designer", pattern: /\b(app|website) designer\b/i },
  { id: "saas-surface", pattern: /\b(SaaS landing page|SaaS dashboard|SaaS tables?)\b/i },
  { id: "business-surface", pattern: /\b(pricing cards?|admin panels?|admin sidebars?|fintech dashboard|e-commerce app|business dashboards?)\b/i },
  { id: "generic-product", pattern: /\bmobile\/web product\b/i },
  { id: "legacy-saas-demo-copy", pattern: /\b(Filebase|Start free|Book a demo|no card required|bandwidth bill)\b/i },
  { id: "legacy-cta-label", pattern: /\bCTA\b/ },
  { id: "legacy-cta-selector", pattern: /(\.cta\b|\bclass(Name)?=["'][^"']*\bcta\b|data-od-id=["']cta["'])/i },
  { id: "legacy-product-nav-link", pattern: /<a[^>]*>\s*(Product|Pricing|Customers)\s*<\/a>/i },
  { id: "legacy-discovery-form-copy", pattern: /\b(question form|discovery form)\b/i },
  { id: "legacy-desktop-app-copy", pattern: /\bdesktop app\b/i },
  { id: "legacy-web-app-daemon-copy", pattern: /\bweb app \+ local daemon\b/i },
  { id: "legacy-design-system-review-lane", pattern: /\bdesign-system additions\b/i },
  { id: "legacy-user-facing-api-doc", pattern: /\buser-facing API\b/i },
  { id: "legacy-user-level-smoke", pattern: /\buser-level smoke\b/i },
  { id: "legacy-user-specific-tooling", pattern: /\buser-specific tools?\b/i },
  {
    id: "legacy-operator-user-architecture",
    pattern:
      /\b(user-global skills|user-configured game art bible|user-role message|host app|user-controlled symlinks|user picks a folder|user runs locally|user pastes URL|Multi-user \/ RBAC)\b/i,
  },
  {
    id: "legacy-operator-user-doc",
    pattern:
      /\b(user's explicit override|user message|prompt the user|telling the user|user hasn't run|Some users run|explicit user step|user opting in|user-facing shortcut|user's current chat|explicit user choice|user action|user-initiated|normal users|power users|per-user preference|user can re-run|user-supplied component|user-visible change|user brief)\b/i,
  },
  {
    id: "legacy-operator-user-maintainer-doc",
    pattern:
      /\b(user impact|Local user data|User issues|from the user's Electron|end-users|user demand|user-facing verification|point users at)\b/i,
  },
];

function isGameLanguageAllowedLine(line: string): boolean {
  if (/\bdata:image\/[a-z0-9.+-]+;base64,/i.test(line)) return true;
  if (/\b(X-OD-Desktop-Import-Token|X-OD-Client|OD_BIND_HOST|OD_BIN|OD_NODE_BIN|OD_DATA_DIR|OD_REQUIRE_DESKTOP_AUTH)\b/.test(line)) return true;
  return /\b(do not|don't|never|unless|legacy|deprecated|alias|compatibility|forbidden|negative|old product|non-game|anti-pattern|avoid|instead of|not allowed|removed?|reject)\b/i.test(line);
}

async function collectGameLanguageFiles(target: string): Promise<string[]> {
  const absolute = path.join(repoRoot, target);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (gameLanguageSkippedDirectories.has(entry.name)) continue;
      files.push(...(await collectGameLanguageFiles(toRepositoryPath(fullPath))));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(md|ts|tsx|astro|html|json|css|svg)$/.test(entry.name)) continue;
    files.push(toRepositoryPath(fullPath));
  }
  return files;
}

async function collectRootMarkdownGameLanguageFiles(): Promise<string[]> {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function checkGameFirstLanguage(): Promise<boolean> {
  const files = new Set<string>(await collectRootMarkdownGameLanguageFiles());
  for (const target of gameLanguageRoots) {
    const absolute = path.join(repoRoot, target);
    try {
      const stats = await stat(absolute);
      if (stats.isFile()) files.add(target);
      else if (stats.isDirectory()) {
        for (const file of await collectGameLanguageFiles(target)) {
          files.add(file);
        }
      }
    } catch {
      continue;
    }
  }

  const violations: string[] = [];
  for (const file of [...files].sort()) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isGameLanguageAllowedLine(line)) return;
      for (const { id, pattern } of forbiddenGameLanguagePatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("Game-first language guard found product/app-generator wording:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use game-studio terms or mark compatibility/legacy references explicitly.");
    return false;
  }

  console.log("Game-first language check passed: prompts, docs, and primary UI copy avoid app/site generator positioning.");
  return true;
}

const localeGameIdentityForbiddenPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "english-design-system-label", pattern: /\bdesign systems?\b/i },
  { id: "old-product-name", pattern: /\bOpen[- ]Design\b/i },
  { id: "legacy-builder-surface", pattern: /\b(website generator|app designer|website designer|SaaS dashboard|SaaS landing page|mobile app)\b/i },
];

const localeGameArtBibleKeys = [
  "entry.tabDesignSystems",
  "newproj.designSystem",
  "newproj.dsCategoryFallback",
  "newproj.dsSearch",
  "newproj.dsEmpty",
  "examples.tagDesignSystem",
  "ds.searchPlaceholder",
  "ds.emptyNoMatch",
  "ds.previewTitle",
  "chat.importSkills",
  "misc.designSystem",
  "settings.library",
  "settings.libraryDesignSystems",
];

const localeDesignSystemForbiddenPattern =
  /\bdesign systems?\b|designsysteme|sistemas de diseño|sistemas de design|sistem desain|дизайн-систем|систем[аиы] дизайна|системи дизайну|systemy projekt|디자인 시스템|デザインシステム|設計系統|設計系统|设计系统|设计体系|ระบบการออกแบบ|designrendszer|أنظمة التصميم|سیستم‌های طراحی|tasarım sistemleri/i;

const localeGameIdentityKeyedForbiddenPatterns: Array<{ id: string; key: string; pattern: RegExp }> = [
  ...localeGameArtBibleKeys.map((key) => ({
    id: "localized-design-system-copy",
    key,
    pattern: localeDesignSystemForbiddenPattern,
  })),
  {
    id: "packaged-app-run-copy",
    key: "settings.cliEnvHint",
    pattern: /\bpackaged app runs\b|\bpackaged application\b|aplikasi paket|แอปพลิเคชัน|แอป/i,
  },
  {
    id: "packaged-app-runtime-copy",
    key: "settings.runtimePackaged",
    pattern: /\bpackaged app\b|\bpackaged application\b|แอป/i,
  },
  {
    id: "live-artifact-app-kind",
    key: "designFiles.kindLiveArtifact",
    pattern: /\blive app\b|ตัวแอป/i,
  },
  {
    id: "deploy-site-copy",
    key: "fileViewer.deployLinkDelayed",
    pattern: /\b(site|website)\b|sitio|webhely|strona|сайт|сайта|站点|站點|サイト|사이트|سایت|الموقع|เว็บไซต์|ตัวเว็บ/i,
  },
  {
    id: "deploy-site-copy",
    key: "fileViewer.deployLinkProtected",
    pattern: /\b(site|website)\b|sitio|webhely|strona|сайт|сайта|站点|站點|サイト|사이트|سایت|الموقع|เว็บไซต์|ตัวเว็บ/i,
  },
  {
    id: "notification-site-settings-copy",
    key: "settings.notifyDesktopBlocked",
    pattern:
      /\bsite settings\b|configuración del sitio|configurações do site|paramètres du site|Site-Einstellungen|webhely|witryny|настройках сайта|налаштуваннях сайту|站点设置|網站設定|サイト設定|사이트 설정|تنظیمات سایت|إعدادات الموقع|Site ayar|ตัวเว็บ|เว็บไซต์/i,
  },
  {
    id: "thai-connector-app-copy",
    key: "settings.connectorsClearConfirmBody",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-connector-app-copy",
    key: "settings.connectorsClearFinalTitle",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-connector-app-copy",
    key: "settings.connectorsClearFinalConfirm",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-connector-app-copy",
    key: "settings.connectorsHelpEmpty",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-orbit-app-copy",
    key: "settings.orbit.lede",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-orbit-app-copy",
    key: "settings.orbit.gateTitle",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-orbit-app-copy",
    key: "settings.orbit.gateAction",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-orbit-app-copy",
    key: "settings.orbit.controlsLockedHint",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
  {
    id: "thai-orbit-app-copy",
    key: "settings.orbit.artifactMetaLive",
    pattern: /แอป|แอปพลิเคชัน/i,
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLocaleStringValue(source: string, key: string): string | null {
  const match = new RegExp(`'${escapeRegExp(key)}'\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, "s").exec(source);
  return match?.[1] ?? null;
}

const localePreviewPillExpected: Record<string, string> = {
  en: "Game Studio Preview",
  id: "Pratinjau Studio Game",
  de: "Game-Studio-Vorschau",
  "zh-CN": "游戏工作室预览",
  "zh-TW": "遊戲工作室預覽",
  "pt-BR": "Prévia do estúdio de jogos",
  "es-ES": "Vista previa del estudio de juegos",
  ru: "Предпросмотр игровой студии",
  fa: "پیش‌نمایش استودیوی بازی",
  ar: "معاينة استوديو الألعاب",
  ja: "ゲームスタジオプレビュー",
  ko: "게임 스튜디오 미리보기",
  pl: "Podgląd studia gier",
  hu: "Játékstúdió-előnézet",
  fr: "Aperçu du studio de jeu",
  uk: "Перегляд ігрової студії",
  tr: "Oyun stüdyosu önizlemesi",
  th: "พรีวิวสตูดิโอเกม",
};

async function checkLocaleGameIdentity(): Promise<boolean> {
  const localeRoot = path.join(repoRoot, "apps", "web", "src", "i18n", "locales");
  const files = (await collectRepositoryFiles(localeRoot))
    .filter((repositoryPath) => repositoryPath.endsWith(".ts"))
    .sort();
  const violations: string[] = [];

  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    for (const retiredKey of ["'app.brand'", "'app.brandPill'", "'app.brandSubtitle'", "'app.welcomeLoading'"]) {
      if (source.includes(retiredKey)) {
        violations.push(`${file}: retired locale identity key ${retiredKey}`);
      }
    }
    if (!source.includes("'studio.identityName': 'AI Game Design Studio'")) {
      violations.push(`${file}: missing canonical 'studio.identityName': 'AI Game Design Studio'`);
    }
    const localeName = path.basename(file, ".ts");
    const expectedPreviewPill = localePreviewPillExpected[localeName];
    const actualPreviewPill = getLocaleStringValue(source, "studio.previewPill");
    if (!expectedPreviewPill) {
      violations.push(`${file}: missing guard expectation for studio.previewPill`);
    } else if (actualPreviewPill !== expectedPreviewPill) {
      violations.push(
        `${file}: expected 'studio.previewPill': '${expectedPreviewPill}', got '${actualPreviewPill ?? "<missing>"}'`,
      );
    }

    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { id, pattern } of localeGameIdentityForbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });

    for (const { id, key, pattern } of localeGameIdentityKeyedForbiddenPatterns) {
      const value = getLocaleStringValue(source, key);
      if (value && pattern.test(value)) {
        violations.push(`${file} [${id}] '${key}': '${value}'`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Locale game-identity guard found visible legacy wording:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use localized game-art-bible / game-studio wording in visible locale strings.");
    return false;
  }

  console.log("Locale game-identity check passed: all locales keep canonical game-studio identity labels.");
  return true;
}

const agdsPublicIdentityFiles = [
  "README.md",
  "QUICKSTART.md",
  "docs/architecture.md",
  "docs/agent-adapters.md",
  "apps/daemon/src/cli.ts",
  "apps/daemon/src/agents.ts",
  "apps/daemon/src/mcp.ts",
  "apps/daemon/src/mcp-daemon-url.ts",
  "apps/daemon/src/mcp-install-info.ts",
  "apps/daemon/src/mcp-live-artifacts-server.ts",
  "apps/daemon/src/media.ts",
  "apps/daemon/src/prompts/media-contract.ts",
  "apps/daemon/src/prompts/research-contract.ts",
  "apps/daemon/src/tools-connectors-cli.ts",
  "apps/daemon/src/tools-live-artifacts-cli.ts",
  "tools/pack/src/mac/app.ts",
  "tools/pack/src/win/app.ts",
  "tools/pack/src/win/nsis.ts",
];

const agdsPublicIdentityForbiddenPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "legacy-cli-usage", pattern: /\bUsage:\s*od\b/i },
  { id: "legacy-cli-command", pattern: /(^|[`"'\s])od\s+(media|research|mcp|tools)\b/i },
  { id: "legacy-live-artifacts-server", pattern: /\bopen-design-live-artifacts\b/i },
  { id: "legacy-open-design-runtime", pattern: /\bOpen Design (packaged runtime|data|CLI|daemon|MCP|desktop|installer|uninstaller)\b/i },
];

function isAgdsPublicIdentityAllowedLine(line: string): boolean {
  return /\b(deprecated|alias|compatibility|legacy|fallback|old wrappers?|OD_)\b/i.test(line);
}

async function checkAgdsPublicIdentity(): Promise<boolean> {
  const violations: string[] = [];
  for (const file of agdsPublicIdentityFiles) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isAgdsPublicIdentityAllowedLine(line)) return;
      for (const { id, pattern } of agdsPublicIdentityForbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("AGDS public identity guard found legacy CLI or runtime wording:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use agds / AI Game Design Studio in public help, docs, MCP names, and packaged runtime copy.");
    return false;
  }

  console.log("AGDS public identity check passed: public CLI, MCP, and packaged runtime surfaces prefer agds.");
  return true;
}

const releaseIdentityFiles = [
  ".github/scripts/release/assets/linux.sh",
  ".github/scripts/release/assets/mac-intel.sh",
  ".github/scripts/release/assets/mac.sh",
  ".github/scripts/release/assets/win.ps1",
  ".github/scripts/release/github/stable-notes.sh",
  ".github/scripts/release/r2/publish.sh",
  ".github/scripts/release/r2/summary.sh",
  ".github/scripts/release/r2/verify.sh",
  ".github/workflows/ci.yml",
  ".github/workflows/contributor-card-bot.yml",
  ".github/workflows/landing-page-ci.yml",
  ".github/workflows/landing-page-deploy.yml",
  ".github/workflows/metrics.yml",
  ".github/workflows/nix-check.yml",
  ".github/workflows/release-beta.yml",
  ".github/workflows/release-stable.yml",
  "scripts/release-stable.ts",
  "scripts/release-beta.ts",
];

const releaseIdentityForbiddenPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "legacy-release-tag", pattern: /\bopen-design-v\b/i },
  { id: "legacy-release-env", pattern: /\bOPEN_DESIGN_(?:RELEASE|NIGHTLY|STABLE|BETA)[A-Z_]*\b/ },
  { id: "legacy-package-scope", pattern: /@open-design\// },
  { id: "legacy-workflow-release-slug", pattern: /\bopen-design[-.][a-z0-9_.-]*/i },
  { id: "legacy-e2e-env", pattern: /\bOD_PACKAGED_E2E_/ },
  { id: "legacy-repo-owner", pattern: /\bnexu-io\/open-design\b/i },
  { id: "legacy-cachix-name", pattern: /\bnexu-open-design\b/i },
  { id: "legacy-cloudflare-project", pattern: /\bopen-design-landing\b/i },
  { id: "legacy-release-app-bundle", pattern: /\bOpen Design\.app\b/i },
  { id: "legacy-open-design-name", pattern: /\bOpen Design\b/i },
  { id: "legacy-release-notes", pattern: /\bRELEASE_NOTES:\s*Open Design\b/i },
  { id: "legacy-release-name", pattern: /\breleaseName\s*=\s*`Open Design\b/i },
  { id: "legacy-primary-release-tag", pattern: /\bversionTag\s*=\s*`open-design-v/i },
  { id: "legacy-workflow-release-env", pattern: /^\s+OPEN_DESIGN_(?:RELEASE|NIGHTLY|STABLE|BETA)[A-Z_]*:/ },
];

async function checkReleaseIdentity(): Promise<boolean> {
  const violations: string[] = [];
  for (const file of releaseIdentityFiles) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isAgdsPublicIdentityAllowedLine(line)) return;
      for (const { id, pattern } of releaseIdentityForbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("Release identity guard found legacy public release naming:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use agds tags/envs and AI Game Design Studio release copy; legacy names need explicit compatibility notes.");
    return false;
  }

  console.log("Release identity check passed: release scripts and workflows lead with AGDS identity.");
  return true;
}

const gameNativeSkillFolders = new Set([
  "behavior-tree-design",
  "camera-animation-vfx-lighting",
  "character-weapon-equipment",
  "combat-system",
  "critique",
  "desktop-game-ui",
  "dynamic-event-system",
  "economy-progression",
  "encounter-design",
  "final-studio-package",
  "game-adaptive-design-scaling",
  "game-art-bible",
  "game-audio-kit",
  "game-design-document",
  "game-dungeon-raid-architecture",
  "game-community-modding",
  "game-companion-party-systems",
  "game-difficulty-director",
  "game-hud-system",
  "game-key-art",
  "game-narrative-simulation",
  "game-pitch-deck",
  "game-trailer-motion",
  "game-viewport-scene",
  "inventory-crafting",
  "level-design-board",
  "live-artifact",
  "live-ops-calendar",
  "mobile-game-flow",
  "mobile-game-ui",
  "multiplayer-lobby",
  "narrative-branching",
  "node-logic-graph",
  "open-world-survival-stealth-vehicle",
  "playable-game-prototype",
  "playtest-benchmark-feasibility",
  "procedural-generation",
  "rpg-systems",
  "sprite-animation",
  "survival-module",
  "tweaks",
]);

async function checkGameNativeSkillFolders(): Promise<boolean> {
  const skillsRoot = path.join(repoRoot, "skills");
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const violations = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => !gameNativeSkillFolders.has(name))
    .sort();

  if (violations.length > 0) {
    console.error("Non-game skill folders found. Retired app/web skill ids must not ship as folders:");
    for (const violation of violations) console.error(`- skills/${violation}/`);
    return false;
  }

  console.log("Game-native skill folder check passed: only game-studio skills remain on disk.");
  return true;
}

const builtInGameArtBibleFolders = new Set([
  ".retired",
  "anime-gacha",
  "arcade-neon",
  "cozy-casual",
  "cyberpunk-fps",
  "fantasy-rpg",
  "game-control-center",
  "horror-survival",
  "military-tactical",
  "pixel-retro",
  "sci-fi-tactical",
  "soulslike-dark",
  "sports-broadcast",
  "steampunk-adventure",
  "stylized-3d",
  "underwater-exploration",
  "vaporwave-racing",
  "western-frontier",
]);

async function checkGameArtBibleCatalogFolders(): Promise<boolean> {
  const artBibleRoot = path.join(repoRoot, "game-art-bibles");
  const entries = await readdir(artBibleRoot, { withFileTypes: true });
  const violations = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .filter((name) => !builtInGameArtBibleFolders.has(name))
    .sort();

  if (violations.length > 0) {
    console.error("Retired or non-game art-bible folders found at game-art-bibles/ top level:");
    for (const violation of violations) console.error(`- game-art-bibles/${violation}/`);
    console.error("Move compatibility-only bibles under game-art-bibles/.retired/ or add a game-native curated id.");
    return false;
  }

  console.log("Game-art-bible catalog folder check passed: top-level bibles are curated game-native ids.");
  return true;
}

const deprecatedSkillFrontmatterPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "deprecated-od-frontmatter-root", pattern: /^od:\s*$/ },
  { id: "deprecated-od-skill-metadata-path", pattern: /\bod\.(?:mode|scenario|craft|game_art_bible|featured|example_prompt|fidelity|speaker_notes|animations|game)\b/ },
  { id: "deprecated-design-system-yaml-key", pattern: /^\s*design_system:\s*$/ },
  { id: "deprecated-design-system-requires-path", pattern: /\bod\.design_system\.requires\b/ },
  { id: "deprecated-design-system-requires-field", pattern: /\bdesign_system\.requires\b/ },
  { id: "deprecated-design-system-template-var", pattern: /\{\{\s*design_system\s*\}\}/ },
  { id: "deprecated-design-system-resolver-heading", pattern: /\bDesign-system resolver\b/ },
  {
    id: "deprecated-design-system-mode-list",
    pattern: /prototype\s*(?:\/|\|)\s*deck\s*(?:\/|\|)\s*template\s*(?:\/|\|)\s*design-system/i,
  },
  { id: "deprecated-design-system-mode-table", pattern: /`design-system`\s*\|\s*Game art bibles/i },
];

const skillFrontmatterProtocolRoots = ["docs", "skills", "specs"];

async function collectSkillFrontmatterProtocolFiles(): Promise<string[]> {
  const files = new Set<string>(await collectRootMarkdownGameLanguageFiles());
  for (const root of skillFrontmatterProtocolRoots) {
    const absolute = path.join(repoRoot, root);
    try {
      const stats = await stat(absolute);
      if (!stats.isDirectory()) continue;
      for (const file of await collectRepositoryFiles(absolute, gameLanguageSkippedDirectories)) {
        if (/\.(md|ts|tsx|json|html)$/.test(file)) files.add(file);
      }
    } catch {
      continue;
    }
  }
  return [...files].sort();
}

async function checkGameArtBibleFrontmatterTerminology(): Promise<boolean> {
  const violations: string[] = [];
  for (const file of await collectSkillFrontmatterProtocolFiles()) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isGameLanguageAllowedLine(line)) return;
      for (const { id, pattern } of deprecatedSkillFrontmatterPatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("Game-art-bible frontmatter guard found deprecated skill protocol names:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use agds.game_art_bible.requires / agds.craft.requires unless this is explicit compatibility text.");
    return false;
  }

  console.log(
    "Game-art-bible frontmatter check passed: docs, specs, and skills teach canonical agds/game_art_bible keys and game-art-bible mode.",
  );
  return true;
}

type CraftRequiresParseResult = {
  requires: string[];
  errors: string[];
};

function frontmatterBody(source: string): string | null {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? null;
}

function normalizeYamlListValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseInlineYamlList(value: string): string[] | null {
  const match = value.match(/^\[(.*)\]$/);
  if (!match) return null;
  return (match[1] ?? "")
    .split(",")
    .map(normalizeYamlListValue)
    .filter(Boolean);
}

function extractAgdsCraftRequires(file: string, source: string): CraftRequiresParseResult {
  const frontmatter = frontmatterBody(source);
  if (!frontmatter) return { requires: [], errors: [] };

  const requires: string[] = [];
  const errors: string[] = [];
  const lines = frontmatter.split(/\r?\n/);
  let inAgds = false;
  let agdsIndent = -1;
  let inCraft = false;
  let craftIndent = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    if (inCraft && indent <= craftIndent && !trimmed.startsWith("- ")) {
      inCraft = false;
    }
    if (inAgds && indent <= agdsIndent && trimmed !== "agds:") {
      inAgds = false;
      inCraft = false;
    }

    if (trimmed === "agds:") {
      inAgds = true;
      agdsIndent = indent;
      inCraft = false;
      continue;
    }
    if (inAgds && indent > agdsIndent && trimmed === "craft:") {
      inCraft = true;
      craftIndent = indent;
      continue;
    }
    if (!inCraft || indent <= craftIndent || !trimmed.startsWith("requires:")) {
      continue;
    }

    const value = trimmed.slice("requires:".length).trim();
    if (value.length > 0) {
      const parsed = parseInlineYamlList(value);
      if (parsed) {
        requires.push(...parsed);
      } else {
        errors.push(`${file}:${index + 2} agds.craft.requires must be an inline or block list`);
      }
      continue;
    }

    let foundBlockEntry = false;
    for (let blockIndex = index + 1; blockIndex < lines.length; blockIndex += 1) {
      const blockLine = lines[blockIndex] ?? "";
      const blockTrimmed = blockLine.trim();
      if (blockTrimmed.length === 0 || blockTrimmed.startsWith("#")) continue;

      const blockIndent = blockLine.length - blockLine.trimStart().length;
      if (blockIndent <= indent) break;
      if (!blockTrimmed.startsWith("- ")) {
        errors.push(`${file}:${blockIndex + 2} agds.craft.requires block entries must use "- slug"`);
        break;
      }

      foundBlockEntry = true;
      requires.push(normalizeYamlListValue(blockTrimmed.slice(2)));
      index = blockIndex;
    }
    if (!foundBlockEntry) {
      errors.push(`${file}:${index + 2} agds.craft.requires must list at least one craft slug`);
    }
  }

  return { requires, errors };
}

async function collectCraftDocumentSlugs(): Promise<Set<string>> {
  const craftRoot = path.join(repoRoot, "craft");
  const entries = await readdir(craftRoot, { withFileTypes: true });
  return new Set(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
      .map((entry) => entry.name.replace(/\.md$/, "")),
  );
}

async function checkCraftReferenceIntegrity(): Promise<boolean> {
  const craftRoot = path.join(repoRoot, "craft");
  const skillsRoot = path.join(repoRoot, "skills");
  const craftSlugs = await collectCraftDocumentSlugs();
  const missingReferences: string[] = [];
  const parseErrors: string[] = [];

  const skillEntries = await readdir(skillsRoot, { withFileTypes: true });
  for (const entry of skillEntries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillFile = path.join(skillsRoot, entry.name, "SKILL.md");
    try {
      const stats = await stat(skillFile);
      if (!stats.isFile()) continue;
    } catch {
      continue;
    }

    const repositoryPath = toRepositoryPath(skillFile);
    const parsed = extractAgdsCraftRequires(repositoryPath, await readFile(skillFile, "utf8"));
    parseErrors.push(...parsed.errors);
    for (const requirement of parsed.requires) {
      if (!craftSlugs.has(requirement)) {
        missingReferences.push(`${repositoryPath} -> ${requirement}`);
      }
    }
  }

  const readme = await readFile(path.join(craftRoot, "README.md"), "utf8");
  const documentedFiles = new Set(
    [...readme.matchAll(/`([a-z0-9][a-z0-9-]*\.md)`/g)].map((match) => match[1]?.replace(/\.md$/, "") ?? ""),
  );
  const undocumentedCraftFiles = [...craftSlugs].filter((slug) => !documentedFiles.has(slug)).sort();
  const staleReadmeEntries = [...documentedFiles].filter((slug) => !craftSlugs.has(slug)).sort();

  if (
    parseErrors.length > 0 ||
    missingReferences.length > 0 ||
    undocumentedCraftFiles.length > 0 ||
    staleReadmeEntries.length > 0
  ) {
    console.error("Craft reference integrity guard found unresolved game-production references:");
    for (const error of parseErrors) console.error(`- ${error}`);
    for (const reference of missingReferences) console.error(`- missing craft file: ${reference}`);
    for (const slug of undocumentedCraftFiles) console.error(`- craft/${slug}.md is missing from craft/README.md`);
    for (const slug of staleReadmeEntries) console.error(`- craft/README.md documents missing craft/${slug}.md`);
    return false;
  }

  console.log("Craft reference integrity check passed: skill craft requirements resolve to documented craft files.");
  return true;
}

const legacyPromptTemplateFilePattern =
  /\b(e-commerce|notion-team|profile-avatar|social-media-post|illustrated-city-food-map|illustration-crayon|momotaro-explainer|infographic-otaku|vr-headset-exploded-view|hyperframes-(app|brand|data|flight|logo|money|product|saas|social|tiktok|website)|cinematic-birthday|3d-animated-boy|a-decade-of-refinement|animation-transfer|beat-synced-outfit|forbidden-city-cat|hollywood-haute-couture|modern-rural|nightclub-flyer|seedance-2-0|traditional-dance|viral-k-pop|vintage-disney|toaster-rocket|cinematic-music-podcast|cinematic-marine-biologist|cinematic-emotional-face|cinematic-route-navigation-guide|luxury-supercar)\b/i;
const retiredImportedPromptTemplateFilePattern =
  /\b(anime-martial-arts-battle-illustration|ancient-guardian-dragon-rescue|ancient-indian-kingdom-fpv-video|character-intro-motion-graphics-sequence|cinematic-dragon-interaction-flight|cinematic-east-asian-woman-hand-dance|cinematic-street-racing-sequence-for-seedance-2|cinematic-vampire-alley-fight-sequence|crimson-horizon-sci-fi-cinematic-sequence|hunched-character-animation|live-action-anime-adaptation-water-vs-thunder-breathing-duel|magical-academy-storyboard-sequence|retro-hk-wuxia-film-aesthetic|sequence-and-movement-instruction-for-martial-arts-video|soul-switching-mirror-magic-sequence|wasteland-factory-chase)\b/i;
const genericPromptTemplateDriftPattern =
  /\b(saas|startup|e-commerce|website|landing page|pricing card|admin panel|crm|notion team|product promo|product reveal|brand sizzle|brand logo|social media post|fashion editorial|profile avatar|beauty shot|top-tier beauty|luxury white background|corporate dashboard)\b/i;
const legacyPromptTemplateMetadataPattern =
  /"author"\s*:\s*"open-design game studio contributors"/i;
const promptTemplateTextExtensions = new Set([".json", ".md", ".txt"]);

async function checkGameNativePromptTemplateFiles(): Promise<boolean> {
  const promptTemplateRoots = ["prompt-templates", "assets/prompt-templates"];
  const violations: string[] = [];
  for (const root of promptTemplateRoots) {
    for (const surface of ["image", "video"]) {
      const dir = path.join(repoRoot, root, surface);
      let entries = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const templatePath = path.join(dir, entry.name);
        if (
          legacyPromptTemplateFilePattern.test(entry.name) ||
          retiredImportedPromptTemplateFilePattern.test(entry.name)
        ) {
          violations.push(`${root}/${surface}/${entry.name}`);
        }
        if (promptTemplateTextExtensions.has(path.extname(entry.name).toLowerCase())) {
          const text = await readFile(templatePath, "utf8");
          if (legacyPromptTemplateMetadataPattern.test(text)) {
            violations.push(`${root}/${surface}/${entry.name}: legacy open-design author metadata`);
          }
          if (genericPromptTemplateDriftPattern.test(text)) {
            violations.push(`${root}/${surface}/${entry.name}: generic media/product prompt drift`);
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("Legacy non-game prompt template files found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Game-native prompt template check passed: no legacy media prompts remain on disk.");
  return true;
}

function extractObjectLiteral(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) return "";
  const bodyStart = start + startMarker.length;
  const end = source.indexOf(endMarker, bodyStart);
  if (end < 0) return "";
  return source.slice(bodyStart, end);
}

function extractQuotedMapEntries(source: string): Array<{ key: string; value: string }> {
  return [...source.matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)]
    .map((match) => ({ key: match[1] ?? "", value: match[2] ?? "" }))
    .filter((entry) => entry.key.length > 0 && entry.value.length > 0);
}

const promptTemplateSurfaces = ["image", "video"] as const;

function extractPromptTemplateAliasSurface(aliasBody: string, surface: (typeof promptTemplateSurfaces)[number]): string {
  const marker = `${surface}: {`;
  const start = aliasBody.indexOf(marker);
  if (start < 0) return "";

  const bodyStart = start + marker.length;
  const nextSurfaceStart =
    surface === "image" ? aliasBody.indexOf("\n  video:", bodyStart) : aliasBody.length;
  const rawBody = aliasBody.slice(bodyStart, nextSurfaceStart < 0 ? aliasBody.length : nextSurfaceStart);
  const close = rawBody.lastIndexOf("}");
  return close >= 0 ? rawBody.slice(0, close) : rawBody;
}

async function pathExists(repositoryPath: string): Promise<boolean> {
  try {
    await stat(path.join(repoRoot, repositoryPath));
    return true;
  } catch {
    return false;
  }
}

async function checkCompatibilityAliasTargets(): Promise<boolean> {
  const violations: string[] = [];
  const skillsSource = await readFile(path.join(repoRoot, "apps/daemon/src/skills.ts"), "utf8");
  const skillAliasStartMarker = "export const SKILL_ID_ALIASES = Object.freeze({";
  const skillAliasBody = extractObjectLiteral(skillsSource, skillAliasStartMarker, "\n});");
  if (!skillsSource.includes(skillAliasStartMarker)) {
    violations.push("apps/daemon/src/skills.ts: failed to locate SKILL_ID_ALIASES");
  } else {
    for (const { key, value } of extractQuotedMapEntries(skillAliasBody)) {
      if (!gameNativeSkillFolders.has(value)) {
        violations.push(`apps/daemon/src/skills.ts: legacy skill "${key}" targets non-canonical "${value}"`);
      }
      if (await pathExists(`skills/${key}`)) {
        violations.push(`skills/${key}/: legacy skill alias must not exist as a first-class skill folder`);
      }
    }
    for (const match of skillAliasBody.matchAll(/\]\s*:\s*["']([^"']+)["']/g)) {
      const value = match[1] ?? "";
      if (value && !gameNativeSkillFolders.has(value)) {
        violations.push(`apps/daemon/src/skills.ts: computed legacy skill alias targets non-canonical "${value}"`);
      }
    }
  }

  const promptTemplatesSource = await readFile(path.join(repoRoot, "apps/daemon/src/prompt-templates.ts"), "utf8");
  const aliasBody = extractObjectLiteral(
    promptTemplatesSource,
    "const TEMPLATE_ID_ALIASES: Record<PromptTemplateSurface, Record<string, string>> = {",
    "\n};\n\ninterface PromptTemplate",
  );
  if (!aliasBody) {
    violations.push("apps/daemon/src/prompt-templates.ts: failed to locate TEMPLATE_ID_ALIASES");
  } else {
    for (const surface of promptTemplateSurfaces) {
      const surfaceBody = extractPromptTemplateAliasSurface(aliasBody, surface);
      if (!surfaceBody) {
        violations.push(`apps/daemon/src/prompt-templates.ts: failed to locate ${surface} template aliases`);
        continue;
      }
      for (const { key, value } of extractQuotedMapEntries(surfaceBody)) {
        const legacyPath = `prompt-templates/${surface}/${key}.json`;
        const targetPath = `prompt-templates/${surface}/${value}.json`;
        if (await pathExists(legacyPath)) {
          violations.push(`${legacyPath}: retired prompt-template alias must not exist as a shipped template`);
        }
        if (!(await pathExists(targetPath))) {
          violations.push(`apps/daemon/src/prompt-templates.ts: alias "${key}" points at missing ${targetPath}`);
          continue;
        }
        try {
          const parsed = JSON.parse(await readFile(path.join(repoRoot, targetPath), "utf8")) as { id?: unknown };
          if (parsed.id !== value) {
            violations.push(`${targetPath}: template id must match alias target "${value}"`);
          }
        } catch {
          violations.push(`${targetPath}: failed to parse alias target JSON`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("Compatibility alias target guard failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Keep migration aliases centralized and pointing only at canonical game-native templates or reviewed game skills.");
    return false;
  }

  console.log("Compatibility alias target check passed: retained skill/template aliases point at game-native targets only.");
  return true;
}

const legacyArtBibleCompatibilityRoots = [
  "apps/daemon/src",
  "apps/web/src",
  "apps/desktop/src",
  "apps/packaged/src",
  "packages",
  "tools",
  "e2e",
];

const legacyArtBibleCompatibilitySkippedDirectories = new Set([
  ".next",
  "dist",
  "node_modules",
  "out",
  "reports",
  "test-results",
  "tests",
]);

const legacyArtBibleCompatibilityAllowedFiles = new Set([
  "apps/daemon/src/app-config.ts",
  "apps/daemon/src/artifact-manifest.ts",
  "apps/daemon/src/db.ts",
  "apps/daemon/src/library-install.ts",
  "apps/daemon/src/mcp.ts",
  "apps/daemon/src/server.ts",
  "apps/web/src/artifacts/manifest.ts",
  "apps/web/src/state/config.ts",
]);

const legacyArtBibleCompatibilityPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "legacy-designSystemId", pattern: /\bdesignSystemId\b/ },
  { id: "legacy-design-system-column", pattern: /\bdesign_system_id\b/ },
  { id: "legacy-disabledDesignSystems", pattern: /\bdisabledDesignSystems\b/ },
  { id: "legacy-inspirationDesignSystemIds", pattern: /\binspirationDesignSystemIds\b/ },
  { id: "legacy-design-systems-api", pattern: /\/api\/design-systems\b/ },
  { id: "legacy-design-systems-folder", pattern: /(?:^|[`"'(\s])(?:\.agds\/)?design-systems\// },
];

async function checkLegacyArtBibleCompatibilityConfinement(): Promise<boolean> {
  const files = new Set<string>();
  for (const root of legacyArtBibleCompatibilityRoots) {
    const absolute = path.join(repoRoot, root);
    try {
      const stats = await stat(absolute);
      if (!stats.isDirectory()) continue;
      for (const file of await collectRepositoryFiles(absolute, legacyArtBibleCompatibilitySkippedDirectories)) {
        if (/\.(ts|tsx|cts|mts|js|mjs|cjs)$/.test(file)) files.add(file);
      }
    } catch {
      continue;
    }
  }

  const violations: string[] = [];
  for (const file of [...files].sort()) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { id, pattern } of legacyArtBibleCompatibilityPatterns) {
        if (!pattern.test(line)) continue;
        if (legacyArtBibleCompatibilityAllowedFiles.has(file)) continue;
        violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("Legacy art-bible compatibility names escaped their migration boundary:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Keep retired design-system identifiers inside explicit art-bible migration/compatibility modules.");
    return false;
  }

  console.log("Legacy art-bible compatibility check passed: retired design-system identifiers stay confined.");
  return true;
}

const legacyRuntimeProtocolRoots = [
  "apps/daemon/src",
  "apps/desktop/src",
  "apps/landing-page/astro.config.ts",
  "apps/packaged/src",
  "apps/web/next.config.ts",
  "apps/web/sidecar",
  "apps/web/src",
  "e2e/playwright.config.ts",
  "e2e/specs",
  "packages",
  "scripts/seed-test-projects.ts",
  "tools/dev/src",
  "tools/pack/resources",
  "tools/pack/src",
];

const legacyRuntimeProtocolAllowedFiles = new Set([
  "apps/daemon/src/agents.ts",
  "apps/daemon/src/app-config.ts",
  "apps/daemon/src/app-version.ts",
  "apps/daemon/src/cli.ts",
  "apps/daemon/src/critique/config.ts",
  "apps/daemon/src/deploy.ts",
  "apps/daemon/src/legacy-data-migrator.ts",
  "apps/daemon/src/library-install.ts",
  "apps/daemon/src/mcp-daemon-url.ts",
  "apps/daemon/src/mcp-install-info.ts",
  "apps/daemon/src/mcp-live-artifacts-server.ts",
  "apps/daemon/src/mcp.ts",
  "apps/daemon/src/media-config.ts",
  "apps/daemon/src/media.ts",
  "apps/daemon/src/origin-validation.ts",
  "apps/daemon/src/projects.ts",
  "apps/daemon/src/project-watchers.ts",
  "apps/daemon/src/server.ts",
  "apps/daemon/src/tools-connectors-cli.ts",
  "apps/daemon/src/tools-live-artifacts-cli.ts",
  "apps/desktop/src/main/pdf-export.ts",
  "apps/landing-page/astro.config.ts",
  "apps/packaged/src/config.ts",
  "apps/packaged/src/headless.ts",
  "apps/packaged/src/logging.ts",
  "apps/packaged/src/protocol.ts",
  "apps/packaged/src/sidecars.ts",
  "apps/web/next.config.ts",
  "apps/web/sidecar/server.ts",
  "apps/web/src/runtime/exports.ts",
  "e2e/playwright.config.ts",
  "e2e/specs/mac.spec.ts",
  "e2e/specs/win.spec.ts",
  "packages/sidecar-proto/src/index.ts",
  "scripts/seed-test-projects.ts",
  "tools/dev/src/index.ts",
  "tools/pack/resources/linux/agds.desktop.template",
  "tools/pack/resources/web-standalone-after-pack.cjs",
  "tools/pack/src/config.ts",
  "tools/pack/src/linux.ts",
  "tools/pack/src/mac/app-config.ts",
  "tools/pack/src/mac/app.ts",
  "tools/pack/src/mac/constants.ts",
  "tools/pack/src/mac/workspace.ts",
  "tools/pack/src/package-source-hash.ts",
  "tools/pack/src/win/app.ts",
  "tools/pack/src/win/constants.ts",
  "tools/pack/src/win/nsis.ts",
  "tools/pack/src/workspace-build.ts",
]);

const legacyRuntimeProtocolPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "legacy-od-env", pattern: /\bOD_[A-Z0-9_]+\b/ },
  { id: "legacy-x-od-header", pattern: /\bX-OD-[A-Za-z0-9-]+\b/ },
  { id: "legacy-od-uri", pattern: /\bod:\/\// },
  { id: "legacy-od-stamp-flag", pattern: /--od-[a-z0-9-]+/ },
  { id: "legacy-od-data-root", pattern: /(?:^|[^A-Za-z0-9_-])\.od(?:[\/\\]|\b)/ },
];

const legacyRuntimeProtocolExtensions = /\.(ts|tsx|cts|mts|js|mjs|cjs|astro|template|sh|ps1)$/;

async function checkLegacyRuntimeProtocolConfinement(): Promise<boolean> {
  const files = new Set<string>();
  for (const root of legacyRuntimeProtocolRoots) {
    const absolute = path.join(repoRoot, root);
    try {
      const stats = await stat(absolute);
      if (stats.isFile()) {
        if (legacyRuntimeProtocolExtensions.test(root)) files.add(root);
        continue;
      }
      if (!stats.isDirectory()) continue;
      for (const file of await collectRepositoryFiles(absolute, legacyArtBibleCompatibilitySkippedDirectories)) {
        if (legacyRuntimeProtocolExtensions.test(file)) files.add(file);
      }
    } catch {
      continue;
    }
  }

  const violations: string[] = [];
  for (const file of [...files].sort()) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { id, pattern } of legacyRuntimeProtocolPatterns) {
        if (!pattern.test(line)) continue;
        if (legacyRuntimeProtocolAllowedFiles.has(file)) continue;
        violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("Legacy OD runtime/protocol names escaped their compatibility boundary:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Keep OD_/.od/od:// compatibility names inside explicit migration, wrapper, or protocol modules.");
    return false;
  }

  console.log("Legacy runtime/protocol compatibility check passed: OD_/.od/od:// names stay confined.");
  return true;
}

const legacyDocumentationAssetFilePattern =
  /\b(design-systems-library|magazine-deck|mobile-app|question-form|dating-web|digital-eguide|email-marketing|flowai-live-dashboard|gamified-app|github-dashboard|live-dashboard|mobile-onboarding|social-carousel|waitlist-page)\b/i;
const legacyDocumentationFilePattern =
  /\b(design-systems\.md|web[_-]design[_-]guidelines\.md|app[_-]layout[_-]patterns\.md|saas[_-]components\.md|responsive[_-]ui\.md)\b/i;

async function checkGameNativeDocumentationAssets(): Promise<boolean> {
  const violations: string[] = [];
  for (const file of await collectRepositoryFiles(path.join(repoRoot, "docs"), gameLanguageSkippedDirectories)) {
    if (legacyDocumentationFilePattern.test(file)) {
      violations.push(file);
    }
  }
  for (const root of ["docs/assets", "docs/screenshots"]) {
    const files = await collectRepositoryFiles(path.join(repoRoot, root), gameLanguageSkippedDirectories);
    for (const file of files) {
      if (legacyDocumentationAssetFilePattern.test(file)) {
        violations.push(file);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Legacy non-game documentation asset names found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Game-native documentation asset check passed: docs and docs assets use game-studio filenames.");
  return true;
}

const gameNativeMarkdownBodyRoots = [
  "apps/AGENTS.md",
  "apps/landing-page/AGENTS.md",
  "apps/packaged/AGENTS.md",
  "apps/packaged/README.md",
  "assets/frames/README.md",
  "deploy/README.md",
  "docs",
  "craft",
  "skills",
  "templates",
  "prompt-templates",
  "game-art-bibles",
  "specs",
  "nix/README.md",
  "packages/AGENTS.md",
  "tools/AGENTS.md",
  "tools/pack/AGENTS.md",
  "e2e/AGENTS.md",
];

const gameNativeMarkdownBodyAllowedPrefixes = [
  // Hidden compatibility art bibles are intentionally retained only as import
  // shims; public catalogs are guarded by checkGameArtBibleCatalogFolders.
  "game-art-bibles/.retired/",
  "generated/",
  "vendor/",
];

const gameNativeMarkdownAnchorPattern =
  /\b(AI Game Design Studio|AGDS|game(?:s|play)?|players?|playable|quests?|combat|HUD|game[- ]studio|genres?|narrative|progression|enem(?:y|ies)|boss|inventory|crafting|multiplayer|live[- ]ops|art bible|game design|gameplay viewport|level viewport|world map|node graph|behavior tree|faction|biome|encounter|camera (?:system|design)|animation system|VFX|lighting|soundtrack|audio|economy|monetization|accessibility|game engine|Unreal|Unity|Godot|WebGL)\b/i;

function isGameNativeMarkdownBodyAllowedPath(repositoryPath: string): boolean {
  return gameNativeMarkdownBodyAllowedPrefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

async function collectGameNativeMarkdownBodyFiles(): Promise<string[]> {
  const files = new Set<string>(await collectRootMarkdownGameLanguageFiles());

  for (const target of gameNativeMarkdownBodyRoots) {
    const absolute = path.join(repoRoot, target);
    try {
      const stats = await stat(absolute);
      if (stats.isFile()) {
        if (target.endsWith(".md")) files.add(target);
        continue;
      }

      if (!stats.isDirectory()) continue;
      for (const file of await collectRepositoryFiles(absolute, gameLanguageSkippedDirectories)) {
        if (file.endsWith(".md")) files.add(file);
      }
    } catch {
      continue;
    }
  }

  return [...files].filter((file) => !isGameNativeMarkdownBodyAllowedPath(file)).sort();
}

async function checkGameNativeMarkdownBodies(): Promise<boolean> {
  const violations: string[] = [];

  for (const file of await collectGameNativeMarkdownBodyFiles()) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    if (source.trim().length < 80) continue;
    if (!gameNativeMarkdownAnchorPattern.test(source)) {
      violations.push(`${file}: missing game-studio/gameplay anchor terminology`);
    }
  }

  if (violations.length > 0) {
    console.error("Game-native Markdown body guard found unanchored public Markdown:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Public Markdown should clearly frame the surface as AI Game Design Studio or game-production work.");
    return false;
  }

  console.log("Game-native Markdown body check passed: public Markdown is anchored in game-studio terminology.");
  return true;
}

const localizedMarkdownLegacyPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "deprecated-od-cli-copy", pattern: /`od`\s+(?:bin|CLI)|(?:for|für|pour|用に|供)\s+`od`|(?:local|lokale|ローカル|本地|本地)\s+`od`\s+CLI/i },
  { id: "deprecated-od-data-dir", pattern: /\.od\/|\.od\\|\.od\s+layout/i },
  { id: "deprecated-ds-picker-copy", pattern: /\bDS\s+pickers?\b|DS\s+ピッカー/i },
  { id: "deprecated-design-systems-loader", pattern: /design-systems\.ts\s+#\s+DESIGN\.md loader/i },
  { id: "zh-design-system-copy", pattern: /设计系统|設計系統/i },
  { id: "zh-app-site-generator-copy", pattern: /应用生成|應用生成|网站生成|網站生成|应用设计器|應用設計器|网站设计器|網站設計器/i },
  { id: "zh-generic-ui-generator-copy", pattern: /界面生成|通用界面|通用介面|UI\s*生成器/i },
  { id: "zh-user-flow-copy", pattern: /用户流|使用者流程|用户体验|使用者體驗|客户旅程|客戶旅程/i },
  { id: "zh-business-surface-copy", pattern: /落地页|登陸頁|仪表盘|儀表板|表单|表單|定价卡|定價卡|电商|電商/i },
];

const localizedMarkdownGameLanguageAllowedPrefixes: string[] = [];

function isLocalizedMarkdownGameLanguageAllowedPath(repositoryPath: string): boolean {
  return localizedMarkdownGameLanguageAllowedPrefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

async function checkLocalizedMarkdownGameLanguage(): Promise<boolean> {
  const violations: string[] = [];

  for (const file of await collectGameNativeMarkdownBodyFiles()) {
    if (isLocalizedMarkdownGameLanguageAllowedPath(file)) continue;
    const source = await readFile(path.join(repoRoot, file), "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (isGameLanguageAllowedLine(line)) return;
      for (const { id, pattern } of localizedMarkdownLegacyPatterns) {
        if (pattern.test(line)) {
          violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error("Localized Markdown game-language guard found translated legacy product wording:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use localized game-studio, player, gameplay, and game-art-bible terminology.");
    return false;
  }

  console.log("Localized Markdown game-language check passed: translated public docs avoid obvious legacy app/site wording.");
  return true;
}

const retiredCritiquePromptIdentifierScopes = [
  "apps/daemon/src",
  "apps/daemon/tests",
  "packages/contracts/src",
  "packages/contracts/tests",
];

const retiredCritiquePromptIdentifiers = [
  "BRAND" + "_SOURCE",
  "critique" + "Brand",
  "DEFAULT" + "_BRAND",
];

async function checkCritiquePromptArtBibleTerminology(): Promise<boolean> {
  const violations: string[] = [];
  const textFilePattern = /\.(md|ts|tsx|json)$/;

  for (const scope of retiredCritiquePromptIdentifierScopes) {
    const files = await collectRepositoryFiles(path.join(repoRoot, scope), gameLanguageSkippedDirectories);
    for (const file of files) {
      if (!textFilePattern.test(file)) continue;
      const source = await readFile(path.join(repoRoot, file), "utf8");
      for (const identifier of retiredCritiquePromptIdentifiers) {
        if (source.includes(identifier)) {
          violations.push(`${file}: retired critique prompt identifier ${identifier}`);
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("Critique prompt art-bible terminology guard found retired brand identifiers:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Critique prompt art-bible check passed: retired brand wrapper identifiers are absent.");
  return true;
}

const critiqueLegacyRoleConfinementScopes = [
  "apps/daemon/src/critique",
  "apps/daemon/tests",
  "packages/contracts/src/critique.ts",
  "packages/contracts/tests/critique.test.ts",
];

const critiqueDeprecatedRoleUsagePattern =
  /\brole=["'](?:designer|critic|brand|a11y|copy)["']|\brole:\s*["'](?:designer|critic|brand|a11y|copy)["']|\bcast:\s*\[\s*["'](?:designer|critic|brand|a11y|copy)["']|\[['"]designer['"],\s*['"]critic['"],\s*['"]brand['"],\s*['"]a11y['"],\s*['"]copy['"]\]/;

function isAllowedCritiqueLegacyRoleUsage(file: string, line: string, offset: number, source: string): boolean {
  if (file === "packages/contracts/src/critique.ts") {
    return /\bLEGACY_PANELIST_ROLES\b/.test(line);
  }

  if (file === "apps/daemon/tests/parser.test.ts") {
    const start = source.indexOf("describe('parseCritiqueStream -- legacy compatibility'");
    const end = source.indexOf("\ndescribe('parseCritiqueStream -- failure modes'", start);
    return start >= 0 && end > start && offset >= start && offset < end;
  }

  if (file === "apps/daemon/tests/critique-panel-prompt.test.ts") {
    return /not\.toContain\(['"]role=/.test(line);
  }

  return false;
}

async function checkCritiqueLegacyRoleConfinement(): Promise<boolean> {
  const violations: string[] = [];
  const files = new Set<string>();

  for (const scope of critiqueLegacyRoleConfinementScopes) {
    const absolute = path.join(repoRoot, scope);
    try {
      const stats = await stat(absolute);
      if (stats.isFile()) files.add(scope);
      else if (stats.isDirectory()) {
        for (const file of await collectRepositoryFiles(absolute, gameLanguageSkippedDirectories)) {
          files.add(file);
        }
      }
    } catch {
      continue;
    }
  }

  for (const file of [...files].sort()) {
    if (!/\.(ts|tsx|txt)$/.test(file)) continue;
    const source = await readFile(path.join(repoRoot, file), "utf8");
    let offset = 0;
    source.split(/\r?\n/).forEach((line, index) => {
      if (!critiqueDeprecatedRoleUsagePattern.test(line)) {
        offset += line.length + 1;
        return;
      }
      if (!isAllowedCritiqueLegacyRoleUsage(file, line, offset, source)) {
        violations.push(`${file}:${index + 1} ${line.trim()}`);
      }
      offset += line.length + 1;
    });
  }

  if (violations.length > 0) {
    console.error("Critique Theater legacy role guard found deprecated active panelist roles:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use game-studio role ids; keep deprecated roles only in explicit archived-transcript compatibility tests.");
    return false;
  }

  console.log("Critique Theater legacy role check passed: deprecated panelist roles stay confined to compatibility coverage.");
  return true;
}

const firstPartyIdentityNamingScopes = [
  "apps/landing-page/app",
  "apps/web/app/layout.tsx",
  "apps/web/public",
  "apps/web/src/components",
  "apps/web/src/index.css",
  "apps/web/src/i18n/types.ts",
  "apps/web/src/lib",
  "skills/live-artifact/examples",
  "skills/tweaks/example.html",
];

const firstPartyIdentityNamingPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "landing-brand-class", pattern: /\b(foot-brand|brand-mark|brand-meta)\b|className=['"]brand['"]|class=['"]brand['"]|\.brand\s*\{/ },
  { id: "web-brand-class", pattern: /\b(app-chrome(?:-[a-z0-9-]+)?|AppChromeHeader|APP_CHROME|entry-brand|brand-mark-img)\b/ },
  { id: "web-retired-icon-asset", pattern: /\bapp-icon\.svg\b/i },
  {
    id: "web-brand-comment",
    pattern:
      /\b(brand-aware|on-brand|brand-style|brand treatment|particular brand|brand label|long brand|brand-neutral|brand mark)\b/i,
  },
  {
    id: "web-generic-app-comment",
    pattern: /\b(rest of the app|elsewhere in the app|across the app|leave the app in|the app uses)\b/i,
  },
  { id: "i18n-brand-comment", pattern: /App\s*\/\s*brand/i },
];

async function checkFirstPartyIdentityNaming(): Promise<boolean> {
  const violations: string[] = [];
  const textFilePattern = /\.(css|html|md|svg|ts|tsx)$/;

  for (const scope of firstPartyIdentityNamingScopes) {
    const absolute = path.join(repoRoot, scope);
    let files: string[] = [];
    try {
      const stats = await stat(absolute);
      files = stats.isFile()
        ? [toRepositoryPath(absolute)]
        : await collectRepositoryFiles(absolute, gameLanguageSkippedDirectories);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!textFilePattern.test(file)) continue;
      const source = await readFile(path.join(repoRoot, file), "utf8");
      source.split(/\r?\n/).forEach((line, index) => {
        for (const { id, pattern } of firstPartyIdentityNamingPatterns) {
          if (pattern.test(line)) {
            violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
          }
        }
      });
    }
  }

  if (violations.length > 0) {
    console.error("First-party studio identity naming guard found retired brand naming:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use studio identity, game identity, provider, or connector mark wording for first-party UI.");
    return false;
  }

  console.log("First-party studio identity naming check passed: retired brand classes/comments stay absent.");
  return true;
}

async function checkRemovedLegacyTemplateFolders(): Promise<boolean> {
  const violations: string[] = [];
  try {
    await readdir(path.join(repoRoot, "templates", "live-artifacts"));
    violations.push("templates/live-artifacts/");
  } catch {
    // Expected: legacy non-game live-artifact templates are removed.
  }

  if (violations.length > 0) {
    console.error("Legacy non-game template folders found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Legacy template folder check passed: removed non-game live-artifact templates stay absent.");
  return true;
}

function extractRegistryIds(source: string, name: string): string[] | null {
  const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`, "m"));
  if (!match) return null;
  const body = match[1];
  if (body == null) return null;
  const ids: string[] = [];
  const idPattern = /\bid:\s*['"]([^'"]+)['"]/g;
  let id;
  while ((id = idPattern.exec(body)) != null) {
    const modelId = id[1];
    if (modelId != null) ids.push(modelId);
  }
  return ids;
}

function assertNoDuplicateRegistryIds(label: string, ids: string[], violations: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) violations.push(`${label}: duplicate id "${id}"`);
    seen.add(id);
  }
  if (ids.length === 0) violations.push(`${label}: no ids found`);
}

async function checkSharedMediaModelRegistry(): Promise<boolean> {
  const sharedExport = "@ai-game-design-studio/contracts/media/models";
  const mediaContractExport = "@ai-game-design-studio/contracts/prompts/media-contract";
  const registryPath = "packages/contracts/src/media/models.ts";
  const webShimPath = "apps/web/src/media/models.ts";
  const daemonShimPath = "apps/daemon/src/media-models.ts";
  const daemonPromptPath = "apps/daemon/src/prompts/system.ts";
  const mediaContractPath = "packages/contracts/src/prompts/media-contract.ts";
  const violations: string[] = [];

  const registry = await readFile(path.join(repoRoot, registryPath), "utf8");
  for (const name of ["IMAGE_MODELS", "VIDEO_MODELS"]) {
    const ids = extractRegistryIds(registry, name);
    if (!ids) violations.push(`${registryPath}: failed to parse ${name}`);
    else assertNoDuplicateRegistryIds(name, ids, violations);
  }
  if (!/export const AUDIO_MODELS_BY_KIND/.test(registry)) {
    violations.push(`${registryPath}: missing AUDIO_MODELS_BY_KIND`);
  }
  if (!/export function modelsForSurface/.test(registry)) {
    violations.push(`${registryPath}: missing modelsForSurface`);
  }

  for (const shimPath of [webShimPath, daemonShimPath]) {
    const shim = await readFile(path.join(repoRoot, shimPath), "utf8");
    if (!shim.includes(sharedExport)) {
      violations.push(`${shimPath}: must re-export ${sharedExport}`);
    }
    if (/export const (IMAGE_MODELS|VIDEO_MODELS|AUDIO_MODELS_BY_KIND)/.test(shim)) {
      violations.push(`${shimPath}: must not carry copied media model arrays`);
    }
  }

  const daemonPrompt = await readFile(path.join(repoRoot, daemonPromptPath), "utf8");
  if (!daemonPrompt.includes(mediaContractExport)) {
    violations.push(`${daemonPromptPath}: must import the shared media contract`);
  }
  const mediaContract = await readFile(path.join(repoRoot, mediaContractPath), "utf8");
  if (!mediaContract.includes("../media/models.js")) {
    violations.push(`${mediaContractPath}: must read model ids from the shared media registry`);
  }

  if (violations.length > 0) {
    console.error("Shared media model registry guard failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Shared media model registry check passed: contracts own media models and prompt contract.");
  return true;
}

async function checkSharedGameStudioPublicContracts(): Promise<boolean> {
  const daemonServerPath = "apps/daemon/src/server.ts";
  const projectContractPath = "packages/contracts/src/api/projects.ts";
  const sharedProjectContractExport = "@ai-game-design-studio/contracts/api/projects";
  const daemonServer = await readFile(path.join(repoRoot, daemonServerPath), "utf8");
  const projectContract = await readFile(path.join(repoRoot, projectContractPath), "utf8");
  const violations: string[] = [];

  for (const name of ["GAME_ENTITY_TYPES", "PROJECT_STUDIO_PRESENCE_MODES", "PROJECT_STUDIO_PRESENCE_SURFACES"]) {
    if (!new RegExp(`export const ${name}\\b`).test(projectContract)) {
      violations.push(`${projectContractPath}: missing exported ${name}`);
    }
    if (!daemonServer.includes(name)) {
      violations.push(`${daemonServerPath}: must consume shared ${name}`);
    }
  }

  if (!daemonServer.includes(sharedProjectContractExport)) {
    violations.push(`${daemonServerPath}: must import game memory and studio-presence enums from ${sharedProjectContractExport}`);
  }
  if (/const\s+GAME_ENTITY_TYPES\s*=\s*\[/.test(daemonServer)) {
    violations.push(`${daemonServerPath}: must not mirror GAME_ENTITY_TYPES locally`);
  }
  if (/const\s+PROJECT_STUDIO_PRESENCE_(?:MODES|SURFACES)\s*=\s*\[/.test(daemonServer)) {
    violations.push(`${daemonServerPath}: must not mirror studio-presence enums locally`);
  }

  if (violations.length > 0) {
    console.error("Shared game-studio public contract guard failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Shared game-studio public contract check passed: daemon consumes canonical game memory and presence contracts.");
  return true;
}

async function checkProjectArtifactLintIngress(): Promise<boolean> {
  const projectsPath = "apps/daemon/src/projects.ts";
  const serverPath = "apps/daemon/src/server.ts";
  const gameStudioImportPath = "apps/daemon/src/game-studio-import.ts";
  const finalizerPath = "apps/daemon/src/finalize-game-package.ts";
  const liveArtifactStorePath = "apps/daemon/src/live-artifacts/store.ts";
  const critiqueArtifactWriterPath = "apps/daemon/src/critique/artifact-writer.ts";
  const critiqueOrchestratorPath = "apps/daemon/src/critique/orchestrator.ts";
  const fileValidationTestPath = "apps/daemon/tests/game-studio-file-validation.test.ts";
  const gameStudioImportTestPath = "apps/daemon/tests/game-studio-import.test.ts";
  const folderImportTestPath = "apps/daemon/tests/folder-import-route.test.ts";
  const artifactLintRouteTestPath = "apps/daemon/tests/artifact-lint-route.test.ts";
  const finalizerTestPath = "apps/daemon/tests/finalize-game-package.test.ts";
  const liveArtifactStoreTestPath = "apps/daemon/tests/live-artifacts-store.test.ts";
  const critiqueArtifactWriterTestPath = "apps/daemon/tests/critique-artifact-writer.test.ts";
  const critiqueOrchestratorTestPath = "apps/daemon/tests/critique-orchestrator.test.ts";
  const projects = await readFile(path.join(repoRoot, projectsPath), "utf8");
  const server = await readFile(path.join(repoRoot, serverPath), "utf8");
  const gameStudioImport = await readFile(path.join(repoRoot, gameStudioImportPath), "utf8");
  const finalizer = await readFile(path.join(repoRoot, finalizerPath), "utf8");
  const liveArtifactStore = await readFile(path.join(repoRoot, liveArtifactStorePath), "utf8");
  const critiqueArtifactWriter = await readFile(path.join(repoRoot, critiqueArtifactWriterPath), "utf8");
  const critiqueOrchestrator = await readFile(path.join(repoRoot, critiqueOrchestratorPath), "utf8");
  const fileValidationTest = await readFile(path.join(repoRoot, fileValidationTestPath), "utf8");
  const gameStudioImportTest = await readFile(path.join(repoRoot, gameStudioImportTestPath), "utf8");
  const folderImportTest = await readFile(path.join(repoRoot, folderImportTestPath), "utf8");
  const artifactLintRouteTest = await readFile(path.join(repoRoot, artifactLintRouteTestPath), "utf8");
  const finalizerTest = await readFile(path.join(repoRoot, finalizerTestPath), "utf8");
  const liveArtifactStoreTest = await readFile(path.join(repoRoot, liveArtifactStoreTestPath), "utf8");
  const critiqueArtifactWriterTest = await readFile(path.join(repoRoot, critiqueArtifactWriterTestPath), "utf8");
  const critiqueOrchestratorTest = await readFile(path.join(repoRoot, critiqueOrchestratorTestPath), "utf8");
  const violations: string[] = [];

  const requiredProjectSnippets = [
    "import { lintArtifact } from './lint-artifact.js';",
    "export class InvalidGameStudioArtifactLintError extends Error",
    "validateGameStudioArtifactProjectFile(safeName, body);",
    "validateGameStudioArtifactProjectFile(newName, sourceBody);",
    "throw new InvalidGameStudioArtifactLintError('import folder', artifactFindings);",
  ];
  for (const snippet of requiredProjectSnippets) {
    if (!projects.includes(snippet)) {
      violations.push(`${projectsPath}: missing project artifact lint hook '${snippet}'`);
    }
  }

  const requiredServerSnippets = [
    "InvalidGameStudioArtifactLintError",
    "validateGameStudioArtifactProjectFile",
    "sendInvalidGameStudioArtifactLintError",
    "validateGameStudioArtifactProjectFile(f.filename, buf);",
  ];
  for (const snippet of requiredServerSnippets) {
    if (!server.includes(snippet)) {
      violations.push(`${serverPath}: missing artifact lint route handling '${snippet}'`);
    }
  }

  const requiredFinalizerSnippets = [
    "import { lintArtifact, type LintFinding } from './lint-artifact.js';",
    "export class FinalizeOutputLintError extends Error",
    "assertFinalGameDesignDocPassesLint(gameDesignDoc);",
    "throw new FinalizeOutputLintError(blockingFindings);",
  ];
  for (const snippet of requiredFinalizerSnippets) {
    if (!finalizer.includes(snippet)) {
      violations.push(`${finalizerPath}: missing final package artifact lint hook '${snippet}'`);
    }
  }
  if (!server.includes("FinalizeOutputLintError") || !server.includes("err instanceof FinalizeOutputLintError")) {
    violations.push(`${serverPath}: missing final package output-lint route mapping`);
  }
  if (!server.includes("return sendInvalidGameStudioArtifactLintError(res, err);")) {
    violations.push(`${serverPath}: missing structured ZIP import artifact-lint route mapping`);
  }
  for (const snippet of [
    "const findings = lintArtifact(html);",
    "const blockingFindings = findings.filter((finding) => finding.severity === 'P0');",
    "artifact failed game-studio lint",
  ]) {
    if (!server.includes(snippet)) {
      violations.push(`${serverPath}: missing static artifact save lint block '${snippet}'`);
    }
  }

  const requiredGameStudioImportSnippets = [
    "validateGameStudioArtifactProjectFile",
    "validateImportedGameStudioFiles(files);",
    "validateGameStudioProjectFile(file.path, file.body);",
    "validateGameStudioArtifactProjectFile(file.path, file.body);",
  ];
  for (const snippet of requiredGameStudioImportSnippets) {
    if (!gameStudioImport.includes(snippet)) {
      violations.push(`${gameStudioImportPath}: missing ZIP import lint hook '${snippet}'`);
    }
  }

  const requiredLiveArtifactStoreSnippets = [
    "import { lintArtifact, type LintFinding } from '../lint-artifact.js';",
    "function assertLiveArtifactPreviewPassesLint(previewHtml: string): void",
    "assertLiveArtifactPreviewPassesLint(previewHtml);",
    "assertLiveArtifactPreviewPassesLint(html);",
  ];
  for (const snippet of requiredLiveArtifactStoreSnippets) {
    if (!liveArtifactStore.includes(snippet)) {
      violations.push(`${liveArtifactStorePath}: missing live game artifact preview lint hook '${snippet}'`);
    }
  }

  const requiredCritiqueWriterSnippets = [
    "import { lintArtifact, type LintFinding } from '../lint-artifact.js';",
    "export class ArtifactLintError extends Error",
    "const blockingFindings = lintArtifact(body).filter((finding) => finding.severity === 'P0');",
    "throw new ArtifactLintError(blockingFindings);",
  ];
  for (const snippet of requiredCritiqueWriterSnippets) {
    if (!critiqueArtifactWriter.includes(snippet)) {
      violations.push(`${critiqueArtifactWriterPath}: missing critique artifact lint hook '${snippet}'`);
    }
  }
  if (!critiqueOrchestrator.includes("ArtifactLintError") || !critiqueOrchestrator.includes("err instanceof ArtifactLintError")) {
    violations.push(`${critiqueOrchestratorPath}: missing critique ArtifactLintError handling`);
  }

  if (!fileValidationTest.includes("rejects legacy non-game text artifacts uploaded through the chat attachment route")) {
    violations.push(`${fileValidationTestPath}: missing chat-upload legacy text artifact rejection test`);
  }
  if (!gameStudioImportTest.includes("rejects legacy non-game text artifacts before creating the project directory")) {
    violations.push(`${gameStudioImportTestPath}: missing ZIP import legacy artifact rejection test`);
  }
  if (!gameStudioImportTest.includes("returns structured game-studio lint errors for legacy ZIP imports")) {
    violations.push(`${gameStudioImportTestPath}: missing ZIP import route lint mapping test`);
  }
  if (!folderImportTest.includes("rejects imported folders that contain legacy non-game text artifacts")) {
    violations.push(`${folderImportTestPath}: missing folder-import legacy text artifact rejection test`);
  }
  if (!artifactLintRouteTest.includes("blocks P0 legacy artifacts on save before writing a public URL")) {
    violations.push(`${artifactLintRouteTestPath}: missing static artifact save rejection test`);
  }
  if (!finalizerTest.includes("blocks P0 legacy final-package output before writing DESIGN.md")) {
    violations.push(`${finalizerTestPath}: missing final-package legacy output rejection test`);
  }
  if (!finalizerTest.includes("throws FinalizeOutputLintError for P0 legacy non-game builder packages")) {
    violations.push(`${finalizerTestPath}: missing final-package output lint helper test`);
  }
  for (const snippet of [
    "rejects legacy non-game live game artifact previews before persistence",
    "rejects legacy non-game live game artifact updates without clobbering the current preview",
    "rejects legacy non-game refresh candidates before snapshot or preview writes",
  ]) {
    if (!liveArtifactStoreTest.includes(snippet)) {
      violations.push(`${liveArtifactStoreTestPath}: missing live game artifact lint regression '${snippet}'`);
    }
  }
  if (!critiqueArtifactWriterTest.includes("refuses P0 legacy app-builder artifacts before writing a file")) {
    violations.push(`${critiqueArtifactWriterTestPath}: missing critique artifact writer lint rejection test`);
  }
  if (!critiqueOrchestratorTest.includes("blocks legacy non-game SHIP artifacts while still finalizing the critique run")) {
    violations.push(`${critiqueOrchestratorTestPath}: missing critique orchestrator lint rejection test`);
  }

  if (violations.length > 0) {
    console.error("Project artifact lint enforcement guard failed:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Project artifact lint enforcement check passed: static-save, project save/rename/upload/folder-import/ZIP-import, final-package, live-artifact, and critique SHIP paths enforce P0 game-design lint.");
  return true;
}

async function checkFirstPartyGameNativeApiRoutes(): Promise<boolean> {
  const violations: string[] = [];
  const webSrcRoot = path.join(repoRoot, "apps", "web", "src");
  const files = (await collectRepositoryFiles(webSrcRoot))
    .filter((file) => /\.(ts|tsx)$/.test(file));

  for (const file of files) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (/\/api\/projects(?:[/?'"`]|$)/.test(line)) {
        violations.push(`${file}:${index + 1} -> first-party project-resource calls must use /api/game-deliverables`);
      }
      if (/\/api\/templates(?:[/?'"`]|$)/.test(line)) {
        violations.push(`${file}:${index + 1} -> first-party template catalog reads must use /api/game-templates`);
      }
      if (/\/api\/design-systems(?:[/?'"`]|$)/.test(line)) {
        violations.push(`${file}:${index + 1} -> first-party art-bible reads must use /api/game-art-bibles`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("First-party web API route guard found generic project/catalog endpoints:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Keep old endpoints as daemon compatibility aliases only; first-party web code should prefer game-native routes.");
    return false;
  }

  console.log("First-party web API route check passed: project/catalog calls use game-native routes.");
  return true;
}

const nixIdentityFiles = [
  "flake.nix",
  "nix/README.md",
  "nix/home-manager.nix",
  "nix/module-common.nix",
  "nix/nixos.nix",
  "nix/package-daemon.nix",
  "nix/package-web.nix",
];

const nixLegacyIdentityPatterns = [
  { id: "old-product-name", pattern: /\bOpen Design\b/i },
  { id: "old-package-pname", pattern: /\bopen-design-(?:daemon|web)\b/i },
  { id: "old-service-option", pattern: /\bservices\.open-design\b/i },
  { id: "old-design-product", pattern: /\blocal-first design product\b/i },
];

function isAllowedNixCompatibilityLine(line: string): boolean {
  return (
    /\blegacy\b|\bdeprecated\b|\bcompatibility\b/i.test(line) ||
    /github:nexu-io\/open-design|github\.com\/nexu-io\/open-design|nexu-open-design/.test(line) ||
    /legacyDefaultDataDir|mkAliasOptionModule/.test(line) ||
    /\bopen-design\s*=\s*agds\b/.test(line)
  );
}

async function checkNixAgdsIdentity(): Promise<boolean> {
  const violations: string[] = [];
  for (const file of nixIdentityFiles) {
    const source = await readFile(path.join(repoRoot, file), "utf8");
    source.split(/\r?\n/).forEach((line, index) => {
      if (isAllowedNixCompatibilityLine(line)) return;
      for (const { id, pattern } of nixLegacyIdentityPatterns) {
        if (pattern.test(line)) violations.push(`${file}:${index + 1} [${id}] ${line.trim()}`);
      }
    });
  }

  if (violations.length > 0) {
    console.error("Nix package/module identity guard found visible legacy product wording:");
    for (const violation of violations) console.error(`- ${violation}`);
    console.error("Use AGDS / AI Game Design Studio wording; keep old names only as explicit compatibility aliases.");
    return false;
  }

  console.log("Nix AGDS identity check passed: Nix packages and modules lead with AI Game Design Studio.");
  return true;
}

const checks: GuardCheck[] = [
  { name: "residual JavaScript", run: checkResidualJavaScript },
  { name: "residual language audit", run: checkResidualLanguageAudit },
  { name: "test layout", run: checkTestLayout },
  { name: "e2e layout", run: checkE2eLayout },
  { name: "web test layout", run: checkWebTestLayout },
  { name: "tools layout", run: checkToolsLayout },
  { name: "game-first language", run: checkGameFirstLanguage },
  { name: "locale game identity", run: checkLocaleGameIdentity },
  { name: "AGDS public identity", run: checkAgdsPublicIdentity },
  { name: "release identity", run: checkReleaseIdentity },
  { name: "game-native skill folders", run: checkGameNativeSkillFolders },
  { name: "game-art-bible catalog folders", run: checkGameArtBibleCatalogFolders },
  { name: "game-art-bible frontmatter terminology", run: checkGameArtBibleFrontmatterTerminology },
  { name: "craft reference integrity", run: checkCraftReferenceIntegrity },
  { name: "game-native prompt template files", run: checkGameNativePromptTemplateFiles },
  { name: "compatibility alias targets", run: checkCompatibilityAliasTargets },
  { name: "legacy art-bible compatibility confinement", run: checkLegacyArtBibleCompatibilityConfinement },
  { name: "legacy runtime/protocol compatibility confinement", run: checkLegacyRuntimeProtocolConfinement },
  { name: "game-native documentation assets", run: checkGameNativeDocumentationAssets },
  { name: "game-native Markdown bodies", run: checkGameNativeMarkdownBodies },
  { name: "localized Markdown game language", run: checkLocalizedMarkdownGameLanguage },
  { name: "critique prompt art-bible terminology", run: checkCritiquePromptArtBibleTerminology },
  { name: "critique legacy role confinement", run: checkCritiqueLegacyRoleConfinement },
  { name: "first-party studio identity naming", run: checkFirstPartyIdentityNaming },
  { name: "removed legacy template folders", run: checkRemovedLegacyTemplateFolders },
  { name: "shared media model registry", run: checkSharedMediaModelRegistry },
  { name: "shared game-studio public contracts", run: checkSharedGameStudioPublicContracts },
  { name: "project artifact lint enforcement", run: checkProjectArtifactLintIngress },
  { name: "first-party game-native API routes", run: checkFirstPartyGameNativeApiRoutes },
  { name: "Nix AGDS identity", run: checkNixAgdsIdentity },
];

const results: boolean[] = [];
for (const check of checks) {
  try {
    results.push(await check.run());
  } catch (error) {
    console.error(`Guard check failed unexpectedly: ${check.name}`);
    console.error(error);
    results.push(false);
  }
}

if (results.some((passed) => !passed)) {
  process.exitCode = 1;
}
