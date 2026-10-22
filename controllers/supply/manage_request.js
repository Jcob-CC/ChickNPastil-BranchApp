const db = require('../../lib/database');

const getRequests = (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT r.id, r.date_and_time, r.status, r.note, r.rejection_note,
                   r.preparation_note, r.transit_note,
                   b.location_name AS branch_name, b.address AS branch_address,
                   u.first_name, u.last_name,
                   receipt.id AS receipt_id, receipt.date_and_time AS received_at,
                   receipt.note AS receiving_note,
                   receiver.first_name AS receiver_first_name,
                   receiver.last_name AS receiver_last_name,
                   g.id AS item_id, g.name AS item_name, g.unit_type, i.quantity,
                   COALESCE((
                       SELECT SUM(lost.quantity)
                       FROM branch_stock_received_log_lost_item lost
                       WHERE lost.branch_stock_received_log_id = receipt.id
                           AND lost.branch_restock_request_item_id = i.id
                   ), 0) AS lost_quantity
            FROM branch_restock_request r
            JOIN branch_location b ON b.id = r.branch_location_id
            JOIN "user" u ON u.id = r.user_id
            LEFT JOIN branch_restock_request_item i ON i.branch_restock_request_id = r.id
            LEFT JOIN general_stock_item g ON g.id = i.general_stock_item_id
            LEFT JOIN branch_stock_received_log receipt ON receipt.branch_restock_request_id = r.id
            LEFT JOIN "user" receiver ON receiver.id = receipt.user_id
            ORDER BY datetime(r.date_and_time) DESC, r.id DESC
        `).all();

        const requestsById = new Map();
        rows.forEach((row) => {
            if (!requestsById.has(row.id)) {
                requestsById.set(row.id, {
                    id: row.id,
                    dateAndTime: row.date_and_time,
                    status: row.status,
                    note: row.note,
                    rejectionNote: row.rejection_note,
                    preparationNote: row.preparation_note,
                    transitNote: row.transit_note,
                    branchName: row.branch_name,
                    branchAddress: row.branch_address,
                    requesterName: [row.first_name, row.last_name].filter(Boolean).join(' '),
                    receipt: row.receipt_id ? {
                        id: row.receipt_id,
                        dateAndTime: row.received_at,
                        note: row.receiving_note,
                        receivedBy: [row.receiver_first_name, row.receiver_last_name].filter(Boolean).join(' '),
                    } : null,
                    items: [],
                });
            }

            if (row.item_name !== null) {
                requestsById.get(row.id).items.push({
                    itemId: row.item_id,
                    name: row.item_name,
                    unitType: row.unit_type,
                    quantity: row.quantity,
                    receivedQuantity: row.quantity - row.lost_quantity,
                    lostQuantity: row.lost_quantity,
                });
            }
        });

        const requests = Array.from(requestsById.values());
        const consolidatedItems = new Map();
        requests.filter((request) => request.status === 'preparing').forEach((request) => {
            const requestItemIds = new Set();
            request.items.forEach((item) => {
                const consolidated = consolidatedItems.get(item.itemId) || {
                    name: item.name,
                    unitType: item.unitType,
                    quantity: 0,
                    requestCount: 0,
                };
                consolidated.quantity += item.quantity;
                if (!requestItemIds.has(item.itemId)) {
                    consolidated.requestCount += 1;
                    requestItemIds.add(item.itemId);
                }
                consolidatedItems.set(item.itemId, consolidated);
            });
        });

        res.json({
            requests,
            consolidatedItems: Array.from(consolidatedItems.values())
                .sort((left, right) => left.name.localeCompare(right.name)),
        });
    } catch (error) {
        console.error('Unable to load fulfillment requests:', error);
        res.status(500).json({ message: 'Unable to load fulfillment requests.' });
    }
};

const updateStatus = (req, res) => {
    const requestId = Number(req.params.id);
    const { status, note } = req.body || {};
    const statusNoteColumns = {
        pending: null,
        preparing: 'preparation_note',
        in_transit: 'transit_note',
        rejected: 'rejection_note',
        received: null,
    };

    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: 'Enter a valid request ID.' });
    }
    if (!Object.prototype.hasOwnProperty.call(statusNoteColumns, status)) {
        return res.status(400).json({ message: 'Choose a valid request status.' });
    }
    if (note !== undefined && typeof note !== 'string') {
        return res.status(400).json({ message: 'Enter a valid status note.' });
    }

    try {
        const request = db.prepare(`
            SELECT status FROM branch_restock_request WHERE id = ?
        `).get(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found.' });
        if (request.status === 'cancelled') {
            return res.status(409).json({ message: 'Cancelled requests cannot be changed.' });
        }

        const noteColumn = statusNoteColumns[status];
        const updateRequest = noteColumn
            ? db.prepare(`
                UPDATE branch_restock_request
                SET status = ?, ${noteColumn} = ?
                WHERE id = ? AND status = ?
            `)
            : db.prepare(`
                UPDATE branch_restock_request
                SET status = ?
                WHERE id = ? AND status = ?
            `);
        const result = noteColumn
            ? updateRequest.run(status, typeof note === 'string' && note.trim() ? note.trim() : null, requestId, request.status)
            : updateRequest.run(status, requestId, request.status);

        if (result.changes === 0) {
            return res.status(409).json({ message: 'This request has already changed status. Refresh and try again.' });
        }

        res.json({ message: 'Request status updated.' });
    } catch (error) {
        console.error('Unable to update fulfillment request:', error);
        res.status(500).json({ message: 'Unable to update this request.' });
    }
};

module.exports = { getRequests, updateStatus };
