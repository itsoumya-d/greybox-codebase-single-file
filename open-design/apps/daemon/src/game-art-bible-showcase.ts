/**
 * Render a game art bible in motion: color, type, surfaces, HUD rhythm,
 * encounter pacing, and production checks pulled from a DESIGN.md source.
 *
 * This preview is intentionally game-native. It demonstrates how a game
 * systems framework behaves inside a vertical-slice planning surface, not a
 * generic business shell.
 */

type ColorToken = { name: string; value: string; role: string };
type FontHints = { display?: string; heading?: string; body?: string; mono?: string };
type RowStatus = 'ready' | '';

export function renderGameArtBibleShowcase(id: string, raw: string): string {
  const titleMatch = /^#\s+(.+?)\s*$/m.exec(raw);
  const rawTitle = titleMatch?.[1] ?? id;
  const title = cleanTitle(rawTitle);
  const subtitle =
    extractSubtitle(raw) || 'A game art bible rendered as a playable-world planning surface.';
  const colors = extractColors(raw);
  const fonts = extractFonts(raw);

  const bg =
    pickColor(colors, ['primary background', 'background', 'canvas', 'void', 'night', 'world'])
    ?? firstLightish(colors)
    ?? '#101216';
  const fg =
    pickColor(
      colors,
      ['primary text', 'body text', 'foreground', 'ink primary', 'heading', 'ink', 'graphite'],
      [bg],
    )
    ?? pickReadableForeground(bg)
    ?? '#f6f1e8';
  const accent =
    pickColor(colors, [
      'rarity',
      'combat',
      'danger',
      'game identity primary',
      'identity primary',
      'faction primary',
      'highlight',
      'focus',
    ])
    ?? firstNonNeutral(colors, [bg, fg])
    ?? '#ffb000';
  const accent2 =
    pickColor(colors, ['biome', 'faction', 'healing', 'support identity', 'magic', 'energy'])
    ?? secondNonNeutral(colors, [accent, bg, fg])
    ?? '#43d9ad';
  const muted =
    pickColor(colors, ['secondary text', 'caption', 'metadata', 'muted', 'subtle'])
    ?? '#9aa0a6';
  const border =
    pickColor(colors, ['border', 'divider', 'hairline', 'rule', 'stroke'])
    ?? '#2b3138';
  const surface =
    pickColor(colors, ['secondary surface', 'surface subtle', 'surface', 'panel', 'elevated'])
    ?? mixSurface(bg);

  const display =
    fonts.display ?? fonts.heading ?? "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const body = fonts.body ?? display;
  const mono = fonts.mono ?? "ui-monospace, 'JetBrains Mono', monospace";

  const accentFg = pickReadableForeground(accent);
  const accent2Fg = pickReadableForeground(accent2);
  const gameName = title;
  const tagline = oneLine(subtitle).slice(0, 150);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(gameName)} - game art bible</title>
  <style>
    :root {
      --bg: ${bg};
      --fg: ${fg};
      --accent: ${accent};
      --accent-fg: ${accentFg};
      --accent-2: ${accent2};
      --accent-2-fg: ${accent2Fg};
      --muted: ${muted};
      --border: ${border};
      --surface: ${surface};
      --display: ${display};
      --body: ${body};
      --mono: ${mono};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background:
        radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 26rem),
        linear-gradient(180deg, color-mix(in srgb, var(--surface) 48%, var(--bg)), var(--bg));
      color: var(--fg);
      font-family: var(--body);
      line-height: 1.55;
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .container { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
    .topbar {
      position: sticky; top: 0; z-index: 30;
      background: color-mix(in srgb, var(--bg) 82%, transparent);
      backdrop-filter: saturate(160%) blur(14px);
      border-bottom: 1px solid var(--border);
    }
    .topbar-row {
      display: flex; align-items: center; gap: 28px;
      min-height: 64px;
    }
    .game-mark {
      width: 28px; height: 28px; border-radius: 7px;
      background: conic-gradient(from 20deg, var(--accent), var(--accent-2), var(--accent));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 16%, transparent);
    }
    .game-identity {
      display: flex; align-items: center; gap: 10px;
      font-family: var(--display); font-weight: 700; font-size: 17px;
    }
    .nav-links { display: flex; gap: 20px; font-size: 13.5px; color: var(--muted); }
    .nav-links a:hover { color: var(--fg); }
    .spacer { flex: 1; }
    .chip {
      display: inline-flex; align-items: center; gap: 7px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 11px;
      color: var(--muted);
      background: color-mix(in srgb, var(--surface) 88%, transparent);
      font-size: 12px;
      font-family: var(--mono);
    }
    .chip.ready { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 38%, var(--border)); }
    .primary-action {
      display: inline-flex; align-items: center; gap: 8px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--accent-fg);
      padding: 9px 14px;
      font-size: 13px;
      font-weight: 700;
    }
    .hero { padding: 88px 0 54px; }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-family: var(--mono); font-size: 12px; color: var(--accent);
      text-transform: uppercase; letter-spacing: 0.08em;
      margin-bottom: 22px;
    }
    .eyebrow span { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    h1, h2, h3, h4, h5 { font-family: var(--display); letter-spacing: 0; }
    .hero h1 {
      font-size: clamp(42px, 6.5vw, 82px);
      line-height: 1.02;
      margin: 0 0 22px;
      max-width: 18ch;
      font-weight: 760;
    }
    .hero h1 em {
      font-style: normal;
      color: var(--accent);
      text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .lede {
      color: var(--muted);
      font-size: 19px;
      max-width: 62ch;
      margin: 0 0 32px;
    }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn {
      border-radius: 9px;
      border: 1px solid var(--border);
      padding: 12px 18px;
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 14px;
      font-weight: 700;
      background: color-mix(in srgb, var(--surface) 82%, transparent);
    }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
    .btn.secondary { color: var(--fg); }
    .hero-meta {
      display: grid; gap: 12px;
      grid-template-columns: repeat(4, 1fr);
      margin-top: 44px;
    }
    @media (max-width: 780px) { .hero-meta { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 520px) { .hero-meta { grid-template-columns: 1fr; } }
    .metric {
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface) 78%, transparent);
      border-radius: 10px;
      padding: 14px 15px;
    }
    .metric .label { color: var(--muted); font-size: 11px; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.07em; }
    .metric .value { font-family: var(--display); font-weight: 760; font-size: 22px; margin-top: 4px; }
    .disciplines {
      padding: 28px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface) 42%, transparent);
    }
    .discipline-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
    @media (max-width: 900px) { .discipline-row { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 560px) { .discipline-row { grid-template-columns: 1fr 1fr; } }
    .discipline {
      border: 1px solid var(--border);
      border-radius: 8px;
      min-height: 78px;
      padding: 13px;
      background: var(--bg);
    }
    .discipline strong { display: block; font-size: 13px; }
    .discipline span { color: var(--muted); font-size: 12px; }
    .section { padding: 84px 0; }
    .section-kicker {
      font-family: var(--mono);
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.09em;
      font-size: 12px;
      margin-bottom: 11px;
    }
    .section-title {
      font-size: clamp(30px, 4vw, 48px);
      line-height: 1.1;
      margin: 0 0 16px;
      max-width: 22ch;
    }
    .section-lede {
      color: var(--muted);
      font-size: 17px;
      max-width: 62ch;
      margin: 0 0 36px;
    }
    .modules { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    @media (max-width: 900px) { .modules { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 600px) { .modules { grid-template-columns: 1fr; } }
    .module {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: color-mix(in srgb, var(--surface) 82%, transparent);
      padding: 22px;
      min-height: 178px;
    }
    .module-icon {
      width: 34px; height: 34px; border-radius: 8px;
      display: inline-flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: var(--accent-fg);
      font-family: var(--mono);
      font-weight: 800;
      margin-bottom: 15px;
    }
    .module h3 { font-size: 18px; margin: 0 0 8px; }
    .module p { color: var(--muted); margin: 0; font-size: 14px; }
    .board-wrap { padding-top: 4px; padding-bottom: 88px; }
    .board-frame {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 13px;
      background: color-mix(in srgb, var(--surface) 80%, transparent);
      box-shadow: 0 28px 80px rgba(0,0,0,0.18);
    }
    .titlebar { display: flex; gap: 6px; padding: 4px 8px 12px; }
    .titlebar span { width: 10px; height: 10px; border-radius: 50%; background: var(--border); }
    .board {
      display: grid; grid-template-columns: 226px 1fr;
      min-height: 460px; overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 11px;
      background: var(--bg);
    }
    @media (max-width: 760px) { .board { grid-template-columns: 1fr; } .nav-links { display: none; } }
    .rail {
      border-right: 1px solid var(--border);
      background: color-mix(in srgb, var(--surface) 72%, var(--bg));
      padding: 17px 13px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    @media (max-width: 760px) { .rail { border-right: none; border-bottom: 1px solid var(--border); } }
    .rail-link {
      border-radius: 8px;
      padding: 8px 10px;
      color: var(--muted);
      font-size: 13px;
      display: flex; align-items: center; gap: 9px;
    }
    .rail-link.active {
      background: var(--bg);
      color: var(--fg);
      box-shadow: inset 0 0 0 1px var(--border);
      font-weight: 700;
    }
    .rail-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .rail-section {
      font-family: var(--mono);
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
      padding: 13px 10px 5px;
    }
    .board-main { padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
    .board-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .board-head h4 { font-size: 22px; margin: 0; }
    .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    @media (max-width: 920px) { .stat-row { grid-template-columns: 1fr 1fr; } }
    .stat {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 9px;
      padding: 13px 14px;
    }
    .stat .label { color: var(--muted); font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .stat .value { font-family: var(--display); font-size: 22px; font-weight: 760; margin-top: 4px; }
    .stat .note { color: var(--accent); font-family: var(--mono); font-size: 11px; margin-top: 2px; }
    .chart-card, .list-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
    }
    .chart-card { padding: 16px; }
    .chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .chart-head .title { font-weight: 700; font-size: 14px; }
    .chart-head .meta { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .chart svg { width: 100%; height: 150px; display: block; }
    .board-lists { display: grid; grid-template-columns: 1.55fr 1fr; gap: 14px; }
    @media (max-width: 860px) { .board-lists { grid-template-columns: 1fr; } }
    .list-head { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 15px; border-bottom: 1px solid var(--border); }
    .list-head h5 { margin: 0; font-size: 14px; }
    .list-row { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 12px 15px; border-top: 1px solid var(--border); align-items: center; }
    .list-row:first-of-type { border-top: none; }
    .list-row .name { font-weight: 700; font-size: 13px; }
    .list-row .meta { color: var(--muted); font-family: var(--mono); font-size: 11px; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      color: var(--muted);
      background: var(--bg);
      font-size: 11px;
      font-weight: 700;
    }
    .badge.ready { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
    .deliverables { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    @media (max-width: 860px) { .deliverables { grid-template-columns: 1fr; } }
    .deliverable {
      border: 1px solid var(--border);
      border-radius: 11px;
      padding: 24px;
      background: color-mix(in srgb, var(--surface) 88%, transparent);
    }
    .deliverable h3 { margin: 0 0 10px; font-size: 20px; }
    .deliverable p { color: var(--muted); margin: 0 0 16px; }
    .deliverable ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 9px; font-size: 14px; }
    .deliverable li::before { content: "OK"; color: var(--accent); font-family: var(--mono); margin-right: 9px; font-size: 11px; }
    .critique-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 760px) { .critique-grid { grid-template-columns: 1fr; } }
    .critique {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 22px;
      background: var(--surface);
    }
    .critique p { margin: 0; color: var(--fg); font-family: var(--display); font-size: 17px; }
    .critique span { display: block; margin-top: 12px; color: var(--muted); font-size: 12px; }
    .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
    @media (max-width: 760px) { .notes { grid-template-columns: 1fr; } }
    .note { border-top: 1px solid var(--border); padding: 17px 0; }
    .note h4 { margin: 0 0 6px; font-size: 16px; }
    .note p { margin: 0; color: var(--muted); font-size: 14px; }
    .callout {
      margin: 42px 0 84px;
      border-radius: 18px;
      padding: 46px;
      display: grid;
      grid-template-columns: 1.35fr auto;
      gap: 26px;
      align-items: center;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      color: var(--accent-fg);
    }
    @media (max-width: 760px) { .callout { grid-template-columns: 1fr; padding: 32px; } }
    .callout h2 { margin: 0 0 10px; font-size: clamp(28px, 4vw, 40px); line-height: 1.1; }
    .callout p { margin: 0; opacity: 0.9; max-width: 54ch; }
    .callout .btn { background: var(--accent-fg); color: var(--accent); border: none; }
    .callout .btn.secondary { background: transparent; color: var(--accent-fg); border: 1px solid color-mix(in srgb, var(--accent-fg) 35%, transparent); }
    footer { border-top: 1px solid var(--border); padding: 34px 0 52px; color: var(--muted); font-size: 13px; }
    .footer-row { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
    code { font-family: var(--mono); }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="container topbar-row">
      <a class="game-identity" href="#"><span class="game-mark"></span>${escapeHtml(gameName)}</a>
      <nav class="nav-links">
        <a href="#pillars">Pillars</a>
        <a href="#board">Vertical Slice</a>
        <a href="#deliverables">Deliverables</a>
        <a href="#critique">Critique</a>
        <a href="#notes">Production</a>
      </nav>
      <div class="spacer"></div>
      <span class="chip ready">Art bible active</span>
      <a class="primary-action" href="#board">Inspect slice</a>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container">
        <div class="eyebrow"><span></span>Game systems framework preview</div>
        <h1><em>${escapeHtml(gameName)}</em> as a complete game direction system.</h1>
        <p class="lede">${escapeHtml(tagline)}</p>
        <div class="hero-actions">
          <a class="btn primary" href="#deliverables">Build GDD package</a>
          <a class="btn secondary" href="#board">Review gameplay board</a>
        </div>
        <div class="hero-meta">
          ${metric('Core pillars', '4 locked')}
          ${metric('HUD states', '12 states')}
          ${metric('World zones', '6 biomes')}
          ${metric('Performance', '60 FPS target')}
        </div>
      </div>
    </section>

    <section class="disciplines">
      <div class="container discipline-row">
        ${discipline('Game Director', 'Vision, pillars')}
        ${discipline('Gameplay', 'Loop, feel')}
        ${discipline('Level Design', 'Flow, sightlines')}
        ${discipline('Narrative', 'Lore, quests')}
        ${discipline('Economy', 'Rewards, pacing')}
        ${discipline('Technical Art', 'Budgets, shaders')}
      </div>
    </section>

    <section class="section" id="pillars">
      <div class="container">
        <div class="section-kicker">Design intelligence</div>
        <h2 class="section-title">The framework protects player experience from concept to playtest.</h2>
        <p class="section-lede">Tokens become game rules: rarity color, combat feedback, readable HUD hierarchy, cinematic mood, accessibility states, and engine-aware production limits.</p>
        <div class="modules">
          ${moduleCard('P1', 'Gameplay pillars', 'Defines the core fantasy, mastery arc, emotional target, session shape, and replay hook before any screen is drawn.')}
          ${moduleCard('HUD', 'Combat readability', 'Maps health, stamina, cooldowns, threat, prompts, and objective states to visual priority under pressure.')}
          ${moduleCard('MAP', 'World and level flow', 'Turns palette and composition rules into biomes, sightlines, traversal rhythm, hidden rewards, and encounter density.')}
          ${moduleCard('FEEL', 'Game feel tokens', 'Documents hitstop, recoil, camera shake, dodge windows, feedback timing, and controller vibration concepts.')}
          ${moduleCard('ACC', 'Accessibility plans', 'Includes remappable controls, subtitle behavior, colorblind-safe rarity, difficulty assists, HUD scaling, and audio cues.')}
          ${moduleCard('TECH', 'Engine constraints', 'Keeps the fantasy aligned with platform budgets, memory ceilings, draw calls, network sync, and save-system needs.')}
        </div>
      </div>
    </section>

    <section class="board-wrap" id="board">
      <div class="container">
        <div class="section-kicker">Vertical slice control center</div>
        <h2 class="section-title">A playable concept board, fully styled by the art bible.</h2>
        <p class="section-lede">The same framework drives game direction, level pacing, HUD legibility, economy checks, narrative continuity, and technical feasibility.</p>
        <div class="board-frame">
          <div class="titlebar"><span></span><span></span><span></span></div>
          <div class="board">
            <aside class="rail">
              <div class="game-identity" style="margin-bottom: 12px;"><span class="game-mark"></span>${escapeHtml(gameName)}</div>
              <a class="rail-link active"><span class="rail-dot"></span>Slice Overview</a>
              <a class="rail-link">Gameplay Loop</a>
              <a class="rail-link">Level Flow</a>
              <a class="rail-link">Combat Readability</a>
              <a class="rail-link">Quest Arc</a>
              <div class="rail-section">Systems</div>
              <a class="rail-link">Economy Balance</a>
              <a class="rail-link">HUD States</a>
              <a class="rail-link">Technical Budget</a>
            </aside>
            <div class="board-main">
              <div class="board-head">
                <h4>Vertical Slice Overview</h4>
                <span class="badge ready">Readiness 82%</span>
              </div>
              <div class="stat-row">
                ${stat('Core loop clarity', 'Strong', '1 friction item')}
                ${stat('Onboarding risk', 'Medium', 'tutorial pass')}
                ${stat('Combat readability', '92%', 'HUD safe')}
                ${stat('Retention health', 'A-', 'ethical pacing')}
              </div>
              <div class="chart-card">
                <div class="chart-head">
                  <span class="title">Encounter intensity across first mission</span>
                  <span class="meta">teach -> test -> twist -> reward</span>
                </div>
                <div class="chart">
                  ${inlineIntensityChart()}
                </div>
              </div>
              <div class="board-lists">
                <div class="list-card">
                  <div class="list-head">
                    <h5>Encounter beats</h5>
                    <span class="badge">First mission</span>
                  </div>
                  ${beatRow('Safe spawn and camera teach', 'No enemies - landmark visible', 'ready')}
                  ${beatRow('First patrol pressure', 'Two weak units - cover readable', 'ready')}
                  ${beatRow('Traversal fork', 'High route, stealth route, loot pocket', '')}
                  ${beatRow('Boss phase rehearsal', 'Telegraphed hazard plus stamina test', 'ready')}
                </div>
                <div class="list-card">
                  <div class="list-head">
                    <h5>Studio handoffs</h5>
                    <span class="badge ready">Live</span>
                  </div>
                  ${activityRow('Narrative beat synced', 'Faction reveal - 11m ago')}
                  ${activityRow('HUD contrast checked', 'Colorblind pass - 22m ago')}
                  ${activityRow('Economy curve tuned', 'Reward cadence - 1h ago')}
                  ${activityRow('GPU budget flagged', 'VFX density - 2h ago')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="deliverables" style="padding-top: 24px;">
      <div class="container">
        <div class="section-kicker">Export package</div>
        <h2 class="section-title">Production-ready game design deliverables.</h2>
        <p class="section-lede">Every output is framed for game teams: designers, artists, engineers, writers, producers, QA, and live-ops owners can act on it.</p>
        <div class="deliverables">
          ${deliverableCard('Game Design Document', 'Vision, genre, pillars, controls, camera, loop, progression, accessibility, and engine assumptions.', ['Core loop', 'Player journey', 'Production risks', 'Success metrics'])}
          ${deliverableCard('Level and Encounter Flow', 'Mission layout, spawn logic, traversal choices, pacing graph, readable cover, rewards, checkpoints, and boss beats.', ['Sightlines', 'Hazards', 'Recovery windows', 'Exploration rewards'])}
          ${deliverableCard('Systems Balance Pack', 'Economy curves, loot tables, rarity colors, XP pacing, crafting pressure, matchmaking constraints, and live-ops cadence.', ['Currencies', 'Loot tables', 'Retention model', 'Fair monetization'])}
        </div>
      </div>
    </section>

    <section class="section" id="critique">
      <div class="container">
        <div class="section-kicker">Self critique</div>
        <h2 class="section-title">The studio loop challenges the design before players do.</h2>
        <div class="critique-grid">
          ${critique('The first mission has strong emotional contrast, but the second combat beat needs a clearer recovery window after the hazard reveal.', 'Gameplay Mechanics Agent')}
          ${critique('The palette supports rarity and faction recognition; keep healing feedback away from faction green to avoid moment-to-moment ambiguity.', 'Art Direction Agent')}
        </div>
      </div>
    </section>

    <section class="section" id="notes" style="padding-top: 24px;">
      <div class="container">
        <div class="section-kicker">Production notes</div>
        <h2 class="section-title">Engine-aware constraints stay attached to the fantasy.</h2>
        <div class="notes">
          ${productionNote('Unreal Engine', 'Use cinematic lighting and Blueprint-friendly encounter states; protect Nanite and Lumen budgets on dense biomes.')}
          ${productionNote('Unity', 'Favor modular systems, mobile tiers, addressable content, and deterministic gameplay modules for cross-platform builds.')}
          ${productionNote('Godot', 'Keep scope indie-friendly, iterate quickly on 2D/3D scenes, and document open-source pipeline constraints.')}
          ${productionNote('WebGL', 'Compress texture sets, cap particle density, minimize shader variants, and keep HUD overlays readable in browser memory ceilings.')}
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <div class="callout">
          <div>
            <h2>Direct a game world that feels coherent, playable, and production-ready.</h2>
            <p>Use this framework as the source of truth for gameplay pillars, HUD systems, art direction, balance, narrative continuity, and technical planning.</p>
          </div>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <a class="btn primary" href="#deliverables">Export GDD</a>
            <a class="btn secondary" href="#critique">Run critique</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-row">
      <span>${escapeHtml(gameName)} game systems framework</span>
      <span>Rendered from game art bible <code>game-art-bibles/${escapeHtml(id)}/DESIGN.md</code></span>
    </div>
  </footer>
</body>
</html>`;
}

function discipline(title: string, note: string): string {
  return `<div class="discipline"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(note)}</span></div>`;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function moduleCard(icon: string, title: string, body: string): string {
  return `<div class="module">
    <div class="module-icon">${escapeHtml(icon)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </div>`;
}

function stat(label: string, value: string, note: string): string {
  return `<div class="stat">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value">${escapeHtml(value)}</div>
    <div class="note">${escapeHtml(note)}</div>
  </div>`;
}

function beatRow(name: string, meta: string, status: RowStatus): string {
  const badge = status === 'ready' ? '<span class="badge ready">OK</span>' : '<span class="badge">Tune</span>';
  return `<div class="list-row">
    <div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </div>
    <div></div>
    ${badge}
  </div>`;
}

function activityRow(name: string, meta: string): string {
  return `<div class="list-row">
    <div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${escapeHtml(meta)}</div>
    </div>
    <div></div>
    <span class="badge ready">Sync</span>
  </div>`;
}

function deliverableCard(name: string, summary: string, includes: string[]): string {
  return `<div class="deliverable">
    <h3>${escapeHtml(name)}</h3>
    <p>${escapeHtml(summary)}</p>
    <ul>${includes.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`;
}

function critique(text: string, agent: string): string {
  return `<div class="critique"><p>${escapeHtml(text)}</p><span>${escapeHtml(agent)}</span></div>`;
}

function productionNote(title: string, body: string): string {
  return `<div class="note"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></div>`;
}

function inlineIntensityChart(): string {
  const data = [18, 24, 21, 40, 34, 52, 45, 68, 58, 82, 64, 38];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 720;
  const h = 150;
  const padX = 8;
  const padY = 14;
  const stepX = (w - padX * 2) / (data.length - 1);
  const norm = (v: number) => padY + (h - padY * 2) * (1 - (v - min) / (max - min));
  const points = data.map((v, i) => `${padX + i * stepX},${norm(v).toFixed(1)}`).join(' ');
  const area = `${padX},${h} ${points} ${w - padX},${h}`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="intensity" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#intensity)"/>
    <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${data.map((v, i) => `<circle cx="${padX + i * stepX}" cy="${norm(v).toFixed(1)}" r="${i === data.length - 1 ? 4 : 0}" fill="var(--accent)"/>`).join('')}
  </svg>`;
}

function extractSubtitle(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 === -1) return '';
  const after = lines.slice(h1 + 1);
  const nextHeading = after.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? after : after.slice(0, nextHeading))
    .join('\n')
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

export function extractColors(raw: string): ColorToken[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string, role: string): void {
    const cleanName = String(name).replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanName || cleanName.length > 60) return;
    const v = normalizeHex(value);
    const key = `${cleanName.toLowerCase()}|${v}`;
    const cleanRole = String(role || '')
      .replace(/[`*_]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.;]+$/, '');
    if (seen.has(key)) {
      if (cleanRole) {
        const existing = colors.find(
          (c) => c.name.toLowerCase() === cleanName.toLowerCase() && c.value === v,
        );
        if (existing && (!existing.role || cleanRole.length > existing.role.length)) {
          existing.role = cleanRole;
        }
      }
      return;
    }
    seen.add(key);
    colors.push({ name: cleanName, value: v, role: cleanRole });
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bold = /\*\*([A-Za-z][A-Za-z0-9 /&()+_'\-]{1,40}?)\*\*([^\n]+)/.exec(line);
    if (bold) {
      const rest = bold[2] ?? '';
      const hex = /#[0-9a-fA-F]{3,8}\b/.exec(rest);
      if (hex) {
        const after = rest.slice((hex.index ?? 0) + hex[0].length);
        const colonIdx = after.search(/[:\uFF1A]/);
        const role = colonIdx >= 0 ? after.slice(colonIdx + 1).trim() : '';
        push(bold[1] ?? '', hex[0], role);
        continue;
      }
    }
    const spec = /^[\s>*-]*\*{0,2}([A-Za-z][^:*\n]{1,40}?)\*{0,2}\s*[:\uFF1A]\s*\*{0,2}\s*`?(#[0-9a-fA-F]{3,8})/.exec(line);
    if (spec) {
      push(spec[1] ?? '', spec[2] ?? '', spec[1] ?? '');
    }
  }

  return colors;
}

function extractFonts(raw: string): FontHints {
  const out: FontHints = {};
  const re = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z /]{1,30}?)\s*\**\s*[:\uFF1A]\s*`?([^`\n]+?)`?$/gm;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const label = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim().replace(/[*_`]+$/g, '').trim();
    if (!/[a-zA-Z]/.test(value)) continue;
    if (value.startsWith('#')) continue;
    if (/display|heading|h1|title/.test(label) && !out.display) out.display = value;
    else if (/body|text|paragraph|copy/.test(label) && !out.body) out.body = value;
    else if (/mono|code/.test(label) && !out.mono) out.mono = value;
  }
  return out;
}

function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesHint(text: string, hint: string): boolean {
  if (!text) return false;
  const needle = hint.toLowerCase().trim();
  if (!needle) return false;
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i');
  return re.test(text);
}

function pickColor(colors: ColorToken[], hints: string[], exclude: string[] = []): string | null {
  const blocked = new Set(
    exclude
      .map((v) => (v == null ? '' : String(v).toLowerCase()))
      .filter((v) => v.length > 0),
  );
  const isAllowed = (c: ColorToken) => !blocked.has(c.value.toLowerCase());
  for (const hint of hints) {
    const byRole = colors.find((c) => isAllowed(c) && matchesHint(c.role, hint));
    if (byRole) return byRole.value;
    const byName = colors.find((c) => isAllowed(c) && matchesHint(c.name, hint));
    if (byName) return byName.value;
  }
  return null;
}

function colorSaturation(hex: string): number {
  const v = String(hex).replace('#', '').toLowerCase();
  if (v.length !== 6) return 0;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function colorLuminance(hex: string): number {
  const v = String(hex).replace('#', '').toLowerCase();
  if (v.length !== 6) return 0.5;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function firstLightish(colors: ColorToken[]): string | null {
  for (const c of colors) {
    if (colorSaturation(c.value) > 0.15) continue;
    if (colorLuminance(c.value) >= 0.92) return c.value;
  }
  return null;
}

function firstNonNeutral(colors: ColorToken[], exclude: string[] = []): string | null {
  const set = new Set(exclude.map((v) => String(v || '').toLowerCase()));
  for (const c of colors) {
    if (set.has(c.value.toLowerCase())) continue;
    if (colorSaturation(c.value) > 0.25) return c.value;
  }
  return null;
}

function secondNonNeutral(colors: ColorToken[], exclude: string[] = []): string | null {
  const set = new Set(exclude.map((v) => String(v || '').toLowerCase()));
  for (const c of colors) {
    if (set.has(c.value.toLowerCase())) continue;
    if (colorSaturation(c.value) > 0.25) return c.value;
  }
  return null;
}

function pickReadableForeground(hex: string): string {
  const n = normalizeHex(hex);
  if (n.length !== 7) return '#ffffff';
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
}

function mixSurface(bg: string): string {
  const n = normalizeHex(bg);
  if (n.length !== 7) return '#171a1f';
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const adjust = lum < 0.4 ? 16 : -8;
  const fix = (v: number) => Math.max(0, Math.min(255, v + adjust)).toString(16).padStart(2, '0');
  return `#${fix(r)}${fix(g)}${fix(b)}`;
}

function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) {
    h = '#' + h.slice(1).split('').map((c) => c + c).join('');
  }
  return h;
}

function cleanTitle(raw: string): string {
  // Preserve exact-read compatibility for retired imported bible titles.
  const retiredPrefix = ['Design', 'System'].join(' ');
  return String(raw)
    .replace(new RegExp(`^${retiredPrefix} (Inspired by|for)\\s+`, 'i'), '')
    .replace(/^Game Art Bible (Inspired by|for)\s+/i, '')
    .trim();
}

function oneLine(s: string): string {
  return String(s).replace(/\s+/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
