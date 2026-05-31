import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  SKILL_ID_ALIASES,
  findSkillById,
  listSkills,
  resolveSkillId,
} from '../src/skills.js';

// Regression coverage for the retired skill-id redirect surface. The game
// studio now accepts only game-native skill ids; removed app/web/business ids
// must fail closed instead of silently becoming generation modes again.

let skillsRoot: string;

beforeAll(async () => {
  skillsRoot = await mkdtemp(path.join(tmpdir(), 'agds-skills-aliases-'));

  await mkdir(path.join(skillsRoot, 'playable-game-prototype'), { recursive: true });
  await writeFile(
    path.join(skillsRoot, 'playable-game-prototype', 'SKILL.md'),
    '---\nname: playable-game-prototype\ndescription: Playable game.\n---\n\nbody\n',
    'utf8',
  );

  await mkdir(path.join(skillsRoot, 'mobile-game-flow'), { recursive: true });
  await writeFile(
    path.join(skillsRoot, 'mobile-game-flow', 'SKILL.md'),
    '---\nname: mobile-game-flow\ndescription: Mobile game.\n---\n\nbody\n',
    'utf8',
  );

  await mkdir(path.join(skillsRoot, 'game-pitch-deck'), { recursive: true });
  await writeFile(
    path.join(skillsRoot, 'game-pitch-deck', 'SKILL.md'),
    '---\nname: game-pitch-deck\ndescription: Game deck.\n---\n\nbody\n',
    'utf8',
  );
});

afterAll(async () => {
  if (skillsRoot) await rm(skillsRoot, { recursive: true, force: true });
});

describe('SKILL_ID_ALIASES', () => {
  it('keeps retired skill-id redirects empty', () => {
    expect(Object.keys(SKILL_ID_ALIASES)).toEqual([]);
    expect(Object.isFrozen(SKILL_ID_ALIASES)).toBe(true);
  });
});

describe('resolveSkillId', () => {
  it('passes current game-native ids through unchanged', () => {
    expect(resolveSkillId('playable-game-prototype')).toBe('playable-game-prototype');
    expect(resolveSkillId('mobile-game-flow')).toBe('mobile-game-flow');
    expect(resolveSkillId('game-pitch-deck')).toBe('game-pitch-deck');
  });

  it('does not translate retired app, web, or business ids', () => {
    for (const retiredId of [
      'web-prototype',
      'mobile-app',
      'saas-landing',
      'dashboard',
      'dcf-valuation',
      'simple-deck',
    ]) {
      expect(resolveSkillId(retiredId)).toBe(retiredId);
    }
  });

  it('returns the input unchanged for empty / non-string ids', () => {
    expect(resolveSkillId('')).toBe('');
    expect(resolveSkillId(undefined)).toBeUndefined();
    expect(resolveSkillId(null)).toBeNull();
  });
});

describe('findSkillById', () => {
  it('resolves current ids exactly', async () => {
    const skills = await listSkills(skillsRoot);
    expect(findSkillById(skills, 'playable-game-prototype')?.id).toBe(
      'playable-game-prototype',
    );
    expect(findSkillById(skills, 'mobile-game-flow')?.id).toBe('mobile-game-flow');
    expect(findSkillById(skills, 'game-pitch-deck')?.id).toBe('game-pitch-deck');
  });

  it('returns undefined for retired ids, unknown ids, and missing inputs', async () => {
    const skills = await listSkills(skillsRoot);
    expect(findSkillById(skills, 'web-prototype')).toBeUndefined();
    expect(findSkillById(skills, 'mobile-app')).toBeUndefined();
    expect(findSkillById(skills, 'simple-deck')).toBeUndefined();
    expect(findSkillById(skills, 'definitely-not-a-skill')).toBeUndefined();
    expect(findSkillById(skills, '')).toBeUndefined();
    expect(findSkillById(null, 'playable-game-prototype')).toBeUndefined();
  });
});
