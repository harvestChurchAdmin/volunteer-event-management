# Volunteer Event Management App

Express + SQLite tooling for scheduling volunteers at church or community events. Volunteers can browse published events, reserve one or more time blocks, and revisit their reservation via emailed management links. Admins curate events, stations, and individual slots through a Google-authenticated dashboard.

## Tech Highlights

- **Node.js 18** server with Express, Helmet, and CSP-friendly front-end assets.
- **SQLite** persistence through a thin Data Access Layer (`src/db/dal.js`).
- **Modular architecture**: controllers defer to services, services to the DAL.
- **Server-side rendered UI** using EJS templates with lightweight client scripts.
- **Email notifications** powered by configurable SMTP or Gmail service accounts.

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:3002` by default. The admin dashboard lives under `/admin` and requires Google Workspace credentials unless development overrides are in place.

## Environment Variables

Key settings (see `.env.example` for defaults and documentation):

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Cookie-session signing secret. Always change from default. |
| `APP_NAME` | Display name shown in titles, header, and footer. |
| `APP_TAGLINE` | Short description surfaced in metadata and hero text. |
| `ORG_DISPLAY_NAME` | Organization name used in emails and other copy. |
| `ORG_COPYRIGHT_HOLDER` | Footer copyright line (defaults to `ORG_DISPLAY_NAME`). |
| `BRAND_LOGO_URL` | Optional logo displayed in the header (leave blank for text-only). |
| `BRAND_FAVICON_URL` | Optional favicon; omit to use the browser default. |
| `BRAND_HOME_PATH` | Path the brand link should point to (defaults to `/`). |
| `APP_BASE_URL` | Public origin used for OAuth callbacks and email links. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials for admin login. |
| `GOOGLE_WORKSPACE_DOMAIN` | Limits admin access to a specific Google Workspace domain. |
| `MAIL_SERVICE` / `MAIL_USER` / `MAIL_PASS` | Quick Gmail-style SMTP configuration. |
| `MAIL_FROM` / `MAIL_REPLY_TO` | Outgoing email headers. |
| `MANAGE_TOKEN_TTL_DAYS` | Lifetime of volunteer management links (defaults to 30 days). |
| `DB_PATH` | Override location of the SQLite database file if needed. |

You can swap `MAIL_SERVICE` for direct SMTP settings (`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`) when deploying to production mail providers.

## Common Scripts

- `npm run dev` – Start the server with nodemon, hot reload, and verbose logging.
- `npm start` – Production start without watchers.
- `npm run init-db` – Bootstrap the SQLite schema or reset it during development.
- `npm test` – Execute automated tests (integration smoke tests today).

## Project Layout

- `src/app.js` – Express app wiring, middleware, and route registration.
- `src/controllers/` – Request/response glue that calls service methods.
- `src/services/` – Business rules (validation, shaping data for the UI).
- `src/db/dal.js` – All SQL queries and transactions. Foreign keys are enforced.
- `src/public/` – Static assets served to the browser (CSS, JS, images).
- `src/views/` – EJS templates used to render public and admin pages.

## Admin Workflow Overview

1. **Dashboard** – Create events, view existing entries sorted by start date.
2. **Stations** – For each event define stations (e.g., check-in, hospitality).
3. **Time Blocks** – Add time blocks with start/end times and capacity targets.
4. **Reservations** – Add volunteers directly or review sign-ups, edit/move/remove as needed.
5. **Publish** – Toggle visibility to push an event live on the volunteer sign-up page.

Drag-and-drop ordering plus local storage persists station layout preferences for each admin. Modals are CSP compatible and keyboard accessible.

## Testing & Quality

- Run `npm test` for smoke coverage of the volunteer picker flow.
- Critical logic in services and the DAL now carries inline documentation comments to make future enhancements safer.
- When adding features, prefer unit testing services and integration testing controllers/routes.

## Deployment Checklist

- Set `NODE_ENV=production` and provide a strong `SESSION_SECRET`.
- Configure `APP_BASE_URL` with the public hostname (required for OAuth and emails).
- Set up Google OAuth credentials and allowed domain for admin access.
- Supply mail credentials (`MAIL_*`) for transactional emails.
- Run `npm run init-db` on first deploy to create the SQLite schema.
- Use a process manager (PM2, systemd, etc.) to keep `npm start` running.
- Back up the SQLite database file (`db/volunteer.db`) regularly.

## Contributing

1. Fork the repository and create a feature branch (`git checkout -b feature/xyz`).
2. Copy `.env.example` to `.env` and fill in at least the secrets mentioned above.
3. Run `npm run dev` and verify your change locally.
4. Add or update tests where it makes sense.
5. Submit a PR with notes about behaviour changes and any manual testing performed.

We welcome contributions that improve accessibility, add validation, or expand automation around volunteer communications.
