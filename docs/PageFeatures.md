# Page Usage Guide

This guide describes the pages currently present in `app/pages/`, based on the
routes and interactions implemented in the application. Sign in first; the
application redirects unauthenticated requests to `/user/login`. The shared
top bar shows the current user and branch, and the sidebar links to the
available pages. Manager-only pages require an admin or manager account.

## User pages

### Sign in — `app/pages/user/login.html` (`/user/login`)

1. Enter the account email address and password, then select **Sign in**.
2. If the credentials are accepted, retrieve the six-digit verification code
   sent to the email address and enter it in the verification dialog. The code
   expires after 10 minutes.
3. Choose an active branch from the list and select **Continue**.
4. Check the branch in the confirmation dialog. Select **Change** to choose
   another branch, or **Confirm branch** to start the session. A successful
   sign-in opens the profile page.
5. If credentials, the verification code, or email delivery fail, follow the
   message on the page and try again.

### User profile — `app/pages/user/profile.html` (`/user/profile`)

1. Review the account name, email address, and role shown under **Account
   details**.
2. To change the password, select **Change password**, enter the current
   password and the new password twice, then select **Update password**. The
   new password must be at least eight characters and both new-password
   entries must match.
3. Select **Log out** to end the current session.
4. To deactivate the account, open **Deactivate account**, enter the current
   password, and confirm. A successful deactivation ends the session.

### System manager — `app/pages/user/manager.html` (`/user/manager`)

This page is for administrators and managers. Use the tabs to manage staff
accounts, branch locations, and general stock items.

1. Choose the relevant tab: **Staff accounts**, **Branch locations**, or
   **Branch stock items**. The summary cards show totals and active counts.
2. Select **Add** to open the form for the selected record type. Enter the
   requested details and save the record.
3. Use the row actions to edit an existing account, branch, or stock item.
   Activate/deactivate actions switch the record's status; the summary counts
   update from the refreshed records. Review the confirmation or validation
   message shown by the page before continuing.

## Supply pages

### Branch inventory — `app/pages/supply/inventory.html`
(`/supply/inventory`)

1. Search the inventory list by item name. Use the pagination controls to
   browse the list and the quantity update log. Items at or below their
   low-stock threshold are automatically marked **Low**.
2. Select **Add item** to choose a general stock item and set its starting
   branch quantity, low-stock threshold, and restock target.
3. Use an item's actions to change its branch thresholds/target or update its
   on-hand quantity. When changing stock, enter the new quantity and choose a
   reason so the change is recorded in the quantity log.
4. Review the log to see the date, previous and updated quantities, change,
   and reason for stock updates. Stock changes made through this page are
   automatically logged.

### Stock requisition — `app/pages/supply/request_stock.html`
(`/supply/request_stock`)

1. Review the branch inventory and the automatically filled branch and
   preparer details.
2. The requested-items list is prepopulated with branch inventory items whose
   on-hand quantity is at or below the low-stock threshold. For each included
   item, the suggested request quantity is the difference between its restock
   target and current on-hand quantity (never less than zero).
3. Review and adjust the suggested quantities, or remove items that should not
   be requested. Use **Add item** to add another branch inventory item; it is
   suggested at the same target-minus-on-hand quantity.
4. Select **Confirm inventory** to check on-hand counts and restock targets.
   Correct any inventory values that need updating, then save the changes.
   The suggested quantities are recalculated from the confirmed values for
   low-stock items and items already in the request. If a confirmed on-hand
   quantity changes, the correction is automatically recorded in the
   inventory log.
5. Add an optional note for the supply team and select **Submit requisition**.
6. Review the submission receipt, including the request number, branch,
   preparer, items, and note.

### Unexpected expenses — `app/pages/supply/request_expenses.html`
(`/supply/request_expenses`)

1. Review this branch's existing expense requests. Open a request to read its
   items, notes, and approval/rejection status.
2. Select **New expense request** to start a request. Add items from the stock
   catalog, or use **Add another expense** to enter an item name, unit,
   quantity, and total price for a non-catalog expense.
   Catalog items start with quantity 1, but their total price must be entered;
   the displayed catalog unit cost is a reference and is not automatically
   multiplied by the entered quantity.
3. The request total automatically recalculates as you enter or change line
   prices; the item count updates as items are added or removed. Review the
   item list and total, enter an optional note for the approver, then submit
   the request.
4. Track non-approved requests in the pending/other list and approved requests
   in the approved list. When an approved request has been fulfilled, select
   **Complete** and confirm. The catalog stock items in that request are added
   to this branch's inventory quantities, and an inventory log entry records
   each stock update with the request number as its reason. Other/custom
   expense items are not added to inventory. The request is then marked
   completed.
5. If an administrator or manager has configured a positive automatic
   approval limit, a new request whose total is at or below that limit is
   approved automatically; a higher total remains pending for review. A limit
   of zero disables automatic approval. The requester receives an email when
   a request is approved, including when it is approved automatically.

### Receive deliveries — `app/pages/supply/receive_stock.html`
(`/supply/receive_stock`)

1. Review the stock requests for your branch and their current statuses.
2. Open a request to inspect its requested items and notes.
3. A pending request can be cancelled by selecting its cancel action and
   confirming. Keep the request if you do not want to cancel it.
4. When a delivery arrives, open **Receive delivery** for the relevant
   in-transit request. Each item starts with its full requested quantity in
   **Accepted** and zero in **Missing / damaged**. Change either input and the
   other is automatically calculated as the remainder, so the two values
   always equal the requested quantity.
5. Add an optional receiving note and select **Save receipt to inventory**.
   Accepted quantities are added to branch inventory and recorded in the
   inventory quantity log. Missing and damaged quantities are recorded as
   lost quantities in the delivery receipt; they are not added to inventory.
   The request is then automatically marked received.
6. Review the updated request status and delivery record.

### Manage restock — `app/pages/supply/manage_request.html`
(`/supply/manage_request`)

This page is restricted to administrators and managers.

1. Search requests by request, branch, or staff. Narrow the list by status or
   branch and choose a sort order.
2. Open a request to review its items and status history. The consolidated
   items view automatically totals each item and counts the requests needing
   it across requests in **Preparing** status. Print the consolidated list if
   needed.
3. Use the request actions to change its fulfillment status and optionally
   add a status note. Requests with a recorded receipt can be inspected from
   the receipt details.
4. Use **Print manifest** on a request when a printable fulfillment list is
   needed. Refresh or reapply the filters to check updated statuses.

### Approve expenses — `app/pages/supply/manage_expenses.html`
(`/supply/manage_expenses`)

This page is restricted to administrators and managers.

1. Review the automatically calculated pending request count and the total
   value of approved and completed requests.
2. Search expense requests and filter by status or date. Change the sort
   order to locate a request.
3. Open a request to check its branch, requester, items, amount, and notes.
   Pending requests can be reviewed; choose **Approve** or **Reject**, and
   optionally add a note for the branch. The requester receives an email when
   the request is approved.
4. To adjust automatic approvals for future submissions, enter the maximum
   request total in PHP and select **Save setting**. Requests at or below a
   positive limit are automatically approved; setting the limit to zero turns
   this off. Existing requests are not automatically re-evaluated when the
   limit changes. Check the page message to confirm the setting was saved.

## Other automatic behavior

- After sign-in, the shared page header fills in the signed-in user's name,
  role, and selected branch. Role-restricted navigation links are shown only
  to the permitted roles; protected pages still enforce authorization on the
  server.
- Branch and staff fields on stock requisitions, expense requests, and
  delivery receipts are filled from the active session rather than entered
  manually. Delivery receipt date/time is filled when the receive form opens.
- Inventory quantities are updated and their audit entries are written as
  part of the same operation when a delivery is received or an approved
  expense request is completed. Requisition inventory confirmation also logs
  any changed on-hand quantity. Missing/damaged delivery quantities are
  separately recorded as receipt losses.
- Restock status counts, manager summary counts, expense totals/counts, and
  filtered list counts are calculated from the records loaded by each page;
  they are not manually maintained.

## Page shells and template

The following files currently contain only the shared top bar/sidebar
placeholders and an empty content area. They do not yet have an implemented
page workflow or a registered page route:

- `app/pages/home/staff.html` — staff home shell.
- `app/pages/home/manager.html` — manager home shell.
- `app/pages/template/index.html` — reusable starter page template.

## Access and availability notes

- The route for `/user/manager`, `/supply/manage_request`, and
  `/supply/manage_expenses` checks that the signed-in role is `admin` or
  `manager`. The sidebar also hides manager links from other roles.
- The currently registered supply pages are inventory, stock requisition,
  expense request, delivery receipt, restock management, and expense approval.
- Inventory and request pages need the corresponding branch, user, and stock
  records in the database to show meaningful data. A fresh database is not
  automatically populated.
- The home shells are not equivalent to working dashboard pages. The current
  application root redirects to `/user/login`.
