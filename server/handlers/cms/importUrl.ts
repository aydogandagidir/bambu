import { Type } from '@sinclair/typebox'
import { Window } from 'happy-dom'
import { jsonResponse, badRequest, readValidatedBody } from '../../http'
import { requireCapability } from '../../auth/authz'
import type { DbClient } from '../../db/client'
import { acceptUploadedMedia } from './mediaUpload'
import type { CmsHandlerOptions } from './shared'

const ImportUrlRequestSchema = Type.Object({
  url: Type.String({ format: 'uri' }),
})

function isSafeUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    // Basic SSRF block for obvious private/local/metadata IPs
    const host = u.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Handle POST /admin/api/cms/import-url
 */
export async function handleImportUrlRoute(
  req: Request,
  db: DbClient,
  _options: CmsHandlerOptions,
): Promise<Response | null> {
  const url = new URL(req.url)
  if (req.method !== 'POST' || url.pathname !== '/admin/api/cms/import-url') {
    return null
  }

  const actor = await requireCapability(req, db, 'site.structure.edit')
  if (actor instanceof Response) return actor

  const body = await readValidatedBody(req, ImportUrlRequestSchema)
  if (!body) return badRequest('Invalid request body')

  if (!isSafeUrl(body.url)) {
    return badRequest('Invalid or unsafe URL provided.')
  }

  const targetUrl = new URL(body.url)

  try {
    // 1. Fetch the HTML
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout
    const fetchRes = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'BambuBot/1.0 (Site Importer)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!fetchRes.ok) {
      return badRequest(`Failed to fetch URL: ${fetchRes.status} ${fetchRes.statusText}`)
    }

    const contentType = fetchRes.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return badRequest('The provided URL did not return an HTML document.')
    }

    const htmlText = await fetchRes.text()
    if (htmlText.length > 5 * 1024 * 1024) {
      return badRequest('HTML document is too large (max 5MB).')
    }

    // 2. Parse with happy-dom
    const window = new Window({ url: targetUrl.toString() })
    const document = window.document
    document.write(htmlText)

    // 3. Process Images
    // Find all <img> tags
    const imgTags = document.querySelectorAll('img')
    let downloadedCount = 0

    for (const img of Array.from(imgTags)) {
      const src = img.getAttribute('src')
      if (!src) continue
      if (src.startsWith('data:')) continue // Skip inline base64 images

      try {
        // Resolve absolute URL
        const absoluteSrc = new URL(src, targetUrl.href).toString()
        if (!isSafeUrl(absoluteSrc)) continue

        const imgController = new AbortController()
        const imgTimeout = setTimeout(() => imgController.abort(), 10000)
        const imgRes = await fetch(absoluteSrc, { signal: imgController.signal })
        clearTimeout(imgTimeout)

        if (!imgRes.ok) continue

        const arrayBuffer = await imgRes.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        
        // Convert to File object for acceptUploadedMedia
        const filename = absoluteSrc.split('/').pop()?.split('?')[0] || 'imported-image.jpg'
        const file = new File([bytes], filename, {
          type: imgRes.headers.get('content-type') || 'application/octet-stream',
        })

        // Upload to media library
        const uploadRes = await acceptUploadedMedia(db, {
          file,
          maxBytes: 10 * 1024 * 1024, // 10MB per image
          allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          role: 'original',
          uploadedByUserId: actor.id,
          oversizedMessage: `Image ${filename} is too large.`,
          unsupportedMessage: `Image format for ${filename} is not supported.`,
        })

        if (!(uploadRes instanceof Response)) {
          // Success! uploadRes is the media asset row
          img.setAttribute('src', uploadRes.publicPath)
          // Clear srcset to force use of the imported image (we'll generate our own responsive variants if needed later)
          img.removeAttribute('srcset')
          downloadedCount++
        }
      } catch (e) {
        console.error('Failed to import image:', src, e)
        // Leave the original src intact if import fails
      }
    }

    // 4. Extract CSS from <style> and <link rel="stylesheet">
    // Since happy-dom parses this, the existing importHtml will pick up <style> blocks.
    // For <link rel="stylesheet">, we could fetch them and inline them as <style> blocks
    // so importHtml() picks them up.
    const linkTags = document.querySelectorAll('link[rel="stylesheet"]')
    for (const link of Array.from(linkTags)) {
      const href = link.getAttribute('href')
      if (!href) continue
      try {
        const absoluteHref = new URL(href, targetUrl.href).toString()
        if (!isSafeUrl(absoluteHref)) continue
        const cssRes = await fetch(absoluteHref)
        if (cssRes.ok) {
          const cssText = await cssRes.text()
          const styleEl = document.createElement('style')
          styleEl.textContent = cssText
          document.head.appendChild(styleEl)
        }
      } catch (e) {
        console.error('Failed to fetch CSS:', href, e)
      }
    }

    // 5. Return processed HTML
    // We return the full HTML (including <head> which now contains the inlined <style> blocks).
    // The frontend importHtml() will parse the full source again and extract the <style> blocks.
    const processedHtml = document.documentElement.outerHTML

    return jsonResponse({
      html: processedHtml,
      stats: {
        imagesDownloaded: downloadedCount,
      },
    })
  } catch (err: any) {
    console.error('Import URL error:', err)
    if (err.name === 'AbortError') {
      return badRequest('Request timed out while fetching the URL.')
    }
    return badRequest(`An error occurred while importing: ${err.message}`)
  }
}
