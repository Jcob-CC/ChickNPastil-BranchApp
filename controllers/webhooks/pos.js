const { timingSafeEqual } = require('crypto');
const db = require('../../lib/database');

const getPositiveNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
};

const isAuthorized = (authorization, secret) => {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;

    const providedSecret = Buffer.from(authorization.slice(7));
    const expectedSecret = Buffer.from(secret);
    return providedSecret.length === expectedSecret.length &&
        timingSafeEqual(providedSecret, expectedSecret);
};

const updateInventory = (req, res) => {
    const secret = process.env.POS_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(503).json({ message: 'POS webhook is not configured.' });
    }
    if (!isAuthorized(req.get('authorization'), secret)) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }

    const branchLocationId = Number(req.body && req.body.branchLocationId);
    const generalStockItemId = Number(req.body && req.body.generalStockItemId);
    const userId = Number(req.body && req.body.userId);
    const quantitySold = getPositiveNumber(req.body && req.body.quantity);

    if (!Number.isSafeInteger(branchLocationId) || branchLocationId < 1 ||
        !Number.isSafeInteger(generalStockItemId) || generalStockItemId < 1 ||
        !Number.isSafeInteger(userId) || userId < 1 ||
        quantitySold === null) {
        return res.status(400).json({
            message: 'Provide valid branchLocationId, generalStockItemId, userId, and a positive quantity sold.',
        });
    }

    try {
        const saveInventory = db.transaction(() => {
            const branch = db.prepare(`
                SELECT id FROM branch_location WHERE id = ? AND status = 'active'
            `).get(branchLocationId);
            if (!branch) return { status: 'not-found' };

            const stockItem = db.prepare(`
                SELECT id FROM general_stock_item WHERE id = ? AND status = 'active'
            `).get(generalStockItemId);
            if (!stockItem) return { status: 'not-found' };

            const user = db.prepare(`
                SELECT id FROM "user" WHERE id = ? AND status = 'active'
            `).get(userId);
            if (!user) return { status: 'not-found' };

            const inventoryItem = db.prepare(`
                SELECT id, quantity
                FROM branch_inventory_item
                WHERE branch_location_id = ? AND general_stock_item_id = ?
            `).get(branchLocationId, generalStockItemId);
            if (!inventoryItem || inventoryItem.quantity < quantitySold) {
                return { status: 'insufficient-stock' };
            }

            const quantityAfter = inventoryItem.quantity - quantitySold;
            db.prepare(`
                UPDATE branch_inventory_item SET quantity = ? WHERE id = ?
            `).run(quantityAfter, inventoryItem.id);

            db.prepare(`
                INSERT INTO branch_inventory_manager_log
                    (branch_location_id, branch_inventory_item_id, user_id,
                     value_before, value_after, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                branchLocationId,
                inventoryItem.id,
                userId,
                inventoryItem.quantity,
                quantityAfter,
                'sold menu item',
            );

            return {
                status: 'updated',
                branchInventoryItemId: inventoryItem.id,
                quantity: quantityAfter,
            };
        });
        const result = saveInventory.immediate();

        if (result.status === 'insufficient-stock') {
            return res.status(409).json({ message: 'Insufficient branch inventory for this sale.' });
        }
        if (result.status === 'not-found') {
            return res.status(404).json({ message: 'Active branch, stock item, or user not found.' });
        }

        return res.json({
            message: 'POS sale recorded and branch inventory updated.',
            branchInventoryItemId: result.branchInventoryItemId,
            quantity: result.quantity,
            branchLocationId,
            generalStockItemId,
        });
    } catch (error) {
        console.error('POS inventory webhook failed:', error);
        return res.status(500).json({ message: 'The inventory update could not be completed.' });
    }
};

module.exports = { updateInventory };
