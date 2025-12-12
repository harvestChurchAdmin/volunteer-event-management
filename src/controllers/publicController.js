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
    const eventId = req.body.eventId || req.body.event_id || req.body.event;
    // Accept both blockIds and blockIds[] field names; coerce single value to array
    let blockIds = [];
    if (Array.isArray(req.body.blockIds)) blockIds = req.body.blockIds;
    else if (typeof req.body.blockIds === 'string') blockIds = [req.body.blockIds];
    else if (Array.isArray(req.body['blockIds[]'])) blockIds = req.body['blockIds[]'];
    else if (typeof req.body['blockIds[]'] === 'string') blockIds = [req.body['blockIds[]']];

    // Redirect back to the event page if the eventId is missing (debug-friendly)
    if (!eventId) {
        if (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production') {
          try { req.flash('debug', JSON.stringify({ error: 'Missing eventId', body: redactRequestBody(req.body) }, null, 2)); } catch (_) {}
        }
        return res.redirect('/events');
    }

    if (!blockIds || blockIds.length === 0) {
        const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
        req.flash('error', 'You must select at least one time slot.');
        if (debug) {
          try { req.flash('debug', JSON.stringify({ error: 'No blockIds received', body: redactRequestBody(req.body) }, null, 2)); } catch (_) {}
          const evt = publicService.getEventDetailsForPublic(eventId);
          return res.status(400).render('public/event-detail', { title: (evt && evt.name) || 'Event', event: evt, messages: req.flash(), helpers });
        }
        return res.redirect(`/events/${eventId}`);
    }

    if (!errors.isEmpty()) {
        const errs = errors.array();
        const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
        errs.forEach(error => req.flash('error', error.msg));
        if (debug) {
          try { req.flash('debug', JSON.stringify({ validationErrors: errs, body: redactRequestBody(req.body) }, null, 2)); } catch (_) {}
        }

        const evt = publicService.getEventDetailsForPublic(eventId);
        if (!evt) {
          return res.redirect('/events');
        }

        const formDefaults = {
          name: (req.body && req.body.name) || '',
          email: (req.body && req.body.email) || '',
          phone: (req.body && req.body.phone) || ''
        };

        const selectedBlockIds = Array.isArray(blockIds) ? blockIds : [];

        const rawDishNotes = (req.body && req.body.dish_notes) || {};
        const draftDishNotes = {};
        if (rawDishNotes && typeof rawDishNotes === 'object') {
          Object.keys(rawDishNotes).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(rawDishNotes, key)) return;
            draftDishNotes[key] = String(rawDishNotes[key] || '');
          });
        }

        return res.status(400).render('public/event-detail', {
          title: (evt && evt.name) || 'Event',
          event: evt,
          helpers,
          formDefaults,
          selectedBlockIds,
          draftDishNotes,
          messages: req.flash()
        });
    }
    
    try {
        const volunteerData = { name: req.body.name, email: req.body.email, phone: req.body.phone };
        const dishNotes = req.body.dish_notes || {};
        const result = await publicService.processVolunteerSignup(volunteerData, blockIds, dishNotes);
        res.render('public/success', {
          title: 'Sign-up Successful!',
          count: result.count,
          manageUrl: result.manageUrl,
          alreadyRegistered: result.alreadyRegistered,
          volunteerEmail: volunteerData.email
        });
    } catch (error) {
        console.error(`--- ERROR IN handleSignup for eventId: ${eventId} ---`, error);
        const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
        req.flash('error', error.message || 'We could not process your signup.');
        if (debug) {
          const debugBlob = {
            eventId,
            blockIds,
            dish_notes: req.body && req.body.dish_notes ? '[redacted]' : undefined,
            status: error.status || undefined,
            code: error.code || undefined,
            message: error.message,
            };
          try { req.flash('debug', JSON.stringify(debugBlob, null, 2)); } catch (_) {}
          const evt = publicService.getEventDetailsForPublic(eventId);
          return res.status(error.status || 400).render('public/event-detail', { title: (evt && evt.name) || 'Event', event: evt, messages: req.flash(), helpers });
        }
        res.redirect(`/events/${eventId}`);
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

        const { event, reservations } = context;
        const selectedBlockIds = reservations.map(r => r.block_id);
        const emailPreferences = {
            optIn: Number(context.token.email_opt_in ?? 1) !== 0,
            optedOutAt: context.token.email_opted_out_at || null,
            optedOutReason: context.token.email_opt_out_reason || null,
            volunteerEmail: context.token.volunteer_email || ''
        };

        // Do not pass messages here; app middleware already exposed res.locals.messages
        // Passing messages: req.flash() would consume and clear success flashes before render.
        res.render('public/manage-signup', {
            title: `Manage ${event.name}`,
            event,
            token,
            reservations,
            selectedBlockIds,
            helpers,
            emailPreferences
        });
    } catch (error) {
        console.error('--- ERROR IN showManageSignup ---', error);
        next(error);
    }
};

exports.updateManageSignup = async (req, res, next) => {
  const token = req.params.token;
  const blockIds = Array.isArray(req.body.blockIds)
        ? req.body.blockIds
        : (req.body['blockIds[]'] ? [].concat(req.body['blockIds[]']) : []);

  try {
        const dishNotes = req.body.dish_notes || {};
        await publicService.updateVolunteerSignup(token, blockIds, dishNotes);
        req.flash('success', 'Your volunteer schedule has been updated. Check your email for confirmation.');
        res.redirect(`/manage/${token}`);
    } catch (error) {
        console.error('--- ERROR IN updateManageSignup ---', error);
        req.flash('error', error.message || 'Unable to update your schedule.');
        if (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production') {
          const debugBlob = {
            token,
            blockIds,
            dish_notes: req.body && req.body.dish_notes ? '[redacted]' : undefined,
            status: error.status || undefined,
            code: error.code || undefined,
            message: error.message,
          };
          try { req.flash('debug', JSON.stringify(debugBlob, null, 2)); } catch (_) {}
        }
        if (error.status === 410) {
            return res.redirect('/events');
        }
        res.redirect(`/manage/${token}`);
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
