import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'

import { LoaderIcon } from 'pixel-art-icons/icons/loader'
import { EyeSolidIcon } from 'pixel-art-icons/icons/eye-solid'
import { EyeOffSolidIcon } from 'pixel-art-icons/icons/eye-off-solid'
import { CircleAlertSolidIcon } from 'pixel-art-icons/icons/circle-alert-solid'
import { LockSolidIcon } from 'pixel-art-icons/icons/lock-solid'
import {
  getCurrentCmsUser,
  loginCms,
  setupCms,
  verifyCmsMfa,
  type CmsCurrentUser,
  type CmsPublicSite,
} from '@core/persistence/auth'
import panelStyles from '../AdminEntry.module.css'
import styles from './AdminPreAuthForm.module.css'
import { getErrorMessage } from '@core/utils/errorMessage'

// Phase the unauthenticated form can be in. 'mfa' is a sub-state reached
// only after a login submit returns `mfaRequired: true` — never set by the
// boot hook directly.
export type PreAuthPhase = 'setup' | 'login' | 'mfa'

interface AdminPreAuthFormProps {
  phase: PreAuthPhase
  publicSite: CmsPublicSite
  initialError: string | null
  onPhaseChange: (phase: PreAuthPhase) => void
  onAuthenticated: (user: CmsCurrentUser) => void
}

interface PhaseCopy {
  step: string
  kicker: string
  title: string
  subtitle: string
  submit: string
  submitPending: string
}

// Copy speaks to the person arriving, not to the schema. The step number is a
// real editorial kicker (01 · Sign in) that ticks across phases — never a
// color-only signal.
//
// The `login` title + submit are duplicated verbatim by the server-rendered
// skeleton in `server/static.ts`, which paints this screen before React mounts.
// They must stay in sync or the heading visibly changes under the reader.
const PHASE_COPY: Record<PreAuthPhase, PhaseCopy> = {
  login: {
    step: '01',
    kicker: 'Sign in',
    title: 'Welcome back',
    subtitle: 'Sign in to your workspace.',
    submit: 'Sign in',
    submitPending: 'Signing in',
  },
  setup: {
    step: '02',
    kicker: 'Set up',
    title: "Let's get you set up",
    subtitle: 'Create your owner account.',
    submit: 'Create account',
    submitPending: 'Creating',
  },
  mfa: {
    step: '03',
    kicker: 'Security',
    title: "Verify it's you",
    subtitle: 'Enter the 6-digit code from your app.',
    submit: 'Verify',
    submitPending: 'Verifying',
  },
}

const MIN_PASSWORD_LENGTH = 12

async function runAuthAction(
  action: () => Promise<void>,
  fallbackMessage: string,
  setSubmitting: (v: boolean) => void,
  setError: (v: string | null) => void,
): Promise<void> {
  setSubmitting(true)
  setError(null)
  try {
    await action()
  } catch (err) {
    setError(getErrorMessage(err, fallbackMessage))
  } finally {
    setSubmitting(false)
  }
}

export function AdminPreAuthForm({
  phase,
  publicSite,
  initialError,
  onPhaseChange,
  onAuthenticated,
}: AdminPreAuthFormProps) {
  const [siteName, setSiteName] = useState('My Site')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sealing, setSealing] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [showPassword, setShowPassword] = useState(false)

  const siteNameId = useId()
  const emailId = useId()
  const passwordId = useId()
  const mfaCodeId = useId()

  // On a real success, trace the card border once before handing off. The boot
  // into the admin shell already has load time, so this ~320ms beat is felt as
  // delight, not delay. Under reduced motion the trace resolves instantly.
  function sealAndHandOff(user: CmsCurrentUser) {
    setSealing(true)
    window.setTimeout(() => onAuthenticated(user), 320)
  }

  async function handleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    await runAuthAction(async () => {
      await setupCms({ siteName, email, password })
      await loginCms({ email, password })
      sealAndHandOff(await getCurrentCmsUser())
    }, 'Setup failed', setSubmitting, setError)
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runAuthAction(async () => {
      const result = await loginCms({ email, password })
      if (result.mfaRequired) {
        setPassword('')
        setMfaCode('')
        onPhaseChange('mfa')
        return
      }
      sealAndHandOff(await getCurrentCmsUser())
    }, 'Login failed', setSubmitting, setError)
  }

  async function handleMfaVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await runAuthAction(async () => {
      await verifyCmsMfa({ code: mfaCode })
      const user = await getCurrentCmsUser()
      setMfaCode('')
      sealAndHandOff(user)
    }, 'MFA verification failed', setSubmitting, setError)
  }

  const copy = PHASE_COPY[phase]
  const submitLabel = submitting ? copy.submitPending : copy.submit

  // When the install has picked a favicon, render it as the brand mark AND
  // swap the "Bambu" wordmark for the operator-configured site name.
  const brandLabel = publicSite.name ?? 'Bambu'

  const onSubmit =
    phase === 'setup' ? handleSetup :
    phase === 'mfa' ? handleMfaVerify :
    handleLogin

  return (
    <main className={panelStyles.page}>
      <div className={panelStyles.stage} aria-hidden="true">
        <div className={`${panelStyles.blob} ${panelStyles.blobBrand}`} />
        <div className={`${panelStyles.blob} ${panelStyles.blobLilac}`} />
        <div className={`${panelStyles.blob} ${panelStyles.blobMint}`} />
      </div>
      <div className={panelStyles.vignette} aria-hidden="true" />

      <section
        className={panelStyles.panel}
        aria-labelledby="admin-entry-title"
        data-sealing={sealing}
      >
        <div className={styles.stagger}>
          <div className={styles.brandRow}>
            {publicSite.faviconUrl ? (
              <img
                className={styles.brandFavicon}
                src={publicSite.faviconUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            ) : (
              <div className={styles.brandIcon} aria-hidden="true">
                <img src="/favicon.svg" alt="" width={17} height={17} />
              </div>
            )}
            <span className={styles.wordmark}>{brandLabel}</span>
            <span className={styles.kicker}>
              <b>{copy.step}</b> · {copy.kicker}
            </span>
          </div>

          <div className={styles.rule} aria-hidden="true" />

          <div className={styles.head}>
            <h1 id="admin-entry-title" className={panelStyles.title}>{copy.title}</h1>
            <p className={styles.subtitle}>{copy.subtitle}</p>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            {/* Keyed by phase so the incoming fields replay the slide-in. */}
            <div className={styles.fields} key={phase}>
              {phase === 'mfa' ? (
                <div className={styles.field}>
                  <label htmlFor={mfaCodeId}>Verification code</label>
                  <Input
                    id={mfaCodeId}
                    className={styles.codeInput}
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="000000"
                    data-testid="admin-mfa-code"
                  />
                </div>
              ) : (
                <>
                  {phase === 'setup' && (
                    <div className={styles.field}>
                      <label htmlFor={siteNameId}>Site name</label>
                      <Input
                        id={siteNameId}
                        value={siteName}
                        onChange={(event) => setSiteName(event.target.value)}
                        required
                        autoComplete="organization"
                      />
                    </div>
                  )}

                  <div className={styles.field}>
                    <label htmlFor={emailId}>Email</label>
                    <Input
                      id={emailId}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor={passwordId}>Password</label>
                    <Input
                      id={passwordId}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={phase === 'setup' ? MIN_PASSWORD_LENGTH : undefined}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={phase === 'setup' ? 'new-password' : 'current-password'}
                      placeholder="••••••••"
                      trailingSlot={
                        <button
                          type="button"
                          className={styles.passwordToggle}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((prev) => !prev)}
                        >
                          {showPassword ? (
                            <EyeOffSolidIcon size={16} aria-hidden="true" />
                          ) : (
                            <EyeSolidIcon size={16} aria-hidden="true" />
                          )}
                        </button>
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {error && (
              <p role="alert" className={panelStyles.error}>
                <CircleAlertSolidIcon size={14} className={panelStyles.errorIcon} aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              type="submit"
              fullWidth
              disabled={submitting || sealing}
              aria-busy={submitting}
            >
              {submitting && (
                <LoaderIcon size={15} className={styles.spinIcon} aria-hidden="true" />
              )}
              <span>{submitLabel}</span>
            </Button>
          </form>

          {/* Instatic is single-tenant by design, whether self-hosted or run as a
              managed per-customer container. Isolation is the one trust claim that
              holds in every deployment — unlike a transport-security claim, which the
              app cannot verify (TLS may terminate at a proxy, or be absent entirely). */}
          <p className={styles.trust}>
            <LockSolidIcon size={12} aria-hidden="true" />
            <span>Your own isolated instance — never a shared database.</span>
          </p>
        </div>
      </section>
    </main>
  )
}
