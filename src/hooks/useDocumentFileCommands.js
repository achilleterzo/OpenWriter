import { useEffect, useState } from 'react'

const electronAPI = window.electronAPI

export default function useDocumentFileCommands(editor, onStatusChange) {
  const [filePath, setFilePath] = useState(null)

  useEffect(() => {
    if (!electronAPI || !editor) return undefined

    return electronAPI.onDocumentCommand(async (command) => {
      try {
        if (command === 'open') {
          const document = await electronAPI.openDocument()
          if (!document) return
          if (document.contentType === 'markdown') {
            editor.commands.setContent(document.content, { contentType: 'markdown' })
          } else {
            editor.commands.setContent(document.content)
          }
          setFilePath(document.format === 'markdown' ? document.filePath : null)
          onStatusChange('Aperto')
        }

        if (command === 'save' || command === 'save-as') {
          const savedPath = await electronAPI.saveMarkdown({
            filePath,
            markdown: editor.getMarkdown(),
            saveAs: command === 'save-as',
          })
          if (savedPath) {
            setFilePath(savedPath)
            onStatusChange('Salvato')
          }
        }

        if (command === 'export-docx') {
          const exportedPath = await electronAPI.exportDocx(editor.getHTML())
          if (exportedPath) onStatusChange('DOCX esportato')
        }

        if (command === 'export-pdf') {
          const exportedPath = await electronAPI.exportPdf(editor.getHTML())
          if (exportedPath) onStatusChange('PDF esportato')
        }
      } catch (error) {
        console.error(error)
        onStatusChange("Errore durante l'operazione")
      }
    })
  }, [editor, filePath, onStatusChange])
}
