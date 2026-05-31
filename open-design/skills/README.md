# Game Skills

A skill is the atomic unit of game-design capability in AI Game Design Studio: one folder, one `SKILL.md`, optional `assets/` and `references/`. The daemon scans this directory at startup; drop a folder in, restart, and the picker shows it when it is game-native.

## Adding a new skill

-> **[`docs/skills-contributing.md`](../docs/skills-contributing.md)** - the contributor guide. Quick start, anatomy, local dev loop, merge bar, PR template, and common rejection patterns.

-> **[`docs/skills-protocol.md`](../docs/skills-protocol.md)** - the protocol spec. Frontmatter grammar, discovery rules, mode semantics.

The fastest path is to copy the existing game skill closest to your idea, edit `SKILL.md` and `example.html`, and read the contributor guide before opening the PR. We're picky about skills because they're the creator-facing studio surface: they should produce playable concepts, HUDs, menus, level boards, GDDs, art bibles, assets, trailers, audio kits, or concrete game-system specs.

## Game skills that already ship

The `mode` and `featured` flags in each skill's `SKILL.md` decide where it shows up in the picker. The list below is a quick orientation; for a curated set of "imitate this if you're starting from scratch" skills, see the **References** section in [`docs/skills-contributing.md`](../docs/skills-contributing.md).

```bash
# Browse the registry from the CLI:
ls skills/
# Game-native skills across playable-concept (`prototype`), deck, template, game-art-bible, image, video, and audio modes
```

Core game workflows include `playable-game-prototype`, `game-hud-system`,
`desktop-game-ui`, `mobile-game-flow`, `level-design-board`,
`game-art-bible`, `game-pitch-deck`, `game-key-art`,
`game-trailer-motion`, `game-audio-kit`, and `sprite-animation`.

Advanced game-system modules include `rpg-systems`, `combat-system`,
`survival-module`, `economy-progression`, `encounter-design`,
`narrative-branching`, `procedural-generation`, `multiplayer-lobby`,
`mobile-game-ui`, `game-design-document`, `live-ops-calendar`, and
`inventory-crafting`.

Compatibility skill folders remain on disk for stored projects and old links,
but the daemon aliases those ids to game-native replacements and hides them
from the default game-first catalog.

## License

Skills in this directory are Apache-2.0 unless their own `LICENSE` says otherwise.
