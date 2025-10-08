// src/db/dal.js
// Centralised wrapper around the SQLite layer. Grouped into `admin` and
// `public` namespaces so higher tiers never have to write SQL directly.
const { db } = require('../config/database');
const createError = require('http-errors');

// Enforce referential integrity at the SQLite level.
try { db.exec('PRAGMA foreign_keys = ON;'); } catch (_) {}

// Lightweight, idempotent schema migrations to keep SQLite aligned.
// Ensure publish column exists (idempotent)
try {
  db.prepare(`ALTER TABLE events ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0`).run();
} catch (_) { /* already exists */ }
// Ensure station order column exists so admins can persist manual ordering
try {
  db.prepare(`ALTER TABLE stations ADD COLUMN station_order INTEGER NOT NULL DEFAULT 0`).run();
} catch (_) { /* already exists */ }
// Ensure new station description fields exist
try {
  db.prepare(`ALTER TABLE stations ADD COLUMN description_overview TEXT`).run();
} catch (_) { /* already exists */ }
try {
  db.prepare(`ALTER TABLE stations ADD COLUMN description_tasks TEXT`).run();
} catch (_) { /* already exists */ }

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS volunteer_tokens (
      token TEXT PRIMARY KEY,
      volunteer_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY (volunteer_id) REFERENCES volunteers(volunteer_id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_volunteer_tokens_volunteer ON volunteer_tokens(volunteer_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_volunteer_tokens_event ON volunteer_tokens(event_id)`).run();
} catch (_) { /* already exists */ }

/**
 * Convert the better-sqlite3 metadata into a simpler object that callers can
 * rely on. This keeps service code tidy and testable.
 */
function mapRun(res) {
  return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
}

// ---------- Admin DAL ----------
const admin = {
  // List every event for the admin dashboard, including publish state.
  getAllEvents: () => {
    return db.prepare(`
      SELECT event_id, name, description, date_start, date_end, 
             COALESCE(is_published, 0) AS is_published
      FROM events
      ORDER BY datetime(date_start) DESC
    `).all();
  },

  // Expand a single event record with any stations/time blocks that belong to it.
  getEventById: (id) => {
    return db.prepare(`
      SELECT
        e.event_id, e.name, e.description, e.date_start, e.date_end,
        COALESCE(e.is_published, 0) AS is_published,
        s.station_id,
        s.name AS station_name,
        s.description AS station_description,
        s.description_overview AS station_description_overview,
        s.description_tasks AS station_description_tasks,
        tb.block_id, tb.start_time, tb.end_time, tb.capacity_needed,
        COALESCE(r.cnt, 0) AS reserved_count,
        CASE WHEN COALESCE(r.cnt, 0) >= tb.capacity_needed THEN 1 ELSE 0 END AS is_full
      FROM events e
      LEFT JOIN stations s ON s.event_id = e.event_id
      LEFT JOIN time_blocks tb ON tb.station_id = s.station_id
      LEFT JOIN (
        SELECT block_id, COUNT(*) AS cnt
        FROM reservations
        GROUP BY block_id
      ) r ON r.block_id = tb.block_id
      WHERE e.event_id = ?
      -- Prefer explicit station_order when present, fall back to station_id for deterministic ordering
      ORDER BY COALESCE(s.station_order, 0), datetime(tb.start_time) ASC
    `).all(id);
  },

  // Fetch one station alongside its blocks for edit forms and API responses.
  getStationWithBlocks: (id) => {
    return db.prepare(`
      SELECT
        s.station_id,
        s.event_id,
        s.name AS station_name,
        s.description AS station_description,
        s.description_overview AS station_description_overview,
        s.description_tasks AS station_description_tasks,
        tb.block_id, tb.start_time, tb.end_time, tb.capacity_needed,
        COALESCE(r.cnt, 0) AS reserved_count,
        CASE WHEN COALESCE(r.cnt, 0) >= tb.capacity_needed THEN 1 ELSE 0 END AS is_full
      FROM stations s
      LEFT JOIN time_blocks tb ON tb.station_id = s.station_id
      LEFT JOIN (
        SELECT block_id, COUNT(*) AS cnt
        FROM reservations
        GROUP BY block_id
      ) r ON r.block_id = tb.block_id
      WHERE s.station_id = ?
      ORDER BY datetime(tb.start_time) ASC
    `).all(id);
  },

  // Pull back every reservation for an event so the admin UI can display rosters.
  getEventReservations: (eventId) => {
    return db.prepare(`
      SELECT
        r.reservation_id,
        tb.block_id,
        v.volunteer_id,
        v.name AS volunteer_name,
        v.email AS volunteer_email,
        v.phone_number AS volunteer_phone,
        r.reservation_date
      FROM time_blocks tb
      JOIN stations s ON s.station_id = tb.station_id
      JOIN events e ON e.event_id = s.event_id
      JOIN reservations r ON r.block_id = tb.block_id
      JOIN volunteers v ON v.volunteer_id = r.volunteer_id
      WHERE e.event_id = ?
      ORDER BY datetime(tb.start_time) ASC, datetime(r.reservation_date) ASC
    `).all(eventId);
  },

  // Read a reservation plus volunteer record for edit/move flows.
  getReservationById: (reservationId) => {
    return db.prepare(`
      SELECT
        r.reservation_id,
        r.block_id,
        v.volunteer_id,
        v.name AS volunteer_name,
        v.email AS volunteer_email,
        v.phone_number AS volunteer_phone,
        tb.station_id,
        tb.start_time,
        tb.end_time,
        tb.capacity_needed
      FROM reservations r
      JOIN volunteers v ON v.volunteer_id = r.volunteer_id
      JOIN time_blocks tb ON tb.block_id = r.block_id
      WHERE r.reservation_id = ?
    `).get(reservationId);
  },

  // Update the volunteer table when admins change contact details.
  updateVolunteer: (volunteerId, name, email, phone) => {
    try {
      const res = db.prepare(`
        UPDATE volunteers
        SET name = ?, email = ?, phone_number = ?
        WHERE volunteer_id = ?
      `).run(name, email, phone, volunteerId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error updating volunteer: ' + e.message);
    }
  },

  // Remove a volunteer reservation from a time block.
  deleteReservation: (reservationId) => {
    try {
      const res = db.prepare(`DELETE FROM reservations WHERE reservation_id = ?`).run(reservationId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error deleting reservation: ' + e.message);
    }
  },

  // Atomically move a reservation to a new block while enforcing capacity & duplicate rules.
  moveReservation: (reservationId, newBlockId) => {
    const tx = db.transaction((rid, blockId) => {
      const reservation = db.prepare(`
        SELECT r.reservation_id, r.block_id, r.volunteer_id
        FROM reservations r
        WHERE r.reservation_id = ?
      `).get(rid);
      if (!reservation) throw createError(404, 'Reservation not found.');

      if (reservation.block_id === blockId) return { changes: 0 };

      const targetBlock = db.prepare(`SELECT capacity_needed FROM time_blocks WHERE block_id = ?`).get(blockId);
      if (!targetBlock) throw createError(404, 'Target time block not found.');

      const currentCountRow = db.prepare(`SELECT COUNT(*) AS cnt FROM reservations WHERE block_id = ?`).get(blockId);
      const currentCount = (currentCountRow && currentCountRow.cnt) || 0;
      if (currentCount >= Number(targetBlock.capacity_needed)) {
        throw createError(409, 'Target time block is already full.');
      }

      const duplicate = db.prepare(`SELECT 1 FROM reservations WHERE volunteer_id = ? AND block_id = ?`).get(reservation.volunteer_id, blockId);
      if (duplicate) {
        throw createError(409, 'Volunteer already assigned to the selected time block.');
      }

      db.prepare(`UPDATE reservations SET block_id = ?, reservation_date = datetime('now') WHERE reservation_id = ?`).run(blockId, rid);
      return { changes: 1 };
    });

    return tx(reservationId, newBlockId);
  },

  // Create
  createEvent: (name, description, startTxt, endTxt) => {
    try {
      const res = db.prepare(`
        INSERT INTO events (name, description, date_start, date_end, is_published)
        VALUES (?, ?, ?, ?, 0)
      `).run(name, description, startTxt, endTxt);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error creating event: ' + e.message);
    }
  },

  // Insert a station and auto-increment the display order for the parent event.
  createStation: (eventId, name, overview, tasks) => {
    try {
      const combinedDescription = [overview, tasks].filter(Boolean).join('\n\n');
      const res = db.prepare(`
        INSERT INTO stations (event_id, name, description, description_overview, description_tasks, station_order)
        VALUES (
          ?, ?, ?, ?, ?,
          COALESCE((SELECT MAX(station_order) FROM stations WHERE event_id = ?), -1) + 1
        )
      `).run(eventId, name, combinedDescription, overview || null, tasks || null, eventId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error creating station: ' + e.message);
    }
  },

  // Add a time block with the requested capacity under a station.
  createTimeBlock: (stationId, startTxt, endTxt, capacity) => {
    try {
      const res = db.prepare(`
        INSERT INTO time_blocks (station_id, start_time, end_time, capacity_needed)
        VALUES (?, ?, ?, ?)
      `).run(stationId, startTxt, endTxt, capacity);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error creating time block: ' + e.message);
    }
  },

  // Update
  // Apply a partial update to an event record.
  updateEvent: (eventId, patch) => {
    const fields = [];
    const values = [];
    if (patch.name !== undefined) { fields.push(`name = ?`); values.push(patch.name); }
    if (patch.description !== undefined) { fields.push(`description = ?`); values.push(patch.description); }
    if (patch.date_start !== undefined) { fields.push(`date_start = ?`); values.push(patch.date_start); }
    if (patch.date_end !== undefined) { fields.push(`date_end = ?`); values.push(patch.date_end); }
    if (fields.length === 0) return { changes: 0, lastInsertRowid: 0 };
    values.push(eventId);
    try {
      const res = db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE event_id = ?`).run(values);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error updating event: ' + e.message);
    }
  },

  // Toggle whether an event is visible to the public sign-up page.
  setEventPublish: (eventId, isPublished) => {
    try {
      const res = db.prepare(`UPDATE events SET is_published = ? WHERE event_id = ?`).run(isPublished ? 1 : 0, eventId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error setting publish: ' + e.message);
    }
  },

  // Persist edits to a station's descriptive fields.
  updateStation: (stationId, name, overview, tasks) => {
    try {
      const combinedDescription = [overview, tasks].filter(Boolean).join('\n\n');
      const res = db.prepare(`
        UPDATE stations
        SET name = ?, description = ?, description_overview = ?, description_tasks = ?
        WHERE station_id = ?
      `).run(name, combinedDescription, overview || null, tasks || null, stationId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error updating station: ' + e.message);
    }
  },

  // Apply a partial update to a time block entry.
  updateTimeBlock: (blockId, patch) => {
    const fields = [];
    const values = [];
    if (patch.start_time !== undefined) { fields.push(`start_time = ?`); values.push(patch.start_time); }
    if (patch.end_time !== undefined) { fields.push(`end_time = ?`); values.push(patch.end_time); }
    if (patch.capacity_needed !== undefined) { fields.push(`capacity_needed = ?`); values.push(patch.capacity_needed); }
    if (fields.length === 0) return { changes: 0, lastInsertRowid: 0 };
    values.push(blockId);
    try {
      const res = db.prepare(`UPDATE time_blocks SET ${fields.join(', ')} WHERE block_id = ?`).run(values);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error updating time block: ' + e.message);
    }
  },

  // Delete
  // Cascade-delete an event, removing dependent stations, blocks, and reservations.
  deleteEvent: (id) => {
    try {
      const txn = db.transaction((eventId) => {
        db.prepare(`
          DELETE FROM reservations
          WHERE block_id IN (
            SELECT block_id FROM time_blocks
            WHERE station_id IN (SELECT station_id FROM stations WHERE event_id = ?)
          )
        `).run(eventId);
        db.prepare(`
          DELETE FROM time_blocks
          WHERE station_id IN (SELECT station_id FROM stations WHERE event_id = ?)
        `).run(eventId);
        db.prepare(`DELETE FROM stations WHERE event_id = ?`).run(eventId);
        const res = db.prepare(`DELETE FROM events WHERE event_id = ?`).run(eventId);
        return res;
      });
      const res = txn(id);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error deleting event: ' + e.message);
    }
  },

  // Delete a station and its blocks/reservations via a transaction.
  deleteStation: (id) => {
    try {
      const txn = db.transaction((stationId) => {
        db.prepare(`DELETE FROM reservations WHERE block_id IN (SELECT block_id FROM time_blocks WHERE station_id = ?)`).run(stationId);
        db.prepare(`DELETE FROM time_blocks WHERE station_id = ?`).run(stationId);
        const res = db.prepare(`DELETE FROM stations WHERE station_id = ?`).run(stationId);
        return res;
      });
      const res = txn(id);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error deleting station: ' + e.message);
    }
  },

  // Delete a single time block and any attached reservations.
  deleteTimeBlock: (blockId) => {
    try {
      const txn = db.transaction((bid) => {
        db.prepare(`DELETE FROM reservations WHERE block_id = ?`).run(bid);
        const res = db.prepare(`DELETE FROM time_blocks WHERE block_id = ?`).run(bid);
        return res;
      });
      const res = txn(blockId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error deleting time block: ' + e.message);
    }
  },
  // Update station ordering for an event. Accepts array of { station_id, station_order }
  updateStationsOrder: (pairs) => {
    try {
      const tx = db.transaction((list) => {
        const stmt = db.prepare(`UPDATE stations SET station_order = ? WHERE station_id = ?`);
        for (const p of list) {
          stmt.run(p.station_order, p.station_id);
        }
        return { changes: list.length };
      });
      return tx(pairs);
    } catch (e) {
      throw createError(500, 'DB error updating station order: ' + e.message);
    }
  },
};

// ---------- Public DAL ----------
const publicDal = {
  // Only published events are listed publicly
  listUpcomingEvents: () => {
    return db.prepare(`
      SELECT event_id, name, description, date_start, date_end
      FROM events
      WHERE COALESCE(is_published, 0) = 1
        AND datetime(date_end) >= datetime('now')
      ORDER BY datetime(date_start) ASC
    `).all();
  },

  // Minimal event lookup used when building volunteer dashboards.
  getEventBasic: (eventId) => {
    return db.prepare(`
      SELECT event_id, name, description, date_start, date_end,
             COALESCE(is_published, 0) AS is_published
      FROM events
      WHERE event_id = ?
    `).get(eventId);
  },

  // Full event detail (stations + blocks) for the public signup page.
  getEventForPublic: (eventId) => {
    return db.prepare(`
      SELECT
        e.event_id, e.name, e.description, e.date_start, e.date_end,
        s.station_id,
        s.name AS station_name,
        s.description AS station_description,
        s.description_overview AS station_description_overview,
        s.description_tasks AS station_description_tasks,
        tb.block_id, tb.start_time, tb.end_time, tb.capacity_needed,
        COALESCE(r.cnt, 0) AS reserved_count,
        CASE WHEN COALESCE(r.cnt, 0) >= tb.capacity_needed THEN 1 ELSE 0 END AS is_full
      FROM events e
      LEFT JOIN stations s ON s.event_id = e.event_id
      LEFT JOIN time_blocks tb ON tb.station_id = s.station_id
      LEFT JOIN (
        SELECT block_id, COUNT(*) AS cnt
        FROM reservations
        GROUP BY block_id
      ) r ON r.block_id = tb.block_id
      WHERE e.event_id = ?
        AND COALESCE(e.is_published, 0) = 1
      ORDER BY COALESCE(s.station_order, 0), datetime(tb.start_time) ASC
    `).all(eventId);
  },

  // Convenience helpers around volunteers and reservations -------------------
  getVolunteerByEmail: (email) => {
    return db.prepare(`SELECT * FROM volunteers WHERE email = ?`).get(email);
  },

  createVolunteer: (name, email, phone) => {
    try {
      const res = db.prepare(`
        INSERT INTO volunteers (name, email, phone_number)
        VALUES (?, ?, ?)
      `).run(name, email, phone);
      return mapRun(res);
    } catch (e) {
      const existing = db.prepare(`SELECT * FROM volunteers WHERE email = ?`).get(email);
      if (existing) return { changes: 0, lastInsertRowid: existing.volunteer_id, existing: true };
      throw createError(500, 'DB error creating volunteer: ' + e.message);
    }
  },

  getReservationCountForBlock: (blockId) => {
    const row = db.prepare(`SELECT COUNT(*) AS cnt FROM reservations WHERE block_id = ?`).get(blockId);
    return (row && row.cnt) || 0;
  },

  createReservation: (volunteerId, blockId) => {
    try {
      const res = db.prepare(`
        INSERT INTO reservations (volunteer_id, block_id, reservation_date)
        VALUES (?, ?, datetime('now'))
      `).run(volunteerId, blockId);
      return mapRun(res);
    } catch (e) {
      throw createError(500, 'DB error creating reservation: ' + e.message);
    }
  },

  // Reserve one or more slots, reusing the volunteer record if the email exists.
  reserveVolunteerSlots: (volunteer, blockIds) => {
    const tx = db.transaction((v, ids) => {
      let volunteerId;
      const existing = publicDal.getVolunteerByEmail(v.email);
      if (existing) {
        volunteerId = existing.volunteer_id;
        db.prepare(`UPDATE volunteers SET name = ?, phone_number = ? WHERE volunteer_id = ?`)
          .run(v.name, v.phone, volunteerId);
      } else {
        const r = publicDal.createVolunteer(v.name, v.email, v.phone);
        volunteerId = r.lastInsertRowid;
      }

      if (!ids.length) return { created: 0, volunteerId, eventId: null };

      const blockEventStmt = db.prepare(`
        SELECT tb.block_id, s.event_id
        FROM time_blocks tb
        JOIN stations s ON s.station_id = tb.station_id
        WHERE tb.block_id = ?
      `);

      let eventId = null;
      let created = 0;
      ids.forEach((blockId) => {
        const info = blockEventStmt.get(blockId);
        if (!info) throw createError(404, `Time block ${blockId} not found.`);
        if (eventId === null) eventId = info.event_id;
        if (eventId !== info.event_id) {
          throw createError(400, 'All selected time blocks must belong to the same event.');
        }

        const dup = db.prepare(`SELECT 1 FROM reservations WHERE volunteer_id = ? AND block_id = ?`).get(volunteerId, blockId);
        if (dup) return;

        const tb = db.prepare(`SELECT capacity_needed FROM time_blocks WHERE block_id = ?`).get(blockId);
        const cap = Number(tb.capacity_needed);
        const current = publicDal.getReservationCountForBlock(blockId);
        if (current >= cap) {
          throw createError(409, 'One or more selected time blocks are already full.');
        }

        publicDal.createReservation(volunteerId, blockId);
        created += 1;
      });

      return { created, volunteerId, eventId };
    });

    const result = tx(volunteer, blockIds);
    return {
      count: result.created,
      volunteerId: result.volunteerId,
      eventId: result.eventId,
      blockIds
    };
  },

  // Tokens power "manage my reservation" links. We keep one per volunteer/event.
  storeVolunteerToken: (token, volunteerId, eventId, expiresAt) => {
    const txn = db.transaction(() => {
      db.prepare(`DELETE FROM volunteer_tokens WHERE volunteer_id = ? AND event_id = ?`).run(volunteerId, eventId);
      db.prepare(`
        INSERT INTO volunteer_tokens (token, volunteer_id, event_id, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(token, volunteerId, eventId, expiresAt || null);
    });
    txn();
    return token;
  },

  getVolunteerToken: (token) => {
    const row = db.prepare(`
      SELECT
        t.token,
        t.volunteer_id,
        t.event_id,
        t.expires_at,
        v.name AS volunteer_name,
        v.email AS volunteer_email,
        v.phone_number AS volunteer_phone,
        e.name AS event_name,
        e.date_start,
        e.date_end,
        COALESCE(e.is_published, 0) AS is_published
      FROM volunteer_tokens t
      JOIN volunteers v ON v.volunteer_id = t.volunteer_id
      JOIN events e ON e.event_id = t.event_id
      WHERE t.token = ?
    `).get(token);
    return row || null;
  },

  getTokenForVolunteerEvent: (volunteerId, eventId) => {
    return db.prepare(`
      SELECT token, volunteer_id, event_id, expires_at
      FROM volunteer_tokens
      WHERE volunteer_id = ? AND event_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `).get(volunteerId, eventId);
  },

  getVolunteerReservationsForEvent: (volunteerId, eventId) => {
    return db.prepare(`
      SELECT
        r.reservation_id,
        r.block_id,
        tb.start_time,
        tb.end_time,
        s.station_id,
        s.name AS station_name
      FROM reservations r
      JOIN time_blocks tb ON tb.block_id = r.block_id
      JOIN stations s ON s.station_id = tb.station_id
      WHERE r.volunteer_id = ?
        AND s.event_id = ?
      ORDER BY datetime(tb.start_time) ASC
    `).all(volunteerId, eventId);
  },

  // Replace an existing reservation set with a new collection of time blocks.
  replaceVolunteerReservations: (volunteerId, eventId, nextBlockIds) => {
    const tx = db.transaction((vid, eid, ids) => {
      const distinctIds = Array.from(new Set(ids.map(Number).filter(Number.isFinite)));

      const existingRows = db.prepare(`
        SELECT r.reservation_id, r.block_id
        FROM reservations r
        JOIN time_blocks tb ON tb.block_id = r.block_id
        JOIN stations s ON s.station_id = tb.station_id
        WHERE r.volunteer_id = ? AND s.event_id = ?
      `).all(vid, eid);

      const existingIds = existingRows.map(row => row.block_id);
      const toRemove = existingIds.filter(id => !distinctIds.includes(id));
      const toAdd = distinctIds.filter(id => !existingIds.includes(id));

      const blockEventStmt = db.prepare(`
        SELECT tb.block_id, s.event_id, tb.capacity_needed
        FROM time_blocks tb
        JOIN stations s ON s.station_id = tb.station_id
        WHERE tb.block_id = ?
      `);

      toAdd.forEach(blockId => {
        const info = blockEventStmt.get(blockId);
        if (!info) throw createError(404, `Time block ${blockId} not found.`);
        if (info.event_id !== eid) {
          throw createError(400, 'Selected time blocks must belong to the same event.');
        }
        const cap = Number(info.capacity_needed);
        const current = publicDal.getReservationCountForBlock(blockId);
        if (current >= cap) {
          throw createError(409, 'One or more selected time blocks are already full.');
        }
      });

      toRemove.forEach(blockId => {
        db.prepare(`DELETE FROM reservations WHERE volunteer_id = ? AND block_id = ?`).run(vid, blockId);
      });

      toAdd.forEach(blockId => {
        publicDal.createReservation(vid, blockId);
      });

      return { added: toAdd.length, removed: toRemove.length };
    });

    return tx(volunteerId, eventId, nextBlockIds);
  }
};

module.exports = {
  admin,
  public: publicDal,
};
