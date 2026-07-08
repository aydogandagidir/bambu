import { describe, expect, it } from 'bun:test'
import {
  isBlockedHostnameForCapture,
  isBlockedIpForCapture,
  preferredPagePathForCapture,
} from '../importUrlArchive'

describe('import URL archive capture helpers', () => {
  it('blocks local and private capture hosts', () => {
    expect(isBlockedHostnameForCapture('localhost')).toBe(true)
    expect(isBlockedHostnameForCapture('app.local')).toBe(true)
    expect(isBlockedIpForCapture('127.0.0.1')).toBe(true)
    expect(isBlockedIpForCapture('10.1.2.3')).toBe(true)
    expect(isBlockedIpForCapture('172.20.1.1')).toBe(true)
    expect(isBlockedIpForCapture('192.168.1.5')).toBe(true)
    expect(isBlockedIpForCapture('169.254.169.254')).toBe(true)
    expect(isBlockedIpForCapture('8.8.8.8')).toBe(false)
  })

  it('derives stable html paths from captured URLs', () => {
    expect(preferredPagePathForCapture(new URL('https://example.com/'))).toBe('index.html')
    expect(preferredPagePathForCapture(new URL('https://example.com/about'))).toBe('about.html')
    expect(preferredPagePathForCapture(new URL('https://example.com/services/'))).toBe('services/index.html')
    expect(preferredPagePathForCapture(new URL('https://example.com/landing.php'))).toBe('landing.html')
    expect(preferredPagePathForCapture(new URL('https://example.com/assets/logo.png'))).toBe('assets/logo.png/index.html')
  })
})
