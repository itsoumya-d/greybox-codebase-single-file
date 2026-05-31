import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const craftRoot = path.join(repoRoot, 'craft');

const craftBodyQualityGates = [
  {
    name: 'game design identity',
    pattern:
      /\b(game|player|gameplay|playable|HUD|combat|level|encounter|quest|world|camera|animation|VFX|audio|progression|economy|multiplayer|boss|survival|stealth|traversal|vehicle|touch|controller|accessibility|lore|narrative)\b/i,
  },
  {
    name: 'production reasoning',
    pattern:
      /\b(accessibility|readability|performance|budget|scope|production|playtest|telemetry|constraint|QA|testing|platform|responsive|risk|ethical|failure|counterplay|balance|comfort)\b/i,
  },
  {
    name: 'actionable structure',
    pattern:
      /\b(What To Produce|Checklist|Anti-Patterns|Rules|Guidelines|Do|Avoid|Examples|When To Use|What Good Looks Like|Output|Validation)\b/i,
  },
] as const;

const legacyCraftBodyPattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM|UI\/UX|user flows?|mobile app|web app|screen generator|site builder|app builder)\b/i;

function listCraftGuideFiles(): string[] {
  return readdirSync(craftRoot)
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => path.join(craftRoot, file))
    .filter((file) => statSync(file).isFile())
    .sort();
}

describe('craft guide corpus', () => {
  it('keeps every craft guide game-native, production-aware, and actionable', () => {
    const failures: Array<{ file: string; issues: string[] }> = [];
    const files = listCraftGuideFiles();

    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      const issues: string[] = [];

      if (body.length < 900) {
        issues.push(`too short: ${body.length} characters`);
      }
      if ((body.match(/^##\s+/gm) ?? []).length < 2) {
        issues.push('fewer than two h2 sections');
      }
      if (legacyCraftBodyPattern.test(body)) {
        issues.push('contains legacy non-game builder design language');
      }
      for (const gate of craftBodyQualityGates) {
        if (!gate.pattern.test(body)) {
          issues.push(`missing ${gate.name}`);
        }
      }

      if (issues.length > 0) failures.push({ file, issues });
    }

    expect(files.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
