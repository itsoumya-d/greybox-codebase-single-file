# Neon Dungeon Game Art Bible

> Category: Arcade
> Sample `DESIGN.md` demonstrating the 9-section game art bible format. Referenced from [`../spec.md`](../spec.md), [`../skills-protocol.md`](../skills-protocol.md), and [`../modes.md`](../modes.md).

## 1. Art Direction & Atmosphere
Fast arcade dungeon fantasy: black-violet rooms, luminous loot, readable hazards, chunky silhouettes, and sharp combat feedback. The mood is dangerous but playful. Every visual choice should help a player read objective, threat, reward, and cooldown instantly.

## 2. Color
- **Background:** `#101018` deep void.
- **Foreground:** `#F4F7FF` readable light text.
- **Primary:** `#2DE2E6` cyan player energy, interactables, and safe route cues.
- **Danger:** `#FF3B5F` enemy attacks, low-health pulse, traps.
- **Reward:** `#FFD166` loot, XP, quest completion.
- **Poison:** `#7DFF6A` status effects and toxic zones.
- **Surface:** `#1B1B2A` HUD panels and pause surfaces.
Never use a color without a gameplay role.

## 3. Typography
- **Display:** `"Orbitron", "Arial Black", system-ui, sans-serif`
- **Body:** `"Inter", system-ui, sans-serif`
- **Mono:** `"JetBrains Mono", ui-monospace, monospace`
- Scale (px): 11 · 13 · 16 · 20 · 28 · 40 · 56
- HUD numerals use mono with tabular numbers.
- Headings use zero letter spacing. Do not compress or stretch type.

## 4. Spacing
- HUD safe inset: 20px desktop, 14px mobile.
- Resource clusters: 6px internal gap, 18px between clusters.
- Touch targets: 48px minimum.
- Gameplay canvas should keep a stable aspect ratio and never resize when HUD numbers change.

## 5. Layout & Composition
- Top left: player resources.
- Top right: objective, timer, wave, or minimap.
- Bottom left: movement or touch joystick.
- Bottom right: abilities, dodge, interact.
- Center screen remains clear except for short combat feedback and interaction prompts.

## 6. Gameplay Modules & HUD Elements
```css
:root {
  --game-bg: #101018;
  --game-surface: #1B1B2A;
  --game-text: #F4F7FF;
  --game-primary: #2DE2E6;
  --game-danger: #FF3B5F;
  --game-reward: #FFD166;
  --game-poison: #7DFF6A;
}

.hud-chip {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--game-primary), transparent 55%);
  background: color-mix(in srgb, var(--game-surface), transparent 12%);
  color: var(--game-text);
}

.ability-ready {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--game-primary), transparent 35%);
}
```

## 7. Motion, Game Feel & Interaction
- Hit flash: 80ms danger tint plus 120ms recoil.
- Collectible pulse: 700ms reward glow loop; disable glow under reduced motion.
- Dodge cooldown: radial fill, not text-only.
- Camera shake is short and low amplitude; never obscures hazards.

## 8. Voice & Game Identity
Copy is punchy and diegetic: "Delve", "Extract", "Risk", "Bank Loot", "Boss Gate". Avoid corporate wording. Tutorial prompts should be short commands, not paragraphs.

## 9. Anti-patterns
- No generic non-game chrome.
- No decorative panels inside the playfield.
- No color-only danger or reward states.
- No HUD cluster that overlaps enemies, objectives, or player spawn.
- No slow transitions on damage, dodge, pause, or restart.
