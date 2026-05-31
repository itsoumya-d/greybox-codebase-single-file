import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const skillsRoot = path.join(repoRoot, 'skills');

const sampleArtifactQualityGates = [
  {
    name: 'game identity',
    pattern:
      /\b(game|gameplay|player|playable|HUD|combat|level|encounter|quest|world|camera|animation|VFX|audio|progression|economy|multiplayer|boss|survival|stealth|traversal|vehicle|touch|controller|accessibility|lore|narrative|studio|playtest|live ops|season|balance|sprite)\b/i,
  },
  {
    name: 'interactive or artifact surface',
    pattern:
      /\b(button|canvas|panel|overlay|score|metric|timeline|control|state|status|preview|artifact|stage|scene|board|track|card|grid|meter|bar|chart|animation|keyframe|sequence|feedback|comment|marker)\b/i,
  },
  {
    name: 'production readability',
    pattern:
      /\b(accessibility|readability|performance|scope|production|playtest|telemetry|constraint|QA|testing|responsive|risk|balance|clarity|review|prototype|keyboard|touch|mobile|reduced motion|contrast)\b/i,
  },
] as const;

const legacySampleArtifactPattern =
  /\b(SaaS|pricing cards?|admin panels?|e-commerce|customer journey|landing page|website builder|app designer|dashboard generator|CRM|UI\/UX|user flows?|mobile app|web app|screen generator|site builder|app builder|stock dashboard|crypto|portfolio|invoice|sales|customer|signup|login)\b/i;

function listSkillSampleArtifacts(root = skillsRoot): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSkillSampleArtifacts(absolute));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;

    const relative = path.relative(skillsRoot, absolute);
    if (entry.name === 'example.html' || relative.includes(`${path.sep}examples${path.sep}`)) {
      out.push(absolute);
    }
  }

  return out.sort();
}

function bodyTextForChecks(source: string): string {
  return source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

describe('skill sample artifacts', () => {
  it('keeps shipped HTML examples game-native and production-readable', () => {
    const files = listSkillSampleArtifacts();
    const failures: Array<{ file: string; issues: string[] }> = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const text = bodyTextForChecks(source);
      const issues: string[] = [];

      if (source.length < 1000) {
        issues.push(`too short: ${source.length} characters`);
      }
      if (legacySampleArtifactPattern.test(text)) {
        issues.push('contains legacy non-game builder sample language');
      }
      for (const gate of sampleArtifactQualityGates) {
        if (!gate.pattern.test(text)) {
          issues.push(`missing ${gate.name}`);
        }
      }

      if (issues.length > 0) {
        failures.push({ file: path.relative(repoRoot, file), issues });
      }
    }

    expect(files.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
