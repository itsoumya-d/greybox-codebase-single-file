# Shared Game Viewport Frames

Reusable, pixel-accurate device chrome that any game skill can compose into a
cross-platform gameplay viewport, HUD preview, or multi-scene layout. Each
frame is a self-contained HTML snippet that renders a device shell and embeds
its inner gameplay screen through the existing
`<iframe src="?screen=...">` compatibility query parameter.

## Why These Exist

The mobile game flow skill has a one-scene iPhone frame baked into its seed
template. That covers many portrait game concepts. These shared frames cover
the remaining cross-platform studio previews:

- **Multi-scene flows**: three iPhones side by side showing tutorial beat 1 /
  2 / 3, combat HUD escalation, or inventory progression.
- **Multi-device sets**: desktop + tablet + phone views of the same game HUD,
  level board, or main menu.
- **Future game skills**: `game-hud-system`, `mobile-game-ui`, and
  `desktop-game-ui` can reuse these without re-inventing the chrome.

## Files

```
assets/frames/
├── README.md                ← you're reading this
├── iphone-15-pro.html       ← 390×844 + Dynamic Island
├── android-pixel.html       ← 412×900 + punch-hole camera
├── ipad-pro.html            ← 1024×1366 + USB-C edge
├── macbook.html             ← 1440×900 inside laptop chrome
└── browser-chrome.html      ← Safari/Chrome window with traffic lights
```

## Usage

Each frame accepts a `?screen=<path>` query parameter and renders that path
inside its inner gameplay viewport:

```html
<iframe
  src="../../assets/frames/iphone-15-pro.html?screen=scenes/hud-preview.html"
  width="390"
  height="844"
  loading="lazy"
></iframe>
```

In an AGDS-managed game project, the recommended pattern is:

```
my-game-project/
├── index.html               ← studio gallery: composes 3+ frames in a row
├── scenes/
│   ├── hud-preview.html     ← inner gameplay content rendered inside iphone-15-pro.html
│   ├── inventory.html
│   └── level-map.html
└── (no copy of frames — point at the shared assets folder)
```

## Gameplay Tokens

Each frame reads its inner gameplay screen's tokens via `postMessage` if you
want the bezel to tint with the active biome, faction, danger, or rarity
palette. The default state is "phone in hand" — neutral metallic — which works
against any game background.

## Authoring Rules

When extending this library:

1. **No external assets.** Inline all SVG. No font imports. No image URLs.
2. **One frame per file.** Don't bundle iPhone + Android in one HTML.
3. **`?screen=` query is the only contract.** Don't introduce other query
   params; the harness has to be predictable for game skills to use.
4. **The frame is decorative chrome only.** All gameplay, HUD, menu, or level
   content lives in the inner scene file. The frame must work with
   `?screen=about:blank` (showing just the device shell).
5. **Match real device dimensions.** iPhone 15 Pro is 390×844 logical pixels.
   iPad Pro 11" is 834×1194. Don't ship a "looks like" frame — the seed has
   to match.
