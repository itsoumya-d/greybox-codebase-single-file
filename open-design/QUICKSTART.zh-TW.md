# 快速上手 · Quickstart

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <b>繁體中文</b></p>

在本地執行完整的 AI Game Design Studio。

## 環境要求

- **Node.js：** `~24`（Node 24.x）。程式碼庫在 `package.json#engines` 中強制要求該版本。
- **pnpm：** `10.33.x`。程式碼庫透過 `packageManager` 固定為 `pnpm@10.33.2`；若使用 Corepack，該固定版本將被自動選中。
- **作業系統：** 主要支援 macOS、Linux、WSL2。Windows 原生環境大部分流程也可執行，但 WSL2 是更穩定的基準。
- **可選的本地 agent CLI：** Claude Code、Codex、Devin for Terminal、Gemini CLI、OpenCode、Cursor Agent、Qwen、Qoder CLI、GitHub Copilot CLI 等。即使未安裝任何 CLI，也可在 Settings 中切換至 BYOK API 模式。

`nvm` / `fnm` 為可選的便捷工具，並非專案必要依賴。如需使用，請在執行 pnpm 之前安裝並切換到 Node 24：

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

隨後啟用 Corepack，由程式碼庫自動選擇 pnpm：

```bash
corepack enable
corepack pnpm --version   # 應輸出 10.33.2
```

## 一條指令（dev 模式）

```bash
corepack enable
pnpm install
pnpm tools-dev run web # 在前景啟動 daemon + web
# 開啟 tools-dev 輸出的 web URL
```

如需將 desktop shell 和所有受管 sidecar 置於背景執行：

```bash
pnpm tools-dev # 在背景啟動 daemon + web + desktop
```

首次載入時，工作室 shell 會掃描已安裝的 code-agent CLI（Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI），並自動選擇其中之一；預設使用 `playable-game-prototype` skill 與 `Sci-Fi Tactical` game art bible。輸入 prompt，點擊 **Send**。Agent 將以串流方式輸出至左側面板；`<artifact>` 標籤會被解析，HTML 在右側即時渲染。執行完成後，點擊 **Save to disk**，artifact 將被寫入磁碟 `./.agds/artifacts/<timestamp>-<slug>/index.html`。

**Game Art Bible** 下拉選單內建 Arcade Neon、Fantasy RPG、Sci-Fi Tactical、Cozy Casual、Horror Survival、Sports Broadcast 等 game-first 美術聖經。選擇任意一套，playable concept、HUD、選單、level board 和 deck 都會套用一致的遊戲視覺語言。

**Skill** 下拉選單按 mode 分組（Playable Concept / Deck / Template / Game Art Bible），每個 mode 的預設 skill 帶有 `· default` 後綴。內建 skill 如下：

- **Playable concept** — `playable-game-prototype`, `desktop-game-ui`, `mobile-game-flow`, `game-hud-system`, `level-design-board`.
- **Deck / GDD** — `game-pitch-deck` and `game-design-document` for studio pitches, milestone decks, and production-ready game docs.

將 skill 與 game art bible 組合使用，僅需一句 prompt 即可產出符合版面配置規範、並採用所選視覺語言的原型或 deck。

## 其他腳本

```bash
pnpm tools-dev                 # 在背景啟動 daemon + web + desktop
pnpm tools-dev start web       # 在背景啟動 daemon + web
pnpm tools-dev run web         # 在前景啟動 daemon + web（e2e / dev server）
pnpm tools-dev restart         # 重新啟動 daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # 檢查受管理的 runtime 狀態
pnpm tools-dev logs            # 查看 daemon / web / desktop 日誌
pnpm tools-dev check           # 查看 status + 最近日誌 + 常見診斷
pnpm tools-dev stop            # 停止受管理的 runtime
pnpm --filter @ai-game-design-studio/daemon build  # 建置 apps/daemon/dist/cli.js，供 `agds` 使用
pnpm --filter @ai-game-design-studio/web build     # 在需要時建置 web package
pnpm typecheck                 # 對整個 workspace 執行 typecheck
```

`pnpm tools-dev` 是本地生命週期的唯一入口。請勿再使用已被移除的頂層歷史別名（`pnpm dev`、`pnpm dev:all`、`pnpm daemon`、`pnpm preview`、`pnpm start`）。

本地開發時，`tools-dev` 會先啟動 daemon，並將其連接埠傳遞給 `apps/web`，`apps/web/next.config.ts` 會將 `/api/*`、`/artifacts/*`、`/frames/*` 重寫到該 daemon 連接埠，從而使 App Router 能夠與相鄰的 Express 行程通訊，無需設定 CORS。

## 媒體生成 / agent dispatcher 問題排除

Image、video、audio、HyperFrames 等 skill 在透過 daemon 啟動 agent 時，會注入環境變數以呼叫本地 `agds` CLI：

- `AGDS_BIN` —— `apps/daemon/dist/cli.js` 的絕對路徑。
- `AGDS_DAEMON_URL` —— 目前執行的 daemon URL。
- `AGDS_PROJECT_ID` —— 目前啟用的專案 id。
- `AGDS_PROJECT_DIR` —— 目前啟用專案的檔案目錄。

若媒體生成發生錯誤 `AGDS_BIN: parameter not set`、提示找不到 `apps/daemon/dist/cli.js`、或出現 `failed to reach daemon at http://127.0.0.1:0`，請重新建置 daemon CLI 並重新啟動受管理的 runtime：

```bash
pnpm --filter @ai-game-design-studio/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

隨後，在 AI Game Design Studio shell 中**重新開啟**該專案，請勿重複使用先前 terminal 中的 agent 會話。由 daemon 啟動的 agent 應當能夠看到類似如下的值：

```bash
echo "AGDS_BIN=$AGDS_BIN"
echo "AGDS_PROJECT_ID=$AGDS_PROJECT_ID"
echo "AGDS_PROJECT_DIR=$AGDS_PROJECT_DIR"
echo "AGDS_DAEMON_URL=$AGDS_DAEMON_URL"
ls -la "$AGDS_BIN"
```

`AGDS_DAEMON_URL` 必須為真實的 daemon 連接埠，例如 `http://127.0.0.1:7457`，而非 `http://127.0.0.1:0`。`:0` 僅是內部用於「自動選擇可用連接埠」的啟動佔位值，不應洩漏到 agent 會話中。

僅執行 daemon 的生產模式下，daemon 會自行在 `http://localhost:7456` 提供 Next.js 的靜態匯出產物，不經過反向代理。

若在 daemon 前部署了 nginx，請關閉 SSE 路由的 buffering 與壓縮。常見問題：瀏覽器控制台在 80-90 秒後顯示錯誤 `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)`——原因是 nginx 的 `gzip on` 會緩衝分塊的 SSE 回應，即使 daemon 已傳送 `X-Accel-Buffering: no`。

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

## 兩種執行模式

| 模式 | picker 中的值 | 請求流轉路徑 |
|---|---|---|
| **Local CLI**（daemon 偵測到 agent 時的預設模式） | "Local CLI" | 前端 → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact 解析器 → 預覽 |
| **API 模式**（fallback / 未安裝 CLI） | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | 前端 → daemon `/api/proxy/{provider}/stream` → provider SSE 歸一化為 `delta/end/error` → artifact 解析器 → 預覽 |

兩種模式都會傳入**同一個** `<artifact>` 解析器與**同一個**沙箱 iframe。區別僅在於傳輸層和 system prompt 的投遞方式（本地 CLI 沒有獨立的 system 通道，因此組合好的 prompt 會被摺疊進 creator-role message）。

## Prompt 組合

每次 send 時，studio shell 都會從三層建構 system prompt，然後傳送至 provider：

```
BASE_SYSTEM_PROMPT   （輸出契約：用 <artifact> 包裹，不使用 code fence）
   + 目前啟用的 game art bible 正文  （DESIGN.md —— 色板 / 字型 / 版面配置）
   + 目前啟用的 skill 正文          （SKILL.md —— 工作流與輸出規則）
```

在頂部 bar 切換 skill 或 game art bible 後，下一次 send 將使用新的組合。正文會按 session 在記憶體中快取，每次切換僅需從 daemon 獲取一次。

## 檔案結構

```
ai-game-design-studio/
├── apps/
│   ├── daemon/                # Node/Express —— 啟動本地 agent + 提供 API
│   │   └── src/
│   │       ├── cli.ts             # 首選 `agds` CLI 入口
│   │       ├── server.ts          # /api/* + 靜態資源
│   │       ├── agents.ts          # 掃描 PATH 中的 claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot
│   │       ├── skills.ts          # SKILL.md loader（frontmatter 解析器）
│   │       └── game-art-bibles.ts # DESIGN.md loader
│   │   ├── sidecar/           # tools-dev daemon sidecar 包裝層
│   │   └── tests/             # daemon 包的測試
│   ├── web/                   # Next.js 16 App Router + React 客戶端
│       ├── app/               # App Router 入口
│       ├── src/               # React + TypeScript 客戶端 / runtime 模組
│       │   ├── App.tsx        # 調度 mode / skill / game-art-bible picker + send
│       │   ├── providers/     # daemon + BYOK API transport
│       │   ├── prompts/       # system、discovery、directions、deck framework
│       │   ├── artifacts/     # 串流 <artifact> 解析器 + manifest
│       │   ├── runtime/       # iframe srcdoc、markdown、export 輔助函數
│       │   └── state/         # localStorage + 由 daemon 持久化的專案狀態
│       ├── sidecar/           # tools-dev web sidecar 包裝層
│       └── next.config.ts     # tools-dev rewrites + 生產環境 apps/web/out 匯出配置
│   └── desktop/               # Electron runtime，由 tools-dev 啟動 / 檢查
├── packages/
│   ├── contracts/             # 共享的 web/daemon studio 契約
│   ├── sidecar-proto/         # AI Game Design Studio sidecar 協定契約
│   ├── sidecar/               # 通用 sidecar runtime 原語
│   └── platform/              # 通用 process/platform 原語
├── tools/dev/                 # `pnpm tools-dev` 生命週期與 inspect CLI
├── e2e/                       # Playwright UI + 外部整合 / Vitest 測試場
├── skills/                    # SKILL.md —— 任何 Claude Code skill 程式碼庫均可直接放入
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
├── game-art-bibles/            # DESIGN.md —— 遊戲美術聖經系統
│   ├── arcade-neon/           # 街機配色、輝光、HUD 處理
│   ├── fantasy-rpg/           # 羊皮紙、符文、背包、任務語言
│   ├── sci-fi-tactical/       # 戰術 HUD 與指揮 UI
│   ├── README.md              # 目錄概覽
│   └── …systems               # 精選 game-first 美術聖經
├── scripts/sync-game-art-bibles.ts    # 驗證精選遊戲美術聖經目錄
├── docs/                      # 工作室願景 + spec
├── .agds/                     # runtime 資料（gitignore，自動建立）
│   ├── app.sqlite              #   專案 / 對話 / 訊息 / 分頁
│   ├── artifacts/              #   一次性 "Save to disk" 產物
│   └── projects/<id>/          #   按專案劃分的工作目錄 + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # 頂層品質腳本 + `agds` bin
```

## 排障

- **"no agents found on PATH"** —— 安裝以下 CLI 之一：`claude`、`codex`、`devin`、`gemini`、`opencode`、`cursor-agent`、`qwen`、`qodercli`、`copilot`。或者在 Settings 中切換至 API mode，填入 provider key。
- **daemon 在 /api/chat 上返回 500** —— 查看 daemon 終端機的 stderr 尾部；通常是 CLI 拒絕了傳入的參數。不同 CLI 的 argv 結構各異；如需調整，請參閱 `apps/daemon/src/agents.ts` 中的 `buildArgs`。
- **媒體生成發生錯誤，`AGDS_BIN` 缺失、或 daemon URL 為 `:0`** —— 執行上述媒體 dispatcher 問題排除步驟。請勿重複使用既有的 CLI 會話；從 AI Game Design Studio shell 中重新開啟專案，daemon 才會注入新的 `AGDS_*` 變數。
- **Codex 載入的插件上下文過多** —— 使用 `AGDS_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` 啟動 AI Game Design Studio，daemon 啟動 Codex 時會傳入 `--disable plugins`。
- **artifact 始終不渲染** —— 模型輸出了文字但未使用 `<artifact>` 包裹。請確認 system prompt 已正確傳遞（查看 daemon 日誌），然後考慮更換能力更強的模型或更嚴格的 skill。

## 回到工作室願景

本 Quickstart 對應 [`docs/`](docs/) 中 spec 的可執行起點；spec 描述了其演進方向（見 [`docs/roadmap.md`](docs/roadmap.md)）。要點如下：

- `docs/architecture.md` 描述了目前這套已交付的 stack：前端為 Next.js 16 App Router，後端為本地 daemon；`apps/web/next.config.ts` 在 dev 模式下進行 rewrite，使瀏覽器始終透過同一套 `/api` 入口通訊。
- `docs/skills-protocol.md` 描述了完整的 `agds:` frontmatter（型別化輸入、slider、能力 gating）。目前 MVP 僅讀取 `name` / `description` / `triggers` / `agds.mode` / `agds.game_art_bible.requires` —— 如需支援更多欄位，請擴展 `apps/daemon/src/skills.ts`。
- `docs/agent-adapters.md` 展望了更豐富的 dispatch（能力偵測、串流 tool call）。我們的 `apps/daemon/src/agents.ts` 是最小化的 dispatcher —— 剛好足夠驗證鏈路通暢。
- `docs/modes.md` 列出了四種 mode：Playable Concept / Deck / Template / Game Art Bible。前兩種已提供對應的 skill；picker 已按 `mode` 過濾。
