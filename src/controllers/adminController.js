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
    const { start_time, end_time, capacity_needed, event_id } = req.body;
    adminService.createTimeBlock({ station_id: stationId, start_time, end_time, capacity_needed });
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
