# Chick N Pastil Branch App

## Set up the project

1. Install Node.js and npm.
2. From the project folder, install the dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in the credentials for any external services you plan to use:

   | Setting | Purpose |
   | --- | --- |
   | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` | SMTP server details for email notifications. Use an SMTP app password where your provider requires one; do not use your regular Gmail password. |
   | `PAYMONGO_SECRET_KEY` | PayMongo secret API key for payment features. Use a test key for development. |
   | `PAYMONGO_WEBHOOK_SECRET` | Reserved for PayMongo webhook signature verification; the current webhook handler does not verify signatures. |
   | `POS_WEBHOOK_SECRET` | A long, randomly generated secret used to authorize POS inventory updates. |
   | `PORT` | The example is set to `3000`; the server currently listens on port `3000` regardless of this value. |

   `SESSION_SECRET` is optional but recommended. Set it to a long, random value so sessions remain valid across server restarts. If it is omitted, the server generates a temporary value each time it starts.

   No external account is needed to run the app locally. Email and PayMongo accounts are needed only for their respective integrations. The app's sign-in uses user records in its database; the project does not define a default username or password, so obtain an existing account from an administrator.

4. Start the server:

   ```sh
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000). The app redirects to the sign-in page.

## Request flow and code structure

```text
Browser page or external webhook
              |
              v
         server.js 
            and
         middleware/
              |
              v
routes/ (URL and HTTP method definitions)
              |
              v
controllers/ (request handling, business logic, database or service calls)
              |
              v
         HTTP response



lib/ (reusable functions)
```

Browser pages and JavaScript live under `app/`. `server.js` sets up Express and mounts the route modules. Routes connect URLs to controller functions; controllers perform the work and return responses. Webhooks enter through their registered route just like other HTTP requests, although their authentication and processing depend on the individual handler.

## Existing webhook cheat sheet

### POS inventory update

Set `POS_WEBHOOK_SECRET` in `.env`, then send:

```http
POST /webhooks/pos/inventory
Authorization: Bearer YOUR_POS_WEBHOOK_SECRET
Content-Type: application/json
```

```json
{
  "branchLocationId": 1,
  "generalStockItemId": 12,
  "quantity": 24
}
```

- `branchLocationId` and `generalStockItemId` are IDs from this app's database.
- `quantity` is the new on-hand total, not an amount to add or subtract.
- The endpoint updates an existing inventory record or creates one if needed. The referenced branch and stock item must be active.
- This endpoint does not require a signed-in app user. Keep the secret private and use HTTPS.

### PayMongo event notification

Configure PayMongo to send `POST /api/paymongo/webhook` to the server. The current handler checks for an event type, logs it, and acknowledges receipt. It does not verify the webhook signature or apply the event to an order, so do not treat this endpoint as payment verification.

## Add a page or feature

1. Copy `app/pages/template/index.html` into the appropriate section under `app/pages/`, for example `app/pages/supply/new_page.html`. Keep the page two folders below `app/` so the template's relative paths to shared assets and `bars.js` continue to work.
2. Update the page title and `data-page-header`, then add the page content inside `<main class="main-content">`.
3. Add a page route to the relevant file in `routes/`, returning the new HTML file. If the feature needs API behavior, add its endpoint there too, and implement the request handling in the matching file under `controllers/`.
4. Add a link to the appropriate submenu in `app/assets/html/bars.html`, using the URL registered in the route. Add a role class such as `role-admin` or `role-manager` when the link should only appear for those roles.
5. Put browser scripts in `app/js/` and styles in `app/assets/css/` (or the matching feature-specific asset folder), and reference them from the page.
