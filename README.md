# SlotGuard

SlotGuard is a university consultation booking application using fictional Student and Tutor accounts. Students find tutors, book 30-minute consultations, and manage appointments; Tutors publish and close availability. Its central requirement is that simultaneous requests cannot reserve the same appointment twice. PostgreSQL is the authority on booking availability.

The application includes an Express REST API, PostgreSQL persistence, JWT authentication, a responsive React frontend, and automated tests. Booking, cancellation, and availability management have been verified locally with real PostgreSQL and automated Microsoft Edge browser checks. CI and hosted deployment are not configured.

## Architecture

The backend uses Node.js, Express 5, strict TypeScript, and `pg`. Routes validate input with Zod, authentication middleware verifies JWTs and reloads the user, and appointment services handle ownership and transactions. PostgreSQL uses a connection pool and parameterized queries. Supporting middleware provides configured CORS, security headers, JSON body limits, and in-memory request limiting. SQL migrations and queries are managed directly without an ORM.

The client uses React 19, TypeScript, Vite, the Fetch API, and custom CSS. Vitest and React Testing Library exercise isolated frontend behavior; Playwright is a development-only dependency for reproducible browser integration smoke tests against the real API. Navigation uses React state because this MVP has one workspace per role and does not need deep links or a router dependency.

```text
client/src/
  App.tsx, main.tsx      Role-specific workspace and React entry point
  api/client.ts         Typed Fetch client, pagination, timeout, safe errors
  auth/AuthProvider.tsx Login, session restoration, expiry, logout
  components/           Navigation, availability, appointment lists, forms, feedback
  pages/                Login, Student dashboard, Tutor dashboard
  hooks/                Aborted reads, mutations, local clock
  utils/dates.ts        Local formatting and UTC scheduling validation
  types.ts, styles.css  API response types and responsive custom styling
client/tests/           Component, API client, date, and real-browser smoke tests
server/src/
  app.ts, index.ts       App composition and process lifecycle
  config.ts             Environment validation
  routes.ts             REST endpoints and request validation
  auth.ts               JWT, bcrypt, role and ownership checks
  errors.ts             Consistent, safe error responses
  services/             Appointment queries and business rules
  db/                   Pool, transaction helper, migrations, seeds
  scripts/              Explicit migration and maintenance commands
server/tests/           Vitest unit and real-database Supertest tests
database/migrations/    Versioned SQL schema
scripts/                Optional Windows local PostgreSQL setup
```

## Local setup

Requires Node.js 22.12+ (22.x), 24.x, or 26+, npm, and PostgreSQL 16 or newer. `.node-version` pins Node.js 24.21.0, which was used for local verification. Commands below run from the repository root. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm ci
```

Create two separate databases: `slotguard` for the application and `slotguard_test` for tests. Give the local database role permission to create tables, functions, and triggers in these databases. The test role must own the tables to create historical fixtures. Configure authentication with a password.

For example, with an existing local PostgreSQL installation and a configured login role:

```sh
createdb -h 127.0.0.1 -U slotguard slotguard
createdb -h 127.0.0.1 -U slotguard slotguard_test
```

Copy `server/.env.example` to `server/.env` and `server/.env.test.example` to `server/.env.test`. Set database URLs with your local credentials and generate a random JWT secret:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Environment files are ignored by Git. For database passwords containing reserved URL characters, percent-encode the password in the URL. npm workspace scripts run inside `server/`, where dotenv reads these files.

On Windows, the optional helper creates its own cluster in `.local/postgres`, listens only on `127.0.0.1:55432`, creates both databases, and generates the environment files with random credentials. It requires installed PostgreSQL binaries and refuses to overwrite an existing cluster or environment files. Run it in a normal local PowerShell session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-local-postgres.ps1
# For a different installation:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-local-postgres.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\17\bin'
```

Start an existing helper-created cluster after a reboot, or stop it when finished:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D "$PWD\.local\postgres" -l "$PWD\.local\postgres.log" -o '-p 55432 -h 127.0.0.1' -w start
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D "$PWD\.local\postgres" -m fast -w stop
```

Copy `client/.env.example` to `client/.env` if you need to change the public API address. It defaults to `http://localhost:3000/api`. Keep `CORS_ORIGIN=http://localhost:5173` in the server environment; use the frontend at exactly that origin. A different host, scheme, or port needs an explicit matching server CORS origin. Do not place a database URL or JWT secret in client environment variables.

Initialize and run the API in one terminal:

```sh
npm run db:migrate
npm run db:seed
npm run dev:server
```

Run the frontend in a second terminal:

```sh
npm run dev:client
```

Open **http://localhost:5173**. Select a demo account to fill the form and press Sign in. `npm run dev` is also an alias for backend development. Both Vite development and preview use port 5173 and fail if it is occupied.

The default API URL is `http://localhost:3000/api`. Build both workspaces, then start the compiled API and preview the built frontend in separate terminals:

```sh
npm run typecheck
npm run build
npm start
```

```sh
npm run preview:client
```

Migrations run explicitly and transactionally, with an advisory lock and checksums. Do not edit applied migrations; add a new version. Startup checks connectivity and binds to `0.0.0.0` using the configured port. SIGINT/SIGTERM close the HTTP server and connection pool.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; required for the server and database commands |
| `JWT_SECRET` | Random secret of at least 32 characters; placeholder secrets are rejected |
| `CORS_ORIGIN` | Required comma-separated exact HTTP/HTTPS frontend origins, e.g. `http://localhost:5173` |
| `PORT` | HTTP port; default `3000` |
| `NODE_ENV` | `development`, `test`, or `production`; default `development` |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops; default `0`, set only for the actual network topology |
| `DB_POOL_MAX` | Maximum pooled connections; default `10`, minimum `2` |
| `TEST_DATABASE_URL` | Dedicated local test database URL, read from `server/.env.test` |
| `VITE_API_BASE_URL` | Public API base URL in `client/.env`; default `http://localhost:3000/api` |

`pg` honors PostgreSQL TLS connection parameters. If a later hosting phase requires TLS, configure certificate verification in the database URL (for example `sslmode=verify-full`); the backend does not disable verification. Tests accept only local URLs without query parameters.

## Demo accounts and maintenance

All accounts and profiles are fictional. These credentials grant only their Student or Tutor role.

| Role | Email | Password |
| --- | --- | --- |
| Student | `alex.student@slotguard.demo` | `DemoStudent!2026` |
| Student | `sam.student@slotguard.demo` | `DemoStudent!2026` |
| Tutor | `maya.tutor@slotguard.demo` | `DemoTutor!2026` |
| Tutor | `noah.tutor@slotguard.demo` | `DemoTutor!2026` |

Seeding hashes passwords with bcrypt cost 12 and inserts missing users. It preserves existing passwords, profile fields, closed slots, and booking history. Each tutor receives four half-hour slots per day for the next seven UTC dates. Repeated seeding on the same UTC day creates no duplicate users or slots. As dates advance, it adds the new future dates without deleting old data.

```sh
npm run db:replenish
```

This is a controlled local maintenance command, using the configured application database. There is no public reset endpoint. If an existing demo email has an incompatible role, seeding fails rather than changing its identity.

## Database and concurrency

The three domain tables are:

- `users`: unique normalized email, bcrypt hash, safe profile fields, fixed `student`/`tutor` role.
- `appointment_slots`: Tutor foreign key, UTC `starts_at`, `open`/`closed` status, unique `(tutor_id, starts_at)`, finite timestamps on half-hour boundaries. Duration is always 30 minutes, so there is no variable-duration field or redundant booking flag.
- `bookings`: slot and Student foreign keys, `confirmed`/`cancelled` status, creation and cancellation timestamps. Cancelled history remains available after rebooking.

The technical `schema_migrations` table tracks applied SQL versions and checksums. Query indexes support tutor availability and appointment history. The required partial unique index `one_confirmed_booking_per_slot` permits at most one confirmed booking per slot while retaining cancelled records.

Booking uses one pooled client for `BEGIN`, `SELECT ... FOR UPDATE` on the slot, availability checks, insertion, and `COMMIT`. Cancellation locks the slot before the booking and rechecks the booking after acquiring its lock. Closure locks the same slot and refuses confirmed bookings. Every failure rolls back, and every outcome releases the client. The database triggers also reject invalid roles, past slot creation, unavailable reservations, booked-slot closure, and changes to appointment ownership or cancelled history. Database administrators can bypass triggers; that capability is not exposed through the API.

All instants are stored as `TIMESTAMPTZ` and returned as ISO 8601 UTC strings. Slot creation accepts explicit UTC or numeric-offset timestamps that resolve to a UTC half-hour boundary. The frontend displays local dates, years, and times with an explicit IANA timezone indication. It converts a Tutor's local date/time choice to UTC, rejects past/nonexistent instants, and filters the selectable times against UTC half-hour boundaries.

## Frontend workflows and components

| Component | Responsibility |
| --- | --- |
| `AuthProvider` | Server-backed login/profile restoration; token expiry, 401 handling, logout |
| `App` / `AppShell` | Student/Tutor workspace selection, responsive navigation, account and timezone |
| `LoginPage` | Four visible demo credentials, form validation, sign-in feedback, slow-connection state |
| `StudentDashboard` | Tutor directory, tutor selection, next appointment, coordinated data refresh |
| `AvailabilityPanel` | Local date/time selection, booking confirmation, conflict feedback |
| `StudentAppointments` | Upcoming/history views, owned appointment cancellation |
| `TutorDashboard` / `TutorSchedule` | Actual booked Students, availability filters, closing unbooked times |
| `CreateSlotForm` | Valid future start choices, fixed 30-minute duration, creation feedback |
| `ConfirmDialog` / feedback components | Keyboard focus containment/restoration, loading, retry, empty, success/error states |

`api/client.ts` is the only production module issuing HTTP requests. It uses the existing `{ data, meta }` / `{ error }` contracts and Bearer authorization, reads every page of a list, and preserves HTTP conflict/validation errors. No production schedule or booking data is mocked. Booking confirmation appears only after an API success response. Booking, cancellation, creation, closure, and conflicts trigger new API reads rather than optimistic appointment updates. A manual Refresh action retrieves changes made by other demo users.

Read and mutation hooks abort in-flight work on unmount and ignore stale responses. Requests have a 90-second timeout to allow a free-hosting cold start; interrupted mutations ask the user to refresh before retrying because a missing response does not prove the database write failed. Session restoration retains a saved token when the service is temporarily unavailable and offers Retry or Return to sign in. Confirmation dialogs retain focus while saving and return it to the workspace when a refreshed list removes their original trigger.

Only the token and its expiry are stored in `sessionStorage`; the user profile is restored from `/api/auth/me`. A protected 401 clears the session, and an idle expiry timer plus focus/visibility checks handle expired sessions. A delayed response from an old account cannot expire a newer account's session. `sessionStorage` remains accessible to scripts on the origin, so XSS could expose a token; no secret signing key is shipped to the client. If browser storage is unavailable, authentication works in memory until reload.

## API contract

Success responses use `{ "data": ... }`. List responses also contain `{ "meta": { "limit": 100, "offset": 0 } }`. Errors use `{ "error": { "code": "...", "message": "...", "details": [...] } }`, with validation details only when relevant.

Protected requests require `Authorization: Bearer <token>`. Login returns `data.token`, `data.expires_in` (3600 seconds), and `data.user`. JWTs use HS256, a fixed issuer/audience, and expiration. Password hashes are never returned. API responses use `Cache-Control: no-store` to prevent storage of tokens and account data. There is no signup endpoint.

| Method | Endpoint | Access / request |
| --- | --- | --- |
| POST | `/api/auth/login` | Public; `{ "email": "...", "password": "..." }` |
| GET | `/api/auth/me` | Authenticated safe profile |
| GET | `/api/tutors` | Authenticated; profiles and `available_slot_count` |
| GET | `/api/tutors/:id/slots` | Authenticated; future open unreserved slots with `ends_at` |
| POST | `/api/slots` | Tutor; `{ "starts_at": "2099-01-01T09:30:00Z" }` |
| GET | `/api/slots/mine` | Tutor; own slots, confirmed booking and student details |
| PATCH | `/api/slots/:id/close` | Owning Tutor; no body or `{}`; repeated closure is idempotent |
| POST | `/api/bookings` | Student; `{ "slot_id": 123 }` |
| GET | `/api/bookings/mine` | Student's own history or Tutor's appointment history |
| PATCH | `/api/bookings/:id/cancel` | Owning Student; no body or `{}`; only upcoming confirmed bookings |
| GET | `/api/health` | Public; checks database connectivity |

All list endpoints support `?limit=20&offset=0` (limit 1–100, offset 0–1,000,000). Unknown or repeated query keys and unknown body fields are rejected. IDs are positive PostgreSQL integers; JSON booking IDs must be numbers. Availability sorts by ascending start time; own slots and booking history sort by descending start time, with ID tie-breakers. History includes past and cancelled bookings. Paginate with the next offset when a page is full.

Successful reads/updates return `200`, creations `201`. Validation errors return `400`, missing/invalid authentication `401`, role/ownership failures `403`, missing records `404`, and scheduling/booking conflicts `409`. Request limits return `429`, oversized JSON returns `413`, unsupported JSON encodings return `415`, and unexpected failures return a safe `500` without database messages. Health returns `500` when its database check fails. Login allows 20 failed requests per IP per 15 minutes; the API allows 300 requests per IP per minute, excluding health checks.

Example login in PowerShell:

```powershell
$session = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType application/json -Body '{"email":"alex.student@slotguard.demo","password":"DemoStudent!2026"}'
$headers = @{ Authorization = "Bearer $($session.data.token)" }
Invoke-RestMethod -Uri http://localhost:3000/api/tutors -Headers $headers
```

## Tests and verification

```sh
npm run test:unit
npm run test:integration
npm run test:client
npm test
npm run typecheck
npm run build
```

`npm test` runs backend and frontend suites and requires real PostgreSQL. `npm run test:server` runs only the backend; `npm run test:client` runs frontend tests without requiring a database. The original `test:unit` and `test:integration` scripts retain their backend scope. Frontend component tests mock Fetch responses in isolation. Backend integration tests never substitute a database mock or silently skip when PostgreSQL is unavailable. They apply migrations and truncate the three domain tables between cases. They use only `TEST_DATABASE_URL`, require a local database named `slotguard_test` or `slotguard_<suffix>_test`, reject connection query parameters, and verify `current_database()` before any destructive setup. Never put application or production data in that database, and do not run two integration suites against the same test database simultaneously.

Unit tests cover input/date validation, environment/test-target safety, authorization helpers, and booking decisions. Integration tests cover login, JWT algorithm/issuer/audience/expiration, direct API authentication, roles and ownership, production-origin CORS preflight, cache prevention, malformed request encodings, UTC scheduling, availability, persistence through a separate pool, transaction rollback, cancellation and history, closure, database constraints, repeated migrations/seeding, request limits, and safe database failure handling.

The required concurrency test starts two simultaneous HTTP requests from distinct Students while a third PostgreSQL connection holds the target slot lock. It observes both requests waiting in `pg_stat_activity`, releases the lock, and asserts exactly one `201`, one `409`, and one confirmed row. Additional tests race booking with closure, cancellation with rebooking/closure, and two cancellations.

Frontend tests cover login success/failure, role-specific navigation, restored/expired sessions, logout, delayed responses after account/tutor changes, loading/error/retry states, API-confirmed booking, 409 conflict refresh, cancellation/history, Tutor creation/closure, dialog focus and keyboard navigation, pagination, cold-start timeout behavior, and local date validation.

For the real browser smoke, start the backend and frontend (development or compiled preview) first, seed fictional demo accounts, and have Microsoft Edge installed:

```sh
npm run test:browser
```

This optional smoke uses Playwright with the installed Edge browser. It runs through the actual UI and real PostgreSQL, uses a second browser session to cause a genuine stale-slot conflict, and checks dialog keyboard navigation, focus restoration, mobile width, session restoration, and timezone behavior in Kuala Lumpur, New York (including a spring DST gap), and Kathmandu. It cancels its successful bookings and closes its newly created slot; fictional cancelled history and closed slots remain. It does not truncate the application database. Screenshots are written under ignored `.local/phase-2-browser/`. Its URLs are restricted to localhost. Set `SLOTGUARD_BROWSER_CHANNEL=chrome` if using an installed Chrome browser; `SLOTGUARD_FRONTEND_URL` and `SLOTGUARD_API_URL` can select other local ports, with matching frontend API configuration and CORS.

Local checks passed: **40 frontend tests and 58 backend tests** (28 unit and 30 real-PostgreSQL integration tests), both TypeScript checks, both production builds, and the real browser smoke using a compiled API and production frontend preview. The concurrency test verified one successful reservation, one conflict, and exactly one confirmed booking for simultaneous requests. npm's dependency audit reported no known vulnerabilities at the time of this review. These are local automated results; hosted behavior remains unverified.

## Hosting preparation

The intended services are Render Free static hosting, one Render Free Node web service, and Neon Free PostgreSQL. No cloud resources or CI workflow are configured yet. Keep the repository root as the build directory so npm workspaces, the lockfile, and `database/migrations` remain available.

| Service | Build | Runtime / output |
| --- | --- | --- |
| Frontend | `npm ci --include=dev && npm run build --workspace client` | Publish `client/dist` |
| Backend | `npm ci --include=dev && npm run build --workspace server` | `npm start`; health path `/api/health` |

Configure `VITE_API_BASE_URL` with the backend's HTTPS `/api` URL **before building the frontend**; changing it requires a rebuild. For the backend, set `NODE_ENV=production`, a random `JWT_SECRET`, the exact HTTPS frontend origin in `CORS_ORIGIN`, and the Neon `DATABASE_URL`. The API already binds to `0.0.0.0` and reads the platform's `PORT`, as [Render requires](https://render.com/docs/web-services#port-binding). Validate Render's proxy chain before setting `TRUST_PROXY_HOPS`; an incorrect value can undermine IP-based request limits. Use `.node-version` or the matching `NODE_VERSION` setting to keep builds on the verified runtime.

For the initial single-service deployment, use a direct Neon URL with the existing small `pg` pool and `sslmode=verify-full`. Run `npm run db:migrate`, then `npm run db:seed`, from a trusted environment configured with that database URL. Keep credentials out of command history and Git. Replenish future slots using `npm run db:replenish` when needed. [Neon's pooling documentation](https://neon.com/docs/connect/connection-pooling) recommends direct connections for migrations and notes session-setting limitations with its transaction pooler; validate timeout settings before switching the API to a pooled URL. Actual Neon TLS/connectivity has not been tested yet. Local PostgreSQL files and the Windows helper are not required by the deployed API.

[Render Free](https://render.com/docs/free) web services sleep after 15 idle minutes and can take about a minute to restart. [Neon Free](https://neon.com/docs/introduction/plans) also suspends idle compute and enforces usage limits. Keep the budget at $0: select Free plans, avoid adding payment methods or enabling paid features, and recheck both provider dashboards before creating services. Quota exhaustion can suspend service; no keep-alive polling is configured.

Before a public release, configure GitHub Actions with isolated PostgreSQL tests, verify the actual hosting environment and TLS, and repeat both roles' workflows and a cold-start login at the deployed URLs. CI and hosted verification remain separate work.

## Current limits

There is no hosted environment or CI workflow yet. Browser smoke testing covers local Microsoft Edge; Firefox, Safari, and hosted behavior are unverified. JWTs expire after one hour; there is no refresh/revocation endpoint. Request limits are process-local, suitable for this single-service MVP. Public demo users share fictional data; this is not a university production system. Browser-local view selection resets on reload. At an ambiguous repeated DST hour, slot creation uses the browser's first occurrence of that local time. Hosting is intended to use free tiers, with no paid resources or billing activation.
