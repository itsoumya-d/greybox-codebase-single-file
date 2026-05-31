import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const specDocRoots = ['specs', 'docs/plans', 'docs/rfc-drafts'] as const;

const specDocQualityGates = [
  {
    name: 'studio/game-design identity',
    pattern:
      /\b(AI Game Design Studio|AGDS|game[- ]studio|game design|game production|gameplay|game art bible|playable|player|creator|studio|game files|game artifact|game deliverable|game memory)\b/i,
  },
  {
    name: 'actionable planning structure',
    pattern:
      /\b(spec|plan|requirements|roadmap|implementation|architecture|contract|schema|route|test|verification|validation|checklist|workflow|migration|rollout|acceptance|risk|guard|command|API)\b/i,
  },
  {
    name: 'implementation evidence',
    pattern:
      /\b(pnpm|agds|AGDS_|\/api\/|TypeScript|Vitest|Playwright|MCP|SQLite|schema|test|guard|daemon|web|desktop|package|CLI|command|environment|route|component|provider|contract|artifact|template|skill|SSE|JSON)\b/i,
  },
] as const;

const legacySpecDocPattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM|UI\/UX|user flows?|mobile app|web app|screen generator|site builder|app builder|design systems?|Open Design|Claude Design|Nexu)\b/i;

const explicitLegacySpecContextPattern =
  /\b(legacy|deprecated|compat|migration|alias|retired|old|historical|forbidden|reject|block|negative|do not|avoid|former|compatibility|instead|not\s+a|not\s+the)\b/i;

const retiredImplementationNamePattern =
  /\b(DesignsTab|DesignFilesPanel|DesignSpecView|DesignSystemPreviewModal|DesignSystemsTab|FinalizeDesignButton|useDesignMdState|useFinalizeProject)\b/;

function listMarkdownFiles(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const absolute = path.join(absoluteRoot, entry.name);
    const relative = path.relative(repoRoot, absolute);

    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(relative));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(relative);
    }
  }

  return files.sort();
}

function unexpectedLegacySpecLines(body: string): Array<{ line: number; text: string }> {
  return body
    .split(/\n/)
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => legacySpecDocPattern.test(text))
    .filter(({ text }) => !explicitLegacySpecContextPattern.test(text));
}

function retiredImplementationNameLines(body: string): Array<{ line: number; text: string }> {
  return body
    .split(/\n/)
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => retiredImplementationNamePattern.test(text));
}

describe('spec and planning documentation', () => {
  it('keeps internal specs game-studio native and verification-oriented', () => {
    const files = specDocRoots.flatMap((root) => listMarkdownFiles(root)).sort();
    const failures: Array<{ file: string; issues: string[] }> = [];

    for (const file of files) {
      const body = readFileSync(path.join(repoRoot, file), 'utf8');
      const issues: string[] = [];

      if (body.trim().length < 500) {
        issues.push(`too short: ${body.trim().length} characters`);
      }
      if ((body.match(/^##\s+/gm) ?? []).length < 1) {
        issues.push('missing h2 planning section');
      }
      for (const gate of specDocQualityGates) {
        if (!gate.pattern.test(body)) {
          issues.push(`missing ${gate.name}`);
        }
      }
      const legacyLines = unexpectedLegacySpecLines(body);
      if (legacyLines.length > 0) {
        issues.push(
          `unexpected legacy language on lines ${legacyLines
            .slice(0, 5)
            .map((entry) => entry.line)
            .join(', ')}`,
        );
      }
      const retiredNames = retiredImplementationNameLines(body);
      if (retiredNames.length > 0) {
        issues.push(
          `retired implementation names on lines ${retiredNames
            .slice(0, 5)
            .map((entry) => entry.line)
            .join(', ')}`,
        );
      }

      if (issues.length > 0) failures.push({ file, issues });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
