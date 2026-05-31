---
name: critique
description: |
  Run a 5-dimension game-design review on any HTML artifact — fantasy,
  readability, game feel, feedback, and production clarity. Outputs an
  evidence-backed HTML report with Keep / Fix / Quick-wins.
triggers:
  - "critique"
  - "design review"
  - "design audit"
  - "5 维度评审"
  - "5-dim review"
  - "audit my design"
  - "review my deck"
  - "review my game screen"
  - "评审"
  - "复盘"
agds:
  mode: prototype
  platform: desktop
  scenario: systems
  upstream: "https://github.com/alchaincyf/huashu-design"
  preview:
    type: html
    entry: index.html
  game_art_bible:
    requires: false
  example_prompt: "Run a game-design critique on the playable concept I just generated — score fantasy, HUD readability, game feel, feedback, and production clarity."
---

# Game Critique Skill · 5 维度专家评审

Produce a single-file HTML game-design review report that scores any
artifact across 5 player-experience dimensions and proposes actionable fixes. Inspired by
the *huashu-design* expert-critique flow.

## When to use

- After the agent (or creator) generates an artifact (GDD deck / playable
  concept / HUD / level board) and the creator asks "what's wrong with this?" or
  "review this"
- As a self-check loop the agent can run on its own output **before**
  emitting it
- For comparing two variants of the same design

## What you produce

A single self-contained `<artifact type="text/html">` review report
including:

1. **Header** — what artifact was reviewed, date, reviewer ("AGDS ·
   Critique skill"), 1-line verdict
2. **Radar chart** (inline SVG, no library) showing the 5 scores
3. **Five dimension cards**, each with:
   - Score 0–10 (with band: 0–4 *Broken* · 5–6 *Functional* · 7–8 *Strong*
     · 9–10 *Exceptional*)
   - 1-paragraph evidence (cite specific elements / files / lines)
   - One Keep / Fix / Quick-win bullet
4. **Combined action lists** at the bottom:
   - **Keep** — what's working, don't touch
   - **Fix** — P0 / P1 issues that are visually expensive
   - **Quick wins** — 5–15 minute tweaks with disproportionate impact

## The 5 dimensions

> Each dimension is independent — a pitch deck can be 9/10 on fantasy
> clarity but 4/10 on combat readability and the report should say so plainly. Don't average
> away interesting failures.

### 1. Game fantasy consistency · 游戏幻想一致性

> Does the artifact express a clear player fantasy and keep every
> visual, mechanical, and copy decision pointed at that fantasy?

**Evidence to look for:**
- Is there one declared game direction (e.g. tactical extraction, cozy
  survival, mythic boss-rush) or does the artifact mix incompatible fantasies?
- Do title cards, HUD labels, quest copy, and control prompts use the
  same game-world register?
- Do art direction, typography, icon language, and feedback colors obey
  the same rules across scenes, decks, and game screens?

**0–4** Multiple fantasies fight each other. **5–6** One fantasy is present
but many elements drift. **7–8** Coherent, occasional drift on edge scenes.
**9–10** Every element reinforces the same player promise.

### 2. Player readability · 玩家可读性

> Can a player immediately read goals, threats, affordances, and the
> next meaningful action without being told?

**Evidence to look for:**
- Is the most important gameplay information visually dominant in each
  scene, HUD state, or slide?
- Do type roles match information roles: objective, status, lore,
  telemetry, input prompt, or production note?
- Are threat markers, health, objective, and interaction prompts competing,
  or is there a clear primary/secondary/tertiary read?

**0–4** Everything shouts. **5–6** Readability works in showcase states but
breaks during dense gameplay or body content. **7–8** Clear tiers, occasional
collision. **9–10** The player's eye moves with zero friction.

### 3. Game-feel and craft detail · 手感与细节执行

> The 90/10 stuff — response timing, feedback layering, alignment,
> leading, hit feedback, frame composition, and edge-case spacing.

**Evidence to look for:**
- HUD counters: do values align to stable baselines, or jitter between states?
- Combat/interaction timing: are startup, active, recovery, cooldown,
  animation, audio, and haptic cues named or implied?
- Frame media and captions: do screenshots, level maps, and storyboard
  panels use consistent proportions?
- Labels: same uppercase rule, spacing, and icon grammar across gameplay modules?
- Any orphaned line break or narrow panel causing unreadable one-word lines?

**0–4** The artifact feels taped together. **5–6** Most surfaces are clean,
with 1–2 ragged states. **7–8** Polished, expert eye finds 2–3 misses.
**9–10** Studio-grade craft where feedback, layout, and presentation all
serve the play experience.

### 4. Playability and production utility · 可玩性与制作可用性

> Does the artifact *work* for its intended studio use? Controls, click
> targets, navigation, playtest clarity, readable specs, exportability,
> and mobile fallback if relevant.

**Evidence to look for:**
- Deck: keyboard / wheel / touch nav all working? Iframe scroll
  fallback?
- Game screen: objective, HUD, input prompt, and pause/retry visible?
- GDD or spec: implementation blocks copyable, mono font, no smart quotes?
- Critical info readable from 4m away (large screen presentation)?

**0–4** Visually fine but does not support a player or production workflow.
**5–6** Core flow works, edge cases broken. **7–8** Robust through normal use.
**9–10** Defensively engineered — handles iframe / fullscreen / paste
/ print without flinching.

### 5. Memorable game identity · 记忆点

> Does this push past the median? Is there one mechanic, visual beat,
> world detail, or presentation move that makes people lean in?

**Evidence to look for:**
- One *unexpected* mechanic, encounter twist, camera moment, progression
  hook, or HUD treatment that was not required?
- Or 100% safe — could be any generic fantasy HUD, pitch deck, or level board?
- Is the memorable move *earned* by the fantasy, or grafted on as spectacle?

**0–4** Generic AI-slop median. **5–6** Competent and unmemorable.
**7–8** One memorable moment, the rest solid. **9–10** Multiple
moves you'd steal — but each one obviously serves the thesis.

## Scoring discipline (read before you score)

- **Always cite evidence** — "scored 4 because the boss-intro frame mixes
  Playfair display with Inter sans on the same objective line" beats "feels
  inconsistent". Numbers without evidence get rejected.
- **Don't average up** — if player readability is 5 because the third
  encounter frame is broken, don't bump to 7 because the first two frames are fine. The score is the
  *worst sustained band*.
- **Don't grade-inflate** — a 7 means *strong*, not *acceptable*. If
  every score is 7+, you're not reviewing critically.
- **Memorability is allowed to be low** — 5/10 is fine for conservative
  production deliverables. Don't punish *appropriate* scope control.

## Workflow

### Step 1 — Acquire the artifact

Three modes:

1. **Project file** — creator said "review the index.html I just made":
   open it from the project folder.
2. **Pasted HTML** — creator pasted code in the chat: read it from the
   message.
3. **Generated by you in this turn** — you just emitted an artifact
   above and want to self-critique: re-read your own `<artifact>`.

If multiple HTML files exist, ask which one (don't review all).

### Step 2 — Read enough to score

Skim the entire `<style>`, then read 6–8 representative content
blocks. **Do not score from frontmatter alone.** The score depends on
*executed* design, not declared intent.

### Step 3 — Score with evidence

For each of the 5 dimensions, write the score and a 30–80 word
evidence paragraph that names specific elements. Use line numbers,
class names, scene/frame numbers, or game-screen labels.

Example:
```
Dimension: Detail execution
Score: 6 / 10
Evidence: Encounter stats on scene 3 align cleanly (grid-6, 3x2), but on
boss-phase frame 8 the right column objective marker sits 2vh higher than
the left because .callout has 3vh top margin while the figure does not.
HUD captions use mono on scene 5 but sans on scene 7 — pick one.
```

### Step 4 — Build the action lists

Aggregate the 5 evidence paragraphs into:

- **Keep** (3–5 bullets) — concrete things working that the creator must
  not break in the next iteration. Cite by class / scene / gameplay element.
- **Fix** (3–6 bullets) — must-do, ordered by *visual cost saved per
  minute spent*. Each bullet ≤ 1 sentence.
- **Quick wins** (3–5 bullets) — 5–15 minutes each, high
  signal-to-noise (e.g. "swap `display:flex` for `grid` on the quest
  reward frame to fix the column drift").

### Step 5 — Emit the report HTML

Build a single file:

- Header: artifact name + reviewer credit + date
- Big radar chart (SVG)
- 5 dimension cards in a 1-column or 2-column grid
- Three action lists at the bottom with checkbox affordance

Use the active DESIGN.md tokens if one exists; otherwise default to a
neutral light art direction (off-white background, near-black text, one accent
for radar fill).

## Output contract

```
<artifact identifier="critique-<artifact-slug>" type="text/html" title="Critique · <Artifact Title>">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact ("Reviewed X across 5 dimensions, see
report below.") and **stop after `</artifact>`** — do not paraphrase
the report in chat; the creator will read the artifact.

## Hard rules

- **5 scores, every time** — partial reports (e.g. only 3 dimensions)
  are not allowed.
- **Evidence per score** — no "feels off" / "needs work". If you
  can't cite an element, the score is not justified.
- **Don't grade-inflate** — overall mean above 8 is suspicious; check
  yourself.
- **Don't review your own artifact in the same turn** — the creator
  needs to see it first. Self-critique only on explicit request
  ("now critique what you just made").
- **Single-file HTML only** — no external CSS/JS. Inline everything.
- **Radar chart is mandatory** — gives the report a recognizable
  silhouette and lets the creator spot weak axes at a glance.
