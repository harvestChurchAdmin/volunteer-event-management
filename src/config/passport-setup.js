// src/config/passport-setup.js (Definitive Final Version)
const passport = require('passport');
let GoogleStrategy;
try {
  GoogleStrategy = require('passport-google-oauth20').Strategy;
} catch (e) {
  // If the package isn't installed or can't be loaded, we'll warn below.
}

const GOOGLE_WORKSPACE_DOMAIN = (process.env.GOOGLE_WORKSPACE_DOMAIN || '').toLowerCase();
const OAUTH_DEBUG = process.env.DEBUG_OAUTH === '1';

const hasGoogleCredentials = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_BASE_URL;

if (!hasGoogleCredentials || !GoogleStrategy) {
  console.warn('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_BASE_URL to enable admin login.');
  // Provide minimal serialize/deserialize so passport usage doesn't crash when the strategy is missing.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
} else {
  passport.use(
    new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: `${process.env.APP_BASE_URL}/admin/auth/google/callback`,
            hd: GOOGLE_WORKSPACE_DOMAIN || undefined
        },
        (accessToken, refreshToken, profile, done) => {
            if (OAUTH_DEBUG) {
              const maskedEmail = profile && profile.emails && profile.emails[0] ? String(profile.emails[0].value || '').replace(/@.*/, '@***') : '(none)';
              console.log('[OAuth] Google profile received for user:', maskedEmail);
            }

            // Validate using the email address (more reliable than 'hd').
            const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

            if (!GOOGLE_WORKSPACE_DOMAIN) {
                if (OAUTH_DEBUG) console.log('No GOOGLE_WORKSPACE_DOMAIN configured; allowing admin login.');
                return done(null, profile);
            }

            if (email && email.toLowerCase().endsWith('@' + GOOGLE_WORKSPACE_DOMAIN)) {
                if (OAUTH_DEBUG) console.log(`\u2705 SUCCESS: Email domain accepted for '@${GOOGLE_WORKSPACE_DOMAIN}'.`);
                return done(null, profile);
            }

            console.error(`\u274c FAILURE: User's email does not belong to the required domain '${GOOGLE_WORKSPACE_DOMAIN}'.`);
            const errorMessage = `Access denied. Only accounts from the ${GOOGLE_WORKSPACE_DOMAIN} domain are authorized.`;
            return done(null, false, { message: errorMessage });
        }
    )
  );

  passport.serializeUser((user, done) => {
      // Save a minimal user object to the session to keep it small.
      const userSession = {
          id: user.id,
          displayName: user.displayName,
          email: user.emails && user.emails[0] ? user.emails[0].value : undefined
      };
      done(null, userSession);
  });

  passport.deserializeUser((userSession, done) => {
      done(null, userSession);
  });
}
