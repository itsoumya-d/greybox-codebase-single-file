import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const activePublicDocs = [
  'README.md',
  'QUICKSTART.md',
  'CONTRIBUTING.md',
  'TRANSLATIONS.md',
  'docs/spec.md',
  'docs/roadmap.md',
  'docs/references.md',
  'docs/architecture.md',
  'docs/game-art-bibles.md',
  'docs/skills-contributing.md',
  'docs/skills-protocol.md',
  'docs/modes.md',
  'docs/agent-adapters.md',
  'docs/code-review-guidelines.md',
  'deploy/README.md',
  'apps/packaged/README.md',
  'tools/pack/README.md',
] as const;

const publicDocQualityGates = [
  {
    name: 'studio/game-design identity',
    pattern:
      /\b(AI Game Design Studio|AGDS|game[- ]studio|game design|game production|gameplay|game art bible|playable|player|creator|studio)\b/i,
  },
  {
    name: 'actionable structure',
    pattern:
      /\b(quickstart|install|run|build|test|verify|validation|checklist|workflow|steps|usage|command|configuration|contract|schema|policy|guidelines|requirements|how to|contributing|roadmap|architecture|protocol|review)\b/i,
  },
  {
    name: 'implementation evidence',
    pattern:
      /\b(pnpm|agds|AGDS_|\/api\/|TypeScript|Vitest|Playwright|MCP|SQLite|schema|test|guard|daemon|web|desktop|package|CLI|command|environment|route|component|provider|contract|artifact|template|skill)\b/i,
  },
] as const;

const legacyPublicDocPattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM|UI\/UX|user flows?|mobile app|web app|screen generator|site builder|app builder|design systems?)\b/i;

const explicitLegacyContextPattern =
  /\b(legacy|deprecated|compat|migration|alias|retired|old|historical|forbidden|reject|block|negative|do not|avoid|former|compatibility)\b/i;

function unexpectedLegacyLines(body: string): Array<{ line: number; text: string }> {
  return body
    .split(/\n/)
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => legacyPublicDocPattern.test(text))
    .filter(({ text }) => !explicitLegacyContextPattern.test(text));
}

describe('active public documentation', () => {
  it('keeps English product docs substantial, game-native, and operationally useful', () => {
    const failures: Array<{ file: string; issues: string[] }> = [];

    for (const file of activePublicDocs) {
      const body = readFileSync(path.join(repoRoot, file), 'utf8');
      const issues: string[] = [];

      if (body.trim().length < 700) {
        issues.push(`too short: ${body.trim().length} characters`);
      }
      if ((body.match(/^##\s+/gm) ?? []).length < 2) {
        issues.push('fewer than two h2 sections');
      }
      for (const gate of publicDocQualityGates) {
        if (!gate.pattern.test(body)) {
          issues.push(`missing ${gate.name}`);
        }
      }
      const legacyLines = unexpectedLegacyLines(body);
      if (legacyLines.length > 0) {
        issues.push(
          `unexpected legacy language on lines ${legacyLines
            .slice(0, 5)
            .map((entry) => entry.line)
            .join(', ')}`,
        );
      }

      if (issues.length > 0) failures.push({ file, issues });
    }

    expect(activePublicDocs.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
