/**
 * Deep Ocean tokens for the Hub portal.
 *
 * The portal is a standalone server-rendered document on its own host
 * (`app.*` / `hub.*`), so it cannot import `src/styles/globals.css` — Vite
 * never builds an asset for it. This module carries the subset of the admin
 * token vocabulary the portal actually uses, transcribed byte-for-byte.
 *
 * The transcription is not trusted: `src/__tests__/architecture/hub-theme-tokens.test.ts`
 * parses the `:root` block of `globals.css` and fails the build if any value
 * here has drifted, if the portal references a `var(--x)` this file doesn't
 * declare, or if the portal markup carries a raw hex/rgb() colour.
 *
 * Add a token here only when the portal uses it. Never invent a value —
 * copy it from `globals.css`.
 */

import { join } from 'node:path'

export const HUB_TOKENS = `:root {
      --font-sans: "Inter Variable", system-ui, sans-serif;

      --weight-medium: 500;
      --weight-semibold: 600;

      --text-xs: clamp(10px, calc(9.629px + 0.095vw), 11px);
      --text-s: clamp(11px, calc(10.629px + 0.095vw), 12px);
      --text-m: clamp(12px, calc(11.629px + 0.095vw), 13px);
      --text-l: clamp(13px, calc(12.629px + 0.095vw), 14px);
      --text-2xl: clamp(16px, calc(15.257px + 0.19vw), 18px);
      --text-4xl: clamp(20px, calc(18.514px + 0.381vw), 24px);
      --text-5xl: clamp(24px, calc(22.514px + 0.381vw), 28px);

      --space-2xs: clamp(4px, calc(3.629px + 0.095vw), 5px);
      --space-xs: clamp(5px, calc(4.629px + 0.095vw), 6px);
      --space-s: clamp(6px, calc(5.257px + 0.19vw), 8px);
      --space-m: clamp(8px, calc(7.257px + 0.19vw), 10px);
      --space-l: clamp(10px, calc(9.257px + 0.19vw), 12px);
      --space-xl: clamp(12px, calc(11.257px + 0.19vw), 14px);
      --space-2xl: clamp(14px, calc(13.257px + 0.19vw), 16px);
      --space-3xl: clamp(16px, calc(15.257px + 0.19vw), 18px);
      --space-5xl: clamp(20px, calc(18.514px + 0.381vw), 24px);
      --space-6xl: clamp(24px, calc(22.514px + 0.381vw), 28px);
      --space-7xl: clamp(28px, calc(26.514px + 0.381vw), 32px);
      --space-8xl: clamp(32px, calc(29.029px + 0.762vw), 40px);
      --space-9xl: clamp(40px, calc(37.029px + 0.762vw), 48px);

      --duration: 140ms;
      --ease: cubic-bezier(0.25, 0, 0.15, 1);
      --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

      --bg-body: #050b14;
      --bg-surface: #0a1120;
      --bg-surface-2: #111827;
      --bg-surface-3: #1f2937;

      --border: #26324a;
      --border-focus: color-mix(in srgb, var(--brand) 55%, var(--overlay-20));

      --text-bright: #f7fafd;
      --text: #e8edf5;
      --text-muted: #a9b3c6;
      --text-subtle: #8b96ab;

      --overlay-10: rgba(255, 255, 255, 0.1);
      --overlay-20: rgba(255, 255, 255, 0.2);
      --overlay-30: rgba(255, 255, 255, 0.3);

      --brand: #38bdf8;
      --brand-hover: #5ecbfa;
      --brand-active: #1ea8e8;
      --brand-ink: #062033;
      --brand-10: rgba(56, 189, 248, 0.1);

      --danger: #ef4444;
      --danger-text: #fecaca;
      --success: #34d399;
      --success-text: #d1fae5;

      --radius-lg: 8px;
      --card-radius: 16px;
      --input-radius: 1em;

      --focus-ring: 0 0 0 2px color-mix(in srgb, var(--brand) 60%, transparent);
      --shadow-input-focus: inset 0 0 0 1px color-mix(in srgb, var(--brand) 35%, transparent), 0 0 0 3px var(--brand-10);

      --glass-surface: rgba(17, 24, 39, 0.55);
      --glass-surface-hover: rgba(31, 41, 55, 0.62);
      --glass-border: rgba(255, 255, 255, 0.08);
      --glass-border-hover: rgba(56, 189, 248, 0.28);
      --glass-blur: blur(32px);
      --shadow-premium: 0 8px 32px rgba(2, 6, 16, 0.5), inset 0 1px 0 var(--glass-border);
      --shadow-premium-hover: 0 12px 40px rgba(2, 6, 16, 0.6), 0 0 16px rgba(56, 189, 248, 0.1), inset 0 1px 0 var(--glass-border-hover);

      --admin-aurora-a: rgba(56, 189, 248, 0.14);
      --admin-aurora-b: rgba(200, 182, 255, 0.12);
    }`

/**
 * Self-hosted Inter Variable — the same `.woff2` `globals.css` loads for the
 * admin. The portal host short-circuits the static router, so the font gets
 * its own route instead of coming out of `dist/`. Serving it ourselves keeps
 * visitor IPs off a third-party font CDN.
 */
export const HUB_FONT_PATH = '/_hub/fonts/inter-variable.woff2'

const INTER_VARIABLE_WOFF2 = join(
  import.meta.dir,
  '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
)

export function hubFontFile() {
  return Bun.file(INTER_VARIABLE_WOFF2)
}
