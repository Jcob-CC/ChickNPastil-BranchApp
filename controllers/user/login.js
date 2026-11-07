const { randomInt } = require('crypto');
const db = require('../../lib/database');
const sendEmail = require('../../lib/emailer');
const { hashPassword, verifyPassword } = require('../../lib/password');

const passwordRecoveryMessage = 'If an active account matches that email, a verification code will be sent.';

const applyForAccount = (req, res) => {
    const {
        email,
        first_name: firstName,
        last_name: lastName,
        password,
        confirmPassword,
    } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (
        normalizedFirstName.length === 0 ||
        normalizedFirstName.length > 100 ||
        normalizedLastName.length === 0 ||
        normalizedLastName.length > 100
    ) {
        return res.status(400).json({ message: 'Enter a first and last name of 100 characters or fewer.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
        return res.status(400).json({ message: 'Password must be between 8 and 256 characters.' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'The passwords do not match.' });
    }

    try {
        const existingUser = db.prepare('SELECT id FROM "user" WHERE lower(email) = ?').get(normalizedEmail);
        if (existingUser) {
            return res.status(409).json({ message: 'An account with that email already exists.' });
        }

        db.prepare(`
            INSERT INTO "user" (email, hashed_password, first_name, last_name, role, status)
            VALUES (?, ?, ?, ?, 'Vendor', 'inactive')
        `).run(normalizedEmail, hashPassword(password), normalizedFirstName, normalizedLastName);

        return res.status(201).json({
            message: 'Application submitted. Wait for account activation and contact your manager.',
        });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'An account with that email already exists.' });
        }

        console.error('Account application failed:', error);
        return res.status(500).json({ message: 'Unable to submit your application right now. Please try again.' });
    }
};

const checkPassword = async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.sendStatus(400);
    }
    const normalizedEmail = email.trim().toLowerCase();

    const user = db.prepare(`
        SELECT id, email, hashed_password
        FROM "user"
        WHERE lower(email) = ? AND status = 'active'
    `).get(normalizedEmail);

    if (!user || !verifyPassword(password, user.hashed_password)) {
        return res.sendStatus(401);
    }

    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    req.session.pendingUserId = user.id;
    req.session.verificationCode = {
        value: code,
        expiresAt: Date.now() + 10 * 60 * 1000,
    };

    await sendEmail({
        to: user.email,
        subject: 'Your sign-in verification code',
        text: `Your Chick N Pastil sign-in verification code is ${code}. It expires in 10 minutes.`,
    });

    res.json({ message: 'Verification code sent.' });
};

const verifyEmail = (req, res) => {
    const { code } = req.body || {};
    const verificationCode = req.session.verificationCode;

    if (
        !req.session.pendingUserId ||
        typeof code !== 'string' ||
        !verificationCode ||
        Date.now() > verificationCode.expiresAt ||
        code !== verificationCode.value
    ) {
        return res.sendStatus(401);
    }

    req.session.emailVerified = true;
    delete req.session.verificationCode;

    const branches = db.prepare(`
        SELECT id, location_name, address
        FROM branch_location
        WHERE status = 'active'
        ORDER BY location_name
    `).all();

    res.json({ branches });
};

const requestPasswordReset = async (req, res) => {
    const { email } = req.body || {};
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    delete req.session.passwordRecovery;

    const user = db.prepare(`
        SELECT id, email
        FROM "user"
        WHERE lower(email) = ? AND status = 'active'
    `).get(normalizedEmail);

    if (user) {
        const code = String(randomInt(0, 1000000)).padStart(6, '0');
        try {
            await sendEmail({
                to: user.email,
                subject: 'Your password reset verification code',
                text: `Your Chick N Pastil password reset verification code is ${code}. It expires in 10 minutes.`,
            });
        } catch (error) {
            console.error('Unable to send password reset verification code:', error);
            return res.status(500).json({ message: 'Unable to send a verification code right now. Please try again.' });
        }

        req.session.passwordRecovery = {
            userId: user.id,
            code,
            expiresAt: Date.now() + 10 * 60 * 1000,
            failedAttempts: 0,
        };
    }

    res.json({ message: passwordRecoveryMessage });
};

const verifyPasswordResetCode = (req, res) => {
    const recovery = req.session.passwordRecovery;
    if (!recovery || recovery.verified) return res.sendStatus(401);
    if (Date.now() > recovery.expiresAt) {
        delete req.session.passwordRecovery;
        return res.sendStatus(401);
    }

    const { code } = req.body || {};
    if (typeof code !== 'string' || code !== recovery.code) {
        recovery.failedAttempts += 1;
        if (recovery.failedAttempts >= 5) {
            delete req.session.passwordRecovery;
            return res.status(429).json({ message: 'Too many incorrect codes. Request a new code to try again.' });
        }
        return res.sendStatus(401);
    }

    req.session.passwordRecovery = {
        userId: recovery.userId,
        verified: true,
        expiresAt: recovery.expiresAt,
    };
    res.json({ message: 'Verification code accepted.' });
};

const resetPassword = (req, res) => {
    const recovery = req.session.passwordRecovery;
    if (!recovery || !recovery.verified) return res.sendStatus(401);
    if (Date.now() > recovery.expiresAt) {
        delete req.session.passwordRecovery;
        return res.sendStatus(401);
    }

    const { newPassword, confirmPassword } = req.body || {};
    if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
        return res.status(400).json({ message: 'Complete both password fields.' });
    }
    if (newPassword.length < 8 || newPassword.length > 256) {
        return res.status(400).json({ message: 'Password must be between 8 and 256 characters.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'The new passwords do not match.' });
    }

    const result = db.prepare(`
        UPDATE "user"
        SET hashed_password = ?
        WHERE id = ? AND status = 'active'
    `).run(hashPassword(newPassword), recovery.userId);

    delete req.session.passwordRecovery;
    if (result.changes === 0) return res.sendStatus(401);

    res.json({ message: 'Your password has been reset. You can now sign in.' });
};

const startSession = (req, res) => {
    const { branchId } = req.body || {};
    if (!req.session.pendingUserId || !req.session.emailVerified || !Number.isInteger(branchId)) {
        return res.sendStatus(401);
    }

    const branch = db.prepare(`
        SELECT id, location_name, address
        FROM branch_location
        WHERE id = ? AND status = 'active'
    `).get(branchId);

    if (!branch) {
        return res.sendStatus(401);
    }

    const user = db.prepare(`
        SELECT id, email, first_name, last_name, role
        FROM "user"
        WHERE id = ? AND status = 'active'
    `).get(req.session.pendingUserId);

    if (!user) return res.sendStatus(401);

    req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        branchLocationId: branch.id,
        branchLocationName: branch.location_name,
    };
    delete req.session.pendingUserId;
    delete req.session.emailVerified;

    res.json({
        redirect: '/user/profile',
    });
};

const getSessionDetails = (req, res) => {
    const user = req.session.user;
    if (!user) return res.sendStatus(401);

    res.json({
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        branchLocationName: user.branchLocationName,
    });
};

module.exports = {
    applyForAccount,
    checkPassword,
    verifyEmail,
    requestPasswordReset,
    verifyPasswordResetCode,
    resetPassword,
    startSession,
    getSessionDetails,
};