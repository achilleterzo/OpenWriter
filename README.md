# OpenWriter

Base project React + Vite + Tailwind CSS + Electron, con editor documenti Tiptap.

## Sviluppo

```bash
npm install
npm run dev
```

Vite avvia il renderer e Electron apre la finestra collegata al dev server.

## Build

```bash
npm run build
npm start
```

`src/app.js` è volutamente vuoto, ma viene importato da `src/main.jsx` e quindi caricato nello stack React.

L'editor usa `@tiptap/starter-kit` e `@tiptap/extension-link`, con strumenti Markdown per blocchi, inline formatting, collegamenti e cronologia modifiche.

Dal menu nativo **File** è possibile aprire `.md`, `.markdown`, `.docx` e `.pdf`. Il salvataggio è sempre Markdown; DOCX e PDF sono disponibili come esportazioni.

Il menu **File > Impostazioni...** apre la configurazione dell'assistente AI: provider (Ollama, Ollama Cloud, Codex, Claude), modello e ragionamento.
