import { HUB_FONT_PATH, HUB_TOKENS } from './theme'
import { SUBDOMAIN_PATTERN, WORKSPACE_DOMAIN_SUFFIX } from './domain'

/**
 * The Hub portal document.
 *
 * A standalone page, but not a second design system: every surface here is one
 * of the admin's four recipes (glass tile, input, primary/secondary button,
 * aurora page shell) expressed with the same Deep Ocean tokens. See
 * `docs/design.md` → "Surface systems".
 *
 * The client script builds workspace tiles with DOM nodes and writes every
 * server-supplied string through `textContent` — never `innerHTML`. A tenant
 * domain is attacker-influenced input (the owner picks the subdomain), so the
 * portal must not have an HTML sink for it.
 *
 * Auth and dashboard are two documents, not one document with a `.hidden`
 * class: the session decides which, and both transitions (login, logout) end
 * in `location.reload()`. Nothing to toggle, so nothing to get wrong.
 *
 * The `<style>` and `<script>` carry a per-response CSP nonce (see
 * `hubPortalCsp`), so the policy needs no `'unsafe-inline'` — an injected
 * `<script>` would not execute even if a sink were reintroduced.
 */

const STYLES = `
    ${HUB_TOKENS}

    @font-face {
      font-family: "Inter Variable";
      font-style: normal;
      font-display: swap;
      font-weight: 100 900;
      src: url("${HUB_FONT_PATH}") format("woff2-variations");
    }

    *,
    *::before,
    *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: var(--space-8xl) var(--space-5xl);
      background: var(--bg-body);
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* Page shell: the admin's two-radial aurora, not a single accent mesh. */
    .aurora {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background:
        radial-gradient(60vw 60vh at 18% 4%, var(--admin-aurora-a), transparent 70%),
        radial-gradient(52vw 52vh at 84% 0%, var(--admin-aurora-b), transparent 70%);
    }

    /* ── Glass tile — the one card recipe (Widget.module.css) ─────────────── */
    .panel {
      position: relative;
      z-index: 1;
      background: var(--glass-surface);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--card-radius);
      box-shadow: var(--shadow-premium);
    }

    /* ── Typography ───────────────────────────────────────────────────────── */
    .title {
      color: var(--text-bright);
      font-size: var(--text-5xl);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.02em;
    }

    .panelTitle { font-size: var(--text-4xl); }

    .subtitle {
      margin-top: var(--space-s);
      color: var(--text-muted);
      font-size: var(--text-l);
      line-height: 1.5;
    }

    .sectionLabel {
      color: var(--text-subtle);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }

    /* ── Fields — one focus recipe (Input.module.css) ─────────────────────── */
    .field { display: grid; gap: var(--space-xs); }

    .label {
      color: var(--text-muted);
      font-size: var(--text-s);
      font-weight: var(--weight-semibold);
    }

    .input {
      width: 100%;
      min-height: 40px;
      padding: var(--space-m) var(--space-l);
      background: transparent;
      color: var(--text);
      border: 1px solid var(--overlay-20);
      border-radius: var(--input-radius);
      font-family: inherit;
      font-size: var(--text-m);
      outline: none;
      transition:
        border-color var(--duration) var(--ease),
        box-shadow var(--duration) var(--ease);
    }

    .input:hover { border-color: var(--overlay-30); }

    .input:focus {
      border-color: var(--border-focus);
      box-shadow: var(--shadow-input-focus);
    }

    .input::placeholder { color: var(--text-subtle); }

    /* Affix wrapper: the wrapper owns the frame and the focus ring, the inner
       input drops both so there is never a double frame. */
    .inputWrapper {
      display: flex;
      align-items: stretch;
      overflow: hidden;
      border: 1px solid var(--overlay-20);
      border-radius: var(--input-radius);
      transition:
        border-color var(--duration) var(--ease),
        box-shadow var(--duration) var(--ease);
    }

    .inputWrapper:hover { border-color: var(--overlay-30); }

    .inputWrapper:focus-within {
      border-color: var(--border-focus);
      box-shadow: var(--shadow-input-focus);
    }

    .inputWrapper .input {
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    .suffix {
      display: inline-flex;
      align-items: center;
      padding-right: var(--space-l);
      color: var(--text-subtle);
      font-size: var(--text-s);
      user-select: none;
    }

    /* ── Buttons — brand fill for the one dominant action ─────────────────── */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2xs);
      height: 44px;
      padding: 0 var(--space-6xl);
      border: 0;
      border-radius: var(--input-radius);
      font-family: inherit;
      font-size: var(--text-m);
      font-weight: var(--weight-semibold);
      white-space: nowrap;
      text-decoration: none;
      cursor: pointer;
      transition:
        background-color var(--duration) var(--ease),
        color var(--duration) var(--ease);
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    .btn:disabled { opacity: 0.5; pointer-events: none; }

    .btnPrimary { background: var(--brand); color: var(--brand-ink); }
    .btnPrimary:hover { background: var(--brand-hover); }
    .btnPrimary:active { background: var(--brand-active); }

    .btnSecondary { background: var(--bg-surface-2); color: var(--text-muted); }
    .btnSecondary:hover { background: var(--bg-surface-3); color: var(--text); }
    .btnSecondary:active { background: var(--bg-surface); }

    .btnSm {
      height: 32px;
      padding: 0 var(--space-xl);
      font-size: var(--text-s);
    }

    .btnBlock { width: 100%; }

    /* ── Tabs — active indicator is the brand, like admin nav ─────────────── */
    .tabs {
      display: flex;
      margin-bottom: var(--space-7xl);
      border-bottom: 1px solid var(--border);
    }

    .tab {
      flex: 1;
      margin-bottom: -1px;
      padding: var(--space-l);
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      color: var(--text-subtle);
      font-family: inherit;
      font-size: var(--text-m);
      font-weight: var(--weight-medium);
      cursor: pointer;
      transition:
        color var(--duration) var(--ease),
        border-color var(--duration) var(--ease);
    }

    .tab:hover { color: var(--text-muted); }

    .tab[aria-selected="true"] {
      color: var(--text);
      border-bottom-color: var(--brand);
    }

    .tab:focus-visible { outline: none; box-shadow: var(--focus-ring); }

    /* ── Feedback line — state colour, never decorative ───────────────────── */
    .feedback {
      min-height: 1.4em;
      margin-top: var(--space-l);
      font-size: var(--text-s);
      line-height: 1.4;
    }

    .feedback[data-tone="pending"] { color: var(--text-subtle); }
    .feedback[data-tone="error"] { color: var(--danger-text); }
    .feedback[data-tone="success"] { color: var(--success-text); }

    /* ── Auth view ────────────────────────────────────────────────────────── */
    .authPanel {
      width: 100%;
      max-width: 440px;
      margin: auto;
      padding: var(--space-8xl);
      text-align: center;
    }

    .authForm {
      display: grid;
      gap: var(--space-3xl);
      text-align: left;
    }

    .authHead { margin-bottom: var(--space-7xl); }

    /* ── Dashboard view ───────────────────────────────────────────────────── */
    .dash {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      flex: 1;
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
      gap: var(--space-9xl);
    }

    .dashHead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3xl);
      flex-wrap: wrap;
    }

    .workspaces {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-3xl);
    }

    .emptyState {
      grid-column: 1 / -1;
      color: var(--text-subtle);
      font-size: var(--text-m);
    }

    .tile {
      display: flex;
      flex-direction: column;
      gap: var(--space-s);
      padding: var(--space-5xl);
      transition:
        background var(--duration) var(--ease),
        border-color var(--duration) var(--ease),
        box-shadow var(--duration) var(--ease),
        transform var(--duration) var(--ease-out);
    }

    .tile:hover {
      background: var(--glass-surface-hover);
      border-color: var(--glass-border-hover);
      box-shadow: var(--shadow-premium-hover);
      transform: translateY(-2px);
    }

    .tileHead {
      display: flex;
      align-items: center;
      gap: var(--space-s);
    }

    .dot {
      flex: 0 0 auto;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot[data-status="active"] { background: var(--success); }
    .dot[data-status="suspended"] { background: var(--danger); }

    .tileDomain {
      color: var(--text-bright);
      font-size: var(--text-2xl);
      font-weight: var(--weight-semibold);
      word-break: break-all;
    }

    .tileMeta { color: var(--text-subtle); font-size: var(--text-s); }

    .tileActions {
      display: flex;
      gap: var(--space-s);
      margin-top: var(--space-2xl);
    }

    .tileActions .btn { flex: 1; padding: 0 var(--space-l); }

    .createPanel { padding: var(--space-6xl); margin-top: auto; }

    .createForm {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3xl);
      flex-wrap: wrap;
      margin-top: var(--space-2xl);
    }

    .createField { flex: 1; min-width: 260px; }

    /* Brand mark: neutral overlay tile, exactly like the admin login. */
    .brandMark {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-lg);
      background: var(--overlay-10);
      color: var(--text);
      font-size: var(--text-m);
      font-weight: var(--weight-semibold);
    }

    .brandRow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-m);
      margin-bottom: var(--space-6xl);
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
      }
    }
`


/** Shared by both views: DOM building + the `{ error }` envelope reader. */
const SHARED_SCRIPT = `
      function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      }

      function say(node, tone, message) {
        node.dataset.tone = tone;
        node.textContent = message;
      }

      /** Every hub endpoint answers with the { error } envelope on failure. */
      async function errorMessage(res, fallback) {
        try {
          var body = await res.json();
          if (body && typeof body.error === 'string' && body.error) return body.error;
        } catch (_err) {
          // Non-JSON body (a proxy error page). Fall through to the fallback.
        }
        return fallback;
      }
`

const AUTH_SCRIPT = `
      var tabLogin = document.getElementById('tabLogin');
      var tabRegister = document.getElementById('tabRegister');
      var authSubmit = document.getElementById('authSubmit');
      var authFeedback = document.getElementById('authFeedback');
      var isLogin = true;

      function selectTab(login) {
        isLogin = login;
        tabLogin.setAttribute('aria-selected', String(login));
        tabRegister.setAttribute('aria-selected', String(!login));
        authSubmit.textContent = login ? 'Login' : 'Create Account';
        say(authFeedback, 'pending', '');
      }

      tabLogin.onclick = function () { selectTab(true); };
      tabRegister.onclick = function () { selectTab(false); };

      document.getElementById('authForm').onsubmit = async function (event) {
        event.preventDefault();
        authSubmit.disabled = true;
        say(authFeedback, 'pending', 'Processing...');

        try {
          var res = await fetch(isLogin ? '/api/hub/auth/login' : '/api/hub/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('authEmail').value,
              rawPassword: document.getElementById('authPassword').value,
            }),
          });
          // The session cookie decides the view, so a reload lands on the dashboard.
          if (res.ok) { window.location.reload(); return; }
          say(authFeedback, 'error', await errorMessage(res, 'Could not sign you in.'));
        } catch (err) {
          console.error('[hub-portal] auth request failed:', err);
          say(authFeedback, 'error', 'Network error. Please try again.');
        }
        authSubmit.disabled = false;
      };
`

const DASH_SCRIPT = `
      var createFeedback = document.getElementById('createFeedback');
      var workspaceList = document.getElementById('workspaceList');

      document.getElementById('logoutBtn').onclick = async function () {
        try {
          await fetch('/api/hub/auth/logout', { method: 'POST' });
        } catch (err) {
          console.error('[hub-portal] logout request failed:', err);
        }
        window.location.reload();
      };

      document.getElementById('createForm').onsubmit = async function (event) {
        event.preventDefault();
        var subdomainInput = document.getElementById('subdomain');
        var submit = document.getElementById('createSubmit');
        submit.disabled = true;
        say(createFeedback, 'pending', 'Deploying...');

        try {
          var res = await fetch('/api/hub/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subdomain: subdomainInput.value.toLowerCase() }),
          });
          if (res.ok) {
            say(createFeedback, 'success', 'Workspace deployed.');
            subdomainInput.value = '';
            await loadWorkspaces();
          } else {
            say(createFeedback, 'error', await errorMessage(res, 'Could not deploy the workspace.'));
          }
        } catch (err) {
          console.error('[hub-portal] deploy request failed:', err);
          say(createFeedback, 'error', 'Network error. Please try again.');
        }
        submit.disabled = false;
      };

      function tileLink(href, label) {
        var link = el('a', 'btn btnSm btnSecondary', label);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
      }

      /** DOM nodes, not an HTML string: workspace.domain is owner-supplied. */
      function workspaceTile(workspace) {
        var tile = el('article', 'panel tile');

        var dot = el('span', 'dot');
        dot.dataset.status = workspace.status === 'active' ? 'active' : 'suspended';
        var head = el('div', 'tileHead');
        head.append(dot, el('h2', 'tileDomain', workspace.domain));

        var actions = el('div', 'tileActions');
        actions.append(
          tileLink('https://' + workspace.domain + '/admin', 'Open Admin'),
          tileLink('https://' + workspace.domain, 'View Site')
        );

        var created = new Date(workspace.createdAt);
        var meta = el('p', 'tileMeta', 'Created ' + created.toLocaleDateString());

        tile.append(head, meta, actions);
        return tile;
      }

      async function loadWorkspaces() {
        workspaceList.setAttribute('aria-busy', 'true');
        workspaceList.replaceChildren(el('p', 'emptyState', 'Loading workspaces...'));
        try {
          var res = await fetch('/api/hub/workspaces');
          if (!res.ok) {
            workspaceList.replaceChildren(el('p', 'emptyState', await errorMessage(res, 'Could not load workspaces.')));
          } else {
            var workspaces = await res.json();
            if (workspaces.length === 0) {
              workspaceList.replaceChildren(el('p', 'emptyState', 'No workspaces yet. Deploy your first one below.'));
            } else {
              workspaceList.replaceChildren(...workspaces.map(workspaceTile));
            }
          }
        } catch (err) {
          console.error('[hub-portal] workspace list failed:', err);
          workspaceList.replaceChildren(el('p', 'emptyState', 'Network error. Please reload.'));
        }
        workspaceList.setAttribute('aria-busy', 'false');
      }

      loadWorkspaces();
`

const AUTH_VIEW = `
    <main class="panel authPanel">
      <div class="authHead">
        <div class="brandRow">
          <span class="brandMark" aria-hidden="true">B</span>
          <h1 class="title panelTitle">Bambu Hub</h1>
        </div>
        <p class="subtitle">Welcome back.</p>
      </div>

      <div class="tabs" role="tablist">
        <button type="button" class="tab" id="tabLogin" role="tab" aria-selected="true">Login</button>
        <button type="button" class="tab" id="tabRegister" role="tab" aria-selected="false">Register</button>
      </div>

      <form id="authForm" class="authForm">
        <div class="field">
          <label class="label" for="authEmail">Email Address</label>
          <input class="input" type="email" id="authEmail" required autocomplete="email" placeholder="you@company.com" />
        </div>
        <div class="field">
          <label class="label" for="authPassword">Password</label>
          <input class="input" type="password" id="authPassword" required autocomplete="current-password" placeholder="••••••••" />
        </div>
        <button type="submit" class="btn btnPrimary btnBlock" id="authSubmit">Login</button>
      </form>
      <p class="feedback" id="authFeedback" role="status" aria-live="polite" data-tone="pending"></p>
    </main>`

const DASH_VIEW = `
    <main class="dash">
      <header class="dashHead">
        <div>
          <h1 class="title">My Workspaces</h1>
          <p class="subtitle">Manage your deployed experiences.</p>
        </div>
        <button type="button" class="btn btnSm btnSecondary" id="logoutBtn">Logout</button>
      </header>

      <section class="workspaces" id="workspaceList" aria-label="Workspaces" aria-busy="true"></section>

      <section class="panel createPanel">
        <h2 class="sectionLabel">Deploy new workspace</h2>
        <form id="createForm" class="createForm">
          <div class="field createField">
            <label class="label" for="subdomain">Workspace URL</label>
            <div class="inputWrapper">
              <input
                class="input"
                type="text"
                id="subdomain"
                required
                autocomplete="off"
                spellcheck="false"
                placeholder="acme"
                pattern="${SUBDOMAIN_PATTERN}"
                title="Lowercase letters, numbers and hyphens only."
              />
              <span class="suffix">.${WORKSPACE_DOMAIN_SUFFIX}</span>
            </div>
          </div>
          <button type="submit" class="btn btnPrimary" id="createSubmit">Deploy</button>
        </form>
        <p class="feedback" id="createFeedback" role="status" aria-live="polite" data-tone="pending"></p>
      </section>
    </main>`

export function renderHubPortal(options: { authenticated: boolean; nonce: string }): string {
  const view = options.authenticated ? DASH_VIEW : AUTH_VIEW
  const script = options.authenticated ? DASH_SCRIPT : AUTH_SCRIPT
  const nonce = options.nonce

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bambu Cloud Hub</title>
    <style nonce="${nonce}">${STYLES}</style>
  </head>
  <body>
    <div class="aurora"></div>
${view}
    <script nonce="${nonce}">${SHARED_SCRIPT}${script}</script>
  </body>
</html>`
}
