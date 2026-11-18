const session = require('express-session');
const db = require('./database');

class SqliteSessionStore extends session.Store {
    constructor() {
        super();
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_session (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expires_at INTEGER
            )
        `);
    }

    get(sid, callback) {
        try {
            const row = db.prepare(`
                SELECT sess, expires_at
                FROM app_session
                WHERE sid = ?
            `).get(sid);
            if (!row || (row.expires_at && row.expires_at <= Date.now())) {
                if (row) db.prepare('DELETE FROM app_session WHERE sid = ?').run(sid);
                return callback(null, null);
            }
            callback(null, JSON.parse(row.sess));
        } catch (error) {
            callback(error);
        }
    }

    set(sid, sess, callback) {
        try {
            const maxAge = sess.cookie?.maxAge;
            const expiresAt = maxAge ? Date.now() + maxAge : null;
            db.prepare(`
                INSERT INTO app_session (sid, sess, expires_at)
                VALUES (?, ?, ?)
                ON CONFLICT(sid) DO UPDATE SET
                    sess = excluded.sess,
                    expires_at = excluded.expires_at
            `).run(sid, JSON.stringify(sess), expiresAt);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    destroy(sid, callback) {
        try {
            db.prepare('DELETE FROM app_session WHERE sid = ?').run(sid);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    touch(sid, sess, callback) {
        this.set(sid, sess, callback);
    }
}

module.exports = SqliteSessionStore;
