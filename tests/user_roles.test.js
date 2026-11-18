const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const Database = require('better-sqlite3');

const databasePath = require.resolve('../lib/database');
const controllerPath = require.resolve('../controllers/user/manager');
const originalDatabaseModule = require.cache[databasePath];
const db = new Database(':memory:');
db.exec(`
    CREATE TABLE "user" (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        hashed_password TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO "user" (id, email, hashed_password, first_name, role, status)
    VALUES
        (1, 'admin@example.com', 'hash', 'Admin', 'admin', 'active'),
        (2, 'vendor@example.com', 'hash', 'Legacy', 'Vendor', 'active');
`);

const databaseModule = new Module(databasePath);
databaseModule.filename = databasePath;
databaseModule.loaded = true;
databaseModule.exports = db;
require.cache[databasePath] = databaseModule;
const manager = require('../controllers/user/manager');

function invoke(handler, req) {
    const result = { statusCode: 200, body: null };
    const res = {
        status(statusCode) {
            result.statusCode = statusCode;
            return this;
        },
        json(body) {
            result.body = body;
            return this;
        },
    };
    handler(req, res);
    return result;
}

test('new accounts accept the replacement roles and reject legacy roles', () => {
    const legacy = invoke(manager.createUser, {
        body: {
            email: 'new-cook@example.com',
            role: 'Cook',
            password: 'password123',
        },
    });
    assert.equal(legacy.statusCode, 400);

    const retiredVendor = invoke(manager.createUser, {
        body: {
            email: 'new-vendor@example.com',
            role: 'Vendor',
            password: 'password123',
        },
    });
    assert.equal(retiredVendor.statusCode, 400);

    const serviceCrew = invoke(manager.createUser, {
        body: {
            email: 'new-crew@example.com',
            role: 'service-crew',
            password: 'password123',
        },
    });
    assert.equal(serviceCrew.statusCode, 201);
    assert.equal(serviceCrew.body.user.role, 'service-crew');
});

test('retired roles cannot be preserved on account updates but can be replaced', () => {
    const unchangedLegacyRole = invoke(manager.updateUser, {
        params: { id: '2' },
        session: { user: { id: 1 } },
        body: {
            email: 'vendor@example.com',
            first_name: 'Legacy',
            last_name: '',
            role: 'Vendor',
            status: 'active',
            password: '',
        },
    });
    assert.equal(unchangedLegacyRole.statusCode, 400);

    const newRole = invoke(manager.updateUser, {
        params: { id: '2' },
        session: { user: { id: 1 } },
        body: {
            email: 'vendor@example.com',
            first_name: 'Legacy',
            last_name: '',
            role: 'supervisor',
            status: 'active',
            password: '',
        },
    });
    assert.equal(newRole.statusCode, 200);
    assert.equal(newRole.body.user.role, 'supervisor');
});

test.after(() => {
    db.close();
    delete require.cache[controllerPath];
    if (originalDatabaseModule) {
        require.cache[databasePath] = originalDatabaseModule;
    } else {
        delete require.cache[databasePath];
    }
});
