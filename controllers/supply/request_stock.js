const db = require('../../lib/database');

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const getRequestData = (req, res) => {
    try {
        const items = db.prepare(`
            SELECT bii.id, gsi.name, gsi.unit_type, bii.quantity,
                   bii.low_quantity_threshold, bii.restock_target_quantity
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.branch_location_id = ? AND gsi.status = 'active'
            ORDER BY gsi.name COLLATE NOCASE
        `).all(req.session.user.branchLocationId);

        res.json({
            items,
            branchName: req.session.user.branchLocationName,
            staffName: [req.session.user.firstName, req.session.user.lastName].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('Unable to load requisition inventory:', error);
        res.status(500).json({ message: 'Unable to load branch inventory.' });
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
        inventoryItemId: Number(item && item.inventoryItemId),
        quantity: getNonNegativeNumber(item && item.quantity),
    }));
    if (requestItems.some((item) =>
        !Number.isSafeInteger(item.inventoryItemId) ||
        item.inventoryItemId < 1 ||
        item.quantity === null ||
        item.quantity <= 0
    )) {
        return res.status(400).json({ message: 'Enter a positive quantity for each requested item.' });
    }
    if (new Set(requestItems.map((item) => item.inventoryItemId)).size !== requestItems.length) {
        return res.status(400).json({ message: 'Each inventory item can only be requested once.' });
    }

    const saveRequest = db.transaction(() => {
        const findInventoryItem = db.prepare(`
            SELECT bii.general_stock_item_id
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.id = ? AND bii.branch_location_id = ? AND gsi.status = 'active'
        `);
        const stockItemIds = requestItems.map((item) => {
            const inventoryItem = findInventoryItem.get(item.inventoryItemId, req.session.user.branchLocationId);
            return inventoryItem && inventoryItem.general_stock_item_id;
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
        id: Number(item && item.id),
        quantity: getNonNegativeNumber(item && item.quantity),
        target: getNonNegativeNumber(item && item.restockTargetQuantity),
    }));
    if (updates.some((item) =>
        !Number.isSafeInteger(item.id) ||
        item.id < 1 ||
        item.quantity === null ||
        item.target === null
    )) {
        return res.status(400).json({ message: 'Enter valid on-hand and target quantities.' });
    }
    if (new Set(updates.map((item) => item.id)).size !== updates.length) {
        return res.status(400).json({ message: 'Each inventory item can only be updated once.' });
    }

    const saveInventory = db.transaction(() => {
        const selectItem = db.prepare(`
            SELECT quantity, low_quantity_threshold
            FROM branch_inventory_item
            WHERE id = ? AND branch_location_id = ?
        `);
        const updateItem = db.prepare(`
            UPDATE branch_inventory_item
            SET quantity = ?, restock_target_quantity = ?
            WHERE id = ?
        `);
        const addLog = db.prepare(`
            INSERT INTO branch_inventory_manager_log
                (branch_location_id, branch_inventory_item_id, user_id, value_before, value_after, reason)
            VALUES (?, ?, ?, ?, ?, 'Physical count correction')
        `);

        const currentItems = updates.map((item) =>
            selectItem.get(item.id, req.session.user.branchLocationId)
        );
        if (currentItems.some((current, index) =>
            !current || updates[index].target < current.low_quantity_threshold
        )) return false;

        for (const [index, item] of updates.entries()) {
            const current = currentItems[index];
            updateItem.run(item.quantity, item.target, item.id);
            if (item.quantity !== current.quantity) {
                addLog.run(
                    req.session.user.branchLocationId,
                    item.id,
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
            return res.status(400).json({ message: 'Check that each item is in this branch and targets meet the low-stock thresholds.' });
        }
        res.json({ message: 'Branch inventory confirmed.' });
    } catch (error) {
        console.error('Unable to confirm branch inventory:', error);
        res.status(500).json({ message: 'Unable to save the inventory changes.' });
    }
};

module.exports = { getRequestData, createRequest, confirmInventory };
