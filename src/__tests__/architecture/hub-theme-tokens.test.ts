/**
 * Architecture Gate — Hub portal speaks the admin's design language.
 *
 * The portal (`server/hub/portalPage.ts`) is server-rendered on its own host
 * and cannot import `src/styles/globals.css`, so `server/hub/theme.ts`
 * transcribes the Deep Ocean tokens it needs. A transcription rots silently:
 * a retuned `--brand` in `globals.css` would leave the portal on the old hue,
 * and a `var(--x)` the theme forgot to declare renders as *nothing* rather
 * than as an error.
 *
 * This gate closes both directions:
 *   1. every token the theme declares matches `globals.css` byte-for-byte
 *   2. every token the theme declares is actually used by the portal
 *   3. every `var(--x)` the portal reads is declared by the theme
 *   4. the portal markup carries no raw hex / rgb() / hsl() colour
 *   5. the portal never opens an HTML sink for owner-supplied strings
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HUB_TOKENS } from '../../../server/hub/theme'
import { renderHubPortal } from '../../../server/hub/portalPage'

const GLOBALS_CSS = join(import.meta.dir, '../../styles/globals.css')

/** `:root { ... }` — no nested braces in either file, so the first `}` closes it. */
function rootBlock(css: string): string {
  const match = /:root\s*\{([\s\S]*?)\}/.exec(css)
  if (!match) throw new Error('No :root block found')
  return match[1]
}

/** Custom-property values never contain `;`, so a semicolon always terminates one. */
function parseDeclarations(block: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(name, value.replace(/\s+/g, ' ').trim())
  }
  return declarations
}

const globalTokens = parseDeclarations(rootBlock(readFileSync(GLOBALS_CSS, 'utf8')))
const hubTokens = parseDeclarations(rootBlock(HUB_TOKENS))

/** Auth and dashboard are separate documents — both must hold the line. */
const renders = [
  { view: 'auth', html: renderHubPortal({ authenticated: false }) },
  { view: 'dashboard', html: renderHubPortal({ authenticated: true }) },
]
const portalHtml = renders.map(render => render.html).join('\n')

function referencedTokens(source: string): Set<string> {
  return new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]))
}

describe('hub theme tokens', () => {
  it('declares at least the core Deep Ocean families', () => {
    expect(hubTokens.size).toBeGreaterThan(30)
    for (const token of ['--bg-body', '--brand', '--brand-ink', '--glass-surface', '--focus-ring']) {
      expect(hubTokens.has(token)).toBe(true)
    }
  })

  it('matches globals.css for every token it transcribes', () => {
    const drifted: string[] = []
    for (const [name, value] of hubTokens) {
      const canonical = globalTokens.get(name)
      if (canonical !== value) {
        drifted.push(`${name}: hub="${value}" globals="${canonical ?? '<undefined>'}"`)
      }
    }
    expect(drifted).toEqual([])
  })

  it('declares no token the portal does not use', () => {
    const used = referencedTokens(portalHtml)
    const unused = [...hubTokens.keys()].filter(name => !used.has(name))
    expect(unused).toEqual([])
  })
})

describe('hub portal markup', () => {
  it('reads no token the theme does not declare', () => {
    const undeclared = [...referencedTokens(portalHtml)].filter(name => !hubTokens.has(name))
    expect(undeclared).toEqual([])
  })

  it.each(renders)('carries no raw colour outside the token block ($view)', ({ html }) => {
    const markup = html.replace(HUB_TOKENS, '')
    expect(markup.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(markup.match(/\b(?:rgba?|hsla?)\(/g) ?? []).toEqual([])
  })

  it.each(renders)('has no HTML sink — workspace domains are owner-supplied ($view)', ({ html }) => {
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/)
  })

  it('serves one view per session state, with no class to toggle', () => {
    const [auth, dashboard] = renders.map(render => render.html)
    expect(auth).toContain('id="authForm"')
    expect(auth).not.toContain('id="createForm"')
    expect(dashboard).toContain('id="createForm"')
    expect(dashboard).not.toContain('id="authForm"')
    expect(portalHtml).not.toMatch(/class="hidden"|\.hidden\s*\{/)
  })
})
