// src/controllers/adminController.js
const adminService = require('../services/adminService');
const { validationResult } = require('express-validator');

/**
 * Render the administrative dashboard with a chronological list of events.
 */
exports.showDashboard = (req, res, next) => {
  try {
    const events = adminService.getDashboardData();
    res.render('admin/dashboard', { title: 'Admin Dashboard', events, messages: req.flash() });
  } catch (e) { next(e); }
};

/**
 * Display the management screen for a specific event, including stations,
 * blocks, and volunteer assignments.
 */
exports.showEventDetail = (req, res, next) => {
  try {
    const event = adminService.getEventDetailsForAdmin(req.params.eventId);
    if (!event) return next(new Error('Event not found'));
    res.render('admin/event-detail', { title: `Manage Event`, event, messages: req.flash() });
  } catch (e) { next(e); }
};

/**
 * Export the event roster (volunteers) as a CSV, arranged by time, date, and station.
 */
exports.exportEventCsv = (req, res, next) => {
  try {
    const { eventId } = req.params;
    // Parse export options from query
    const q = req.query || {};
    // fields may be repeated or comma-separated
    let fields = [];
    if (Array.isArray(q.fields)) {
      fields = q.fields.flatMap(f => String(f).split(',')).map(s => s.trim()).filter(Boolean);
    } else if (typeof q.fields === 'string') {
      fields = String(q.fields).split(',').map(s => s.trim()).filter(Boolean);
    }
    const stationIds = [];
    const addStationId = (v) => { const n = Number(v); if (Number.isFinite(n)) stationIds.push(n); };
    if (Array.isArray(q.station_id)) q.station_id.forEach(addStationId);
    else if (q.station_id) String(q.station_id).split(',').forEach(addStationId);
    const start = q.start || q.start_time || '';
    const end = q.end || q.end_time || '';
    const sort = q.sort || 'time_station_name';
    const payload = adminService.getEventRosterForExport(eventId, { stationIds, start, end, sort });
    if (!payload || !payload.event) return next(new Error('Event not found'));

    const { event, rows } = payload;
    const filenameSafe = String(event.name || 'event').replace(/[^A-Za-z0-9._-]+/g, '_');
    const filename = `${filenameSafe}_${event.event_id}.csv`;

    // CSV header
    const headers = [
      'Event',
      'Event Start',
      'Event End',
      'Station',
      'Item Title',
      'Feeds',
      'Block Start',
      'Block End',
      'Volunteer Name',
      'Volunteer Email',
      'Volunteer Phone',
      'Reservation Date',
      'Dish Name'
    ];

    function csvEscape(v) {
      const s = v == null ? '' : String(v);
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const lines = [];
    lines.push(headers.map(csvEscape).join(','));
    rows.forEach(r => {
      lines.push([
        event.name,
        event.date_start,
        event.date_end,
        r.station_name || r.station,
        r.block_title || '',
        r.servings || '',
        r.block_start,
        r.block_end,
        r.volunteer_name,
        r.volunteer_email,
        r.volunteer_phone,
        r.reservation_date,
        r.reservation_note || ''
      ].map(csvEscape).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) { next(e); }
};

/**
 * Advanced CSV export with selectable fields, sorting, and basic filters.
 */
exports.exportEventCsvAdvanced = (req, res, next) => {
  try {
    const { eventId } = req.params;
    const q = req.query || {};

    // fields may be repeated or comma-separated
    let fields = [];
    if (Array.isArray(q.fields)) {
      fields = q.fields.flatMap(f => String(f).split(',')).map(s => s.trim()).filter(Boolean);
    } else if (typeof q.fields === 'string') {
      fields = String(q.fields).split(',').map(s => s.trim()).filter(Boolean);
    }

    // Filters
    const stationIds = [];
    const addStationId = (v) => { const n = Number(v); if (Number.isFinite(n)) stationIds.push(n); };
    if (Array.isArray(q.station_id)) q.station_id.forEach(addStationId);
    else if (q.station_id) String(q.station_id).split(',').forEach(addStationId);
    const start = q.start || q.start_time || '';
    const end = q.end || q.end_time || '';
    const sort = q.sort || 'time_station_name';

    const payload = adminService.getEventRosterForExport(eventId, { stationIds, start, end, sort });
    if (!payload || !payload.event) return next(new Error('Event not found'));

    const { event, rows } = payload;
    const filenameSafe = String(event.name || 'event').replace(/[^A-Za-z0-9._-]+/g, '_');
    const filename = `${filenameSafe}_${event.event_id}.csv`;

    // Field mapping and default set
    const FIELD_MAP = {
      event_id: ['event_id', 'Event ID'],
      event_name: ['event_name', 'Event'],
      event_type: ['event_type', 'Event Type'],
      event_description: ['event_description', 'Event Description'],
      event_start: ['event_start', 'Event Start'],
      event_end: ['event_end', 'Event End'],
      station_id: ['station_id', 'Station ID'],
      station_name: ['station_name', 'Station/Category'],
      station_about: ['station_about', 'Station About'],
      station_duties: ['station_duties', 'Station Duties'],
      block_id: ['block_id', 'Block ID'],
      item_title: ['block_title', 'Item Title'],
      servings: ['servings', 'Feeds'],
      servings_min: ['servings_min', 'Feeds Min'],
      servings_max: ['servings_max', 'Feeds Max'],
      block_start: ['block_start', 'Block Start'],
      block_end: ['block_end', 'Block End'],
      capacity_needed: ['capacity_needed', 'Slots/Units'],
      reserved_count: ['reserved_count', 'Reserved Count'],
      is_full: ['is_full', 'Is Full'],
      reservation_id: ['reservation_id', 'Reservation ID'],
      reservation_date: ['reservation_date', 'Reservation Date'],
      volunteer_id: ['volunteer_id', 'Volunteer ID'],
      volunteer_name: ['volunteer_name', 'Volunteer Name'],
      volunteer_email: ['volunteer_email', 'Volunteer Email'],
      volunteer_phone: ['volunteer_phone', 'Volunteer Phone'],
      dish_name: ['reservation_note', 'Dish Name']
    };

    const DEFAULT_FIELDS = (String(event.signup_mode || '') === 'potluck')
      ? [
          'event_name', 'event_start', 'event_end',
          'station_name', 'item_title', 'block_start', 'block_end',
          'volunteer_name', 'volunteer_email', 'volunteer_phone',
          'reservation_date'
        ]
      : [
          'event_name', 'event_start', 'event_end',
          'station_name', 'block_start', 'block_end',
          'volunteer_name', 'volunteer_email', 'volunteer_phone',
          'reservation_date'
        ];

    const chosen = (fields && fields.length ? fields : DEFAULT_FIELDS)
      .filter(key => FIELD_MAP[key])
      .map(key => ({ key, prop: FIELD_MAP[key][0], header: FIELD_MAP[key][1] }));

    function csvEscapeSafe(v) {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // mitigate CSV injection
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    const lines = [];
    lines.push(chosen.map(c => csvEscapeSafe(c.header)).join(','));
    rows.forEach(r => {
      lines.push(
        chosen.map(c => csvEscapeSafe(r[c.prop])).join(',')
      );
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) { next(e); }
};

/**
 * Render a print-friendly roster view that admins can "Save as PDF" via the browser.
 * Shows event header, then stations with their time blocks and volunteer contact info.
 */
exports.exportEventPrintView = (req, res, next) => {
  try {
    const { eventId } = req.params;
    const helpers = require('../views/helpers');
    const event = adminService.getEventDetailsForAdmin(eventId);
    if (!event) return next(new Error('Event not found'));

    // Sort blocks within each station chronologically for consistent output
    const stations = (Array.isArray(event.stations) ? event.stations : [])
      .map(st => {
        const blocks = Array.isArray(st.time_blocks) ? st.time_blocks.slice() : [];
        blocks.sort((a, b) => {
          const A = helpers.canonicalLocal(a.start_time);
          const B = helpers.canonicalLocal(b.start_time);
          return A.localeCompare(B);
        });
        return { ...st, time_blocks: blocks };
      });

    res.render('admin/event-print', {
      title: `Printable Roster`,
      event: { ...event, stations },
      helpers,
      messages: req.flash()
    });
  } catch (e) { next(e); }
};

// ----------------------------------------------------------------------------- 
// Create
// -----------------------------------------------------------------------------
/**
 * Create a new event using the admin service, then redirect back to dashboard.
 */
exports.createEvent = (req, res, next) => {
  try {
    adminService.createEvent(req.body);
    req.flash('success', 'Event created successfully.');
    res.redirect('/admin/dashboard');
  } catch (e) { next(e); }
};

/**
 * Create a station under an event. Supports cloning an existing station when
 * the payload contains `copyStationId`.
 */
exports.createStation = (req, res, next) => {
  try {
    const { eventId } = req.params;
    adminService.createStation({
      ...req.body,
      event_id: eventId,
      copyStationId: req.body.copyStationId
    });
    req.flash('success', 'Station created successfully.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

/**
 * Insert a new time block beneath a station. Redirects to the parent event.
 */
exports.createTimeBlock = (req, res, next) => {
  try {
    const { stationId } = req.params;
    const { start_time, end_time, capacity_needed, event_id, title, servings_min, servings_max } = req.body;
    adminService.createTimeBlock({ station_id: stationId, start_time, end_time, capacity_needed, title, servings_min, servings_max });
    req.flash('success', 'Time block created successfully.');
    res.redirect(`/admin/event/${event_id}`);
  } catch (e) { next(e); }
};

// ----------------------------------------------------------------------------- 
// Update
// -----------------------------------------------------------------------------
/**
 * Persist edits to the core event metadata (name, description, dates).
 */
exports.updateEvent = (req, res, next) => {
  try {
    const { eventId } = req.params;
    adminService.updateEvent(eventId, req.body);
    req.flash('success', 'Event updated.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

/**
 * Toggle event publication. Redirects to either the provided return path or
 * defaults back to the event page.
 */
exports.setPublish = (req, res, next) => {
  try {
    const { eventId } = req.params;
    const publish = req.body.publish === '1';
    adminService.setEventPublish(eventId, publish);
    req.flash('success', publish ? 'Event published.' : 'Event unpublished.');
    let redirectTo = req.body.redirectTo;

    if (!redirectTo) {
      const referer = req.get('referer');
      if (referer) {
        try {
          const parsed = new URL(referer);
          redirectTo = parsed.pathname + (parsed.search || '') + (parsed.hash || '');
        } catch (err) {
          redirectTo = null;
        }
      }
    }

    if (!redirectTo) {
      redirectTo = `/admin/event/${eventId}`;
    }

    res.redirect(redirectTo);
  } catch (e) { next(e); }
};

/**
 * Persist changes to a station's descriptive fields.
 */
exports.updateStation = (req, res, next) => {
  try {
    const { stationId } = req.params;
    const { eventId } = req.body;
    adminService.updateStation(stationId, req.body);
    req.flash('success', 'Station updated.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

/**
 * Update start/end/capacity for a time block.
 */
exports.updateTimeBlock = (req, res, next) => {
  try {
    const { blockId } = req.params;
    const { eventId } = req.body;
    adminService.updateTimeBlock(blockId, req.body);
    req.flash('success', 'Time block updated.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

/**
 * Add a volunteer to a time block directly from the admin screen.
 */
exports.addReservation = (req, res, next) => {
  try {
    const { blockId } = req.params;
    const { eventId, name, email, phone } = req.body;
    adminService.addReservationToBlock(blockId, { name, email, phone });
    req.flash('success', 'Volunteer added to time block.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) {
    next(e);
  }
};

/**
 * Update a volunteer's contact info or move them to another time block.
 */
exports.updateReservation = (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { eventId } = req.body;
    adminService.updateReservation(reservationId, req.body);
    req.flash('success', 'Volunteer details updated.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) {
    next(e);
  }
};

/**
 * Remove a volunteer from a time block.
 */
exports.deleteReservation = (req, res, next) => {
  try {
    const { reservationId } = req.params;
    const { eventId } = req.body;
    adminService.deleteReservation(reservationId);
    req.flash('success', 'Volunteer removed from time block.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

// ----------------------------------------------------------------------------- 
// Delete
// -----------------------------------------------------------------------------
/**
 * Delete an event and all related stations/blocks/reservations.
 */
exports.deleteEvent = (req, res, next) => {
  try {
    adminService.deleteEvent(req.params.eventId);
    req.flash('success', 'Event deleted.');
    res.redirect('/admin/dashboard');
  } catch (e) { next(e); }
};

/**
 * Delete a station and its time blocks.
 */
exports.deleteStation = (req, res, next) => {
  try {
    const { stationId } = req.params;
    const { eventId } = req.body;
    adminService.deleteStation(stationId);
    req.flash('success', 'Station deleted.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

/**
 * Delete a single time block from a station.
 */
exports.deleteTimeBlock = (req, res, next) => {
  try {
    const { blockId } = req.params;
    const { eventId } = req.body;
    adminService.deleteTimeBlock(blockId);
    req.flash('success', 'Time block deleted.');
    res.redirect(`/admin/event/${eventId}`);
  } catch (e) { next(e); }
};

// Reorder stations (expects JSON: { order: [{ station_id, station_order }, ...] })
/**
 * Persist drag-and-drop station ordering. Expects `{ order: [...] }` payload
 * from the client; responds with JSON for XHR consumption.
 */
exports.reorderStations = (req, res, next) => {
  try {
    const { eventId } = req.params;
    const payload = req.body && req.body.order ? req.body.order : null;
    adminService.reorderStations(eventId, payload);
    // Return JSON for XHR clients
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/**
 * Copy an event's structure (stations and time blocks) into a new draft event.
 */
exports.copyEvent = (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = adminService.copyEvent(eventId);
    req.flash('success', 'Event copied. New event is in Draft.');
    res.redirect('/admin/dashboard');
  } catch (e) { next(e); }
};
