// src/controllers/publicController.js
// ----------------------------------
// Handles the public-facing flow: listing events, rendering the event detail,
// processing volunteer sign-ups, and serving the manage-signup experience.
const { validationResult } = require('express-validator');
const publicService = require('../services/publicService');
const createError = require('http-errors');
const helpers = require('../views/helpers');

function redactRequestBody(body) {
    if (!body || typeof body !== 'object') return {};
    try {
        const clone = JSON.parse(JSON.stringify(body));
        ['name', 'email', 'phone', 'phone_number'].forEach((k) => {
            if (Object.prototype.hasOwnProperty.call(clone, k)) clone[k] = '[redacted]';
        });
        if (clone.dish_notes) clone.dish_notes = '[redacted]';
        return clone;
    } catch (_) {
        return {};
    }
}

exports.showEventsList = (req, res, next) => {
    try {
        const events = publicService.getPublicEvents();
        if (!events || events.length === 0) {
            // If there are no published events, render a friendly landing page
            return res.render('public/no-events', { title: 'No Volunteer Opportunities' });
        }
        const sortedEvents = events.slice().sort((a, b) => {
            const at = new Date(a.date_start).getTime();
            const bt = new Date(b.date_start).getTime();
            if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
            if (Number.isNaN(at)) return 1;
            if (Number.isNaN(bt)) return -1;
            return at - bt;
        });
        const envBase = (process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
        const requestHost = req.get && req.get('host') ? req.get('host') : '';
        const requestBase = (req.protocol && requestHost) ? `${req.protocol}://${requestHost}` : '';
        const shareBaseUrl = envBase || requestBase || '';
        res.render('public/events-list', {
            title: 'Upcoming Events',
            events: sortedEvents,
            helpers,
            shareBaseUrl
        });
    } catch (error) { 
        console.error("--- ERROR IN showEventsList Controller ---", error);
        next(error); 
    }
};

// Volunteer help (public)
exports.showVolunteerHelp = (req, res, next) => {
  try {
    res.render('public/help-volunteers', {
      title: 'Volunteer Help',
      helpers
    });
  } catch (error) {
    console.error('--- ERROR IN showVolunteerHelp ---', error);
    next(error);
  }
};

exports.showEventDetail = (req, res, next) => {
    try {
        const eventId = req.params.eventId;
        const preview = !!(req.user && (req.query.preview === '1' || String(req.query.preview).toLowerCase() === 'true'));
        // Optional return link (when coming from admin preview). Keep internal paths only.
        let backTo = null;
        if (typeof req.query.return === 'string' && req.query.return.startsWith('/')) {
          backTo = req.query.return;
        }
        const event = preview
          ? publicService.getEventDetailsForPreview(eventId)
          : publicService.getEventDetailsForPublic(eventId);
        if (!event) {
            req.flash('error', 'That event is no longer available.');
            return res.redirect('/events');
        }
        const debugLayout = String(req.query.debug || '').toLowerCase() === 'layout';
        // Do not pass messages explicitly; app middleware exposes res.locals.messages
        res.render('public/event-detail', { title: event.name, event, helpers, preview, backTo, debugLayout, query: req.query });
    } catch (error) {
        console.error(`--- ERROR IN showEventDetail for eventId: ${req.params.eventId} ---`, error);
        next(error);
    }
};

exports.handleSignup = async (req, res, next) => {
    const errors = validationResult(req);
    let payload = {};
    try {
      payload = JSON.parse(req.body.registration_payload || '{}');
    } catch (_) {
      payload = {};
    }
    payload.eventId = payload.eventId || req.body.eventId || req.body.event_id || req.body.event;
    if (!payload.registrant) {
      payload.registrant = {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone
      };
    }

    if (!payload.eventId) {
      if (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production') {
        try { req.flash('debug', JSON.stringify({ error: 'Missing eventId', body: redactRequestBody(req.body) }, null, 2)); } catch (_) {}
      }
      return res.redirect('/events');
    }

    if (!errors.isEmpty()) {
      const errs = errors.array();
      errs.forEach(error => req.flash('error', error.msg));
      const evt = publicService.getEventDetailsForPublic(payload.eventId);
      return res.status(400).render('public/event-detail', {
        title: (evt && evt.name) || 'Event',
        event: evt,
        helpers,
        draftRegistration: payload,
        messages: req.flash()
      });
    }

    try {
      const result = await publicService.processVolunteerSignup(payload);
      res.render('public/success', {
        title: 'Sign-up Successful!',
        count: 1,
        manageUrl: result.manageUrl,
        alreadyRegistered: result.alreadyRegistered,
        volunteerEmail: payload.registrant ? payload.registrant.email : req.body.email
      });
    } catch (error) {
      console.error(`--- ERROR IN handleSignup for eventId: ${payload.eventId} ---`, error);
      req.flash('error', error.message || 'We could not process your signup.');
      if (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production') {
        const debugBlob = {
          eventId: payload.eventId,
          status: error.status || undefined,
          code: error.code || undefined,
          message: error.message,
        };
        try { req.flash('debug', JSON.stringify(debugBlob, null, 2)); } catch (_) {}
        const evt = publicService.getEventDetailsForPublic(payload.eventId);
        return res.status(error.status || 400).render('public/event-detail', { title: (evt && evt.name) || 'Event', event: evt, messages: req.flash(), helpers, draftRegistration: payload });
      }
      res.redirect(`/events/${payload.eventId}`);
    }
};

exports.showManageSignup = (req, res, next) => {
    try {
        const token = req.params.token;
        const context = publicService.getManageContext(token);
        if (!context) {
            req.flash('error', 'That management link is no longer valid.');
            return res.redirect('/events');
        }

        const { event, participants, registration } = context;
        const assignmentsData = {
          participants: participants || []
        };
        const selectedBlockIds = [];
        (participants || []).forEach(p => {
          (p.schedule || []).forEach(a => selectedBlockIds.push(a.time_block_id));
          (p.potluck || []).forEach(a => selectedBlockIds.push(a.item_id));
        });
        const emailPreferences = {
            optIn: Number(registration.email_opt_in ?? 1) !== 0,
            optedOutAt: registration.email_opted_out_at || null,
            optedOutReason: registration.email_opt_out_reason || null,
            volunteerEmail: registration.registrant_email || ''
        };

        const debugCapacity = String(req.query.debug || '').toLowerCase() === 'capacity';

        res.render('public/manage-signup', {
            title: `Manage ${event.name}`,
            event,
            token,
            registration,
            participants,
            assignmentsJson: JSON.stringify(assignmentsData),
            selectedBlockIds,
            helpers,
            emailPreferences,
            query: req.query,
            debugCapacity
        });
    } catch (error) {
        console.error('--- ERROR IN showManageSignup ---', error);
        next(error);
    }
};

exports.updateManageSignup = async (req, res, next) => {
  const token = req.params.token;
  const action = req.body.action || '';
  const debugCapacity = String(req.query.debug || '').toLowerCase() === 'capacity';

  try {
    if (action === 'rename') {
      await publicService.renameParticipant(token, Number(req.body.participantId || req.body.participant_id), req.body.name || req.body.participant_name);
      req.flash('success', 'Participant name updated.');
      return res.redirect(`/manage/${token}`);
    }
    if (action === 'add') {
      await publicService.addParticipant(token, req.body.name || req.body.participant_name);
      req.flash('success', 'Participant added.');
      return res.redirect(`/manage/${token}`);
    }
    if (action === 'merge') {
      await publicService.mergeParticipants(token, Number(req.body.fromId || req.body.from_id), Number(req.body.toId || req.body.to_id));
      req.flash('success', 'Participants merged.');
      return res.redirect(`/manage/${token}`);
    }
    if (action === 'delete') {
      const removeAssignments = String(req.body.removeAssignments || req.body.remove_assignments || '') === '1';
      await publicService.deleteParticipant(token, Number(req.body.participantId || req.body.participant_id), removeAssignments);
      req.flash('success', 'Participant removed.');
      return res.redirect(`/manage/${token}`);
    }

    let payload = {};
    try {
      payload = JSON.parse(req.body.registration_payload || '{}');
    } catch (_) {
      payload = {};
    }
    const scheduleAssignments = payload.scheduleAssignments || [];
    const potluckAssignments = payload.potluckAssignments || [];

    const result = await publicService.updateVolunteerSignup(token, scheduleAssignments, potluckAssignments, { debugCapacity });
    if (debugCapacity && result && result.debug) {
      req.flash('debug', JSON.stringify(result.debug, null, 2));
    }
    if (result && result.deleted) {
      req.flash('success', 'Your selections have been cleared.');
      return res.redirect(result.eventId ? `/events/${result.eventId}` : '/events');
    }
    req.flash('success', 'Your volunteer schedule has been updated. Check your email for confirmation.');
    res.redirect(`/manage/${token}${debugCapacity ? '?debug=capacity' : ''}`);
  } catch (error) {
    console.error('--- ERROR IN updateManageSignup ---', error);
    req.flash('error', error.message || 'Unable to update your schedule.');
    if (debugCapacity && error && error.debug) {
      try {
        req.flash('debug', JSON.stringify(error.debug, null, 2));
      } catch (_) {}
    }
    if (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production') {
      const debugBlob = {
        token,
        status: error.status || undefined,
        code: error.code || undefined,
        message: error.message,
      };
      try { req.flash('debug', JSON.stringify(debugBlob, null, 2)); } catch (_) {}
    }
    if (error.status === 410) {
      return res.redirect('/events');
    }
    res.redirect(`/manage/${token}${debugCapacity ? '?debug=capacity' : ''}`);
  }
};

exports.updateEmailPreference = async (req, res) => {
  const token = req.params.token;
  const preference = req.body.preference;
  const reason = typeof req.body.reason === 'string' ? req.body.reason : '';
  try {
    const result = await publicService.updateEmailPreference(token, preference, reason);
    if (result.optedIn) {
      req.flash('success', 'Volunteer emails have been resumed for this contact.');
    } else {
      req.flash('success', 'You have unsubscribed from future volunteer emails.');
    }
    return res.redirect(`/manage/${token}#email-preferences`);
  } catch (error) {
    console.error('--- ERROR IN updateEmailPreference ---', error);
    req.flash('error', error.message || 'Unable to update email preferences.');
    if (error.status === 410) {
      return res.redirect('/events');
    }
    return res.redirect(`/manage/${token}`);
  }
};

// AJAX: check if a registration already exists for this event/email; if so, send manage link(s).
exports.checkDuplicateRegistration = async (req, res) => {
  try {
    const eventId = req.body.eventId || req.body.event_id || req.body.event;
    const email = (req.body.email || '').trim();
    if (!eventId || !email) {
      return res.status(400).json({ ok: false, error: 'Missing event or email.' });
    }
    const result = await publicService.checkDuplicateRegistration(eventId, email);
    return res.json(result);
  } catch (err) {
    console.error('--- ERROR IN checkDuplicateRegistration ---', err);
    return res.status(500).json({ ok: false, error: 'Unable to check duplicates.' });
  }
};

// Sends a manage-link reminder email if a volunteer signup exists for the
// given event and email. Responds with a generic success either way.
exports.sendManageReminder = async (req, res) => {
  const eventId = req.body.eventId || req.body.event_id || req.body.event;
  const email = (req.body.email || '').trim();
  try {
    if (!eventId || !email) {
      // generic message, do not reveal specifics
      try { req.flash('success', 'If we found a signup for that email, we sent a manage link. Please check your inbox.'); } catch (_) {}
      return res.redirect(eventId ? `/events/${eventId}` : '/events');
    }
    await publicService.sendManageReminder(email, eventId);
    try { req.flash('success', 'If we found a signup for that email, we sent a manage link. Please check your inbox.'); } catch (_) {}
    return res.redirect(`/events/${eventId}`);
  } catch (error) {
    console.error('--- ERROR IN sendManageReminder ---', error);
    try { req.flash('success', 'If we found a signup for that email, we sent a manage link. Please check your inbox.'); } catch (_) {}
    return res.redirect(eventId ? `/events/${eventId}` : '/events');
  }
};
