import { describe, expect, it } from 'vitest';

import {
  mediaStubsAllowed,
  resolveGrokVideoMaxPollMs,
  resolveVolcengineVideoMaxPollMs,
} from '../src/media.js';

describe('media runtime environment controls', () => {
  it('allows stubs only through AGDS_MEDIA_ALLOW_STUBS', () => {
    expect(mediaStubsAllowed({ AGDS_MEDIA_ALLOW_STUBS: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(mediaStubsAllowed({ AGDS_MEDIA_ALLOW_STUBS: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(mediaStubsAllowed({ OD_MEDIA_ALLOW_STUBS: '1' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('resolves Volcengine video polling through AGDS only', () => {
    expect(resolveVolcengineVideoMaxPollMs({
      AGDS_VOLCENGINE_VIDEO_MAX_POLL_MS: '120000',
      OD_VOLCENGINE_VIDEO_MAX_POLL_MS: '600000',
    } as NodeJS.ProcessEnv)).toBe(120_000);
    expect(resolveVolcengineVideoMaxPollMs({
      OD_VOLCENGINE_VIDEO_MAX_POLL_MS: '600000',
    } as NodeJS.ProcessEnv)).toBe(12 * 60 * 1000);
  });

  it('resolves Grok video polling through AGDS only', () => {
    expect(resolveGrokVideoMaxPollMs({
      AGDS_GROK_VIDEO_MAX_POLL_MS: '180000',
      OD_GROK_VIDEO_MAX_POLL_MS: '600000',
    } as NodeJS.ProcessEnv)).toBe(180_000);
    expect(resolveGrokVideoMaxPollMs({
      OD_GROK_VIDEO_MAX_POLL_MS: '600000',
    } as NodeJS.ProcessEnv)).toBe(8 * 60 * 1000);
  });
});
