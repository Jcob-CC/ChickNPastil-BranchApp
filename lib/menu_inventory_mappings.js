function getMappedInventoryUsage(db, productId, quantitySold, addons = []) {
    const addonQuantities = new Map();
    for (const addon of addons) {
        const addonId = Number(addon.addon_id);
        const quantity = Number(addon.quantity ?? 1);
        if (Number.isSafeInteger(addonId) && addonId > 0 &&
            Number.isFinite(quantity) && quantity > 0) {
            addonQuantities.set(addonId, (addonQuantities.get(addonId) || 0) + quantity);
        }
    }

    const mappings = db.prepare(`
        SELECT mapping.addon_id, mapping.quantity, stock.id AS stock_item_id,
               stock.name AS stock_item_name, stock.unit_type, stock.status
        FROM menu_product_inventory_mapping mapping
        JOIN general_stock_item stock ON stock.id = mapping.general_stock_item_id
        WHERE mapping.product_id = ?
    `).all(productId);
    const usageByStockItem = new Map();

    for (const mapping of mappings) {
        const multiplier = mapping.addon_id === null
            ? quantitySold
            : addonQuantities.get(mapping.addon_id) || 0;
        if (multiplier === 0) continue;
        if (mapping.status !== 'active') {
            const error = new Error(`Mapped inventory item ${mapping.stock_item_name} is inactive.`);
            error.code = 'INVENTORY_NOT_AVAILABLE';
            throw error;
        }

        const usage = usageByStockItem.get(mapping.stock_item_id) || {
            stockItem: {
                id: mapping.stock_item_id,
                name: mapping.stock_item_name,
                unit_type: mapping.unit_type,
            },
            quantity: 0,
        };
        usage.quantity += Number(mapping.quantity) * multiplier;
        usageByStockItem.set(mapping.stock_item_id, usage);
    }

    return [...usageByStockItem.values()];
}

module.exports = { getMappedInventoryUsage };
