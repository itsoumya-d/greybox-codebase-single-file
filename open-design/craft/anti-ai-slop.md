# Anti-AI-slop rules

Concrete, checkable rules that distinguish "directed by a game designer
who has shipped playable systems" from "default LLM output." Several rules below are
auto-enforced by the daemon's `lint-artifact` linter — failing an
enforced rule is not a style preference, it is a regression. The
rest are guidance for agents and reviewers and are flagged inline as
"(guidance, not auto-checked)" so the contract with the linter stays
honest.

> Adapted from [refero_skill](https://github.com/referodesign/refero_skill)
> (MIT), tightened to match AI Game Design Studio's lint surface.

## The seven cardinal sins

These are the patterns the linter blocks at P0 (must-fix):

1. **Default Tailwind indigo as accent** — exactly `#6366f1`, `#4f46e5`,
   `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`. The active
   `DESIGN.md` provides `--accent`; use it. Indigo is the textbook AI
   tell. (The daemon's `lint-artifact` flags any of these as a solid
   accent; keep this list in sync with `AI_DEFAULT_INDIGO` in
   `apps/daemon/src/lint-artifact.ts`.)
2. **Two-stop "trust" gradient on the hero** — purple→blue, blue→cyan,
   indigo→pink. A flat surface + intentional type beats this every
   time.
3. **Emoji as mechanic icons** — `✨`, `🚀`, `🎯`, `⚡`, `🔥`, `💡`
   inside `<h*>`, `<button>`, `<li>`, or `class*="icon"`. Use
   1.6–1.8px-stroke monoline SVG with `currentColor`.
4. **Sans-serif on display text when the seed binds a serif** — h1/h2
   must use `var(--font-display)`, not a hardcoded Inter / Roboto /
   `system-ui`.
5. **Rounded card with a colored left-border accent** — the canonical
   "AI control tile" shape. Drop either the radius or the left border.
6. **Invented metrics** — "10x stronger", "99.9% win rate", "3x more
   retention". Either pull from real tuning data or use a labelled
   placeholder.
7. **Filler copy** — `lorem ipsum`, `mechanic one / two / three`,
   `placeholder text`, `sample content`. An empty section is a design
   problem to solve with composition, not by inventing words.

## Soft tells (P1 — should fix)

- **Standard "Main Menu -> Features -> Store -> FAQ -> Objective Action" sequence with no
  playable purpose** *(guidance, not auto-checked)*. This is the AI-template
  skeleton; introduce a game-specific beat: core loop, encounter, HUD state,
  loot/reward moment, level map, boss phase, or player progression.
- **External placeholder image CDNs** (`unsplash.com`, `placehold.co`,
  `placekitten.com`, `picsum.photos`). Fragile and obvious. Use the
  shipped `.ph-img` placeholder class.
- **More than ~12 raw hex values outside `:root`.** Tokens were not
  honoured.
- **`var(--accent)` used 6+ times in the rendered body.** Cap at 2
  visible uses per screen.

## Production review

These rules are not just aesthetic taste. They protect production trust:
generic polish makes playtesters respond to the template instead of the game
fantasy. When a reviewer flags an AI-slop tell, pair the fix with a gameplay
reason — readability, performance budget, controller clarity, faction identity,
or player feedback timing. Do not replace one decorative trope with another.
Make the artifact easier to play, critique, or ship.

## Polish tells (P2 — nice to fix)

- **Sections without `data-agds-id`** — comment mode can't target them.
- **Decorative blob / wave SVG backgrounds** *(guidance, not
  auto-checked)* — meaningless geometry.
- **Perfect symmetric layout with no visual tension** *(guidance, not
  auto-checked)* — alternating density (one tight section, one
  breathing section) reads as intentional.

## How to add soul without breaking the rules

Aim for **~80% proven patterns + ~20% distinctive choice**. The 20%
should live in:

- One bold visual move — a typography choice, a single color decision,
  an unexpected proportion.
- Voice and microcopy — a button that says "Bank Loot" or "Start Run" beats one
  that says "Get started".
- One micro-interaction the player will remember — a button press that
  moves 2px, a number that counts up.
- One detail that could only have been put there by someone who played
  the game (a cooldown tell, controller hint, boss warning, rarity cue,
  or faction-specific phrase).

If a reviewer screenshots the artifact and someone outside the project
can identify which game fantasy it's from — you have soul. If not, you
shipped a template.
