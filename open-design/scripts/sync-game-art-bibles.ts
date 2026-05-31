#!/usr/bin/env node
// Canonical entrypoint for verifying the curated built-in game art bible
// catalog. It no longer imports non-game source packages.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ART_BIBLE_ROOT = path.join(ROOT, 'game-art-bibles');

const REQUIRED_GAME_ART_BIBLE_IDS = [
  'anime-gacha',
  'arcade-neon',
  'cozy-casual',
  'cyberpunk-fps',
  'fantasy-rpg',
  'game-control-center',
  'horror-survival',
  'military-tactical',
  'pixel-retro',
  'sci-fi-tactical',
  'soulslike-dark',
  'sports-broadcast',
  'steampunk-adventure',
  'stylized-3d',
  'underwater-exploration',
  'vaporwave-racing',
  'western-frontier',
] as const;

const REQUIRED_GAME_SIGNALS = [
  /\bgame\b/i,
  /\bplayers?\b/i,
  /\b(gameplay|hud|level|world|combat|quest|loot|biome)\b/i,
  /\b(readability|accessibility|production|controller|touch|keyboard)\b/i,
] as const;

function main(): void {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length > 0) {
    console.error(
      'sync-game-art-bibles verifies the curated in-repo catalog and no longer imports external source packages.',
    );
    console.error('Add a game-native DESIGN.md under game-art-bibles/<id>/, then rerun without arguments.');
    process.exit(1);
  }

  const failures: string[] = [];
  for (const id of REQUIRED_GAME_ART_BIBLE_IDS) {
    const file = path.join(ART_BIBLE_ROOT, id, 'DESIGN.md');
    if (!existsSync(file)) {
      failures.push(`${id}: missing DESIGN.md`);
      continue;
    }
    const raw = readFileSync(file, 'utf8');
    for (const pattern of REQUIRED_GAME_SIGNALS) {
      if (!pattern.test(raw)) {
        failures.push(`${id}: missing required game-studio signal ${pattern}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Game art bible catalog verification failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`verified ${REQUIRED_GAME_ART_BIBLE_IDS.length} curated game art bibles`);
}

main();
