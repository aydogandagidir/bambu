import { HubDatabase, getTenantDb, type Tenant, type HubUser } from './db'
import { runMigrations } from '../db/runMigrations'
import { sqliteMigrations } from '../db/migrations-sqlite'
import { password } from 'bun'
import { nanoid } from 'nanoid'
import { createSite } from '../repositories/setup'
import { createDataRow } from '../repositories/data'
import { createNode } from '@core/page-tree'
import { pageToCells } from '../../src/core/data/pageFromRow'
import type { Page } from '@core/page-tree'

let hubDb: HubDatabase | null = null

export function initHubDb(dataDir: string) {
  hubDb = new HubDatabase(`${dataDir}/hub.db`)
}

function parseCookies(req: Request) {
  const cookieHeader = req.headers.get('Cookie')
  if (!cookieHeader) return {}
  return Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')))
}

async function getHubUserFromReq(req: Request): Promise<HubUser | null> {
  const cookies = parseCookies(req)
  const sessionId = cookies['hub_session_id']
  if (!sessionId) return null
  const session = await hubDb!.getHubSession(sessionId)
  if (!session || session.expiresAt < Date.now()) return null
  return await hubDb!.getHubUserById(session.userId)
}

export async function handleHubRequest(req: Request, dataDir: string): Promise<Response> {
  const url = new URL(req.url)
  
  // Auth API
  if (req.method === 'POST' && url.pathname === '/api/hub/auth/register') {
    try {
      const { email, rawPassword } = await req.json()
      if (!email || !rawPassword) return new Response('Missing fields', { status: 400 })
      
      const existing = await hubDb!.getHubUserByEmail(email)
      if (existing) return new Response('Email in use', { status: 409 })
      
      const user: HubUser = {
        id: crypto.randomUUID(),
        email,
        passwordHash: await password.hash(rawPassword),
        createdAt: new Date().toISOString()
      }
      await hubDb!.createHubUser(user)
      
      const sessionId = crypto.randomUUID()
      await hubDb!.createHubSession({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 // 30 days
      })
      
      return new Response(JSON.stringify({ success: true }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `hub_session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        }
      })
    } catch (e: any) { return new Response(e.message, { status: 500 }) }
  }

  if (req.method === 'POST' && url.pathname === '/api/hub/auth/login') {
    try {
      const { email, rawPassword } = await req.json()
      const user = await hubDb!.getHubUserByEmail(email)
      if (!user) return new Response('Invalid credentials', { status: 401 })
      
      const isValid = await password.verify(rawPassword, user.passwordHash)
      if (!isValid) return new Response('Invalid credentials', { status: 401 })
      
      const sessionId = crypto.randomUUID()
      await hubDb!.createHubSession({
        id: sessionId,
        userId: user.id,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30
      })
      
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `hub_session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        }
      })
    } catch (e: any) { return new Response(e.message, { status: 500 }) }
  }
  
  if (req.method === 'POST' && url.pathname === '/api/hub/auth/logout') {
    const cookies = parseCookies(req)
    if (cookies['hub_session_id']) {
      await hubDb!.deleteHubSession(cookies['hub_session_id'])
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `hub_session_id=; Path=/; HttpOnly; Max-Age=0`
      }
    })
  }

  if (req.method === 'GET' && url.pathname === '/api/hub/workspaces') {
    const user = await getHubUserFromReq(req)
    if (!user) return new Response('Unauthorized', { status: 401 })
    const workspaces = await hubDb!.getTenantsByOwnerId(user.id)
    return new Response(JSON.stringify(workspaces), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  if (req.method === 'POST' && url.pathname === '/api/hub/workspaces') {
    try {
      const user = await getHubUserFromReq(req)
      if (!user) return new Response('Unauthorized', { status: 401 })
      
      const { subdomain } = await req.json()
      if (!subdomain) return new Response('Missing fields', { status: 400 })
      
      const domain = `${subdomain}.bluedev.dev`
      if (await hubDb!.getTenantByDomain(domain)) {
        return new Response('Subdomain already in use', { status: 409 })
      }
      
      const tenantId = crypto.randomUUID()
      const tenant: Tenant = {
        id: tenantId,
        domain,
        email: user.email,
        createdAt: new Date().toISOString(),
        status: 'active',
        ownerId: user.id
      }
      await hubDb!.createTenant(tenant)
      
      const db = getTenantDb(tenantId, dataDir)
      await runMigrations(db, sqliteMigrations)
      
      // Auto-provision owner in tenant DB using hub password hash.
      const rolesRes = await db`SELECT id FROM roles WHERE slug = 'owner'`
      if (rolesRes.rows.length > 0) {
        const ownerRoleId = rolesRes.rows[0].id
        await db`
          INSERT INTO users (
            id, email, email_normalized, display_name, password_hash, status, role_id, created_at, updated_at
          ) VALUES (
            ${user.id}, ${user.email}, ${user.email.toLowerCase()}, 'Workspace Owner', ${user.passwordHash}, 'active', ${ownerRoleId}, ${tenant.createdAt}, ${tenant.createdAt}
          )
        `
      }
      
      // Complete the setup by creating the site row
      await createSite(db, subdomain, {})
      
      // Seed a starter homepage
      const rootNode = createNode('base.body')
      const homePage: Page = {
        id: nanoid(),
        title: 'Home',
        slug: 'index',
        nodes: { [rootNode.id]: rootNode },
        rootNodeId: rootNode.id,
      }
      await createDataRow(
        db,
        { id: homePage.id, tableId: 'pages', cells: pageToCells(homePage), slug: homePage.slug },
        user.id,
      )
      
      return new Response(JSON.stringify({ success: true, tenant }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err: any) { return new Response(err.message, { status: 500 }) }
  }

  // Frontend rendering
  const activeUser = await getHubUserFromReq(req)

  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Bambu Cloud Hub</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #09090b;
          --surface: #18181b;
          --border: #3f3f46;
          --text: #f4f4f5;
          --text-muted: #a1a1aa;
          --accent: #10b981;
        }
        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          background-color: var(--bg); 
          color: var(--text); 
          margin: 0; 
          padding: 2rem;
          -webkit-font-smoothing: antialiased;
          min-height: 100vh;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }
        .mesh-bg {
          position: fixed;
          top: -20vh;
          left: -10vw;
          width: 80vw;
          height: 80vh;
          background: radial-gradient(circle at center, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
          filter: blur(60px);
          z-index: 0;
          pointer-events: none;
        }
        .hidden { display: none !important; }
        .view-container { 
          position: relative;
          z-index: 10;
          width: 100%; 
          max-width: 440px; 
          margin: auto; 
        }
        .dashboard-container { max-width: 900px; margin: 0 auto; flex: 1; display: flex; flex-direction: column; }
        .card { 
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)), var(--surface);
          padding: 2.5rem; 
          border-radius: 20px; 
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 20px 40px rgba(0,0,0,0.4); 
          border: 1px solid rgba(255,255,255,0.08); 
          backdrop-filter: blur(20px);
        }
        h1 { margin-top: 0; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; }
        p { color: var(--text-muted); margin-bottom: 2rem; line-height: 1.5; font-size: 0.95rem; }
        label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: var(--text-muted); }
        .input-group { display: flex; align-items: center; background: #09090b; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 1.5rem; transition: border-color 0.2s; }
        .input-group:focus-within { border-color: var(--accent); }
        .input-group input { flex: 1; border: none; background: transparent; padding: 0.75rem 1rem; color: white; font-size: 1rem; outline: none; }
        .input-group span { padding-right: 1rem; color: var(--text-muted); font-size: 0.9rem; user-select: none; }
        input[type="email"], input[type="password"] { width: 100%; padding: 0.75rem 1rem; margin-bottom: 1.5rem; background: #09090b; border: 1px solid var(--border); color: white; border-radius: 8px; font-size: 1rem; box-sizing: border-box; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: var(--accent) !important; }
        button { width: 100%; padding: 0.875rem; background: var(--accent); color: #000; border: none; border-radius: 8px; font-weight: 500; font-size: 1rem; cursor: pointer; transition: all 0.2s; margin-top: 0.5rem; }
        button:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
        .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
        .btn-outline:hover:not(:disabled) { background: rgba(255,255,255,0.05); }
        
        .tabs { display: flex; margin-bottom: 2rem; border-bottom: 1px solid var(--border); }
        .tab { flex: 1; padding: 1rem; text-align: center; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; font-weight: 500; transition: all 0.2s; }
        .tab.active { color: var(--text); border-bottom-color: var(--accent); }
      </style>
    </head>
    <body>
      <div class="mesh-bg"></div>
      
      <!-- AUTH VIEW -->
      <div id="authView" class="card view-container hidden">
        <h1 style="text-align: center; margin-bottom: 0.5rem;">Bambu Hub</h1>
        <p style="text-align: center;">Welcome back.</p>
        <div class="tabs">
          <div class="tab active" id="tabLogin">Login</div>
          <div class="tab" id="tabRegister">Register</div>
        </div>
        
        <form id="authForm">
          <label>Email Address</label>
          <input type="email" id="authEmail" required placeholder="you@company.com">
          <label>Password</label>
          <input type="password" id="authPassword" required placeholder="••••••••">
          <button type="submit" id="authSubmit">Login</button>
        </form>
        <div id="authResult" style="margin-top: 1rem; text-align: center; font-size: 0.9rem;"></div>
      </div>

      <!-- DASHBOARD VIEW -->
      <div id="dashView" class="view-container dashboard-container hidden">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem; margin-top: 2rem;">
          <div>
            <h1 style="margin: 0; font-size: 2rem;">My Workspaces</h1>
            <p style="margin: 0.5rem 0 0 0;">Manage your deployed experiences.</p>
          </div>
          <button id="logoutBtn" class="btn-outline" style="width: auto; padding: 0.5rem 1rem; margin: 0;">Logout</button>
        </div>
        
        <div id="workspacesList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 3rem;">
           <p style="color:var(--text-muted); grid-column: 1/-1;">Loading workspaces...</p>
        </div>
        
        <div class="card" style="max-width: 100%; padding: 2rem; margin-top: auto;">
          <h2 style="margin-top: 0; font-size: 1.25rem;">Deploy New Workspace</h2>
          <form id="createForm" style="display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap;">
             <div style="flex: 1; min-width: 250px;">
                <label>Workspace URL</label>
                <div class="input-group" style="margin-bottom: 0;">
                  <input type="text" id="subdomain" required placeholder="acme" autocomplete="off" pattern="[a-z0-9-]+" title="Only lowercase letters, numbers, and hyphens">
                  <span>.bluedev.dev</span>
                </div>
             </div>
             <button type="submit" style="width: auto; margin: 0; padding: 0.875rem 2rem;">Deploy</button>
          </form>
          <div id="createResult" style="margin-top: 1rem; font-size: 0.9rem;"></div>
        </div>
      </div>
      
      <script>
        const isAuthenticated = ${activeUser ? 'true' : 'false'};
        const authView = document.getElementById('authView');
        const dashView = document.getElementById('dashView');
        
        let isLogin = true;
        const tabLogin = document.getElementById('tabLogin');
        const tabRegister = document.getElementById('tabRegister');
        const authSubmit = document.getElementById('authSubmit');
        const authResult = document.getElementById('authResult');
        
        tabLogin.onclick = () => { isLogin = true; tabLogin.classList.add('active'); tabRegister.classList.remove('active'); authSubmit.textContent = 'Login'; authResult.innerHTML = ''; };
        tabRegister.onclick = () => { isLogin = false; tabRegister.classList.add('active'); tabLogin.classList.remove('active'); authSubmit.textContent = 'Create Account'; authResult.innerHTML = ''; };
        
        if (isAuthenticated) {
          dashView.classList.remove('hidden');
          loadWorkspaces();
        } else {
          authView.classList.remove('hidden');
        }
        
        document.getElementById('authForm').onsubmit = async (e) => {
          e.preventDefault();
          authSubmit.disabled = true;
          authResult.innerHTML = 'Processing...';
          const email = document.getElementById('authEmail').value;
          const rawPassword = document.getElementById('authPassword').value;
          const endpoint = isLogin ? '/api/hub/auth/login' : '/api/hub/auth/register';
          
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, rawPassword })
          });
          
          if (res.ok) {
            window.location.reload();
          } else {
            authResult.innerHTML = '<span style="color:#ef4444">' + await res.text() + '</span>';
            authSubmit.disabled = false;
          }
        };
        
        document.getElementById('logoutBtn').onclick = async () => {
          await fetch('/api/hub/auth/logout', { method: 'POST' });
          window.location.reload();
        };
        
        document.getElementById('createForm').onsubmit = async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('button');
          btn.disabled = true;
          btn.textContent = 'Deploying...';
          const subdomain = document.getElementById('subdomain').value.toLowerCase();
          
          const res = await fetch('/api/hub/workspaces', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ subdomain })
          });
          
          if (res.ok) {
            document.getElementById('createResult').innerHTML = '<span style="color:var(--accent)">Deployed successfully!</span>';
            loadWorkspaces();
            btn.disabled = false;
            btn.textContent = 'Deploy';
            document.getElementById('subdomain').value = '';
          } else {
            btn.disabled = false;
            btn.textContent = 'Deploy';
            document.getElementById('createResult').innerHTML = '<span style="color:#ef4444">' + await res.text() + '</span>';
          }
        };
        
        async function loadWorkspaces() {
          const res = await fetch('/api/hub/workspaces');
          if (res.ok) {
            const spaces = await res.json();
            const container = document.getElementById('workspacesList');
            if (spaces.length === 0) {
               container.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1;">No workspaces yet. Deploy your first one below.</p>';
               return;
            }
            container.innerHTML = spaces.map(s => \`
              <div class="card" style="padding: 1.5rem; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <div style="width: 8px; height: 8px; border-radius: 50%; background: \${s.status === 'active' ? 'var(--accent)' : '#ef4444'};"></div>
                  <div style="font-size: 1.25rem; font-weight: 600; color: #fff;">\${s.domain}</div>
                </div>
                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1.5rem;">Created \${new Date(s.createdAt).toLocaleDateString()}</div>
                <div style="margin-top: auto; display: flex; gap: 0.5rem;">
                  <a href="https://\${s.domain}/admin" target="_blank" class="btn-outline" style="flex:1; text-align:center; padding: 0.75rem; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 0.9rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Open Admin</a>
                  <a href="https://\${s.domain}" target="_blank" class="btn-outline" style="flex:1; text-align:center; padding: 0.75rem; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 0.9rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">View Site</a>
                </div>
              </div>
            \`).join('');
          }
        }
      </script>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } })
}

export async function resolveTenantDb(host: string, dataDir: string) {
  if (!hubDb) return null
  const tenant = await hubDb.getTenantByDomain(host)
  if (!tenant || tenant.status !== 'active') return null
  return getTenantDb(tenant.id, dataDir)
}
