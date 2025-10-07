// src/controllers/publicController.js
// ----------------------------------
// Handles the public-facing flow: listing events, rendering the event detail,
// processing volunteer sign-ups, and serving the manage-signup experience.
const { validationResult } = require('express-validator');
const publicService = require('../services/publicService');
const createError = require('http-errors');
const helpers = require('../views/helpers');

exports.showEventsList = (req, res, next) => {
    try {
        const events = publicService.getPublicEvents();
        if (!events || events.length === 0) {
            // If there are no published events, render a friendly landing page
            return res.render('public/no-events', { title: 'No Volunteer Opportunities' });
        }
        res.render('public/events-list', { title: 'Upcoming Events', events });
    } catch (error) { 
        console.error("--- ERROR IN showEventsList Controller ---", error);
        next(error); 
    }
};

exports.showEventDetail = (req, res, next) => {
    try {
        const eventId = req.params.eventId;
        const event = publicService.getEventDetailsForPublic(eventId);
        if (!event) {
            req.flash('error', 'That event is no longer available.');
            return res.redirect('/events');
        }
        res.render('public/event-detail', { title: event.name, event, messages: req.flash(), helpers });
    } catch (error) {
        console.error(`--- ERROR IN showEventDetail for eventId: ${req.params.eventId} ---`, error);
        next(error);
    }
};

exports.handleSignup = async (req, res, next) => {
    const errors = validationResult(req);
    const { eventId, blockIds } = req.body;

    // Redirect back to the event page if the eventId is missing
    if (!eventId) {
        return next(createError(400, 'Event ID was not provided in the signup form.'));
    }

    if (!blockIds || blockIds.length === 0) {
        req.flash('error', 'You must select at least one time slot.');
        return res.redirect(`/events/${eventId}`);
    }

    if (!errors.isEmpty()) {
        errors.array().forEach(error => req.flash('error', error.msg));
        return res.redirect(`/events/${eventId}`);
    }
    
    try {
        const volunteerData = { name: req.body.name, email: req.body.email, phone: req.body.phone };
        const result = await publicService.processVolunteerSignup(volunteerData, blockIds);
        res.render('public/success', {
          title: 'Sign-up Successful!',
          count: result.count,
          manageUrl: result.manageUrl,
          alreadyRegistered: result.alreadyRegistered,
          volunteerEmail: volunteerData.email
        });
    } catch (error) {
        console.error(`--- ERROR IN handleSignup for eventId: ${eventId} ---`, error);
        req.flash('error', error.message);
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

        res.render('public/manage-signup', {
            title: `Manage ${event.name}`,
            event,
            token,
            reservations,
            selectedBlockIds,
            helpers,
            messages: req.flash()
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
        await publicService.updateVolunteerSignup(token, blockIds);
        req.flash('success', 'Your volunteer schedule has been updated. Check your email for confirmation.');
        res.redirect(`/manage/${token}`);
    } catch (error) {
        console.error('--- ERROR IN updateManageSignup ---', error);
        req.flash('error', error.message || 'Unable to update your schedule.');
        if (error.status === 410) {
            return res.redirect('/events');
        }
        res.redirect(`/manage/${token}`);
    }
};
