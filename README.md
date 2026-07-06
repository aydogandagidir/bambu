<div align="center">

  <!-- Logo (If you have one, otherwise a stylized text) -->
  <h1>🎋 Bambu Cloud</h1>
  <p><strong>The Ultimate Managed SaaS Web Builder</strong></p>

  <p>
    <a href="https://github.com/aydogandagidir/bambu/releases"><img src="https://img.shields.io/github/v/release/aydogandagidir/bambu?style=for-the-badge&color=success" alt="Release" /></a>
    <a href="https://github.com/aydogandagidir/bambu/blob/master/LICENSE"><img src="https://img.shields.io/github/license/aydogandagidir/bambu?style=for-the-badge&color=blue" alt="License" /></a>
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge" alt="PRs Welcome" />
    <img src="https://img.shields.io/badge/Made%20with-Bun-black.svg?style=for-the-badge&logo=bun" alt="Made with Bun" />
    <img src="https://img.shields.io/badge/Frontend-Vite-646CFF.svg?style=for-the-badge&logo=vite" alt="Vite" />
  </p>

  <p>
    Create, design, and deploy world-class web experiences with zero coding required.
    <br />
    <a href="https://app.bambu.bluedev.dev"><strong>Explore the Docs »</strong></a>
    ·
    <a href="https://github.com/aydogandagidir/bambu/issues">Report Bug</a>
    ·
    <a href="https://github.com/aydogandagidir/bambu/issues">Request Feature</a>
  </p>

</div>

<br />

## 🌟 About Bambu

Bambu is a next-generation SaaS web builder platform designed for speed, scale, and absolute simplicity. Built on top of a powerful visual engine, it allows anyone to drag-and-drop their way to a beautiful, highly-optimized website.

Behind the scenes, Bambu is a fully managed, **multi-tenant cloud architecture**. It provisions isolated databases on the fly, manages dynamic routing, and ensures every single customer gets a fast, secure, and personalized workspace.

---

## 🔥 Key Features

- **🧑‍💻 Zero-Code Visual Editor:** A robust drag-and-drop canvas that outputs clean, semantic HTML and highly optimized CSS.
- **🏢 True Multi-Tenancy:** Automatic SQLite database provisioning (`tenant_<id>.db`) and complete data isolation for every customer.
- **⚡ Insanely Fast:** Powered by [Bun](https://bun.sh/) and [Vite](https://vitejs.dev/). Static publishing out of the box means perfect 100/100 Lighthouse scores.
- **🔒 Centralized SaaS Hub:** A master `hub.db` manages user registration, domain mapping, and tenant resolution securely.
- **🌐 Dynamic Subdomain Routing:** Seamlessly route incoming requests (e.g., `user1.bambu...`) to their respective tenant workspaces without server restarts.

---

## 🏗️ Architecture

Bambu operates on a robust, two-tier database structure designed for SaaS scalability:

1. **Hub Database (`hub.db`)**: 
   The central nervous system. It handles global user registration, subdomain mapping, and tenant resolution.
2. **Tenant Databases (`tenant_<id>.db`)**: 
   Isolated databases for each individual customer, ensuring absolute data privacy, secure content management, and easy portability.

### How Routing Works
When a request hits the Bambu edge:
- Requests to the primary domain (`app.bambu...`) are routed to the **SaaS Registration Portal**.
- Requests to customer subdomains (`<tenant>.bambu...`) trigger a lightning-fast lookup in the Hub Database, seamlessly connecting the user to their own dedicated workspace.

---

## 🚀 Quick Start

Getting started with Bambu locally is incredibly simple. Ensure you have [Bun](https://bun.sh/) installed.

### 1. Clone the repository
```bash
git clone https://github.com/aydogandagidir/bambu.git
cd bambu
```

### 2. Install dependencies
```bash
bun install
```

### 3. Start the development server
```bash
bun run dev
```

Bambu will automatically initialize the central `hub.db`, apply all necessary migrations, and start both the backend API and the Vite development server.

---

## 🛠️ Built With

* [Bun](https://bun.sh/) - Extremely fast JavaScript runtime
* [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
* [React](https://reactjs.org/) - A JavaScript library for building user interfaces
* [SQLite](https://sqlite.org/index.html) - C-language library that implements a SQL database engine

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <b>Built with ❤️ by <a href="https://github.com/aydogandagidir">aydogandagidir</a></b>
</div>
