const { timingSafeEqual } = require('crypto');
const db = require('../../lib/database');
const { getMappedInventoryUsage } = require('../../lib/menu_inventory_mappings');

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

function resolveMenuProduct(rawItem) {
    const productId = Number(rawItem?.menuItemId ?? rawItem?.productId ?? rawItem?.product_id);
    if (Number.isSafeInteger(productId) && productId > 0) {
        const product = db.prepare(`
            SELECT product_id, product_name
            FROM menu_products
            WHERE product_id = ? AND is_available = 1 AND COALESCE(is_archived, 0) = 0
        `).get(productId);
        if (product) return product;
    }

    const itemName = typeof rawItem?.menuItemName === 'string'
        ? rawItem.menuItemName.trim()
        : (typeof rawItem?.itemName === 'string' ? rawItem.itemName.trim()
            : (typeof rawItem?.name === 'string' ? rawItem.name.trim() : ''));
    if (!itemName) return null;

    return db.prepare(`
        SELECT product_id, product_name
        FROM menu_products
        WHERE lower(trim(product_name)) = lower(trim(?))
          AND is_available = 1
          AND COALESCE(is_archived, 0) = 0
        LIMIT 1
    `).get(itemName);
}

function normalizeAddonNames(rawItem) {
    if (!Array.isArray(rawItem?.addons)) return [];
    return rawItem.addons.map((addon) => {
        if (typeof addon === 'string') return { name: addon.trim(), quantity: 1 };
        if (addon && typeof addon.addon_name === 'string') {
            return {
                addon_id: addon.addon_id ?? addon.addonId ?? null,
                name: addon.addon_name.trim(),
                quantity: getPositiveNumber(addon.quantity ?? 1),
            };
        }
        if (addon && typeof addon.name === 'string') {
            return {
                addon_id: addon.addon_id ?? addon.addonId ?? null,
                name: addon.name.trim(),
                quantity: getPositiveNumber(addon.quantity ?? 1),
            };
        }
        return null;
    }).filter((addon) => addon && addon.name);
}

function resolveAddonId(addon) {
    const addonId = Number(addon.addon_id);
    if (Number.isSafeInteger(addonId) && addonId > 0) return addonId;
    const addonName = addon.name.replace(/^Flavor:\s*/i, '').trim();
    if (!addonName) return null;
    const found = db.prepare(`
        SELECT addon_id FROM product_addons
        WHERE lower(trim(addon_name)) = lower(trim(?))
          AND is_available = 1
          AND COALESCE(is_archived, 0) = 0
        LIMIT 1
    `).get(addonName);
    return found ? found.addon_id : null;
}

const updateInventory = (req, res) => {
    const secret = process.env.POS_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(503).json({ message: 'POS webhook is not configured.' });
    }
    if (!isAuthorized(req.get('authorization'), secret)) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }

    const branchLocationId = Number(req.body && req.body.branchLocationId);
    const userId = Number(req.body && req.body.userId);
    if (!Number.isSafeInteger(branchLocationId) || branchLocationId < 1 ||
        !Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({
            message: 'Provide valid branchLocationId and userId.',
        });
    }

    const legacyStockItemId = Number(req.body && req.body.generalStockItemId);
    const legacyQuantity = getPositiveNumber(req.body && req.body.quantity);
    let soldItems = Array.isArray(req.body?.items) ? req.body.items : null;

    if (!soldItems) {
        if (Number.isSafeInteger(legacyStockItemId) && legacyStockItemId > 0 && legacyQuantity !== null) {
            soldItems = [{
                generalStockItemId: legacyStockItemId,
                quantity: legacyQuantity,
            }];
        } else {
            soldItems = [req.body];
        }
    }

    try {
        const saveInventory = db.transaction(() => {
            const branch = db.prepare(`
                SELECT id FROM branch_location WHERE id = ? AND status = 'active'
            `).get(branchLocationId);
            if (!branch) return { status: 'not-found', target: 'branch' };

            const user = db.prepare(`
                SELECT id FROM "user" WHERE id = ? AND status = 'active'
            `).get(userId);
            if (!user) return { status: 'not-found', target: 'user' };

            const usageByStockItem = new Map();
            const menuItems = [];

            for (const soldItem of soldItems) {
                if (!soldItem || typeof soldItem !== 'object') {
                    return { status: 'invalid-payload' };
                }

                const directStockItemId = Number(soldItem.generalStockItemId ?? soldItem.stockItemId);
                if (Number.isSafeInteger(directStockItemId) && directStockItemId > 0) {
                    const quantity = getPositiveNumber(soldItem.quantity);
                    if (quantity === null) return { status: 'invalid-payload' };
                    const stockItem = db.prepare(`
                        SELECT id, name, unit_type
                        FROM general_stock_item
                        WHERE id = ? AND status = 'active'
                    `).get(directStockItemId);
                    if (!stockItem) return { status: 'not-found', target: 'stock item' };
                    const usage = usageByStockItem.get(stockItem.id) || { stockItem, quantity: 0 };
                    usage.quantity += quantity;
                    usageByStockItem.set(stockItem.id, usage);
                    continue;
                }

                const product = resolveMenuProduct(soldItem);
                if (!product) return { status: 'invalid-menu-item' };
                const quantitySold = getPositiveNumber(soldItem.quantity ?? 1);
                if (quantitySold === null) return { status: 'invalid-quantity' };
                const addons = normalizeAddonNames(soldItem);
                if (addons.some((addon) => addon.quantity === null)) {
                    return { status: 'invalid-payload' };
                }
                for (const addon of addons) {
                    addon.addon_id = resolveAddonId(addon);
                }

                menuItems.push({
                    name: product.product_name,
                    quantity: quantitySold,
                });

                for (const mapped of getMappedInventoryUsage(db, product.product_id, quantitySold, addons)) {
                    const usage = usageByStockItem.get(mapped.stockItem.id) || {
                        stockItem: mapped.stockItem,
                        quantity: 0,
                    };
                    usage.quantity += mapped.quantity;
                    usageByStockItem.set(mapped.stockItem.id, usage);
                }
            }

            if (usageByStockItem.size === 0 && menuItems.length === 0) {
                return { status: 'invalid-payload' };
            }

            const reductions = [];
            for (const usage of usageByStockItem.values()) {
                const inventoryItem = db.prepare(`
                    SELECT id, quantity
                    FROM branch_inventory_item
                    WHERE branch_location_id = ? AND general_stock_item_id = ?
                `).get(branchLocationId, usage.stockItem.id);
                if (!inventoryItem) {
                    return { status: 'no-inventory', stockItem: usage.stockItem.name };
                }
                if (inventoryItem.quantity < usage.quantity) {
                    return {
                        status: 'insufficient-stock',
                        stockItem: usage.stockItem.name,
                        available: inventoryItem.quantity,
                        required: usage.quantity,
                        unitType: usage.stockItem.unit_type,
                    };
                }
                reductions.push({ inventoryItem, stockItem: usage.stockItem, quantity: usage.quantity });
            }

            for (const reduction of reductions) {
                const quantityAfter = reduction.inventoryItem.quantity - reduction.quantity;
                db.prepare(`
                    UPDATE branch_inventory_item SET quantity = ? WHERE id = ?
                `).run(quantityAfter, reduction.inventoryItem.id);
                db.prepare(`
                    INSERT INTO branch_inventory_manager_log
                        (branch_location_id, branch_inventory_item_id, user_id,
                         value_before, value_after, reason)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    branchLocationId,
                    reduction.inventoryItem.id,
                    userId,
                    reduction.inventoryItem.quantity,
                    quantityAfter,
                    'Sold menu item',
                );
                reduction.quantityAfter = quantityAfter;
            }

            return { status: 'updated', reductions, menuItems };
        });

        const result = saveInventory.immediate();
        if (result.status === 'invalid-payload') {
            return res.status(400).json({
                message: 'Send items with menuItemId/menuItemName or one generalStockItemId/quantity.',
            });
        }
        if (result.status === 'invalid-menu-item') {
            return res.status(400).json({ message: 'One or more sold menu items were not found or unavailable.' });
        }
        if (result.status === 'invalid-quantity') {
            return res.status(400).json({ message: 'Menu item quantities must be positive.' });
        }
        if (result.status === 'not-found') {
            return res.status(404).json({ message: `Active ${result.target || 'record'} not found.` });
        }
        if (result.status === 'no-inventory') {
            return res.status(404).json({ message: `No branch inventory record found for ${result.stockItem}.` });
        }
        if (result.status === 'insufficient-stock') {
            return res.status(409).json({
                message: `Insufficient branch inventory for ${result.stockItem}.`,
                available: result.available,
                required: result.required,
                unitType: result.unitType,
            });
        }

        return res.json({
            message: result.reductions.length > 0
                ? 'POS sale recorded and branch inventory updated.'
                : 'POS sale recorded with no inventory deductions.',
            branchLocationId,
            menuItems: result.menuItems,
            reductions: result.reductions.map((reduction) => ({
                stockItemId: reduction.stockItem.id,
                stockItemName: reduction.stockItem.name,
                unitType: reduction.stockItem.unit_type,
                quantityReduced: reduction.quantity,
                quantityRemaining: reduction.quantityAfter,
            })),
        });
    } catch (error) {
        if (error.code === 'INVENTORY_NOT_AVAILABLE') {
            return res.status(409).json({ message: error.message });
        }
        console.error('POS inventory webhook failed:', error);
        return res.status(500).json({ message: 'The inventory update could not be completed.' });
    }
};

module.exports = { updateInventory };
