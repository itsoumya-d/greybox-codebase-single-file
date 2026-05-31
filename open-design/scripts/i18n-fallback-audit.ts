import { readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const repoRoot = path.resolve(import.meta.dirname, "..");

type Locale =
  | "en"
  | "id"
  | "de"
  | "zh-CN"
  | "zh-TW"
  | "pt-BR"
  | "es-ES"
  | "ru"
  | "fa"
  | "ar"
  | "ja"
  | "ko"
  | "pl"
  | "hu"
  | "fr"
  | "uk"
  | "tr"
  | "th";

const LOCALES: Locale[] = [
  "en",
  "id",
  "de",
  "zh-CN",
  "zh-TW",
  "pt-BR",
  "es-ES",
  "ru",
  "fa",
  "ar",
  "ja",
  "ko",
  "pl",
  "hu",
  "fr",
  "uk",
  "tr",
  "th",
];

type Dict = Record<string, string>;

type LocaleFallbackAudit = {
  locale: Locale;
  unreviewedExactEnglishValues: number;
  mixedEnglishPhraseValues: number;
  topGroups: Array<{ group: string; count: number }>;
  mixedEnglishTopGroups: Array<{ group: string; count: number }>;
};

const technicalFallbackAllowlist =
  /^(common\.(?:openPreview|exportPdf|exportZip|exportHtml|minutesAgo|hoursAgo|daysAgo|minutesShort|hoursShort|daysShort)|studio\.identityName|settings\.(?:modeApiMeta|apiSection|apiKey|baseUrl|apiVersion|localCli|anthropicApi|mediaProviderBaseUrl|appPlatform|mcpOAuthStatus|mcpOauth|librarySkills|privacy|appVersion|appChannel|model|show|hide|test|agentInstall\.docs)|chat\.example[123]Tag|misc\.(?:gameArtBible|copyMarkdown)|connectors\.category\.(?:cms|telemetry)|fileViewer\.cloudflare(?:PagesProvider|DomainPrefixPlaceholder|PagesDevLinkLabel)|newproj\.(?:engineWebgl|engineUnity|engineUnreal|engineGodot|deliverableGdd)|project\.status\.|agentPicker\.byok|pasteDialog\.namePlaceholder|qf\.cardSampleText|gameArtBible\.(?:installFromFolder|specToggle|surfaceWeb|surfaceImage|surfaceVideo|surfaceAudio)|examples\.(?:modeOrbit|surfaceAudio)|avatar\.(?:anthropicApi|modelLabel|modelSection)|tool\.(?:bash|glob|grep|fetch)|telemetry\.)/;

const mixedEnglishPhrasePattern =
  /\b(?:Could not reach the local daemon|Make sure AI Game Design Studio is running|then reopen this panel|Save failed\. Check|No studio MCP servers configured|Click Add server|get started: pick|custom stdio \/ HTTP studio server|Stored in the AI Game Design Studio data directory as|grant AI Game Design Studio access via the provider OAuth flow|Click Connect|This artifact has no|ask the agent to add them|Refreshable sources are configured|waiting for a run|Events observed while this tab is open|No refresh activity yet|Trigger Refresh to record a timeline|automated runs)\b/i;

function localePath(locale: Locale): string {
  return path.join(repoRoot, "apps", "web", "src", "i18n", "locales", `${locale}.ts`);
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isStringLiteral(name) || ts.isIdentifier(name)) return name.text;
  return null;
}

function stringInitializerText(initializer: ts.Expression): string | null {
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  return null;
}

function parseLocaleDict(sourceText: string, filePath: string): Dict {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  let dict: Dict | null = null;

  function visit(node: ts.Node): void {
    if (dict != null) return;
    if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isObjectLiteralExpression(node.initializer)) {
      ts.forEachChild(node, visit);
      return;
    }

    const entries: Dict = {};
    for (const property of node.initializer.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = propertyNameText(property.name);
      const value = stringInitializerText(property.initializer);
      if (key == null || value == null) {
        continue;
      }
      entries[key] = value;
    }

    if ("studio.identityName" in entries) {
      dict = entries;
    }
  }

  visit(sourceFile);
  if (dict == null) {
    throw new Error(`Could not parse locale dictionary from ${filePath}`);
  }
  return dict;
}

async function loadDict(locale: Locale): Promise<Dict> {
  const filePath = localePath(locale);
  return parseLocaleDict(await readFile(filePath, "utf8"), filePath);
}

function fallbackGroup(key: string): string {
  if (key.startsWith("settings.mcp")) return "settings.mcp";
  if (key.startsWith("settings.fetchModels") || key.startsWith("settings.azure")) return "settings.model-discovery";
  if (key.startsWith("settings.cliEnv")) return "settings.cli-env";
  if (key.startsWith("connectors.category")) return "connectors.category";
  if (key.startsWith("connectors.")) return "connectors";
  if (key.startsWith("fileViewer.cloudflare")) return "fileViewer.cloudflare";
  if (key.startsWith("fileViewer.")) return "fileViewer";
  if (key.startsWith("liveArtifact.")) return "liveArtifact";
  if (key.startsWith("gameFiles.")) return "gameFiles";
  if (key.startsWith("gameProjects.")) return "gameProjects";
  if (key.startsWith("gameArtBible.")) return "gameArtBible";
  if (key.startsWith("newproj.")) return "newproj";
  if (key.startsWith("examples.")) return "examples";
  if (key.startsWith("avatar.")) return "avatar";
  if (key.startsWith("settings.")) return "settings";
  return key.split(".")[0] ?? "misc";
}

function summarizeGroups(keys: string[]): Array<{ group: string; count: number }> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    const group = fallbackGroup(key);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group))
    .slice(0, 5);
}

function formatTopGroups(groups: Array<{ group: string; count: number }>): string {
  return groups.map(({ group, count }) => `${group}:${count}`).join(", ");
}

async function auditLocale(locale: Locale): Promise<LocaleFallbackAudit> {
  const en = await enDict;
  const localeOverrides = await loadDict(locale);
  const unreviewedFallbackKeys = Object.keys(en).filter(
    (key) => (Object.hasOwn(localeOverrides, key) ? localeOverrides[key] : en[key]) === en[key] && !technicalFallbackAllowlist.test(key),
  );
  const mixedEnglishPhraseKeys = Object.keys(localeOverrides).filter(
    (key) => !technicalFallbackAllowlist.test(key) && mixedEnglishPhrasePattern.test(localeOverrides[key] ?? ""),
  );

  return {
    locale,
    unreviewedExactEnglishValues: unreviewedFallbackKeys.length,
    mixedEnglishPhraseValues: mixedEnglishPhraseKeys.length,
    topGroups: summarizeGroups(unreviewedFallbackKeys),
    mixedEnglishTopGroups: summarizeGroups(mixedEnglishPhraseKeys),
  };
}

const enDict = loadDict("en");
const audits = await Promise.all(LOCALES.filter((locale) => locale !== "en").map(auditLocale));
const total = audits.reduce((sum, audit) => sum + audit.unreviewedExactEnglishValues, 0);
const totalMixedEnglishPhrases = audits.reduce((sum, audit) => sum + audit.mixedEnglishPhraseValues, 0);
const forceFailureForTest = process.env.AGDS_I18N_FALLBACK_AUDIT_FORCE_FAILURE_FOR_TEST === "1";
const totalForExit = total + totalMixedEnglishPhrases + (forceFailureForTest ? 1 : 0);

console.log("# Locale Fallback Audit");
console.log("");
console.log(
  "Game-design transformation gate: exact English values and scoped English phrase fragments outside the conservative technical/proper-noun allowlist are treated as unreviewed locale fallbacks.",
);
console.log("");
console.log("| Locale | Unreviewed exact English values | Mixed English phrase values | Largest groups |");
console.log("|---|---:|---:|---|");
for (const audit of audits) {
  console.log(
    `| ${audit.locale} | ${audit.unreviewedExactEnglishValues} | ${audit.mixedEnglishPhraseValues} | exact ${formatTopGroups(audit.topGroups)}; mixed ${formatTopGroups(audit.mixedEnglishTopGroups)} |`,
  );
}
console.log("");
console.log(`Total unreviewed exact English values: ${total}`);
console.log(`Total mixed English phrase values: ${totalMixedEnglishPhrases}`);

if (forceFailureForTest) {
  console.error("");
  console.error("Forced locale fallback audit failure enabled for regression testing.");
}

if (totalForExit > 0) {
  console.error("");
  console.error("Locale fallback audit failed: localize these values or add a narrow technical/proper-noun allowlist entry.");
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Locale fallback audit passed: no unreviewed exact English fallbacks or scoped mixed-English phrase values remain.");
}
