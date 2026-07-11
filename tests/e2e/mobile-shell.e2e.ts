import { expect, test } from '@playwright/test'

/**
 * SHELL-MOBILE-001 — the admin shell is responsive at phone widths.
 *
 * The section rail used to keep its 250px desktop width and the shell stayed
 * `flex-direction: row` at every breakpoint, so on a 390px phone the page body
 * got ~120px and dashboard content overflowed horizontally. The rail now
 * collapses to a full-width top bar and each layout's shell stacks vertically
 * at ≤760px. This guards that no top-level admin page scrolls sideways at 390px.
 */
const MOBILE = { width: 390, height: 844 }

const PAGES = [
  '/admin/dashboard',
  '/admin/plugins',
  '/admin/users',
  '/admin/site',
] as const

test.describe('mobile shell', () => {
  test('top-level admin pages stay within the viewport at 390px (SHELL-MOBILE-001)', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE)

    for (const path of PAGES) {
      await page.goto(path)
      // The global toolbar trailer (account menu) is present on every admin
      // shell — its visibility means the rail + body have laid out.
      await expect(page.getByTestId('account-menu-trigger')).toBeVisible({
        timeout: 20_000,
      })

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      // Allow a 1px rounding slack.
      expect(
        scrollWidth,
        `${path} scrolls horizontally at 390px (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`,
      ).toBeLessThanOrEqual(clientWidth + 1)
    }
  })
})
