const defaultDb = require('../../lib/database');

class RequestError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const invalid = (message) => {
    throw new RequestError(400, message);
};

const getId = (value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const getPositiveNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
};

const getNonNegativeNumber = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
};

const getText = (value, label, maxLength, required = true) => {
    if (typeof value !== 'string') {
        if (required) invalid(`${label} is required.`);
        return null;
    }
    const text = value.trim();
    if (required && !text) invalid(`${label} is required.`);
    if (text.length > maxLength) invalid(`${label} must be ${maxLength} characters or fewer.`);
    return text || null;
};

const createCommissaryController = (db = defaultDb) => {
    const getUserId = (req) => getId(req.session?.user?.id);

    const requireUserId = (req) => {
        const userId = getUserId(req);
        if (!userId) throw new RequestError(401, 'Your session is no longer valid. Sign in again.');
        return userId;
    };

    const findStockItem = (id) => db.prepare(`
        SELECT id, name, kind, unit, quantity, low_stock_threshold, unit_cost, status
        FROM commissary_stock_item
        WHERE id = ? AND status = 'active'
    `).get(id);

    const addMovement = (itemId, userId, quantityChange, reason, referenceType, referenceId) => {
        db.prepare(`
            INSERT INTO commissary_stock_movement
                (stock_item_id, user_id, quantity_change, reason, reference_type, reference_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(itemId, userId, quantityChange, reason, referenceType, referenceId || null);
    };

    const sendFailure = (res, error, operation) => {
        if (error instanceof RequestError) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A record with the same name or barcode already exists.' });
        }
        console.error(`Commissary ${operation} failed:`, error);
        return res.status(500).json({ message: 'The commissary request could not be completed.' });
    };

    const run = (operation, handler) => (req, res) => {
        try {
            return handler(req, res);
        } catch (error) {
            return sendFailure(res, error, operation);
        }
    };

    const getData = run('data load', (req, res) => {
        const stockItems = db.prepare(`
            SELECT id, name, kind, category, unit, barcode, quantity,
                   low_stock_threshold, unit_cost, status
            FROM commissary_stock_item
            WHERE status = 'active'
            ORDER BY kind, name COLLATE NOCASE
        `).all();
        const recipes = db.prepare(`
            SELECT r.id, r.name, r.description, r.yield_quantity,
                   output.id AS output_item_id, output.name AS output_item_name,
                   output.unit AS output_unit
            FROM commissary_recipe r
            JOIN commissary_stock_item output ON output.id = r.output_stock_item_id
            ORDER BY r.name COLLATE NOCASE
        `).all().map((recipe) => ({
            ...recipe,
            ingredients: db.prepare(`
                SELECT ingredient.stock_item_id, item.name, item.unit, ingredient.quantity
                FROM commissary_recipe_ingredient ingredient
                JOIN commissary_stock_item item ON item.id = ingredient.stock_item_id
                WHERE ingredient.recipe_id = ?
                ORDER BY item.name COLLATE NOCASE
            `).all(recipe.id),
        }));
        const batches = db.prepare(`
            SELECT batch.id, batch.target_yield, batch.status, batch.created_at,
                   batch.started_at, batch.completed_at, recipe.name AS recipe_name,
                   output.name AS output_item_name, output.unit AS output_unit,
                   creator.first_name, creator.last_name
            FROM commissary_batch batch
            JOIN commissary_recipe recipe ON recipe.id = batch.recipe_id
            JOIN commissary_stock_item output ON output.id = recipe.output_stock_item_id
            JOIN "user" creator ON creator.id = batch.created_by
            ORDER BY batch.id DESC
        `).all().map((batch) => ({
            ...batch,
            created_by: [batch.first_name, batch.last_name].filter(Boolean).join(' '),
        }));
        const deliveries = db.prepare(`
            SELECT delivery.id, delivery.status, delivery.created_at, delivery.dispatched_at,
                   branch.location_name AS branch_name,
                   COUNT(item.id) AS line_count,
                   COALESCE(SUM(item.quantity), 0) AS total_units
            FROM commissary_delivery delivery
            JOIN branch_location branch ON branch.id = delivery.branch_location_id
            LEFT JOIN commissary_delivery_item item ON item.delivery_id = delivery.id
            GROUP BY delivery.id
            ORDER BY delivery.id DESC
        `).all().map((delivery) => ({
            ...delivery,
            items: db.prepare(`
                SELECT stock.name, stock.unit, item.quantity
                FROM commissary_delivery_item item
                JOIN commissary_stock_item stock ON stock.id = item.stock_item_id
                WHERE item.delivery_id = ?
                ORDER BY stock.name COLLATE NOCASE
            `).all(delivery.id),
        }));
        const purchaseOrders = db.prepare(`
            SELECT po.id, po.status, po.created_at, supplier.name AS supplier_name,
                   COUNT(item.id) AS line_count,
                   COALESCE(SUM(item.quantity * item.unit_cost), 0) AS total_value
            FROM commissary_purchase_order po
            JOIN commissary_supplier supplier ON supplier.id = po.supplier_id
            LEFT JOIN commissary_purchase_order_item item ON item.purchase_order_id = po.id
            GROUP BY po.id
            ORDER BY po.id DESC
        `).all().map((order) => ({
            ...order,
            items: db.prepare(`
                SELECT stock.name, stock.unit, item.quantity, item.unit_cost
                FROM commissary_purchase_order_item item
                JOIN commissary_stock_item stock ON stock.id = item.stock_item_id
                WHERE item.purchase_order_id = ?
                ORDER BY stock.name COLLATE NOCASE
            `).all(order.id),
        }));
        const wastages = db.prepare(`
            SELECT wastage.id, wastage.quantity, wastage.reason, wastage.created_at,
                   item.name AS item_name, item.unit, actor.first_name, actor.last_name
            FROM commissary_wastage wastage
            JOIN commissary_stock_item item ON item.id = wastage.stock_item_id
            JOIN "user" AS actor ON actor.id = wastage.user_id
            ORDER BY wastage.id DESC
            LIMIT 100
        `).all().map((wastage) => ({
            ...wastage,
            recorded_by: [wastage.first_name, wastage.last_name].filter(Boolean).join(' '),
        }));
        const movements = db.prepare(`
            SELECT movement.id, movement.quantity_change, movement.reason, movement.created_at,
                   item.name AS item_name, item.unit, actor.first_name, actor.last_name
            FROM commissary_stock_movement movement
            JOIN commissary_stock_item item ON item.id = movement.stock_item_id
            JOIN "user" AS actor ON actor.id = movement.user_id
            ORDER BY movement.id DESC
            LIMIT 100
        `).all().map((movement) => ({
            ...movement,
            updated_by: [movement.first_name, movement.last_name].filter(Boolean).join(' '),
        }));
        const branches = db.prepare(`
            SELECT id, location_name
            FROM branch_location
            WHERE status = 'active'
            ORDER BY location_name COLLATE NOCASE
        `).all();

        res.json({ stockItems, recipes, batches, deliveries, purchaseOrders, wastages, movements, branches });
    });

    const createStockItem = run('stock item creation', (req, res) => {
        const name = getText(req.body?.name, 'Item name', 150);
        const kind = req.body?.kind;
        if (!['raw_material', 'finished_good'].includes(kind)) invalid('Choose a valid item type.');
        const unit = getText(req.body?.unit, 'Unit', 40);
        const category = getText(req.body?.category, 'Category', 80, false);
        const barcode = getText(req.body?.barcode, 'Barcode', 120, false);
        const quantity = getNonNegativeNumber(req.body?.quantity);
        const lowThreshold = getNonNegativeNumber(req.body?.low_stock_threshold);
        const unitCost = getNonNegativeNumber(req.body?.unit_cost);
        const userId = requireUserId(req);
        if (quantity === null || lowThreshold === null || unitCost === null) {
            invalid('Quantity, low-stock threshold, and unit cost must be zero or greater.');
        }

        const transaction = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO commissary_stock_item
                    (name, kind, category, unit, barcode, quantity, low_stock_threshold, unit_cost)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(name, kind, category, unit, barcode, quantity, lowThreshold, unitCost);
            if (quantity > 0) {
                addMovement(result.lastInsertRowid, userId, quantity, 'Opening stock', 'adjustment', result.lastInsertRowid);
            }
            return result.lastInsertRowid;
        });
        res.status(201).json({ id: transaction() });
    });

    const adjustStock = run('stock adjustment', (req, res) => {
        const itemId = getId(req.params.id);
        const userId = requireUserId(req);
        const quantityChange = typeof req.body?.quantity_change === 'string' && req.body.quantity_change.trim() !== ''
            ? Number(req.body.quantity_change)
            : req.body?.quantity_change;
        const reason = getText(req.body?.reason, 'Reason', 250);
        if (!itemId) invalid('Enter a valid stock item.');
        if (typeof quantityChange !== 'number' || !Number.isFinite(quantityChange) || quantityChange === 0) {
            invalid('Enter a non-zero stock adjustment.');
        }

        const transaction = db.transaction(() => {
            const item = findStockItem(itemId);
            if (!item) throw new RequestError(404, 'Stock item not found.');
            if (item.quantity + quantityChange < 0) {
                throw new RequestError(409, `Not enough ${item.name} in commissary stock.`);
            }
            db.prepare('UPDATE commissary_stock_item SET quantity = quantity + ? WHERE id = ?')
                .run(quantityChange, itemId);
            addMovement(itemId, userId, quantityChange, reason, 'adjustment', null);
            return item.quantity + quantityChange;
        });

        res.json({ quantity: transaction() });
    });

    const recordWastage = run('wastage recording', (req, res) => {
        const itemId = getId(req.params.id);
        const quantity = getPositiveNumber(req.body?.quantity);
        const reason = getText(req.body?.reason, 'Reason', 250);
        const userId = requireUserId(req);
        if (!itemId) invalid('Enter a valid stock item.');
        if (quantity === null) invalid('Wastage quantity must be greater than zero.');

        const transaction = db.transaction(() => {
            const item = findStockItem(itemId);
            if (!item) throw new RequestError(404, 'Stock item not found.');
            if (item.quantity < quantity) {
                throw new RequestError(409, `Not enough ${item.name} in commissary stock.`);
            }
            db.prepare('UPDATE commissary_stock_item SET quantity = quantity - ? WHERE id = ?')
                .run(quantity, itemId);
            const result = db.prepare(`
                INSERT INTO commissary_wastage (stock_item_id, quantity, reason, user_id)
                VALUES (?, ?, ?, ?)
            `).run(itemId, quantity, reason, userId);
            addMovement(itemId, userId, -quantity, reason, 'wastage', result.lastInsertRowid);
            return result.lastInsertRowid;
        });
        res.status(201).json({ id: transaction() });
    });

    const createRecipe = run('recipe creation', (req, res) => {
        const name = getText(req.body?.name, 'Recipe name', 150);
        const description = getText(req.body?.description, 'Description', 500, false);
        const outputItemId = getId(req.body?.output_stock_item_id);
        const yieldQuantity = getPositiveNumber(req.body?.yield_quantity);
        const ingredients = req.body?.ingredients;
        if (!outputItemId) invalid('Choose a finished good for this recipe.');
        if (yieldQuantity === null) invalid('Recipe yield must be greater than zero.');
        if (!Array.isArray(ingredients) || ingredients.length === 0) {
            invalid('Add at least one raw material to the recipe.');
        }

        const normalizedIngredients = ingredients.map((ingredient) => {
            const stockItemId = getId(ingredient?.stock_item_id);
            const quantity = getPositiveNumber(ingredient?.quantity);
            if (!stockItemId || quantity === null) invalid('Every recipe ingredient needs a valid item and quantity.');
            return { stockItemId, quantity };
        });
        if (new Set(normalizedIngredients.map((ingredient) => ingredient.stockItemId)).size !== normalizedIngredients.length) {
            invalid('Each raw material can only be listed once in a recipe.');
        }
        const transaction = db.transaction(() => {
            const output = findStockItem(outputItemId);
            if (!output || output.kind !== 'finished_good') {
                throw new RequestError(400, 'Recipe output must be an active finished good.');
            }
            for (const ingredient of normalizedIngredients) {
                const item = findStockItem(ingredient.stockItemId);
                if (!item || item.kind !== 'raw_material') {
                    throw new RequestError(400, 'Recipe ingredients must be active raw materials.');
                }
            }
            const recipeId = db.prepare(`
                INSERT INTO commissary_recipe (name, description, output_stock_item_id, yield_quantity)
                VALUES (?, ?, ?, ?)
            `).run(name, description, outputItemId, yieldQuantity).lastInsertRowid;
            const insertIngredient = db.prepare(`
                INSERT INTO commissary_recipe_ingredient (recipe_id, stock_item_id, quantity)
                VALUES (?, ?, ?)
            `);
            normalizedIngredients.forEach((ingredient) =>
                insertIngredient.run(recipeId, ingredient.stockItemId, ingredient.quantity));
            return recipeId;
        });
        res.status(201).json({ id: transaction() });
    });

    const createBatch = run('batch creation', (req, res) => {
        const recipeId = getId(req.body?.recipe_id);
        const targetYield = getPositiveNumber(req.body?.target_yield);
        if (!recipeId) invalid('Choose a valid recipe.');
        if (targetYield === null) invalid('Target yield must be greater than zero.');
        const result = db.prepare(`
            INSERT INTO commissary_batch (recipe_id, target_yield, created_by)
            SELECT id, ?, ?
            FROM commissary_recipe
            WHERE id = ?
        `).run(targetYield, requireUserId(req), recipeId);
        if (result.changes === 0) throw new RequestError(404, 'Recipe not found.');
        res.status(201).json({ id: result.lastInsertRowid });
    });

    const startBatch = run('batch start', (req, res) => {
        const batchId = getId(req.params.id);
        const userId = requireUserId(req);
        if (!batchId) invalid('Enter a valid batch.');

        const transaction = db.transaction(() => {
            const batch = db.prepare(`
                SELECT batch.id, batch.recipe_id, batch.target_yield, batch.status, recipe.yield_quantity
                FROM commissary_batch batch
                JOIN commissary_recipe recipe ON recipe.id = batch.recipe_id
                WHERE batch.id = ?
            `).get(batchId);
            if (!batch) throw new RequestError(404, 'Batch not found.');
            if (batch.status !== 'planned') throw new RequestError(409, 'Only planned batches can be started.');
            const ingredients = db.prepare(`
                SELECT ingredient.stock_item_id, ingredient.quantity, item.name, item.unit, item.quantity AS available
                FROM commissary_recipe_ingredient ingredient
                JOIN commissary_stock_item item ON item.id = ingredient.stock_item_id
                WHERE ingredient.recipe_id = ?
            `).all(batch.recipe_id);
            const required = ingredients.map((ingredient) => ({
                ...ingredient,
                needed: ingredient.quantity * batch.target_yield / batch.yield_quantity,
            }));
            const shortage = required.find((ingredient) => ingredient.available < ingredient.needed);
            if (shortage) {
                throw new RequestError(409,
                    `Insufficient ${shortage.name}: need ${shortage.needed} ${shortage.unit}, have ${shortage.available}.`);
            }
            required.forEach((ingredient) => {
                db.prepare('UPDATE commissary_stock_item SET quantity = quantity - ? WHERE id = ?')
                    .run(ingredient.needed, ingredient.stock_item_id);
                addMovement(
                    ingredient.stock_item_id,
                    userId,
                    -ingredient.needed,
                    'Production batch started',
                    'batch',
                    batchId,
                );
            });
            db.prepare(`
                UPDATE commissary_batch SET status = 'in_progress', started_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(batchId);
        });
        transaction();
        res.json({ id: batchId, status: 'in_progress' });
    });

    const completeBatch = run('batch completion', (req, res) => {
        const batchId = getId(req.params.id);
        const userId = requireUserId(req);
        if (!batchId) invalid('Enter a valid batch.');
        const transaction = db.transaction(() => {
            const batch = db.prepare(`
                SELECT batch.id, batch.target_yield, batch.status, recipe.output_stock_item_id
                FROM commissary_batch batch
                JOIN commissary_recipe recipe ON recipe.id = batch.recipe_id
                WHERE batch.id = ?
            `).get(batchId);
            if (!batch) throw new RequestError(404, 'Batch not found.');
            if (batch.status !== 'in_progress') {
                throw new RequestError(409, 'Only in-progress batches can be completed.');
            }
            const output = findStockItem(batch.output_stock_item_id);
            if (!output) throw new RequestError(409, 'The recipe finished good is no longer active.');
            db.prepare('UPDATE commissary_stock_item SET quantity = quantity + ? WHERE id = ?')
                .run(batch.target_yield, output.id);
            addMovement(output.id, userId, batch.target_yield, 'Production batch completed', 'batch', batchId);
            db.prepare(`
                UPDATE commissary_batch SET status = 'completed', completed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(batchId);
        });
        transaction();
        res.json({ id: batchId, status: 'completed' });
    });

    const createPurchaseOrder = run('purchase order creation', (req, res) => {
        const supplierName = getText(req.body?.supplier_name, 'Supplier name', 150);
        const items = req.body?.items;
        if (!Array.isArray(items) || items.length === 0) invalid('Add at least one raw material to the purchase order.');
        const normalizedItems = items.map((item) => {
            const stockItemId = getId(item?.stock_item_id);
            const quantity = getPositiveNumber(item?.quantity);
            const unitCost = getNonNegativeNumber(item?.unit_cost);
            if (!stockItemId || quantity === null || unitCost === null) {
                invalid('Each purchase order item needs a valid raw material, quantity, and unit cost.');
            }
            return { stockItemId, quantity, unitCost };
        });
        const userId = requireUserId(req);
        const transaction = db.transaction(() => {
            for (const item of normalizedItems) {
                const stockItem = findStockItem(item.stockItemId);
                if (!stockItem || stockItem.kind !== 'raw_material') {
                    throw new RequestError(400, 'Purchase orders can only include active raw materials.');
                }
            }
            db.prepare('INSERT INTO commissary_supplier (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
                .run(supplierName);
            const supplier = db.prepare('SELECT id FROM commissary_supplier WHERE name = ?').get(supplierName);
            const orderId = db.prepare(`
                INSERT INTO commissary_purchase_order (supplier_id, created_by)
                VALUES (?, ?)
            `).run(supplier.id, userId).lastInsertRowid;
            const insertItem = db.prepare(`
                INSERT INTO commissary_purchase_order_item
                    (purchase_order_id, stock_item_id, quantity, unit_cost)
                VALUES (?, ?, ?, ?)
            `);
            normalizedItems.forEach((item) =>
                insertItem.run(orderId, item.stockItemId, item.quantity, item.unitCost));
            return orderId;
        });
        res.status(201).json({ id: transaction() });
    });

    const generateLowStockPurchaseOrder = run('low-stock purchase order generation', (req, res) => {
        const supplierName = getText(req.body?.supplier_name, 'Supplier name', 150);
        const userId = requireUserId(req);
        const transaction = db.transaction(() => {
            const items = db.prepare(`
                SELECT id, quantity, low_stock_threshold, unit_cost
                FROM commissary_stock_item
                WHERE kind = 'raw_material'
                  AND status = 'active'
                  AND quantity < low_stock_threshold
                ORDER BY id
            `).all();
            if (items.length === 0) {
                throw new RequestError(409, 'No raw materials are below their low-stock thresholds.');
            }
            db.prepare('INSERT INTO commissary_supplier (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
                .run(supplierName);
            const supplier = db.prepare('SELECT id FROM commissary_supplier WHERE name = ?').get(supplierName);
            const orderId = db.prepare(`
                INSERT INTO commissary_purchase_order (supplier_id, created_by)
                VALUES (?, ?)
            `).run(supplier.id, userId).lastInsertRowid;
            const insertItem = db.prepare(`
                INSERT INTO commissary_purchase_order_item
                    (purchase_order_id, stock_item_id, quantity, unit_cost)
                VALUES (?, ?, ?, ?)
            `);
            items.forEach((item) => insertItem.run(
                orderId,
                item.id,
                item.low_stock_threshold - item.quantity,
                item.unit_cost,
            ));
            return { id: orderId, itemCount: items.length };
        });
        res.status(201).json(transaction());
    });

    const approvePurchaseOrder = run('purchase order approval', (req, res) => {
        const orderId = getId(req.params.id);
        if (!orderId) invalid('Enter a valid purchase order.');
        const result = db.prepare(`
            UPDATE commissary_purchase_order
            SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'draft'
        `).run(requireUserId(req), orderId);
        if (result.changes === 0) {
            const order = db.prepare('SELECT id FROM commissary_purchase_order WHERE id = ?').get(orderId);
            if (!order) throw new RequestError(404, 'Purchase order not found.');
            throw new RequestError(409, 'Only draft purchase orders can be approved.');
        }
        res.json({ id: orderId, status: 'approved' });
    });

    const receivePurchaseOrder = run('purchase order receipt', (req, res) => {
        const orderId = getId(req.params.id);
        const userId = requireUserId(req);
        if (!orderId) invalid('Enter a valid purchase order.');
        const transaction = db.transaction(() => {
            const order = db.prepare(`
                SELECT id, status FROM commissary_purchase_order WHERE id = ?
            `).get(orderId);
            if (!order) throw new RequestError(404, 'Purchase order not found.');
            if (order.status !== 'approved') {
                throw new RequestError(409, 'Only approved purchase orders can be received.');
            }
            const items = db.prepare(`
                SELECT stock_item_id, quantity
                FROM commissary_purchase_order_item
                WHERE purchase_order_id = ?
            `).all(orderId);
            items.forEach((item) => {
                db.prepare('UPDATE commissary_stock_item SET quantity = quantity + ? WHERE id = ?')
                    .run(item.quantity, item.stock_item_id);
                addMovement(item.stock_item_id, userId, item.quantity, 'Purchase order received', 'purchase_order', orderId);
            });
            db.prepare(`
                UPDATE commissary_purchase_order
                SET status = 'received', received_by = ?, received_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(userId, orderId);
        });
        transaction();
        res.json({ id: orderId, status: 'received' });
    });

    const createDelivery = run('delivery creation', (req, res) => {
        const branchId = getId(req.body?.branch_location_id);
        const items = req.body?.items;
        if (!branchId) invalid('Choose a valid destination branch.');
        if (!Array.isArray(items) || items.length === 0) invalid('Add at least one finished good to the delivery.');
        const normalizedItems = items.map((item) => {
            const stockItemId = getId(item?.stock_item_id);
            const quantity = getPositiveNumber(item?.quantity);
            if (!stockItemId || quantity === null) invalid('Each delivery item needs a valid finished good and quantity.');
            return { stockItemId, quantity };
        });
        if (new Set(normalizedItems.map((item) => item.stockItemId)).size !== normalizedItems.length) {
            invalid('Each finished good can only be listed once in a delivery.');
        }
        const userId = requireUserId(req);
        const transaction = db.transaction(() => {
            const branch = db.prepare(`
                SELECT id FROM branch_location WHERE id = ? AND status = 'active'
            `).get(branchId);
            if (!branch) throw new RequestError(404, 'Destination branch not found.');
            for (const item of normalizedItems) {
                const stockItem = findStockItem(item.stockItemId);
                if (!stockItem || stockItem.kind !== 'finished_good') {
                    throw new RequestError(400, 'Deliveries can only include active finished goods.');
                }
            }
            const deliveryId = db.prepare(`
                INSERT INTO commissary_delivery (branch_location_id, created_by)
                VALUES (?, ?)
            `).run(branchId, userId).lastInsertRowid;
            const insertItem = db.prepare(`
                INSERT INTO commissary_delivery_item (delivery_id, stock_item_id, quantity)
                VALUES (?, ?, ?)
            `);
            normalizedItems.forEach((item) =>
                insertItem.run(deliveryId, item.stockItemId, item.quantity));
            return deliveryId;
        });
        res.status(201).json({ id: transaction() });
    });

    const dispatchDelivery = run('delivery dispatch', (req, res) => {
        const deliveryId = getId(req.params.id);
        const userId = requireUserId(req);
        if (!deliveryId) invalid('Enter a valid delivery.');
        const transaction = db.transaction(() => {
            const delivery = db.prepare(`
                SELECT id, status FROM commissary_delivery WHERE id = ?
            `).get(deliveryId);
            if (!delivery) throw new RequestError(404, 'Delivery not found.');
            if (delivery.status !== 'ready') throw new RequestError(409, 'Only ready deliveries can be dispatched.');
            const items = db.prepare(`
                SELECT delivery_item.stock_item_id, delivery_item.quantity,
                       stock.name, stock.unit, stock.quantity AS available
                FROM commissary_delivery_item delivery_item
                JOIN commissary_stock_item stock ON stock.id = delivery_item.stock_item_id
                WHERE delivery_item.delivery_id = ?
            `).all(deliveryId);
            const shortage = items.find((item) => item.available < item.quantity);
            if (shortage) {
                throw new RequestError(409,
                    `Insufficient ${shortage.name}: need ${shortage.quantity} ${shortage.unit}, have ${shortage.available}.`);
            }
            items.forEach((item) => {
                db.prepare('UPDATE commissary_stock_item SET quantity = quantity - ? WHERE id = ?')
                    .run(item.quantity, item.stock_item_id);
                addMovement(item.stock_item_id, userId, -item.quantity, 'Delivery dispatched', 'delivery', deliveryId);
            });
            db.prepare(`
                UPDATE commissary_delivery
                SET status = 'in_transit', dispatched_by = ?, dispatched_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(userId, deliveryId);
        });
        transaction();
        res.json({ id: deliveryId, status: 'in_transit' });
    });

    return {
        getData,
        createStockItem,
        adjustStock,
        recordWastage,
        createRecipe,
        createBatch,
        startBatch,
        completeBatch,
        createPurchaseOrder,
        generateLowStockPurchaseOrder,
        approvePurchaseOrder,
        receivePurchaseOrder,
        createDelivery,
        dispatchDelivery,
    };
};

module.exports = createCommissaryController(defaultDb);
module.exports.createCommissaryController = createCommissaryController;
