# Zu AI Game Design Studio beitragen

Danke, dass Sie über einen Beitrag nachdenken. AI Game Design Studio ist bewusst klein gehalten — der größte Teil des Werts steckt in **Dateien** (Skills, Game Art Bibles, Prompt-Fragmente) statt in Framework-Code. Die wirkungsvollsten Beiträge sind deshalb oft ein Ordner, eine Markdown-Datei oder ein PR-großer Adapter.

Dieser Leitfaden zeigt, wo Sie für welche Art Beitrag suchen sollten und welche Messlatte ein PR vor dem Merge erfüllen muss.

<p align="center"><a href="CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a></p>

---

## Drei Dinge, die Sie an einem Nachmittag liefern können

| Wenn Sie möchten… | Fügen Sie eigentlich hinzu | Ort | Umfang |
|---|---|---|---|
| AI Game Design Studio eine neue Artifact-Art rendern lassen (Boss-Encounter-Board, HUD-Mockup, Level-Flowchart…) | einen **Skill** | [`skills/<your-skill>/`](skills/) | ein Ordner, ca. 2 Dateien |
| AI Game Design Studio die Art Direction eines neuen Spiels sprechen lassen | ein **Game Art Bible** | [`game-art-bibles/<game-identity>/DESIGN.md`](game-art-bibles/) | eine Markdown-Datei |
| Eine neue coding-agent CLI anbinden | einen **Agent adapter** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | ca. 10 Zeilen in einem Array |
| Studio-Funktion ergänzen, Bug fixen, Studio-Interaktionsmuster aus [`open-codesign`][ocod] übernehmen | Code | `apps/web/src/`, `apps/daemon/` | normaler PR |
| Dokumentation verbessern, Französisch / Deutsch / 中文 ergänzen, Tippfehler fixen | Dokumentation | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | ein PR |

Wenn Sie nicht sicher sind, in welchen Bereich Ihre Idee fällt, [öffnen Sie zuerst eine Discussion / Issue](https://github.com/ai-game-design-studio/ai-game-design-studio/issues/new). Wir zeigen Ihnen dann die passende Oberfläche.

---

## Lokales Setup

Das vollständige One-Page-Setup steht in [`QUICKSTART.de.md`](QUICKSTART.de.md). TL;DR für Mitwirkende:

```bash
git clone https://github.com/ai-game-design-studio/ai-game-design-studio.git
cd ai-game-design-studio
corepack enable           # wählt das gepinnte pnpm aus packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @ai-game-design-studio/web build  # Web-Paket bei Bedarf bauen
```

Node `~24` und pnpm `10.33.x` sind erforderlich. `nvm` / `fnm` sind optional; nutzen Sie `nvm install 24 && nvm use 24` oder `fnm install 24 && fnm use 24`, wenn Sie Node so verwalten. macOS, Linux und WSL2 sind die primären Pfade. Windows nativ sollte funktionieren, ist aber kein primäres Ziel.

Sie brauchen keine Agent-CLI im `PATH`, um AI Game Design Studio selbst zu entwickeln. Der daemon meldet dann "no agents found" und fällt auf den **Anthropic API · BYOK** Pfad zurück, der oft die schnellste Dev-Schleife ist.

---

## Einen neuen Skill hinzufügen

Ein Skill ist ein Ordner unter [`skills/`](skills/) mit `SKILL.md` im Root. Er folgt der Claude Code [`SKILL.md` Konvention][skill] plus optionaler `agds:` Erweiterung. **Keine Registrierung nötig.** Ordner ablegen, daemon neu starten, der Picker zeigt ihn an.

### Skill-Ordnerlayout

```text
skills/your-skill/
├── SKILL.md                    # erforderlich
├── assets/template.html        # optional, aber empfohlen — Seed-Datei
├── references/                 # optional — Wissensdateien für den Agent
│   ├── layouts.md
│   ├── gameplay-modules.md
│   └── checklist.md
└── example.html                # stark empfohlen — echtes, handgebautes Beispiel
```

### `SKILL.md` Frontmatter

Die ersten drei Keys sind die Claude Code Basis-Spec: `name`, `description`, `triggers`. Alles unter `agds:` ist AI Game Design Studio-spezifisch und optional, aber **`agds.mode`** bestimmt, in welcher Gruppe der Skill erscheint.

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
    requires: true
    sections: [color, typography, layout, gameplay-modules]
  example_prompt: "A copy-pastable prompt that nicely shows what this skill does."
---

# Your Skill

Body is free-form Markdown describing the workflow the agent should follow…
```

Die vollständige Grammatik — typed inputs, Slider-Parameter, capability gating — steht in [`docs/skills-protocol.md`](docs/skills-protocol.md).

### Merge-Messlatte für einen neuen Skill

1. **Ein echtes `example.html`.** Handgebaut, direkt von Disk öffnend, mit Designer-Qualität. Kein Lorem ipsum, kein `<svg><rect/></svg>` Placeholder-Hero.
2. **Anti-AI-slop Checklist bestehen.** Keine violetten Gradients, keine generischen Emoji-Icons, keine runde Karte mit linkem Border-Akzent, kein Inter als Display-Font, keine erfundenen Zahlen.
3. **Ehrliche Platzhalter.** Wenn der Agent keine echte Zahl hat, schreiben Sie `—` oder einen beschrifteten grauen Block, nicht "10× faster".
4. **`references/checklist.md` mit mindestens P0 Gates.** Format an [`skills/game-pitch-deck/SKILL.md`](skills/game-pitch-deck/) oder [`skills/playable-game-prototype/SKILL.md`](skills/playable-game-prototype/) anlehnen.
5. **Screenshot unter `docs/screenshots/skills/<skill>.png`**, wenn der Skill featured ist. PNG, ca. 1024×640 retina, aus dem echten `example.html`.
6. **Ein einzelner, in sich geschlossener Ordner.** Keine CDN-Imports außer bereits verwendeten, keine unlizenzierte Fonts, keine Bilder über ca. 250 KB.

Wenn Sie einen vorhandenen Skill forken, behalten Sie LICENSE und Autorenschaft in `references/` und erwähnen Sie es in der PR-Beschreibung.

### Vorhandene Skills zum Nachahmen

- Visuelle Single-Scene-Prototypen: [`skills/playable-game-prototype/`](skills/playable-game-prototype/), [`skills/game-design-document/`](skills/game-design-document/)
- Multi-Frame Mobile-Flows: [`skills/mobile-game-flow/`](skills/mobile-game-flow/), [`skills/mobile-game-ui/`](skills/mobile-game-ui/)
- Dokument / Template: [`skills/game-design-document/`](skills/game-design-document/), [`skills/live-ops-calendar/`](skills/live-ops-calendar/)
- Deck-Modus: [`skills/game-pitch-deck/`](skills/game-pitch-deck/) und [`skills/game-design-document/`](skills/game-design-document/)

---

## Ein neues Game Art Bible hinzufügen

Ein Game Art Bible ist eine einzelne [`DESIGN.md`](game-art-bibles/README.md) Datei unter `game-art-bibles/<slug>/`. **Eine Datei, kein Code.** Ablegen, daemon neu starten, der Picker gruppiert es nach Kategorie.

### Game Art Bible-Ordnerlayout

```text
game-art-bibles/your-game/
└── DESIGN.md
```

### `DESIGN.md` Aufbau

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
## 6. Gameplay-Module & HUD-Elemente
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

Das 9-Section-Schema ist fest — Skill-Bodies greifen darauf per Suche zu. Das erste H1 wird zum Picker-Label (der Prefix `Game Art Bible Inspired by` wird entfernt), und `> Category: …` entscheidet die Gruppe. Bestehende Kategorien stehen in [`game-art-bibles/README.md`](game-art-bibles/README.md); nutzen Sie nach Möglichkeit eine vorhandene.

### Merge-Messlatte für ein neues Game Art Bible

1. **Alle 9 Sections vorhanden.** Leere Bodies sind bei schwer auffindbaren Daten akzeptabel, aber die Headings müssen da sein.
2. **Hex-Codes sind echt.** Direkt von Website oder Produkt sampeln, nicht aus Erinnerung oder AI raten.
3. **OKLch-Werte für Akzentfarben** sind nice-to-have und machen Paletten stabiler.
4. **Kein Marketing-Fluff.** Die Tagline einer Marke ist kein Design Token.
5. **Slug nutzt ASCII** — `Sci-Fi Tactical` wird `sci-fi-tactical`, `Horror Survival` wird `horror-survival`.

Die gelieferten Game-Art-Bibles werden im Repository kuratiert. Fügen Sie eine game-native `game-art-bibles/<id>/DESIGN.md` hinzu und führen Sie [`scripts/sync-game-art-bibles.ts`](scripts/sync-game-art-bibles.ts) aus, um den kuratierten Katalog vor dem PR zu prüfen.

---

## Eine neue coding-agent CLI hinzufügen

Eine neue Agent-CLI ist ein Eintrag in [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts):

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

Der daemon erkennt sie im `PATH`, der Picker zeigt sie an und der Chat-Pfad funktioniert. Wenn die CLI **typed events** ausgibt, ergänzen Sie einen Parser in [`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) und setzen `streamFormat`.

Merge-Bar:

1. **Eine echte Session läuft end-to-end** mit dem neuen Agent; fügen Sie den daemon log in die PR-Beschreibung ein.
2. **`docs/agent-adapters.md`** dokumentiert die Eigenheiten der CLI.
3. **Die README-Tabelle "Unterstützte Code-Agenten"** erhält eine Zeile.

---

## Wartung von Lokalisierungen

Deutsch verwendet das formelle `Sie`, weil AI Game Design Studio eine gemischte Zielgruppe aus Solo-Creators, Agenturen und Engineering-Teams anspricht; solange Projektfeedback keine informelle `du`-Stimme nahelegt, ist formelles Deutsch die am wenigsten überraschende Vorgabe. Locale-PRs sollen UI-Chrome, zentrale Dokumentation und display-only Gallery-Metadaten in `apps/web/src/i18n/content.ts` übersetzen, aber nicht `skills/`, `game-art-bibles/` oder Prompt-Bodies, die Agents ausführen. Diese Quell-Prompts sind Workflow-Eingaben; eine gemeinsame Quellsprache vermeidet multiplizierte Prompt-QA über alle Locales. Wenn ein Skill, Game Art Bible oder Prompt Template ergänzt oder umbenannt wird, aktualisieren Sie die deutschen Display-Metadaten und führen `pnpm --filter @ai-game-design-studio/web test` aus; `content.test.ts` schlägt fehl, wenn die deutsche Display-Coverage driftet. Daemon-Fehler, Export-Dateinamen und agent-generierte Artifact-Texte sind bekannte Grenzen, sofern ein PR sie nicht ausdrücklich umfasst.

---

## Code Style

Wir sind beim Formatting nicht pedantisch (Prettier on save ist okay), aber zwei Regeln sind nicht verhandelbar:

1. **Single quotes in JS/TS.** Strings sind single-quoted, außer Escaping macht sie hässlich.
2. **Kommentare auf Englisch.** Auch wenn ein PR etwas ins Deutsche oder Chinesische übersetzt, bleiben Code-Kommentare englisch, damit es eine greppable Referenzsprache gibt.

Außerdem:

- **Nicht erzählen.** Kein `// import the module`, kein `// loop through items`.
- **TypeScript** für `apps/web/src/`. Der daemon (`apps/daemon/`) ist plain ESM JavaScript mit JSDoc, wenn Typen wichtig sind.
- **Keine neuen Top-Level Dependencies** ohne Absatz in der PR-Beschreibung, was sie bringen und wie viele Bytes sie kosten.
- **Vor dem Push `pnpm typecheck` ausführen.** CI tut es auch.

---

## Commits & Pull Requests

- **Ein Anliegen pro PR.**
- **Titel ist imperativ + Scope.** `add playable-game-prototype skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify .agds layout`.
- **Body erklärt das Warum.** Der Diff zeigt oft das Was, aber selten den Grund.
- **Issue referenzieren**, falls vorhanden. Bei nicht-trivialen PRs ohne Issue bitte zuerst eines öffnen.
- **Während Review nicht squashen.** Fixups pushen; wir squashen beim Merge.
- **Kein Force-Push auf Shared Branches**, außer Reviewer fragen danach.

Wir erzwingen kein CLA. Apache-2.0 deckt Beiträge ab; Ihr Beitrag ist unter derselben Lizenz.

---

## Bugs melden

Öffnen Sie ein Issue mit:

- Exaktem `pnpm tools-dev ...` Aufruf.
- Ausgewählter Agent-CLI oder BYOK-Pfad.
- Skill + Game Art Bible, die den Fehler ausgelöst haben.
- Relevanter **daemon stderr tail**.
- Screenshot, wenn es UI betrifft.

Für Prompt-Stack-Bugs fügen Sie die **vollständige Assistant Message** bei, damit klar ist, ob Modell oder Prompt verletzt wurde.

---

## Fragen stellen

- Architekturfrage, Designfrage, "Bug oder Fehlbenutzung?" → [GitHub Discussions](https://github.com/ai-game-design-studio/ai-game-design-studio/discussions) (bevorzugt, weil suchbar).
- "Wie schreibe ich einen Skill für X?" → Discussion öffnen. Wir beantworten sie und übernehmen fehlende Muster in [`docs/skills-protocol.md`](docs/skills-protocol.md).

---

## Was wir nicht annehmen

Um das Projekt fokussiert zu halten, öffnen Sie bitte keine PRs, die:

- **Eine Model Runtime vendoren.** AI Game Design Studio setzt darauf, dass Ihre vorhandene CLI reicht.
- **Das Frontend ohne vorherige Abstimmung aus dem aktuellen Stack reißen.** Next.js 16 App Router + React 18 + TS ist gesetzt.
- **Den daemon durch eine Serverless Function ersetzen.** Der daemon besitzt ein echtes `cwd` und startet echte CLIs.
- **Telemetry / Analytics / Phone-home hinzufügen.** AI Game Design Studio ist local-first.
- **Ein Binary bündeln** ohne Lizenzdatei und Autorenschaft direkt daneben.

Wenn Sie nicht sicher sind, ob eine Idee passt, öffnen Sie vor dem Code eine Discussion.

---

## Lizenz

Mit Ihrem Beitrag erklären Sie sich einverstanden, dass er unter der [Apache-2.0-Lizenz](LICENSE) dieses Repositories steht.

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
