## Requirements

- Node.js and npm
- An SMTP account only if email verification is enabled in the sign-in controller

## Getting started

From the project root, install dependencies and start the server:

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The root URL redirects to `/user/login`.

At startup, the app opens `database.sqlite` in the project root and executes `schema.sql` to create any missing tables. The schema does not create users, branches, stock items, or inventory records. Set up those records before using the corresponding features. The manager interface can manage users, branches, and general stock items once an administrator or manager account is available.

The repository currently tracks `database.sqlite`, and `.gitignore` does not exclude it. Do not put real personal, credential, or business-sensitive data in the tracked database.

## Configuration

Copy `.env.example` to `.env` and set the SMTP credentials if email delivery is enabled:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
SESSION_SECRET=replace-with-a-long-random-value
```

Keep `.env` private; it is excluded from Git. `SESSION_SECRET` is optional, but set a long, stable value so sessions can remain valid across server restarts. If it is unset, the server generates a new secret each time it starts.

Although `.env.example` includes `PORT=3000`, the server currently uses port `3000` directly; changing `PORT` has no effect.

### Sign-in verification status

The sign-in flow includes endpoints for password checking, code verification, and branch selection. In the current `controllers/user/login.js`, email delivery is commented out and the verification-code rejection is disabled. Treat email verification as incomplete and do not rely on it as a security control until that flow is implemented and tested.

## Pages and routes

| Page | URL | Access |
| --- | --- | --- |
| `app/pages/user/login.html` | `/user/login` | Public |
| `app/pages/user/profile.html` | `/user/profile` | Signed-in users |
| `app/pages/user/manager.html` | `/user/manager` | Admins and managers |
| `app/pages/supply/inventory.html` | `/supply/inventory` | Signed-in users |
| `app/pages/supply/request_stock.html` | `/supply/request_stock` | Signed-in users |
| `app/pages/supply/request_expenses.html` | `/supply/request_expenses` | Signed-in users |
| `app/pages/supply/receive_stock.html` | `/supply/receive_stock` | Signed-in users |
| `app/pages/supply/manage_request.html` | `/supply/manage_request` | Admins and managers |
| `app/pages/supply/manage_expenses.html` | `/supply/manage_expenses` | Admins and managers |

The user API includes:

- `POST /user/check_pass`, `POST /user/verify_email`, and `POST /user/start_session` for sign-in and branch selection.
- `GET /user/session`, `GET /user/profile/details`, `POST /user/profile/password`, `POST /user/profile/deactivate`, and `POST /user/logout` for session and profile actions.
- `/user/manager/users`, `/user/manager/branches`, and `/user/manager/stock-items` for manager user, branch, and stock-item management.

The supply API is organized under `/supply`: inventory operations use `/inventory`; stock requests and receiving use `/request_stock` and `/receive_stock`; expense requests use `/request_expenses`; and manager workflows use `/manage_request` and `/manage_expenses`. See `routes/user.js` and `routes/supply.js` for the available HTTP methods and endpoint details.

Static assets such as stylesheets, scripts, images, and shared HTML are served from `app/`.

## Project structure

```text
.
├── app/
│   ├── assets/              # CSS, shared HTML, and images
│   ├── js/                  # Browser-side JavaScript
│   └── pages/               # User, supply, and template pages
├── controllers/
│   ├── supply/              # Inventory, stock, and expense handlers
│   └── user/                # Login, profile, and manager handlers
├── docs/                    # Project notes and reference documents
├── lib/                     # Database, email, password, and notification helpers
├── middleware/              # Middleware
├── routes/                  # Express route definitions
├── .env.example             # Example local configuration
├── database.sqlite          # SQLite application data (currently tracked)
├── package.json             # Dependencies and npm scripts
├── schema.sql               # SQLite table definitions
└── server.js                # Express application entry point
```

## Database

`schema.sql` is the authoritative database structure. It defines tables for users and branches, inventory and stock requests (including restock-request status history), expense requests, and menu, order, payment, and receipt data. The `docs/` directory includes project notes and reference documents; these do not replace the schema.

To create a fresh local database, back up any data you need, then remove or move `database.sqlite` and restart the app. The server creates the database file and applies the schema at startup; the new database will not contain user, branch, or inventory records.

## Development

- `npm start` — starts the Express server with Node.js.
- `npm test` — not configured; the current script exits with an error.

Stop the server with `Ctrl+C`. Browser code belongs in `app/`; server-side routes, controllers, middleware, and helpers belong in their respective root folders. Never commit credentials or real user or business data.
