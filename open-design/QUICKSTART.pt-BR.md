# Início rápido

<p align="center"><a href="QUICKSTART.md">English</a> · <b>Português (Brasil)</b> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a></p>

Rode o AI Game Design Studio inteiro localmente.

## Requisitos de ambiente

- **Node.js:** `~24` (Node 24.x). O repo força isso via `package.json#engines`.
- **pnpm:** `10.33.x`. O repo fixa `pnpm@10.33.2` via `packageManager`; use Corepack para selecionar a versão fixada automaticamente.
- **SO:** macOS, Linux e WSL2 são os caminhos principais. Windows nativo costuma funcionar para a maioria dos fluxos, mas WSL2 é a base mais segura.
- **CLI de agente local (opcional):** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, GitHub Copilot CLI etc. Sem nenhum instalado, use o modo BYOK API em Settings.

`nvm` / `fnm` são ferramentas opcionais de conveniência, não são parte obrigatória do setup do projeto. Se você usa um deles, instale/selecione o Node 24 antes de rodar pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Em seguida, habilite o Corepack e deixe o repo escolher o pnpm:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Em um único comando (modo dev)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

Para a shell desktop e todos os sidecars gerenciados em background:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

No primeiro carregamento, a shell do estúdio detecta o CLI de agente instalado (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen), seleciona automaticamente e usa por padrão o skill `playable-game-prototype` + game art bible `Sci-Fi Tactical`. Digite um prompt e clique em **Send**. O agente faz streaming no painel da esquerda; a tag `<artifact>` é parseada e o HTML é renderizado ao vivo na direita. Ao terminar, clique em **Save to disk** para persistir o artifact em `./.agds/artifacts/<timestamp>-<slug>/index.html`.

O dropdown **Game Art Bible** vem com game-first art bibles como Sci-Fi Tactical, Fantasy RPG, Arcade Neon, Cozy Casual, Horror Survival e Sports Broadcast. Escolha um para vestir cada protótipo com uma linguagem visual de jogo consistente.

O dropdown **Skill** agrupa por modo (Playable Concept / Deck / Template / Game Art Bible) e exibe o skill default de cada modo com um sufixo `· default`. Skills bundled:

- **Playable concept** — `playable-game-prototype`, `desktop-game-ui`, `mobile-game-flow`, `game-hud-system`, `level-design-board`.
- **Deck / GDD** — `game-pitch-deck` and `game-design-document` for studio pitches, milestone decks, and production-ready game docs.

Combine um skill com um game art bible e um único prompt produz um protótipo ou deck com layout adequado, na linguagem visual escolhida.

## Outros scripts

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
pnpm --filter @ai-game-design-studio/web build     # build do pacote web quando necessário
pnpm typecheck                 # workspace typecheck
```

`pnpm tools-dev` é o único entrypoint do ciclo de vida local. Não use os antigos atalhos do root removidos (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

Em desenvolvimento local, o `tools-dev` sobe o daemon primeiro, repassa a porta dele para `apps/web`, e o `apps/web/next.config.ts` reescreve `/api/*`, `/artifacts/*` e `/frames/*` para essa porta de daemon, permitindo que a shell de estúdio do App Router fale com o processo Express irmão sem configurar CORS.

## Verificações de geração de mídia / dispatcher de agente

Skills de imagem, vídeo, áudio e HyperFrames chamam o CLI local `agds` por meio de variáveis de ambiente que o daemon injeta ao spawnar um agente:

- `AGDS_BIN` — caminho absoluto para `apps/daemon/dist/cli.js`.
- `AGDS_DAEMON_URL` — URL do daemon em execução.
- `AGDS_PROJECT_ID` — id do projeto ativo.
- `AGDS_PROJECT_DIR` — diretório de arquivos do projeto ativo.

Se a geração de mídia falhar com `AGDS_BIN: parameter not set`, com `apps/daemon/dist/cli.js` ausente ou com `failed to reach daemon at http://127.0.0.1:0`, recompile o CLI do daemon e reinicie o runtime gerenciado:

```bash
pnpm --filter @ai-game-design-studio/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Em seguida, abra o projeto pelo shell AI Game Design Studio novamente em vez de retomar uma sessão antiga de agente no terminal. Um agente spawnado pelo daemon deve ver valores como:

```bash
echo "AGDS_BIN=$AGDS_BIN"
echo "AGDS_PROJECT_ID=$AGDS_PROJECT_ID"
echo "AGDS_PROJECT_DIR=$AGDS_PROJECT_DIR"
echo "AGDS_DAEMON_URL=$AGDS_DAEMON_URL"
ls -la "$AGDS_BIN"
```

`AGDS_DAEMON_URL` precisa ser uma porta de daemon real, como `http://127.0.0.1:7457`, e não `http://127.0.0.1:0`. O `:0` é apenas uma dica interna de "escolha uma porta livre" no launch e não deveria vazar para sessões de agente.

No modo de produção daemon-only, o próprio daemon serve o export estático do Next.js em `http://localhost:7456`, então não há reverse proxy envolvido.

Se você colocar nginx na frente do daemon, mantenha as rotas SSE sem buffering e sem compressão. Uma falha comum é o console do navegador mostrar `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` depois de 80–90 segundos, porque o `gzip on` do nginx bufferiza respostas SSE em chunks mesmo quando o daemon envia `X-Accel-Buffering: no`.

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

## Dois modos de execução

| Modo | Valor no picker | Como uma requisição flui |
|---|---|---|
| **Local CLI** (default quando o daemon detecta um agente) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → parser de artifact → preview |
| **API mode** (fallback / sem CLI) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → SSE do provider normalizado para `delta/end/error` → parser de artifact → preview |

Os dois modos alimentam o **mesmo** parser de `<artifact>` e o **mesmo** iframe sandboxed. A única diferença é o transporte e a entrega do system prompt (CLIs locais não têm um canal de sistema separado, então o prompt composto é dobrado dentro da mensagem do usuário).

## Composição de prompt

A cada envio, a shell do estúdio monta um system prompt a partir de três camadas e o envia ao provider:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active game art bible body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Troque o skill ou o game art bible na barra superior e o próximo envio usa a nova stack. Os corpos ficam em cache em memória por sessão, então é um único fetch ao daemon por escolha.

## Mapa de arquivos

```
ai-game-design-studio/
├── apps/
│   ├── daemon/                # Node/Express — spawns local agents + serves APIs
│   │   └── src/
│   │       ├── cli.ts             # preferred `agds` CLI entry
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # PATH scanner for claude/codex/devin/gemini/opencode/cursor-agent/qwen/copilot
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
├── game-art-bibles/            # DESIGN.md — sistemas de game art bible
│   ├── arcade-neon/           # paleta arcade, glow, tratamento de HUD
│   ├── fantasy-rpg/           # pergaminho, runas, inventário, linguagem de quests
│   ├── sci-fi-tactical/       # HUD tático e UI de comando
│   ├── README.md              # catalog overview
│   └── …systems               # game art bibles selecionadas
├── scripts/sync-game-art-bibles.ts    # verifica o catálogo de game art bibles
├── docs/                      # visão de estúdio + spec
├── .agds/                     # runtime data (gitignored, auto-created)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   one-off "Save to disk" renders
│   └── projects/<id>/          #   per-project working dir + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `agds` bin
```

## Solução de problemas

- **"no agents found on PATH"** — instale um destes: `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `copilot`. Ou troque para o modo API em Settings e cole uma chave de provider.
- **daemon 500 em /api/chat** — confira o terminal do daemon para a tail de stderr; geralmente o CLI rejeitou os args. CLIs diferentes aceitam formatos de argv diferentes; veja `buildArgs` em `apps/daemon/src/agents.ts` se precisar ajustar.
- **geração de mídia diz que `AGDS_BIN` está faltando ou que a URL do daemon é `:0`** — rode as verificações do dispatcher de mídia acima. Não retome a sessão antiga do CLI; reabra o projeto pelo shell AI Game Design Studio para o daemon injetar variáveis `AGDS_*` novas.
- **Codex carrega muito contexto de plugin** — suba o AI Game Design Studio com `AGDS_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` para que processos Codex spawnados pelo daemon rodem com `--disable plugins`.
- **artifact nunca renderiza** — o modelo emitiu texto sem empacotar em `<artifact>`. Confirme que o system prompt está chegando (cheque o log do daemon) e considere trocar para um modelo mais capaz ou um skill mais estrito.

## Voltando à visão

Este Início rápido é a semente executável da spec em [`docs/`](docs/). A spec descreve para onde isso evolui (veja [`docs/roadmap.md`](docs/roadmap.md)). Destaques:

- `docs/architecture.md` descreve a stack entregue: Next.js 16 App Router na frente, daemon local atrás, e os rewrites de `apps/web/next.config.ts` em dev mantendo o navegador conversando com a mesma superfície `/api`.
- `docs/skills-protocol.md` descreve o frontmatter `agds:` completo (inputs tipados, sliders, gating de capacidades). Este MVP lê apenas `name` / `description` / `triggers` / `agds.mode` / `agds.game_art_bible.requires` — estenda `apps/daemon/src/skills.ts` para cobrir o resto.
- `docs/agent-adapters.md` prevê dispatch mais rico (detecção de capacidade, tool-calls em streaming). Nosso `apps/daemon/src/agents.ts` é um dispatcher mínimo — suficiente para provar a fiação.
- `docs/modes.md` lista quatro modos: Playable Concept / Deck / Template / Game Art Bible. Entregamos skills para os dois primeiros; o picker já filtra por `mode`.
