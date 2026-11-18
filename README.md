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
   | `DISABLE_SIGN_IN_EMAIL_VERIFICATION` | Set to `true` to skip sign-in email-code delivery and code checks. Defaults to `false`; use only in trusted development environments. Password-reset verification is unaffected. |
   | `PAYMONGO_SECRET_KEY` | PayMongo secret API key for payment features. Use a test key for development. |
   | `PAYMONGO_WEBHOOK_SECRET` | Reserved for PayMongo webhook signature verification; the current webhook handler does not verify signatures. |
   | `POS_WEBHOOK_SECRET` | A long, randomly generated secret used to authorize POS sold-menu-item webhook requests. |
   | `PORT` | The example is set to `3000`; the server currently listens on port `3000` regardless of this value. |

   `SESSION_SECRET` is optional but recommended. Set it to a long, random value so sessions remain valid across server restarts. If it is omitted, the server generates a temporary value each time it starts.

   No external account is needed to run the app locally. Email and PayMongo accounts are needed only for their respective integrations. Sign-in uses user records in `database.sqlite`; the repository database includes local demo accounts listed in [Local database test accounts](#local-database-test-accounts). Other database copies may contain different users.

   The login page's **Forgot password?** flow sends an email verification code to active accounts. Configure the `EMAIL_*` settings above to enable email delivery. Codes expire after 10 minutes, allow at most five incorrect attempts, and can be used once; a verified code lets the user choose a new password of 8–256 characters.

   Users without an account can apply from the login page with their name, email, and password. Applications create inactive vendor accounts; a manager must activate the account before the user can sign in. Applicants should contact their manager for approval. Branch selection remains part of the sign-in flow.

4. Start the server:

   ```sh
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000). The app redirects to the sign-in page.

## Create an account from the terminal

Run `npm run create-user` from the project folder and follow the prompts. The script creates an account in the local `database.sqlite` database, hashes the password using the app's password helper, and does not display the password as you type. Available roles are `admin`, `manager`, `Cook`, and `Vendor`; status defaults to `active`.

## Disable email sign in verification

For trusted development environments, add this setting to `.env` to skip the sign-in email code:

```env
DISABLE_SIGN_IN_EMAIL_VERIFICATION=true
```

Restart the server after changing the setting. Verification is enabled by default. When sign-in verification is disabled, test accounts can use fake email addresses because sign-in does not send or check an email code. Password-reset verification is unaffected, so use a real email address if you need to test password resets. Disabling sign-in verification removes an extra layer of account protection; do not use this setting in production.

### Local database test accounts

With the repository's `database.sqlite` and sign-in email verification disabled, these local demo accounts can be used to test each role:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@mail.com` | `12345678` |
| Cook | `cook@mail.com` | `12345678` |
| Manager | `manager@mail.com` | `12345678` |
| Vendor | `vendor@mail.com` | `12345678` |

These are development-only credentials. Do not use them in production or on a deployed instance; change or remove them before deployment. Their fake email addresses cannot receive password-reset codes.

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

### POS sold menu item

Set `POS_WEBHOOK_SECRET` in `.env`, then send:

```http
POST /webhooks/pos/sold-menu-item
Authorization: Bearer YOUR_POS_WEBHOOK_SECRET
Content-Type: application/json
```

```json
{
  "branchLocationId": 1,
  "generalStockItemId": 12,
  "userId": 4,
  "quantity": 2
}
```
- `branchLocationId`: branch to update.
- `generalStockItemId`: stock item to reduce.
- `userId`: user recording the sale.
- `quantity`: amount sold.

To deduct menu ingredients instead of one stock item, send:

```json
{
  "branchLocationId": 1,
  "userId": 4,
  "items": [
    {
      "menuItemId": 3,
      "quantity": 2,
      "addons": ["Garlic Rice", "Extra Egg"]
    },
    {
      "menuItemName": "Royal",
      "quantity": 1
    }
  ]
}
```
- `items`: sold menu items in this sale.
- `menuItemId`: menu product ID, or use `menuItemName`.
- `quantity`: number of that menu item sold.
- `addons`: optional addon names or `{ "addon_name": "Extra Egg", "quantity": 2 }` objects.

- `branchLocationId`, `generalStockItemId`, and `userId` are IDs from this app's database; the branch, stock item, and user must be active.
- `quantity` is the positive amount sold and is subtracted from the branch's on-hand total. If the branch does not have enough stock, the endpoint responds with `409` and leaves inventory and the log unchanged.
- The inventory log records each sale with the fixed reason `sold menu item`. The request does not accept a reason.
- Each request is treated as a separate sale; retries are not deduplicated.
- This endpoint does not require a signed-in app session. Keep the secret private and use HTTPS.

### PayMongo event notification

Configure PayMongo to send `POST /api/paymongo/webhook` to the server. The current handler checks for an event type, logs it, and acknowledges receipt. It does not verify the webhook signature or apply the event to an order, so do not treat this endpoint as payment verification.

## Add a page or feature

1. Copy `app/pages/template/index.html` into the appropriate section under `app/pages/`, for example `app/pages/supply/new_page.html`. Keep the page two folders below `app/` so the template's relative paths to shared assets and `bars.js` continue to work.
2. Update the page title and `data-page-header`, then add the page content inside `<main class="main-content">`.
3. Add a page route to the relevant file in `routes/`, returning the new HTML file. If the feature needs API behavior, add its endpoint there too, and implement the request handling in the matching file under `controllers/`.
4. Add a link to the appropriate submenu in `app/assets/html/bars.html`, using the URL registered in the route. Add a role class such as `role-admin` or `role-manager` when the link should only appear for those roles.
5. Put browser scripts in `app/js/` and styles in `app/assets/css/` (or the matching feature-specific asset folder), and reference them from the page.

## AI Generated Commissary module

The commissary is available at `/commissary` to signed-in `admin`, `manager`, and `cook` users. Its warehouse inventory is stored separately from branch supply inventory. Admins and managers maintain stock items and recipes, create purchase orders and deliveries, approve purchase orders, and dispatch deliveries. Cooks can adjust stock, record wastage, plan and run production batches, and receive approved purchase orders.

The module records stock changes and their associated production, wastage, receipt, and delivery status changes in SQLite transactions. Batch start deducts recipe ingredients; batch completion adds finished goods. Receiving an approved purchase order adds raw materials to the commissary warehouse. Dispatch deducts finished goods from commissary stock only; it does not change branch inventory.

Barcode/QR scanning is available from the stock page when the browser can access a camera (for local development, use `localhost`; otherwise use HTTPS). If camera access or the scanner library is unavailable, enter the item's saved barcode/QR value manually. A scan only identifies the item and never changes stock without a confirmed adjustment.
