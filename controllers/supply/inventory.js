const db = require('../../lib/database');

const pageSize = 6;
const logPageSize = 3;
const receivedLogPageSize = 6;
const stockUpdateReasons = new Set([
    'Delivery received',
    'Emergency purchase',
    'Offline sale',
    'Physical count correction',
    'Damaged or expired stock',
    'Internal use',
    'Stock transfer',
    'Customer return',
    'Other',
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
    const inventorySortOptions = {
        quantity_asc: 'bii.quantity ASC, gsi.name COLLATE NOCASE ASC',
        quantity_desc: 'bii.quantity DESC, gsi.name COLLATE NOCASE ASC',
        cost_asc: 'gsi.unit_cost ASC, gsi.name COLLATE NOCASE ASC',
        cost_desc: 'gsi.unit_cost DESC, gsi.name COLLATE NOCASE ASC',
    };
    const inventorySort = typeof req.query.inventorySort === 'string' &&
        Object.prototype.hasOwnProperty.call(inventorySortOptions, req.query.inventorySort)
        ? inventorySortOptions[req.query.inventorySort]
        : 'gsi.name COLLATE NOCASE ASC';
    const logSearch = typeof req.query.logSearch === 'string' ? req.query.logSearch.trim() : '';
    const logSort = req.query.logSort === 'asc' ? 'ASC' : 'DESC';
    const logOrder = req.query.logSort === 'item'
        ? 'gsi.name COLLATE NOCASE ASC, bil.date_and_time DESC, bil.id DESC'
        : `bil.date_and_time ${logSort}, bil.id ${logSort}`;
    const offset = (page - 1) * pageSize;
    const logOffset = (logPage - 1) * logPageSize;
    const inventorySearchPattern = `%${search}%`;
    const logSearchPattern = `%${logSearch}%`;

    try {
        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.branch_location_id = ? AND gsi.name LIKE ?
        `).get(branchId, inventorySearchPattern).count;
        const logTotal = db.prepare(`
            SELECT COUNT(*) AS count
            FROM branch_inventory_manager_log bil
            JOIN branch_inventory_item bii ON bii.id = bil.branch_inventory_item_id
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            JOIN "user" u ON u.id = bil.user_id
            WHERE bil.branch_location_id = ?
              AND (
                  gsi.name LIKE ?
                  OR trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE ?
                  OR COALESCE(bil.reason, '') LIKE ?
                  OR bil.date_and_time LIKE ?
              )
        `).get(branchId, logSearchPattern, logSearchPattern, logSearchPattern, logSearchPattern).count;
        const items = db.prepare(`
            SELECT bii.id, gsi.id AS general_stock_item_id, gsi.name, gsi.unit_type,
                   bii.quantity, bii.low_quantity_threshold, bii.restock_target_quantity, gsi.unit_cost
            FROM branch_inventory_item bii
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            WHERE bii.branch_location_id = ? AND gsi.name LIKE ?
            ORDER BY ${inventorySort}
            LIMIT ? OFFSET ?
        `).all(branchId, inventorySearchPattern, pageSize, offset);
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
            SELECT bil.date_and_time, gsi.name, gsi.unit_type, bil.value_before, bil.value_after, bil.reason,
                   trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name
            FROM branch_inventory_manager_log bil
            JOIN branch_inventory_item bii ON bii.id = bil.branch_inventory_item_id
            JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
            JOIN "user" u ON u.id = bil.user_id
            WHERE bil.branch_location_id = ?
              AND (
                  gsi.name LIKE ?
                  OR trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE ?
                  OR COALESCE(bil.reason, '') LIKE ?
                  OR bil.date_and_time LIKE ?
              )
            ORDER BY ${logOrder}
            LIMIT ? OFFSET ?
        `).all(
            branchId,
            logSearchPattern,
            logSearchPattern,
            logSearchPattern,
            logSearchPattern,
            logPageSize,
            logOffset,
        );

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

const getReceivedLogs = (req, res) => {
    const branchId = req.session.user.branchLocationId;
    const page = getPage(req.query.page);
    const offset = (page - 1) * receivedLogPageSize;

    try {
        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM branch_stock_received_log receipt
            JOIN branch_restock_request request
                ON request.id = receipt.branch_restock_request_id
            WHERE request.branch_location_id = ?
        `).get(branchId).count;
        const receipts = db.prepare(`
            SELECT receipt.id, receipt.branch_restock_request_id AS request_id,
                   receipt.date_and_time, receiver.first_name AS receiver_first_name,
                   receiver.last_name AS receiver_last_name,
                   requester.first_name AS requester_first_name,
                   requester.last_name AS requester_last_name,
                   COUNT(request_item.id) AS item_count
            FROM branch_stock_received_log receipt
            JOIN branch_restock_request request
                ON request.id = receipt.branch_restock_request_id
            JOIN "user" receiver ON receiver.id = receipt.user_id
            JOIN "user" requester ON requester.id = request.user_id
            LEFT JOIN branch_restock_request_item request_item
                ON request_item.branch_restock_request_id = request.id
            WHERE request.branch_location_id = ?
            GROUP BY receipt.id
            ORDER BY datetime(receipt.date_and_time) DESC, receipt.id DESC
            LIMIT ? OFFSET ?
        `).all(branchId, receivedLogPageSize, offset);

        res.json({
            receipts: receipts.map((receipt) => ({
                ...receipt,
                receivedBy: [receipt.receiver_first_name, receipt.receiver_last_name].filter(Boolean).join(' '),
                requestedBy: [receipt.requester_first_name, receipt.requester_last_name].filter(Boolean).join(' '),
            })),
            total,
            page,
            pageCount: Math.ceil(total / receivedLogPageSize),
        });
    } catch (error) {
        console.error('Unable to load inventory received log:', error);
        res.status(500).json({ message: 'Unable to load the received stock log.' });
    }
};

const getReceivedLogDetails = (req, res) => {
    const receiptId = Number(req.params.id);
    if (!Number.isSafeInteger(receiptId) || receiptId < 1) {
        return res.status(400).json({ message: 'Enter a valid receipt log ID.' });
    }

    try {
        const receipt = db.prepare(`
            SELECT receipt.id, receipt.branch_restock_request_id AS request_id,
                   receipt.date_and_time AS received_at, receipt.note AS receiving_note,
                   receiver.first_name AS receiver_first_name,
                   receiver.last_name AS receiver_last_name,
                   request.date_and_time AS requested_at, request.note AS request_note,
                   request.preparation_note, request.transit_note,
                   requester.first_name AS requester_first_name,
                   requester.last_name AS requester_last_name
            FROM branch_stock_received_log receipt
            JOIN branch_restock_request request
                ON request.id = receipt.branch_restock_request_id
            JOIN "user" receiver ON receiver.id = receipt.user_id
            JOIN "user" requester ON requester.id = request.user_id
            WHERE receipt.id = ? AND request.branch_location_id = ?
        `).get(receiptId, req.session.user.branchLocationId);
        if (!receipt) return res.status(404).json({ message: 'Received stock record not found.' });

        const items = db.prepare(`
            SELECT stock_item.name, stock_item.unit_type, request_item.quantity AS requested_quantity,
                   request_item.quantity - COALESCE((
                       SELECT SUM(lost.quantity)
                       FROM branch_stock_received_log_lost_item lost
                       WHERE lost.branch_stock_received_log_id = receipt.id
                         AND lost.branch_restock_request_item_id = request_item.id
                   ), 0) AS received_quantity,
                   COALESCE((
                       SELECT SUM(lost.quantity)
                       FROM branch_stock_received_log_lost_item lost
                       WHERE lost.branch_stock_received_log_id = receipt.id
                         AND lost.branch_restock_request_item_id = request_item.id
                   ), 0) AS lost_quantity
            FROM branch_restock_request_item request_item
            JOIN general_stock_item stock_item ON stock_item.id = request_item.general_stock_item_id
            JOIN branch_stock_received_log receipt
                ON receipt.branch_restock_request_id = request_item.branch_restock_request_id
            WHERE receipt.id = ?
            ORDER BY stock_item.name COLLATE NOCASE
        `).all(receiptId);

        res.json({
            receipt: {
                ...receipt,
                receivedBy: [receipt.receiver_first_name, receipt.receiver_last_name].filter(Boolean).join(' '),
                requestedBy: [receipt.requester_first_name, receipt.requester_last_name].filter(Boolean).join(' '),
            },
            items,
        });
    } catch (error) {
        console.error('Unable to load received stock details:', error);
        res.status(500).json({ message: 'Unable to load received stock details.' });
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

module.exports = {
    getInventory,
    getReceivedLogs,
    getReceivedLogDetails,
    addInventoryItem,
    updateItemSettings,
    updateStock,
};