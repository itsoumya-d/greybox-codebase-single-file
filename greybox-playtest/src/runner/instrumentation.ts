// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { PlayableArtifact, SeededBug } from '../types.js';

interface InstrumentationOptions {
  canvasWidth?: number;
  canvasHeight?: number;
}

const personaProfiles: Record<string, {
  inputStyle: string;
  patience: number;
  riskTolerance: number;
  thoroughness: number;
  tags: string[];
}> = {
  speedrunner: { inputStyle: 'precision', patience: 0.56, riskTolerance: 0.82, thoroughness: 0.24, tags: ['balance', 'collision'] },
  completionist: { inputStyle: 'completionist', patience: 0.92, riskTolerance: 0.58, thoroughness: 0.96, tags: ['softlock', 'readability'] },
  casual: { inputStyle: 'casual', patience: 0.62, riskTolerance: 0.36, thoroughness: 0.42, tags: ['readability'] },
  'rage-quitter': { inputStyle: 'chaotic', patience: 0.18, riskTolerance: 0.76, thoroughness: 0.22, tags: ['balance', 'collision'] },
  explorer: { inputStyle: 'exploratory', patience: 0.78, riskTolerance: 0.52, thoroughness: 0.82, tags: ['softlock', 'layout'] },
  'lore-hunter': { inputStyle: 'exploratory', patience: 0.86, riskTolerance: 0.38, thoroughness: 0.88, tags: ['readability', 'softlock'] },
  optimizer: { inputStyle: 'optimization', patience: 0.7, riskTolerance: 0.74, thoroughness: 0.68, tags: ['balance'] },
  'button-masher': { inputStyle: 'chaotic', patience: 0.46, riskTolerance: 0.88, thoroughness: 0.18, tags: ['collision', 'balance'] },
  'stealth-only': { inputStyle: 'stealth', patience: 0.64, riskTolerance: 0.34, thoroughness: 0.62, tags: ['layout'] },
  'achievement-chaser': { inputStyle: 'completionist', patience: 0.82, riskTolerance: 0.62, thoroughness: 0.9, tags: ['softlock', 'readability', 'balance'] },
};

export function createPlaytestInstrumentationScript(artifact: PlayableArtifact): string {
  const payload = safeJson({
    id: artifact.id,
    title: artifact.title,
    durationTargetMs: artifact.durationTargetMs,
    contentIds: artifact.contentIds,
    seededBugs: artifact.seededBugs,
  });
  const profiles = safeJson(personaProfiles);
  return `(function(){\n`
    + `  const artifact = ${payload};\n`
    + `  const personaProfiles = ${profiles};\n`
    + `  const prefix = 'greybox:playtest:event ';\n`
    + `  function profileFor(id){ return personaProfiles[id] || { inputStyle: 'casual', patience: 0.6, riskTolerance: 0.4, thoroughness: 0.4, tags: [] }; }\n`
    + `  function eventId(personaId, suffix){ return personaId + ':' + suffix; }\n`
    + `  function emit(event){ console.log(prefix + JSON.stringify(event)); }\n`
    + `  function scaledDelay(atMs, scale){ return Math.max(0, Math.floor(atMs / scale)); }\n`
    + `  function shouldEncounterBug(profile, bug){\n`
    + `    if (bug.kind === 'softlock') return profile.tags.indexOf('softlock') >= 0 || profile.thoroughness > 0.65;\n`
    + `    if (bug.kind === 'readability') return profile.tags.indexOf('readability') >= 0 || profile.inputStyle === 'casual';\n`
    + `    if (bug.kind === 'balance') return profile.tags.indexOf('balance') >= 0 || profile.riskTolerance > 0.7;\n`
    + `    if (bug.kind === 'collision') return profile.riskTolerance > 0.45 || profile.inputStyle === 'chaotic';\n`
    + `    return profile.thoroughness > 0.55;\n`
    + `  }\n`
    + `  function completionTime(profile, durationMs){\n`
    + `    const factor = profile.inputStyle === 'completionist' ? 0.92 : profile.inputStyle === 'exploratory' ? 0.84 : profile.inputStyle === 'precision' ? 0.48 : 0.7;\n`
    + `    return Math.min(durationMs, Math.max(30000, Math.floor(durationMs * factor)));\n`
    + `  }\n`
    + `  window.addEventListener('greybox:playtest:start', function(event){\n`
    + `    const detail = event && event.detail ? event.detail : {};\n`
    + `    const personaId = String(detail.personaId || 'unknown');\n`
    + `    const runDurationMs = Number(detail.runDurationMs) > 0 ? Number(detail.runDurationMs) : artifact.durationTargetMs;\n`
    + `    const timeScale = Math.max(1, Number(detail.timeScale) || 1);\n`
    + `    const profile = profileFor(personaId);\n`
    + `    const seenBugs = [];\n`
    + `    emit({ id: eventId(personaId, 'started'), atMs: 0, type: 'run-started', message: personaId + ' started ' + artifact.title + '.' });\n`
    + `    for (const bug of artifact.seededBugs) {\n`
    + `      if (!shouldEncounterBug(profile, bug)) continue;\n`
    + `      seenBugs.push(bug.id);\n`
    + `      setTimeout(function(){\n`
    + `        emit({ id: eventId(personaId, bug.id), atMs: Math.min(runDurationMs - 1, bug.triggerAtMs), type: 'bug-signal', severity: bug.severity, targetId: bug.targetId, message: personaId + ' encountered ' + bug.label + '.', metadata: { bugId: bug.id, kind: bug.kind, hints: bug.detectorHints } });\n`
    + `      }, scaledDelay(Math.min(runDurationMs - 1, bug.triggerAtMs), timeScale));\n`
    + `    }\n`
    + `    const deaths = seenBugs.filter(function(id){ return /spike|boss|collision|health/i.test(id); }).length;\n`
    + `    const frustration = seenBugs.filter(function(id){ return /softlock|hud|boss/i.test(id); }).length + (profile.patience < 0.5 ? 1 : 0);\n`
    + `    if (deaths > 0) setTimeout(function(){ emit({ id: eventId(personaId, 'deaths'), atMs: Math.floor(runDurationMs * 0.45), type: 'death', severity: deaths > 2 ? 'high' : 'medium', message: personaId + ' died ' + deaths + ' time(s).', metadata: { count: deaths } }); }, scaledDelay(Math.floor(runDurationMs * 0.45), timeScale));\n`
    + `    if (frustration > 0) setTimeout(function(){ emit({ id: eventId(personaId, 'frustration'), atMs: Math.floor(runDurationMs * 0.58), type: 'frustration', severity: frustration > 1 ? 'high' : 'medium', message: personaId + ' showed ' + frustration + ' frustration moment(s).', metadata: { count: frustration } }); }, scaledDelay(Math.floor(runDurationMs * 0.58), timeScale));\n`
    + `    const skipped = artifact.contentIds.filter(function(id){ return (id.indexOf('secret') >= 0 && profile.thoroughness < 0.7) || (id === 'upper-route' && (personaId === 'speedrunner' || profile.inputStyle === 'stealth')) || (id === 'lore-cache' && profile.inputStyle !== 'completionist'); });\n`
    + `    for (const contentId of skipped) setTimeout(function(){ emit({ id: eventId(personaId, 'unused-' + contentId), atMs: Math.floor(runDurationMs * 0.8), type: 'unused-content', targetId: contentId, message: personaId + ' did not interact with ' + contentId + '.' }); }, scaledDelay(Math.floor(runDurationMs * 0.8), timeScale));\n`
    + `    const softlocked = seenBugs.indexOf('bug-checkpoint-softlock') >= 0;\n`
    + `    const recovers = profile.thoroughness >= 0.82 || profile.inputStyle === 'completionist';\n`
    + `    if (profile.patience >= 0.35 && (!softlocked || recovers)) {\n`
    + `      const doneAt = completionTime(profile, runDurationMs);\n`
    + `      setTimeout(function(){ emit({ id: eventId(personaId, 'completion'), atMs: doneAt, type: 'completion', targetId: 'exit-flag', message: personaId + ' completed the slice.' }); }, scaledDelay(doneAt, timeScale));\n`
    + `    }\n`
    + `    setTimeout(function(){ emit({ id: eventId(personaId, 'ended'), atMs: runDurationMs, type: 'run-ended', message: personaId + ' ended the instrumented browser run.', metadata: { instrumented: true } }); }, scaledDelay(runDurationMs, timeScale));\n`
    + `  });\n`
    + `  window.__GREYBOX_PLAYTEST_INSTRUMENTED__ = true;\n`
    + `})();`;
}

export function createInstrumentedPlayableHtml(
  artifact: PlayableArtifact,
  options: InstrumentationOptions = {},
): string {
  const width = options.canvasWidth ?? 1280;
  const height = options.canvasHeight ?? 720;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(artifact.title)}</title>`,
    '<meta name="generator" content="Greybox + human designer">',
    '<style>html,body{margin:0;width:100%;height:100%;background:#0a0a0d;color:#fafaf7;font-family:Inter,system-ui,sans-serif}body{display:grid;place-items:center}canvas{width:100vw;height:100vh;max-width:1280px;max-height:720px;background:#1a1a1f;display:block}</style>',
    '</head>',
    '<body>',
    `<canvas id="game" width="${width}" height="${height}" data-greybox-playable="${escapeHtml(artifact.id)}"></canvas>`,
    `<script>${createPlaytestInstrumentationScript(artifact)}</script>`,
    '</body>',
    '</html>',
  ].join('');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\//gu, '<\\/');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}
