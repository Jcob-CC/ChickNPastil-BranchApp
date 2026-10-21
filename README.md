## Requirements

- Node.js and npm
- A working SMTP account for the email verification step in user sign-in

## Getting started

Run these commands from the project root:

```sh
npm install
npm start
```

The server listens on [http://localhost:3000](http://localhost:3000). The root URL redirects to `/user/login`.

The application opens `database.sqlite` in the project root and runs `schema.sql` at startup to create any missing tables. The database file is local application data and is excluded from Git. A fresh database has the schema but is not automatically populated with users, locations, or inventory; add the records needed by your environment before using the corresponding features.

## Configuration

Copy `.env.example` to `.env` and configure the SMTP settings used to email sign-in verification codes:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
SESSION_SECRET=replace-with-a-long-random-value
```

Keep `.env` private; it is excluded from Git. `SESSION_SECRET` is optional in the current server, but setting a stable secret is recommended so sessions remain valid across server restarts. The server currently uses port `3000` as a constant in `server.js`; the `PORT` entry in `.env.example` is not currently read.

## Pages and routes

The browser-facing files are under `app/pages/`. Page routes are grouped by feature:

| Page file | Intended URL |
| --- | --- |
| `app/pages/user/login.html` | `/user/login` |
| `app/pages/user/profile.html` | `/user/profile` |
| `app/pages/user/manager.html` | `/user/manager` |
| `app/pages/supply/requisition.html` | `/supply/requisition` |
| `app/pages/supply/inventory.html` | `/supply/inventory` |
| `app/pages/supply/request_expenses.html` | `/supply/request_expenses` |
| `app/pages/supply/approve_expenses.html` | `/supply/approve_expenses` |
| `app/pages/supply/manage_fulfillment.html` | `/supply/manage_fulfillment` |
| `app/pages/supply/receive_fulfillment.html` | `/supply/receive_fulfillment` |

The user API routes are:

- `POST /user/check_pass` — validates the submitted email and password and emails a verification code.
- `POST /user/verify_email` — verifies the emailed code and returns active branch locations.
- `POST /user/start_session` — starts a session for the selected active branch.

Static browser assets are served from `app/`, including stylesheets, scripts, images, and reusable HTML snippets.

## Project structure

```text
.
├── app/
│   ├── assets/
│   │   ├── css/
│   │   │   └── style.css
│   │   ├── html/
│   │   │   └── bars.html
│   │   └── img/
│   │       └── logo.png
│   ├── js/
│   │   ├── shared/
│   │   │   └── bars.js
│   │   ├── supply/
│   │   │   └── inventory.js
│   │   └── user/
│   │       ├── admin.js
│   │       └── login.js
│   └── pages/
│       ├── supply/
│       │   ├── approve_expenses.html
│       │   ├── inventory.html
│       │   ├── manage_fulfillment.html
│       │   ├── receive_fulfillment.html
│       │   ├── request_expenses.html
│       │   └── requisition.html
│       ├── template/
│       │   └── index.html
│       └── user/
│           ├── admin.html
│           ├── login.html
│           └── profile.html
├── controllers/
│   ├── supply/
│   │   └── inventory.js
│   └── user/
│       └── login.js
├── docs/
│   ├── Interview1.pdf
│   ├── Interview2.pdf
│   ├── Interview3.pdf
│   └── JcobModulesERD.txt
├── lib/
│   ├── database.js
│   ├── emailer.js
│   └── password.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── supply.js
│   └── user.js
├── .env.example              # Example local configuration
├── .gitignore                # Excludes local dependencies, secrets, and database
├── database.sqlite           # Local SQLite database (not tracked by Git)
├── package.json              # Project metadata, dependencies, and npm scripts
├── package-lock.json         # Locked npm dependency versions
├── schema.sql                # SQLite table definitions
└── server.js                 # Express application entry point
```

## Database

`schema.sql` defines the SQLite tables. The main areas are:

- **Users and branches:** `user`, `branch_location`
- **Branch supply and inventory:** `general_stock_item`, `branch_inventory_item`, inventory logs, restock requests, and received-stock logs
- **Menu and ordering:** `menu_section`, `menu_products`, `product_addons`, `orders`, `order_items`, `order_item_addons`, `payments`, and `receipts`

The `docs/` directory contains a domain entity list and interview reference documents. The entity list is a project note; `schema.sql` is the authoritative database structure.

To start with clean local data, back up `database.sqlite` before replacing or removing it. Restarting the application creates a new empty database and applies the schema if the file is missing.

## Development

- `npm start` — starts the Express server with Node.js.
- `npm test` — currently a placeholder; no automated test suite is configured.

Stop the running server with `Ctrl+C`. Browser code belongs in `app/`; server-side routes, controllers, middleware, and helpers belong in their respective root folders. Do not commit `.env`, credentials, or a local database containing real user or business data.
