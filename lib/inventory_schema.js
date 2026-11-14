function migrate(db) {
    db.pragma('foreign_keys = ON');
    const columns = new Set(db.pragma('table_info("branch_inventory_item")').map((column) => column.name));
    if (!columns.has('auto_restock_target')) {
        db.exec(`
            ALTER TABLE branch_inventory_item
            ADD COLUMN auto_restock_target INTEGER NOT NULL DEFAULT 0
                CHECK (auto_restock_target IN (0, 1))
        `);
    }
}

module.exports = { migrate };
