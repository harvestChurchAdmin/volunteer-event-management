// src/services/adminService.js
// -----------------------------------------------------------------------------
// Centralised business logic that powers the admin dashboard. Controllers call
// into this module to manipulate events, stations, time blocks, and volunteer
// reservations. The functions below provide validation, input normalization,
// and richer data shaping on top of the raw DAL helpers.
// -----------------------------------------------------------------------------
const dal = require('../db/dal');
const createError = require('http-errors');

/**
 * Normalise a datetime-local string (e.g. `YYYY-MM-DDTHH:mm`) into a canonical
 * `YYYY-MM-DD HH:mm` format so the database always receives consistent values.
 * The helper intentionally avoids timezone conversion because the UI supplies
 * pre-localised values and the schema stores them verbatim.
 */
function toCanonicalLocalString(s) {
  if (!s || typeof s !== 'string') throw createError(400, 'Datetime is required.');
  // Accept "YYYY-MM-DDTHH:mm" (from <input type="datetime-local">) or "YYYY-MM-DD HH:mm"
  const t = s.trim().replace('T', ' ');
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw createError(400, `Invalid datetime format: ${s}`);
  const [_, Y, M, D, h, m2, sec] = m;
  // Normalize to seconds-less canonical text
  return `${Y}-${M}-${D} ${h}:${m2}`;
}

/**
 * Compare two canonical local datetime strings without performing timezone
 * calculations. We convert the plain text into UTC timestamps using the same
 * components which keeps chronological ordering intact for comparison logic.
 */
function cmpLocal(a, b) {
  // Compare two "YYYY-MM-DD HH:mm" strings without timezone by mapping to UTC with the same components
  const A = a.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})$/);
  const B = b.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})$/);
  const Au = Date.UTC(+A[1], +A[2]-1, +A[3], +A[4], +A[5]);
  const Bu = Date.UTC(+B[1], +B[2]-1, +B[3], +B[4], +B[5]);
  return Au - Bu;
}

/**
 * Retrieve all events for the admin dashboard sorted chronologically so that
 * coordinators always see the next event first.
 */
function getDashboardData() {
  return dal.admin.getAllEvents().sort((a, b) => {
    const aDate = new Date(a.date_start).getTime();
    const bDate = new Date(b.date_start).getTime();
    return aDate - bDate;
  });
}

/**
 * Resolve full event details for admins including stations, time blocks, and
 * volunteer reservations. The DAL returns a flattened join; this function
 * reshapes the data into a nested structure that the views expect.
 */
function getEventDetailsForAdmin(eventId) {
  const rows = dal.admin.getEventById(eventId);
  if (!rows || rows.length === 0) return null;

  const reservations = dal.admin.getEventReservations ? dal.admin.getEventReservations(eventId) : [];
  const resByBlock = new Map();
  reservations.forEach(r => {
    if (!resByBlock.has(r.block_id)) resByBlock.set(r.block_id, []);
    resByBlock.get(r.block_id).push({
      reservation_id: r.reservation_id,
      volunteer_id: r.volunteer_id,
      name: r.volunteer_name,
      email: r.volunteer_email,
      phone: r.volunteer_phone,
      reservation_date: r.reservation_date
    });
  });

  const event = {
    event_id: rows[0].event_id,
    name: rows[0].name,
    description: rows[0].description,
    date_start: rows[0].date_start, // already local text
    date_end: rows[0].date_end,     // already local text
    is_published: !!rows[0].is_published,
    stations: []
  };

  const stationMap = new Map();
  rows.forEach(row => {
    if (!row.station_id) return;
    if (!stationMap.has(row.station_id)) {
      const about = row.station_description_overview || row.station_description || '';
      const duties = row.station_description_tasks || '';
      stationMap.set(row.station_id, {
        station_id: row.station_id,
        name: row.station_name || row.s_name || row.name,
        about,
        duties,
        description: about,
        time_blocks: []
      });
    }
    if (row.block_id) {
      stationMap.get(row.station_id).time_blocks.push({
        block_id: row.block_id,
        start_time: row.start_time, // local text
        end_time: row.end_time,     // local text
        capacity_needed:
          typeof row.capacity_needed !== 'undefined'
            ? row.capacity_needed
            : row.capacity,
        reserved_count: row.reserved_count || 0,
        is_full: !!row.is_full,
        reservations: resByBlock.get(row.block_id) || []
      });
    }
  });

  event.stations = Array.from(stationMap.values());
  return event;
}

/**
 * Create a flat, sorted roster for CSV export including volunteer contact info.
 * Sorted by time block start (datetime), then station name, then volunteer name.
 */
function getEventRosterForExport(eventId, opts = {}) {
  const event = getEventDetailsForAdmin(eventId);
  if (!event) return null;

  const rows = [];
  const stations = Array.isArray(event.stations) ? event.stations : [];
  stations.forEach(station => {
    const blocks = Array.isArray(station.time_blocks) ? station.time_blocks : [];
    blocks.forEach(block => {
      const reservations = Array.isArray(block.reservations) ? block.reservations : [];
      reservations.forEach(res => {
        rows.push({
          // Event
          event_id: event.event_id,
          event_name: event.name,
          event_description: event.description || '',
          event_start: event.date_start,
          event_end: event.date_end,
          // Station
          station_id: station.station_id,
          station_name: station.name,
          station_about: station.about || '',
          station_duties: station.duties || '',
          // Block
          block_id: block.block_id,
          block_start: block.start_time,
          block_end: block.end_time,
          capacity_needed: block.capacity_needed,
          reserved_count: Array.isArray(block.reservations) ? block.reservations.length : (block.reserved_count || 0),
          is_full: !!block.is_full,
          // Volunteer & reservation
          reservation_id: res.reservation_id,
          reservation_date: res.reservation_date,
          volunteer_id: res.volunteer_id,
          volunteer_name: res.name,
          volunteer_email: res.email,
          volunteer_phone: res.phone || ''
        });
      });
    });
  });

  // Filtering ---------------------------------------------------------------
  const stationFilter = Array.isArray(opts.stationIds) ? opts.stationIds.map(Number).filter(Number.isFinite) : [];
  let startCanon = null;
  let endCanon = null;
  try { if (opts.start) startCanon = toCanonicalLocalString(String(opts.start)); } catch (_) {}
  try { if (opts.end) endCanon = toCanonicalLocalString(String(opts.end)); } catch (_) {}

  const filtered = rows.filter(r => {
    if (stationFilter.length && !stationFilter.includes(Number(r.station_id))) return false;
    if (startCanon && cmpLocal(toCanonicalLocalString(r.block_start), startCanon) < 0) return false;
    if (endCanon && cmpLocal(toCanonicalLocalString(r.block_start), endCanon) > 0) return false;
    return true;
  });

  // Sorting -----------------------------------------------------------------
  const sortMode = String(opts.sort || 'time_station_name');
  const cmpText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);

  const sorted = filtered.sort((a, b) => {
    if (sortMode === 'station_time_name') {
      const s = cmpText(a.station_name, b.station_name); if (s) return s;
      const t = cmpLocal(toCanonicalLocalString(a.block_start), toCanonicalLocalString(b.block_start)); if (t) return t;
      return cmpText(a.volunteer_name, b.volunteer_name);
    }
    if (sortMode === 'station_only') {
      const s = cmpText(a.station_name, b.station_name); if (s) return s;
      return cmpText(a.volunteer_name, b.volunteer_name);
    }
    // Default: time -> station -> volunteer
    const t = cmpLocal(toCanonicalLocalString(a.block_start), toCanonicalLocalString(b.block_start)); if (t) return t;
    const s = cmpText(a.station_name, b.station_name); if (s) return s;
    return cmpText(a.volunteer_name, b.volunteer_name);
  });

  return { event, rows: sorted };
}

/**
 * Load a single station and its time blocks for the admin detail view. Similar
 * to `getEventDetailsForAdmin` but scoped to one station.
 */
function getStationDetailsForAdmin(stationId) {
  const rows = dal.admin.getStationWithBlocks(stationId);
  if (!rows || rows.length === 0) return null;

  const station = {
    station_id: rows[0].station_id,
    name: rows[0].station_name || rows[0].name,
    about: rows[0].station_description_overview || rows[0].station_description || '',
    duties: rows[0].station_description_tasks || '',
    description: rows[0].station_description_overview || rows[0].station_description || '',
    time_blocks: []
  };

  rows.forEach(r => {
    if (r.block_id) {
      station.time_blocks.push({
        block_id: r.block_id,
        start_time: r.start_time,
        end_time: r.end_time,
        capacity_needed:
          typeof r.capacity_needed !== 'undefined'
            ? r.capacity_needed
            : r.capacity,
        reserved_count: r.reserved_count || 0,
        is_full: !!r.is_full
      });
    }
  });

  return station;
}

/**
 * Create a new event after validating the payload. Dates must be provided and
 * the end needs to be chronologically after the start.
 */
function createEvent(arg) {
  const data = typeof arg === 'object' && arg !== null ? arg : {};
  const { name, description, date_start, date_end } = data;

  if (!name || !date_start || !date_end) {
    throw createError(400, 'Event name, start, and end are required.');
  }
  const startTxt = toCanonicalLocalString(date_start);
  const endTxt = toCanonicalLocalString(date_end);
  if (cmpLocal(startTxt, endTxt) >= 0) throw createError(400, 'Event end must be after start.');

  return dal.admin.createEvent(name, description || '', startTxt, endTxt);
}

/**
 * Update an existing event with optional name/description/datetime changes.
 * Only fields present in the payload are persisted.
 */
function updateEvent(eventId, data) {
  if (!eventId) throw createError(400, 'Event ID required.');
  const patch = {};
  if (data.name !== undefined) patch.name = String(data.name || '');
  if (data.description !== undefined) patch.description = String(data.description || '');
  if (data.date_start) patch.date_start = toCanonicalLocalString(data.date_start);
  if (data.date_end) patch.date_end = toCanonicalLocalString(data.date_end);
  if (patch.date_start && patch.date_end && cmpLocal(patch.date_start, patch.date_end) >= 0) {
    throw createError(400, 'Event end must be after start.');
  }
  return dal.admin.updateEvent(eventId, patch);
}

/**
 * Toggle the publish state of an event so it shows up (or disappears) from the
 * public signup experience.
 */
function setEventPublish(eventId, isPublished) {
  if (!eventId) throw createError(400, 'Event ID required.');
  return dal.admin.setEventPublish(eventId, !!isPublished);
}

/**
 * Create a station for a given event. When a `copyStationId` is provided we
 * mirror the source station's descriptive text and time blocks so coordinators
 * can quickly spin up similar stations (e.g. multiple check-in desks).
 */
function createStation(arg1, name, description, copyStationId) {
  let eventId, nm, about, duties, copyFrom;
  if (typeof arg1 === 'object' && arg1 !== null) {
    eventId = arg1.event_id || arg1.eventId;
    nm = arg1.name;
    about = arg1.about ?? arg1.description_overview ?? arg1.summary ?? arg1.description;
    duties = arg1.duties ?? arg1.description_tasks ?? arg1.expectations ?? '';
    copyFrom = arg1.copyStationId || arg1.copy_from_station_id;
  } else {
    eventId = arg1;
    nm = name;
    about = description;
    duties = '';
    copyFrom = copyStationId;
  }
  if (!eventId || !nm) {
    throw createError(400, 'Station requires eventId and name.');
  }

  let sourceStation = null;
  const copyId = copyFrom ? Number(copyFrom) : null;

  if (copyId) {
    const rows = dal.admin.getStationWithBlocks(copyId);
    if (!rows || !rows.length) {
      throw createError(404, 'Source station not found.');
    }
    if (String(rows[0].event_id) !== String(eventId)) {
      throw createError(400, 'You can only copy stations within the same event.');
    }
    sourceStation = {
      about: rows[0].station_description_overview || rows[0].station_description || rows[0].description || '',
      duties: rows[0].station_description_tasks || '',
      blocks: rows
        .filter(row => row.block_id)
        .map(row => ({
          start_time: row.start_time,
          end_time: row.end_time,
          capacity_needed: typeof row.capacity_needed !== 'undefined' ? row.capacity_needed : row.capacity
        }))
    };
  }

  const finalAbout = (about && about.toString().trim().length)
    ? about.toString().trim()
    : (sourceStation && sourceStation.about) || '';
  const finalDuties = (duties && duties.toString().trim().length)
    ? duties.toString().trim()
    : (sourceStation && sourceStation.duties) || '';

  const result = dal.admin.createStation(eventId, nm.trim(), finalAbout, finalDuties);
  const newStationId = result.lastInsertRowid;

  if (sourceStation && sourceStation.blocks.length) {
    try {
      sourceStation.blocks.forEach(block => {
        dal.admin.createTimeBlock(newStationId, block.start_time, block.end_time, block.capacity_needed);
      });
    } catch (err) {
      try {
        dal.admin.deleteStation(newStationId);
      } catch (cleanupErr) {
        console.error('Failed to cleanup station after copy failure:', cleanupErr);
      }
      throw err;
    }
  }

  return { station_id: newStationId };
}

/**
 * Update an existing station's name and descriptive fields.
 */
function updateStation(stationId, data) {
  if (!stationId) throw createError(400, 'Station ID required.');
  const nm = data.name ? String(data.name).trim() : '';
  const about = data.about ?? data.description_overview ?? data.summary ?? data.description ?? '';
  const duties = data.duties ?? data.description_tasks ?? data.expectations ?? '';
  if (!nm) throw createError(400, 'Station name is required.');
  return dal.admin.updateStation(
    stationId,
    nm,
    String(about ?? '').trim(),
    String(duties ?? '').trim()
  );
}

/**
 * Create a time block under a station ensuring the times are valid and the
 * capacity is a positive integer.
 */
function createTimeBlock(data) {
  const { station_id, start_time, end_time, capacity_needed } = data || {};
  if (!station_id || !start_time || !end_time || typeof capacity_needed === 'undefined') {
    throw createError(400, 'All time block fields are required.');
  }
  const startTxt = toCanonicalLocalString(start_time);
  const endTxt = toCanonicalLocalString(end_time);
  if (cmpLocal(startTxt, endTxt) >= 0) throw createError(400, 'End time must be after start time.');
  const cap = Number(capacity_needed);
  if (!Number.isFinite(cap) || cap < 1) throw createError(400, 'Capacity must be a positive number.');

  return dal.admin.createTimeBlock(station_id, startTxt, endTxt, cap);
}

/**
 * Update a time block with any subset of start/end/capacity while reusing the
 * same validation routine as creation.
 */
function updateTimeBlock(blockId, data) {
  if (!blockId) throw createError(400, 'Time block ID required.');
  const patch = {};
  if (data.start_time) patch.start_time = toCanonicalLocalString(data.start_time);
  if (data.end_time) patch.end_time = toCanonicalLocalString(data.end_time);
  if (data.capacity_needed !== undefined) {
    const cap = Number(data.capacity_needed);
    if (!Number.isFinite(cap) || cap < 1) throw createError(400, 'Capacity must be a positive number.');
    patch.capacity_needed = cap;
  }
  if (patch.start_time && patch.end_time && cmpLocal(patch.start_time, patch.end_time) >= 0) {
    throw createError(400, 'End time must be after start time.');
  }
  return dal.admin.updateTimeBlock(blockId, patch);
}

/**
 * Add a reservation directly to a time block on behalf of a volunteer. The DAL
 * handles duplicate detection so we simply forward the normalized payload.
 */
function addReservationToBlock(blockId, volunteer) {
  if (!blockId) throw createError(400, 'Time block ID required.');
  if (!volunteer || !volunteer.name || !volunteer.email) {
    throw createError(400, 'Volunteer name and email are required.');
  }
  const result = dal.public.reserveVolunteerSlots({
    name: volunteer.name,
    email: volunteer.email,
    phone: volunteer.phone || ''
  }, [blockId]);
  if (!result || !result.count) {
    throw createError(409, 'Volunteer is already registered for this time block.');
  }
  return result;
}

/**
 * Update volunteer contact details and optionally move the reservation to a
 * different time block (while respecting capacity limits).
 */
function updateReservation(reservationId, payload) {
  if (!reservationId) throw createError(400, 'Reservation ID required.');
  const reservation = dal.admin.getReservationById(reservationId);
  if (!reservation) throw createError(404, 'Reservation not found.');

  const name = payload.name || reservation.volunteer_name;
  const email = payload.email || reservation.volunteer_email;
  const phone = payload.phone || reservation.volunteer_phone || '';

  if (!name || !email) throw createError(400, 'Volunteer name and email are required.');

  try {
    dal.admin.updateVolunteer(reservation.volunteer_id, name, email, phone);
  } catch (err) {
    if (err && err.message && /UNIQUE/i.test(err.message)) {
      throw createError(409, 'Another volunteer already uses that email address.');
    }
    throw err;
  }

  if (payload.block_id && Number(payload.block_id) !== reservation.block_id) {
    dal.admin.moveReservation(reservationId, Number(payload.block_id));
  }

  return true;
}

/**
 * Remove a reservation entirely from a time block.
 */
function deleteReservation(reservationId) {
  if (!reservationId) throw createError(400, 'Reservation ID required.');
  return dal.admin.deleteReservation(reservationId);
}

/** Convenience wrappers for deletes – DAL already validates referential cleanup. */
const deleteEvent = (id) => dal.admin.deleteEvent(id);
const deleteStation = (id) => dal.admin.deleteStation(id);
const deleteTimeBlock = (id) => dal.admin.deleteTimeBlock(id);

module.exports = {
  getDashboardData,
  getEventDetailsForAdmin,
  getStationDetailsForAdmin,
  /**
   * Reorder stations for an event. Expects an array of { station_id, station_order }.
   */
  reorderStations: (eventId, orderArray) => {
    if (!eventId) throw createError(400, 'Event ID required.');
    if (!Array.isArray(orderArray)) throw createError(400, 'Order payload must be an array.');
    const pairs = orderArray.map(item => {
      const station_id = Number(item.station_id);
      const station_order = Number(item.station_order);
      if (!Number.isFinite(station_id) || !Number.isFinite(station_order)) {
        throw createError(400, 'Invalid station payload.');
      }
      return { station_id, station_order };
    });
    return dal.admin.updateStationsOrder(pairs);
  },
  createEvent,
  updateEvent,
  setEventPublish,
  createStation,
  updateStation,
  createTimeBlock,
  updateTimeBlock,
  addReservationToBlock,
  updateReservation,
  deleteReservation,
  deleteEvent,
  deleteStation,
  deleteTimeBlock,
  getEventRosterForExport,
};
