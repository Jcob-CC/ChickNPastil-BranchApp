const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const { getMappedInventoryUsage } = require('../lib/menu_inventory_mappings');

function createDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE general_stock_item (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            unit_type TEXT NOT NULL,
            status TEXT NOT NULL
        );
        CREATE TABLE menu_product_inventory_mapping (
            product_id INTEGER NOT NULL,
            addon_id INTEGER,
            general_stock_item_id INTEGER NOT NULL,
            quantity REAL NOT NULL
        );
        INSERT INTO general_stock_item VALUES
            (1, 'Rice', 'kg', 'active'),
            (2, 'Egg', 'piece', 'active'),
            (3, 'Inactive sauce', 'kg', 'inactive');
        INSERT INTO menu_product_inventory_mapping VALUES
            (10, NULL, 1, 0.5),
            (10, 5, 1, 0.25),
            (10, 5, 2, 2),
            (10, 6, 3, 0.1);
    `);
    return db;
}

test('scales and aggregates base and selected addon inventory mappings', () => {
    const db = createDb();
    try {
        const usage = getMappedInventoryUsage(db, 10, 3, [
            { addon_id: 5, quantity: 2 },
            { addon_id: 6, quantity: 0 },
        ]);
        assert.deepEqual(
            usage.map(item => [item.stockItem.id, item.quantity]).sort((a, b) => a[0] - b[0]),
            [[1, 2], [2, 4]],
        );
    } finally {
        db.close();
    }
});

test('does not deduct addon mappings for unselected addons', () => {
    const db = createDb();
    try {
        const usage = getMappedInventoryUsage(db, 10, 2, []);
        assert.deepEqual(usage.map(item => [item.stockItem.id, item.quantity]), [[1, 1]]);
    } finally {
        db.close();
    }
});

test('returns no usage for products without configured mappings', () => {
    const db = createDb();
    try {
        assert.deepEqual(getMappedInventoryUsage(db, 99, 1), []);
    } finally {
        db.close();
    }
});

test('rejects a selected mapping whose general stock item is inactive', () => {
    const db = createDb();
    try {
        assert.throws(
            () => getMappedInventoryUsage(db, 10, 1, [{ addon_id: 6, quantity: 1 }]),
            error => error.code === 'INVENTORY_NOT_AVAILABLE',
        );
    } finally {
        db.close();
    }
});
