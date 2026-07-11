/**
 * Architecture Gate — radius and motion token policy.
 *
 * Admin and shared-UI chrome should draw `border-radius` from the radius scale
 * (`--radius-sm` … `--card-radius`, `--radius-pill`) and transition durations
 * from the motion scale (`--duration-fast` / `--duration` / `--duration-slow`),
 * never a raw value. Same discipline the color and spacing gates enforce.
 *
 * Unlike color and spacing, those two scales are SPARSE relative to how the
 * codebase uses them: the motion scale has three durations but the code uses a
 * dozen, and a handful of radii (7px, 9px, 10px, 14px, 20px) sit between the
 * scale steps. Snapping those onto the scale is a visual decision, not a
 * mechanical cleanup, so this gate ships with a frozen BASELINE of the values
 * that predate it. The baseline is a ratchet:
 *
 *   - A file NOT in the baseline may contain ZERO raw values. New code uses
 *     tokens.
 *   - A file IN the baseline must contain EXACTLY its baseline count. Add one
 *     and the gate fails ("use a token"); remove one and it fails ("lower the
 *     baseline") so the numbers only ever shrink.
 *
 * The end state is an empty baseline. Until then, no new drift.
 *
 * What is NOT a violation (allowed by rule, never counted):
 *   - radius: any `var(...)`, any `calc(...)`, `0`, and any value with `%`
 *     (circles). `--radius-pill` covers the fully-round pill idiom.
 *   - motion: durations inside `animation` (keyframe loop periods are custom,
 *     not micro-interaction tokens) and the reduced-motion sentinels
 *     `0.01ms` / `0s`. Only `transition` and `transition-duration` are gated.
 *
 * Published module CSS (`src/modules/`) is out of scope — it ships to user
 * pages where admin tokens do not exist.
 */

import { describe, it, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

const SRC_ROOT = join(import.meta.dir, '../..')
const SCAN_ROOTS = [join(SRC_ROOT, 'admin'), join(SRC_ROOT, 'ui')]
const GLOBALS_CSS = join(SRC_ROOT, 'styles/globals.css')

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

/** Raw `border-radius` values that aren't var/calc/0/percent. */
function countRadiusViolations(source: string): number {
  let n = 0
  for (const m of source.matchAll(/border(?:-[a-z]+)?-radius\s*:\s*([^;]+);/g)) {
    const v = m[1].trim()
    if (v.includes('var(') || v.includes('calc(') || v.includes('%') || /^0(px)?$/.test(v)) continue
    n++
  }
  return n
}

/** `transition` / `transition-duration` declarations carrying a raw time. */
function countMotionViolations(source: string): number {
  let n = 0
  for (const m of source.matchAll(/transition(?:-duration)?\s*:\s*([^;]+);/g)) {
    const withoutTokens = m[1].replace(/var\([^)]*\)/g, '')
    const times = withoutTokens.match(/\b\d*\.?\d+m?s\b/g)
    if (!times) continue
    const real = times.filter((t) => t !== '0.01ms' && t !== '0s' && t !== '0ms')
    if (real.length > 0) n++
  }
  return n
}

// ── Frozen baselines ─────────────────────────────────────────────────────────
// Raw values that predate the gate. Numbers only ever go DOWN. See the header.

const RADIUS_BASELINE: Record<string, number> = {
  'admin/modals/SiteImport/steps/ImportStep.module.css': 1,
  'admin/pages/content/components/ContentModeToggle/ContentModeToggle.module.css': 1,
  'admin/pages/content/nodes/MediaUploadPlaceholderView.module.css': 1,
  'admin/pages/dashboard/components/BlockLibrary.module.css': 2,
  'admin/pages/dashboard/components/DashboardGrid.module.css': 3,
  'admin/pages/dashboard/widgets/widgets.module.css': 1,
  'admin/pages/plugins/components/PluginRemoveDialog/PluginRemoveDialog.module.css': 1,
  'admin/pages/plugins/PluginsPage.module.css': 1,
  'admin/pages/site/canvas/BreakpointSelectionOverlay.module.css': 4,
  'admin/pages/site/canvas/CanvasContextSelector.module.css': 1,
  'admin/pages/site/canvas/CanvasModeToggle.module.css': 2,
  'admin/pages/site/panels/DependenciesPanel/DepsSection.module.css': 2,
  'admin/pages/site/panels/PropertiesPanel/BorderControl/BorderControl.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/ClassPropertyRow.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/LayoutSection.module.css': 1,
  'admin/pages/site/property-controls/controls.module.css': 1,
  'admin/pages/site/sidebars/PanelRail/PanelRail.module.css': 1,
  'admin/spotlight/Spotlight.module.css': 1,
  'ui/components/charts/charts.module.css': 3,
  'ui/components/ColorInput/ColorInput.module.css': 1,
  'ui/components/FloatingActionBar/FloatingActionBar.module.css': 1,
  'ui/components/Switch/Switch.module.css': 1,
}

const MOTION_BASELINE: Record<string, number> = {
  'admin/modals/SiteImport/steps/AnalyzeStep.module.css': 5,
  'admin/modals/SiteImport/steps/DropStep.module.css': 1,
  'admin/modals/SiteImport/steps/ImportStep.module.css': 3,
  'admin/pages/account/AccountPage.module.css': 1,
  'admin/pages/content/components/BodyFloatingMenu/BodyFloatingMenu.module.css': 1,
  'admin/pages/content/components/ContentModeToggle/ContentModeToggle.module.css': 1,
  'admin/pages/content/nodes/MediaUploadPlaceholderView.module.css': 1,
  'admin/pages/dashboard/components/BlockLibrary.module.css': 3,
  'admin/pages/dashboard/components/DashboardGrid.module.css': 4,
  'admin/pages/dashboard/widgets/widgets.module.css': 1,
  'admin/pages/data/components/DataGrid/cells/cells.module.css': 1,
  'admin/pages/data/components/DataGrid/DataGrid.module.css': 5,
  'admin/pages/data/components/ExportDialog/ExportDialog.module.css': 1,
  'admin/pages/media/components/UploadQueueWindow/UploadQueueWindow.module.css': 1,
  'admin/pages/plugins/components/PluginCard/PluginCard.module.css': 1,
  'admin/pages/site/canvas/CanvasLiveSurface.module.css': 2,
  'admin/pages/site/canvas/CanvasModeToggle.module.css': 3,
  'admin/pages/site/canvas/CanvasNotch.module.css': 2,
  'admin/pages/site/canvas/CanvasTransformLayer.module.css': 1,
  'admin/pages/site/module-picker/ModuleInserterDialog.module.css': 2,
  'admin/pages/site/panels/FrameworkPanel/FrameworkHome.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/BorderControl/BorderControl.module.css': 2,
  'admin/pages/site/panels/PropertiesPanel/ClassPropertyRow.module.css': 2,
  'admin/pages/site/panels/PropertiesPanel/CustomPropertiesSection.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/LayoutSection.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/PropertiesPanel.module.css': 1,
  'admin/pages/site/panels/PropertiesPanel/SpacingBoxControl/SpacingBoxControl.module.css': 2,
  'admin/pages/site/panels/PropertiesPanel/StyleRuleComposer.module.css': 1,
  'admin/pages/site/panels/TypographyPanel/FontsSection/FontsSection.module.css': 4,
  'admin/pages/site/property-controls/controls.module.css': 1,
  'admin/pages/site/property-controls/DynamicBindingControl/DynamicBindingControl.module.css': 2,
  'admin/pages/site/sidebars/LeftSidebar/LeftSidebar.module.css': 1,
  'admin/pages/site/sidebars/RightSidebar/RightSidebar.module.css': 1,
  'admin/pages/site/toolbar/Toolbar.module.css': 1,
  'admin/pages/site/ui/Tree/TreeRow.module.css': 2,
  'admin/shared/CapabilityPicker/CapabilityPicker.module.css': 1,
  'admin/shared/dialogs/FrameworkManagerDialog/FrameworkManagerDialog.module.css': 1,
  'admin/shared/SidebarResizeHandle/SidebarResizeHandle.module.css': 1,
  'admin/spotlight/Spotlight.module.css': 1,
  'ui/components/CanvasModulePlaceholder/CanvasModulePlaceholder.module.css': 1,
  'ui/components/Checkbox/Checkbox.module.css': 1,
  'ui/components/DateTimePicker/DateTimePicker.module.css': 2,
  'ui/components/Input/Input.module.css': 2,
  'ui/components/Kbd/Kbd.module.css': 1,
  'ui/components/SegmentedControl/SegmentedControl.module.css': 1,
  'ui/components/Switch/Switch.module.css': 2,
  'ui/components/TagPill/TagPill.module.css': 1,
  'ui/components/Tooltip/Tooltip.module.css': 1,
}

interface Current {
  radius: Map<string, number>
  motion: Map<string, number>
}

function scan(): Current {
  const radius = new Map<string, number>()
  const motion = new Map<string, number>()
  for (const root of SCAN_ROOTS) {
    for (const filePath of collectModuleCss(root)) {
      const src = stripComments(readFileSync(filePath, 'utf8'))
      const key = relKey(filePath)
      const rv = countRadiusViolations(src)
      const mv = countMotionViolations(src)
      if (rv > 0) radius.set(key, rv)
      if (mv > 0) motion.set(key, mv)
    }
  }
  return { radius, motion }
}

/** Diff current counts against the frozen baseline into actionable messages. */
function reconcile(
  current: Map<string, number>,
  baseline: Record<string, number>,
  kind: 'radius' | 'motion',
  fix: string,
): string[] {
  const problems: string[] = []
  for (const [file, count] of current) {
    const allowed = baseline[file] ?? 0
    if (count > allowed) {
      problems.push(
        allowed === 0
          ? `  ${file}: ${count} raw ${kind} value(s) in a file with none before. ${fix}`
          : `  ${file}: ${count} raw ${kind} values, baseline allows ${allowed}. ${fix}`,
      )
    }
  }
  // Ratchet: a file that got cleaner must lower its baseline entry.
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = current.get(file) ?? 0
    if (count < allowed) {
      problems.push(
        `  ${file}: now ${count} raw ${kind} value(s), baseline still says ${allowed}. ` +
          `Lower the ${kind} baseline entry to ${count} (or delete it at 0).`,
      )
    }
  }
  return problems
}

const current = scan()

describe('radius + motion token policy', () => {
  it('declares the radius and motion scales in globals.css', () => {
    const globals = readFileSync(GLOBALS_CSS, 'utf8')
    for (const token of ['--radius-sm', '--radius', '--radius-lg', '--panel-radius', '--card-radius', '--radius-pill']) {
      expect(globals).toContain(`${token}:`)
    }
    for (const token of ['--duration-fast', '--duration', '--duration-slow']) {
      expect(globals).toContain(`${token}:`)
    }
  })

  it('adds no raw border-radius beyond the frozen baseline', () => {
    const problems = reconcile(
      current.radius,
      RADIUS_BASELINE,
      'radius',
      'Use a radius token (--radius-sm … --card-radius, or --radius-pill for pills).',
    )
    if (problems.length > 0) {
      throw new Error(
        'Raw border-radius drift in admin / ui CSS modules.\n' +
          '(var(), calc(), 0, and % are always allowed.)\n\n' +
          problems.join('\n'),
      )
    }
    expect(problems).toEqual([])
  })

  it('adds no raw transition duration beyond the frozen baseline', () => {
    const problems = reconcile(
      current.motion,
      MOTION_BASELINE,
      'motion',
      'Use --duration-fast / --duration / --duration-slow.',
    )
    if (problems.length > 0) {
      throw new Error(
        'Raw transition-duration drift in admin / ui CSS modules.\n' +
          '(animation loop periods and reduced-motion sentinels are allowed; only transition is gated.)\n\n' +
          problems.join('\n'),
      )
    }
    expect(problems).toEqual([])
  })
})
