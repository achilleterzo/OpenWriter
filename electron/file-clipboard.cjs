const { execFile } = require('node:child_process')
const { pathToFileURL, fileURLToPath } = require('node:url')
const { clipboard } = require('electron')

/**
 * Appunti di file del sistema: copia/taglia in OpenWriter e incolla nel file manager o in altri programmi, e viceversa.
 *   write(paths, mode)  → mette i file negli appunti ('copy' o 'cut')
 *   read()              → { paths, cut } se negli appunti ci sono dei file, altrimenti null
 * Windows: PowerShell (formato FileDrop + "Preferred DropEffect", quello di Esplora risorse: copia/taglia, più file).
 * macOS: osascript/JXA con NSPasteboard (Finder non ha "taglia": si copia sempre).
 * Linux: formati dei file manager (x-special/gnome-copied-files, o text/uri-list con x-kde-cutselection).
 */
const TIMEOUT_MS = 15000

function powershell(script, env = {}) {
  const encoded = Buffer.from(`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;${script}`, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], { env: { ...process.env, ...env }, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim().split('\n')[0]))
      else resolve(String(stdout))
    })
  })
}

const WINDOWS_WRITE = `
Add-Type -AssemblyName System.Windows.Forms
$list = New-Object System.Collections.Specialized.StringCollection
# In Windows PowerShell 5 ConvertFrom-Json restituisce l'elenco come un solo oggetto: foreach lo scorre elemento per elemento.
foreach ($p in (ConvertFrom-Json $env:OW_PATHS)) { [void]$list.Add([string]$p) }
$data = New-Object System.Windows.Forms.DataObject
$data.SetFileDropList($list)
$effect = if ($env:OW_MODE -eq 'cut') { 2 } else { 5 }
$ms = New-Object System.IO.MemoryStream
$bytes = [BitConverter]::GetBytes([int]$effect)
$ms.Write($bytes, 0, 4)
$ms.Position = 0
$data.SetData('Preferred DropEffect', $ms)
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
`

const WINDOWS_READ = `
Add-Type -AssemblyName System.Windows.Forms
$d = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($d -and $d.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {
  $files = @($d.GetData([System.Windows.Forms.DataFormats]::FileDrop))
  $effect = 0
  if ($d.GetDataPresent('Preferred DropEffect')) {
    $ms = $d.GetData('Preferred DropEffect')
    $b = New-Object byte[] 4
    [void]$ms.Read($b, 0, 4)
    $effect = [BitConverter]::ToInt32($b, 0)
  }
  $items = @($files | ForEach-Object { [string]$_ })
  $out = @{ paths = $items; cut = (($effect -band 2) -eq 2) }
  $out | ConvertTo-Json -Compress
}
`

const MAC_WRITE = `
ObjC.import('AppKit');
const paths = JSON.parse($.NSProcessInfo.processInfo.environment.objectForKey('OW_PATHS').js);
const urls = paths.map((p) => $.NSURL.fileURLWithPath(p));
const board = $.NSPasteboard.generalPasteboard;
board.clearContents;
board.writeObjects($(urls));
`

const MAC_READ = `
ObjC.import('AppKit');
const board = $.NSPasteboard.generalPasteboard;
const items = board.readObjectsForClassesOptions($([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true }));
const paths = [];
if (items) { for (let i = 0; i < items.count; i += 1) paths.push(ObjC.unwrap(items.objectAtIndex(i).path)); }
JSON.stringify({ paths, cut: false });
`

function osascript(script, env = {}) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { env: { ...process.env, ...env }, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim().split('\n')[0]))
      else resolve(String(stdout))
    })
  })
}

const parseResult = (text) => {
  const trimmed = String(text).trim()
  if (!trimmed) return null
  const data = JSON.parse(trimmed)
  const paths = (Array.isArray(data.paths) ? data.paths : [data.paths]).filter((item) => typeof item === 'string' && item)
  return paths.length ? { paths, cut: Boolean(data.cut) } : null
}

async function write(paths, mode = 'copy') {
  const list = (Array.isArray(paths) ? paths : [paths]).map(String).filter(Boolean)
  if (!list.length) return
  if (process.platform === 'win32') {
    await powershell(WINDOWS_WRITE, { OW_PATHS: JSON.stringify(list), OW_MODE: mode === 'cut' ? 'cut' : 'copy' })
  } else if (process.platform === 'darwin') {
    await osascript(MAC_WRITE, { OW_PATHS: JSON.stringify(list) })
  } else {
    const uris = list.map((item) => pathToFileURL(item).href)
    clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(`${mode === 'cut' ? 'cut' : 'copy'}\n${uris.join('\n')}`))
  }
}

async function read() {
  if (process.platform === 'win32') return parseResult(await powershell(WINDOWS_READ))
  if (process.platform === 'darwin') return parseResult(await osascript(MAC_READ))
  const gnome = clipboard.readBuffer('x-special/gnome-copied-files').toString('utf8')
  const lines = gnome.split('\n').map((line) => line.trim()).filter(Boolean)
  const toPaths = (uris) => uris.filter((uri) => /^file:\/\//i.test(uri)).map((uri) => { try { return fileURLToPath(uri) } catch { return null } }).filter(Boolean)
  if (lines.length > 1 && /^(copy|cut)$/.test(lines[0])) {
    const paths = toPaths(lines.slice(1))
    return paths.length ? { paths, cut: lines[0] === 'cut' } : null
  }
  const uriList = clipboard.readBuffer('text/uri-list').toString('utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  const paths = toPaths(uriList)
  return paths.length ? { paths, cut: clipboard.readBuffer('application/x-kde-cutselection').toString('utf8').trim() === '1' } : null
}

module.exports = { write, read }
