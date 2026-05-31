/**
 * Built-in game art direction library.
 *
 * Distilled from guided direction's "5 schools × 20 philosophies" idea: when
 * the creator hasn't specified an art direction and selected "Pick a direction for me"
 * in the discovery brief, the agent emits a *second* `<question-form>` whose
 * radio options are these game-art schools. Each school carries a concrete spec —
 * fonts, palette in OKLch, mood keywords, real-world references — that the
 * agent then encodes into the active CSS `:root` tokens before generating.
 *
 * The library has TWO purposes:
 *
 *   1. Render-time: the prompt embeds these as choices the creator picks from.
 *      One radio click → a deterministic palette + type stack, no model
 *      improvisation.
 *   2. Build-time: once chosen, the agent sees the full spec (palette
 *      values, font stacks, layout posture, mood) inline in its system
 *      prompt and binds the seed template's `:root` to those values.
 *
 * Adding a new direction: append to `DESIGN_DIRECTIONS` and it shows up in
 * the picker automatically. Keep them visually *distinct* — two near-
 * identical directions defeat the purpose.
 */

export interface DesignDirection {
  /** kebab-case id, also the question-option label after `: ` */
  id: string;
  /** Short creator-facing label, shown in the radio. ≤ 56 chars including the dash list. */
  label: string;
  /** One-paragraph mood description shown to the creator as `help`. */
  mood: string;
  /** References / exemplars — real games, genres, studios, and interface traditions. */
  references: string[];
  /** Headline (display) font stack. CSS-ready. */
  displayFont: string;
  /** Body font stack. CSS-ready. */
  bodyFont: string;
  /** Optional mono override; falls back to ui-monospace. */
  monoFont?: string;
  /** Six palette values in OKLch — bind directly to seed `:root`. */
  palette: {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    border: string;
    accent: string;
  };
  /** Layout posture cues for the agent. Concrete, not vague. */
  posture: string[];
}

export const DESIGN_DIRECTIONS: DesignDirection[] = [
  {
    id: 'arcade-neon',
    label: 'Arcade neon — kinetic cabinet energy',
    mood:
      'High-contrast arcade spectacle with bright score readouts, saturated pickups, punchy feedback, and screens that feel alive under player input.',
    references: ['Geometry Wars', 'Rez', 'Wipeout', 'classic arcade cabinets'],
    displayFont: "'Orbitron', 'Rajdhani', 'Eurostile', system-ui, sans-serif",
    bodyFont: "'Rajdhani', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(14% 0.06 270)',
      surface: 'oklch(20% 0.08 275)',
      fg:      'oklch(95% 0.04 210)',
      muted:   'oklch(70% 0.07 245)',
      border:  'oklch(42% 0.16 285)',
      accent:  'oklch(72% 0.26 330)',
    },
    posture: [
      'large score, combo, timer, and feedback text must be visible during motion',
      'use glow only for interactables, pickups, hazards, and active state',
      'screen transitions should feel like cabinet wipes, scanlines, pulses, or light trails',
      'touch and keyboard controls need immediate visual feedback',
    ],
  },
  {
    id: 'cozy-adventure',
    label: 'Cozy adventure — warm exploration',
    mood:
      'Friendly, legible, and tactile. Soft terrain shapes, inventory objects, readable quests, and gentle feedback built for low-stress loops.',
    references: ['Animal Crossing', 'Stardew Valley', 'A Short Hike', 'Monument Valley'],
    displayFont: "'Fraunces', 'Cooper Black', 'Iowan Old Style', Georgia, serif",
    bodyFont: "'Nunito', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg:      'oklch(94% 0.05 85)',
      surface: 'oklch(98% 0.03 95)',
      fg:      'oklch(27% 0.05 95)',
      muted:   'oklch(52% 0.05 105)',
      border:  'oklch(78% 0.06 85)',
      accent:  'oklch(64% 0.15 145)',
    },
    posture: [
      'rounded panels can be soft, but HUD labels must stay compact and readable',
      'quest and inventory UI should use object silhouettes, icons, and gentle badges',
      'avoid aggressive timers unless the brief asks for pressure',
      'prioritize readable mobile touch zones and generous pause/settings states',
    ],
  },
  {
    id: 'tactical-sci-fi-hud',
    label: 'Tactical sci-fi HUD — command interface',
    mood:
      'Dense, mission-critical interface language: reticles, telemetry, target locks, minimaps, cooldowns, squad status, and panelized affordances.',
    references: ['Halo', 'Destiny', 'XCOM', 'Mass Effect', 'Elite Dangerous'],
    displayFont: "'Space Grotesk', 'Eurostile', 'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', 'Söhne', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(13% 0.035 235)',
      surface: 'oklch(19% 0.045 235)',
      fg:      'oklch(88% 0.035 205)',
      muted:   'oklch(62% 0.06 215)',
      border:  'oklch(39% 0.09 220)',
      accent:  'oklch(73% 0.16 190)',
    },
    posture: [
      'HUD density is welcome, but combat-critical state must sit in stable zones',
      'use mono numerics for ammo, cooldowns, coordinates, timers, and score',
      'show active target, objective, threat, and resource states together',
      'include keyboard/controller affordances for tactical decisions',
    ],
  },
  {
    id: 'fantasy-rpg',
    label: 'Fantasy RPG — parchment and magic',
    mood:
      'Quest-driven fantasy UI with readable parchment panels, ornate but controlled borders, inventory grids, spell slots, maps, and character stats.',
    references: ['Baldur\'s Gate 3', 'The Witcher 3', 'Skyrim', 'Diablo IV'],
    displayFont: "'Cinzel', 'Trajan Pro', 'Iowan Old Style', Georgia, serif",
    bodyFont: "'Spectral', 'Source Serif 4', Georgia, serif",
    palette: {
      bg:      'oklch(21% 0.045 70)',
      surface: 'oklch(88% 0.055 82)',
      fg:      'oklch(19% 0.035 70)',
      muted:   'oklch(43% 0.05 70)',
      border:  'oklch(48% 0.08 62)',
      accent:  'oklch(58% 0.16 35)',
    },
    posture: [
      'ornament belongs on frame edges, not over labels or numbers',
      'inventory, quest, map, skill-tree, and dialog states must have clear hierarchy',
      'use accent for magic, rarity, selected item, or quest focus',
      'show both exploration and combat-readiness if the playable concept includes gameplay',
    ],
  },
  {
    id: 'horror-survival',
    label: 'Horror survival — scarce and tense',
    mood:
      'Low-light, high-tension interfaces with scarce resources, inventory pressure, danger readability, and deliberate silence around the playfield.',
    references: ['Resident Evil', 'Silent Hill', 'Dead Space', 'Inside'],
    displayFont: "'Barlow Condensed', 'Oswald', 'Arial Narrow', system-ui, sans-serif",
    bodyFont: "'IBM Plex Sans Condensed', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(9% 0.025 80)',
      surface: 'oklch(16% 0.03 85)',
      fg:      'oklch(83% 0.035 78)',
      muted:   'oklch(48% 0.035 78)',
      border:  'oklch(28% 0.04 75)',
      accent:  'oklch(52% 0.19 25)',
    },
    posture: [
      'reserve bright accent for danger, low health, detected threat, or interact prompt',
      'avoid cheerful gradients, decorative clutter, and over-explained UI',
      'resource scarcity must be readable: health, ammo, battery, noise, inventory slots',
      'pause, inventory, and death states should reinforce tension without hiding controls',
    ],
  },
  {
    id: 'pixel-retro',
    label: 'Pixel retro — crisp tile and sprite language',
    mood:
      'Readable pixel-era structure with tile maps, sprite states, chunky menus, simple animations, and clean collision/interaction feedback.',
    references: ['Celeste', 'Shovel Knight', 'Hyper Light Drifter', 'Game Boy Advance UI'],
    displayFont: "'Press Start 2P', 'Silkscreen', ui-monospace, monospace",
    bodyFont: "'Silkscreen', 'Pixelify Sans', ui-monospace, monospace",
    monoFont: "'Press Start 2P', ui-monospace, monospace",
    palette: {
      bg:      'oklch(18% 0.04 250)',
      surface: 'oklch(25% 0.06 250)',
      fg:      'oklch(92% 0.04 95)',
      muted:   'oklch(64% 0.06 140)',
      border:  'oklch(52% 0.08 250)',
      accent:  'oklch(74% 0.18 75)',
    },
    posture: [
      'prefer hard edges, stepped shadows, tile grids, and sprite-state labels',
      'avoid blurry scaling; use image-rendering: pixelated on pixel assets/canvas',
      'keep text short because pixel fonts consume space quickly',
      'show idle, move, hit, collect, success, and failure states when relevant',
    ],
  },
  {
    id: 'stylized-3d',
    label: 'Stylized 3D — readable depth and action',
    mood:
      'Polished 3D-friendly art direction with strong silhouettes, readable depth, camera-safe HUD placement, and clean material/color separation.',
    references: ['Fortnite', 'Overwatch', 'Ratchet & Clank', 'Sackboy'],
    displayFont: "'Bricolage Grotesque', 'Avenir Next', system-ui, sans-serif",
    bodyFont: "'Inter', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg:      'oklch(93% 0.04 230)',
      surface: 'oklch(99% 0.02 220)',
      fg:      'oklch(18% 0.035 250)',
      muted:   'oklch(48% 0.04 250)',
      border:  'oklch(78% 0.045 230)',
      accent:  'oklch(62% 0.19 255)',
    },
    posture: [
      'separate world, character, interactables, and HUD with clear value contrast',
      'use camera-safe HUD anchors and avoid UI covering character/action center',
      'include material notes for hero props, platforms, pickups, and VFX',
      'playable concept can use CSS/Canvas/Three placeholders but must frame the intended depth',
    ],
  },
  {
    id: 'cyberpunk-fps',
    label: 'Cyberpunk FPS — neon visor combat',
    mood:
      'High-pressure first-person shooter language with visor telemetry, scanner overlays, breach timers, weapon charge, rain-slick materials, and hostile city light.',
    references: ['Cyberpunk 2077', 'Deus Ex', 'Ghostrunner', 'Syndicate'],
    displayFont: "'Rajdhani', 'Orbitron', 'Eurostile', system-ui, sans-serif",
    bodyFont: "'Inter', 'Rajdhani', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(10% 0.05 285)',
      surface: 'oklch(18% 0.06 260)',
      fg:      'oklch(90% 0.05 205)',
      muted:   'oklch(58% 0.07 235)',
      border:  'oklch(42% 0.11 260)',
      accent:  'oklch(78% 0.22 150)',
    },
    posture: [
      'protect reticle and sight picture from decorative HUD effects',
      'use mono numerics for ammo, breach timers, distance, cooldown, and coordinates',
      'show target lock, cyberware charge, objective ping, and damage direction together',
      'reserve magenta/red for danger; use green/cyan for tech affordances',
    ],
  },
  {
    id: 'soulslike-dark',
    label: 'Soulslike dark — ritual restraint',
    mood:
      'Sparse gothic combat UI with stamina pressure, boss bars, item quick slots, ember light, ritual gold, and tense negative space.',
    references: ['Dark Souls', 'Bloodborne', 'Elden Ring', 'Blasphemous'],
    displayFont: "'Cinzel', 'Cormorant Garamond', Georgia, serif",
    bodyFont: "'Spectral', 'Source Serif 4', Georgia, serif",
    monoFont: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(8% 0.02 70)',
      surface: 'oklch(16% 0.025 75)',
      fg:      'oklch(83% 0.03 82)',
      muted:   'oklch(46% 0.025 82)',
      border:  'oklch(34% 0.05 75)',
      accent:  'oklch(62% 0.11 76)',
    },
    posture: [
      'keep the playfield quiet; health, stamina, boss phase, and item slot are primary',
      'telegraphs and recovery windows must read before spectacle',
      'use blood accent only for danger, death, or critical health',
      'ornament belongs on title/death states, not fast-changing numbers',
    ],
  },
  {
    id: 'anime-action',
    label: 'Anime action — character burst energy',
    mood:
      'Character-forward action RPG style with clean party cards, skill cut-ins, rarity frames, event goals, bright rewards, and readable mobile HUD states.',
    references: ['Genshin Impact', 'Honkai: Star Rail', 'Granblue Fantasy', 'Persona 5 menus'],
    displayFont: "'Bricolage Grotesque', 'Baloo 2', system-ui, sans-serif",
    bodyFont: "'Nunito', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg:      'oklch(97% 0.03 95)',
      surface: 'oklch(94% 0.06 330)',
      fg:      'oklch(22% 0.05 260)',
      muted:   'oklch(52% 0.06 275)',
      border:  'oklch(82% 0.08 315)',
      accent:  'oklch(82% 0.16 82)',
    },
    posture: [
      'character silhouette and skill identity are the first read',
      'rarity, currency, odds, and duplicate handling must be transparent',
      'use peak effects for ultimate, pull, or level-up moments only',
      'portrait mobile layouts need reachable bottom navigation and safe areas',
    ],
  },
  {
    id: 'military-sim',
    label: 'Military sim — austere tactical grid',
    mood:
      'Grounded command UI with squad status, map overlays, ammo, stance, extraction, coordinates, comms, and minimal decoration.',
    references: ['ARMA', 'Ready or Not', 'Ghost Recon', 'XCOM tactical map'],
    displayFont: "'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', system-ui, sans-serif",
    bodyFont: "'IBM Plex Sans Condensed', 'Inter', system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(12% 0.02 140)',
      surface: 'oklch(28% 0.045 130)',
      fg:      'oklch(84% 0.045 90)',
      muted:   'oklch(60% 0.05 100)',
      border:  'oklch(43% 0.06 125)',
      accent:  'oklch(72% 0.18 145)',
    },
    posture: [
      'mission objective, squad health, ammo, stance, and threat direction stay visible',
      'use grids, coordinates, radio logs, and map overlays as functional structure',
      'avoid fake insignia or glamorized violence',
      'show cover, line of sight, suppression, and extraction state when relevant',
    ],
  },
  {
    id: 'steampunk-vintage',
    label: 'Steampunk vintage — brass adventure maps',
    mood:
      'Warm clockwork adventure language with parchment maps, brass gauges, leather tabs, contraption diagrams, and expedition inventory.',
    references: ['Frostpunk UI', 'The Room', 'Bioshock Infinite props', 'airship adventure fiction'],
    displayFont: "'Fraunces', 'Cormorant Garamond', Georgia, serif",
    bodyFont: "'Alegreya Sans', 'Nunito', system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(16% 0.035 70)',
      surface: 'oklch(89% 0.055 84)',
      fg:      'oklch(20% 0.04 70)',
      muted:   'oklch(48% 0.06 65)',
      border:  'oklch(68% 0.12 78)',
      accent:  'oklch(53% 0.10 180)',
    },
    posture: [
      'mechanical ornament must explain function, pressure, route, or tool state',
      'map, journal, toolbelt, and upgrade bench should feel connected',
      'avoid decorative gears over labels or touch targets',
      'show route danger, contraption status, and inventory readiness',
    ],
  },
  {
    id: 'underwater-bioluminescent',
    label: 'Underwater biolume — pressure and wonder',
    mood:
      'Deep-sea exploration UI with oxygen rings, sonar pulses, pressure warnings, specimen logs, soft currents, and glowing organisms.',
    references: ['Subnautica', 'ABZU', 'Endless Ocean', 'deep sea research interfaces'],
    displayFont: "'Space Grotesk', 'Avenir Next', system-ui, sans-serif",
    bodyFont: "'Inter', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    monoFont: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace",
    palette: {
      bg:      'oklch(10% 0.05 240)',
      surface: 'oklch(18% 0.06 225)',
      fg:      'oklch(91% 0.035 210)',
      muted:   'oklch(55% 0.07 175)',
      border:  'oklch(38% 0.08 205)',
      accent:  'oklch(76% 0.18 195)',
    },
    posture: [
      'oxygen, depth, pressure, waypoint, and specimen capacity are primary',
      'bioluminescence marks organisms, interactables, and rare resources',
      'avoid one-note blue contrast; text and warnings must stay crisp',
      'mobile variants need simplified swim controls and bigger oxygen warnings',
    ],
  },
  {
    id: 'kids-casual',
    label: 'Kids / casual — bright and forgiving',
    mood:
      'Approachable mobile-first game design with oversized controls, friendly shapes, high affordance, generous feedback, and low-friction learning.',
    references: ['Duolingo Math games', 'Toca Boca', 'PBS Kids games', 'Monument Valley mobile player experience'],
    displayFont: "'Baloo 2', 'Nunito', system-ui, sans-serif",
    bodyFont: "'Nunito', 'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    palette: {
      bg:      'oklch(96% 0.04 95)',
      surface: 'oklch(100% 0.01 95)',
      fg:      'oklch(24% 0.04 250)',
      muted:   'oklch(50% 0.05 230)',
      border:  'oklch(82% 0.06 90)',
      accent:  'oklch(70% 0.18 55)',
    },
    posture: [
      'controls should be oversized, labeled by shape/icon, and easy to retry',
      'failure states are encouraging and immediately actionable',
      'use motion and sound cues as feedback, not as constant noise',
      'mobile safe areas and thumb reach matter more than visual density',
    ],
  },
];

/**
 * Render the direction-picker body for emission as a `<question-form>`.
 * Uses the `direction-cards` question type so the UI renders each option
 * as a rich card (palette swatches + type sample + mood blurb + refs)
 * instead of a plain radio. Falls back gracefully — older clients that
 * don't recognise `direction-cards` treat it as text.
 */
export function renderDirectionFormBody(): string {
  const cards = DESIGN_DIRECTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    mood: d.mood,
    references: d.references,
    palette: [
      d.palette.bg,
      d.palette.surface,
      d.palette.border,
      d.palette.muted,
      d.palette.fg,
      d.palette.accent,
    ],
    displayFont: d.displayFont,
    bodyFont: d.bodyFont,
  }));

  const form = {
    description:
      'No game art bible to match — pick a game art direction. Each one ships with a real palette, font stack, and interaction posture. You can override the accent below.',
    questions: [
      {
        id: 'direction',
        label: 'Game art direction',
        type: 'direction-cards',
        required: true,
        options: DESIGN_DIRECTIONS.map((d) => d.id),
        cards,
      },
      {
        id: 'accent_override',
        label: 'Accent override (optional)',
        type: 'text',
        placeholder:
          'e.g. "use toxic green instead of magenta", "less cute, more tactical"',
      },
    ],
  };

  return JSON.stringify(form, null, 2);
}

/**
 * The block we splice into the system prompt so the agent has each
 * direction's full spec inline (palette, fonts, posture). Used by the
 * discovery prompt to teach the agent *how* to bind a chosen direction
 * onto the seed template's `:root` variables.
 */
export function renderDirectionSpecBlock(): string {
  const lines: string[] = [
    '## Game art direction library — bind into `:root` when the creator picks one',
    '',
    'Each game direction below carries a CSS-ready palette (OKLch values) and font stacks. When the creator selects one in the direction picker, replace the seed template\'s `:root` block with that direction\'s palette and font stacks **verbatim** — do not improvise. Posture cues describe how that direction behaves in menus, HUD, gameplay screens, feedback, and controls; honour them in the layout choices.',
    '',
  ];
  for (const d of DESIGN_DIRECTIONS) {
    lines.push(`### ${d.label}  \`(id: ${d.id})\``);
    lines.push('');
    lines.push(`**Mood:** ${d.mood}`);
    lines.push('');
    lines.push(`**References:** ${d.references.join(', ')}.`);
    lines.push('');
    lines.push('**Palette (drop into `:root`):**');
    lines.push('');
    lines.push('```css');
    lines.push(`:root {`);
    lines.push(`  --bg:      ${d.palette.bg};`);
    lines.push(`  --surface: ${d.palette.surface};`);
    lines.push(`  --fg:      ${d.palette.fg};`);
    lines.push(`  --muted:   ${d.palette.muted};`);
    lines.push(`  --border:  ${d.palette.border};`);
    lines.push(`  --accent:  ${d.palette.accent};`);
    lines.push('');
    lines.push(`  --font-display: ${d.displayFont};`);
    lines.push(`  --font-body:    ${d.bodyFont};`);
    if (d.monoFont) lines.push(`  --font-mono:    ${d.monoFont};`);
    lines.push(`}`);
    lines.push('```');
    lines.push('');
    lines.push('**Posture:**');
    for (const p of d.posture) lines.push(`- ${p}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Look up a direction by its `label` (what the creator sees in the picker). */
export function findDirectionByLabel(label: string): DesignDirection | undefined {
  const trimmed = label.trim();
  return DESIGN_DIRECTIONS.find((d) => d.label === trimmed || d.id === trimmed);
}
