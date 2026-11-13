const db = require('../../lib/database');

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const getRequestData = (req, res) => {
    try {
        const items = db.prepare(`
            SELECT gsi.id, bii.id AS branch_inventory_item_id, gsi.name, gsi.unit_type,
                   COALESCE(bii.quantity, 0) AS quantity,
                   COALESCE(bii.low_quantity_threshold, 0) AS low_quantity_threshold,
                   COALESCE(bii.restock_target_quantity, 0) AS restock_target_quantity
            FROM general_stock_item gsi
            LEFT JOIN branch_inventory_item bii
                ON bii.general_stock_item_id = gsi.id AND bii.branch_location_id = ?
            WHERE gsi.status = 'active'
            ORDER BY gsi.name COLLATE NOCASE
        `).all(req.session.user.branchLocationId);

        res.json({
            items,
            branchName: req.session.user.branchLocationName,
            staffName: [req.session.user.firstName, req.session.user.lastName].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('Unable to load requisition inventory:', error);
        res.status(500).json({ message: 'Unable to load active stock items.' });
    }
};

const createRequest = (req, res) => {
    const { items, note } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Add at least one item with a request quantity.' });
    }
    if (note !== undefined && typeof note !== 'string') {
        return res.status(400).json({ message: 'Enter a valid request note.' });
    }

    const requestItems = items.map((item) => ({
        generalStockItemId: Number(item && item.generalStockItemId),
        quantity: getNonNegativeNumber(item && item.quantity),
    }));
    if (requestItems.some((item) =>
        !Number.isSafeInteger(item.generalStockItemId) ||
        item.generalStockItemId < 1 ||
        item.quantity === null ||
        item.quantity <= 0
    )) {
        return res.status(400).json({ message: 'Enter a positive quantity for each requested item.' });
    }
    if (new Set(requestItems.map((item) => item.generalStockItemId)).size !== requestItems.length) {
        return res.status(400).json({ message: 'Each stock item can only be requested once.' });
    }

    const saveRequest = db.transaction(() => {
        const findStockItem = db.prepare(`
            SELECT id FROM general_stock_item
            WHERE id = ? AND status = 'active'
        `);
        const stockItemIds = requestItems.map((item) => {
            const stockItem = findStockItem.get(item.generalStockItemId);
            return stockItem && stockItem.id;
        });
        if (stockItemIds.some((id) => !id)) return false;

        const requestResult = db.prepare(`
            INSERT INTO branch_restock_request (branch_location_id, user_id, note)
            VALUES (?, ?, ?)
        `).run(req.session.user.branchLocationId, req.session.user.id, note && note.trim() ? note.trim() : null);
        const addRequestItem = db.prepare(`
            INSERT INTO branch_restock_request_item (branch_restock_request_id, general_stock_item_id, quantity)
            VALUES (?, ?, ?)
        `);
        requestItems.forEach((item, index) => {
            addRequestItem.run(requestResult.lastInsertRowid, stockItemIds[index], item.quantity);
        });
        db.prepare(`
            INSERT INTO branch_restock_request_status_history
                (branch_restock_request_id, status, note, date_and_time, user_id)
            SELECT id, status, note, date_and_time, user_id
            FROM branch_restock_request WHERE id = ?
        `).run(requestResult.lastInsertRowid);
        return requestResult.lastInsertRowid;
    });

    try {
        const requestId = saveRequest();
        if (!requestId) return res.status(404).json({ message: 'One or more inventory items are no longer available.' });
        res.status(201).json({ requestId, message: 'Requisition submitted.' });
    } catch (error) {
        console.error('Unable to submit requisition:', error);
        res.status(500).json({ message: 'Unable to submit this requisition.' });
    }
};

const confirmInventory = (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'There are no inventory items to update.' });
    }

    const updates = items.map((item) => ({
        generalStockItemId: Number(item && item.generalStockItemId),
        quantity: getNonNegativeNumber(item && item.quantity),
        target: getNonNegativeNumber(item && item.restockTargetQuantity),
    }));
    if (updates.some((item) =>
        !Number.isSafeInteger(item.generalStockItemId) ||
        item.generalStockItemId < 1 ||
        item.quantity === null ||
        item.target === null
    )) {
        return res.status(400).json({ message: 'Enter valid on-hand and target quantities.' });
    }
    if (new Set(updates.map((item) => item.generalStockItemId)).size !== updates.length) {
        return res.status(400).json({ message: 'Each stock item can only be updated once.' });
    }

    const saveInventory = db.transaction(() => {
        const selectItem = db.prepare(`
            SELECT gsi.id, bii.id AS branch_inventory_item_id,
                   COALESCE(bii.quantity, 0) AS quantity,
                   COALESCE(bii.low_quantity_threshold, 0) AS low_quantity_threshold
            FROM general_stock_item gsi
            LEFT JOIN branch_inventory_item bii
                ON bii.general_stock_item_id = gsi.id AND bii.branch_location_id = ?
            WHERE gsi.id = ? AND gsi.status = 'active'
        `);
        const updateItem = db.prepare(`
            UPDATE branch_inventory_item
            SET quantity = ?, restock_target_quantity = ?
            WHERE id = ? AND branch_location_id = ?
        `);
        const addItem = db.prepare(`
            INSERT INTO branch_inventory_item
                (branch_location_id, general_stock_item_id, quantity,
                 low_quantity_threshold, restock_target_quantity)
            VALUES (?, ?, ?, 0, ?)
        `);
        const addLog = db.prepare(`
            INSERT INTO branch_inventory_manager_log
                (branch_location_id, branch_inventory_item_id, user_id, value_before, value_after, reason)
            VALUES (?, ?, ?, ?, ?, 'Physical count correction')
        `);

        const currentItems = updates.map((item) =>
            selectItem.get(req.session.user.branchLocationId, item.generalStockItemId)
        );
        if (currentItems.some((current, index) =>
            !current || updates[index].target < current.low_quantity_threshold
        )) return false;

        for (const [index, item] of updates.entries()) {
            const current = currentItems[index];
            let inventoryItemId = current.branch_inventory_item_id;
            if (inventoryItemId) {
                updateItem.run(item.quantity, item.target, inventoryItemId, req.session.user.branchLocationId);
            } else {
                inventoryItemId = addItem.run(
                    req.session.user.branchLocationId,
                    item.generalStockItemId,
                    item.quantity,
                    item.target,
                ).lastInsertRowid;
            }
            if (item.quantity !== current.quantity) {
                addLog.run(
                    req.session.user.branchLocationId,
                    inventoryItemId,
                    req.session.user.id,
                    current.quantity,
                    item.quantity,
                );
            }
        }
        return true;
    });

    try {
        if (!saveInventory()) {
            return res.status(400).json({ message: 'Check that each stock item is active and targets meet the low-stock thresholds.' });
        }
        res.json({ message: 'Branch inventory confirmed.' });
    } catch (error) {
        console.error('Unable to confirm branch inventory:', error);
        res.status(500).json({ message: 'Unable to save the inventory changes.' });
    }
};

module.exports = { getRequestData, createRequest, confirmInventory };
