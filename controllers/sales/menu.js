const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const db = require('../../lib/database');

const defaultProductImage = 'assets/sales/img/logo.png';
const uploadDir = path.join(__dirname, '../../app/assets/sales/img/menu/uploads');

function failure(res, error, label) {
    console.error(`${label}:`, error);
    res.status(500).json({ success: false, error: 'Unable to complete menu operation.' });
}

// A product without its own photo shows the business logo.
function normalizeImageUrl(value) {
    const url = typeof value === 'string' ? value.trim() : '';
    return url && url.length <= 300 ? url : defaultProductImage;
}

function detectImageExtension(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.length > 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
    return null;
}

function uploadImage(req, res) {
    const image = req.body;
    if (!Buffer.isBuffer(image) || image.length === 0) {
        return res.status(400).json({ success: false, error: 'Choose a JPG, PNG or WebP image under 2 MB.' });
    }
    const extension = detectImageExtension(image);
    if (!extension) return res.status(400).json({ success: false, error: 'Only JPG, PNG or WebP images are allowed.' });
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        const filename = `${randomBytes(12).toString('hex')}.${extension}`;
        fs.writeFileSync(path.join(uploadDir, filename), image);
        res.json({ success: true, image_url: `assets/sales/img/menu/uploads/${filename}` });
    } catch (error) {
        failure(res, error, 'Product image upload error');
    }
}

function list(req, res) {
    try {
        const includeArchived = req.query.includeArchived === 'true' && ['admin', 'manager'].includes((req.session?.user?.role || '').toLowerCase());
        const sections = db.prepare(`
            SELECT * FROM menu_section ${includeArchived ? '' : 'WHERE COALESCE(is_archived, 0) = 0'}
            ORDER BY section_id
        `).all();
        const products = db.prepare(`
            SELECT * FROM menu_products ${includeArchived ? '' : 'WHERE COALESCE(is_archived, 0) = 0'}
            ORDER BY product_id
        `).all();
        const addons = db.prepare('SELECT * FROM product_addons ORDER BY addon_id').all();

        res.json({
            success: true,
            sections: sections.map(section => ({
                ...section,
                is_available: Boolean(section.is_available),
                is_archived: Boolean(section.is_archived),
                products: products
                    .filter(product => product.section_id === section.section_id)
                    .map(product => ({
                        ...product,
                        price: Number(product.price),
                        is_available: Boolean(product.is_available),
                        allow_quantity: Boolean(product.allow_quantity),
                        is_archived: Boolean(product.is_archived),
                        customization_enabled: Boolean(product.customization_enabled),
                        customization_choice_ids: (() => {
                            try {
                                const ids = JSON.parse(product.customization_choice_ids || '[]');
                                return Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
                            } catch {
                                return [];
                            }
                        })(),
                    })),
            })),
            addons: addons.map(addon => ({
                ...addon,
                addon_price: Number(addon.addon_price),
                is_available: Boolean(addon.is_available),
                is_archived: Boolean(addon.is_archived),
            })),
        });
    } catch (error) {
        failure(res, error, 'Menu fetch error');
    }
}

function listAddons(req, res) {
    try {
        const addons = db.prepare('SELECT * FROM product_addons ORDER BY addon_category, addon_id').all();
        res.json({ success: true, addons });
    } catch (error) {
        failure(res, error, 'Addon fetch error');
    }
}

function listInventoryItems(req, res) {
    try {
        const items = db.prepare(`
            SELECT id, name, unit_type
            FROM general_stock_item
            WHERE status = 'active'
            ORDER BY lower(name), id
        `).all();
        res.json({ success: true, items });
    } catch (error) {
        failure(res, error, 'Inventory item list error');
    }
}

function getProductInventoryMappings(req, res) {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ success: false, error: 'Invalid product ID.' });
    }
    try {
        const product = db.prepare('SELECT product_id FROM menu_products WHERE product_id = ?').get(productId);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
        const mappings = db.prepare(`
            SELECT mapping.addon_id, mapping.general_stock_item_id,
                   mapping.quantity, stock.name AS stock_item_name,
                   stock.unit_type
            FROM menu_product_inventory_mapping mapping
            JOIN general_stock_item stock ON stock.id = mapping.general_stock_item_id
            WHERE mapping.product_id = ?
            ORDER BY mapping.addon_id, lower(stock.name), stock.id
        `).all(productId);
        res.json({ success: true, mappings });
    } catch (error) {
        failure(res, error, 'Product inventory mapping fetch error');
    }
}

function replaceProductInventoryMappings(req, res) {
    const productId = Number(req.params.id);
    const mappings = req.body && req.body.mappings;
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ success: false, error: 'Invalid product ID.' });
    }
    if (!Array.isArray(mappings) || mappings.length > 200) {
        return res.status(400).json({ success: false, error: 'Provide up to 200 inventory mappings.' });
    }

    const normalized = [];
    const seen = new Set();
    for (const mapping of mappings) {
        const stockItemId = Number(mapping && mapping.general_stock_item_id);
        const addonId = mapping && mapping.addon_id != null ? Number(mapping.addon_id) : null;
        const quantity = Number(mapping && mapping.quantity);
        if (!Number.isSafeInteger(stockItemId) || stockItemId < 1 ||
            (addonId !== null && (!Number.isSafeInteger(addonId) || addonId < 1)) ||
            !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Each mapping requires a valid stock item and positive deduction quantity.',
            });
        }
        const key = `${addonId === null ? 'base' : addonId}:${stockItemId}`;
        if (seen.has(key)) {
            return res.status(400).json({
                success: false,
                error: 'A stock item can only be mapped once per menu item or addon.',
            });
        }
        seen.add(key);
        normalized.push({ addonId, stockItemId, quantity });
    }

    try {
        const save = db.transaction(() => {
            const product = db.prepare(`
                SELECT customization_choice_ids
                FROM menu_products WHERE product_id = ?
            `).get(productId);
            if (!product) return { status: 'product-not-found' };

            let selectedAddonIds = [];
            try {
                const parsed = JSON.parse(product.customization_choice_ids || '[]');
                if (Array.isArray(parsed)) {
                    selectedAddonIds = parsed.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
                }
            } catch {
                selectedAddonIds = [];
            }

            const findStockItem = db.prepare(`
                SELECT id FROM general_stock_item WHERE id = ? AND status = 'active'
            `);
            const findAddon = db.prepare(`
                SELECT addon_id FROM product_addons
                WHERE addon_id = ? AND is_available = 1 AND COALESCE(is_archived, 0) = 0
            `);
            for (const mapping of normalized) {
                if (!findStockItem.get(mapping.stockItemId)) {
                    return { status: 'stock-item-not-found', stockItemId: mapping.stockItemId };
                }
                if (mapping.addonId !== null &&
                    (!selectedAddonIds.includes(mapping.addonId) || !findAddon.get(mapping.addonId))) {
                    return { status: 'addon-not-selected', addonId: mapping.addonId };
                }
            }

            db.prepare('DELETE FROM menu_product_inventory_mapping WHERE product_id = ?').run(productId);
            const insert = db.prepare(`
                INSERT INTO menu_product_inventory_mapping
                    (product_id, addon_id, general_stock_item_id, quantity)
                VALUES (?, ?, ?, ?)
            `);
            for (const mapping of normalized) {
                insert.run(productId, mapping.addonId, mapping.stockItemId, mapping.quantity);
            }
            return { status: 'saved' };
        });

        const result = save.immediate();
        if (result.status === 'product-not-found') {
            return res.status(404).json({ success: false, error: 'Product not found.' });
        }
        if (result.status === 'stock-item-not-found') {
            return res.status(400).json({
                success: false,
                error: `Active inventory item ${result.stockItemId} was not found.`,
            });
        }
        if (result.status === 'addon-not-selected') {
            return res.status(400).json({
                success: false,
                error: `Addon ${result.addonId} must be active and selected for this menu item.`,
            });
        }
        res.json({ success: true, message: 'Inventory mappings saved.' });
    } catch (error) {
        failure(res, error, 'Product inventory mapping save error');
    }
}

function createSection(req, res) {
    const body = req.body || {};
    const name = typeof body.section_name === 'string' ? body.section_name.trim() : '';
    if (!name) return res.status(400).json({ success: false, error: 'Section name is required' });
    try {
        const result = db.prepare('INSERT INTO menu_section (section_name, is_available, is_archived) VALUES (?, 1, 0)').run(name);
        res.json({ success: true, section_id: Number(result.lastInsertRowid) });
    } catch (error) {
        failure(res, error, 'Section creation error');
    }
}

function updateSection(req, res) {
    const body = req.body || {};
    const name = typeof body.section_name === 'string' ? body.section_name.trim() : '';
    if (!name) return res.status(400).json({ success: false, error: 'Section name is required' });
    try {
        const result = db.prepare('UPDATE menu_section SET section_name = ? WHERE section_id = ?').run(name, req.params.id);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Section not found' });
        res.json({ success: true, message: 'Section renamed successfully' });
    } catch (error) {
        failure(res, error, 'Section update error');
    }
}

function toggleArchive(table, idColumn, req, res) {
    try {
        const row = db.prepare(`SELECT is_archived FROM "${table}" WHERE "${idColumn}" = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Record not found' });
        const status = row.is_archived ? 0 : 1;
        db.prepare(`UPDATE "${table}" SET is_archived = ? WHERE "${idColumn}" = ?`).run(status, req.params.id);
        res.json({ success: true, is_archived: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Archive update error');
    }
}

function toggleSectionArchive(req, res) {
    toggleArchive('menu_section', 'section_id', req, res);
}

function createProduct(req, res) {
    const { section_id, product_name, description, price, allow_quantity, image_url, customization_enabled, customization_choice_ids } = req.body || {};
    const name = typeof product_name === 'string' ? product_name.trim() : '';
    const sectionId = Number(section_id);
    const productPrice = Number(price);
    if (!Number.isInteger(sectionId) || !name || !Number.isFinite(productPrice) || productPrice < 0) {
        return res.status(400).json({ success: false, error: 'Section, product name, and a valid price are required' });
    }
    try {
        const section = db.prepare('SELECT section_id FROM menu_section WHERE section_id = ?').get(sectionId);
        if (!section) return res.status(400).json({ success: false, error: 'Section not found' });
        const enabled = customization_enabled === true || customization_enabled === 1 || customization_enabled === 'true' ? 1 : 0;
        const choiceIds = Array.isArray(customization_choice_ids)
            ? customization_choice_ids.map(Number).filter(Number.isInteger)
            : [];
        const result = db.prepare(`
            INSERT INTO menu_products
                (section_id, product_name, description, price, is_available, image_url, allow_quantity, is_archived, customization_type, customization_enabled, customization_choice_ids)
            VALUES (?, ?, ?, ?, 1, ?, ?, 0, ?, ?, ?)
        `).run(sectionId, name, description || '', productPrice, normalizeImageUrl(image_url),allow_quantity === false ? 0 : 1, enabled ? 'pastil' : 'none', enabled, JSON.stringify(choiceIds));
        res.json({ success: true, product_id: Number(result.lastInsertRowid) });
    } catch (error) {
        failure(res, error, 'Product creation error');
    }
}

function updateProduct(req, res) {
    const { product_name, description, price, allow_quantity, image_url, section_id, customization_enabled, customization_choice_ids } = req.body || {};
    const updates = [];
    const values = [];
    if (product_name !== undefined) {
        if (typeof product_name !== 'string' || !product_name.trim()) {
            return res.status(400).json({ success: false, error: 'Product name is required' });
        }
        updates.push('product_name = ?');
        values.push(product_name.trim());
    }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (price !== undefined) {
        const value = Number(price);
        if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, error: 'Invalid price' });
        updates.push('price = ?');
        values.push(value);
    }
    if (allow_quantity !== undefined) { updates.push('allow_quantity = ?'); values.push(allow_quantity ? 1 : 0); }
    if (customization_enabled !== undefined) {
        const enabled = customization_enabled === true || customization_enabled === 1 || customization_enabled === 'true' ? 1 : 0;
        updates.push('customization_enabled = ?');
        values.push(enabled);
        updates.push('customization_type = ?');
        values.push(enabled ? 'pastil' : 'none');
    }
    if (customization_choice_ids !== undefined) {
        const choiceIds = Array.isArray(customization_choice_ids)
            ? customization_choice_ids.map(Number).filter(Number.isInteger)
            : [];
        updates.push('customization_choice_ids = ?');
        values.push(JSON.stringify(choiceIds));
    }
    if (image_url !== undefined) { updates.push('image_url = ?'); values.push(normalizeImageUrl(image_url)); }
    if (section_id !== undefined) {
        const value = Number(section_id);
        if (!Number.isInteger(value) || !db.prepare('SELECT 1 FROM menu_section WHERE section_id = ?').get(value)) {
            return res.status(400).json({ success: false, error: 'Invalid section' });
        }
        updates.push('section_id = ?');
        values.push(value);
    }
    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });

    try {
        values.push(req.params.id);
        const result = db.prepare(`UPDATE menu_products SET ${updates.join(', ')} WHERE product_id = ?`).run(...values);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        failure(res, error, 'Product update error');
    }
}

function toggleAvailability(req, res) {
    try {
        const row = db.prepare('SELECT is_available FROM menu_products WHERE product_id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Product not found' });
        const status = row.is_available ? 0 : 1;
        db.prepare('UPDATE menu_products SET is_available = ? WHERE product_id = ?').run(status, req.params.id);
        res.json({ success: true, is_available: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Availability update error');
    }
}

function toggleProductArchive(req, res) {
    toggleArchive('menu_products', 'product_id', req, res);
}

function createAddon(req, res) {
    const { addon_name, addon_price, addon_category } = req.body || {};
    const name = typeof addon_name === 'string' ? addon_name.trim() : '';
    const price = Number(addon_price);
    const category = typeof addon_category === 'string' ? addon_category.trim().toLowerCase() : 'extra';

    if (!name) {
        return res.status(400).json({ success: false, error: 'Customization name is required' });
    }
    if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ success: false, error: 'Invalid customization price' });
    }
    try {
        const exists = db.prepare('SELECT 1 FROM product_addons WHERE lower(addon_name) = lower(?)').get(name);
        if (exists) {
            return res.status(400).json({ success: false, error: 'Customization choice already exists' });
        }
        const result = db.prepare(`
            INSERT INTO product_addons (addon_name, addon_price, is_available, addon_category)
            VALUES (?, ?, 1, ?)
        `).run(name, price, category);
        res.json({ success: true, addon_id: Number(result.lastInsertRowid) });
    } catch (error) {
        failure(res, error, 'Customization creation error');
    }
}

function toggleAddonVisibility(req, res) {
    try {
        const row = db.prepare('SELECT is_available FROM product_addons WHERE addon_id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Customization choice not found' });
        const status = row.is_available ? 0 : 1;
        db.prepare('UPDATE product_addons SET is_available = ? WHERE addon_id = ?').run(status, req.params.id);
        res.json({ success: true, is_available: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Customization visibility update error');
    }
}

function toggleAddonArchive(req, res) {
    try {
        const row = db.prepare('SELECT is_archived FROM product_addons WHERE addon_id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Customization choice not found' });
        const status = row.is_archived ? 0 : 1;
        db.prepare('UPDATE product_addons SET is_archived = ? WHERE addon_id = ?').run(status, req.params.id);
        res.json({ success: true, is_archived: Boolean(status) });
    } catch (error) {
        failure(res, error, 'Customization archive update error');
    }
}

function updateAddon(req, res) {
    const { addon_name, addon_price, addon_category } = req.body || {};
    const updates = [];
    const values = [];

    if (addon_name !== undefined) {
        if (typeof addon_name !== 'string' || !addon_name.trim()) {
            return res.status(400).json({ success: false, error: 'Choice name is required' });
        }
        updates.push('addon_name = ?');
        values.push(addon_name.trim());
    }
    if (addon_price !== undefined) {
        const value = Number(addon_price);
        if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ success: false, error: 'Invalid choice price' });
        }
        updates.push('addon_price = ?');
        values.push(value);
    }
    if (addon_category !== undefined) {
        if (typeof addon_category !== 'string' || !addon_category.trim()) {
            return res.status(400).json({ success: false, error: 'Customization type is required' });
        }
        updates.push('addon_category = ?');
        values.push(addon_category.trim().toLowerCase());
    }
    if (!updates.length) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    try {
        values.push(req.params.id);
        const result = db.prepare(`UPDATE product_addons SET ${updates.join(', ')} WHERE addon_id = ?`).run(...values);
        if (!result.changes) return res.status(404).json({ success: false, error: 'Choice not found' });
        res.json({ success: true, message: 'Customization choice updated successfully' });
    } catch (error) {
        failure(res, error, 'Customization choice update error');
    }
}

module.exports = {
    list,
    listAddons,
    listInventoryItems,
    getProductInventoryMappings,
    replaceProductInventoryMappings,
    createSection,
    updateSection,
    toggleSectionArchive,
    createProduct,
    uploadImage,
    updateProduct,
    toggleProductAvailability: toggleAvailability,
    toggleProductArchive,
    createAddon,
    updateAddon,
    toggleAddonVisibility,
    toggleAddonArchive,
};
