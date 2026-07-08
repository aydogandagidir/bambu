import { useState } from 'react'
import { Button } from '@ui/components/Button'
import { Dialog } from '@ui/components/Dialog'
import { Input } from '@ui/components/Input'
import { pushToast } from '@ui/components/Toast'
import { getErrorMessage } from '@core/utils/errorMessage'
import { requestEditorSave } from '@admin/state/adminEvents'
import { useEditorStore } from '@site/store/store'
import { importHtml } from '@core/htmlImport/walkAndMap'
import { cssToStyleRules } from '@core/css/cssParser'
import styles from './ImportUrlDialog.module.css'

export function ImportUrlDialog() {
  const open = useEditorStore((s) => s.importUrlDialogOpen)
  const close = useEditorStore((s) => s.closeImportUrlDialog)
  if (!open) return null

  return <ImportUrlDialogBody onClose={close} />
}

function ImportUrlDialogBody({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ imagesDownloaded: number } | null>(null)

  const activePageId = useEditorStore((s) => s.activePageId)
  const activeDocument = useEditorStore((s) => s.activeDocument)
  const site = useEditorStore((s) => s.site)
  const insertImportedNodes = useEditorStore((s) => s.insertImportedNodes)

  const page = site?.pages.find((p) => p.id === activePageId)
  const rootNodeId = page?.rootNodeId

  async function handleSubmit() {
    if (!url.trim()) {
      setError('Please enter a URL.')
      return
    }

    // Active document check: we only want to import to a page document for now.
    if (!rootNodeId) {
      setError('No active page found to import into.')
      return
    }
    if (activeDocument && activeDocument.kind !== 'page') {
      setError('Please exit component editing mode before importing.')
      return
    }

    try {
      setStatus('loading')
      setError(null)
      setStats(null)

      const res = await fetch('/admin/api/cms/import-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error: ${res.statusText}`)
      }

      const { html, stats: importStats } = await res.json()

      // Convert HTML to Bambu nodes
      const importResult = importHtml(html)
      const styleRules = cssToStyleRules(importResult.styleCss)

      // Insert into the current page
      insertImportedNodes(rootNodeId, importResult, { styleRules })

      setStats(importStats)
      setStatus('success')
      
      requestEditorSave()
      
      pushToast({
        kind: 'success',
        title: 'Site Imported Successfully',
        body: `Imported ${importResult.nodes.length} elements and ${importStats.imagesDownloaded} images.`,
        location: 'site-editor',
      })

      // Close after a brief success delay
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setStatus('idle')
      setError(getErrorMessage(err, 'Failed to import site'))
    }
  }

  return (
    <Dialog
      open
      onClose={status === 'loading' ? () => {} : onClose}
      title="Import from URL"
      eyebrow="Tools"
      size="sm"
      footer={
        <>
          <Button 
            variant="secondary" 
            type="button" 
            onClick={onClose}
            disabled={status === 'loading'}
          >
            Cancel
          </Button>
          <Button 
            variant="primary" 
            type="button" 
            onClick={handleSubmit}
            disabled={status === 'loading' || status === 'success'}
          >
            {status === 'loading' ? 'Importing...' : status === 'success' ? 'Done!' : 'Import'}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <Input
          value={url}
          placeholder="https://example.com"
          aria-label="Website URL"
          autoFocus
          disabled={status === 'loading' || status === 'success'}
          invalid={!!error}
          onChange={(e) => {
            setUrl(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <p className={styles.hint}>
          Fetches the HTML from the given URL, downloads images to your media library, and adds the structure to your current page.
        </p>
        {error !== null && (
          <div role="alert" className={styles.errorAlert}>
            {error}
          </div>
        )}
        {stats !== null && (
          <div role="status" className={styles.statsAlert}>
            Successfully processed HTML and {stats.imagesDownloaded} images.
          </div>
        )}
      </div>
    </Dialog>
  )
}
