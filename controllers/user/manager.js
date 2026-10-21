const db = require('../../lib/database');
const { hashPassword } = require('../../lib/password');

const allowedStatuses = new Set(['active', 'inactive']);
const allowedStockUnitTypes = new Set(['sacks', 'cans', 'bottles', 'packs']);

const isNonEmptyString = (value, maxLength) =>
    typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const normalizeOptionalName = (value) => {
    if (value == null || value === '') return null;
    return typeof value === 'string' && value.trim().length <= 100 ? value.trim() : undefined;
};

const sendDatabaseError = (res, error) => {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ message: 'A record with that name or email already exists.' });
    }

    console.error('Admin database operation failed:', error);
    return res.status(500).json({ message: 'The request could not be completed.' });
};

const listUsers = (req, res) => {
    try {
        const users = db.prepare(`
            SELECT id, email, first_name, last_name, role, status, created_at
            FROM "user"
            ORDER BY id DESC
        `).all();
        res.json({ users });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const listBranches = (req, res) => {
    try {
        const branches = db.prepare(`
            SELECT id, location_name, address, status
            FROM branch_location
            ORDER BY location_name COLLATE NOCASE
        `).all();
        res.json({ branches });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const listStockItems = (req, res) => {
    try {
        const stockItems = db.prepare(`
            SELECT id, name, unit_type, unit_cost, status
            FROM general_stock_item
            ORDER BY name COLLATE NOCASE
        `).all();
        res.json({ stockItems });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const getStockItemInput = (body) => {
    const { name, unit_type: unitType, unit_cost: unitCost, status = 'active' } = body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedCost = typeof unitCost === 'string' && unitCost.trim() !== '' ? Number(unitCost) : unitCost;

    if (!isNonEmptyString(normalizedName, 150)) {
        return { error: 'Enter an item name of 150 characters or fewer.' };
    }
    if (!allowedStockUnitTypes.has(unitType)) {
        return { error: 'Choose a valid unit type.' };
    }
    if (typeof normalizedCost !== 'number' || !Number.isFinite(normalizedCost) || normalizedCost < 0) {
        return { error: 'Enter a valid non-negative unit cost.' };
    }
    if (!allowedStatuses.has(status)) {
        return { error: 'Choose a valid item status.' };
    }

    return { name: normalizedName, unitType, unitCost: normalizedCost, status };
};

const createStockItem = (req, res) => {
    const item = getStockItemInput(req.body);
    if (item.error) return res.status(400).json({ message: item.error });

    try {
        const result = db.prepare(`
            INSERT INTO general_stock_item (name, unit_type, unit_cost, status)
            VALUES (?, ?, ?, ?)
        `).run(item.name, item.unitType, item.unitCost, item.status);
        const stockItem = db.prepare(`
            SELECT id, name, unit_type, unit_cost, status FROM general_stock_item WHERE id = ?
        `).get(result.lastInsertRowid);
        res.status(201).json({ stockItem });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const updateStockItem = (req, res) => {
    const id = Number(req.params.id);
    const item = getStockItemInput(req.body);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid stock item ID.' });
    if (item.error) return res.status(400).json({ message: item.error });

    try {
        const result = db.prepare(`
            UPDATE general_stock_item
            SET name = ?, unit_type = ?, unit_cost = ?, status = ?
            WHERE id = ?
        `).run(item.name, item.unitType, item.unitCost, item.status, id);
        if (result.changes === 0) return res.status(404).json({ message: 'Stock item not found.' });

        const stockItem = db.prepare(`
            SELECT id, name, unit_type, unit_cost, status FROM general_stock_item WHERE id = ?
        `).get(id);
        res.json({ stockItem });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const createUser = (req, res) => {
    const { email, first_name: firstName, last_name: lastName, role, status = 'active', password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedFirstName = normalizeOptionalName(firstName);
    const normalizedLastName = normalizeOptionalName(lastName);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (normalizedFirstName === undefined || normalizedLastName === undefined) {
        return res.status(400).json({ message: 'Names must be 100 characters or fewer.' });
    }
    if (!isNonEmptyString(role, 50) || !allowedStatuses.has(status)) {
        return res.status(400).json({ message: 'Choose a valid role and account status.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
        return res.status(400).json({ message: 'Password must be between 8 and 256 characters.' });
    }

    try {
        const existingUser = db.prepare('SELECT id FROM "user" WHERE lower(email) = ?').get(normalizedEmail);
        if (existingUser) return res.status(409).json({ message: 'An account with that email already exists.' });

        const result = db.prepare(`
            INSERT INTO "user" (email, hashed_password, first_name, last_name, role, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(normalizedEmail, hashPassword(password), normalizedFirstName, normalizedLastName, role.trim(), status);

        const user = db.prepare(`
            SELECT id, email, first_name, last_name, role, status, created_at
            FROM "user" WHERE id = ?
        `).get(result.lastInsertRowid);
        res.status(201).json({ user });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const updateUser = (req, res) => {
    const id = Number(req.params.id);
    const { email, first_name: firstName, last_name: lastName, role, status, password } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedFirstName = normalizeOptionalName(firstName);
    const normalizedLastName = normalizeOptionalName(lastName);

    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid account ID.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (normalizedFirstName === undefined || normalizedLastName === undefined) {
        return res.status(400).json({ message: 'Names must be 100 characters or fewer.' });
    }
    if (!isNonEmptyString(role, 50) || !allowedStatuses.has(status)) {
        return res.status(400).json({ message: 'Choose a valid role and account status.' });
    }
    if (password !== '' && password !== undefined && (typeof password !== 'string' || password.length < 8 || password.length > 256)) {
        return res.status(400).json({ message: 'Password must be between 8 and 256 characters.' });
    }
    if (id === req.session.user.id && (role.trim() !== 'admin' || status !== 'active')) {
        return res.status(400).json({ message: 'You cannot remove your own active administrator access.' });
    }

    try {
        const update = db.transaction(() => {
            const currentUser = db.prepare('SELECT id, role, status FROM "user" WHERE id = ?').get(id);
            if (!currentUser) return null;

            const duplicateEmail = db.prepare(`
                SELECT id FROM "user" WHERE lower(email) = ? AND id != ?
            `).get(normalizedEmail, id);
            if (duplicateEmail) {
                return { error: 'An account with that email already exists.' };
            }

            if (currentUser.role === 'admin' && currentUser.status === 'active' && (role.trim() !== 'admin' || status !== 'active')) {
                const otherActiveAdmin = db.prepare(`
                    SELECT id FROM "user" WHERE role = 'admin' AND status = 'active' AND id != ?
                `).get(id);
                if (!otherActiveAdmin) {
                    return { error: 'At least one active administrator account must remain.' };
                }
            }

            const passwordHash = typeof password === 'string' && password.length > 0 ? hashPassword(password) : null;
            db.prepare(`
                UPDATE "user"
                SET email = ?, first_name = ?, last_name = ?, role = ?, status = ?,
                    hashed_password = COALESCE(?, hashed_password)
                WHERE id = ?
            `).run(normalizedEmail, normalizedFirstName, normalizedLastName, role.trim(), status, passwordHash, id);

            return db.prepare(`
                SELECT id, email, first_name, last_name, role, status, created_at
                FROM "user" WHERE id = ?
            `).get(id);
        });

        const user = update();
        if (!user) return res.status(404).json({ message: 'Account not found.' });
        if (user.error) return res.status(409).json({ message: user.error });
        res.json({ user });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const createBranch = (req, res) => {
    const { location_name: locationName, address, status = 'active' } = req.body || {};

    if (!isNonEmptyString(locationName, 150) || !isNonEmptyString(address, 500) || !allowedStatuses.has(status)) {
        return res.status(400).json({ message: 'Enter a branch name, address, and valid status.' });
    }

    try {
        const duplicate = db.prepare('SELECT id FROM branch_location WHERE lower(location_name) = ?')
            .get(locationName.trim().toLowerCase());
        if (duplicate) return res.status(409).json({ message: 'A branch with that name already exists.' });

        const result = db.prepare(`
            INSERT INTO branch_location (location_name, address, status) VALUES (?, ?, ?)
        `).run(locationName.trim(), address.trim(), status);
        const branch = db.prepare(`
            SELECT id, location_name, address, status FROM branch_location WHERE id = ?
        `).get(result.lastInsertRowid);
        res.status(201).json({ branch });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

const updateBranch = (req, res) => {
    const id = Number(req.params.id);
    const { location_name: locationName, address, status } = req.body || {};

    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid branch ID.' });
    if (!isNonEmptyString(locationName, 150) || !isNonEmptyString(address, 500) || !allowedStatuses.has(status)) {
        return res.status(400).json({ message: 'Enter a branch name, address, and valid status.' });
    }

    try {
        const duplicate = db.prepare(`
            SELECT id FROM branch_location WHERE lower(location_name) = ? AND id != ?
        `).get(locationName.trim().toLowerCase(), id);
        if (duplicate) return res.status(409).json({ message: 'A branch with that name already exists.' });

        const result = db.prepare(`
            UPDATE branch_location SET location_name = ?, address = ?, status = ? WHERE id = ?
        `).run(locationName.trim(), address.trim(), status, id);
        if (result.changes === 0) return res.status(404).json({ message: 'Branch not found.' });

        const branch = db.prepare(`
            SELECT id, location_name, address, status FROM branch_location WHERE id = ?
        `).get(id);
        res.json({ branch });
    } catch (error) {
        sendDatabaseError(res, error);
    }
};

module.exports = {
    listUsers,
    listBranches,
    listStockItems,
    createUser,
    updateUser,
    createBranch,
    updateBranch,
    createStockItem,
    updateStockItem,
};
