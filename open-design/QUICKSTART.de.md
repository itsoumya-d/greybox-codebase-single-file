# Schnellstart

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a></p>

Führen Sie das vollständige AI Game Design Studio lokal aus.

## Umgebungsanforderungen

- **Node.js:** `~24` (Node 24.x). Das Repository erzwingt dies über `package.json#engines`.
- **pnpm:** `10.33.x`. Das Repository pinnt `pnpm@10.33.2` über `packageManager`; verwenden Sie Corepack, damit automatisch die gepinnte Version gewählt wird.
- **OS:** macOS, Linux und WSL2 sind die primären Pfade. Windows nativ sollte für die meisten Abläufe funktionieren, WSL2 ist aber die sicherere Basis.
- **Optionale lokale Agent-CLI:** Claude Code, Codex, Gemini CLI, OpenCode, Cursor Agent, Qwen, GitHub Copilot CLI usw. Wenn keine installiert ist, verwenden Sie den BYOK-API-Modus in den Einstellungen.

`nvm` / `fnm` sind optionale Komfortwerkzeuge, keine Voraussetzung für das Projektsetup. Wenn Sie eines davon verwenden, installieren/selektieren Sie Node 24 vor pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Aktivieren Sie dann Corepack und lassen Sie das Repository pnpm auswählen:

```bash
corepack enable
corepack pnpm --version   # sollte 10.33.2 ausgeben
```

## One-shot (Dev-Modus)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # startet daemon + web im Vordergrund
# öffnen Sie die von tools-dev ausgegebene Web-URL
```

Für die Desktop-Shell und alle verwalteten Sidecars im Hintergrund:

```bash
pnpm tools-dev # startet daemon + web + desktop im Hintergrund
```

Beim ersten Laden erkennt die Studio-Shell Ihre installierte Code-Agent-CLI (Claude Code / Codex / Gemini / OpenCode / Cursor Agent / Qwen), wählt sie automatisch und nutzt standardmäßig den `playable-game-prototype` Skill sowie das `Sci-Fi Tactical` Game Art Bible. Geben Sie einen Prompt ein und klicken Sie auf **Senden**. Der Agent streamt in den linken Bereich; das `<artifact>` Tag wird herausgeparst und das HTML rechts live gerendert. Nach Abschluss können Sie das Artifact mit **Auf Datenträger speichern** unter `./.agds/artifacts/<timestamp>-<slug>/index.html` speichern.

Das Dropdown **Game Art Bible** enthält game-first Art-Bible-Systeme wie Sci-Fi Tactical, Fantasy RPG, Arcade Neon, Cozy Casual, Horror Survival und Sports Broadcast. Wählen Sie eines aus, um jeden Prototyp in einer spielbaren visuellen Sprache zu gestalten.

Das Dropdown **Skill** gruppiert nach Modus (Prototyp / Deck / Template / Game Art Bible) und zeigt den Default-Skill pro Modus mit dem Suffix `· default`. Gebündelte Skills:

- **Playable concept** — `playable-game-prototype`, `desktop-game-ui`, `mobile-game-flow`, `game-hud-system`, `level-design-board`.
- **Deck / GDD** — `game-pitch-deck` and `game-design-document` for studio pitches, milestone decks, and production-ready game docs.

Kombinieren Sie Skill, Game Art Bible und einen einzelnen Prompt, und Sie erhalten einen layoutpassenden Prototyp oder ein Deck in der gewählten visuellen Sprache.

## Weitere Skripte

```bash
pnpm tools-dev                 # daemon + web + desktop im Hintergrund
pnpm tools-dev start web       # daemon + web im Hintergrund
pnpm tools-dev run web         # daemon + web im Vordergrund (e2e/dev server)
pnpm tools-dev restart         # daemon + web + desktop neu starten
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # verwaltete Runtimes prüfen
pnpm tools-dev logs            # daemon/web/desktop logs anzeigen
pnpm tools-dev check           # status + aktuelle logs + gängige Diagnosen
pnpm tools-dev stop            # verwaltete Runtimes stoppen
pnpm --filter @ai-game-design-studio/daemon build  # apps/daemon/dist/cli.js für `agds` bauen
pnpm --filter @ai-game-design-studio/web build     # Web-Paket bei Bedarf bauen
pnpm typecheck                 # Workspace-Typecheck
```

`pnpm tools-dev` ist der einzige lokale Lifecycle-Einstieg. Verwenden Sie nicht die entfernten Legacy-Root-Aliasse (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

Während lokaler Entwicklung startet `tools-dev` zuerst den daemon, übergibt dessen Port an `apps/web`, und `apps/web/next.config.ts` rewritet `/api/*`, `/artifacts/*` und `/frames/*` auf diesen daemon-Port. So kann die App-Router-Studio-Shell ohne CORS-Setup mit dem sibling Express-Prozess sprechen.

## Prüfungen für Mediengenerierung und Agent-Dispatcher

Image-, Video-, Audio- und HyperFrames-Skills rufen die lokale `agds` CLI über Umgebungsvariablen auf, die der daemon beim Start eines Agent injiziert:

- `AGDS_BIN` — absoluter Pfad zu `apps/daemon/dist/cli.js`.
- `AGDS_DAEMON_URL` — die laufende daemon-URL.
- `AGDS_PROJECT_ID` — die aktive Projekt-ID.
- `AGDS_PROJECT_DIR` — das Dateiverzeichnis des aktiven Projekts.

Wenn Mediengenerierung mit `AGDS_BIN: parameter not set`, fehlendem `apps/daemon/dist/cli.js` oder `failed to reach daemon at http://127.0.0.1:0` fehlschlägt, bauen Sie die daemon-CLI neu und starten Sie die verwaltete Runtime neu:

```bash
pnpm --filter @ai-game-design-studio/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Öffnen Sie danach das Projekt erneut aus der AI Game Design Studio shell, statt eine alte Terminal-Agent-Session fortzusetzen. Ein vom daemon gestarteter Agent sollte Werte wie diese sehen:

```bash
echo "AGDS_BIN=$AGDS_BIN"
echo "AGDS_PROJECT_ID=$AGDS_PROJECT_ID"
echo "AGDS_PROJECT_DIR=$AGDS_PROJECT_DIR"
echo "AGDS_DAEMON_URL=$AGDS_DAEMON_URL"
ls -la "$AGDS_BIN"
```

`AGDS_DAEMON_URL` muss ein echter daemon-Port wie `http://127.0.0.1:7457` sein, nicht `http://127.0.0.1:0`. Der Wert `:0` ist nur ein interner Hinweis für "freien Port wählen" und darf nicht in Agent-Sessions gelangen.

Im daemon-only Production Mode serviert der daemon den statischen Next.js Export selbst unter `http://localhost:7456`; ein Reverse Proxy ist dafür nicht beteiligt.

Wenn Sie nginx vor den daemon setzen, halten Sie SSE-Routen ungepuffert und unkomprimiert. Ein häufiger Fehler ist, dass die Browser-Konsole nach 80-90 Sekunden `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` zeigt, weil nginx `gzip on` chunked SSE Antworten puffert, obwohl der daemon `X-Accel-Buffering: no` sendet.

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

## Zwei Ausführungsmodi

| Modus | Picker-Wert | Ablauf einer Anfrage |
|---|---|---|
| **Local CLI** (Standard, wenn der daemon einen Agent erkennt) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **Anthropic API** (Fallback / keine CLI) | "Anthropic API · BYOK" | Frontend → `@anthropic-ai/sdk` direkt (`dangerouslyAllowBrowser`) → artifact parser → preview |

Beide Modi speisen denselben `<artifact>` Parser und denselben sandboxed iframe. Unterschiedlich sind nur Transport und System-Prompt-Auslieferung: lokale CLIs haben keinen separaten Systemkanal, daher wird der zusammengesetzte Prompt in die Creator-Role Message gefaltet.

## Prompt-Zusammensetzung

Bei jedem Senden baut die Studio-Shell einen System Prompt aus drei Schichten und sendet ihn an den Provider:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active game art bible body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Wechseln Sie Skill oder Game Art Bible in der oberen Leiste, nutzt die nächste Anfrage den neuen Stack. Bodies werden pro Session im Speicher gecacht; pro Auswahl ist also nur ein daemon fetch nötig.

## Dateistruktur

```
ai-game-design-studio/
├── apps/
│   ├── daemon/                # Node/Express — spawns local agents + serves APIs
│   │   └── src/
│   │       ├── cli.ts             # bevorzugter `agds` CLI entry
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # PATH scanner for claude/codex/gemini/opencode/cursor-agent/qwen/copilot
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
│   ├── contracts/             # shared web/daemon studio contracts
│   ├── sidecar-proto/         # AI Game Design Studio sidecar protocol contract
│   ├── sidecar/               # generic sidecar runtime primitives
│   └── platform/              # generic process/platform primitives
├── tools/dev/                 # `pnpm tools-dev` lifecycle and inspect CLI
├── e2e/                       # Playwright UI + external integration/Vitest harness
├── skills/                    # SKILL.md — drops in from any Claude Code skill repo
│   ├── playable-game-prototype/ # default playable concept
│   ├── desktop-game-ui/        # desktop HUD, inventory, map, and quest shell
│   ├── game-hud-system/        # HUD-only systems and readability states
│   ├── game-pitch-deck/       # studio pitch deck and milestone narrative
│   ├── game-design-document/  # production-ready GDD scaffold
│   ├── level-design-board/    # encounter, gate, and reward flow board
│   ├── mobile-game-flow/      # portrait and landscape mobile game screens
│   ├── game-key-art/          # image prompts for game assets and splash art
│   └── game-trailer-motion/   # video and motion prompts for trailers
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,gameplay-modules,checklist}.md
├── game-art-bibles/            # DESIGN.md — Game-Art-Bible-Systeme
│   ├── arcade-neon/           # Arcade-Palette, Glow, HUD-Behandlung
│   ├── fantasy-rpg/           # Pergament, Runen, Inventar, Quest-Sprache
│   ├── sci-fi-tactical/       # taktisches HUD und Kommando-UI
│   ├── README.md              # catalog overview
│   └── …systems               # kuratierte game-first Art-Bibles
├── scripts/sync-game-art-bibles.ts    # kuratierten Game-Art-Bible-Katalog prüfen
├── docs/                      # Studio-Vision + Spec
├── .agds/                     # runtime data (gitignored, auto-created)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   one-off "Save to disk" renders
│   └── projects/<id>/          #   per-project working dir + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `agds` bin
```

## Fehlerbehebung

- **"no agents found on PATH"** — installieren Sie eine davon: `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `copilot`. Alternativ wechseln Sie in der oberen Leiste zu "Anthropic API · BYOK" und fügen in **Einstellungen** einen Key ein.
- **daemon 500 on /api/chat** — prüfen Sie das daemon-Terminal und den stderr-Auszug; meist hat die CLI ihre Argumente abgelehnt. Unterschiedliche CLIs haben unterschiedliche argv-Formen; siehe `apps/daemon/src/agents.ts` `buildArgs`, falls Sie nachjustieren müssen.
- **media generation says `AGDS_BIN` is missing or daemon URL is `:0`** — führen Sie die Media Dispatcher Checks oben aus. Setzen Sie keine alte CLI-Session fort; öffnen Sie das Projekt aus der AI Game Design Studio shell neu, damit der daemon frische `AGDS_*` Variablen injiziert.
- **Codex lädt zu viel Plugin-Kontext** — starten Sie AI Game Design Studio mit `AGDS_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev`, damit vom daemon gestartete Codex-Prozesse mit `--disable plugins` laufen.
- **artifact never renders** — das Modell hat Text ohne `<artifact>` Wrapper erzeugt. Prüfen Sie, ob der System Prompt ankommt (daemon log), und wechseln Sie ggf. zu einem stärkeren Modell oder strengeren Skill.

## Bezug zur Vision

Dieser Schnellstart ist der lauffähige Einstieg zur Spec in [`docs/`](docs/). Die Spec beschreibt, wohin das Projekt wächst (siehe [`docs/roadmap.md`](docs/roadmap.md)). Highlights:

- `docs/architecture.md` beschreibt den ausgelieferten Stack: Next.js 16 App Router vorne, lokaler daemon dahinter und `apps/web/next.config.ts` Rewrites in dev, damit der Browser mit derselben `/api` Oberfläche spricht.
- `docs/skills-protocol.md` beschreibt das vollständige `agds:` Frontmatter (typed inputs, sliders, capability gating). Dieses MVP liest nur `name` / `description` / `triggers` / `agds.mode` / `agds.game_art_bible.requires`; erweitern Sie [`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts), um den Rest hinzuzufügen.
- `docs/agent-adapters.md` sieht reicheren Dispatch vor (capability detection, streaming tool-calls). Unser `apps/daemon/src/agents.ts` ist ein minimaler Dispatcher: genug, um die Verdrahtung zu beweisen.
- `docs/modes.md` listet die Modi Playable Concept / Deck / Template / Game Art Bible. Wir liefern Skills für die ersten beiden; der Picker filtert bereits nach `mode`.
