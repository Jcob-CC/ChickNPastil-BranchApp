const salesColumns = {
    menu_section: {
        is_archived: 'INTEGER NOT NULL DEFAULT 0',
    },
    menu_products: {
        image_url: 'TEXT',
        allow_quantity: 'INTEGER NOT NULL DEFAULT 1',
        is_archived: 'INTEGER NOT NULL DEFAULT 0',
    },
    product_addons: {
        addon_category: "TEXT DEFAULT 'extra'",
    },
    orders: {
        branch_name: "TEXT NOT NULL DEFAULT 'Balagtas'",
        order_type: "TEXT NOT NULL DEFAULT 'Dine-In'",
        other_contact: 'TEXT',
        paymongo_link_id: 'TEXT',
    },
    payments: {
        paymongo_payment_intent_id: 'TEXT',
    },
};

function getColumns(db, table) {
    return new Set(db.pragma(`table_info("${table}")`).map(column => column.name));
}

function migrate(db) {
    db.pragma('foreign_keys = ON');

    const addMissingColumns = db.transaction(() => {
        for (const [table, columns] of Object.entries(salesColumns)) {
            const existing = getColumns(db, table);
            for (const [column, definition] of Object.entries(columns)) {
                if (!existing.has(column)) {
                    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
                }
            }
        }

        const addonId = db.pragma('table_info("order_item_addons")')
            .find(column => column.name === 'addon_id');
        if (addonId && addonId.notnull) {
            db.exec(`
                CREATE TABLE order_item_addons_sales_migration (
                    order_item_addon_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_item_id INTEGER NOT NULL,
                    addon_id INTEGER,
                    addon_name TEXT NOT NULL,
                    addon_price REAL NOT NULL,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    subtotal REAL NOT NULL,
                    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE CASCADE
                );
                INSERT INTO order_item_addons_sales_migration
                    (order_item_addon_id, order_item_id, addon_id, addon_name, addon_price, quantity, subtotal)
                SELECT order_item_addon_id, order_item_id, addon_id, addon_name, addon_price, quantity, subtotal
                FROM order_item_addons;
                DROP TABLE order_item_addons;
                ALTER TABLE order_item_addons_sales_migration RENAME TO order_item_addons;
            `);
        }

        const insertAddon = db.prepare(`
            INSERT INTO product_addons (addon_name, addon_price, is_available, addon_category)
            SELECT ?, ?, 1, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM product_addons WHERE lower(addon_name) = lower(?)
            )
        `);
        for (const [name, price, category] of [
            ['Original', 0, 'flavor'],
            ['Spicy', 0, 'flavor'],
            ['Plain Rice', 0, 'rice'],
            ['Garlic Rice', 5, 'rice'],
        ]) {
            insertAddon.run(name, price, category, name);
        }
    });

    addMissingColumns();
}

module.exports = { migrate };
