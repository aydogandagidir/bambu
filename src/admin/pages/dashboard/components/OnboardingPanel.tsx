import { useState } from 'react'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import { ChevronRightIcon } from 'pixel-art-icons/icons/chevron-right'
import { FileTextSolidIcon } from 'pixel-art-icons/icons/file-text-solid'
import { ImageSolidIcon } from 'pixel-art-icons/icons/image-solid'
import { PackageSolidIcon } from 'pixel-art-icons/icons/package-solid'
import { UsersSolidIcon } from 'pixel-art-icons/icons/users-solid'
import { CodeIcon } from 'pixel-art-icons/icons/code'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { useAdminUi } from '@admin/state/adminUi'
import { requestCmsSiteReload } from '@admin/state/adminEvents'
import { Button } from '@ui/components/Button'
import type { PixelArtIconComponent } from '@core/dashboard'
import type { OnboardingFacts, OnboardingStepState } from '../hooks/useOnboardingState'
import {
  FrameworkManagerDialog,
  type FrameworkManagerApplier,
} from '@admin/shared/dialogs/FrameworkManagerDialog'
import { cmsAdapter } from '@core/persistence/cms'
import { applyFrameworkPreset } from '@core/framework'
import { reconcileFrameworkClasses } from '@site/store/slices/site/framework/reconcile'
import styles from './OnboardingPanel.module.css'

interface StepDef {
  id: keyof Pick<OnboardingFacts, 'identity' | 'framework' | 'firstPage' | 'plugin' | 'team'>
  title: string
  desc: string
  cta: string
  icon: PixelArtIconComponent
  action:
    | { kind: 'navigate'; to: string }
    | { kind: 'settings-modal' }
    | { kind: 'framework-import' }
}

/** Screen-reader wording for each step state — the visual tint/check alone can't say this. */
const STATE_LABEL: Record<OnboardingStepState, string> = {
  done: 'Completed',
  active: 'In progress',
  todo: 'Not started',
}

const STEPS: readonly StepDef[] = [
  {
    id: 'identity',
    title: 'Site Identity',
    desc: 'Pick a favicon, logo and site title.',
    cta: 'Open settings',
    icon: ImageSolidIcon,
    action: { kind: 'settings-modal' },
  },
  {
    id: 'framework',
    title: 'Core Framework',
    desc: 'Setup your CSS variables and utilities.',
    cta: 'Import',
    icon: CodeIcon,
    action: { kind: 'framework-import' },
  },
  {
    id: 'firstPage',
    title: 'First Page',
    desc: 'Start from a blank canvas or starter layout.',
    cta: 'New page',
    icon: FileTextSolidIcon,
    action: { kind: 'navigate', to: '/admin/site' },
  },
  {
    id: 'plugin',
    title: 'Install Plugin',
    desc: 'Add SEO, comments, or image optimization.',
    cta: 'Browse',
    icon: PackageSolidIcon,
    action: { kind: 'navigate', to: '/admin/plugins' },
  },
  {
    id: 'team',
    title: 'Invite Team',
    desc: 'Add editors, designers and developers.',
    cta: 'Add members',
    icon: UsersSolidIcon,
    action: { kind: 'navigate', to: '/admin/users' },
  },
]

interface OnboardingPanelProps {
  facts: OnboardingFacts
  onDismiss: () => void
  onFrameworkImported: () => void
}

export function OnboardingPanel({ facts, onDismiss, onFrameworkImported }: OnboardingPanelProps) {
  const navigate = useAdminNavigate()
  const openSettings = useAdminUi((s) => s.openSettings)
  const [frameworkImportOpen, setFrameworkImportOpen] = useState(false)

  const onboardingApplier: FrameworkManagerApplier = {
    capabilities: { canRemove: true },
    apply: async (target) => {
      const site = await cmsAdapter.loadSite('default')
      if (!site) throw new Error('Site is not ready yet — finish setup first.')
      site.settings.framework = applyFrameworkPreset(site.settings.framework, target)
      reconcileFrameworkClasses(site)
      await cmsAdapter.saveSite(site, {
        baselinePageIds: site.pages.map((page) => page.id),
        dirty: { all: false, pageIds: new Set(), componentIds: new Set(), layoutIds: new Set() },
      })
      requestCmsSiteReload()
    },
  }

  const states = STEPS.map((step) => ({ step, state: facts[step.id] }))
  const done = states.filter((s) => s.state === 'done').length
  const total = STEPS.length
  const percent = Math.round((done / total) * 100)

  // Calculate SVG circle properties for the progress
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percent / 100) * circumference

  function runStep(step: StepDef) {
    if (step.action.kind === 'navigate') {
      navigate(step.action.to)
    } else if (step.action.kind === 'framework-import') {
      setFrameworkImportOpen(true)
    } else {
      openSettings('general')
    }
  }

  return (
    <section className={styles.bentoBox}>
      {/* Left Sidebar: Progress */}
      <div className={styles.bentoSidebar}>
        <div className={styles.sidebarTop}>
          <h2>Setup checklist</h2>
          {/* Counted, not hardcoded — the sentence can't drift from STEPS. */}
          <p>{total} steps to a site you can publish.</p>
        </div>

        <div className={styles.progressContainer}>
          <svg
            className={styles.progressSvg}
            width="120"
            height="120"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              className={styles.progressTrack}
              cx="50"
              cy="50"
              r={radius}
              strokeWidth="6"
              fill="transparent"
            />
            <circle
              className={styles.progressIndicator}
              cx="50"
              cy="50"
              r={radius}
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.progressText}>
            <span className={styles.progressValue}>{percent}%</span>
            <span className={styles.progressLabel}>complete</span>
          </div>
        </div>

        <div className={styles.sidebarBottom}>
          <Button variant="ghost" size="sm" onClick={onDismiss} className={styles.dismissBtn}>
            Dismiss
          </Button>
        </div>
      </div>

      {/* Right Grid: Setup Tasks */}
      <ul className={styles.bentoGrid}>
        {states.map(({ step, state }, i) => {
          const StepIcon = step.icon
          const variant = state === 'done' ? 'ghost' : state === 'active' ? 'primary' : 'secondary'

          return (
            <li className={styles.stepCard} data-state={state} key={step.id}>
              <div className={styles.stepHeader}>
                <span className={styles.stepIndex}>Step {i + 1}</span>
                <span className={styles.stepIcon} aria-hidden="true">
                  {state === 'done' ? <CheckIcon size={14} /> : <StepIcon size={14} />}
                </span>
              </div>
              <div className={styles.stepBody}>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
              {/* The check icon and the card tint carry state visually only. Assistive
                  tech needs it in text, so state stays announced alongside the title. */}
              <span className={styles.srOnly}>{STATE_LABEL[state]}</span>
              <div className={styles.stepFoot}>
                <Button variant={variant} size="sm" onClick={() => runStep(step)} className={styles.stepButton}>
                  {step.cta}
                  <ChevronRightIcon size={10} aria-hidden="true" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <FrameworkManagerDialog
        open={frameworkImportOpen}
        onClose={() => setFrameworkImportOpen(false)}
        applier={onboardingApplier}
        currentState={facts.framework === 'done' ? 'full' : 'none'}
        initialTarget="full"
        onApplied={onFrameworkImported}
      />
    </section>
  )
}
