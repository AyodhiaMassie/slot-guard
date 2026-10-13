# SlotGuard

SlotGuard is a university consultation booking API using fictional Student and Tutor accounts. Its central requirement is that simultaneous requests cannot reserve the same appointment twice. PostgreSQL is the authority on booking availability.

The backend provides JWT authentication, tutor availability, booking and cancellation APIs, SQL migrations, repeatable demo data, and real-PostgreSQL integration tests. A browser frontend and hosted deployment are not included.

## Architecture

The backend uses Node.js, Express 5, strict TypeScript, and `pg`. Routes validate input with Zod, authentication middleware verifies JWTs and reloads the user, and appointment services handle ownership and transactions. PostgreSQL uses a connection pool and parameterized queries. Supporting middleware provides configured CORS, security headers, JSON body limits, and in-memory request limiting. SQL migrations and queries are managed directly without an ORM.

```text
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

Requires Node.js 22.12+ (22.x), 24.x, or 26+, npm, and PostgreSQL 16 or newer. Node.js 24 is recommended and was used for local verification. Commands below run from the repository root. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

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

Initialize and run the API:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

The default API URL is `http://localhost:3000/api`. For the compiled server:

```sh
npm run typecheck
npm run build
npm start
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

All instants are stored as `TIMESTAMPTZ` and returned as ISO 8601 UTC strings. Slot creation accepts explicit UTC or numeric-offset timestamps that resolve to a UTC half-hour boundary. Responses use UTC; a client can format these instants in the user's local timezone.

## API contract

Success responses use `{ "data": ... }`. List responses also contain `{ "meta": { "limit": 100, "offset": 0 } }`. Errors use `{ "error": { "code": "...", "message": "...", "details": [...] } }`, with validation details only when relevant.

Protected requests require `Authorization: Bearer <token>`. Login returns `data.token`, `data.expires_in` (3600 seconds), and `data.user`. JWTs use HS256, a fixed issuer/audience, and expiration. Password hashes are never returned. There is no signup endpoint.

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

Successful reads/updates return `200`, creations `201`. Validation errors return `400`, missing/invalid authentication `401`, role/ownership failures `403`, missing records `404`, and scheduling/booking conflicts `409`. Request limits return `429`, oversized JSON returns `413`, and unexpected failures return a safe `500` without database messages. Health returns `500` when its database check fails. Login allows 20 failed requests per IP per 15 minutes; the API allows 300 requests per IP per minute, excluding health checks.

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
npm test
npm run typecheck
npm run build
```

`npm test` includes both suites and requires real PostgreSQL. Integration tests never substitute a database mock or silently skip when PostgreSQL is unavailable. They apply migrations and truncate the three domain tables between cases. They use only `TEST_DATABASE_URL`, require a local database named `slotguard_test` or `slotguard_<suffix>_test`, reject connection query parameters, and verify `current_database()` before any destructive setup. Never put application or production data in that database, and do not run two integration suites against the same test database simultaneously.

Unit tests cover input/date validation, environment/test-target safety, authorization helpers, and booking decisions. Integration tests cover login, token expiration, roles and ownership, UTC scheduling, availability, persistence through a separate pool, cancellation and history, closure, database constraints, repeated migrations/seeding, request limits, and safe database failure handling.

The required concurrency test starts two simultaneous HTTP requests from distinct Students while a third PostgreSQL connection holds the target slot lock. It observes both requests waiting in `pg_stat_activity`, releases the lock, and asserts exactly one `201`, one `409`, and one confirmed row. Additional tests race booking with closure, cancellation with rebooking/closure, and two cancellations.

## Current limits

There is no frontend or hosted environment yet. JWTs expire after one hour; there is no refresh/revocation endpoint. Browser token storage in `sessionStorage` would expose tokens to scripts on the origin if an XSS vulnerability occurred. Request limits are process-local, suitable for this single-service MVP. Public demo users share fictional data; this is not a university production system. Hosting is intended to use free tiers, with no paid resources or billing activation.
