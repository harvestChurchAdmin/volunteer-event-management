exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  // Remember where the user was trying to go so we can send them there after login.
  // Only store on GET requests to avoid redirecting to mutating routes.
  let nextUrl = '/admin/dashboard';
  try {
    if (req.method === 'GET' && req.originalUrl) {
      nextUrl = req.originalUrl;
      if (typeof req.session === 'object') {
        req.session.returnTo = nextUrl;
      }
    }
  } catch (_) {}
  // Public login page lives at /login — include ?next= as fallback in case session storage fails
  const loginUrl = `/login${nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : ''}`;
  res.redirect(loginUrl);
};
