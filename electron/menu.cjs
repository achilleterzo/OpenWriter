const { Menu } = require('electron')

function createApplicationMenu(sendCommand) {
  const command = (name) => () => sendCommand(name)

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Apri...', accelerator: 'CmdOrCtrl+O', click: command('open') },
        { label: 'Salva', accelerator: 'CmdOrCtrl+S', click: command('save') },
        { label: 'Salva con nome...', accelerator: 'CmdOrCtrl+Shift+S', click: command('save-as') },
        { type: 'separator' },
        { label: 'Esporta DOCX...', click: command('export-docx') },
        { label: 'Esporta PDF...', click: command('export-pdf') },
        { type: 'separator' },
        { label: 'Impostazioni...', accelerator: 'CmdOrCtrl+,', click: command('settings') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Modifica',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]))
}

module.exports = { createApplicationMenu }
