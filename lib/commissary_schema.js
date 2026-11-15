function migrate(db) {
    db.pragma('foreign_keys = ON');
    db.exec(`
        CREATE TABLE IF NOT EXISTS commissary_stock_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('raw_material', 'finished_good')),
            category TEXT,
            unit TEXT NOT NULL,
            barcode TEXT UNIQUE,
            quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
            low_stock_threshold REAL NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
            unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS commissary_recipe (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            output_stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            yield_quantity REAL NOT NULL CHECK (yield_quantity > 0),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS commissary_recipe_ingredient (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id INTEGER NOT NULL REFERENCES commissary_recipe(id) ON DELETE CASCADE,
            stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            quantity REAL NOT NULL CHECK (quantity > 0),
            UNIQUE (recipe_id, stock_item_id)
        );

        CREATE TABLE IF NOT EXISTS commissary_batch (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id INTEGER NOT NULL REFERENCES commissary_recipe(id),
            target_yield REAL NOT NULL CHECK (target_yield > 0),
            status TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'in_progress', 'completed')),
            created_by INTEGER NOT NULL REFERENCES "user"(id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME,
            completed_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS commissary_supplier (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS commissary_purchase_order (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER NOT NULL REFERENCES commissary_supplier(id),
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'approved', 'received')),
            created_by INTEGER NOT NULL REFERENCES "user"(id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            approved_by INTEGER REFERENCES "user"(id),
            approved_at DATETIME,
            received_by INTEGER REFERENCES "user"(id),
            received_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS commissary_purchase_order_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_order_id INTEGER NOT NULL REFERENCES commissary_purchase_order(id) ON DELETE CASCADE,
            stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            quantity REAL NOT NULL CHECK (quantity > 0),
            unit_cost REAL NOT NULL CHECK (unit_cost >= 0)
        );

        CREATE TABLE IF NOT EXISTS commissary_delivery (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_location_id INTEGER NOT NULL REFERENCES branch_location(id),
            status TEXT NOT NULL DEFAULT 'ready'
                CHECK (status IN ('ready', 'in_transit')),
            created_by INTEGER NOT NULL REFERENCES "user"(id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            dispatched_by INTEGER REFERENCES "user"(id),
            dispatched_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS commissary_delivery_item (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            delivery_id INTEGER NOT NULL REFERENCES commissary_delivery(id) ON DELETE CASCADE,
            stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            quantity REAL NOT NULL CHECK (quantity > 0)
        );

        CREATE TABLE IF NOT EXISTS commissary_wastage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            quantity REAL NOT NULL CHECK (quantity > 0),
            reason TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES "user"(id),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS commissary_stock_movement (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_item_id INTEGER NOT NULL REFERENCES commissary_stock_item(id),
            user_id INTEGER NOT NULL REFERENCES "user"(id),
            quantity_change REAL NOT NULL CHECK (quantity_change != 0),
            reason TEXT NOT NULL,
            reference_type TEXT,
            reference_id INTEGER,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_commissary_stock_item_status_name
            ON commissary_stock_item (status, name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_commissary_movements_item_date
            ON commissary_stock_movement (stock_item_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_commissary_batch_status_date
            ON commissary_batch (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_commissary_delivery_status_date
            ON commissary_delivery (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_commissary_purchase_order_status_date
            ON commissary_purchase_order (status, created_at DESC);
    `);
}

module.exports = { migrate };
