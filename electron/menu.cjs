const { Menu } = require('electron')
const { t } = require('./i18n.cjs')

// Le voci con "role" usano un'etichetta esplicita: altrimenti Electron le mostrerebbe nella lingua del sistema, non in quella scelta.
function createApplicationMenu(sendCommand) {
  const command = (name) => () => sendCommand(name)

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: t('File'),
      submenu: [
        { label: t('New document'), accelerator: 'CmdOrCtrl+N', click: command('new') },
        { label: t('Open…'), accelerator: 'CmdOrCtrl+O', click: command('open') },
        { label: t('Open project folder…'), accelerator: 'CmdOrCtrl+Shift+O', click: command('open-project') },
        { label: t('Close tab'), accelerator: 'CmdOrCtrl+W', click: command('close-tab') },
        { type: 'separator' },
        { label: t('Save'), accelerator: 'CmdOrCtrl+S', click: command('save') },
        { label: t('Save as…'), accelerator: 'CmdOrCtrl+Shift+S', click: command('save-as') },
        { type: 'separator' },
        { label: t('Print…'), accelerator: 'CmdOrCtrl+P', click: command('print') },
        { type: 'separator' },
        { label: t('Export DOCX…'), click: command('export-docx') },
        { label: t('Export PDF…'), click: command('export-pdf') },
        { type: 'separator' },
        { label: t('Settings…'), accelerator: 'CmdOrCtrl+,', click: command('settings') },
        { type: 'separator' },
        { role: 'quit', label: t('Quit') },
      ],
    },
    {
      label: t('Edit'),
      submenu: [
        { role: 'undo', label: t('Undo') },
        { role: 'redo', label: t('Redo') },
        { type: 'separator' },
        { role: 'cut', label: t('Cut') },
        { role: 'copy', label: t('Copy') },
        { role: 'paste', label: t('Paste') },
        { role: 'selectAll', label: t('Select all') },
        { type: 'separator' },
        { label: t('Find…'), accelerator: 'CmdOrCtrl+F', click: command('find') },
        { label: t('Replace…'), accelerator: 'CmdOrCtrl+H', click: command('replace') },
      ],
    },
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
