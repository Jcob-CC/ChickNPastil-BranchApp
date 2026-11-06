const { timingSafeEqual } = require('crypto');
const db = require('../../lib/database');

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
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
    const quantity = getNonNegativeNumber(req.body && req.body.quantity);

    if (!Number.isSafeInteger(branchLocationId) || branchLocationId < 1 ||
        !Number.isSafeInteger(generalStockItemId) || generalStockItemId < 1 ||
        quantity === null) {
        return res.status(400).json({
            message: 'Provide valid branchLocationId, generalStockItemId, and non-negative quantity values.',
        });
    }

    try {
        const saveInventory = db.transaction(() => {
            const branch = db.prepare(`
                SELECT id FROM branch_location WHERE id = ? AND status = 'active'
            `).get(branchLocationId);
            if (!branch) return null;

            const stockItem = db.prepare(`
                SELECT id FROM general_stock_item WHERE id = ? AND status = 'active'
            `).get(generalStockItemId);
            if (!stockItem) return null;

            db.prepare(`
                INSERT INTO branch_inventory_item
                    (branch_location_id, general_stock_item_id, quantity)
                VALUES (?, ?, ?)
                ON CONFLICT (branch_location_id, general_stock_item_id)
                DO UPDATE SET quantity = excluded.quantity
            `).run(branchLocationId, generalStockItemId, quantity);

            return db.prepare(`
                SELECT id AS branchInventoryItemId, quantity
                FROM branch_inventory_item
                WHERE branch_location_id = ? AND general_stock_item_id = ?
            `).get(branchLocationId, generalStockItemId);
        });
        const inventoryItem = saveInventory();

        if (!inventoryItem) {
            return res.status(404).json({ message: 'Active branch or stock item not found.' });
        }

        return res.json({
            message: 'Branch inventory quantity updated.',
            ...inventoryItem,
            branchLocationId,
            generalStockItemId,
        });
    } catch (error) {
        console.error('POS inventory webhook failed:', error);
        return res.status(500).json({ message: 'The inventory update could not be completed.' });
    }
};

module.exports = { updateInventory };
