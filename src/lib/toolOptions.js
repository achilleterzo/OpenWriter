import { t } from '../i18n/index.js'

// Gruppi di strumenti dell'assistente, come si mostrano nelle impostazioni (generali e del progetto).
export const toolOptions = [
  { key: 'files', label: t('Project files'), help: t('List folders and read the project\'s files (the .ow folder is excluded).') },
  { key: 'create', label: t('Creating files and folders'), help: t('Create folders and new Markdown or text documents in the project, to write documents there. Existing files are never overwritten.') },
  { key: 'memory', label: t('Memory'), help: t('Lets the assistant save important information about the project (decisions, terminology, style choices), linked to the files it applies to, and re-read it in every conversation. You can inspect and edit it in the Memory tab.') },
  { key: 'notes', label: t('Notes in the document'), help: t('Add notes and suggestions anchored to the text, which you accept or reject, and consult them.') },
  { key: 'edit', label: t('Editing the open document'), help: t('Replace or insert text. Edits can be undone with Ctrl+Z, they are not saved on their own, and a version is archived before the first edit.') },
  { key: 'ask', label: t('Questions with choices'), help: t('The assistant can ask you questions with clickable answers (paged, with "Other" to write your own), instead of listing the options in the text.') },
  { key: 'vision', label: t('Images and screenshots'), help: t('Look at screenshots of the document and of the browser tabs, and at images from pages, links or project files. Requires a model with vision; images are sent to the chosen provider and, for those on the web, downloaded by your computer (local addresses are blocked).') },
  { key: 'web', label: t('Web browsing'), help: t('Search with DuckDuckGo, open pages and read the Browser tabs, including the ones you opened yourself (even pages where you are signed in). Searches and addresses leave your computer; it cannot open local addresses.') },
]
