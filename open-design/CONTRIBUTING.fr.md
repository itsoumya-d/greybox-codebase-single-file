# Contribuer à AI Game Design Studio

Merci d'envisager de contribuer. AI Game Design Studio reste volontairement petit : l'essentiel
de la valeur vit dans des **fichiers** (Skills, Game Art Bibles, morceaux de
prompt) plutôt que dans du code de framework. Les contributions les plus utiles
sont donc souvent un dossier, un fichier Markdown ou un petit adapter qui tient
dans une PR.

Ce guide indique où intervenir pour chaque type de contribution et quel niveau
une PR doit atteindre avant d’être mergée.

<p align="center"><a href="CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <b>Français</b> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a></p>

---

## Trois contributions faisables en un après-midi

| Si vous voulez… | Vous ajoutez en réalité | Où cela vit | Taille |
|---|---|---|---|
| Faire générer à AI Game Design Studio un nouvel artifact de jeu (boss board, HUD, carte de niveau…) | un **Skill** | [`skills/<your-skill>/`](skills/) | un dossier, ~2 fichiers |
| Faire parler à AI Game Design Studio la direction artistique d'un nouveau jeu | un **Game Art Bible** | [`game-art-bibles/<game-identity>/DESIGN.md`](game-art-bibles/) | un fichier Markdown |
| Brancher une nouvelle CLI de coding agent | un **Agent adapter** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | ~10 lignes dans un tableau |
| Ajouter une capacité studio, corriger un bug, reprendre un motif d'interaction studio de [`open-codesign`][ocod] | du code | `apps/web/src/`, `apps/daemon/` | PR classique |
| Améliorer la doc, porter une section en Français / Deutsch / 中文, corriger une faute | documentation | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | une PR |

Si vous ne savez pas dans quelle catégorie tombe votre idée, [ouvrez d'abord
une discussion ou une issue](https://github.com/ai-game-design-studio/ai-game-design-studio/issues/new)
et nous vous orienterons vers la bonne surface.

---

## Configuration locale

Le setup complet en une page se trouve dans [`QUICKSTART.fr.md`](QUICKSTART.fr.md).
TL;DR pour contribuer :

```bash
git clone https://github.com/ai-game-design-studio/ai-game-design-studio.git
cd ai-game-design-studio
corepack enable           # sélectionne la version de pnpm définie par packageManager
pnpm install
pnpm tools-dev run web    # boucle daemon + web au premier plan
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @ai-game-design-studio/web build  # build du paquet web si nécessaire
```

Node `~24` et pnpm `10.33.x` sont requis. `nvm` / `fnm` sont optionnels ;
utilisez `nvm install 24 && nvm use 24` ou `fnm install 24 && fnm use 24` si
vous gérez Node comme cela. macOS, Linux et WSL2 sont les environnements
principaux pris en charge.
Windows natif devrait fonctionner, mais ce n'est pas la cible principale :
ouvrez une issue si ce n'est pas le cas.

Vous n'avez pas besoin d'une CLI d'agent dans votre `PATH` pour développer AI Game Design Studio.
Le daemon indiquera "no agents found" ; utilisez alors le mode API/BYOK
(Anthropic, OpenAI, Azure OpenAI ou Google Gemini), qui est souvent la boucle
de dev la plus rapide.

---

## Ajouter un nouveau Skill

Un Skill est un dossier sous [`skills/`](skills/) avec un `SKILL.md` à la
racine. Il suit la convention Claude Code [`SKILL.md`][skill], plus notre
extension optionnelle `agds:`. **Aucune étape d'enregistrement.** Déposez le
dossier, redémarrez le daemon, et le picker l'affiche.

### Structure d'un dossier Skill

```text
skills/your-skill/
├── SKILL.md                    # requis
├── assets/template.html        # optionnel mais recommandé — seed file
├── references/                 # optionnel — fichiers de connaissance lus par l'agent
│   ├── layouts.md
│   ├── gameplay-modules.md
│   └── checklist.md
└── example.html                # fortement recommandé — vrai exemple construit à la main
```

### Frontmatter de `SKILL.md`

Les trois premières clés sont la spec Claude Code de base : `name`,
`description`, `triggers`. Tout ce qui est sous `agds:` est spécifique à AI Game Design Studio et
optionnel, mais **`agds.mode`** décide dans quel groupe le Skill apparaît. La
valeur est extensible ; les modes courants incluent Prototype, Deck, Image,
Video, Audio, Game Art Bible et Utility.

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
  mode: prototype           # prototype | deck | image | video | audio | game-art-bible | utility
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

La grammaire complète — typed inputs, paramètres de sliders, capability gating
— se trouve dans [`docs/skills-protocol.md`](docs/skills-protocol.md).

### Critères de merge pour un nouveau Skill

Nous sommes exigeants sur les Skills parce qu'ils constituent la partie la plus
visible pour l'utilisateur. Un nouveau Skill doit :

1. **Livrer un vrai `example.html`.** Construit à la main, ouvrable directement
   depuis le disque, avec un niveau qu'un designer pourrait réellement livrer.
   Pas de lorem ipsum, pas de hero placeholder en `<svg><rect/></svg>`. Si vous
   ne pouvez pas construire l'exemple vous-même, le Skill n'est probablement
   pas prêt.
2. **Passer l'anti-AI-slop checklist** dans le body. Pas de gradients violets,
   pas d'icônes emoji génériques, pas de carte arrondie avec accent en bord
   gauche, pas d'Inter comme fonte *display*, pas de statistiques inventées.
   Lisez la section **Anti-AI-slop machinery** du README pour la liste complète.
3. **Utiliser des placeholders honnêtes.** Si l'agent n'a pas de vraie donnée,
   écrivez `—` ou un bloc gris libellé, pas "10× faster".
4. **Avoir un `references/checklist.md`** avec au moins les gates P0, c'est-à-dire
   ce que l'agent doit vérifier avant d'émettre `<artifact>`. Reprenez le format
   de [`skills/game-pitch-deck/SKILL.md`](skills/game-pitch-deck/) ou
   [`skills/playable-game-prototype/SKILL.md`](skills/playable-game-prototype/).
5. **Ajouter une capture** sous `docs/screenshots/skills/<skill>.png` si le Skill
   est featured. PNG, environ 1024×640 retina, capturé depuis le vrai
   `example.html` avec un zoom navigateur adapté.
6. **Rester dans un dossier autonome.** Pas d'import CDN au-delà de ce que les
   autres Skills utilisent déjà ; pas de fonte sans licence ; pas d'image de
   plus d'environ 250 KB.

Si vous forkez un Skill existant (par exemple partir de `playable-game-prototype` pour en
faire `encounter-design`), conservez la LICENSE et l'attribution d'auteur dans
`references/`, et mentionnez-le dans la description de la PR.

### Skills existants à imiter

- Prototype visuel single-scene : [`skills/playable-game-prototype/`](skills/playable-game-prototype/),
  [`skills/game-design-document/`](skills/game-design-document/)
- Flow mobile multi-frame : [`skills/mobile-game-flow/`](skills/mobile-game-flow/),
  [`skills/mobile-game-ui/`](skills/mobile-game-ui/)
- Document / template sans Game Art Bible requis : [`skills/game-design-document/`](skills/game-design-document/),
  [`skills/live-ops-calendar/`](skills/live-ops-calendar/)
- Deck mode : [`skills/game-pitch-deck/`](skills/game-pitch-deck/) et
  [`skills/game-design-document/`](skills/game-design-document/)

---

## Ajouter un nouveau Game Art Bible

Un game art bible est un seul fichier [`DESIGN.md`](game-art-bibles/README.md)
sous `game-art-bibles/<slug>/`. **Un fichier, pas de code.** Déposez-le,
redémarrez le daemon, le picker l'affiche dans sa catégorie.

### Structure d'un dossier Game Art Bible

```text
game-art-bibles/your-game/
└── DESIGN.md
```

### Forme de `DESIGN.md`

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
## 6. Modules de gameplay et éléments HUD
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

Le schéma à 9 sections est fixe : c'est ce que les Skill bodies cherchent. Le
premier H1 devient le label dans le picker (le préfixe `Game Art Bible Inspired by`
est retiré automatiquement), et la ligne `> Category: …` décide du groupe.
Les catégories existantes sont listées dans [`game-art-bibles/README.md`](game-art-bibles/README.md) ;
si votre identité de jeu ne rentre vraiment nulle part, vous pouvez en introduire une
nouvelle, mais **essayez d'abord les catégories existantes**.

### Critères de merge pour un nouveau Game Art Bible

1. **Les 9 sections sont présentes.** Des sections vides sont acceptables pour
   les informations difficiles à trouver (par exemple des tokens de motion),
   mais les headings doivent exister, sinon la recherche utilisée par le prompt
   risque de casser.
2. **Les hex codes sont réels.** Échantillonnez directement depuis le site ou
   une référence de jeu ou une bible artistique, pas de mémoire ni à partir d'une supposition de l'IA. Le
   protocole d'extraction art-direction en 5 étapes du README s'applique aussi aux
   mainteneurs.
3. **Les valeurs OKLch pour les couleurs d'accent** sont un plus : elles rendent
   les palettes plus prévisibles entre light/dark.
4. **Pas de fluff marketing.** La tagline d'une marque n'est pas un design token.
   Coupez-la.
5. **Le slug utilise l'ASCII** : `Sci-Fi Tactical` devient `sci-fi-tactical`, `Horror Survival`
   devient `horror-survival`. Les game art bibles intégrés suivent déjà cette convention ;
   imitez-la.

Les game art bibles livrés sont sélectionnés dans ce dépôt via
[`scripts/sync-game-art-bibles.ts`](scripts/sync-game-art-bibles.ts). Ajoutez un
`game-art-bibles/<id>/DESIGN.md` game-native, puis lancez ce script pour vérifier
le catalogue sélectionné avant d'ouvrir une PR.

---

## Ajouter une nouvelle CLI de coding agent

Brancher un nouvel agent (par exemple une CLI `foo-coder`) revient à ajouter
une entrée dans [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) :

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

C'est tout : le daemon la détecte dans le `PATH`, le picker l'affiche et le
chemin chat fonctionne. Si la CLI émet des **typed events** (comme
`--output-format stream-json` de Claude Code), ajoutez un parser dans
[`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) et mettez
`streamFormat: 'claude-stream-json'`.

Critères de merge :

1. **Une vraie session fonctionne end-to-end** avec le nouvel agent. Collez le
   log daemon dans la description de la PR pour montrer qu'il a streamé un artifact.
2. **`docs/agent-adapters.md`** documente les particularités de la CLI : fichier
   de clé requis, support de l'image, flag non interactif, etc.
3. **La table "Supported coding agents" du README** reçoit une ligne.

---

## Mettre à jour les métadonnées `max_tokens` des modèles

En mode API, le chat envoie `max_tokens` au provider upstream à chaque requête.
Le client web choisit ce nombre avec une lookup à trois niveaux dans
[`apps/web/src/state/maxTokens.ts`](apps/web/src/state/maxTokens.ts) :

1. L'override explicite de l'utilisateur dans Settings, s'il existe.
2. Sinon, la valeur par modèle dans [`apps/web/src/state/litellm-models.json`](apps/web/src/state/litellm-models.json),
   un extrait vendored du `model_prices_and_context_window.json` de
   [BerriAI/litellm][litellm] (MIT). Il couvre environ 2k modèles chat chez
   Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock,
   Vertex, OpenRouter et autres.
3. Sinon, `FALLBACK_MAX_TOKENS = 8192`.

Pour récupérer un modèle nouvellement lancé, régénérez le JSON vendored :

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

Le script récupère le catalogue LiteLLM, filtre les entrées `mode: 'chat'`,
projette chacune vers son `max_output_tokens` (ou fallback `max_tokens`), puis
écrit un snapshot trié. Commitez le `litellm-models.json` régénéré avec la PR
qui motive cette mise à jour.

La table `OVERRIDES` dans `maxTokens.ts` est réservée aux rares cas où LiteLLM
est absent ou incorrect pour un model id réellement utilisé, par exemple
`mimo-v2.5-pro`. Gardez-la petite ; tout ce que LiteLLM sait déjà correctement
doit rester upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Maintenance des localisations

Les PR de locale doivent traduire le chrome UI, la documentation cœur et les
métadonnées display-only de galerie dans `apps/web/src/i18n/content*.ts`, mais
ne doivent pas traduire `skills/`, `game-art-bibles/` ni les prompt bodies que
les agents exécutent. Ces prompts source sont des entrées de workflow ; garder
une langue source commune évite de multiplier la QA de prompts sur toutes les
locales. Lorsqu'un Skill, un Game Art Bible ou un prompt template est ajouté ou
renommé, mettez à jour les métadonnées display de la locale concernée et lancez
`pnpm --filter @ai-game-design-studio/web test` ; `content.test.ts` échoue si la coverage
couverture des métadonnées d'affichage d'une locale déclarée dérive. Les erreurs daemon, noms de fichiers
d'export et textes d'artifact générés par agent restent des limites connues,
sauf si une PR les inclut explicitement.

Pour les étapes détaillées d'ajout d'une locale (dictionnaire UI, README,
language switcher, terminologie régionale), voir [`TRANSLATIONS.md`](TRANSLATIONS.md).

---

## Style de code

Nous ne sommes pas maniaques du formatting (Prettier on save est très bien),
mais deux règles ne sont pas négociables parce qu'elles apparaissent dans le
prompt stack et l'API visible :

1. **Single quotes en JS/TS.** Les strings utilisent des single quotes sauf si
   l'échappement les rend illisibles. La codebase est déjà cohérente ; suivez-la.
2. **Commentaires en anglais.** Même si une PR traduit quelque chose en français,
   allemand ou chinois, les commentaires de code restent en anglais afin de
   garder une référence greppable unique.

Au-delà de ça :

- **Ne racontez pas l'évidence.** Pas de `// import the module`, pas de
  `// loop through items`. Si le code se lit déjà, le commentaire est du bruit.
  Gardez les commentaires pour l'intention non évidente ou les contraintes que
  le code ne peut pas exprimer.
- **TypeScript** pour le code source de `apps/web/src/` et `apps/daemon/src/`.
  Le JavaScript généré appartient aux dossiers `dist/`; les nouveaux fichiers
  `.js`, `.mjs` ou `.cjs` doivent avoir une raison générée, vendored ou
  compatibility explicite.
- **Pas de nouvelle dépendance top-level** sans paragraphe dans la description
  de la PR expliquant ce qu'elle apporte et combien d'octets elle coûte. La liste
  des dépendances dans [`package.json`](package.json) est petite volontairement.
- **Lancez `pnpm typecheck`** avant de push. CI le lance aussi ; s'il échoue,
  vous aurez un commentaire "please fix".

---

## Commits et Pull Requests

- **Un seul sujet par PR.** Ajouter un Skill, refactorer le parser et bumper une
  dépendance : ce sont trois PR.
- **Titre impératif + scope.** `add playable-game-prototype skill`,
  `fix daemon SSE backpressure when CLI hangs`, `docs: clarify .agds layout`.
- **Le body explique le pourquoi.** Le diff montre souvent le quoi ; le pourquoi
  est rarement évident.
- **Référencez une issue** s'il y en a une. S'il n'y en a pas et que la PR est
  non trivial, ouvrez-en d'abord une pour valider que le changement est souhaité.
- **Pas de squash pendant la review.** Poussez des fixups ; les maintainers
  squashent au merge.
- **Pas de force-push sur une branche partagée** sauf si un reviewer le demande.

Nous n'imposons pas de CLA. Apache-2.0 couvre le projet ; votre contribution
est licenciée sous la même licence.

---

## Signaler un bug

Ouvrez une issue avec :

- La commande exacte lancée (`pnpm tools-dev ...`).
- La CLI d'agent sélectionnée, ou le fait que vous étiez sur le chemin BYOK.
- La paire Skill + Game Art Bible qui a déclenché le problème.
- La **fin du stderr du daemon** concerné. La plupart des rapports "l'artifact
  n'a jamais rendu" se diagnostiquent en 30 secondes si on voit `spawn ENOENT`
  ou l'erreur réelle de la CLI.
- Une capture d'écran si le problème touche l'UI.

Pour les bugs de prompt stack ("l'agent a généré un hero violet alors que la
blacklist slop devait l'interdire"), incluez le **message assistant complet**
afin de voir si la violation vient du modèle ou du prompt.

---

## Poser des questions

- Question d'architecture, question de design, "bug ou mauvaise utilisation ?" →
  [GitHub Discussions](https://github.com/ai-game-design-studio/ai-game-design-studio/discussions)
  (préféré, car searchable pour la personne suivante).
- "Comment écrire un Skill qui fait X ?" → ouvrez une discussion. Nous y
  répondrons et transformerons la réponse en ajout dans
  [`docs/skills-protocol.md`](docs/skills-protocol.md) si c'est un pattern manquant.

---

## Ce que nous n'acceptons pas

Pour garder le projet focalisé, merci de ne pas ouvrir de PR qui :

- **Vendor un runtime de modèle.** Tout le pari d'AI Game Design Studio est "votre CLI existante
  suffit". Nous ne livrons pas `pi-ai`, de clés OpenAI ou de model loaders.
- **Réécrit le frontend hors de la stack actuelle sans discussion préalable.**
  Next.js 16 App Router + React 18 + TS est la ligne. Pas de réécriture Astro,
  Solid, Svelte ou autre framework sauf si les maintainers veulent explicitement
  cette migration.
- **Remplace le daemon par une fonction serverless.** Le rôle du daemon est de
  posséder un vrai `cwd` et de spawn une vraie CLI. Déployer la SPA sur Vercel
  est très bien ; le daemon reste un daemon.
- **Ajoute de la télémétrie / analytics / phone-home.** AI Game Design Studio est local-first.
  Les seuls appels sortants vont vers des providers explicitement configurés
  par l'utilisateur.
- **Bundle un binaire** sans fichier de licence ni attribution d'auteur à côté.

Si vous n'êtes pas sûr que votre idée rentre dans le projet, ouvrez une
discussion avant d'écrire le code.

---

## Licence

En contribuant, vous acceptez que votre contribution soit licenciée sous la
[licence Apache-2.0](LICENSE) de ce repo.

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
