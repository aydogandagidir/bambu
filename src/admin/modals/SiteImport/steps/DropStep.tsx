/**
 * DropStep — the first step of the Super Import wizard.
 *
 * Accepts files via drag-and-drop, folder picker, or multi-file picker.
 * Handles directory entry walking for dropped folders. A single .zip file is
 * handed off as a File so the parent can route Bambu archives before static-
 * site ingestion; everything else is passed as a File array.
 *
 * Validation errors (oversized, zip-bomb, traversal) are shown via the
 * `errorMessage` prop — the MODAL catches them from ingestInput() and passes
 * them back here so the drop zone can display them inline.
 */
import { useRef, useState, type DragEvent, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Checkbox } from '@ui/components/Checkbox'
import { Input } from '@ui/components/Input'
import { UploadIcon } from 'pixel-art-icons/icons/upload'
import { FilePlusSolidIcon } from 'pixel-art-icons/icons/file-plus-solid'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import { GlobeSolidIcon } from 'pixel-art-icons/icons/globe-solid'
import styles from './DropStep.module.css'

interface DropStepProps {
  /** True while the modal is ingesting + analyzing the dropped files. */
  busy: boolean
  /** Error message from the last ingest attempt, or null. Shown with role="alert". */
  errorMessage: string | null
  /** Called when the user drops/picks loose files (non-zip). */
  onFilesReady: (files: File[]) => void
  /** Called when a single .zip was dropped or picked. */
  onZipReady: (zipFile: File) => void
  /** Called when the user wants the server to capture a bounded static snapshot from a URL. */
  onCaptureUrlReady: (url: string) => void
}

export function DropStep({ busy, errorMessage, onFilesReady, onZipReady, onCaptureUrlReady }: DropStepProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [captureUrl, setCaptureUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function dispatchFiles(files: File[]) {
    if (files.length === 0) return
    if (
      files.length === 1 &&
      (files[0].name.toLowerCase().endsWith('.zip') ||
        files[0].type === 'application/zip' ||
        files[0].type === 'application/x-zip-compressed')
    ) {
      onZipReady(files[0])
      return
    }
    onFilesReady(files)
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (busy) return

    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) entries.push(entry)
      }

      if (entries.some((en) => en.isDirectory)) {
        const collected: File[] = []
        for (const entry of entries) {
          await collectEntry(entry, '', collected)
        }
        void dispatchFiles(collected)
        return
      }
    }

    const files = Array.from(e.dataTransfer.files)
    void dispatchFiles(files)
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void dispatchFiles(files)
  }

  function handleCaptureSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextUrl = captureUrl.trim()
    if (!nextUrl) {
      setLocalError('Enter a website URL.')
      return
    }
    if (!authorized) {
      setLocalError('Confirm that you have permission to import this site.')
      return
    }
    setLocalError(null)
    onCaptureUrlReady(nextUrl)
  }

  const visibleError = localError ?? errorMessage

  return (
    <div className={styles.wrapper}>
      <form className={styles.capturePanel} onSubmit={handleCaptureSubmit}>
        <div className={styles.captureHeader}>
          <GlobeSolidIcon size={17} aria-hidden="true" className={styles.captureIcon} />
          <div className={styles.captureTitleGroup}>
            <p className={styles.captureTitle}>Capture from URL</p>
            <p className={styles.captureHint}>Creates a bounded static snapshot for review before import</p>
          </div>
        </div>
        <div className={styles.captureRow}>
          <Input
            type="url"
            value={captureUrl}
            placeholder="https://example.com"
            aria-label="Website URL"
            fieldSize="sm"
            disabled={busy}
            invalid={visibleError !== null}
            onChange={(event) => {
              setCaptureUrl(event.currentTarget.value)
              if (localError) setLocalError(null)
            }}
          />
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={busy}
          >
            Capture
          </Button>
        </div>
        <label className={styles.authorizationRow}>
          <Checkbox
            checked={authorized}
            disabled={busy}
            boxSize="sm"
            onCheckedChange={(checked) => {
              setAuthorized(checked)
              if (localError) setLocalError(null)
            }}
          />
          <span>I have permission to import this website.</span>
        </label>
      </form>

      <div
        className={styles.dropZone}
        data-dragging={dragging ? 'true' : undefined}
        data-disabled={busy ? 'true' : undefined}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { void handleDrop(e) }}
        aria-label="Drop site files, a folder, a CMS bundle, or a .zip archive here"
      >
        <UploadIcon size={28} aria-hidden="true" className={styles.dropIcon} />
        <p className={styles.dropTitle}>Drop a site folder, CMS bundle, or .zip here</p>
        <p className={styles.dropHint}>HTML, CSS, images, fonts, and CMS bundles are supported</p>
        <div className={styles.dropActions}>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <FilePlusSolidIcon size={13} aria-hidden="true" />
            Choose files
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderGlyphIcon size={13} aria-hidden="true" />
            Choose folder
          </Button>
        </div>
      </div>

      {busy && (
        <p className={styles.status} aria-live="polite">
          Ingesting files and analyzing…
        </p>
      )}

      {visibleError && (
        <p className={styles.error} role="alert">
          {visibleError}
        </p>
      )}

      {/* Hidden file inputs — not interactive UI controls, purely mechanism. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      {/* webkitdirectory is not in standard TS lib but is valid in all browsers. */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
        // @ts-expect-error webkitdirectory is not in HTMLInputElement typedefs
        webkitdirectory=""
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Directory entry walker — used when a folder is drag-and-dropped
// ---------------------------------------------------------------------------

async function collectEntry(
  entry: FileSystemEntry,
  prefix: string,
  collected: File[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    await new Promise<void>((resolve, reject) => {
      fileEntry.file((file) => {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        // webkitRelativePath is read-only by spec, so we must use defineProperty.
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
          configurable: true,
        })
        collected.push(file)
        resolve()
      }, reject)
    })
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const reader = dirEntry.createReader()
    const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    // readEntries only returns up to 100 entries per call on some browsers;
    // loop until an empty batch signals end of directory.
    let hasMore = true
    while (hasMore) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject)
      })
      hasMore = entries.length > 0
      for (const child of entries) {
        await collectEntry(child, childPrefix, collected)
      }
    }
  }
}
