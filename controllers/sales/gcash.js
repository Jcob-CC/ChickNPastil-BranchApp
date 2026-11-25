const crypto = require('crypto');
const db = require('../../lib/database');

// How long a received payment can wait for its order before it is ignored.
const matchWindowMinutes = 60;

// Reads GCash's "You have received PHP 25.00 of GCash ... Ref. No. 1234567890123" text message.
function parseGcashSms(text, sender = '') {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    // "GCash" can be in the text or only be the sender's name.
    if (!raw || !/gcash/i.test(`${raw} ${sender}`) || !/received/i.test(raw)) return null;
    const amountMatch = raw.match(/received\s+(?:PHP|P|₱)\s*([\d,]+(?:\.\d{1,2})?)/i);
    const referenceMatch = raw.match(/Ref(?:erence)?\.?\s*(?:No\.?|Number|#)?\s*[:.]?\s*(\d{8,16})/i);
    if (!amountMatch || !referenceMatch) return null;
    const amount = Number(amountMatch[1].replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, reference: referenceMatch[1], raw };
}

function isAuthorized(req, secret) {
    const header = req.get('authorization') || '';
    const supplied = header.startsWith('Bearer ')
        ? header.slice(7)
        : String(req.query.token || req.get('x-webhook-secret') || '');
    const expected = crypto.createHash('sha256').update(secret).digest();
    const actual = crypto.createHash('sha256').update(supplied).digest();
    return crypto.timingSafeEqual(expected, actual);
}

// Called by the shop phone's SMS forwarder (no login, protected by GCASH_SMS_SECRET).
function notify(req, res) {
    const secret = process.env.GCASH_SMS_SECRET;
    if (!secret) return res.status(503).json({ success: false, error: 'GCash payment notifications are not configured.' });
    if (!isAuthorized(req, secret)) return res.status(401).json({ success: false, error: 'Unauthorized.' });

    const body = req.body || {};
    const parsed = parseGcashSms(body.text ?? body.message ?? body.body ?? req.query.text, String(body.from ?? body.sender ?? ''));
    if (!parsed) {
        // Not a "money received" message; answer 200 so the forwarder does not keep retrying it.
        return res.json({ success: true, recorded: false, reason: 'Not a GCash received-payment message.' });
    }
    try {
        const result = db.prepare(`
            INSERT OR IGNORE INTO gcash_notifications (reference_number, amount, sender_text, raw_text)
            VALUES (?, ?, ?, ?)
        `).run(parsed.reference, parsed.amount, String(body.from ?? body.sender ?? '').slice(0, 60), parsed.raw.slice(0, 500));
        res.json({ success: true, recorded: result.changes > 0, duplicate: result.changes === 0, amount: parsed.amount, reference: parsed.reference });
    } catch (error) {
        console.error('GCash notification error:', error);
        res.status(500).json({ success: false, error: 'Unable to record the GCash payment.' });
    }
}

function findByReference(reference) {
    return db.prepare('SELECT * FROM gcash_notifications WHERE reference_number = ?').get(reference);
}

// The oldest received payment with exactly this amount that no order has used yet.
function findMatchingNotification(amount) {
    return db.prepare(`
        SELECT * FROM gcash_notifications
        WHERE claimed_order_id IS NULL
          AND ABS(amount - ?) < 0.005
          AND received_at >= datetime('now', ?)
        ORDER BY received_at, notification_id
        LIMIT 1
    `).get(amount, `-${matchWindowMinutes} minutes`);
}

// The payer's name (or masked number) from "... received PHP 25.00 of GCash from JUAN D. w/ MSG ...", when it is there.
function extractPayer(raw) {
    const match = String(raw || '').match(/\bfrom\s+(.+?)(?=\s+(?:w\/|with\b|Ref\b|Your\b|on\b)|\.\s|\.$|$)/i);
    return match ? match[1].trim().slice(0, 40) : '';
}

// Every unused payment with exactly this amount, oldest first, so the cashier can compare each one with the customer's receipt.
function findCandidates(amount, limit = 5) {
    return db.prepare(`
        SELECT notification_id, reference_number, amount, raw_text, received_at
        FROM gcash_notifications
        WHERE claimed_order_id IS NULL
          AND ABS(amount - ?) < 0.005
          AND received_at >= datetime('now', ?)
        ORDER BY received_at, notification_id
        LIMIT ?
    `).all(amount, `-${matchWindowMinutes} minutes`, limit).map(row => ({
        notification_id: row.notification_id,
        reference: row.reference_number,
        amount: Number(row.amount),
        payer: extractPayer(row.raw_text),
        received_at: row.received_at,
    }));
}

module.exports = { parseGcashSms, notify, findByReference, findMatchingNotification, findCandidates, extractPayer };
