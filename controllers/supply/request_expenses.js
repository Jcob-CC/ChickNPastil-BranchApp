const db = require('../../lib/database');
const sendExpenseApprovalEmail = require('../../lib/expense_notifications');

const getPositiveNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const completeRequest = (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid expense request ID.' });
    }

    const branchLocationId = req.session.user.branchLocationId;
    const completeExpenseRequest = db.transaction(() => {
        const expenseRequest = db.prepare(`
            SELECT status
            FROM branch_expense_request
            WHERE id = ? AND branch_location_id = ?
        `).get(requestId, branchLocationId);
        if (!expenseRequest) return { outcome: 'not-found' };
        if (expenseRequest.status !== 'approved') {
            return { outcome: 'not-approved', status: expenseRequest.status };
        }

        const result = db.prepare(`
            UPDATE branch_expense_request
            SET status = 'completed'
            WHERE id = ? AND branch_location_id = ? AND status = 'approved'
        `).run(requestId, branchLocationId);
        if (result.changes === 0) {
            const currentRequest = db.prepare(`
                SELECT status
                FROM branch_expense_request
                WHERE id = ? AND branch_location_id = ?
            `).get(requestId, branchLocationId);
            return currentRequest
                ? { outcome: 'not-approved', status: currentRequest.status }
                : { outcome: 'not-found' };
        }

        const stockItems = db.prepare(`
            SELECT general_stock_item_id, SUM(quantity) AS quantity
            FROM branch_expense_item
            WHERE branch_expense_request_id = ?
            GROUP BY general_stock_item_id
        `).all(requestId);
        const findInventoryItem = db.prepare(`
            SELECT id, quantity
            FROM branch_inventory_item
            WHERE branch_location_id = ? AND general_stock_item_id = ?
        `);
        const addInventoryItem = db.prepare(`
            INSERT INTO branch_inventory_item
                (branch_location_id, general_stock_item_id, quantity)
            VALUES (?, ?, ?)
        `);
        const updateInventoryItem = db.prepare(`
            UPDATE branch_inventory_item
            SET quantity = ?
            WHERE id = ?
        `);
        const addInventoryLog = db.prepare(`
            INSERT INTO branch_inventory_manager_log
                (branch_location_id, branch_inventory_item_id, user_id, value_before, value_after, reason)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const item of stockItems) {
            const inventoryItem = findInventoryItem.get(branchLocationId, item.general_stock_item_id);
            const quantityBefore = inventoryItem ? inventoryItem.quantity : 0;
            const quantityAfter = quantityBefore + item.quantity;
            let inventoryItemId;

            if (inventoryItem) {
                inventoryItemId = inventoryItem.id;
                updateInventoryItem.run(quantityAfter, inventoryItemId);
            } else {
                const insertResult = addInventoryItem.run(
                    branchLocationId,
                    item.general_stock_item_id,
                    quantityAfter,
                );
                inventoryItemId = insertResult.lastInsertRowid;
            }

            addInventoryLog.run(
                branchLocationId,
                inventoryItemId,
                req.session.user.id,
                quantityBefore,
                quantityAfter,
                `Expense request #${requestId} completed`,
            );
        }

        return { outcome: 'completed' };
    });

    try {
        const result = completeExpenseRequest();
        if (result.outcome === 'not-found') {
            return res.status(404).json({ message: 'Expense request not found.' });
        }
        if (result.outcome === 'not-approved') {
            return res.status(409).json({
                message: `Only approved expense requests can be completed. This request is ${result.status}.`,
            });
        }
        res.json({ message: 'Expense request completed and stock items added to inventory.' });
    } catch (error) {
        console.error('Unable to complete expense request:', error);
        res.status(500).json({ message: 'Unable to complete this expense request.' });
    }
};

const getRequests = (req, res) => {
    try {
        const requests = db.prepare(`
            SELECT r.id, r.date_and_time, r.request_note, r.status, r.total_price,
                   b.location_name AS branch_name
            FROM branch_expense_request r
            JOIN branch_location b ON b.id = r.branch_location_id
            WHERE r.branch_location_id = ?
            ORDER BY r.date_and_time DESC, r.id DESC
        `).all(req.session.user.branchLocationId);
        res.json({ requests });
    } catch (error) {
        console.error('Unable to load expense requests:', error);
        res.status(500).json({ message: 'Unable to load expense requests.' });
    }
};

const getRequestDetails = (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid expense request ID.' });
    }

    try {
        const expenseRequest = db.prepare(`
            SELECT r.id, r.date_and_time, r.request_note, r.rejection_note, r.approved_note,
                   r.status, r.total_price, b.location_name AS branch_name,
                   trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name
            FROM branch_expense_request r
            JOIN "user" u ON u.id = r.user_id
            JOIN branch_location b ON b.id = r.branch_location_id
            WHERE r.id = ? AND r.branch_location_id = ?
        `).get(requestId, req.session.user.branchLocationId);
        if (!expenseRequest) {
            return res.status(404).json({ message: 'Expense request not found.' });
        }

        const items = db.prepare(`
            SELECT gsi.name AS item, gsi.unit_type, bei.quantity, bei.total_price, 0 AS is_other
            FROM branch_expense_item bei
            JOIN general_stock_item gsi ON gsi.id = bei.general_stock_item_id
            WHERE bei.branch_expense_request_id = ?
            UNION ALL
            SELECT item, unit_type, quantity, total_price, 1 AS is_other
            FROM branch_expense_other_item
            WHERE branch_expense_request_id = ?
            ORDER BY item COLLATE NOCASE
        `).all(requestId, requestId);

        res.json({ request: expenseRequest, items });
    } catch (error) {
        console.error('Unable to load expense request details:', error);
        res.status(500).json({ message: 'Unable to load expense request details.' });
    }
};

const getRequestData = (req, res) => {
    try {
        const stockItems = db.prepare(`
            SELECT id, name, unit_type, unit_cost
            FROM general_stock_item
            WHERE status = 'active'
            ORDER BY name COLLATE NOCASE
        `).all();

        res.json({
            stockItems,
            branchName: req.session.user.branchLocationName,
            staffName: [req.session.user.firstName, req.session.user.lastName].filter(Boolean).join(' '),
        });
    } catch (error) {
        console.error('Unable to load expense catalog:', error);
        res.status(500).json({ message: 'Unable to load the stock catalog.' });
    }
};

const createRequest = (req, res) => {
    const { stockItems, otherItems, requestNote } = req.body || {};
    if (!Array.isArray(stockItems) || !Array.isArray(otherItems) ||
        (stockItems.length === 0 && otherItems.length === 0)) {
        return res.status(400).json({ message: 'Add at least one expense item.' });
    }
    if (requestNote !== undefined && typeof requestNote !== 'string') {
        return res.status(400).json({ message: 'Enter a valid request note.' });
    }

    const requestedStockItems = stockItems.map((item) => ({
        id: Number(item && item.generalStockItemId),
        quantity: getPositiveNumber(item && item.quantity),
        totalPrice: getPositiveNumber(item && item.totalPrice),
    }));
    const requestedOtherItems = otherItems.map((item) => ({
        name: typeof (item && item.item) === 'string' ? item.item.trim() : '',
        unitType: typeof (item && item.unitType) === 'string' ? item.unitType.trim() : '',
        quantity: getPositiveNumber(item && item.quantity),
        totalPrice: getPositiveNumber(item && item.totalPrice),
    }));

    if (requestedStockItems.some((item) =>
        !Number.isSafeInteger(item.id) || item.id < 1 ||
        item.quantity === null || item.totalPrice === null
    )) {
        return res.status(400).json({ message: 'Enter a valid stock item, quantity, and total price for each item.' });
    }
    if (new Set(requestedStockItems.map((item) => item.id)).size !== requestedStockItems.length) {
        return res.status(400).json({ message: 'Each stock item can only be added once.' });
    }
    if (requestedOtherItems.some((item) =>
        !item.name || item.name.length > 120 ||
        !item.unitType || item.unitType.length > 40 ||
        item.quantity === null || item.totalPrice === null
    )) {
        return res.status(400).json({ message: 'Enter a valid name, unit, quantity, and total price for each other expense.' });
    }

    const saveRequest = db.transaction(() => {
        const getStockItem = db.prepare(`
            SELECT id
            FROM general_stock_item
            WHERE id = ? AND status = 'active'
        `);
        const catalogItems = requestedStockItems.map((item) => getStockItem.get(item.id));
        if (catalogItems.some((item) => !item)) return null;

        const pricedStockItems = requestedStockItems.map((item) => ({
            ...item,
            totalPrice: roundMoney(item.totalPrice),
        }));
        const totalPrice = roundMoney(
            pricedStockItems.reduce((total, item) => total + item.totalPrice, 0) +
            requestedOtherItems.reduce((total, item) => total + item.totalPrice, 0),
        );
        const autoApprovalSetting = db.prepare(`
            SELECT max_total_price
            FROM expense_auto_approval_setting
            WHERE id = 1
        `).get();
        if (!autoApprovalSetting) {
            throw new Error('Automatic expense approval setting is unavailable.');
        }
        const autoApproved = autoApprovalSetting.max_total_price > 0 &&
            totalPrice <= autoApprovalSetting.max_total_price;
        const requestResult = db.prepare(`
            INSERT INTO branch_expense_request
                (user_id, branch_location_id, request_note, total_price, status, approved_note)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            req.session.user.id,
            req.session.user.branchLocationId,
            requestNote && requestNote.trim() ? requestNote.trim() : null,
            totalPrice,
            autoApproved ? 'approved' : 'pending',
            autoApproved ? 'Automatically approved under the configured price limit.' : null,
        );

        const addStockItem = db.prepare(`
            INSERT INTO branch_expense_item
                (branch_expense_request_id, general_stock_item_id, quantity, total_price)
            VALUES (?, ?, ?, ?)
        `);
        pricedStockItems.forEach((item) => {
            addStockItem.run(requestResult.lastInsertRowid, item.id, item.quantity, item.totalPrice);
        });

        const addOtherItem = db.prepare(`
            INSERT INTO branch_expense_other_item
                (branch_expense_request_id, item, unit_type, quantity, total_price)
            VALUES (?, ?, ?, ?, ?)
        `);
        requestedOtherItems.forEach((item) => {
            addOtherItem.run(
                requestResult.lastInsertRowid,
                item.name,
                item.unitType,
                item.quantity,
                roundMoney(item.totalPrice),
            );
        });

        return { requestId: requestResult.lastInsertRowid, totalPrice, status: autoApproved ? 'approved' : 'pending' };
    });

    try {
        const result = saveRequest();
        if (!result) {
            return res.status(404).json({ message: 'One or more stock catalog items are no longer available.' });
        }
        if (result.status === 'approved') {
            sendExpenseApprovalEmail({
                to: req.session.user.email,
                requestId: result.requestId,
                branchName: req.session.user.branchLocationName,
                totalPrice: result.totalPrice,
                approvedNote: 'Automatically approved under the configured price limit.',
            }).catch((error) => {
                console.error('Unable to send expense approval email:', error);
            });
        }
        res.status(201).json({
            ...result,
            message: result.status === 'approved'
                ? 'Expense request submitted and automatically approved.'
                : 'Expense request submitted for review.',
        });
    } catch (error) {
        console.error('Unable to submit expense request:', error);
        res.status(500).json({ message: 'Unable to submit this expense request.' });
    }
};

module.exports = {
    getRequests,
    getRequestDetails,
    getRequestData,
    createRequest,
    completeRequest,
};
