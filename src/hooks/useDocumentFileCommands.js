import { useEffect } from 'react'
import { t } from '../i18n/index.js'
import { exportableHtml } from '../lib/exportHtml.js'

const electronAPI = window.electronAPI

// Gestisce i comandi di menu relativi ai documenti, applicandoli alla scheda attiva.
export default function useDocumentFileCommands({ activeTab, getEditor, workspace, onStatusChange }) {
  useEffect(() => {
    if (!electronAPI) return undefined

    return electronAPI.onDocumentCommand(async (command) => {
      try {
        if (command === 'find' || command === 'replace') return workspace.requestFind(command === 'replace')
        if (command === 'new') return workspace.newTab()
        if (command === 'close-tab') return activeTab && workspace.closeTab(activeTab.id)
        if (command === 'open') {
          const document = await electronAPI.openDocument()
          if (document) await workspace.openLoaded(document)
          return undefined
        }

        if (command === 'extract-markdown-images') return workspace.extractImages(null, activeTab?.filePath || activeTab?.sourcePath || null)

        const editor = activeTab && getEditor(activeTab.id)
        if (!editor) return undefined

        if (command === 'save' || command === 'save-as') {
          if (await workspace.saveTab(activeTab.id, { saveAs: command === 'save-as' })) onStatusChange(t('Saved'))
        }

        if (command === 'export-docx') {
          if (await electronAPI.exportDocx(exportableHtml(editor.getHTML()))) onStatusChange(t('DOCX exported'))
        }

        if (command === 'export-markdown-embedded') {
          const result = await electronAPI.exportMarkdownEmbedded({ markdown: editor.getMarkdown(), documentPath: activeTab.filePath || activeTab.sourcePath || null, name: activeTab.title })
          if (result) {
            const problems = result.missing + result.tooLarge
            onStatusChange(problems
              ? t('Markdown exported: {count} images embedded, {problems} could not be embedded (missing or too large)', { count: result.embedded, problems })
              : t('Markdown exported: {count} images embedded', { count: result.embedded }))
          }
        }

        if (command === 'print') {
          await electronAPI.printDocument(exportableHtml(editor.getHTML()))
        }

        if (command === 'export-pdf') {
          if (await electronAPI.exportPdf(exportableHtml(editor.getHTML()))) onStatusChange(t('PDF exported'))
        }
      } catch (error) {
        console.error(error)
        onStatusChange(t('The operation failed'))
      }
      return undefined
    })
  }, [activeTab, getEditor, workspace, onStatusChange])
}
