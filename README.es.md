# OpenWriter

[English](README.md) · [Italiano](README.it.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter es un espacio de escritura local para Markdown. Tus documentos, tus notas y el conocimiento que se acumula en tus proyectos permanecen en tu ordenador, y dos tipos de agentes pueden trabajar con ellos: el asistente integrado en la aplicación y los agentes externos que ya usas (Claude Code, Codex, OpenCode, los clientes de tu IDE), conectados mediante un servidor MCP integrado.

Está pensado para cualquier trabajo largo que deba mantenerse coherente a medida que crece: un libro, una guía, un manual, una tesis, un conjunto de documentación, o un proyecto de software y las ideas que lo rodean.

Construido con Electron, React, Vite, Tailwind CSS y Tiptap.

## La idea: documentos, conocimiento, agentes

Escribir algo grande es sobre todo recordar: qué decidiste, dónde ya lo dijiste, qué contiene otro trabajo. OpenWriter trata eso como parte de la herramienta.

1. **Anota lo que decides.** Un proyecto es una carpeta de documentos Markdown sencillos, con sus notas, marcadores, memoria, skills e instrucciones al lado. Nada queda encerrado: todo es texto legible.
2. **Haz que se pueda encontrar.** Cada proyecto puede mantener un índice local de sus documentos, consultable por palabras y, con un modelo que se ejecuta en tu ordenador, por significado. Quien trabaja en el proyecto pide los pasajes que necesita en lugar de leer archivos enteros: un contexto más pequeño, menos carga para el modelo y un uso más preciso de lo que escribiste.
3. **Deja que los agentes compartan.** El asistente integrado y los agentes externos leen el mismo proyecto y el mismo conocimiento. También pueden consultar los proyectos que elijas compartir, aunque no estén abiertos.

### Dos agentes en paralelo

El agente externo y el asistente integrado no compiten: se reparten el trabajo. Mientras Claude Code (u otro agente) escribe el código o desarrolla una idea, puede encargar su documentación al asistente integrado con `ask_agent`. El asistente trabaja en la aplicación en paralelo, con las instrucciones, skills y memoria del proyecto, y el agente sigue lo que escribe (`list_chats`, `read_chat`). Lo que cualquiera de los dos cambie en los documentos abiertos te llega como una edición que puedes aceptar o rechazar. Ambos consultan con `search_knowledge` cuando lo necesitan, de modo que ninguno tiene que cargar con todo el proyecto.

### Algunas formas de usarlo

- **Software y su documentación.** Las ideas y el código se escriben en un mismo lugar mientras la documentación los acompaña. Si se le pide implementar algo que ya existe en otro proyecto, un agente encuentra los archivos adecuados mediante el conocimiento compartido, sin que ese proyecto esté abierto.
- **Un libro o una serie.** Los capítulos son documentos; la búsqueda por significado encuentra dónde ya se trató un personaje o un tema, y cada volumen puede ser un proyecto que comparte su conocimiento para mantener coherentes nombres, lugares y reglas.
- **Una guía o un manual.** La guía se nutre de los proyectos que describe, en solo lectura, y un agente comprueba lo que dice contra lo que la fuente hace realmente.
- **Investigación y tesis.** Un proyecto por fuente o capítulo, y el Inicio de proyectos muestra cómo se acercan entre sí los temas.

## Qué hace

**Escribe.** Edición de texto enriquecido con Markdown como formato nativo, vista de código fuente, buscar y reemplazar, notas y marcadores, historial de documentos, importación de DOCX y PDF, exportación a DOCX, PDF o a un archivo Markdown autónomo, y un lector de texto para cualquier otro archivo de texto. → [Documentos y editor](docs/guide/documents-and-editor.md)

**Delega y revisa.** Un asistente que corrige, reescribe, resume y edita, con acciones rápidas, skills de escritura, memoria de proyecto y varios proveedores de IA (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). Cada edición se aplica en el sitio y se marca para que la aceptes o la rechaces, y un turno interrumpido puede reanudarse desde su último paso. → [El asistente](docs/guide/assistant.md)

**Encuentra.** Búsqueda por palabras y por significado, en un proyecto o en todos, con un modelo que se ejecuta en tu ordenador y que solo se descarga si lo pides. Las páginas web se pueden guardar en un proyecto y buscar sin conexión. → [Conocimiento](docs/guide/knowledge.md)

**Míralo todo a la vez.** El Inicio de proyectos es una red de todos tus proyectos, enlazados cuando sus contenidos se acercan en significado, con una búsqueda que funciona como la de un agente. → [Inicio de proyectos](docs/guide/projects-home.md)

**Organiza.** Proyectos con explorador de archivos, subproyectos, documentos enlazados e icono propio; espacios de trabajo que filtran qué proyectos ven tú, el asistente y los agentes. → [Proyectos](docs/guide/projects.md) · [Espacios de trabajo](docs/guide/workspaces.md)

**Conecta.** Cada proyecto decide si se indexa y si sus pasajes son visibles para los demás. Los agentes externos trabajan en el proyecto a través del servidor MCP integrado, y lo que cambian te llega como ediciones que aceptar o rechazar. → [Agentes externos (MCP)](docs/guide/external-agents.md)

**Integra.** Asociaciones de archivos y entrada de carpeta en el gestor de archivos, un navegador integrado con vista de lectura, actualizaciones a tu ritmo. → [La aplicación y el sistema](docs/guide/system.md)

La interfaz está disponible en inglés, italiano, francés, español, alemán y portugués, con temas, colores de acento y tipografía que puedes cambiar.

## Privacidad

El texto de los documentos solo se envía a un proveedor de IA cuando envías una solicitud, y con un modelo local de Ollama nunca sale de tu máquina. El índice de búsqueda y sus vectores viven en tu ordenador; las únicas descargas son los paquetes de modelos locales, y solo cuando pulsas el botón. Los agentes externos son opcionales, solo llegan a los documentos del proyecto y escuchan únicamente en `127.0.0.1` con un token. Los detalles están en [Privacidad](docs/guide/privacy.md).

## Primeros pasos

Requisitos: Node.js LTS actual o posterior y npm.

```bash
cd openwriter
npm install
npm run dev
```

El comando de desarrollo inicia Vite y abre la aplicación Electron. Los cambios en `src/` se recargan automáticamente; los cambios en `electron/` requieren reiniciar el comando. Las asociaciones de archivos y la entrada de carpeta no se registran en la versión de desarrollo: instala una compilación para probarlas.

Las pruebas unitarias se ejecutan con `npm run test:unit`; `npm test` también ejecuta la compilación de producción. Dos de las pruebas semánticas se ejecutan contra el modelo real y se omiten a menos que `OW_SEMANTIC_PACK` apunte a la carpeta de un paquete instalado.

Para crear y ejecutar una compilación de producción en local:

```bash
npm run build
npm start
```

## Documentación

La documentación está en inglés.

- [Documentación técnica](docs/README.md): la arquitectura, el almacenamiento de proyectos, las herramientas del asistente, el flujo de desarrollo y el proceso de publicación, con una página de referencia para cada archivo fuente.
- Las guías de funciones, una página por área: [documentos y editor](docs/guide/documents-and-editor.md), [el asistente](docs/guide/assistant.md), [agentes externos (MCP)](docs/guide/external-agents.md), [proyectos](docs/guide/projects.md), [Inicio de proyectos](docs/guide/projects-home.md), [espacios de trabajo](docs/guide/workspaces.md), [conocimiento](docs/guide/knowledge.md), [la aplicación y el sistema](docs/guide/system.md), [privacidad](docs/guide/privacy.md).
- [Notas de diseño](docs/design/workspaces.md): decisiones tomadas antes de construir.

Toda la documentación del proyecto en `docs/` se produjo con el propio OpenWriter, usando su editor y su asistente de IA.

## Compilación y publicación

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Al subir una etiqueta `v*`, o al iniciar a mano el workflow `Build Desktop App`, se ejecutan lint y pruebas, se compilan los paquetes para Windows, Linux y macOS y se publican como recursos de una GitHub Release. Los pasos están en [la documentación técnica](docs/README.md#releases).

## Contribuir

Las issues y las pull requests son bienvenidas. Las pautas generales — estructura del proyecto, convenciones de código, obligaciones de documentación y cómo informar de un error — están en [CONTRIBUTING.md](CONTRIBUTING.md).

Antes de abrir una pull request, ejecuta:

```bash
npm run lint
npm test
```

Mantén los cambios acotados e incluye una descripción clara del comportamiento visible para el usuario al que afectan.

## Licencia

OpenWriter se publica bajo la licencia MIT. Consulta [LICENSE](LICENSE) para el texto completo.

## Apoyo

Si te resulta útil este proyecto y quieres apoyar su desarrollo:

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

