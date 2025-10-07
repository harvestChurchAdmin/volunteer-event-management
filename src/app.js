// src/app.js
// -----------------
// Central Express configuration for both the public sign-up experience and the admin
// dashboard. We keep the module free of business logic so request handling can be
// unit-tested via the controllers/services layer. Anything mounted here affects the
// entire application lifecycle (e.g., security middleware, session handling).
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const createError = require('http-errors');
const flash = require('connect-flash');

require('./config/passport-setup');

const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.set('trust proxy', 1);

app.get('/favicon.ico', (req, res) => res.status(204).send());

// Baseline security headers. Only the assets that truly need to be third-party hosted
// are permitted in the CSP declarations below.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "script-src": ["'self'", "https://cdn.jsdelivr.net"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "https://tithely-media-prod.s3.us-west-1.wasabisys.com"],
        },
    },
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Expose user and flash messages to all views
// Make the authenticated user and any flash messages available to all templates.
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.messages = req.flash();
    next();
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/signup', apiLimiter);

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.use((req, res, next) => {
    next(createError(404, `Page Not Found: ${req.originalUrl}`));
});

app.use((err, req, res, next) => {
    console.error("--- GLOBAL ERROR HANDLER ---");
    console.error("Timestamp:", new Date().toISOString());
    console.error("Route:", req.method, req.originalUrl);
    console.error("Status:", err.status || 500);
    console.error("Message:", err.message);
    if (process.env.NODE_ENV === 'development') {
        console.error("Stack:", err.stack);
    }
    console.error("--------------------------");

    res.locals.message = err.message;
    res.locals.error = process.env.NODE_ENV === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
