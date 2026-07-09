/**
 * Architecture Gate — atmosphere tokens are hero-only.
 *
 * The "Gece Penceresi" system has two tiers (see docs/design.md → "Light and
 * atmosphere"). TIER 1 — the light law (`--hairline-lit`, `--shadow-specular-rim`)
 * — is meant to dress every elevated surface and is NOT restricted. TIER 2 —
 * the aurora ATMOSPHERE — is the load-bearing risk: if an aurora hue ever dresses
 * a control or a per-tile surface, the "`--brand` is the one interactive accent,
 * everything else is achromatic" law silently breaks, and AA contrast (measured
 * against a SOLID surface floor) is no longer guaranteed.
 *
 * So the Tier-2 atmosphere tokens may be referenced ONLY by the page/shell-level
 * hero surfaces:
 *   - src/admin/AdminEntry.module.css                       (auth screen)
 *   - src/admin/layouts/AdminPageLayout/AdminPageLayout.module.css (page shell)
 *   - src/admin/pages/dashboard/components/OnboardingPanel.module.css (first-run wizard bento)
 *
 * Any other admin/ui CSS module that reaches for `--auth-aurora-*`,
 * `--auth-vignette`, `--auth-card-*`, `--auth-bloom`, `--auth-sheen`,
 * `--auth-seal-trace`, or `--admin-aurora-*` fails this gate. Onboarding / a
 * future hero surface that legitimately needs the sky is added here on purpose,
 * with review — never by accident.
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [join(SRC_ROOT, 'admin'), join(SRC_ROOT, 'ui')]

/** Tier-2 atmosphere tokens. Tier-1 light-law tokens are deliberately absent. */
const ATMOSPHERE_TOKEN_RE =
  /--(?:auth-(?:aurora-[a-z]+|vignette|card-[a-z]+|bloom|sheen|seal-trace)|admin-aurora-[a-z])/g

/** Hero surfaces permitted to reference the atmosphere. Paths relative to src/. */
const ALLOWLIST = new Set([
  'admin/AdminEntry.module.css',
  'admin/layouts/AdminPageLayout/AdminPageLayout.module.css',
  'admin/pages/dashboard/components/OnboardingPanel.module.css',
])

function collectModuleCss(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectModuleCss(full))
    } else if (extname(entry) === '.css' && entry.endsWith('.module.css')) {
      results.push(full)
    }
  }
  return results
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function relKey(filePath: string): string {
  return relative(SRC_ROOT, filePath).replace(/\\/g, '/')
}

const referencing = new Map<string, string[]>()
for (const root of SCAN_ROOTS) {
  for (const filePath of collectModuleCss(root)) {
    const matches = stripComments(readFileSync(filePath, 'utf8')).match(ATMOSPHERE_TOKEN_RE)
    if (matches) referencing.set(relKey(filePath), [...new Set(matches)])
  }
}

describe('atmosphere tokens are hero-only', () => {
  it('is referenced by every allowlisted hero surface (allowlist does not rot)', () => {
    for (const entry of ALLOWLIST) {
      expect(existsSync(join(SRC_ROOT, entry))).toBe(true)
      expect(referencing.has(entry)).toBe(true)
    }
  })

  it('is never referenced outside the hero-surface allowlist', () => {
    const offenders = [...referencing.keys()].filter((f) => !ALLOWLIST.has(f))
    if (offenders.length > 0) {
      throw new Error(
        'Tier-2 atmosphere tokens (--auth-aurora-* / --auth-vignette / --auth-card-* / ' +
          '--auth-bloom / --auth-sheen / --auth-seal-trace / --admin-aurora-*) may only be ' +
          'used by page/shell hero surfaces. Aurora on a tile or a control breaks the ' +
          'one-accent law and the AA-against-solid-surface guarantee.\n' +
          'Offenders:\n' +
          offenders.map((f) => `  ${f}  →  ${referencing.get(f)!.join(', ')}`).join('\n'),
      )
    }
    expect(offenders).toEqual([])
  })
})
