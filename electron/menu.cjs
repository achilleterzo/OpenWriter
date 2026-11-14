const { Menu } = require('electron')
const { t } = require('./i18n.cjs')

// Le voci con "role" usano un'etichetta esplicita: altrimenti Electron le mostrerebbe nella lingua del sistema, non in quella scelta.
// Menu Visualizza (vista continua / a pagine): nascosto finché la vista a pagine non è rifinita (vedi pagesViewEnabled in src/appearance.js).
const PAGES_VIEW_ENABLED = false

function createApplicationMenu(sendCommand, state = {}) {
  const command = (name) => () => sendCommand(name)
  // `state.home`: la Home dei progetti è aperta e il documento non si vede: ciò che lo modifica o lo cerca si disattiva (modifica, ricerca, salvataggio, stampa, esportazione).
  const onDocument = !state.home
  // Le voci di «Progetto» agiscono sul progetto aperto: senza, restano spente.
  const hasProject = Boolean(state.project)

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: t('File'),
      submenu: [
        { label: t('New document'), accelerator: 'CmdOrCtrl+N', click: command('new') },
        { label: t('Open…'), accelerator: 'CmdOrCtrl+O', click: command('open') },
        { label: t('Open project folder…'), accelerator: 'CmdOrCtrl+Shift+O', click: command('open-project') },
        { label: t('Open project in a new window…'), click: command('open-project-new-window') },
        { label: t('Close tab'), accelerator: 'CmdOrCtrl+W', click: command('close-tab'), enabled: onDocument },
        { type: 'separator' },
        { label: t('Save'), accelerator: 'CmdOrCtrl+S', click: command('save'), enabled: onDocument },
        { label: t('Save as…'), accelerator: 'CmdOrCtrl+Shift+S', click: command('save-as'), enabled: onDocument },
        { type: 'separator' },
        { label: t('Print…'), accelerator: 'CmdOrCtrl+P', click: command('print'), enabled: onDocument },
        { type: 'separator' },
        {
          label: t('Export'),
          enabled: onDocument,
          submenu: [
            { label: t('Word document (.docx)…'), click: command('export-docx') },
            { label: t('PDF document (.pdf)…'), click: command('export-pdf') },
            { label: t('Markdown with embedded images (.md)…'), click: command('export-markdown-embedded') },
          ],
        },
        { label: t('Extract the images of a Markdown file…'), click: command('extract-markdown-images') },
        { type: 'separator' },
        { label: t('Settings…'), accelerator: 'CmdOrCtrl+,', click: command('settings') },
        { type: 'separator' },
        { role: 'quit', label: t('Quit') },
      ],
    },
    {
      label: t('Edit'),
      submenu: [
        { role: 'undo', label: t('Undo'), enabled: onDocument },
        { role: 'redo', label: t('Redo'), enabled: onDocument },
        { type: 'separator' },
        { role: 'cut', label: t('Cut') },
        { role: 'copy', label: t('Copy') },
        { role: 'paste', label: t('Paste') },
        { label: t('Select all'), accelerator: 'CmdOrCtrl+A', click: command('select-all') },
        { type: 'separator' },
        { label: t('Find…'), accelerator: 'CmdOrCtrl+F', click: command('find'), enabled: onDocument },
        { label: t('Replace…'), accelerator: 'CmdOrCtrl+H', click: command('replace'), enabled: onDocument },
      ],
    },
    {
      label: t('Project'),
      submenu: [
        { label: t('New document…'), click: command('project-new-document'), enabled: hasProject },
        { label: t('New folder…'), click: command('project-new-folder'), enabled: hasProject },
        { label: t('Add a reference folder…'), click: command('project-add-reference'), enabled: hasProject },
        { label: t('Move a project here…'), click: command('project-move-here'), enabled: hasProject },
        { label: t('Refresh'), click: command('project-refresh'), enabled: hasProject },
        { type: 'separator' },
        { label: t('Show in file manager'), click: command('project-reveal'), enabled: hasProject },
        { type: 'separator' },
        { label: t('Project settings…'), click: command('project-settings'), enabled: hasProject },
      ],
    },
    ...(PAGES_VIEW_ENABLED ? [{
      label: t('View'),
      submenu: [
        { label: t('Endless'), type: 'radio', checked: state.view !== 'pages', click: command('view-endless') },
        { label: t('Pages (A4)'), type: 'radio', checked: state.view === 'pages', click: command('view-pages') },
      ],
    }] : []),
    {
      label: t('Help'),
      submenu: [
        { label: t('Check for updates…'), click: command('check-updates') },
        { label: t('About OpenWriter'), click: command('about') },
      ],
    },
  ]))
}

module.exports = { createApplicationMenu }
