import { HubDatabase, getTenantDb, type Tenant } from './db'
import { runMigrations } from '../db/runMigrations'
import { sqliteMigrations } from '../db/migrations-sqlite'

let hubDb: HubDatabase | null = null

export function initHubDb(dataDir: string) {
  hubDb = new HubDatabase(`${dataDir}/hub.db`)
}

export async function handleHubRequest(req: Request, dataDir: string): Promise<Response> {
  const url = new URL(req.url)
  
  // Basic API for the Hub
  if (req.method === 'POST' && url.pathname === '/api/register') {
    try {
      const body = await req.json()
      const { subdomain, email } = body
      
      if (!subdomain || !email) {
        return new Response('Missing required fields', { status: 400 })
      }
      
      const domain = `${subdomain}.bambu.bluedev.dev`
      
      // Check if exists
      const existing = await hubDb!.getTenantByDomain(domain)
      if (existing) {
        return new Response('Subdomain already in use', { status: 409 })
      }
      
      const tenantId = crypto.randomUUID()
      const tenant: Tenant = {
        id: tenantId,
        domain,
        email,
        createdAt: new Date().toISOString(),
        status: 'active'
      }
      
      await hubDb!.createTenant(tenant)
      
      // Initialize the new tenant DB and run migrations
      const db = getTenantDb(tenantId, dataDir)
      await runMigrations(db, sqliteMigrations)
      
      return new Response(JSON.stringify({ success: true, tenant }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 })
    }
  }

  // Simple placeholder for the Hub UI
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Bambu Hub</title>
      <style>
        body { font-family: system-ui; background: #0a0a0a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #1a1a1a; padding: 2rem; border-radius: 12px; width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #333; }
        h1 { margin-top: 0; color: #a4f21d; }
        input { width: 100%; padding: 10px; margin: 10px 0; background: #222; border: 1px solid #444; color: white; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #a4f21d; color: black; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        button:hover { background: #b5f542; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Bambu Cloud</h1>
        <p>Create your new site.</p>
        <form id="regForm">
          <label>Site Name (Subdomain)</label>
          <div style="display:flex; align-items:center; gap: 8px;">
            <input type="text" id="subdomain" required placeholder="my-site">
            <span style="color:#888">.bambu.bluedev.dev</span>
          </div>
          <label>Email</label>
          <input type="email" id="email" required placeholder="you@example.com">
          <button type="submit">Create Site</button>
        </form>
        <div id="result" style="margin-top:15px; font-size:14px;"></div>
      </div>
      <script>
        document.getElementById('regForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const subdomain = document.getElementById('subdomain').value;
          const email = document.getElementById('email').value;
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ subdomain, email })
          });
          if (res.ok) {
            document.getElementById('result').innerHTML = '<span style="color:#a4f21d">Site created successfully! Redirecting to admin...</span>';
            setTimeout(() => {
              window.location.href = 'https://' + subdomain + '.bambu.bluedev.dev/admin';
            }, 2000);
          } else {
            document.getElementById('result').innerHTML = '<span style="color:red">Error: ' + await res.text() + '</span>';
          }
        });
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
