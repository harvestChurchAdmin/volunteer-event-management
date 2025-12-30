# Volunteer Event Management App

Express + SQLite tooling for church and community volunteer sign-ups. Volunteers choose time slots or food prep items in a few simple steps, then get an emailed manage link to edit later. Admins build events and rosters in a Google-authenticated dashboard.

## Features at a glance

- Two signup modes: **schedule** (stations + time blocks) or **food prep** (categories + items that include dish names and “Others signed up” hints).
- Self-service manage links so volunteers can change or cancel without admin work.
- CSV exports (rosters, open needs, structure-only) and print-friendly rosters.
- Safe formatting for descriptions (bold/italic/bullets) without allowing HTML.
- Built-in help pages: public `/help`, admin `/admin/help/workflows`, and `/admin/help/formatting`.

## Quick start (local)

1. Install Node.js 18+.
2. Install dependencies: `npm install`
3. Copy env template: `cp .env.example .env`
4. Edit `.env`:
   - Set `SESSION_SECRET` to a long random string.
   - Set `APP_BASE_URL` to `http://localhost:3002` (or your host).
   - Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_WORKSPACE_DOMAIN` so admins can sign in.
   - Leave mail settings blank to log emails to the console, or provide real SMTP/Gmail creds.
5. Start the app: `npm run dev` (or `npm start` in production).
6. Open `http://localhost:3002` for public sign-ups. Admin dashboard lives at `/admin` after Google sign-in.

Run `npm run init-db` anytime to (re)create the SQLite schema in `db/volunteer.db`.

### Volunteer flow (what they see)
- Step 1: Enter contact info and add participant names.
- Step 2: Pick slots (schedule) or items with dish names (food prep).
- Step 3: Quick review, then submit. A manage link is emailed for edits.

### Admin notes
- Google OAuth is required; without credentials the login flow will fail.
- Events can be Draft (hidden), Private link (unlisted), or Public (listed on `/events`).
- Drag-and-drop ordering is available for stations, categories, and items.
- Use “Copy event” to clone structure without volunteers.

## Configuration highlights

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Required; session signing key. |
| `APP_BASE_URL` | Full origin for OAuth callbacks and email links. |
| `DB_PATH` / `SESSION_DB_PATH` | Locations for data and session SQLite files. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_WORKSPACE_DOMAIN` | Google login for admins. |
| `MAIL_SERVICE` / `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | Outgoing email settings (console logging is used if none provided). |
| `APP_NAME`, `APP_TAGLINE`, `ORG_DISPLAY_NAME`, `BRAND_*`, `SUPPORT_CONTACT_*` | Branding and support info surfaced in headers, emails, and help pages. |
| `MANAGE_TOKEN_TTL_DAYS` | How long emailed manage links remain valid (default 30). |

See `.env.example` for more options.

## Project layout

- `src/server.js` / `src/app.js` – Express bootstrap, middleware, routing.
- `src/controllers/` – Route handlers that call service methods.
- `src/services/` – Business logic for public/admin flows and email sending.
- `src/db/dal.js` – SQLite queries and migrations.
- `src/views/` – EJS templates for public and admin pages (including help).
- `src/public/` – Static assets.

## Testing

`npm test` runs JS-DOM unit tests plus a lightweight Puppeteer smoke of the datetime picker. Install Chromium locally if Puppeteer prompts for a download.

## Contributing on GitHub

- Open a PR with a short summary, manual test notes (schedule + food prep), and screenshots for UI changes.
- Note any env var or migration changes.
- Keep accessibility and clear copy in mind; volunteers and coordinators may be non-technical.
