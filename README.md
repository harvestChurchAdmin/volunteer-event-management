# Volunteer Event Management App

Express + SQLite tooling for scheduling volunteers at church or community events. Volunteers/participants can browse published events, sign up for one or more items or time blocks, and revisit their reservation via emailed management links. Admins curate events, stations, and individual slots through a Google‑authenticated dashboard.

## Tech Highlights

- **Node.js 18** server with Express, Helmet, and CSP-friendly front-end assets.
- **SQLite** persistence through a thin Data Access Layer (`src/db/dal.js`).
- **Modular architecture**: controllers defer to services, services to the DAL.
- **Server-side rendered UI** using EJS templates with lightweight client scripts.
- **Two sign-up modes**: schedule (stations + time blocks) and potluck (categories + items with required dish names and “Others bringing” guidance).
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
| `SESSION_DB_PATH` | Path to the SQLite file used for session storage (defaults to `db/sessions.db`). |
| `APP_NAME` | Display name shown in titles, header, and footer. |
| `APP_TAGLINE` | Short description surfaced in metadata and hero text. |
| `ORG_DISPLAY_NAME` | Organization name used in emails and other copy. |
| `ORG_COPYRIGHT_HOLDER` | Footer copyright line (defaults to `ORG_DISPLAY_NAME`). |
| `BRAND_LOGO_URL` | Optional logo displayed in the header (leave blank for text-only). |
| `BRAND_FAVICON_URL` | Optional favicon image (absolute URL or a path like `/favicon.ico`). See Favicon below. |
| `BRAND_HOME_PATH` | Path the brand link should point to (defaults to `/`). |
| `SUPPORT_CONTACT_NAME` / `SUPPORT_CONTACT_EMAIL` / `SUPPORT_CONTACT_PHONE` | Contact info shown in public help pages and emails. |
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

## Security defaults

- Sessions are persisted to SQLite (`SESSION_DB_PATH`) with HTTP-only cookies; the server refuses to boot without a strong `SESSION_SECRET`.
- CSRF protection is enforced on all non-GET requests. Server-rendered forms now include `_csrf` and XHR calls must send the `CSRF-Token` header.
- Volunteer manage links are hashed at rest and carry expirations (`MANAGE_TOKEN_TTL_DAYS`); new links are issued on every reminder/update.
- CSV exports neutralize formula injection so malicious values cannot execute when opened in spreadsheet tools.

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
5. **Publish** – Toggle visibility to push an event live on the volunteer sign-up page. The publish widget now shows an inline “Copy link” action so admins can grab the private/public URL without opening a modal.

Drag-and-drop ordering plus local storage persists station layout preferences for each admin. Modals are CSP compatible and keyboard accessible. The admin dashboard table also supports client-side sorting by name, dates, and status for quick scanning.

### Publish states

- **Draft** – Admins only. The event is hidden from /events and from search. Use this while editing or collecting details; volunteers can’t view it even with a direct link.
- **Private** – Not listed on /events, but anyone with the shareable link can access it. Great for soft launches or targeted outreach.
- **Public** – Listed on /events and reachable via the shareable link. Switch back to Private/Draft anytime; stations, sign-ups, and dish notes remain intact.

## Testing & Quality

- Run `npm test` for smoke coverage of the volunteer picker flow. This suite combines fast JS‑DOM tests (services/helpers) and a Puppeteer smoke that clicks through `src/public/test-picker.html` to exercise the datetime picker and modal behaviours in a real browser context.
- `helpers.test.js` provides regression coverage for the shared rendering helpers.
- `potluck-jsdom.test.js` validates the potluck selection flow: a “Select” click requires dish names and produces the hidden inputs posted back to the server.
- `picker-smoke.test.js` uses the lightweight `/test-picker.html` harness to confirm the modal, datetime fields, and close behaviours remain accessible.
- Critical logic in services and the DAL carries inline documentation comments to make future enhancements safer; prefer targeting those layers in new unit tests.
- When adding features, prefer unit testing services and integration testing controllers/routes.

## Deployment Checklist

- Set `NODE_ENV=production` and provide a strong `SESSION_SECRET`.
- Rotate and reissue OAuth, mail, and session secrets if any prior `.env` contents may have leaked.
- Configure `APP_BASE_URL` with the public hostname (required for OAuth and emails).
- Set up Google OAuth credentials and allowed domain for admin access.
- Supply mail credentials (`MAIL_*`) for transactional emails.
- Run `npm run init-db` on first deploy to create the SQLite schema.
- Keep `db/*.db` and `SESSION_DB_PATH` files on encrypted disks with restricted filesystem permissions.
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

- Items use a “Select” button and always require a “Dish name” entry for every reservation.
- “Others bringing” shows dish names plus first name + last initial of the contributor; the list truncates to keep cards compact and shows “+N more” when needed.
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

## Contributing

1. Fork the repository and create a feature branch (`git checkout -b feature/xyz`).
2. Copy `.env.example` to `.env` and fill in at least the secrets mentioned above.
3. Run `npm run dev` and verify your change locally.
4. Add or update tests where it makes sense.
5. Submit a PR with notes about behaviour changes and any manual testing performed.

We welcome contributions that improve accessibility, add validation, or expand automation around volunteer communications.
