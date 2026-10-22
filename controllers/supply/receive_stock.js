const db = require('../../lib/database');

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const getRequests = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT r.id, r.date_and_time, r.status, r.note, r.preparation_note,
                   r.transit_note, r.rejection_note,
                   receipt.date_and_time AS received_at, receipt.note AS receiving_note,
                   i.id AS request_item_id, g.id AS item_id, g.name AS item_name,
                   g.unit_type, i.quantity
            FROM branch_restock_request r
            LEFT JOIN branch_restock_request_item i ON i.branch_restock_request_id = r.id
            LEFT JOIN general_stock_item g ON g.id = i.general_stock_item_id
            LEFT JOIN branch_stock_received_log receipt ON receipt.branch_restock_request_id = r.id
            WHERE r.branch_location_id = ?
            ORDER BY datetime(r.date_and_time) DESC, r.id DESC
        `).all(req.session.user.branchLocationId);

        const requestsById = new Map();
        rows.forEach((row) => {
            if (!requestsById.has(row.id)) {
                requestsById.set(row.id, {
                    id: row.id,
                    dateAndTime: row.date_and_time,
                    status: row.status,
                    note: row.note,
                    preparationNote: row.preparation_note,
                    transitNote: row.transit_note,
                    rejectionNote: row.rejection_note,
                    receivedAt: row.received_at,
                    receivingNote: row.receiving_note,
                    items: [],
                });
            }
            if (row.request_item_id !== null) {
                requestsById.get(row.id).items.push({
                    requestItemId: row.request_item_id,
                    itemId: row.item_id,
                    name: row.item_name,
                    unitType: row.unit_type,
                    quantity: row.quantity,
                });
            }
        });

        res.json({
            requests: Array.from(requestsById.values()),
            branchName: req.session.user.branchLocationName,
            staffName: [req.session.user.firstName, req.session.user.lastName].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('Unable to load branch requisitions:', error);
        res.status(500).json({ message: 'Unable to load branch requisitions.' });
    }
};

const cancelRequest = (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid request ID.' });
    }

    try {
        const result = db.prepare(`
            UPDATE branch_restock_request
            SET status = 'cancelled'
            WHERE id = ? AND branch_location_id = ? AND status = 'pending'
        `).run(requestId, req.session.user.branchLocationId);
        if (result.changes === 0) {
            const request = db.prepare(`
                SELECT status FROM branch_restock_request
                WHERE id = ? AND branch_location_id = ?
            `).get(requestId, req.session.user.branchLocationId);
            if (!request) return res.status(404).json({ message: 'Request not found.' });
            return res.status(409).json({ message: 'Only pending requests can be cancelled.' });
        }
        res.json({ message: 'Request cancelled.' });
    } catch (error) {
        console.error('Unable to cancel branch requisition:', error);
        res.status(500).json({ message: 'Unable to cancel this request.' });
    }
};

const receiveDelivery = (req, res) => {
    const requestId = Number(req.params.id);
    const { items, note } = req.body || {};
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid request ID.' });
    }
    if (!Array.isArray(items) || items.length === 0 || (note !== undefined && typeof note !== 'string')) {
        return res.status(400).json({ message: 'Enter valid receiving details.' });
    }

    const receivedItems = items.map((item) => ({
        requestItemId: Number(item && item.requestItemId),
        received: getNonNegativeNumber(item && item.received),
        missing: getNonNegativeNumber(item && item.missing),
        damaged: getNonNegativeNumber(item && item.damaged),
    }));
    if (receivedItems.some((item) =>
        !Number.isSafeInteger(item.requestItemId) ||
        item.requestItemId < 1 ||
        item.received === null ||
        item.missing === null ||
        item.damaged === null
    ) || new Set(receivedItems.map((item) => item.requestItemId)).size !== receivedItems.length) {
        return res.status(400).json({ message: 'Enter valid quantities for each delivery item.' });
    }

    const saveReceipt = db.transaction(() => {
        const request = db.prepare(`
            SELECT id, status FROM branch_restock_request
            WHERE id = ? AND branch_location_id = ?
        `).get(requestId, req.session.user.branchLocationId);
        if (!request) return 'not-found';
        if (request.status !== 'in_transit') return 'not-in-transit';
        const existingReceipt = db.prepare(`
            SELECT id FROM branch_stock_received_log WHERE branch_restock_request_id = ?
        `).get(requestId);
        if (existingReceipt) return 'already-received';

        const requestItems = db.prepare(`
            SELECT i.id, i.quantity, i.general_stock_item_id, g.name AS item_name,
                   bii.id AS inventory_item_id, bii.quantity AS inventory_quantity
            FROM branch_restock_request_item i
            JOIN general_stock_item g ON g.id = i.general_stock_item_id
            LEFT JOIN branch_inventory_item bii
                ON bii.general_stock_item_id = i.general_stock_item_id
                AND bii.branch_location_id = ?
            WHERE i.branch_restock_request_id = ?
        `).all(req.session.user.branchLocationId, requestId);

        if (requestItems.length !== receivedItems.length) return 'invalid-items';
        const itemsById = new Map(requestItems.map((item) => [item.id, item]));
        for (const receivedItem of receivedItems) {
            const requestItem = itemsById.get(receivedItem.requestItemId);
            if (!requestItem || requestItem.inventory_item_id === null) return 'invalid-items';
            const total = receivedItem.received + receivedItem.missing + receivedItem.damaged;
            if (Math.abs(total - requestItem.quantity) > 0.0000001) return 'invalid-quantities';
        }

        const details = receivedItems.map((item) => {
            const requestItem = itemsById.get(item.requestItemId);
            return { ...item, requestItem };
        });
        const discrepancyNotes = details
            .filter((item) => item.missing > 0 || item.damaged > 0)
            .map((item) => {
                return `${item.requestItem.item_name}: ${item.missing + item.damaged} missing/damaged`;
            });
        const noteLines = [note && note.trim(), ...discrepancyNotes].filter(Boolean);
        const receiptResult = db.prepare(`
            INSERT INTO branch_stock_received_log (branch_restock_request_id, user_id, note)
            VALUES (?, ?, ?)
        `).run(requestId, req.session.user.id, noteLines.length ? noteLines.join('\n') : null);

        const updateInventory = db.prepare(`
            UPDATE branch_inventory_item SET quantity = ? WHERE id = ?
        `);
        const addInventoryLog = db.prepare(`
            INSERT INTO branch_inventory_manager_log
                (branch_location_id, branch_inventory_item_id, user_id, value_before, value_after, reason)
            VALUES (?, ?, ?, ?, ?, 'Delivery received')
        `);
        const addLostItem = db.prepare(`
            INSERT INTO branch_stock_received_log_lost_item
                (branch_stock_received_log_id, branch_restock_request_item_id, quantity)
            VALUES (?, ?, ?)
        `);

        details.forEach((item) => {
            const inventoryItem = item.requestItem;
            if (item.received > 0) {
                const updatedQuantity = inventoryItem.inventory_quantity + item.received;
                updateInventory.run(updatedQuantity, inventoryItem.inventory_item_id);
                addInventoryLog.run(
                    req.session.user.branchLocationId,
                    inventoryItem.inventory_item_id,
                    req.session.user.id,
                    inventoryItem.inventory_quantity,
                    updatedQuantity,
                );
            }
            const lostQuantity = item.missing + item.damaged;
            if (lostQuantity > 0) addLostItem.run(receiptResult.lastInsertRowid, item.requestItemId, lostQuantity);
        });
        db.prepare(`
            UPDATE branch_restock_request SET status = 'received' WHERE id = ?
        `).run(requestId);
        return 'saved';
    });

    try {
        const result = saveReceipt();
        if (result === 'not-found') return res.status(404).json({ message: 'Request not found.' });
        if (result === 'not-in-transit') return res.status(409).json({ message: 'Only in-transit requests can be received.' });
        if (result === 'already-received') return res.status(409).json({ message: 'This request already has a receiving record.' });
        if (result === 'invalid-items') return res.status(400).json({ message: 'The delivery items do not match this request or branch inventory.' });
        if (result === 'invalid-quantities') return res.status(400).json({ message: 'Accepted, missing, and damaged quantities must equal the requested quantity for each item.' });
        res.json({ message: 'Delivery received and branch inventory updated.' });
    } catch (error) {
        console.error('Unable to receive branch delivery:', error);
        res.status(500).json({ message: 'Unable to save this delivery receipt.' });
    }
};

module.exports = { getRequests, cancelRequest, receiveDelivery };
