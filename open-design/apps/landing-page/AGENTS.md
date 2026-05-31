# apps/landing-page/AGENTS.md

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This file only
records module-level boundaries for `apps/landing-page/`.

## Purpose

`apps/landing-page` is a stand-alone static Astro home surface that renders
the canonical AI Game Design Studio home surface in the **Game Control Center** style.
It is the deployable counterpart to:

- Product workflow: the game-native skills under `skills/`, especially
  `game-pitch-deck`, `game-design-document`, and `playable-game-prototype`.
- Game art bible: `game-art-bibles/game-control-center/DESIGN.md` — token spec.
- Image assets are hosted from the AGDS Cloudflare R2 asset bucket. Some current
  hosting identifiers still retain former-product names in deploy config; treat
  those strings as hosting compatibility details, not public product copy.
  Do not commit local mirrored PNGs into `apps/landing-page/public/assets/`.

## What it is

- Astro static output. The route lives at `app/pages/index.astro` and
  uses React only at build time (`renderToStaticMarkup`) for the existing
  `app/page.tsx` React unit. The generated home is CDN-ready HTML/CSS plus
  a small inline enhancement script; no React runtime ships to browsers.
- `astro.config.ts` always uses `output: 'static'` and emits to `out/`
  so it can be served by any CDN (Vercel, Cloudflare Pages, the daemon's
  static fallback) without a Node runtime.
- All styles live in `app/globals.css`. Class names match the Game Control
  Center CSS in the canonical example so visual parity is one-to-one.
- All home imagery is referenced through `app/image-assets.ts`, which builds
  Cloudflare Image Resizing URLs for the R2 originals.

## What it is NOT

- Not part of `apps/web`. The studio shell is the primary studio surface; the
  home surface is the public overview. They share game tokens but
  not state, routes, or runtime.
- Not connected to `apps/daemon`. There is no `/api`, no `/artifacts`,
  no `/frames` — no proxy to set up.
- Not multi-route. There is exactly one route (`/`) that renders the
  full studio home. If you need a second route, add it as a sibling
  Astro route.

## Boundary constraints

- Must remain a static Astro output.
- Must not import from `@ai-game-design-studio/web`, `@ai-game-design-studio/daemon`,
  `@ai-game-design-studio/desktop`, `@ai-game-design-studio/sidecar*`, or
  `@ai-game-design-studio/contracts`. Those are studio runtime concerns.
- Must not introduce a `src/` shell — keep all source under
  `app/`. If a React unit grows beyond ~80 lines, extract it to
  `app/_components/<name>.tsx`.
- Must not depend on any non-Google web font.
- Keep `app/page.tsx` and `app/globals.css` in lockstep when the studio home
  visual system changes.

## Common commands

```bash
pnpm --filter @ai-game-design-studio/landing-page dev          # http://127.0.0.1:17574
pnpm --filter @ai-game-design-studio/landing-page build        # static export → out/
pnpm --filter @ai-game-design-studio/landing-page typecheck
```

## When to update this app

- New section added to the canonical studio home → port it here.
- Asset regeneration in the skill → re-mirror PNGs into
  `public/assets/`.
- Game identity re-keying for a non-AGDS tenant → fork the surface,
  update copy, swap PNGs. Do not parameterize this surface for multi-tenancy.
