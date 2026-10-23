const db = require('../../lib/database');

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getAutoApprovalSetting = (req, res) => {
    try {
        const setting = db.prepare(`
            SELECT max_total_price AS maxAutoApprovePrice
            FROM expense_auto_approval_setting
            WHERE id = 1
        `).get();
        if (!setting) {
            return res.status(500).json({ message: 'Automatic approval setting is unavailable.' });
        }
        res.json(setting);
    } catch (error) {
        console.error('Unable to load automatic expense approval setting:', error);
        res.status(500).json({ message: 'Unable to load the automatic approval setting.' });
    }
};

const updateAutoApprovalSetting = (req, res) => {
    const { maxAutoApprovePrice } = req.body || {};
    if (typeof maxAutoApprovePrice !== 'number' ||
        !Number.isFinite(maxAutoApprovePrice) ||
        maxAutoApprovePrice < 0 ||
        !Number.isSafeInteger(Math.round(maxAutoApprovePrice * 100))) {
        return res.status(400).json({ message: 'Enter a valid non-negative maximum request total.' });
    }

    try {
        const roundedLimit = roundMoney(maxAutoApprovePrice);
        db.prepare(`
            INSERT INTO expense_auto_approval_setting (id, max_total_price)
            VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET max_total_price = excluded.max_total_price
        `).run(roundedLimit);
        res.json({
            maxAutoApprovePrice: roundedLimit,
            message: roundedLimit > 0
                ? `Requests totaling ${roundedLimit.toFixed(2)} PHP or less will be auto-approved.`
                : 'Automatic approval is disabled.',
        });
    } catch (error) {
        console.error('Unable to update automatic expense approval setting:', error);
        res.status(500).json({ message: 'Unable to update the automatic approval setting.' });
    }
};

const getAllRequests = (req, res) => {
    try {
        const requests = db.prepare(`
            SELECT r.id, r.date_and_time, r.request_note, r.status, r.total_price,
                   b.location_name AS branch_name,
                   trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name,
                   (SELECT COUNT(*) FROM branch_expense_item bei
                    WHERE bei.branch_expense_request_id = r.id) +
                   (SELECT COUNT(*) FROM branch_expense_other_item beo
                    WHERE beo.branch_expense_request_id = r.id) AS item_count,
                   (SELECT group_concat(expense_items.item, ' ')
                    FROM (
                        SELECT gsi.name AS item
                        FROM branch_expense_item bei
                        JOIN general_stock_item gsi ON gsi.id = bei.general_stock_item_id
                        WHERE bei.branch_expense_request_id = r.id
                        UNION ALL
                        SELECT item
                        FROM branch_expense_other_item
                        WHERE branch_expense_request_id = r.id
                    ) expense_items) AS item_names
            FROM branch_expense_request r
            JOIN branch_location b ON b.id = r.branch_location_id
            JOIN "user" u ON u.id = r.user_id
            ORDER BY datetime(r.date_and_time) DESC, r.id DESC
        `).all();
        res.json({ requests });
    } catch (error) {
        console.error('Unable to load expense requests for review:', error);
        res.status(500).json({ message: 'Unable to load expense requests.' });
    }
};

const getManagedRequestDetails = (req, res) => {
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
            WHERE r.id = ?
        `).get(requestId);
        if (!expenseRequest) {
            return res.status(404).json({ message: 'Expense request not found.' });
        }

        const items = db.prepare(`
            SELECT gsi.name AS item, gsi.unit_type, bei.quantity, bei.total_price
            FROM branch_expense_item bei
            JOIN general_stock_item gsi ON gsi.id = bei.general_stock_item_id
            WHERE bei.branch_expense_request_id = ?
            UNION ALL
            SELECT item, unit_type, quantity, total_price
            FROM branch_expense_other_item
            WHERE branch_expense_request_id = ?
            ORDER BY item COLLATE NOCASE
        `).all(requestId, requestId);
        res.json({ request: expenseRequest, items });
    } catch (error) {
        console.error('Unable to load expense request for review:', error);
        res.status(500).json({ message: 'Unable to load expense request details.' });
    }
};

const updateManagedRequestStatus = (req, res) => {
    const requestId = Number(req.params.id);
    const { status, note } = req.body || {};
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid expense request ID.' });
    }
    if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ message: 'Choose approve or reject for this request.' });
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 1000)) {
        return res.status(400).json({ message: 'Enter a valid review note.' });
    }

    try {
        const noteColumn = status === 'approved' ? 'approved_note' : 'rejection_note';
        const result = db.prepare(`
            UPDATE branch_expense_request
            SET status = ?, ${noteColumn} = ?
            WHERE id = ? AND status = 'pending'
        `).run(status, typeof note === 'string' && note.trim() ? note.trim() : null, requestId);
        if (result.changes === 0) {
            const request = db.prepare('SELECT id FROM branch_expense_request WHERE id = ?').get(requestId);
            if (!request) return res.status(404).json({ message: 'Expense request not found.' });
            return res.status(409).json({ message: 'This request has already been reviewed. Refresh and try again.' });
        }
        res.json({ message: `Expense request ${status}.` });
    } catch (error) {
        console.error('Unable to update expense request status:', error);
        res.status(500).json({ message: 'Unable to update expense request status.' });
    }
};

module.exports = {
    getAllRequests,
    getAutoApprovalSetting,
    updateAutoApprovalSetting,
    getManagedRequestDetails,
    updateManagedRequestStatus,
};
