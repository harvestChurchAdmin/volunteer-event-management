// Lightweight SQLite-backed session store using better-sqlite3.
// Keeps session data out of process memory and prunes expired rows eagerly.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Store } = require('express-session');

class SqliteSessionStore extends Store {
  constructor(options = {}) {
    super();
    const rawPath = options.dbPath || path.join(__dirname, '../../db/sessions.db');
    const dbPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : 24 * 60 * 60 * 1000; // 24h default
    this.ttlMs = ttlMs;

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath, { timeout: 5000 });
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        session TEXT NOT NULL,
        expires_at INTEGER
      );
    `);
  }

  _pruneExpired() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
    } catch (_) {
      // best-effort cleanup
    }
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT session, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expires_at && Number(row.expires_at) <= Date.now()) {
        this.destroy(sid, () => {});
        return cb(null, null);
      }
      const sess = JSON.parse(row.session);
      return cb(null, sess);
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, session, cb) {
    try {
      const maxAge = session && session.cookie && session.cookie.maxAge;
      const expires = session && session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + (typeof maxAge === 'number' ? maxAge : this.ttlMs);
      const payload = JSON.stringify(session || {});

      this.db.prepare(`
        INSERT INTO sessions (sid, session, expires_at)
        VALUES (@sid, @session, @expires_at)
        ON CONFLICT(sid) DO UPDATE SET session = excluded.session, expires_at = excluded.expires_at
      `).run({ sid, session: payload, expires_at: expires });

      this._pruneExpired();
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  touch(sid, session, cb) {
    // Update expiry without altering session payload if possible.
    try {
      const maxAge = session && session.cookie && session.cookie.maxAge;
      const expires = session && session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + (typeof maxAge === 'number' ? maxAge : this.ttlMs);
      this.db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?').run(expires, sid);
      this._pruneExpired();
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }

  clear(cb) {
    try {
      this.db.prepare('DELETE FROM sessions').run();
      return cb && cb(null);
    } catch (err) {
      return cb && cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
