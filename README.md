# Harvest Volunteer Management App

A Node.js/Express application that powers Harvest Church's volunteer scheduling flow. Volunteers sign up for event slots, receive confirmation & management links by email, and can revisit their reservation to make changes. Administrators manage events, stations, and slots via a Google-authenticated dashboard.

## Features

- Public sign-up page with multi-slot selection, duplicate detection, and confirmation email.
- Email management links so volunteers can update or cancel their reservations later.
- Admin dashboard protected by Google Workspace SSO (configurable via `GOOGLE_WORKSPACE_DOMAIN`).
- Station cloning to quickly duplicate time blocks when building schedules.
- SQLite backing store – no external database dependency.
- CSP-hardened Express stack with rate limiting, flash messaging, and structured errors.

## Requirements

- Node.js 18+
- npm 9+
- A Gmail (or SMTP) account suitable for sending transactional mail
- Google OAuth 2.0 credentials for administrators (optional for development)

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

### Environment variables

See `.env.example` for all available configuration values. At minimum set:

- `SESSION_SECRET`
- `MAIL_SERVICE` / `MAIL_USER` / `MAIL_PASS` (or `MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`)
- `MAIL_FROM` & `MAIL_REPLY_TO`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `GOOGLE_WORKSPACE_DOMAIN` (for production admin access)

Optional:

- `APP_BASE_URL` – defaults to `http://localhost:3000`; required for OAuth callbacks & email links.
- `MANAGE_TOKEN_TTL_DAYS` – expiration for volunteer management links (defaults to 30 days).
- `DB_PATH` – custom SQLite file location if you don't want `./db/volunteer.db`.

## Available Scripts

- `npm run dev` – start the server with nodemon and verbose logging.
- `npm start` – start the production server.
- `npm run init-db` – initialize or reset the SQLite schema.

## Architecture Notes

- **Controllers** contain minimal request plumbing and call into **services** for business logic.
- **DAL** (`src/db/dal.js`) is the only module that touches SQLite directly.
- **Views** are EJS templates; all share a consistent layout and use helpers from `src/views/helpers.js`.
- Email sending is abstracted in `src/utils/mailer.js`; in development emails are logged to stdout if no SMTP credentials are present.

## Testing

The project currently focuses on integration tests under `test/`. Future contributors are encouraged to add unit tests around services and controllers as features evolve.

## Deployment Checklist

- Set `NODE_ENV=production` and provide strong `SESSION_SECRET`.
- Configure mail credentials and `APP_BASE_URL` with the public domain.
- Ensure Google OAuth credentials are set for admin access.
- Run `npm run init-db` on the server to provision the schema.
- Use a process manager (PM2, systemd, etc.) to keep `npm start` running.

## Contributing

1. Fork the repository and create a feature branch (`git checkout -b feature/xyz`).
2. Run `npm install` and set up `.env` from `.env.example`.
3. Submit PRs with clear descriptions. Please include tests for bug fixes and new features when possible.
