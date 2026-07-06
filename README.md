<div align="center">
  <img src="./public/bambu-logo.png" alt="Bambu Cloud" width="300" />
  <br/>
  <h1>Bambu Cloud</h1>
  <p><strong>The Ultimate Managed SaaS Web Builder</strong></p>
</div>

Bambu is a next-generation SaaS web builder platform. It allows anyone to create, design, and deploy world-class web experiences with zero coding required.

Behind the scenes, Bambu manages dynamic database provisioning (multi-tenant architecture) and instant routing, providing every customer with an isolated, secure, and incredibly fast workspace.

## Features

- **Multi-Tenant SaaS Architecture:** Automatic database provisioning and tenant isolation.
- **Visual Editor:** A completely drag-and-drop canvas that outputs clean, semantic HTML and highly optimized bundles.
- **Fully Managed Cloud:** Focus on building amazing sites without any technical headaches. We handle the servers, updates, and scaling.
- **Insanely Fast:** Built with Next-Gen tooling. Static publishing out of the box means perfect lighthouse scores.

## Architecture

Bambu operates on a two-tier database structure:
1. **Hub Database (`hub.db`):** The central nervous system. It handles user registration, domain mapping, and tenant resolution.
2. **Tenant Databases (`tenant_<id>.db`):** Isolated SQLite databases for each customer, ensuring absolute data privacy and security.

### How it Works
When a request comes in, Bambu's core routing engine inspects the `Host` header. 
- Requests to `app.bambu...` are routed to the central SaaS Registration Portal.
- Requests to customer subdomains trigger a fast lookup in the Hub Database, securely connecting the user to their own dedicated Tenant Database.

## Development

Install dependencies:
```bash
bun install
```

Start the development server:
```bash
bun run dev
```

Bambu will automatically start the backend API and the Vite development server.

## License

© 2026 Bambu Web Builder. Crafted with passion.
