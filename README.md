# Volunteer Event Management App

Express + SQLite tooling for scheduling volunteers at church or community events. Volunteers/participants can browse published events, sign up for one or more items or time blocks, and revisit their reservation via emailed management links. Admins curate events, stations, and individual slots through a Google‑authenticated dashboard.

## Tech Highlights

- **Node.js 18** server with Express, Helmet, and CSP-friendly front-end assets.
- **SQLite** persistence through a thin Data Access Layer (`src/db/dal.js`).
- **Modular architecture**: controllers defer to services, services to the DAL.
- **Server-side rendered UI** using EJS templates with lightweight client scripts.
- **Two sign-up modes**: schedule (stations + time blocks) and potluck (categories + items with required dish names).
- **Email notifications** powered by configurable SMTP or Gmail service accounts.

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:3002` by default. The admin dashboard lives under `/admin` and requires Google Workspace credentials unless development overrides are in place.

Public page quick tour:
- Schedule mode: Step 1 “Select opportunities” → Step 2 “Review selections” (read‑only summary) → Step 3 “Enter contact info”.
- Potluck mode: Step 1 “Select items” → Step 2 “Enter dish names” (required for each selection) → Step 3 “Enter contact info”.

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
| `BRAND_FAVICON_URL` | Optional favicon image (absolute URL or a path like `/favicon.ico`). See Favicon below. |
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

1. **Dashboard** – Create events, view existing entries (newest first), and quickly see which events are in the past (dimmed rows with a “Past event” label).
2. **Stations / Categories** – For each event define stations (schedule mode) or potluck categories (potluck mode).
3. **Time Blocks / Items** – Add time blocks with start/end times and capacity targets, or potluck items with optional “feeds” ranges.
4. **Reservations** – Add volunteers directly or review sign-ups, edit/move/remove as needed.
5. **Publish** – Toggle visibility to push an event live on the volunteer sign-up page. A “View public page” link opens the public event and preserves a `return` link back to the admin screen.

Drag-and-drop ordering plus local storage persists station layout preferences for each admin. Modals are CSP compatible and keyboard accessible. The admin dashboard table also supports client-side sorting by name, dates, and status for quick scanning.

## Testing & Quality

- Run `npm test` for smoke coverage of the volunteer picker flow.
- Critical logic in services and the DAL now carries inline documentation comments to make future enhancements safer.
- When adding features, prefer unit testing services and integration testing controllers/routes.

### New tests

- `test/potluck-jsdom.test.js` – JS‑DOM scenario that simulates selecting an item on a potluck event and asserts:
  - A required dish input is rendered
  - Hidden `blockIds[]` inputs are produced for form submission

## Deployment Checklist

- Set `NODE_ENV=production` and provide a strong `SESSION_SECRET`.
- Configure `APP_BASE_URL` with the public hostname (required for OAuth and emails).
- Set up Google OAuth credentials and allowed domain for admin access.
- Supply mail credentials (`MAIL_*`) for transactional emails.
- Run `npm run init-db` on first deploy to create the SQLite schema.
- Use a process manager (PM2, systemd, etc.) to keep `npm start` running.
- Back up the SQLite database file (`db/volunteer.db`) regularly.

## Favicon

By default the server will serve `src/public/favicon.ico` if it exists. Alternatively set `BRAND_FAVICON_URL` to a direct image URL or to a local static path (e.g. `/img/favicon.png`). Links that require cookies (like Google Photos share pages) will be blocked by browsers and CSP.

## Branding

Tune the UI via environment variables (no code edits required):

- `APP_NAME`, `APP_TAGLINE` – header/footer title and meta description
- `ORG_DISPLAY_NAME`, `ORG_COPYRIGHT_HOLDER` – used in emails and footer
- `BRAND_LOGO_URL`, `BRAND_FAVICON_URL`, `BRAND_HOME_PATH`, optional colors `BRAND_COLOR`, `BRAND_COLOR_STRONG`, `ACCENT_COLOR`

## Potluck specifics

- Items have a required “Dish name” input for every selection.
- “Others bringing” shows dish names plus first name + last initial of the contributor.
- Cards keep a fixed left column for the item name and an aligned right column for “Others bringing”.
 - Dish names are normalized on save (trimming whitespace and stripping accidental leading commas), so items like `, Lasagna` are stored and displayed as `Lasagna`.

## Contributing / GitHub

This repository is ready for GitHub. Include the following when opening PRs:

- Summary of changes and why
- Manual test notes (schedule + potluck flows)
- Screenshots where UI changed
- Any migration or environment updates required

## Performance notes

- Admin JS is lazy‑loaded on public pages (no `/js/admin-event-detail.js` unless on admin layout).
- Client debugging logs in `/js/main.js` are gated behind a small `DEBUG` flag (set to `false` by default). Flip it locally if you need extra console output.
- An optional admin‑only stylesheet (`/css/admin.css`) exists but is not currently loaded by default to preserve the known‑good admin visuals. If you want to experiment with splitting CSS, you can enable it by linking it in `src/views/partials/header.ejs` and moving admin‑specific rules from `style.css` into `admin.css` incrementally while visually verifying.

## Contributing

1. Fork the repository and create a feature branch (`git checkout -b feature/xyz`).
2. Copy `.env.example` to `.env` and fill in at least the secrets mentioned above.
3. Run `npm run dev` and verify your change locally.
4. Add or update tests where it makes sense.
5. Submit a PR with notes about behaviour changes and any manual testing performed.

We welcome contributions that improve accessibility, add validation, or expand automation around volunteer communications.
