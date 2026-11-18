const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const Database = require('better-sqlite3');

const databasePath = require.resolve('../lib/database');
const controllerPath = require.resolve('../controllers/sales/menu');
const originalDatabaseModule = require.cache[databasePath];
const db = new Database(':memory:');
db.exec(`
    CREATE TABLE menu_products (
        product_id INTEGER PRIMARY KEY,
        customization_choice_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE product_addons (
        addon_id INTEGER PRIMARY KEY,
        is_available INTEGER NOT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE general_stock_item (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        status TEXT NOT NULL
    );
    CREATE TABLE menu_product_inventory_mapping (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL,
        addon_id INTEGER,
        general_stock_item_id INTEGER NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0)
    );
    CREATE UNIQUE INDEX unique_base_mapping
        ON menu_product_inventory_mapping (product_id, general_stock_item_id)
        WHERE addon_id IS NULL;
    CREATE UNIQUE INDEX unique_addon_mapping
        ON menu_product_inventory_mapping (product_id, addon_id, general_stock_item_id)
        WHERE addon_id IS NOT NULL;
    INSERT INTO menu_products VALUES (10, '[5]');
    INSERT INTO product_addons VALUES (5, 1, 0);
    INSERT INTO general_stock_item VALUES
        (1, 'Rice', 'kg', 'active'),
        (2, 'Egg', 'piece', 'active'),
        (3, 'Inactive', 'kg', 'inactive');
`);

const databaseModule = new Module(databasePath);
databaseModule.filename = databasePath;
databaseModule.loaded = true;
databaseModule.exports = db;
require.cache[databasePath] = databaseModule;
const menuController = require('../controllers/sales/menu');

function invoke(handler, req) {
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
    };
    handler(req, res);
    return result;
}

test('saves product and selected-addon stock mappings', () => {
    const result = invoke(menuController.replaceProductInventoryMappings, {
        params: { id: '10' },
        body: {
            mappings: [
                { general_stock_item_id: 1, quantity: 0.5 },
                { addon_id: 5, general_stock_item_id: 2, quantity: 2 },
            ],
        },
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.deepEqual(
        db.prepare(`
            SELECT addon_id, general_stock_item_id, quantity
            FROM menu_product_inventory_mapping
            ORDER BY addon_id
        `).all(),
        [
            { addon_id: null, general_stock_item_id: 1, quantity: 0.5 },
            { addon_id: 5, general_stock_item_id: 2, quantity: 2 },
        ],
    );
});

test('rejects invalid mappings without replacing saved mappings', () => {
    const before = db.prepare(`
        SELECT addon_id, general_stock_item_id, quantity
        FROM menu_product_inventory_mapping
        ORDER BY addon_id
    `).all();
    const result = invoke(menuController.replaceProductInventoryMappings, {
        params: { id: '10' },
        body: {
            mappings: [
                { general_stock_item_id: 1, quantity: 0.25 },
                { addon_id: 99, general_stock_item_id: 2, quantity: 1 },
            ],
        },
    });

    assert.equal(result.statusCode, 400);
    assert.deepEqual(
        db.prepare(`
            SELECT addon_id, general_stock_item_id, quantity
            FROM menu_product_inventory_mapping
            ORDER BY addon_id
        `).all(),
        before,
    );
});

test('rejects duplicate stock entries for the same product or addon', () => {
    const result = invoke(menuController.replaceProductInventoryMappings, {
        params: { id: '10' },
        body: {
            mappings: [
                { general_stock_item_id: 1, quantity: 1 },
                { general_stock_item_id: 1, quantity: 2 },
            ],
        },
    });

    assert.equal(result.statusCode, 400);
    assert.match(result.body.error, /only be mapped once/);
});

test.after(() => {
    db.close();
    delete require.cache[controllerPath];
    if (originalDatabaseModule) require.cache[databasePath] = originalDatabaseModule;
    else delete require.cache[databasePath];
});
