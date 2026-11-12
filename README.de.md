# OpenWriter

[English](README.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português](README.pt.md)

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter ist ein lokaler Schreibarbeitsplatz für Markdown. Deine Dokumente, Notizen und das Wissen, das sich in deinen Projekten ansammelt, bleiben auf deinem Computer, und zwei Arten von Agenten können gemeinsam damit arbeiten: der in die App integrierte Assistent und die externen Agenten, die du ohnehin nutzt, angebunden über einen eingebauten MCP-Server.

Es ist für jede lange Arbeit gedacht, die beim Wachsen stimmig bleiben muss: ein Buch, eine Anleitung, ein Handbuch, eine Abschlussarbeit, ein Dokumentationsbestand oder ein Softwareprojekt samt den Ideen drumherum.

Gebaut mit Electron, React, Vite, Tailwind CSS und Tiptap.

## Die Idee: Dokumente, Wissen, Agenten

Etwas Großes zu schreiben heißt vor allem, sich zu erinnern: was du entschieden hast, wo du es schon gesagt hast, was eine andere Arbeit enthält. OpenWriter behandelt das als Teil des Werkzeugs.

1. **Halte fest, was du entscheidest.** Ein Projekt ist ein Ordner mit einfachen Markdown-Dokumenten, daneben Notizen, Lesezeichen, Gedächtnis, Skills und Anweisungen. Nichts ist eingesperrt: alles ist lesbarer Text.
2. **Mach es auffindbar.** Jedes Projekt kann einen lokalen Index seiner Dokumente führen, durchsuchbar nach Wörtern und, mit einem Modell, das auf deinem Computer läuft, nach Bedeutung. Wer am Projekt arbeitet, fragt die Passagen ab, die er braucht, statt ganze Dateien zu lesen: ein kleinerer Kontext, weniger Last für das Modell und eine genauere Nutzung dessen, was du geschrieben hast.
3. **Lass die Agenten teilen.** Der integrierte Assistent und die externen Agenten lesen dasselbe Projekt und dasselbe Wissen. Sie können auch in die Projekte schauen, die du teilen willst, selbst wenn diese nicht geöffnet sind.

### Zwei Agenten parallel

OpenWriter enthält einen Server des Model Context Protocol (MCP). Es ist der Standard, mit dem die Agenten, die du schon nutzt — Claude Code, Codex, OpenCode, die in Editoren und IDEs eingebauten Clients —, auf einem Ordner mit Dateien arbeiten können. Du fügst eine Konfiguration in den Client ein (Einstellungen → Agenten (MCP)). Von da an kann dieser Agent das Projekt, sein Wissen, seine Notizen und seine gespeicherten Seiten lesen und seine Dokumente ändern. Es ist der Agent, den du ohnehin bezahlst und dem du vertraust, an deinen Markdown-Dateien eingesetzt.

Dieser Agent und der integrierte Assistent konkurrieren nicht: Sie teilen sich die Arbeit. Während Claude Code den Code schreibt oder eine Idee entwickelt, kann er die Dokumentation mit einem einzigen Aufruf, `ask_agent`, an den Assistenten übergeben. Der Assistent öffnet einen Chat in der App und arbeitet dort parallel, mit den Anweisungen, Skills und dem Gedächtnis des Projekts. Der Agent muss diesen Text nicht mit seinem eigenen Kontext schreiben. Danach verfolgt er, was er geschrieben hat, indem er diesen Chat liest: `list_chats` findet ihn, und `read_chat` liefert seine letzten Nachrichten. Die Anfrage ist mit dem Namen des Agenten signiert, damit sie sich von deinen eigenen Nachrichten unterscheidet. Was einer von beiden in den offenen Dokumenten ändert, erreicht dich als Änderung, die du annehmen oder ablehnen kannst. Beide suchen bei Bedarf mit `search_knowledge`, sodass keiner das ganze Projekt mit sich herumtragen muss.

### Einige Einsatzmöglichkeiten

- **Software und ihre Dokumentation.** Ideen und Code entstehen an einem Ort, während die Dokumentation folgt. Soll etwas umgesetzt werden, das es in einem anderen Projekt schon gibt, findet ein Agent die richtigen Dateien über das geteilte Wissen, ohne dass dieses Projekt geöffnet sein muss.
- **Ein Buch oder eine Reihe.** Kapitel sind Dokumente; die Suche nach Bedeutung findet, wo eine Figur oder ein Thema schon behandelt wurde, und jeder Band kann ein Projekt sein, das sein Wissen teilt, damit Namen, Orte und Regeln konsistent bleiben.
- **Eine Anleitung oder ein Handbuch.** Die Anleitung schöpft schreibgeschützt aus den Projekten, die sie beschreibt, und ein Agent prüft, was sie sagt, gegen das, was die Quelle tatsächlich tut.
- **Forschung und Abschlussarbeiten.** Ein Projekt pro Quelle oder Kapitel, und die Projekt-Startseite zeigt, wie sich die Themen einander annähern.

## Was es kann

**Schreiben.** Rich-Text-Bearbeitung mit Markdown als Nativformat, Quelltextansicht, Suchen und Ersetzen, Notizen und Lesezeichen, Dokumentenverlauf, DOCX- und PDF-Import, Export als DOCX, PDF oder eigenständige Markdown-Datei und ein Textleser für jede andere Textdatei. → [Dokumente und Editor](docs/guide/documents-and-editor.md)

**Delegieren und prüfen.** Ein Assistent, der Korrektur liest, umschreibt, zusammenfasst und bearbeitet, mit Schnellaktionen, Schreib-Skills, Projektgedächtnis und mehreren KI-Anbietern (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). Schnellaktionen lassen sich bearbeiten, und ein Projekt kann eigene haben, die aus einem anderen Projekt auf einmal importiert werden. Jede Änderung wird direkt angewendet und zum Annehmen oder Ablehnen markiert — oder, in einem Projekt, in dem du es so wählst, am Ende der Arbeit angenommen und gespeichert. Die Wärme des Schreibens (die Temperatur) und wie viel der Assistent tun darf, werden pro Projekt eingestellt, und ein unterbrochener Durchlauf kann ab seinem letzten Schritt fortgesetzt werden. → [Der Assistent](docs/guide/assistant.md)

**Finden.** Suche nach Wörtern und nach Bedeutung, in einem Projekt oder in allen, mit einem Modell, das auf deinem Computer läuft und nur auf Wunsch heruntergeladen wird; eine Umschaltung auf ganze Wörter macht daraus eine exakte Suche, wenn du einen Namen, einen Ausdruck oder ein Zitat genau so suchst. Hat der Computer mehr als eine Grafikkarte, wählst du, welche die Suche nach Bedeutung nutzt. Webseiten lassen sich in einem Projekt speichern und offline durchsuchen. → [Wissen](docs/guide/knowledge.md)

**Alles auf einmal sehen.** Die Projekt-Startseite ist ein Netz aller deiner Projekte, verbunden, wenn ihre Inhalte bedeutungsmäßig nahe beieinander liegen, mit einer Suche, die wie die eines Agenten funktioniert. → [Projekt-Startseite](docs/guide/projects-home.md)

**Organisieren.** Projekte mit Dateiexplorer, Unterprojekten, verknüpften Dokumenten und eigenem Symbol; Arbeitsbereiche, die filtern, welche Projekte du, der Assistent und die Agenten sehen. → [Projekte](docs/guide/projects.md) · [Arbeitsbereiche](docs/guide/workspaces.md)

**Verbinden.** Jedes Projekt entscheidet, ob es indexiert wird und ob seine Passagen für die anderen sichtbar sind. Externe Agenten arbeiten über den eingebauten MCP-Server am Projekt, und ihre Änderungen erreichen dich als Änderungen zum Annehmen oder Ablehnen. → [Externe Agenten (MCP)](docs/guide/external-agents.md)

**Integrieren.** Dateizuordnungen und Ordnereintrag im Dateimanager, ein eingebauter Browser mit Leseansicht, Updates nach deinem Zeitplan. → [Die Anwendung und das System](docs/guide/system.md)

Die Oberfläche gibt es auf Englisch, Italienisch, Französisch, Spanisch, Deutsch und Portugiesisch, mit änderbaren Themes, Akzentfarben und Typografie.

## Datenschutz

Zum Starten brauchst du weder ein Konto noch eine Konfiguration: Editor, Projekte, Notizen und die Suche nach Wörtern funktionieren für sich, und ein KI-Anbieter wird erst gefragt, wenn du einen einrichtest und eine Anfrage abschickst. Dokumenttext wird nur dann an einen KI-Anbieter gesendet, wenn du eine Anfrage abschickst, und mit einem lokalen Ollama-Modell verlässt er deinen Rechner nie. Der Suchindex und seine Vektoren liegen auf deinem Computer; die einzigen Downloads sind die lokalen Modellpakete, und nur, wenn du auf die Schaltfläche klickst. Das Bedeutungsmodell läuft auf der CPU oder, wenn du willst, auf einer Grafikkarte, die du unter denen des Computers auswählst. Externe Agenten sind optional, erreichen nur die Dokumente des Projekts und lauschen ausschließlich auf `127.0.0.1` mit einem Token. Die Einzelheiten stehen unter [Datenschutz](docs/guide/privacy.md).

## Erste Schritte

OpenWriter läuft unter Windows (Installer), macOS (DMG) und Linux (AppImage, DEB). Fertige Builds gibt es auf der [Release-Seite](https://github.com/achilleterzo/OpenWriter/releases); selbst zu kompilieren erfordert die Schritte unten.

Voraussetzungen: Node.js 22 oder neuer und npm. Führe die Befehle unten in dem Ordner aus, in den du das Repository geklont hast, wie er auch heißt:

```bash
npm install
npm run dev
```

Der Entwicklungsbefehl startet Vite und öffnet die Electron-Anwendung. Änderungen in `src/` werden automatisch neu geladen; Änderungen in `electron/` erfordern einen Neustart des Befehls. Die Dateizuordnungen und der Ordnereintrag werden in der Entwicklungsversion nicht registriert: Installiere einen Build, um sie auszuprobieren.

Unit-Tests laufen mit `npm run test:unit`; `npm test` führt zusätzlich den Produktions-Build aus. Einige der semantischen Tests laufen gegen das echte Modell und werden übersprungen, sofern `OW_SEMANTIC_PACK` nicht auf den Ordner eines installierten Pakets zeigt.

So erstellst und startest du lokal einen Produktions-Build:

```bash
npm run build
npm start
```

## Dokumentation

Die Dokumentation ist auf Englisch.

- [Technische Dokumentation](docs/README.md): die Architektur, die Projektspeicherung, die Assistenten-Werkzeuge, der Entwicklungsablauf und der Release-Prozess, mit einer Referenzseite für jede Quelldatei.
- Die Funktionsanleitungen, eine Seite pro Bereich: [Dokumente und Editor](docs/guide/documents-and-editor.md), [der Assistent](docs/guide/assistant.md), [externe Agenten (MCP)](docs/guide/external-agents.md), [Projekte](docs/guide/projects.md), [Projekt-Startseite](docs/guide/projects-home.md), [Arbeitsbereiche](docs/guide/workspaces.md), [Wissen](docs/guide/knowledge.md), [die Anwendung und das System](docs/guide/system.md), [Datenschutz](docs/guide/privacy.md).
- [Entwurfsnotizen](docs/design/workspaces.md): Entscheidungen, die vor dem Bauen getroffen wurden.

Die gesamte Projektdokumentation in `docs/` wurde mit OpenWriter selbst erstellt, mit seinem Editor und seinem KI-Assistenten.

## Bauen und Veröffentlichen

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Das Pushen eines `v*`-Tags oder das manuelle Starten des Workflows `Build Desktop App` führt Lint und Tests aus, baut die Pakete für Windows, Linux und macOS und veröffentlicht sie als Assets eines GitHub Release. Die Schritte stehen in [der technischen Dokumentation](docs/README.md#releases).

## Mitwirken

Issues und Pull Requests sind willkommen. Die allgemeinen Richtlinien — Projektaufbau, Code-Konventionen, Dokumentationspflichten und wie man einen Fehler meldet — stehen in [CONTRIBUTING.md](CONTRIBUTING.md).

Bevor du einen Pull Request öffnest, führe bitte aus:

```bash
npm run lint
npm test
```

Bitte halte Änderungen fokussiert und beschreibe klar, welches für Nutzer sichtbare Verhalten sie betreffen.

## Lizenz

OpenWriter steht unter der MIT-Lizenz. Den vollständigen Lizenztext findest du in [LICENSE](LICENSE).

## Unterstützung

Wenn du dieses Projekt nützlich findest und seine Entwicklung unterstützen möchtest:

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

