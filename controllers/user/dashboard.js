const db = require('../../lib/database');

const managerRoles = new Set(['admin', 'manager']);
const branchRoles = new Set(['supervisor', 'service-crew', 'cook', 'vendor', 'staff', 'cashier']);

const createNotification = (key, label, count, description, href) => ({
    key,
    label,
    count: Number(count) || 0,
    description,
    href,
});

const getBranchNotifications = (branchId) => {
    const branchCounts = db.prepare(`
        SELECT
            (SELECT COUNT(*)
             FROM branch_restock_request
             WHERE branch_location_id = ? AND status = 'in_transit') AS deliveries_to_receive,
            (SELECT COUNT(*)
             FROM branch_expense_request
             WHERE branch_location_id = ? AND status = 'approved') AS expenses_to_complete,
            (SELECT COUNT(*)
             FROM branch_inventory_item bii
             JOIN general_stock_item gsi ON gsi.id = bii.general_stock_item_id
             WHERE bii.branch_location_id = ?
               AND gsi.status = 'active'
               AND bii.quantity <= bii.low_quantity_threshold) AS low_stock_items
    `).get(branchId, branchId, branchId);

    return [
        createNotification(
            'deliveries-to-receive',
            'Branch deliveries to receive',
            branchCounts.deliveries_to_receive,
            'In-transit stock requests are ready for receiving.',
            '/supply/receive_stock',
        ),
        createNotification(
            'expenses-to-complete',
            'Approved expenses to complete',
            branchCounts.expenses_to_complete,
            'Complete approved requests to add their items to branch inventory.',
            '/supply/request_expenses',
        ),
        createNotification(
            'low-branch-stock',
            'Low branch stock',
            branchCounts.low_stock_items,
            'Items are at or below their branch low-stock threshold.',
            '/supply/inventory',
        ),
    ];
};

const getManagerNotifications = (branchId) => {
    const restockCounts = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END), 0) AS preparing
        FROM branch_restock_request
    `).get();
    const pendingExpenses = db.prepare(`
        SELECT COUNT(*) AS count
        FROM branch_expense_request
        WHERE status = 'pending'
    `).get().count;
    const commissaryCounts = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM commissary_stock_item
             WHERE status = 'active' AND quantity < low_stock_threshold) AS low_stock_items,
            (SELECT COUNT(*) FROM commissary_purchase_order WHERE status = 'draft') AS purchase_orders_to_approve,
            (SELECT COUNT(*) FROM commissary_purchase_order WHERE status = 'approved') AS purchase_orders_to_receive,
            (SELECT COUNT(*) FROM commissary_delivery WHERE status = 'ready') AS deliveries_to_dispatch
    `).get();

    return [
        createNotification(
            'restock-requests-to-review',
            'Restock requests to review',
            restockCounts.pending,
            'Pending branch requests need a decision.',
            '/supply/manage_request',
        ),
        createNotification(
            'restock-requests-to-dispatch',
            'Restock requests to dispatch',
            restockCounts.preparing,
            'Prepared branch requests are ready to move in transit.',
            '/supply/manage_request',
        ),
        createNotification(
            'expense-requests-to-review',
            'Expense requests to review',
            pendingExpenses,
            'Pending expense requests need approval or rejection.',
            '/supply/manage_expenses',
        ),
        ...getBranchNotifications(branchId),
        createNotification(
            'low-commissary-stock',
            'Low commissary stock',
            commissaryCounts.low_stock_items,
            'Active items are below their commissary low-stock thresholds.',
            '/commissary#inventory',
        ),
        createNotification(
            'purchase-orders-to-approve',
            'Purchase orders to approve',
            commissaryCounts.purchase_orders_to_approve,
            'Draft purchase orders are waiting for approval.',
            '/commissary#procurement',
        ),
        createNotification(
            'purchase-orders-to-receive',
            'Purchase orders to receive',
            commissaryCounts.purchase_orders_to_receive,
            'Approved purchase orders are ready for receiving.',
            '/commissary#procurement',
        ),
        createNotification(
            'commissary-deliveries-to-dispatch',
            'Commissary deliveries to dispatch',
            commissaryCounts.deliveries_to_dispatch,
            'Ready deliveries are waiting to be dispatched.',
            '/commissary#deliveries',
        ),
    ];
};

const getNotifications = (req, res) => {
    const user = req.session && req.session.user;
    if (!user) return res.sendStatus(401);

    const role = typeof user.role === 'string' ? user.role.trim().toLowerCase() : '';
    if (!managerRoles.has(role) && !branchRoles.has(role)) return res.sendStatus(403);
    if (!Number.isSafeInteger(user.branchLocationId) || user.branchLocationId < 1) {
        return res.status(400).json({ message: 'A valid branch must be selected to load notifications.' });
    }

    try {
        const notifications = managerRoles.has(role)
            ? getManagerNotifications(user.branchLocationId)
            : getBranchNotifications(user.branchLocationId);
        res.json({ notifications });
    } catch (error) {
        console.error('Unable to load dashboard notifications:', error);
        res.status(500).json({ message: 'Unable to load dashboard notifications.' });
    }
};

module.exports = { getNotifications };
