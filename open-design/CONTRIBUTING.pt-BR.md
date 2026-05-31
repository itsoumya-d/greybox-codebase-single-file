# Contribuindo com o AI Game Design Studio

Obrigado por considerar contribuir. O AI Game Design Studio é pequeno de propósito — a maior parte do valor mora em **arquivos** (skills, game art bibles, fragmentos de prompt) e não em código de framework. Isso significa que as contribuições com maior alavancagem geralmente são uma pasta, um arquivo Markdown ou um adapter do tamanho de um PR.

Este guia diz exatamente onde olhar para cada tipo de contribuição e qual a barra que um PR precisa atingir antes do merge.

<p align="center"><a href="CONTRIBUTING.md">English</a> · <b>Português (Brasil)</b> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a></p>

---

## Três coisas que dá pra entregar em uma tarde

| Se você quer… | Você está adicionando | Onde mora | Tamanho da entrega |
|---|---|---|---|
| Fazer o AI Game Design Studio renderizar um novo tipo de artifact (um boss board, um HUD, um mapa de fase…) | uma **Skill** | [`skills/<sua-skill>/`](skills/) | uma pasta, ~2 arquivos |
| Fazer o AI Game Design Studio falar a direção de arte de um novo jogo | um **Game Art Bible** | [`game-art-bibles/<identidade de jogo>/DESIGN.md`](game-art-bibles/) | um arquivo Markdown |
| Plugar um novo CLI de agente de código | um **Adapter de agente** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | ~10 linhas em um array |
| Adicionar uma capacidade de estúdio, corrigir um bug, trazer um padrão de interação de estúdio de jogos do [`open-codesign`][ocod] | código | `apps/web/src/`, `apps/daemon/` | PR normal |
| Melhorar docs, traduzir uma seção para Français / Deutsch / 中文, corrigir typos | docs | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | um PR |

Se você não tem certeza em qual balde sua ideia se encaixa, [abra primeiro uma discussion / issue](https://github.com/ai-game-design-studio/ai-game-design-studio/issues/new) e te apontamos para a superfície certa.

---

## Setup local

O setup completo numa página mora em [`QUICKSTART.pt-BR.md`](QUICKSTART.pt-BR.md). O TL;DR para contribuidores:

```bash
git clone https://github.com/ai-game-design-studio/ai-game-design-studio.git
cd ai-game-design-studio
corepack enable           # selects the pinned pnpm from packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @ai-game-design-studio/web build  # build do pacote web quando necessário
```

Node `~24` e pnpm `10.33.x` são obrigatórios. `nvm` / `fnm` são opcionais; use `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` se preferir gerenciar Node assim. macOS, Linux e WSL2 são os caminhos principais. Windows nativo costuma funcionar, mas não é alvo principal — abra uma issue se quebrar.

Você não precisa de nenhum CLI de agente no `PATH` para desenvolver o próprio AI Game Design Studio — o daemon dirá "no agents found" e cairá no caminho **Anthropic API · BYOK**, que é o loop de dev mais rápido de qualquer jeito.

---

## Adicionando uma nova Skill

Uma skill é uma pasta sob [`skills/`](skills/) com um `SKILL.md` na raiz, seguindo a [convenção `SKILL.md`][skill] do Claude Code mais nossa extensão opcional `agds:`. **Não há passo de registro.** Coloque a pasta, reinicie o daemon e o picker mostra.

### Layout da pasta da skill

```text
skills/your-skill/
├── SKILL.md                    # required
├── assets/template.html        # optional but recommended — the seed file
├── references/                 # optional — knowledge files the agent reads
│   ├── layouts.md
│   ├── gameplay-modules.md
│   └── checklist.md
└── example.html                # strongly recommended — a real, hand-built sample
```

### Frontmatter do `SKILL.md`

As três primeiras chaves são a base spec do Claude Code — `name`, `description`, `triggers`. Tudo sob `agds:` é específico do AI Game Design Studio e opcional, mas **`agds.mode`** decide em qual grupo a skill aparece (Prototype / Deck / Template / Game Art Bible).

```yaml
---
name: your-skill
description: |
  One-paragraph elevator pitch. The agent reads this verbatim to decide
  if the creator's brief matches. Be concrete: surface, audience, what's in
  the artifact, what's not.
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"
agds:
  mode: prototype           # prototype | deck | template | game-art-bible
  platform: desktop         # desktop | mobile
  scenario: combat-hud       # free-form tag for grouping
  featured: 1               # any positive integer surfaces it under "Showcase examples"
  preview:
    type: html              # html | jsx | pptx | markdown
    entry: index.html
  game_art_bible:
    requires: true          # does the skill read the active DESIGN.md?
    sections: [color, typography, layout, gameplay-modules]
  example_prompt: "A copy-pastable prompt that nicely shows what this skill does."
---

# Your Skill

Body is free-form Markdown describing the workflow the agent should follow…
```

A gramática completa — inputs tipados, parâmetros de slider, gating de capacidades — vive em [`docs/skills-protocol.md`](docs/skills-protocol.md).

### Barra para mergear uma nova skill

Somos exigentes com skills porque elas são a superfície voltada para o usuário. Uma nova skill precisa:

1. **Trazer um `example.html` real.** Feito à mão, abre direto do disco e parece algo que um designer entregaria. Sem lorem ipsum, sem hero placeholder `<svg><rect/></svg>`. Se você não consegue construir o exemplo, provavelmente a skill ainda não está pronta.
2. **Passar no checklist anti-AI-slop** no corpo. Sem gradiente roxo, sem ícones genéricos de emoji, sem card arredondado com borda lateral de destaque, sem Inter como fonte de *display*, sem stats inventados. Leia a seção **Anti-AI-slop machinery** do README para a lista completa.
3. **Placeholders honestos.** Quando o agente não tem um número real, escreva `—` ou um bloco cinza com label, não "10× mais rápido".
4. **Ter um `references/checklist.md`** com pelo menos os gates P0 (o que o agente precisa passar antes de emitir `<artifact>`). Pegue o formato em [`skills/game-pitch-deck/SKILL.md`](skills/game-pitch-deck/) ou [`skills/playable-game-prototype/SKILL.md`](skills/playable-game-prototype/).
5. **Adicionar um screenshot** em `docs/screenshots/skills/<skill>.png` se a skill for featured. PNG, ~1024×640 retina, capturado do `example.html` real em zoom-out do navegador.
6. **Ser uma única pasta self-contained.** Sem imports de CDN além do que outras skills já usam; sem fontes que você não licenciou; sem imagens maiores que ~250 KB.

Se você forkar uma skill existente (por exemplo, partir do `playable-game-prototype` e remixar para um `encounter-design`), preserve o LICENSE original e a autoria em `references/` e mencione isso na descrição do PR.

### Skills já entregues — pegue uma para imitar

- Showcase visual, protótipo de tela única: [`skills/playable-game-prototype/`](skills/playable-game-prototype/), [`skills/game-design-document/`](skills/game-design-document/)
- Fluxo mobile multi-frame: [`skills/mobile-game-flow/`](skills/mobile-game-flow/), [`skills/mobile-game-ui/`](skills/mobile-game-ui/)
- Documento / template (sem game art bible obrigatório): [`skills/game-design-document/`](skills/game-design-document/), [`skills/live-ops-calendar/`](skills/live-ops-calendar/)
- Modo deck: [`skills/game-pitch-deck/`](skills/game-pitch-deck/) e [`skills/game-design-document/`](skills/game-design-document/)

---

## Adicionando um novo Game Art Bible

Um game art bible é um único arquivo [`DESIGN.md`](game-art-bibles/README.md) sob `game-art-bibles/<slug>/`. **Um arquivo, sem código.** Coloque, reinicie o daemon, o picker mostra agrupado por categoria.

### Layout da pasta do game art bible

```text
game-art-bibles/your-game/
└── DESIGN.md
```

### Formato do `DESIGN.md`

```markdown
# Game Art Bible Inspired by YourGame

> Category: Game UI / HUD
> One-line summary that shows in the picker preview.

## 1. Art Direction & Atmosphere
…

## 2. Color
- Primary: `#hex` / `oklch(...)`
- …

## 3. Typography
…

## 4. Spacing & Grid
## 5. Layout & Composition
## 6. Módulos de gameplay e elementos de HUD
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

O schema de 9 seções é fixo — é o que os corpos das skills procuram via grep. O primeiro H1 vira o label do picker (o prefixo `Game Art Bible Inspired by` é removido automaticamente) e a linha `> Category: …` decide em qual grupo o sistema cai. As categorias existentes estão em [`game-art-bibles/README.md`](game-art-bibles/README.md); se sua identidade de jogo realmente não couber, dá pra introduzir uma nova, mas **tente as existentes primeiro**.

### Barra para mergear um novo game art bible

1. **As 9 seções presentes.** Corpos vazios são aceitáveis para dados difíceis (por exemplo, motion tokens), mas os títulos precisam estar lá ou o grep do prompt quebra.
2. **Códigos hex reais.** Amostre direto do site ou produto da identidade de jogo, não da memória nem de chute de IA. O protocolo de extração de spec da identidade de jogo em 5 passos do README vale também para mantenedores.
3. **Valores OKLch para cores de destaque** são desejáveis. Eles fazem paletas interpolarem de forma previsível entre claro/escuro.
4. **Sem fluff de marketing.** O slogan da identidade de jogo não é um design token. Corte.
5. **Slug em ASCII** — `Sci-Fi Tactical` vira `sci-fi-tactical`, `Horror Survival` vira `horror-survival`. Os game art bibles curados já seguem essa convenção; espelhe.

Os game art bibles entregues são curados neste repositório. Adicione um `game-art-bibles/<id>/DESIGN.md` game-native e rode [`scripts/sync-game-art-bibles.ts`](scripts/sync-game-art-bibles.ts) para verificar o catálogo curado antes do PR.

---

## Adicionando um novo CLI de agente de código

Plugar um novo agente (por exemplo, o CLI `foo-coder` de alguma loja nova) é uma entrada em [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts):

```javascript
{
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
}
```

É só isso — o daemon detecta no `PATH`, o picker mostra, o caminho de chat funciona. Se o CLI emite **eventos tipados** (como o `--output-format stream-json` do Claude Code), conecte um parser em [`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) e defina `streamFormat: 'claude-stream-json'`.

Barra para mergear:

1. **Uma sessão real funciona end-to-end** com o novo agente — cole o log do daemon na descrição do PR mostrando que ele conseguiu streamar um artifact.
2. **`docs/agent-adapters.md`** atualizado com as peculiaridades do CLI (precisa de arquivo de chave? aceita imagem? qual a flag não-interativa?).
3. **A tabela "Supported coding agents" do README** ganha uma linha.

---

## Atualizando metadados de `max_tokens` dos modelos

O chat em modo API envia `max_tokens` para o provider upstream em toda requisição. O cliente web pega esse número de uma busca em três níveis em [`apps/web/src/state/maxTokens.ts`](apps/web/src/state/maxTokens.ts):

1. O override explícito do usuário em Settings, se definido.
2. Caso contrário, o default por modelo em [`apps/web/src/state/litellm-models.json`](apps/web/src/state/litellm-models.json) — uma fatia vendored do `model_prices_and_context_window.json` do [BerriAI/litellm][litellm] (MIT). Cobre ~2k modelos de chat de Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter etc.
3. Caso contrário, `FALLBACK_MAX_TOKENS = 8192`.

Para incluir um modelo recém-lançado, regere o JSON vendored:

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

O script busca o catálogo do LiteLLM, filtra entradas `mode: 'chat'`, projeta cada uma para `max_output_tokens` (com fallback em `max_tokens`) e grava um snapshot ordenado. Faça commit do `litellm-models.json` regerado junto com o PR que disparou o refresh.

A tabela OVERRIDES em `maxTokens.ts` é para o caso raro em que o LiteLLM está faltando ou errado para um id de modelo que de fato usamos — por exemplo, `mimo-v2.5-pro` (o LiteLLM só entrega o MiMo via aliases `openrouter/xiaomi/...` e `novita/xiaomimimo/...`, e nenhum bate com o id canônico que a API direta da Xiaomi usa). Mantenha-a pequena; tudo que o LiteLLM acerta pertence ao upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Manutenção de localização

Alemão usa o formal `Sie` porque o AI Game Design Studio fala com uma audiência mista de criadores solo, agências e times de engenharia; até feedback do projeto mostrar que uma voz informal `du` se encaixa melhor, alemão formal é o default menos surpreendente. PRs de locale devem traduzir chrome de UI, docs principais e metadados visuais de galeria em `apps/web/src/i18n/content.ts`, mas não devem traduzir `skills/`, `game-art-bibles/` nem corpos de prompt que os agentes executam. Esses prompts-fonte são mantidos como entradas de workflow, e manter um único idioma de fonte evita multiplicar QA de prompt entre locales. Ao adicionar ou renomear uma skill, game art bible ou prompt template, atualize os metadados de display em alemão e rode `pnpm --filter @ai-game-design-studio/web test`; o `content.test.ts` falha se a cobertura de display em alemão sair de sincronia. Erros do daemon, nomes de arquivos exportados e texto de artifact gerado pelo agente são limitações conhecidas, a menos que um PR explicitamente os englobe.

Para instruções passo a passo sobre adicionar um novo locale (dicionário de UI, README, language switcher, terminologia regional), veja [`TRANSLATIONS.md`](TRANSLATIONS.md).

---

## Estilo de código

Não somos pedantes com formatação (Prettier on save está ok), mas duas regras são inegociáveis porque aparecem na pilha de prompt e na API voltada ao usuário:

1. **Aspas simples em JS/TS.** Strings ficam com aspas simples a menos que escapar fique feio. O codebase já está consistente — siga.
2. **Comentários em inglês.** Mesmo se o PR é para traduzir algo para alemão ou 中文, comentários de código ficam em inglês para mantermos um único conjunto de referências grepáveis.

Além disso:

- **Não narre.** Sem `// import the module`, sem `// loop through items`. Se o código se lê obviamente, o comentário é ruído. Reserve comentários para intenção não-óbvia ou restrições que o código não consegue expressar.
- **TypeScript** em `apps/web/src/`. O daemon (`apps/daemon/`) é JavaScript ESM puro com JSDoc onde tipos importam — mantenha assim.
- **Sem novas dependências top-level** sem um parágrafo na descrição do PR sobre o que ganhamos vs. quantos bytes despachamos. A lista de deps em [`package.json`](package.json) é pequena de propósito.
- **Rode `pnpm typecheck`** antes do push. CI roda; falhar lá rende um comentário "please fix".

---

## Commits & pull requests

- **Uma preocupação por PR.** Adicionar uma skill + refatorar o parser + bumpar uma dep são três PRs.
- **Título é imperativo + escopo.** `add playable-game-prototype skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify .agds layout`.
- **Corpo explica o porquê.** "O que isso faz" geralmente é óbvio do diff; "por que isso precisa existir" raramente é.
- **Referencie uma issue** se houver. Se não houver e o PR for não-trivial, abra uma antes para combinarmos que a mudança é desejada antes de você gastar o tempo.
- **Sem squash durante review.** Empurre fixups; squash no merge.
- **Sem force-push em branch compartilhado** a não ser que o reviewer tenha pedido.

Não exigimos CLA. A Apache-2.0 nos cobre; sua contribuição é licenciada nos mesmos termos.

---

## Reportando bugs

Abra uma issue com:

- O que você executou (a invocação `pnpm tools-dev ...` exata).
- Qual CLI de agente foi selecionado (ou se você estava no caminho BYOK).
- O par skill + game art bible que disparou.
- A **tail relevante de stderr do daemon** — a maior parte dos relatos "o artifact nunca renderizou" são diagnosticados em 30 segundos quando dá pra ver `spawn ENOENT` ou o erro real do CLI.
- Um screenshot se for UI.

Para bugs da pilha de prompt ("o agente emitiu um hero com gradiente roxo, a blacklist de slop deveria proibir isso"), inclua a **mensagem completa do assistente** para conseguirmos ver se a violação foi do modelo ou do prompt.

---

## Fazendo perguntas

- Pergunta de arquitetura, pergunta de design, "isso é bug ou mau uso" → [GitHub Discussions](https://github.com/ai-game-design-studio/ai-game-design-studio/discussions) (preferido — pesquisável para o próximo).
- "Como escrevo uma skill que faz X" → Abra uma discussion. Respondemos e transformamos a resposta em [`docs/skills-protocol.md`](docs/skills-protocol.md) se for um padrão faltante.

---

## O que não aceitamos

Para manter o projeto focado, por favor não abra PRs que:

- **Embutam um runtime de modelo.** Toda a aposta do AI Game Design Studio é "seu CLI existente já basta". Não despachamos `pi-ai`, chaves OpenAI nem loaders de modelo.
- **Reescrevam o frontend para fora da stack atual sem discussão prévia.** Next.js 16 App Router + React 18 + TS é a linha. Sem Astro, Solid, Svelte ou outras reescritas de framework a menos que mantenedores explicitamente queiram essa migração.
- **Substituam o daemon por uma função serverless.** O ponto inteiro do daemon é ter um `cwd` real e spawnar um CLI real. Deploy do SPA na Vercel está ok; o daemon continua daemon.
- **Adicionem telemetry / analytics / phone-home.** O AI Game Design Studio é local-first. As únicas chamadas de saída são para providers que o usuário configurou explicitamente.
- **Empacotem um binário** sem arquivo de licença e atribuição de autoria ao lado.

Se não tem certeza se sua ideia se encaixa, abra uma discussion antes de escrever o código.

---

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [Licença Apache-2.0](LICENSE) deste repositório.

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
