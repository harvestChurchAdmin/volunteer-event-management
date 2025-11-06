// src/routes/publicRoutes.js (Definitive Final Version)
const express = require('express');
const router = express.Router();
const passport = require('passport');
const publicController = require('../controllers/publicController');
const { validateSignup } = require('../middleware/validators');

// Home page redirects to the events list
router.get('/', (req, res) => res.redirect('/events'));

// Public login page for administrators
router.get('/login', (req, res) => {
    res.render('login', { title: 'Admin Login', messages: req.flash('error') });
});

// List of all upcoming events
router.get('/events', publicController.showEventsList);

// Detail page for a specific event with signup forms
router.get('/events/:eventId', publicController.showEventDetail);

// Lost manage link reminder — define BEFORE /manage/:token to avoid capturing "remind" as a token
router.get('/manage/remind', (req, res) => {
  // No UI here; this route exists to prevent /manage/:token from capturing it on GET
  return res.redirect('/events');
});
router.post('/manage/remind', async (req, res) => {
  try {
    await publicController.sendManageReminder(req, res);
  } catch (err) {
    console.error('--- ERROR IN /manage/remind ---', err);
    // Always show the same message to the user
    try { req.flash('success', 'If we found a signup for that email, we sent a manage link. Please check your inbox.'); } catch (_) {}
    const eventId = req.body && (req.body.eventId || req.body.event_id || req.body.event);
    return res.redirect(eventId ? `/events/${eventId}` : '/events');
  }
});

// Manage existing signup via emailed token
router.get('/manage/:token', publicController.showManageSignup);
router.post(
  '/manage/:token',
  (req, res, next) => {
    const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
    if (debug) {
      try { req.flash('debug', JSON.stringify({ note: 'Incoming POST /manage body snapshot', body: req.body }, null, 2)); } catch (_) {}
    }
    next();
  },
  publicController.updateManageSignup
);

// --- CRITICAL FIX ---
// Signup submission endpoint. It is now a single, clean route.
// The eventId and blockIds are now passed in the request body, not as URL params.
// Debug body snapshot (only in dev/DEBUG_SIGNUP) then run validation + handler
router.post(
  '/signup',
  (req, res, next) => {
    const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
    if (debug) {
      try {
        req.flash('debug', JSON.stringify({
          note: 'Incoming POST /signup body snapshot',
          body: req.body
        }, null, 2));
      } catch (_) {}
    }
    next();
  },
  validateSignup,
  publicController.handleSignup
);
// Temporary debug endpoint in case a redirect lands on GET /signup
router.get('/signup', (req, res) => {
  const debug = (process.env.DEBUG_SIGNUP === '1' || process.env.NODE_ENV !== 'production');
  if (debug) {
    req.flash('error', 'Direct GET /signup is not supported.');
    req.flash('debug', JSON.stringify({
      note: 'Hit GET /signup. This usually means a prior POST redirected here. Check the debug block for the POST handler.',
      path: '/signup',
    }, null, 2));
  }
  return res.redirect('/events');
});

// --- Authentication routes (Google OAuth) ---
// Initiate OAuth flow. We keep this at /auth/google so public links are simple.
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// OAuth callback. Passport's callbackURL is set to `${APP_BASE_URL}/admin/auth/google/callback`.
router.get('/admin/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', failureFlash: true }),
    (req, res) => {
        // Successful auth -> admin dashboard
        res.redirect('/admin/dashboard');
    }
);

// Logout route used by the header
router.get('/logout', (req, res, next) => {
    // passport@0.7 requires a callback for logout
    req.logout(function(err) {
        if (err) return next(err);
        // Destroy session and redirect home
        req.session && req.session.destroy(() => res.redirect('/'));
    });
});

module.exports = router;
