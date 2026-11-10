# OpenWriter

[English](README.md) · **Italiano** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter è uno spazio di scrittura locale per il Markdown. I tuoi documenti, le note e la conoscenza che si accumula nei progetti restano sul tuo computer, e due tipi di agenti possono lavorarci insieme: l'assistente integrato nell'app e gli agenti esterni che già usi (Claude Code, Codex, OpenCode, i client del tuo IDE), collegati tramite un server MCP integrato.

È pensato per qualsiasi lavoro lungo che deve restare coerente mentre cresce: un libro, una guida, un manuale, una tesi, un corpus di documentazione, oppure un progetto software e le idee che lo circondano.

Realizzato con Electron, React, Vite, Tailwind CSS e Tiptap.

## L'idea: documenti, conoscenza, agenti

Scrivere qualcosa di grande significa soprattutto ricordare: che cosa hai deciso, dove l'hai già detto, che cosa contiene un altro lavoro. OpenWriter considera questo parte dello strumento.

1. **Scrivi ciò che decidi.** Un progetto è una cartella di documenti Markdown semplici, con accanto note, segnalibri, memoria, skill e istruzioni. Niente è nascosto: è tutto testo leggibile.
2. **Rendilo ritrovabile.** Ogni progetto può mantenere un indice locale dei suoi documenti, interrogabile per parole e, con un modello che gira sul tuo computer, per significato. Chi lavora al progetto chiede i passaggi che gli servono invece di leggere interi file: contesto più piccolo, meno carico sul modello e un uso più preciso di ciò che hai scritto.
3. **Fai condividere gli agenti.** L'assistente integrato e gli agenti esterni leggono lo stesso progetto e la stessa conoscenza. Possono anche guardare nei progetti che scegli di condividere, anche se non sono aperti.

### Due agenti in parallelo

L'agente esterno e l'assistente integrato non si fanno concorrenza: si dividono il lavoro. Mentre Claude Code (o un altro agente) scrive il codice o sviluppa un'idea, può affidare la documentazione all'assistente integrato con `ask_agent`. L'assistente lavora nell'app in parallelo, con le istruzioni, le skill e la memoria del progetto, e l'agente segue ciò che scrive (`list_chats`, `read_chat`). Ciò che l'uno o l'altro modifica nei documenti aperti ti arriva come modifica da accettare o rifiutare. Entrambi cercano con `search_knowledge` quando serve, così nessuno dei due deve portarsi dietro l'intero progetto.

### Alcuni modi di usarlo

- **Software e relativa documentazione.** Idee e codice si scrivono nello stesso posto mentre la documentazione li segue. Se gli si chiede di implementare qualcosa che esiste già in un altro progetto, un agente trova i file giusti tramite la conoscenza condivisa, senza che quel progetto sia aperto.
- **Un libro o una serie.** I capitoli sono documenti; la ricerca per significato trova dove un personaggio o un tema è già stato trattato, e ogni volume può essere un progetto che condivide la propria conoscenza per mantenere coerenti nomi, luoghi e regole.
- **Una guida o un manuale.** La guida attinge in sola lettura ai progetti che descrive, e un agente verifica ciò che dice rispetto a ciò che la fonte fa davvero.
- **Ricerca e tesi.** Un progetto per fonte o capitolo, e la Home dei progetti mostra come gli argomenti si avvicinano tra loro.

## Che cosa fa

**Scrivi.** Editor di testo ricco con il Markdown come formato nativo, vista sorgente, trova e sostituisci, note e segnalibri, cronologia dei documenti, importazione di DOCX e PDF, esportazione in DOCX, PDF o in un file Markdown autonomo, e un lettore di testo per qualsiasi altro file di testo. → [Documenti ed editor](docs/guide/documents-and-editor.md)

**Delega e rivedi.** Un assistente che corregge, riscrive, riassume e modifica, con azioni rapide, skill di scrittura, memoria di progetto e diversi provider di IA (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). Ogni modifica viene applicata sul posto e segnata perché tu la accetti o la rifiuti, e un turno interrotto può riprendere dall'ultimo passo. → [L'assistente](docs/guide/assistant.md)

**Trova.** Ricerca per parole e per significato, in un progetto o in tutti, con un modello che gira sul tuo computer e viene scaricato solo se lo chiedi. Le pagine web si possono salvare in un progetto e cercare offline. → [Conoscenza](docs/guide/knowledge.md)

**Vedi tutto insieme.** La Home dei progetti è una rete di tutti i tuoi progetti, collegati quando i loro contenuti sono vicini nel significato, con una ricerca che funziona come quella di un agente. → [Home dei progetti](docs/guide/projects-home.md)

**Organizza.** Progetti con esplora file, sotto-progetti, documenti collegati e un'icona propria; spazi di lavoro che filtrano i progetti che vedono tu, l'assistente e gli agenti. → [Progetti](docs/guide/projects.md) · [Spazi di lavoro](docs/guide/workspaces.md)

**Collega.** Ogni progetto decide se viene indicizzato e se i suoi passaggi sono visibili agli altri. Gli agenti esterni lavorano sul progetto tramite il server MCP integrato, e ciò che modificano ti arriva come modifiche da accettare o rifiutare. → [Agenti esterni (MCP)](docs/guide/external-agents.md)

**Integra.** Associazioni di file e voce di cartella nel file manager, un browser integrato con vista di lettura, aggiornamenti secondo i tuoi tempi. → [L'applicazione e il sistema](docs/guide/system.md)

L'interfaccia è disponibile in inglese, italiano, francese, spagnolo, tedesco e portoghese, con temi, colori d'accento e tipografia modificabili.

## Privacy

Il testo dei documenti viene inviato a un provider di IA solo quando invii una richiesta, e con un modello Ollama locale non lascia mai il tuo computer. L'indice di ricerca e i suoi vettori stanno sul tuo computer; gli unici download sono i pacchetti dei modelli locali, e solo quando premi il pulsante. Gli agenti esterni sono opt-in, raggiungono solo i documenti del progetto e restano in ascolto solo su `127.0.0.1` con un token. I dettagli sono in [Privacy](docs/guide/privacy.md).

## Per iniziare

Requisiti: Node.js LTS corrente o successivo e npm.

```bash
cd openwriter
npm install
npm run dev
```

Il comando di sviluppo avvia Vite e apre l'applicazione Electron. Le modifiche in `src/` si ricaricano automaticamente; quelle in `electron/` richiedono di riavviare il comando. Le associazioni di file e la voce di cartella non sono registrate nella versione di sviluppo: installa una build per provarle.

I test unitari si lanciano con `npm run test:unit`; `npm test` esegue anche la build di produzione. Due dei test semantici girano sul modello reale e vengono saltati a meno che `OW_SEMANTIC_PACK` non punti alla cartella di un pacchetto installato.

Per creare ed eseguire una build di produzione in locale:

```bash
npm run build
npm start
```

## Documentazione

La documentazione è in inglese.

- [Documentazione tecnica](docs/README.md): l'architettura, l'archiviazione dei progetti, gli strumenti dell'assistente, il flusso di sviluppo e il processo di rilascio, con una pagina di riferimento per ogni file sorgente.
- Le guide alle funzioni, una pagina per area: [documenti ed editor](docs/guide/documents-and-editor.md), [l'assistente](docs/guide/assistant.md), [agenti esterni (MCP)](docs/guide/external-agents.md), [progetti](docs/guide/projects.md), [Home dei progetti](docs/guide/projects-home.md), [spazi di lavoro](docs/guide/workspaces.md), [conoscenza](docs/guide/knowledge.md), [l'applicazione e il sistema](docs/guide/system.md), [privacy](docs/guide/privacy.md).
- [Note di progetto](docs/design/workspaces.md): le decisioni prese prima di costruire.

Tutta la documentazione del progetto in `docs/` è stata prodotta con OpenWriter stesso, usando il suo editor e il suo assistente IA.

## Build e rilascio

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Inviando un tag `v*`, o avviando a mano il workflow `Build Desktop App`, si eseguono lint e test, si costruiscono i pacchetti per Windows, Linux e macOS e li si pubblica come asset di una GitHub Release. I passaggi sono nella [documentazione tecnica](docs/README.md#releases).

## Contribuire

Issue e pull request sono benvenute. Le linee guida generali — struttura del progetto, convenzioni di codice, doveri di documentazione e come segnalare un bug — sono in [CONTRIBUTING.md](CONTRIBUTING.md).

Prima di aprire una pull request, esegui:

```bash
npm run lint
npm test
```

Mantieni le modifiche circoscritte e includi una descrizione chiara del comportamento, visibile all'utente, che toccano.

## Licenza

OpenWriter è rilasciato con licenza MIT. Vedi [LICENSE](LICENSE) per il testo completo.

## Supporto

Se trovi utile questo progetto e vuoi sostenerne lo sviluppo:

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

