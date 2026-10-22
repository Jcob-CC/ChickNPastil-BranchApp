const db = require('../../lib/database');

const pageSize = 6;
const logPageSize = 3;
const stockUpdateReasons = new Set([
    'Delivery received',
    'Physical count correction',
    'Damaged or expired stock',
    'Internal use',
]);

const getPage = (value) => {
    const page = Number(value);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const sendDatabaseError = (res, error) => {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ message: 'This item is already in the branch inventory.' });
    }

    console.error('Inventory database operation failed:', error);
    return res.status(500).json({ message: 'The inventory request could not be completed.' });
};

const getInventory = (req, res) => {
    const branchId = req.session.user.branchLocationId;
    const page = getPage(req.query.page);
    const logPage = getPage(req.query.logPage);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const offset = (page - 1) * pageSize;
    const logOffset = (logPage - 1) * logPageSize;

    try {
        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.branch_location_id = ? AND gsi.name LIKE ?
        `).get(branchId, `%${search}%`).count;
        const logTotal = db.prepare(`
            SELECT COUNT(*) AS count
            FROM branch_inventory_manager_log
            WHERE branch_location_id = ?
        `).get(branchId).count;
        const items = db.prepare(`
            SELECT bii.id, gsi.id AS general_stock_item_id, gsi.name, gsi.unit_type,
                   bii.quantity, bii.low_quantity_threshold, bii.restock_target_quantity, gsi.unit_cost
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.branch_location_id = ? AND gsi.name LIKE ?
            ORDER BY gsi.name COLLATE NOCASE
            LIMIT ? OFFSET ?
        `).all(branchId, `%${search}%`, pageSize, offset);
        const availableItems = db.prepare(`
            SELECT gsi.id, gsi.name, gsi.unit_type
            FROM general_stock_item gsi
            WHERE gsi.status = 'active'
              AND NOT EXISTS (
                  SELECT 1 FROM branch_inventory_item bii
                  WHERE bii.branch_location_id = ? AND bii.general_stock_item_id = gsi.id
              )
            ORDER BY gsi.name COLLATE NOCASE
        `).all(branchId);
        const logs = db.prepare(`
            SELECT bil.date_and_time, gsi.name, gsi.unit_type, bil.value_before, bil.value_after, bil.reason
            FROM branch_inventory_manager_log bil
            JOIN branch_inventory_item bii ON bii.id = bil.branch_inventory_item_id
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bil.branch_location_id = ?
            ORDER BY bil.date_and_time DESC, bil.id DESC
            LIMIT ? OFFSET ?
        `).all(branchId, logPageSize, logOffset);

        res.json({
            items,
            total,
            page,
            pageCount: Math.ceil(total / pageSize),
            availableItems,
            logs,
            logTotal,
            logPage,
            logPageCount: Math.ceil(logTotal / logPageSize),
        });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const addInventoryItem = (req, res) => {
    const { generalStockItemId, quantity, lowQuantityThreshold, restockTargetQuantity } = req.body || {};
    const stockItemId = Number(generalStockItemId);
    const normalizedQuantity = getNonNegativeNumber(quantity);
    const threshold = getNonNegativeNumber(lowQuantityThreshold);
    const target = getNonNegativeNumber(restockTargetQuantity);

    if (!Number.isSafeInteger(stockItemId) || stockItemId < 1) {
        return res.status(400).json({ message: 'Choose a valid general stock item.' });
    }
    if (normalizedQuantity === null || threshold === null || target === null || target < threshold) {
        return res.status(400).json({ message: 'Enter valid quantities and a restock target at or above the low-stock threshold.' });
    }

    try {
        const result = db.prepare(`
            INSERT INTO branch_inventory_item
                (branch_location_id, general_stock_item_id, quantity, low_quantity_threshold, restock_target_quantity)
            SELECT ?, id, ?, ?, ?
            FROM general_stock_item
            WHERE id = ? AND status = 'active'
        `).run(req.session.user.branchLocationId, normalizedQuantity, threshold, target, stockItemId);

        if (result.changes === 0) return res.status(404).json({ message: 'Active stock item not found.' });
        res.status(201).json({ message: 'Item added to branch inventory.' });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const updateItemSettings = (req, res) => {
    const id = Number(req.params.id);
    const threshold = getNonNegativeNumber(req.body && req.body.lowQuantityThreshold);
    const target = getNonNegativeNumber(req.body && req.body.restockTargetQuantity);

    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid inventory item ID.' });
    if (threshold === null || target === null || target < threshold) {
        return res.status(400).json({ message: 'Enter valid quantities and a restock target at or above the low-stock threshold.' });
    }

    try {
        const result = db.prepare(`
            UPDATE branch_inventory_item
            SET low_quantity_threshold = ?, restock_target_quantity = ?
            WHERE id = ? AND branch_location_id = ?
        `).run(threshold, target, id, req.session.user.branchLocationId);
        if (result.changes === 0) return res.status(404).json({ message: 'Inventory item not found.' });
        res.json({ message: 'Branch settings saved.' });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const updateStock = (req, res) => {
    const id = Number(req.params.id);
    const quantity = getNonNegativeNumber(req.body && req.body.quantity);
    const reason = req.body && req.body.reason;

    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid inventory item ID.' });
    if (quantity === null || !stockUpdateReasons.has(reason)) {
        return res.status(400).json({ message: 'Enter a valid quantity and reason for the update.' });
    }

    const updateInventory = db.transaction(() => {
        const item = db.prepare(`
            SELECT quantity FROM branch_inventory_item
            WHERE id = ? AND branch_location_id = ?
        `).get(id, req.session.user.branchLocationId);
        if (!item) return false;

        db.prepare(`
            UPDATE branch_inventory_item SET quantity = ? WHERE id = ?
        `).run(quantity, id);
        db.prepare(`
            INSERT INTO branch_inventory_manager_log
                (branch_location_id, branch_inventory_item_id, user_id, value_before, value_after, reason)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.session.user.branchLocationId, id, req.session.user.id, item.quantity, quantity, reason);
        return true;
    });

    try {
        if (!updateInventory()) return res.status(404).json({ message: 'Inventory item not found.' });
        res.json({ message: 'Stock quantity updated.' });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

module.exports = { getInventory, addInventoryItem, updateItemSettings, updateStock };