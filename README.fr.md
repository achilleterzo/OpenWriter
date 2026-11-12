# OpenWriter

[English](README.md) · [Italiano](README.it.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Português](README.pt.md)

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter est un espace d'écriture local pour le Markdown. Vos documents, vos notes et les connaissances qui s'accumulent dans vos projets restent sur votre ordinateur, et deux types d'agents peuvent y travailler ensemble : l'assistant intégré à l'application et les agents externes que vous utilisez déjà, connectés par un serveur MCP intégré.

Il est conçu pour tout travail long qui doit rester cohérent en grandissant : un livre, un guide, un manuel, une thèse, un ensemble de documentation, ou un projet logiciel et les idées qui l'entourent.

Construit avec Electron, React, Vite, Tailwind CSS et Tiptap.

## L'idée : documents, connaissances, agents

Écrire quelque chose de grand, c'est surtout se souvenir : ce que vous avez décidé, où vous l'avez déjà dit, ce que contient un autre travail. OpenWriter fait de cela une partie de l'outil.

1. **Écrivez ce que vous décidez.** Un projet est un dossier de documents Markdown simples, avec ses notes, signets, mémoire, skills et instructions à côté. Rien n'est enfermé : tout est du texte lisible.
2. **Rendez-le retrouvable.** Chaque projet peut tenir un index local de ses documents, interrogeable par mots et, avec un modèle qui s'exécute sur votre ordinateur, par sens. Celui qui travaille sur le projet demande les passages dont il a besoin au lieu de lire des fichiers entiers : un contexte plus petit, une charge plus légère pour le modèle et un usage plus précis de ce que vous avez écrit.
3. **Laissez les agents partager.** L'assistant intégré et les agents externes lisent le même projet et les mêmes connaissances. Ils peuvent aussi consulter les projets que vous choisissez de partager, même s'ils ne sont pas ouverts.

### Deux agents en parallèle

OpenWriter contient un serveur du Model Context Protocol (MCP). C'est le standard par lequel les agents que vous utilisez déjà — Claude Code, Codex, OpenCode, les clients intégrés aux éditeurs et aux IDE — peuvent travailler sur un dossier de fichiers. Vous collez une configuration dans le client (Réglages → Agents (MCP)). À partir de là, cet agent peut lire le projet, ses connaissances, ses notes et ses pages enregistrées, et modifier ses documents. C'est l'agent que vous payez déjà et en qui vous avez confiance, mis au travail sur vos Markdown.

Cet agent et l'assistant intégré ne se font pas concurrence : ils se partagent le travail. Pendant que Claude Code écrit le code ou développe une idée, il peut confier la documentation à l'assistant par un seul appel, `ask_agent`. L'assistant ouvre une conversation dans l'application et y travaille en parallèle, avec les instructions, les skills et la mémoire du projet. L'agent n'a pas à écrire ce texte avec son propre contexte. Il suit ensuite ce qu'il a écrit en lisant cette conversation : `list_chats` la trouve, et `read_chat` en renvoie les derniers messages. La demande est signée du nom de l'agent, pour qu'elle se distingue de vos messages. Ce que l'un ou l'autre modifie dans les documents ouverts vous parvient comme une modification à accepter ou à refuser. Tous deux cherchent avec `search_knowledge` selon leurs besoins, si bien qu'aucun n'a à porter tout le projet avec lui.

### Quelques façons de l'utiliser

- **Un logiciel et sa documentation.** Les idées et le code s'écrivent au même endroit pendant que la documentation suit. Si on lui demande d'implémenter quelque chose qui existe déjà dans un autre projet, un agent trouve les bons fichiers grâce aux connaissances partagées, sans que ce projet soit ouvert.
- **Un livre ou une série.** Les chapitres sont des documents ; la recherche par sens retrouve où un personnage ou un thème a déjà été traité, et chaque tome peut être un projet qui partage ses connaissances pour garder cohérents les noms, les lieux et les règles.
- **Un guide ou un manuel.** Le guide puise, en lecture seule, dans les projets qu'il décrit, et un agent vérifie ce qu'il dit par rapport à ce que la source fait réellement.
- **Recherche et thèses.** Un projet par source ou par chapitre, et l'Accueil des projets montre comment les sujets se rapprochent.

## Ce qu'il fait

**Écrire.** Édition de texte enrichi avec le Markdown pour format natif, vue source, rechercher et remplacer, notes et signets, historique des documents, import DOCX et PDF, export en DOCX, PDF ou en un fichier Markdown autonome, et un lecteur de texte pour tout autre fichier texte. → [Documents et éditeur](docs/guide/documents-and-editor.md)

**Déléguer et relire.** Un assistant qui corrige, réécrit, résume et modifie, avec des actions rapides, des skills d'écriture, une mémoire de projet et plusieurs fournisseurs d'IA (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). Les messages écrits pendant qu'il travaille attendent dans une file ou entrent dans le travail en cours. Les actions rapides se modifient, et un projet peut avoir les siennes, importées en une fois depuis un autre projet. Chaque modification est appliquée sur place et marquée pour que vous l'acceptiez ou la refusiez — ou, pour un projet où vous le choisissez, acceptée et enregistrée à la fin du travail. La chaleur de l'écriture (la température) et ce que l'assistant peut faire se règlent par projet, et un tour interrompu peut reprendre à sa dernière étape. → [L'assistant](docs/guide/assistant.md)

**Chercher.** Recherche par mots et par sens, dans un projet ou dans tous, avec un modèle qui s'exécute sur votre ordinateur et n'est téléchargé que si vous le demandez ; un bouton de mots entiers en fait une recherche exacte, pour un nom, une expression ou une citation tels quels. Si l'ordinateur a plusieurs cartes graphiques, vous choisissez celle que la recherche par sens utilise. Les pages web peuvent être enregistrées dans un projet et consultées hors ligne. → [Connaissances](docs/guide/knowledge.md)

**Tout voir d'un coup.** L'Accueil des projets est un réseau de tous vos projets, reliés lorsque leurs contenus sont proches par le sens, avec une recherche qui fonctionne comme celle d'un agent et des bulles qui s'allument aux couleurs du feu tricolore selon la pertinence. → [Accueil des projets](docs/guide/projects-home.md)

**Organiser.** Des projets avec explorateur de fichiers, sous-projets, documents liés et icône propre ; des espaces de travail qui filtrent les projets que vous, l'assistant et les agents voyez. → [Projets](docs/guide/projects.md) · [Espaces de travail](docs/guide/workspaces.md)

**Connecter.** Chaque projet décide s'il est indexé et si ses passages sont visibles par les autres. Les agents externes travaillent sur le projet via le serveur MCP intégré, et ce qu'ils modifient vous parvient comme des modifications à accepter ou à refuser. → [Agents externes (MCP)](docs/guide/external-agents.md)

**Intégrer.** Associations de fichiers et entrée de dossier dans le gestionnaire de fichiers, un navigateur intégré avec vue lecture, plusieurs fenêtres sur des projets différents, des mises à jour à votre rythme. → [L'application et le système](docs/guide/system.md)

L'interface est disponible en anglais, italien, français, espagnol, allemand et portugais, avec des thèmes, des couleurs d'accent et une typographie modifiables.

## Confidentialité

Pour commencer, ni compte ni configuration ne sont nécessaires : l'éditeur, les projets, les notes et la recherche par mots fonctionnent seuls, et un fournisseur d'IA n'est sollicité que lorsque vous en configurez un et envoyez une requête. Le texte des documents n'est envoyé à un fournisseur d'IA que lorsque vous soumettez une requête, et avec un modèle Ollama local il ne quitte jamais votre machine. L'index de recherche et ses vecteurs vivent sur votre ordinateur ; les seuls téléchargements sont les packs de modèles locaux, et seulement quand vous cliquez sur le bouton. Le modèle de sens s'exécute sur le CPU ou, si vous préférez, sur une carte graphique que vous choisissez parmi celles de l'ordinateur. Les agents externes sont optionnels, n'atteignent que les documents du projet et n'écoutent que sur `127.0.0.1` avec un jeton. Les détails sont dans [Confidentialité](docs/guide/privacy.md).

## Pour commencer

OpenWriter fonctionne sous Windows (installateur), macOS (DMG) et Linux (AppImage, DEB). Les versions prêtes à l'emploi sont sur la [page des releases](https://github.com/achilleterzo/OpenWriter/releases) ; le compiler soi-même demande les étapes ci-dessous.

Prérequis : Node.js 22 ou plus récent et npm. Lancez les commandes ci-dessous dans le dossier où vous avez cloné le dépôt, quel que soit son nom :

```bash
npm install
npm run dev
```

La commande de développement lance Vite et ouvre l'application Electron. Les modifications dans `src/` se rechargent automatiquement ; celles dans `electron/` demandent de relancer la commande. Les associations de fichiers et l'entrée de dossier ne sont pas enregistrées dans la version de développement : installez un build pour les essayer.

Les tests unitaires se lancent avec `npm run test:unit` ; `npm test` exécute aussi le build de production. Certains des tests sémantiques s'exécutent sur le vrai modèle et sont ignorés sauf si `OW_SEMANTIC_PACK` pointe vers le dossier d'un pack installé.

Pour créer et lancer un build de production en local :

```bash
npm run build
npm start
```

## Documentation

La documentation est en anglais.

- [Documentation technique](docs/README.md) : l'architecture, le stockage des projets, les outils de l'assistant, le flux de développement et le processus de publication, avec une page de référence pour chaque fichier source.
- Les guides des fonctionnalités, une page par domaine : [documents et éditeur](docs/guide/documents-and-editor.md), [l'assistant](docs/guide/assistant.md), [agents externes (MCP)](docs/guide/external-agents.md), [projets](docs/guide/projects.md), [Accueil des projets](docs/guide/projects-home.md), [espaces de travail](docs/guide/workspaces.md), [connaissances](docs/guide/knowledge.md), [l'application et le système](docs/guide/system.md), [confidentialité](docs/guide/privacy.md).
- [Notes de conception](docs/design/workspaces.md) : les décisions prises avant de construire.

Toute la documentation du projet dans `docs/` a été produite avec OpenWriter lui-même, à l'aide de son éditeur et de son assistant IA.

## Build et publication

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Pousser un tag `v*`, ou lancer à la main le workflow `Build Desktop App`, exécute le lint et les tests, construit les paquets Windows, Linux et macOS, et les publie comme assets d'une GitHub Release. Les étapes sont décrites dans [la documentation technique](docs/README.md#releases).

## Contribuer

Les issues et les pull requests sont les bienvenues. Les consignes générales — structure du projet, conventions de code, obligations de documentation et manière de signaler un bug — se trouvent dans [CONTRIBUTING.md](CONTRIBUTING.md).

Avant d'ouvrir une pull request, veuillez exécuter :

```bash
npm run lint
npm test
```

Merci de garder les changements ciblés et d'inclure une description claire du comportement visible par l'utilisateur qu'ils touchent.

## Licence

OpenWriter est publié sous licence MIT. Voir [LICENSE](LICENSE) pour le texte complet.

## Soutien

Si vous trouvez ce projet utile et souhaitez soutenir son développement :

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

