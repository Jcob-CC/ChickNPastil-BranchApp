# Chick N Pastil Branch App

## Set up the project

1. Install dependencies and copy the example settings:

   ```sh
   npm install
   cp .env.example .env
   ```

2. Edit `.env` (private, never committed, so each teammate has their own). Only fill in what you will use:

   | Setting | Purpose |
   | --- | --- |
   | `DISABLE_SIGN_IN_EMAIL_VERIFICATION` | Set `true` for local testing to skip the sign-in email code (fake emails then work). Never use in production. Password reset still needs a real email. |
   | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` | SMTP for email codes. Use an app password, not your Gmail password. |
   | `PAYMONGO_SECRET_KEY` | PayMongo **test** key for payment links. |
   | `POS_WEBHOOK_SECRET` | Long random secret that authorizes POS webhook requests. |
   | `GCASH_SMS_SECRET` | Long random secret the shop phone sends with each GCash text. See [GCash payments](#gcash-payments-shop-qr-with-automatic-recording). |
   | `GCASH_REQUIRE_SMS_MATCH` | `true` = a GCash payment is accepted only if GCash's text arrived; `false` (default) also lets the cashier type the reference. |
   | `SESSION_SECRET` | Optional. A long random value keeps sessions valid across restarts. |

   `PAYMONGO_WEBHOOK_SECRET` and `PORT` can stay as they are (the server always uses port 3000).

3. Start the server. The first run creates `database.sqlite` on your computer. It is not in the repository, so everyone starts empty.

   ```sh
   npm start
   ```

4. In a second terminal, create your account (roles: `admin`, `manager`, `supervisor`, `service-crew`; use `manager` to see every page), then add the sample menu and photos (safe to repeat):

   ```sh
   npm run create-user
   npm run seed-menu
   ```

5. Open [http://localhost:3000](http://localhost:3000) and sign in.

New users can also apply from the login page. That creates an inactive Service Crew account that a manager must activate.

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
      "addons": [
        { "addon_id": 4, "addon_name": "Garlic Rice", "quantity": 1 },
        { "addon_id": 7, "addon_name": "Extra Egg", "quantity": 2 }
      ]
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
- `addons`: optional selected menu addons. Send each addon ID (recommended) and name, plus its selected quantity. If the ID is omitted, the webhook resolves the exact addon name.

Configure inventory connections in **Sales → Menu Display Management → Modify** for each product. Add one or more active general stock items to the base menu item and set the quantity consumed per one item sold. For each selected customization/addon, you can separately map stock items and quantities consumed per addon selection. The POS webhook and built-in POS payment flow both use these saved mappings; sold quantities and addon quantities multiply the configured deductions. Menu items without mappings do not deduct inventory. There is no longer any automatic recipe estimate or stock-item name matching.

The direct `generalStockItemId`/`quantity` form remains available when the external POS needs to deduct a specific stock item directly.

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

The commissary is available at `/commissary` to signed-in `admin`, `manager`, `supervisor`, and legacy `cook` users. Its warehouse inventory is stored separately from branch supply inventory. Admins and managers maintain stock items and recipes, create purchase orders and deliveries, approve purchase orders, and dispatch deliveries. Supervisors and legacy Cooks can adjust stock, record wastage, plan and run production batches, and receive approved purchase orders.

The module records stock changes and their associated production, wastage, receipt, and delivery status changes in SQLite transactions. Batch start deducts recipe ingredients; batch completion adds finished goods. Receiving an approved purchase order adds raw materials to the commissary warehouse. Dispatch deducts finished goods from commissary stock only; it does not change branch inventory.

Barcode/QR scanning is available from the stock page when the browser can access a camera (for local development, use `localhost`; otherwise use HTTPS). If camera access or the scanner library is unavailable, enter the item's saved barcode/QR value manually. A scan only identifies the item and never changes stock without a confirmed adjustment.

## GCash payments (shop QR with automatic recording)

Customers pay the shop's own GCash. The shop phone forwards GCash's "You have received..." text to the server, and the POS shows the payment so the cashier can match it with the customer's receipt.

1. Save the shop's GCash QR as `app/assets/sales/img/gcash-qr.png`. It is not committed, so each computer needs its own copy.
2. Add `GCASH_SMS_SECRET=` with a long random value to `.env`, then restart the server.
3. Set up the shop phone to forward GCash texts to the server (see [Set up the phone](#set-up-the-phone)).
4. At the POS, choose **GCash**. When the customer pays, the payment appears as a card; compare it with their receipt and tap **Use this payment**.

If no text arrives, the cashier can type the reference number (set `GCASH_REQUIRE_SMS_MATCH=true` to turn that off). PayMongo payment links still work, but live keys need a registered business account.

### Set up the phone

Use the phone that has the shop's GCash SIM.

1. Install the free **SMS to URL Forwarder** app. It is not on Google Play, so on the phone open [f-droid.org](https://f-droid.org), install the F-Droid app, then search for the forwarder and install it. You can also download the `.apk` from the app's [F-Droid page](https://f-droid.org/packages/tech.bogomolov.incomingsmsgateway/) or its [GitHub releases](https://github.com/bogkonstantin/android_income_sms_gateway_webhook/releases). Android will ask you to allow installing from that source, and Play Protect may show a warning; continue only if you downloaded it from one of these places.
2. Connect the phone to the same Wi-Fi as the server computer. On the computer run `ipconfig` and note the **IPv4 Address** (for example `192.168.1.23`). Allow Node through the Windows firewall if it asks.
3. Open the app, allow the permissions it asks for, and add a forwarding setting:
   - **Sender:** `GCash` (the name shown in your messages app; use `*` if unsure, the server ignores texts that are not GCash payments).
   - **URL:** `http://192.168.1.23:3000/webhooks/gcash/sms?token=YOUR_SECRET` (your own IP address and the secret from `.env`).
   - **JSON body:** `{"from":"%from%","text":"%text%"}`
4. Press the app's **Test** button. Success means the phone can reach the server and the secret is right.
5. If forwarding stops in the background, allow the app to **Autostart** and exclude it from battery limits.

## Test from a phone on mobile data (ngrok)

A phone on mobile data cannot reach your computer directly. [ngrok](https://ngrok.com) gives the server a temporary public HTTPS address (HTTPS is also needed for the phone camera).

1. Sign up free at ngrok.com and copy your authtoken from [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken). Keep it private.
2. Install and save the token once:

   ```sh
   winget install ngrok.ngrok
   ngrok config add-authtoken YOUR_TOKEN
   ```

3. With `npm start` running, start the tunnel in a second terminal, then open the `https://...ngrok-free.app` address it prints (choose **Visit Site** on the warning page):

   ```sh
   ngrok http 3000
   ```

The address changes every restart. For the GCash forwarder over mobile data, use it as the URL: `https://YOUR-ADDRESS.ngrok-free.app/webhooks/gcash/sms?token=YOUR_SECRET`. Anyone with the address can reach the sign-in page, so use strong passwords and PayMongo test keys, and press `Ctrl+C` to stop the tunnel when done.
