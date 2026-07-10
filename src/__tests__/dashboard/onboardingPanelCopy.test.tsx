/**
 * Onboarding panel copy.
 *
 * The panel used to speak in mission-control metaphor — "Command Center",
 * "System setup sequence", "PHASE 01", "%20 ONLINE" — to an audience of small
 * business owners setting up a website. This pins the plain-language
 * replacement, and pins the step count to `STEPS` rather than a hardcoded word.
 */

import { describe, it, expect, afterEach } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from '@admin/lib/routing'
import type { OnboardingFacts } from '../../admin/pages/dashboard/hooks/useOnboardingState'

import { OnboardingPanel } from '../../admin/pages/dashboard/components/OnboardingPanel'

const FACTS: OnboardingFacts = {
  loading: false,
  identity: 'done',
  framework: 'active',
  firstPage: 'todo',
  plugin: 'todo',
  team: 'todo',
}

/**
 * A router provider, not module mocks: `mock.module` in Bun is process-wide and
 * leaks into every other test file that shares the worker. The panel's only
 * hard dependency on its environment is `useAdminNavigate`.
 */
function renderPanel(facts: OnboardingFacts = FACTS) {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <OnboardingPanel facts={facts} onDismiss={() => {}} onFrameworkImported={() => {}} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('onboarding panel copy', () => {
  it('names itself in plain language', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Setup checklist', level: 2 })).toBeTruthy()
    expect(screen.queryByText(/command center/i)).toBeNull()
    expect(screen.queryByText(/system setup sequence/i)).toBeNull()
  })

  it('counts its own steps instead of spelling the number out', () => {
    renderPanel()
    const stepHeadings = screen.getAllByRole('heading', { level: 3 })
    expect(screen.getByText(`${stepHeadings.length} steps to a site you can publish.`)).toBeTruthy()
  })

  it('numbers steps rather than staging them as phases', () => {
    renderPanel()
    expect(screen.getByText('Step 1')).toBeTruthy()
    expect(screen.getByText('Step 5')).toBeTruthy()
    expect(screen.queryByText(/PHASE/)).toBeNull()
  })

  it('reports progress as a percentage complete, not a system state', () => {
    renderPanel()
    expect(screen.getByText('20%')).toBeTruthy()
    expect(screen.getByText('complete')).toBeTruthy()
    expect(screen.queryByText('ONLINE')).toBeNull()
  })

  it('offers to dismiss without restating what it is', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss Setup' })).toBeNull()
  })
})
