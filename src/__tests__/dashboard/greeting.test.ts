/**
 * The greeting must never render an email address.
 *
 * `handleSetupRoutes` seeds the first owner with `displayName: email`, and
 * `createUser` falls back to the email whenever `displayName` is blank — so this
 * is not a hypothetical input, it is what every fresh install produces.
 */

import { describe, it, expect } from 'bun:test'
import { greetingFor, personalName } from '../../admin/pages/dashboard/greeting'

const MORNING = new Date('2026-07-08T09:00:00')
const AFTERNOON = new Date('2026-07-08T14:00:00')
const EVENING = new Date('2026-07-08T21:00:00')

describe('personalName', () => {
  it('takes the first word of a real name', () => {
    expect(personalName('Ada Lovelace')).toBe('Ada')
    expect(personalName('  Ada  ')).toBe('Ada')
  })

  it('refuses an email — the setup wizard stores one as the display name', () => {
    expect(personalName('admin@example.com')).toBeNull()
    expect(personalName('Ada <ada@example.com>')).toBeNull()
  })

  it('refuses nothing at all', () => {
    expect(personalName(null)).toBeNull()
    expect(personalName(undefined)).toBeNull()
    expect(personalName('   ')).toBeNull()
  })
})

describe('greetingFor', () => {
  it('greets a real name by its first word', () => {
    expect(greetingFor('Ada Lovelace', AFTERNOON)).toBe('Good afternoon, Ada.')
  })

  it('drops the clause rather than greeting an email address', () => {
    expect(greetingFor('admin@example.com', AFTERNOON)).toBe('Good afternoon.')
    expect(greetingFor(null, AFTERNOON)).toBe('Good afternoon.')
  })

  it('reads the clock', () => {
    expect(greetingFor('Ada', MORNING)).toBe('Good morning, Ada.')
    expect(greetingFor('Ada', AFTERNOON)).toBe('Good afternoon, Ada.')
    expect(greetingFor('Ada', EVENING)).toBe('Good evening, Ada.')
  })

  it('switches at noon and at 18:00, not around them', () => {
    expect(greetingFor(null, new Date('2026-07-08T11:59:59'))).toBe('Good morning.')
    expect(greetingFor(null, new Date('2026-07-08T12:00:00'))).toBe('Good afternoon.')
    expect(greetingFor(null, new Date('2026-07-08T17:59:59'))).toBe('Good afternoon.')
    expect(greetingFor(null, new Date('2026-07-08T18:00:00'))).toBe('Good evening.')
  })
})
