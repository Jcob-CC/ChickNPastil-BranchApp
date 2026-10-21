const { randomBytes, scryptSync, timingSafeEqual } = require('crypto');

const hashPassword = (password) => {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, storedHash) => {
    if (typeof password !== 'string' || typeof storedHash !== 'string') return false;

    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;

    const [scheme, salt, hash] = parts;
    if (
        scheme !== 'scrypt' ||
        !/^[0-9a-f]{32}$/i.test(salt) ||
        !/^[0-9a-f]{128}$/i.test(hash)
    ) {
        return false;
    }

    const expectedHash = Buffer.from(hash, 'hex');
    const actualHash = scryptSync(password, salt, expectedHash.length);
    return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
};

module.exports = { hashPassword, verifyPassword };
