const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const Database = require('better-sqlite3');

const databasePath = require.resolve('../lib/database');
const controllerPath = require.resolve('../controllers/user/dashboard');
const originalDatabaseModule = require.cache[databasePath];
const db = new Database(':memory:');
db.exec(`
    CREATE TABLE branch_restock_request (
        id INTEGER PRIMARY KEY,
        branch_location_id INTEGER NOT NULL,
        status TEXT NOT NULL
    );
    CREATE TABLE branch_expense_request (
        id INTEGER PRIMARY KEY,
        branch_location_id INTEGER NOT NULL,
        status TEXT NOT NULL
    );
    CREATE TABLE general_stock_item (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL
    );
    CREATE TABLE branch_inventory_item (
        id INTEGER PRIMARY KEY,
        branch_location_id INTEGER NOT NULL,
        general_stock_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        low_quantity_threshold REAL NOT NULL
    );
    CREATE TABLE commissary_stock_item (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        quantity REAL NOT NULL,
        low_stock_threshold REAL NOT NULL
    );
    CREATE TABLE commissary_purchase_order (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE commissary_delivery (id INTEGER PRIMARY KEY, status TEXT NOT NULL);

    INSERT INTO branch_restock_request VALUES
        (1, 1, 'pending'),
        (2, 2, 'pending'),
        (3, 1, 'preparing'),
        (4, 1, 'in_transit'),
        (5, 2, 'in_transit');
    INSERT INTO branch_expense_request VALUES
        (1, 1, 'pending'),
        (2, 2, 'pending'),
        (3, 1, 'approved'),
        (4, 2, 'approved'),
        (5, 1, 'rejected');
    INSERT INTO general_stock_item VALUES
        (1, 'active'),
        (2, 'active'),
        (3, 'inactive');
    INSERT INTO branch_inventory_item VALUES
        (1, 1, 1, 2, 3),
        (2, 1, 2, 10, 2),
        (3, 1, 3, 0, 1),
        (4, 2, 1, 0, 3);
    INSERT INTO commissary_stock_item VALUES
        (1, 'active', 2, 5),
        (2, 'active', 5, 5),
        (3, 'inactive', 0, 5);
    INSERT INTO commissary_purchase_order VALUES
        (1, 'draft'),
        (2, 'approved'),
        (3, 'received');
    INSERT INTO commissary_delivery VALUES
        (1, 'ready'),
        (2, 'in_transit');
`);

const databaseModule = new Module(databasePath);
databaseModule.filename = databasePath;
databaseModule.loaded = true;
databaseModule.exports = db;
require.cache[databasePath] = databaseModule;
const dashboard = require('../controllers/user/dashboard');

function invoke(role, branchLocationId = 1) {
    const result = { statusCode: 200, body: null };
    const res = {
        status(statusCode) {
            result.statusCode = statusCode;
            return this;
        },
        json(body) {
            result.body = body;
            return this;
        },
        sendStatus(statusCode) {
            result.statusCode = statusCode;
            return this;
        },
    };
    dashboard.getNotifications({
        session: { user: { role, branchLocationId } },
    }, res);
    return result;
}

const notificationCounts = (result) =>
    Object.fromEntries(result.body.notifications.map((notification) => [
        notification.key,
        notification.count,
    ]));

test('manager notifications include approvals and fulfillment work across branches', () => {
    const result = invoke('manager');

    assert.equal(result.statusCode, 200);
    assert.deepEqual(notificationCounts(result), {
        'restock-requests-to-review': 2,
        'restock-requests-to-dispatch': 1,
        'expense-requests-to-review': 2,
        'deliveries-to-receive': 1,
        'expenses-to-complete': 1,
        'low-branch-stock': 1,
        'low-commissary-stock': 1,
        'purchase-orders-to-approve': 1,
        'purchase-orders-to-receive': 1,
        'commissary-deliveries-to-dispatch': 1,
    });
});

test('branch roles receive only attention items available for their branch permissions', () => {
    for (const role of ['supervisor', 'service-crew']) {
        const result = invoke(role);

        assert.equal(result.statusCode, 200);
        assert.deepEqual(notificationCounts(result), {
            'deliveries-to-receive': 1,
            'expenses-to-complete': 1,
            'low-branch-stock': 1,
        });
    }
});

test.after(() => {
    db.close();
    delete require.cache[controllerPath];
    if (originalDatabaseModule) {
        require.cache[databasePath] = originalDatabaseModule;
    } else {
        delete require.cache[databasePath];
    }
});
