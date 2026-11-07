const { randomInt } = require('crypto');
const db = require('../../lib/database');
const sendEmail = require('../../lib/emailer');
const { verifyPassword } = require('../../lib/password');

const checkPassword = async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.sendStatus(400);
    }

    const user = db.prepare(`
        SELECT id, email, hashed_password
        FROM "user"
        WHERE email = ? AND status = 'active'
    `).get(email);

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

module.exports = { checkPassword, verifyEmail, startSession, getSessionDetails };