// src/config/branding.js
// -----------------------------------------------------------------------------
// Centralized helper for branding-related values. All user-facing copy that
// references the hosting organization should flow through here rather than
// being hard-coded inside templates or services.

function clean(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : '';
}

function getBranding() {
  const appName = clean(process.env.APP_NAME) || 'Event Sign-up Manager';
  const orgName = clean(process.env.ORG_DISPLAY_NAME) || 'Your Organization';
  const copyrightHolder = clean(process.env.ORG_COPYRIGHT_HOLDER) || orgName;
  const tagline =
    clean(process.env.APP_TAGLINE) ||
    'Coordinate sign-ups with an accessible experience.';
  const logoUrl = clean(process.env.BRAND_LOGO_URL) || null;
  const faviconUrl = clean(process.env.BRAND_FAVICON_URL) || null;
  const homePath = clean(process.env.BRAND_HOME_PATH) || '/';
  // Optional color overrides for theming
  const brandColor = clean(process.env.BRAND_COLOR) || '';
  const brandStrongColor = clean(process.env.BRAND_COLOR_STRONG) || '';
  const accentColor = clean(process.env.ACCENT_COLOR) || '';

  return {
    appName,
    appTagline: tagline,
    orgName,
    copyrightHolder,
    logoUrl,
    faviconUrl,
    homePath,
    brandColor,
    brandStrongColor,
    accentColor,
  };
}

module.exports = {
  getBranding,
};
