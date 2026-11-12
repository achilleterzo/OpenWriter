# OpenWriter

[English](README.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Português**

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

O OpenWriter é um espaço de escrita local para Markdown. Os seus documentos, as notas e o conhecimento que se acumula nos seus projetos ficam no seu computador, e dois tipos de agentes podem trabalhar neles em conjunto: o assistente integrado na aplicação e os agentes externos que já usa, ligados através de um servidor MCP integrado.

Foi feito para qualquer trabalho longo que tenha de se manter coerente à medida que cresce: um livro, um guia, um manual, uma tese, um conjunto de documentação, ou um projeto de software e as ideias à sua volta.

Construído com Electron, React, Vite, Tailwind CSS e Tiptap.

## A ideia: documentos, conhecimento, agentes

Escrever algo grande é sobretudo lembrar: o que decidiu, onde já o disse, o que contém outro trabalho. O OpenWriter trata isso como parte da ferramenta.

1. **Escreva o que decide.** Um projeto é uma pasta de documentos Markdown simples, com as suas notas, marcadores, memória, skills e instruções ao lado. Nada fica fechado: tudo é texto legível.
2. **Torne-o encontrável.** Cada projeto pode manter um índice local dos seus documentos, pesquisável por palavras e, com um modelo que corre no seu computador, por significado. Quem trabalha no projeto pede as passagens de que precisa em vez de ler ficheiros inteiros: um contexto menor, menos carga para o modelo e um uso mais preciso do que escreveu.
3. **Deixe os agentes partilhar.** O assistente integrado e os agentes externos leem o mesmo projeto e o mesmo conhecimento. Também podem consultar os projetos que escolher partilhar, mesmo que não estejam abertos.

### Dois agentes em paralelo

O OpenWriter inclui um servidor do Model Context Protocol (MCP). É o padrão através do qual os agentes que já usa — Claude Code, Codex, OpenCode, os clientes integrados em editores e IDE — podem trabalhar numa pasta de ficheiros. Cola uma configuração no cliente (Definições → Agentes (MCP)). A partir daí, esse agente pode ler o projeto, o seu conhecimento, as notas e as páginas guardadas, e alterar os seus documentos. É o agente que já paga e em que confia, posto a trabalhar nos seus Markdown.

Esse agente e o assistente integrado não competem: dividem o trabalho. Enquanto o Claude Code escreve o código ou desenvolve uma ideia, pode entregar a respetiva documentação ao assistente com uma única chamada, `ask_agent`. O assistente abre uma conversa na aplicação e trabalha nela em paralelo, com as instruções, skills e memória do projeto. O agente não tem de escrever esse texto com o seu próprio contexto. Depois acompanha o que ele escreveu lendo essa conversa: `list_chats` encontra-a, e `read_chat` devolve as suas últimas mensagens. O pedido vai assinado com o nome do agente, para se distinguir das suas mensagens. O que qualquer um deles alterar nos documentos abertos chega até si como uma edição para aceitar ou rejeitar. Ambos pesquisam com `search_knowledge` conforme precisam, de modo que nenhum tem de carregar o projeto inteiro.

### Algumas formas de o usar

- **Software e a sua documentação.** As ideias e o código escrevem-se no mesmo sítio enquanto a documentação acompanha. Se lhe for pedido para implementar algo que já existe noutro projeto, um agente encontra os ficheiros certos através do conhecimento partilhado, sem que esse projeto esteja aberto.
- **Um livro ou uma série.** Os capítulos são documentos; a pesquisa por significado encontra onde uma personagem ou um tema já foi tratado, e cada volume pode ser um projeto que partilha o seu conhecimento para manter nomes, lugares e regras consistentes.
- **Um guia ou um manual.** O guia serve-se dos projetos que descreve, só em leitura, e um agente verifica o que ele diz contra o que a fonte realmente faz.
- **Investigação e teses.** Um projeto por fonte ou capítulo, e o Início de projetos mostra como os assuntos se aproximam.

## O que faz

**Escrever.** Edição de texto rico com Markdown como formato nativo, vista de código-fonte, localizar e substituir, notas e marcadores, histórico de documentos, importação de DOCX e PDF, exportação para DOCX, PDF ou um ficheiro Markdown autónomo, e um leitor de texto para qualquer outro ficheiro de texto. → [Documentos e editor](docs/guide/documents-and-editor.md)

**Delegar e rever.** Um assistente que revê, reescreve, resume e edita, com ações rápidas, skills de escrita, memória de projeto e vários fornecedores de IA (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). As ações rápidas são editáveis, e um projeto pode ter as suas, importadas de uma vez de outro projeto. Cada edição é aplicada no local e marcada para a aceitar ou rejeitar — ou, num projeto em que o escolha, aceite e guardada no fim do trabalho. O calor da escrita (a temperatura) e o que o assistente pode fazer definem-se por projeto, e um turno interrompido pode ser retomado a partir do último passo. → [O assistente](docs/guide/assistant.md)

**Encontrar.** Pesquisa por palavras e por significado, num projeto ou em todos, com um modelo que corre no seu computador e só é descarregado se o pedir; um interruptor de palavras inteiras torna-a numa pesquisa exata, para quando procura um nome, uma expressão ou uma citação tal como estão. Se o computador tiver mais de uma placa gráfica, escolhe qual é usada pela pesquisa por significado. As páginas da web podem ser guardadas num projeto e pesquisadas offline. → [Conhecimento](docs/guide/knowledge.md)

**Ver tudo de uma vez.** O Início de projetos é uma rede de todos os seus projetos, ligados quando os seus conteúdos estão próximos em significado, com uma pesquisa que funciona como a de um agente. → [Início de projetos](docs/guide/projects-home.md)

**Organizar.** Projetos com explorador de ficheiros, subprojetos, documentos ligados e ícone próprio; espaços de trabalho que filtram os projetos que você, o assistente e os agentes veem. → [Projetos](docs/guide/projects.md) · [Espaços de trabalho](docs/guide/workspaces.md)

**Ligar.** Cada projeto decide se é indexado e se as suas passagens são visíveis para os outros. Os agentes externos trabalham no projeto através do servidor MCP integrado, e o que alteram chega até si como edições para aceitar ou rejeitar. → [Agentes externos (MCP)](docs/guide/external-agents.md)

**Integrar.** Associações de ficheiros e entrada de pasta no gestor de ficheiros, um navegador integrado com vista de leitura, atualizações ao seu ritmo. → [A aplicação e o sistema](docs/guide/system.md)

A interface está disponível em inglês, italiano, francês, espanhol, alemão e português, com temas, cores de destaque e tipografia que pode alterar.

## Privacidade

Para começar não é preciso conta nem configuração: o editor, os projetos, as notas e a pesquisa por palavras funcionam sozinhos, e só se recorre a um fornecedor de IA quando configura um e envia um pedido. O texto dos documentos só é enviado a um fornecedor de IA quando submete um pedido, e com um modelo Ollama local nunca sai da sua máquina. O índice de pesquisa e os seus vetores ficam no seu computador; as únicas transferências são os pacotes de modelos locais, e só quando clica no botão. O modelo de significado corre no CPU ou, se preferir, numa placa gráfica que escolhe entre as que o computador tem. Os agentes externos são opcionais, só alcançam os documentos do projeto e escutam apenas em `127.0.0.1` com um token. Os detalhes estão em [Privacidade](docs/guide/privacy.md).

## Primeiros passos

O OpenWriter funciona em Windows (instalador), macOS (DMG) e Linux (AppImage, DEB). As compilações prontas estão na [página de releases](https://github.com/achilleterzo/OpenWriter/releases); compilá-lo por conta própria exige os passos abaixo.

Requisitos: Node.js 22 ou posterior e npm. Executa os comandos abaixo na pasta onde clonaste o repositório, seja qual for o nome que lhe deste:

```bash
npm install
npm run dev
```

O comando de desenvolvimento inicia o Vite e abre a aplicação Electron. As alterações em `src/` recarregam automaticamente; as alterações em `electron/` exigem reiniciar o comando. As associações de ficheiros e a entrada de pasta não são registadas na versão de desenvolvimento: instale uma compilação para as experimentar.

Os testes unitários correm com `npm run test:unit`; `npm test` executa também a compilação de produção. Alguns dos testes semânticos correm contra o modelo real e são ignorados a menos que `OW_SEMANTIC_PACK` aponte para a pasta de um pacote instalado.

Para criar e executar uma compilação de produção localmente:

```bash
npm run build
npm start
```

## Documentação

A documentação está em inglês.

- [Documentação técnica](docs/README.md): a arquitetura, o armazenamento dos projetos, as ferramentas do assistente, o fluxo de desenvolvimento e o processo de lançamento, com uma página de referência para cada ficheiro de código-fonte.
- Os guias das funcionalidades, uma página por área: [documentos e editor](docs/guide/documents-and-editor.md), [o assistente](docs/guide/assistant.md), [agentes externos (MCP)](docs/guide/external-agents.md), [projetos](docs/guide/projects.md), [Início de projetos](docs/guide/projects-home.md), [espaços de trabalho](docs/guide/workspaces.md), [conhecimento](docs/guide/knowledge.md), [a aplicação e o sistema](docs/guide/system.md), [privacidade](docs/guide/privacy.md).
- [Notas de conceção](docs/design/workspaces.md): decisões tomadas antes de construir.

Toda a documentação do projeto em `docs/` foi produzida com o próprio OpenWriter, usando o seu editor e o seu assistente de IA.

## Compilação e lançamento

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Enviar uma etiqueta `v*`, ou iniciar manualmente o workflow `Build Desktop App`, executa o lint e os testes, compila os pacotes para Windows, Linux e macOS e publica-os como ativos de uma GitHub Release. Os passos estão na [documentação técnica](docs/README.md#releases).

## Contribuir

Issues e pull requests são bem-vindas. As diretrizes gerais — estrutura do projeto, convenções de código, deveres de documentação e como reportar um erro — estão em [CONTRIBUTING.md](CONTRIBUTING.md).

Antes de abrir uma pull request, execute:

```bash
npm run lint
npm test
```

Mantenha as alterações focadas e inclua uma descrição clara do comportamento visível ao utilizador que afetam.

## Licença

O OpenWriter é lançado sob a licença MIT. Consulte [LICENSE](LICENSE) para o texto completo.

## Apoio

Se acha este projeto útil e quer apoiar o seu desenvolvimento:

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

