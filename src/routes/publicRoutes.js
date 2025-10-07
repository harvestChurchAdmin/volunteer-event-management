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

// Manage existing signup via emailed token
router.get('/manage/:token', publicController.showManageSignup);
router.post('/manage/:token', publicController.updateManageSignup);

// --- CRITICAL FIX ---
// Signup submission endpoint. It is now a single, clean route.
// The eventId and blockIds are now passed in the request body, not as URL params.
router.post('/signup', validateSignup, publicController.handleSignup);

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
