import { Type } from '@sinclair/typebox'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import path from 'node:path'
import { Window } from 'happy-dom'
import { badRequest, payloadTooLarge, readValidatedBody, RequestBodyTooLargeError } from '../../http'
import { requireCapability } from '../../auth/authz'
import { createStoredZipStream, estimateStoredZipSize, type StoredZipEntry } from '../../archive/storedZip'
import type { DbClient } from '../../db/client'
import type { CmsHandlerOptions } from './shared'

const IMPORT_URL_ARCHIVE_PATH = '/admin/api/cms/import-url/archive'

const DEFAULT_MAX_PAGES = 20
const HARD_MAX_PAGES = 50
const MAX_REQUEST_BYTES = 8 * 1024
const MAX_TOTAL_BYTES = 150 * 1024 * 1024
const MAX_HTML_BYTES = 5 * 1024 * 1024
const MAX_CSS_BYTES = 3 * 1024 * 1024
const MAX_SCRIPT_BYTES = 3 * 1024 * 1024
const MAX_ASSET_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

const CaptureArchiveRequestSchema = Type.Object({
  url: Type.String({ format: 'uri' }),
  confirmAuthorized: Type.Boolean(),
  maxPages: Type.Optional(Type.Number({ minimum: 1, maximum: HARD_MAX_PAGES })),
})

type CaptureKind = 'html' | 'css' | 'script' | 'asset'

interface FetchedBytes {
  url: URL
  bytes: Uint8Array
  contentType: string
}

interface CaptureEntry {
  path: string
  bytes: Uint8Array
}

class CaptureError extends Error {
  readonly status: 400 | 413

  constructor(message: string, status: 400 | 413 = 400) {
    super(message)
    this.name = 'CaptureError'
    this.status = status
  }
}

/**
 * Handle POST /admin/api/cms/import-url/archive
 *
 * Captures a bounded same-origin static snapshot and returns it as a normal
 * static-site ZIP. The browser-side Super Import wizard then ingests that ZIP
 * through the existing static import pipeline.
 */
export async function handleImportUrlArchiveRoute(
  req: Request,
  db: DbClient,
  _options: CmsHandlerOptions,
): Promise<Response | null> {
  const url = new URL(req.url)
  if (req.method !== 'POST' || url.pathname !== IMPORT_URL_ARCHIVE_PATH) return null

  const actor = await requireCapability(req, db, 'site.structure.edit')
  if (actor instanceof Response) return actor

  let body: { url: string; confirmAuthorized: boolean; maxPages?: number } | null
  try {
    body = await readValidatedBody(req, CaptureArchiveRequestSchema, { maxBytes: MAX_REQUEST_BYTES })
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return payloadTooLarge('Capture request is too large.')
    }
    throw err
  }
  if (!body) return badRequest('Invalid request body')
  if (!body.confirmAuthorized) {
    return badRequest('Confirm that you have permission to import this site.')
  }

  try {
    const maxPages = clampPageLimit(body.maxPages ?? DEFAULT_MAX_PAGES)
    const capture = await captureSiteArchive(body.url, { maxPages })
    const entries: StoredZipEntry[] = [...capture.entries.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => ({
        path: entry.path,
        source: entry.bytes,
        sizeBytes: entry.bytes.byteLength,
      }))

    if (entries.length === 0) return badRequest('No importable HTML pages were found.')

    const filename = `bambu-site-capture-${Date.now()}.zip`
    return new Response(createStoredZipStream(entries), {
      headers: {
        'content-type': 'application/zip',
        'content-length': String(estimateStoredZipSize(entries)),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    if (err instanceof CaptureError) {
      return err.status === 413 ? payloadTooLarge(err.message) : badRequest(err.message)
    }
    console.error('[import-url/archive] capture failed:', err)
    return badRequest(err instanceof Error ? err.message : 'Unable to capture site.')
  }
}

async function captureSiteArchive(
  inputUrl: string,
  options: { maxPages: number },
): Promise<{ entries: Map<string, CaptureEntry> }> {
  const startUrl = normalizeCaptureUrl(inputUrl)
  await assertPublicHttpUrl(startUrl)

  const entries = new Map<string, CaptureEntry>()
  const reservedPaths = new Set<string>()
  const pagePathByKey = new Map<string, string>()
  const resourcePathByUrl = new Map<string, string | null>()
  const visitedPages = new Set<string>()
  const queuedPages = new Set<string>()
  const queue: URL[] = [startUrl]
  queuedPages.add(canonicalPageKey(startUrl))
  let totalBytes = 0

  const reservePagePath = (pageUrl: URL): string => {
    const key = canonicalPageKey(pageUrl)
    const existing = pagePathByKey.get(key)
    if (existing) return existing

    const desired = preferredPagePathForCapture(pageUrl)
    const reserved = reserveUniquePath(desired, reservedPaths, stableHash(key))
    pagePathByKey.set(key, reserved)
    return reserved
  }
  reservePagePath(startUrl)

  const addEntry = (entryPath: string, bytes: Uint8Array): void => {
    if (entries.has(entryPath)) return
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new CaptureError('Captured site is too large for URL import.', 413)
    }
    entries.set(entryPath, { path: entryPath, bytes })
  }

  const captureResource = async (rawUrl: string, baseUrl: URL, fromPath: string, kind: Exclude<CaptureKind, 'html'>): Promise<string | null> => {
    const absolute = normalizeResourceUrl(rawUrl, baseUrl)
    if (!absolute) return null
    const cacheKey = absolute.toString()
    if (resourcePathByUrl.has(cacheKey)) return resourcePathByUrl.get(cacheKey) ?? null

    try {
      const fetched = await fetchBytesWithGuards(absolute, kind)
      if (!isExpectedContent(kind, fetched.contentType)) {
        resourcePathByUrl.set(cacheKey, null)
        return null
      }
      const resourcePath = resourceCapturePath(fetched.url, kind, fetched.contentType)
      resourcePathByUrl.set(cacheKey, resourcePath)
      if (kind === 'css') {
        const css = new TextDecoder('utf-8', { fatal: false }).decode(fetched.bytes)
        const rewrittenCss = await rewriteCssUrls(css, fetched.url, resourcePath, captureResource)
        addEntry(resourcePath, new TextEncoder().encode(rewrittenCss))
      } else {
        addEntry(resourcePath, fetched.bytes)
      }
      return relativeImportPath(fromPath, resourcePath)
    } catch (err) {
      console.warn('[import-url/archive] skipped resource:', absolute.toString(), err)
      resourcePathByUrl.set(cacheKey, null)
      return null
    }
  }

  while (queue.length > 0 && visitedPages.size < options.maxPages) {
    const current = queue.shift()!
    const pageKey = canonicalPageKey(current)
    if (visitedPages.has(pageKey)) continue
    visitedPages.add(pageKey)

    const fetched = await fetchBytesWithGuards(current, 'html')
    if (!fetched.contentType.includes('text/html')) {
      if (visitedPages.size === 1) {
        throw new CaptureError('The provided URL did not return an HTML document.')
      }
      continue
    }

    const source = new TextDecoder('utf-8', { fatal: false }).decode(fetched.bytes)
    const pagePath = reservePagePath(fetched.url)
    const window = new Window({ url: fetched.url.toString() })
    const document = window.document
    document.write(source)

    for (const base of Array.from(document.querySelectorAll('base'))) base.remove()

    for (const link of Array.from(document.querySelectorAll('a[href]'))) {
      const href = link.getAttribute('href')
      if (!href) continue
      const target = normalizePageLink(href, fetched.url)
      if (!target || !sameOrigin(startUrl, target) || !looksLikeHtmlPage(target)) continue

      const targetKey = canonicalPageKey(target)
      const targetPath = reservePagePath(target)
      link.setAttribute('href', `${relativeImportPath(pagePath, targetPath)}${target.hash}`)

      if (
        !visitedPages.has(targetKey) &&
        !queuedPages.has(targetKey) &&
        queuedPages.size < options.maxPages
      ) {
        queue.push(target)
        queuedPages.add(targetKey)
      }
    }

    for (const link of Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'))) {
      const href = link.getAttribute('href')
      if (!href) continue
      const rewritten = await captureResource(href, fetched.url, pagePath, 'css')
      if (rewritten) link.setAttribute('href', rewritten)
    }

    for (const script of Array.from(document.querySelectorAll('script[src]'))) {
      const src = script.getAttribute('src')
      if (!src) continue
      const rewritten = await captureResource(src, fetched.url, pagePath, 'script')
      if (rewritten) script.setAttribute('src', rewritten)
    }

    for (const el of Array.from(document.querySelectorAll('[src]'))) {
      if (el.tagName.toLowerCase() === 'script') continue
      const src = el.getAttribute('src')
      if (!src) continue
      const rewritten = await captureResource(src, fetched.url, pagePath, 'asset')
      if (rewritten) el.setAttribute('src', rewritten)
    }

    for (const el of Array.from(document.querySelectorAll('[srcset]'))) {
      const srcset = el.getAttribute('srcset')
      if (!srcset) continue
      const rewritten = await rewriteSrcset(srcset, fetched.url, pagePath, captureResource)
      if (rewritten) el.setAttribute('srcset', rewritten)
    }

    const html = `<!doctype html>\n${document.documentElement.outerHTML}`
    addEntry(pagePath, new TextEncoder().encode(html))
  }

  if (visitedPages.size === 0) throw new CaptureError('No importable HTML pages were found.')
  return { entries }
}

async function fetchBytesWithGuards(url: URL, kind: CaptureKind): Promise<FetchedBytes> {
  const maxBytes = maxBytesForKind(kind)
  let current = new URL(url.toString())

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicHttpUrl(current)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'BambuBot/1.0 (Authorized Site Capture)',
          Accept: acceptHeaderForKind(kind),
        },
      })
    } catch (err) {
      throw new CaptureError(err instanceof Error && err.name === 'AbortError'
        ? `Timed out while fetching ${current.hostname}.`
        : `Unable to fetch ${current.toString()}.`)
    } finally {
      clearTimeout(timeout)
    }

    if (isRedirectStatus(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new CaptureError('Capture target returned a redirect without a Location header.')
      current = new URL(location, current)
      continue
    }

    if (!res.ok) {
      throw new CaptureError(`Failed to fetch ${current.toString()}: ${res.status} ${res.statusText}`)
    }

    return {
      url: current,
      contentType: (res.headers.get('content-type') ?? '').toLowerCase(),
      bytes: await readResponseBytes(res, maxBytes),
    }
  }

  throw new CaptureError('Too many redirects while capturing the site.')
}

async function readResponseBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = res.headers.get('content-length')
  if (contentLength) {
    const parsed = Number(contentLength)
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new CaptureError(`Remote resource is too large. Limit is ${formatBytes(maxBytes)}.`, 413)
    }
  }

  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array(0)

  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new CaptureError(`Remote resource is too large. Limit is ${formatBytes(maxBytes)}.`, 413)
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CaptureError('Only http and https URLs can be captured.')
  }
  if (url.username || url.password) {
    throw new CaptureError('URLs with embedded credentials cannot be captured.')
  }

  const hostname = url.hostname.toLowerCase()
  if (!hostname || isBlockedHostnameForCapture(hostname)) {
    throw new CaptureError('This host is not allowed for site capture.')
  }

  const literalKind = isIP(hostname)
  if (literalKind !== 0) {
    if (isBlockedIpForCapture(hostname)) {
      throw new CaptureError('Private, local, and reserved IP addresses cannot be captured.')
    }
    return
  }

  let records: { address: string; family: number }[]
  try {
    records = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new CaptureError(`Unable to resolve ${hostname}.`)
  }
  if (records.length === 0 || records.some((record) => isBlockedIpForCapture(record.address))) {
    throw new CaptureError('Private, local, and reserved IP addresses cannot be captured.')
  }
}

export function isBlockedHostnameForCapture(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
}

export function isBlockedIpForCapture(address: string): boolean {
  const normalized = address.toLowerCase()
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedV4) return isBlockedIpForCapture(mappedV4[1]!)

  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map((part) => Number(part))
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return true
    }
    const [a, b] = parts as [number, number, number, number]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 ||
      a === 192 && b === 0 && parts[2] === 2 ||
      a === 198 && (b === 18 || b === 19) ||
      a === 198 && b === 51 && parts[2] === 100 ||
      a === 203 && b === 0 && parts[2] === 113 ||
      a >= 224
    )
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('2001:db8')
    )
  }

  return true
}

function normalizeCaptureUrl(input: string): URL {
  const raw = input.trim()
  if (!raw) throw new CaptureError('Please enter a URL.')
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const url = new URL(withProtocol)
  url.hash = ''
  return url
}

function normalizeResourceUrl(rawUrl: string, baseUrl: URL): URL | null {
  const trimmed = rawUrl.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (/^(data|blob|mailto|tel|sms|javascript):/i.test(trimmed)) return null
  try {
    return new URL(trimmed, baseUrl)
  } catch {
    return null
  }
}

function normalizePageLink(rawUrl: string, baseUrl: URL): URL | null {
  const normalized = normalizeResourceUrl(rawUrl, baseUrl)
  if (!normalized) return null
  normalized.hash = normalized.hash || ''
  normalized.search = ''
  return normalized
}

function sameOrigin(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && left.host === right.host
}

function canonicalPageKey(url: URL): string {
  const key = new URL(url.toString())
  key.hash = ''
  key.search = ''
  return key.toString()
}

function looksLikeHtmlPage(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.pathname.endsWith('/')) return true
  const ext = path.posix.extname(url.pathname).toLowerCase()
  return ext === '' || ext === '.html' || ext === '.htm' || ext === '.php' || ext === '.asp' || ext === '.aspx'
}

export function preferredPagePathForCapture(url: URL): string {
  const rawSegments = url.pathname.split('/').filter(Boolean)
  if (rawSegments.length === 0) return 'index.html'

  const segments = rawSegments.map((segment, index) => sanitizePathSegment(segment, `page-${index + 1}`))
  if (url.pathname.endsWith('/')) return `${segments.join('/')}/index.html`

  const last = segments[segments.length - 1]!
  const ext = path.posix.extname(last).toLowerCase()
  if (ext === '.html' || ext === '.htm') {
    segments[segments.length - 1] = `${path.posix.basename(last, ext)}.html`
    return segments.join('/')
  }
  if (ext === '.php' || ext === '.asp' || ext === '.aspx') {
    segments[segments.length - 1] = `${path.posix.basename(last, ext)}.html`
    return segments.join('/')
  }
  if (ext) return `${segments.join('/')}/index.html`
  segments[segments.length - 1] = `${last}.html`
  return segments.join('/')
}

function resourceCapturePath(url: URL, kind: Exclude<CaptureKind, 'html'>, contentType: string): string {
  const hash = stableHash(url.toString()).slice(0, 16)
  const rawExt = path.posix.extname(url.pathname).toLowerCase()
  const ext = safeExtension(rawExt) || extensionForContentType(contentType, kind)
  if (kind === 'css') return `styles/${hash}.css`
  if (kind === 'script') return `scripts/${hash}${ext || '.js'}`
  return `assets/${hash}${ext || '.bin'}`
}

async function rewriteSrcset(
  srcset: string,
  baseUrl: URL,
  fromPath: string,
  captureResource: (rawUrl: string, baseUrl: URL, fromPath: string, kind: Exclude<CaptureKind, 'html'>) => Promise<string | null>,
): Promise<string | null> {
  const parts = srcset.split(',')
  const rewrittenParts: string[] = []
  let changed = false

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const [candidate, ...descriptorParts] = trimmed.split(/\s+/)
    if (!candidate) continue
    const rewritten = await captureResource(candidate, baseUrl, fromPath, 'asset')
    if (rewritten) {
      changed = true
      rewrittenParts.push([rewritten, ...descriptorParts].join(' '))
    } else {
      rewrittenParts.push(trimmed)
    }
  }

  return changed ? rewrittenParts.join(', ') : null
}

async function rewriteCssUrls(
  css: string,
  cssUrl: URL,
  cssPath: string,
  captureResource: (rawUrl: string, baseUrl: URL, fromPath: string, kind: Exclude<CaptureKind, 'html'>) => Promise<string | null>,
): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)]
  const replacements = new Map<string, string>()

  for (const match of matches) {
    const raw = match[2]?.trim()
    if (!raw || replacements.has(raw)) continue
    const rewritten = await captureResource(raw, cssUrl, cssPath, 'asset')
    if (rewritten) replacements.set(raw, rewritten)
  }

  if (replacements.size === 0) return css
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote: string, raw: string) => {
    const rewritten = replacements.get(raw.trim())
    return rewritten ? `url(${quote}${rewritten}${quote})` : full
  })
}

function reserveUniquePath(desiredPath: string, reserved: Set<string>, hash: string): string {
  const safeDesired = sanitizeZipPath(desiredPath)
  if (!reserved.has(safeDesired)) {
    reserved.add(safeDesired)
    return safeDesired
  }

  const ext = path.posix.extname(safeDesired)
  const dir = path.posix.dirname(safeDesired)
  const stem = path.posix.basename(safeDesired, ext)
  const candidate = path.posix.join(dir === '.' ? '' : dir, `${stem}-${hash.slice(0, 8)}${ext || '.html'}`)
  reserved.add(candidate)
  return candidate
}

function sanitizeZipPath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/') || 'index.html'
}

function sanitizePathSegment(segment: string, fallback: string): string {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // Keep the original percent-encoded segment.
  }
  const sanitized = decoded
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || fallback
}

function relativeImportPath(fromPath: string, targetPath: string): string {
  const fromDir = path.posix.dirname(fromPath)
  const rel = path.posix.relative(fromDir === '.' ? '' : fromDir, targetPath)
  return rel || path.posix.basename(targetPath)
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeExtension(ext: string): string {
  if (!ext || ext.length > 12) return ''
  return /^[.][a-z0-9]+$/.test(ext) ? ext : ''
}

function extensionForContentType(contentType: string, kind: Exclude<CaptureKind, 'html'>): string {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (type === 'text/css') return '.css'
  if (type.includes('javascript') || type === 'text/ecmascript') return '.js'
  if (type === 'image/jpeg') return '.jpg'
  if (type === 'image/png') return '.png'
  if (type === 'image/webp') return '.webp'
  if (type === 'image/gif') return '.gif'
  if (type === 'image/svg+xml') return '.svg'
  if (type === 'font/woff2') return '.woff2'
  if (type === 'font/woff') return '.woff'
  if (type === 'font/ttf') return '.ttf'
  if (type === 'font/otf') return '.otf'
  return kind === 'script' ? '.js' : ''
}

function maxBytesForKind(kind: CaptureKind): number {
  if (kind === 'html') return MAX_HTML_BYTES
  if (kind === 'css') return MAX_CSS_BYTES
  if (kind === 'script') return MAX_SCRIPT_BYTES
  return MAX_ASSET_BYTES
}

function acceptHeaderForKind(kind: CaptureKind): string {
  if (kind === 'html') return 'text/html,application/xhtml+xml,application/xml;q=0.9'
  if (kind === 'css') return 'text/css,*/*;q=0.5'
  if (kind === 'script') return 'application/javascript,text/javascript,*/*;q=0.5'
  return 'image/avif,image/webp,image/*,font/*,*/*;q=0.4'
}

function isExpectedContent(kind: Exclude<CaptureKind, 'html'>, contentType: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!type) return true
  if (kind === 'css') return type === 'text/css' || type === 'text/plain'
  if (kind === 'script') return type.includes('javascript') || type === 'text/plain' || type === 'application/octet-stream'
  return (
    type.startsWith('image/') ||
    type.startsWith('font/') ||
    type === 'application/font-woff' ||
    type === 'application/octet-stream'
  )
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function clampPageLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_PAGES
  return Math.min(HARD_MAX_PAGES, Math.max(1, Math.floor(value)))
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}
