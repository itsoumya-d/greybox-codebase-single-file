import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

describe('locale fallback audit script', () => {
  it('reports exact and mixed-English locale fallback counts', () => {
    const result = spawnSync(tsxBin, ['./scripts/i18n-fallback-audit.ts'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Unreviewed exact English values');
    expect(result.stdout).toContain('Mixed English phrase values');
    expect(result.stdout).toContain('Total mixed English phrase values: 0');
  });

  it('fails when an unreviewed exact-English fallback is detected', () => {
    const result = spawnSync(tsxBin, ['./scripts/i18n-fallback-audit.ts'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        AGDS_I18N_FALLBACK_AUDIT_FORCE_FAILURE_FOR_TEST: '1',
      },
      timeout: 30_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Forced locale fallback audit failure enabled for regression testing.');
    expect(result.stderr).toContain('Locale fallback audit failed');
  });
});
