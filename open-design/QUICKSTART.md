# Quickstart

<p align="center"><b>English</b> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a></p>

Run the full AI Game Design Studio locally.

## Environment requirements

- **Node.js:** `~24` (Node 24.x). The repo enforces this through `package.json#engines`.
- **pnpm:** `10.33.x`. The repo pins `pnpm@10.33.2` through `packageManager`; use Corepack so the pinned version is selected automatically.
- **OS:** macOS, Linux, and WSL2 are the primary paths. Windows native should work for most flows, but WSL2 is the safer baseline.
- **Optional local agent CLI:** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI, etc. If none are installed, use the BYOK API mode from Settings.

### Local agent CLI and PATH

The daemon scans your **`PATH`** (plus common creator toolchain directories). If you install a CLI with **`npm install -g`** or **Homebrew** and AI Game Design Studio still shows it as *not installed*, the GUI may be starting with a minimal `PATH` that does not include your global npm or Homebrew `bin` directory (common on macOS when the studio is not launched from a full login shell). Ensure the executable’s directory is on `PATH` for the process that runs the daemon, then use **Rescan** in **Settings → Execution & model**.

`nvm` / `fnm` are optional convenience tools, not required project setup. If you use one, install/select Node 24 before running pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Then enable Corepack and let the repo select pnpm:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Docker Setup

Run AI Game Design Studio in a fully containerised environment without installing Node.js or pnpm locally.

### Requirements

* Docker Desktop
* Docker Compose v2

Verify Docker is installed correctly:

```bash
docker compose version
```

---

## Start AI Game Design Studio

From the repository root:

```bash
cd deploy
docker compose up -d
```

open the studio shell in your browser:

```text
http://localhost:7456
```

The first startup may take a few seconds while Docker pulls the latest image.

---

## Common Docker Commands

### View logs

```bash
docker compose logs -f
```

### Restart containers

```bash
docker compose restart
```

### Stop containers

```bash
docker compose down
```

### Pull the latest image

```bash
docker compose pull
docker compose up -d
```

### Remove all local studio data

```bash
docker compose down -v
```

---

## Environment Configuration

Create a `deploy/.env` file to override the default configuration:

```env
# Port exposed on the host
AGDS_WEB_PORT=7456

# Container memory limit
AGDS_MEM_LIMIT=384m

# Allowed CORS origins
AGDS_ALLOWED_ORIGINS=https://yourdomain.com

# Docker image tag
AGDS_IMAGE=docker.io/vanjayak/ai-game-design-studio:latest
```

---

## Persistent Storage

AI Game Design Studio stores projects and SQLite data inside a Docker volume:

```text
agds_data
```

The volume is mounted to:

```text
/app/.agds
```

Data persists across container restarts and image updates.

Inspect the volume:

```bash
docker volume inspect ai-game-design-studio_agds_data
```

---

## Notes

* Docker mode is ideal for contributors who do not want a local Node.js or pnpm setup.
* The container exposes the production daemon build directly on port `7456`.
* For development workflows and advanced local setup, see the rest of this Quickstart guide.

---

## One-shot (dev mode)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

For the desktop shell and all managed sidecars in the background:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

On first load, the studio shell detects your installed code-agent CLI (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI), picks it automatically, and defaults to `playable-game-prototype` plus a game art bible. Type a prompt such as `build a mobile roguelike dungeon crawler` and hit **Send**. The agent streams into the left pane; the `<artifact>` tag is parsed out and the playable HTML renders live on the right. When it finishes, click **Save to disk** to persist the artifact under `./.agds/artifacts/<timestamp>-<slug>/index.html`.

The **Game art bible** dropdown includes game-first systems such as Arcade Neon, Fantasy RPG, Sci-Fi Tactical, Cozy Casual, Pixel Retro, Horror Survival, Sports Broadcast, and Stylized 3D. Pick one to skin playable concepts, HUDs, menus, level boards, and pitch decks with a consistent game language.

The **Skill** dropdown groups by mode and shows the default skill per mode with a `· default` suffix. Bundled game skills:

- **Playable concept** — `playable-game-prototype`, `mobile-game-flow`, `desktop-game-ui`, `game-hud-system`, `level-design-board`.
- **Game pitch / GDD deck** — `game-pitch-deck`.
- **Game art bible** — `game-art-bible`.
- **Assets / trailer / audio** — `game-key-art`, `game-trailer-motion`, `game-audio-kit`.

Pair a skill with a game art bible and a single prompt produces a playable or production-ready game-design artifact in the chosen visual language.

## Other scripts

```bash
pnpm tools-dev                 # daemon + web + desktop in the background
pnpm tools-dev start web       # daemon + web in the background
pnpm tools-dev run web         # daemon + web in the foreground (e2e/dev server)
pnpm tools-dev restart         # restart daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # inspect managed runtimes
pnpm tools-dev logs            # show daemon/web/desktop logs
pnpm tools-dev check           # status + recent logs + common diagnostics
pnpm tools-dev stop            # stop managed runtimes
pnpm --filter @ai-game-design-studio/daemon build  # build apps/daemon/dist/cli.js for `agds`
pnpm --filter @ai-game-design-studio/web build     # build the web package when needed
pnpm typecheck                 # workspace typecheck
```

`pnpm tools-dev` is the only local lifecycle entry point. Do not use the removed legacy root aliases (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

During local development, `tools-dev` starts the daemon first, passes its port into `apps/web`, and `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to that daemon port so the App Router studio shell can talk to the sibling Express process without CORS setup.

## Media generation / agent dispatcher checks

Image, video, audio, and HyperFrames skills call the local `agds` CLI through environment variables injected by the daemon when it spawns an agent:

- `AGDS_BIN` — absolute path to `apps/daemon/dist/cli.js`.
- `AGDS_DAEMON_URL` — the running daemon URL.
- `AGDS_PROJECT_ID` — the active project id.
- `AGDS_PROJECT_DIR` — the active project's file directory.

Deprecated old-name aliases are still injected for older saved wrappers, but new skills and docs should use `AGDS_*`.

If media generation fails with `AGDS_BIN: parameter not set`, `apps/daemon/dist/cli.js` missing, or `failed to reach daemon at http://127.0.0.1:0`, rebuild the daemon CLI and restart the managed runtime:

```bash
pnpm --filter @ai-game-design-studio/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Then open the project from the AI Game Design Studio shell again instead of resuming an old terminal agent session. A daemon-spawned agent should see values like:

```bash
echo "AGDS_BIN=$AGDS_BIN"
echo "AGDS_PROJECT_ID=$AGDS_PROJECT_ID"
echo "AGDS_PROJECT_DIR=$AGDS_PROJECT_DIR"
echo "AGDS_DAEMON_URL=$AGDS_DAEMON_URL"
ls -la "$AGDS_BIN"
```

`AGDS_DAEMON_URL` must be a real daemon port such as `http://127.0.0.1:7457`, not `http://127.0.0.1:0`. The `:0` value is only an internal "pick a free port" launch hint and should not leak into agent sessions.

For the daemon-only production mode, the daemon serves the static Next.js export itself at `http://localhost:7456`, so no reverse proxy is involved.

If you place nginx in front of the daemon, keep SSE routes unbuffered and uncompressed. A common failure is the browser console showing `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` after 80-90 seconds because nginx `gzip on` buffers chunked SSE responses even when the daemon sends `X-Accel-Buffering: no`.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Two execution modes

| Mode | Picker value | How a request flows |
|---|---|---|
| **Local CLI** (default when daemon detects an agent) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **API mode** (fallback / no CLI) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → provider SSE normalized to `delta/end/error` → artifact parser → preview |

Both modes feed the **same** `<artifact>` parser and the **same** sandboxed iframe. The only thing that differs is the transport and the system-prompt delivery (local CLIs have no separate system channel, so the composed prompt is folded into the creator-role message).

## Prompt composition

For every send, the studio shell builds a system prompt from three layers and sends it to the provider:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active game art bible body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Swap the skill or the game art bible in the top bar and the next send uses the new stack. Bodies are cached in-memory per session so this is a single daemon fetch per pick.

## File map

```
ai-game-design-studio/
├── apps/
│   ├── daemon/                # Node/Express — spawns local agents + serves APIs
│   │   └── src/
│   │       ├── cli.ts             # canonical `agds` CLI entry
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # PATH scanner for claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot
│   │       ├── skills.ts          # SKILL.md loader (frontmatter parser)
│   │       └── game-art-bibles.ts # DESIGN.md loader
│   │   ├── sidecar/           # tools-dev daemon sidecar wrapper
│   │   └── tests/             # daemon package tests
│   ├── web/                   # Next.js 16 App Router + React client
│       ├── app/               # App Router entrypoints
│       ├── src/               # React + TypeScript client/runtime modules
│       │   ├── App.tsx        # orchestrates mode / skill / game-art-bible pickers + send
│       │   ├── providers/     # daemon + BYOK API transports
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # streaming <artifact> parser + manifests
│       │   ├── runtime/       # iframe srcdoc, markdown, export helpers
│       │   └── state/         # localStorage + daemon-backed project state
│       ├── sidecar/           # tools-dev web sidecar wrapper
│       └── next.config.ts     # tools-dev rewrites + prod apps/web/out export config
│   └── desktop/               # Electron runtime, launched/inspected by tools-dev
├── packages/
│   ├── contracts/             # shared studio web/daemon contracts
│   ├── sidecar-proto/         # AI Game Design Studio sidecar protocol contract
│   ├── sidecar/               # generic sidecar runtime primitives
│   └── platform/              # generic process/platform primitives
├── tools/dev/                 # `pnpm tools-dev` lifecycle and inspect CLI
├── e2e/                       # Playwright UI + external integration/Vitest harness
├── skills/                    # SKILL.md — game-design workflows
│   ├── playable-game-prototype/ # default playable HTML concept
│   ├── mobile-game-flow/        # mobile portrait/landscape game screens
│   ├── desktop-game-ui/         # desktop menus, HUD, inventory, map, quest shell
│   ├── game-hud-system/         # HUD-only readability and state systems
│   ├── level-design-board/      # maps, encounters, traversal, hazards, pacing
│   ├── game-art-bible/          # visual identity and asset direction
│   ├── game-pitch-deck/         # GDD / studio pitch deck
│   ├── game-key-art/            # image prompts for key art and assets
│   ├── game-trailer-motion/     # trailer / HyperFrames motion prompts
│   └── game-audio-kit/          # music, ambience, UI, combat, victory prompts
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{art-direction,layouts,gameplay-modules,checklist}.md
├── game-art-bibles/            # DESIGN.md — game art bible systems
│   ├── arcade-neon/           # arcade palette, glow, HUD treatment
│   ├── fantasy-rpg/           # parchment, rune, inventory, quest language
│   ├── sci-fi-tactical/       # tactical HUD and command UI
│   ├── README.md              # catalog overview
│   └── …systems               # curated game-first art bibles
├── scripts/sync-game-art-bibles.ts   # verify curated game-art-bible catalog
├── docs/                      # studio vision + spec
├── .agds/                     # runtime data (gitignored, auto-created)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   one-off "Save to disk" renders
│   └── projects/<id>/          #   per-project working dir + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `agds` bin
```

## Troubleshooting

- **`better-sqlite3` fails to load / ABI mismatch after a Node.js version change** — `pnpm install` re-runs `postinstall` automatically and rebuilds the native addon for the current Node.js. To rebuild manually or verify the fix: `pnpm --filter @ai-game-design-studio/daemon rebuild better-sqlite3` then `pnpm --filter @ai-game-design-studio/daemon exec node -e "require('better-sqlite3')"`. Requires build tools: `python3`, `make`, `g++` (or `clang++`). If you have `ignore-scripts=true` in your `.npmrc`, run `node scripts/postinstall.mjs` after `pnpm install`.
- **"no agents found on PATH"** — install one of: `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `qodercli`, `copilot`. Or switch to API mode in Settings and paste a provider key.
- **daemon 500 on /api/chat** — check the daemon terminal for the stderr tail; usually the CLI rejected its args. Different CLIs take different argv shapes; see `apps/daemon/src/agents.ts` `buildArgs` if you need to tweak.
- **media generation says `AGDS_BIN` is missing or daemon URL is `:0`** — run the media dispatcher checks above. Do not resume the old CLI session; reopen the project from the AI Game Design Studio shell so the daemon can inject fresh `AGDS_*` variables.
- **Codex loads too much plugin context** — start AI Game Design Studio with `AGDS_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` to make daemon-spawned Codex processes run with `--disable plugins`.
- **artifact never renders** — the model produced text without wrapping in `<artifact>`. Confirm the system prompt is going through (check daemon log) and consider switching to a more capable model or a stricter skill.

## Mapping back to the vision

This Quickstart is the runnable seed of the spec in [`docs/`](docs/). The spec describes where this grows (see [`docs/roadmap.md`](docs/roadmap.md)). Highlights:

- `docs/architecture.md` describes the shipped stack: Next.js 16 App Router in front, local daemon behind it, and `apps/web/next.config.ts` rewrites in dev to keep the browser talking to the same `/api` surface.
- `docs/skills-protocol.md` describes the full `agds:` frontmatter (typed inputs, sliders, capability gating). This MVP reads `name` / `description` / `triggers` / `agds.mode` / `agds.game_art_bible.requires` only — extend `apps/daemon/src/skills.ts` to add the rest.
- `docs/agent-adapters.md` foresees richer dispatch (capability detection, streaming tool-calls). Our `apps/daemon/src/agents.ts` is a minimal dispatcher — enough to prove the wiring.
- `docs/modes.md` lists the game-studio modes for playable concepts, GDD/pitch decks, production templates, and art-bible systems. The picker already filters by `mode`.
