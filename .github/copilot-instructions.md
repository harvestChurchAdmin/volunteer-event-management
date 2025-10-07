## Volunteer App — Quick AI contributor notes

This repository is a small Express/EJS volunteer-signup system. Below are the concrete, discoverable patterns and workflows an AI coding agent needs to be productive immediately.

### Big-picture architecture
- Entry points: `src/server.js` (starts app, calls `initDatabase()`), `src/app.js` (Express app wiring).
- MVC-ish split: `src/routes/*` -> `src/controllers/*` -> `src/services/*` -> `src/db/dal.js` (database access).
- Views are server-rendered EJS in `src/views/*` and static assets in `src/public/*`.

### Key design choices & why
- SQLite (better-sqlite3) is used as the single data store. WAL mode is enabled in `src/config/database.js` for concurrency.
- The code stores datetimes as local text `"YYYY-MM-DD HH:mm"` (no timezone arithmetic). See parsing helpers in `src/services/adminService.js` (`toCanonicalLocalString`, `cmpLocal`).
- Services canonicalize/validate inputs; controllers handle request/response and flash messages. Prefer changing logic inside `services/*` for business rules and `db/dal.js` for SQL changes.

### Important files to reference
- `src/config/database.js` — DB path, WAL, `initDatabase()` (reads `src/db/schema.sql`).
- `src/db/schema.sql` — canonical schema; migrations are manual (DAL also conditionally ALTERs table in `dal.js`).
- `src/db/dal.js` — single place for SQL. Exposes `admin` and `public` objects. Transactions are created with better-sqlite3 `db.transaction(...)`.
- `src/services/*.js` — business rules, input normalization (dates, reservation logic).
- `src/controllers/*.js` and `src/routes/*.js` — how HTTP endpoints are wired.
- `src/config/passport-setup.js` — Google OAuth rules (domain restriction, minimal session payload).

### Environment & run/dev workflows
- Required env vars (used in source): `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL`, optional `DB_PATH`, `PORT`, `NODE_ENV`.
- Common commands (package.json):

```bash
npm run dev    # development (nodemon, NODE_ENV=development)
npm start      # production (NODE_ENV=production)
npm run init-db  # run schema initialization once (calls database.initDatabase())
```

Notes: `src/server.js` calls `initDatabase()` on startup, so starting the server will create the DB/schema if missing.

### Patterns & conventions to follow in edits
- Data flow: route -> controller -> service -> dal -> DB. Keep public-facing validation in `middleware/validators.js` and business validation in `services/*`.
- Date/time: Accept `YYYY-MM-DDTHH:mm` (HTML `datetime-local`) and convert to `YYYY-MM-DD HH:mm` using `toCanonicalLocalString` in adminService.
- Errors: services/dal throw `http-errors` (`createError`) — controllers usually catch and forward to Express error handler in `src/app.js` (which logs heavily in dev).
- DB uniqueness: volunteers are unique by email (see `public.createVolunteer` behavior in `dal.js` — returns existing volunteer instead of failing on unique constraint).

### Auth & security
- Admin uses Google OAuth (passport-google-oauth20). The code enforces a workspace domain check (string match on email) in `src/config/passport-setup.js` and stores a small session object.
- `src/middleware/authMiddleware.js` redirects unauthenticated users to `/login`.
- App security: `helmet` with CSP, rate-limiter on `/signup`, secure session cookie in production (see `src/app.js`).

### DB and concurrency gotchas
- DB file defaults to `src/db/volunteer.db` but can be overridden by `DB_PATH` env var. WAL journaling is enabled — when debugging with sqlite tools, open the same file and be aware of WAL.
- DAL uses transactions for multi-step deletes and reservation creation. Better-sqlite3 has a 5s timeout (`src/config/database.js`).

### Quick debugging tips
- Dev logging: `morgan` is enabled in development (`src/server.js`). Passport prints received profile info in `passport-setup.js` for diagnostics.
- Global error handler in `src/app.js` prints route, status, message, and stack in development.
- To inspect DB quickly: `sqlite3 <DB_PATH>` or GUI; remember WAL file (`-wal`) may exist.

If anything here is unclear or you'd like more examples (sample SQL queries, suggested unit test entry points, or an explanation of a particular file), tell me which area to expand and I'll iterate.
