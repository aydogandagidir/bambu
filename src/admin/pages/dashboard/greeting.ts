/**
 * The dashboard's page-header greeting.
 *
 * A display name is not necessarily a name. `handleSetupRoutes` seeds the first
 * owner with `displayName: email`, and `createUser` falls back to the email
 * whenever the caller leaves the field blank — so "Good afternoon,
 * admin@example.com." is the greeting a fresh install actually renders. An email
 * address in a greeting reads like a mail-merge that failed.
 *
 * We can't invent a name, so we drop the clause instead of filling it with
 * something that isn't one.
 */

/** The first word of a real name, or `null` when we only have an email. */
export function personalName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim()
  if (!trimmed) return null
  // The email fallback above — and no real display name contains an `@`.
  if (trimmed.includes('@')) return null
  return trimmed.split(' ')[0] ?? null
}

export function greetingFor(
  displayName: string | null | undefined,
  now: Date = new Date(),
): string {
  const hour = now.getHours()
  const time = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const name = personalName(displayName)
  return name ? `Good ${time}, ${name}.` : `Good ${time}.`
}
