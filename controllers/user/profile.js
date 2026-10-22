const db = require('../../lib/database');
const { hashPassword, verifyPassword } = require('../../lib/password');

const getDetails = (req, res) => {
    const profile = db.prepare(`
        SELECT email, first_name, last_name, role
        FROM "user" u
        WHERE u.id = ? AND u.status = 'active'
    `).get(req.session.user.id);

    if (!profile) return res.sendStatus(401);

    res.json({
        profile: {
            name: [profile.first_name, profile.last_name].filter(Boolean).join(' '),
            email: profile.email,
            role: profile.role,
        },
    });
};

const updatePassword = (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (
        typeof currentPassword !== 'string' ||
        typeof newPassword !== 'string' ||
        typeof confirmPassword !== 'string'
    ) {
        return res.status(400).json({ message: 'Complete all password fields.' });
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
        return res.status(400).json({ message: 'Password must be between 8 and 256 characters.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'The new passwords do not match.' });
    }

    const user = db.prepare(`
        SELECT hashed_password FROM "user"
        WHERE id = ? AND status = 'active'
    `).get(req.session.user.id);
    if (!user || !verifyPassword(currentPassword, user.hashed_password)) {
        return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    db.prepare('UPDATE "user" SET hashed_password = ? WHERE id = ?')
        .run(hashPassword(newPassword), req.session.user.id);
    res.json({ message: 'Password updated.' });
};

const destroySession = (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Unable to end user session:', error);
            return res.sendStatus(500);
        }
        res.clearCookie('connect.sid');
        res.sendStatus(204);
    });
};

const logout = (req, res) => {
    destroySession(req, res);
};

const deactivate = (req, res) => {
    const { currentPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        return res.status(400).json({ message: 'Enter your current password to deactivate your account.' });
    }

    const deactivateAccount = db.transaction((userId, password) => {
        const user = db.prepare('SELECT role, status, hashed_password FROM "user" WHERE id = ?').get(userId);
        if (!user || user.status !== 'active') return null;
        if (!verifyPassword(password, user.hashed_password)) return { error: 'Current password is incorrect.', status: 401 };

        if (user.role === 'admin') {
            const otherActiveAdmin = db.prepare(`
                SELECT id FROM "user"
                WHERE role = 'admin' AND status = 'active' AND id != ?
            `).get(userId);
            if (!otherActiveAdmin) {
                return { error: 'At least one active administrator account must remain.', status: 409 };
            }
        }

        db.prepare('UPDATE "user" SET status = ? WHERE id = ?').run('inactive', userId);
        return { success: true };
    });
    const result = deactivateAccount(req.session.user.id, currentPassword);

    if (!result) return res.status(401).json({ message: 'Account is not active.' });
    if (result.error) return res.status(result.status).json({ message: result.error });
    destroySession(req, res);
};

module.exports = { getDetails, updatePassword, logout, deactivate };
