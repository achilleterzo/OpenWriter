import { useEffect } from 'react'

const electronAPI = window.electronAPI

// Gestisce i comandi di menu relativi ai documenti, applicandoli alla scheda attiva.
export default function useDocumentFileCommands({ activeTab, getEditor, workspace, onStatusChange }) {
  useEffect(() => {
    if (!electronAPI) return undefined

    return electronAPI.onDocumentCommand(async (command) => {
      try {
        if (command === 'new') return workspace.newTab()
        if (command === 'close-tab') return activeTab && workspace.closeTab(activeTab.id)
        if (command === 'open') {
          const document = await electronAPI.openDocument()
          if (document) workspace.openDocument(document)
          return undefined
        }

        const editor = activeTab && getEditor(activeTab.id)
        if (!editor) return undefined

        if (command === 'save' || command === 'save-as') {
          const savedPath = await electronAPI.saveMarkdown({
            filePath: activeTab.filePath,
            markdown: editor.getMarkdown(),
            saveAs: command === 'save-as',
          })
          if (savedPath) {
            workspace.markSaved(activeTab.id, savedPath)
            onStatusChange('Salvato')
          }
        }

        if (command === 'export-docx') {
          if (await electronAPI.exportDocx(editor.getHTML())) onStatusChange('DOCX esportato')
        }

        if (command === 'export-pdf') {
          if (await electronAPI.exportPdf(editor.getHTML())) onStatusChange('PDF esportato')
        }
      } catch (error) {
        console.error(error)
        onStatusChange("Errore durante l'operazione")
      }
      return undefined
    })
  }, [activeTab, getEditor, workspace, onStatusChange])
}
