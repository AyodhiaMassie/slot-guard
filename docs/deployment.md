# Optional deployment reference

SlotGuard is currently presented as a locally runnable portfolio project in its [public GitHub repository](https://github.com/AyodhiaMassie/slot-guard). There is no publicly hosted application. Follow the [README local setup](../README.md#local-installation) for the supported demonstration path.

This optional reference preserves the earlier Render Free Static Site, Render Free Web Service, and Neon Free preparation for possible future use. No cloud services have been provisioned or verified. Deployment is outside the current scope and requires separate approval.

## Budget and prerequisites

Use Free plans and the providers' `onrender.com` URLs. Do not add a payment method, buy a domain, activate a trial that converts to a paid plan, or enable paid add-ons. Review the selected plan and quotas in each dashboard before confirming creation. If account verification requires a card, stop and review a free alternative before creating anything.

Standard GitHub-hosted runners are free for a public repository. Render Free and Neon Free have usage limits and can suspend services when limits are reached. Check current terms when deploying: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Render Free](https://render.com/docs/free), and [Neon plans](https://neon.com/docs/introduction/plans).

Use Node.js **24.21.0** from `.node-version`, the existing npm lockfile, and a trusted computer for the manual database commands. Production values come from the dashboards; the production environment examples contain placeholders, not usable credentials.

## 1. Repository and CI

The repository is already public and its [first CI run passed](https://github.com/AyodhiaMassie/slot-guard/actions/runs/38447521516). Keep the existing history and review future changes before committing or publishing. Actual environment files, internal project instructions/specifications, private verification reports, dependencies, and build output must remain excluded.

Before a future approved deployment, check the repository and the CI result for the revision being deployed. The existing remote is `https://github.com/AyodhiaMassie/slot-guard.git`; do not create another repository or replace its history.

```sh
git status --short
git log --oneline
git remote -v
```

Open the Actions tab and require **CI / Verify** to pass before connecting Render. Use the exact check name displayed by GitHub if configuring a required branch check. Any later push or deployment still needs explicit approval.

### What CI verifies

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, and can be started manually. It uses `ubuntu-24.04`, the pinned project Node version, SHA-pinned official checkout/setup actions, read-only repository permissions, and `npm ci --include=dev`.

One disposable PostgreSQL 18 service is mapped to `127.0.0.1:5432`. Its database is `slotguard_ci_test`; `ci-only-password` is a public, temporary service credential, not a production secret. CI has **no Neon URL, database credential secret, or deployment token**. Test scripts reject remote URLs and application database names and verify the connected database before setup.

The job migrates and seeds its test database, checks both TypeScript workspaces, builds both workspaces, and runs backend units, real API/database/concurrency tests, and frontend tests. Tests run sequentially against the shared test database. Any failed step fails the job; no required tests are skipped or allowed to fail.

The service setup follows [GitHub's PostgreSQL service guide](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers). The GitHub workflow has run successfully; Render and Neon behavior remains unverified.

Browser testing remains a local check. During preparation, bundled Chromium completed the full smoke twice, but an earlier run timed out waiting for focus on the workspace after a successful booking, while availability refreshes. The cause remains unresolved; investigate that behavior before making the browser test a required CI step. Do not mask it with automatic retries or silently skip its assertion. The isolated launcher below generates an ephemeral JWT secret and stops its own API and preview processes. When reliable, Chromium can run on a standard runner using [Playwright's CI installation](https://playwright.dev/docs/ci).

## 2. Create the Neon database

Create a Neon project on the **Free** plan, with database `slotguard`. Select PostgreSQL 18 if available as a stable option; confirm the offered version and plan before creation. Choose a region near the selected Render backend region. Record the actual region, database, role, and endpoint; their values are not known yet.

In Neon's connection dialog, select the application database and its role, and choose a **direct connection**, without the `-pooler` hostname. Use this same direct endpoint for initial migrations and the small single-instance API. Render will use `DB_POOL_MAX=5`. This avoids introducing transaction-pooler limitations on the driver's session timeout settings. Reassess pooling before scaling to multiple API instances. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

The database URL must contain exactly one `sslmode=verify-full`. Replace `sslmode=require` if it is in the copied URL; do not append a second mode. Preserve the database/role/password/host and percent-encoding. The backend rejects remote connections without verified TLS and rejects query options that can override the host or weaken its TLS configuration. It enables SCRAM channel binding when offered by the server. Do not add `ssl=0`, `uselibpqcompat`, `rejectUnauthorized=false`, or a TLS-disable environment setting. [Neon secure connections](https://neon.com/docs/connect/connect-securely), [node-postgres TLS configuration](https://node-postgres.com/features/ssl).

Store the real URL only in the backend dashboard and temporarily in a trusted migration process. Do not put it in GitHub Actions, the frontend, source files, shell command history, or screenshots. Production connectivity and certificate verification still require a real deployment check.

## 3. Apply migrations and fictional demo seeds

Run these commands from the repository root on the trusted computer, with locked dependencies installed. Render Free has no pre-deploy commands or service shell; migrations must run manually rather than during a build or API startup. [Render deploy steps](https://render.com/docs/deploys), [Free service restrictions](https://render.com/docs/free).

This PowerShell example prompts without echoing the URL, uses it only for the migration/seed child processes, and restores the previous local environment afterward:

```powershell
npm.cmd ci --include=dev
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

$previousDatabaseUrl = $env:DATABASE_URL
$deploymentConnection = Read-Host 'Neon direct URL with sslmode=verify-full' -AsSecureString
try {
    $env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $deploymentConnection).Password
    npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not deploy.' }
    npm.cmd run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Seed failed; inspect configuration before deploying.' }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $deploymentConnection.Dispose()
}
```

On another shell, supply `DATABASE_URL` through a protected prompt or secret environment injection, run `npm run db:migrate` followed by `npm run db:seed`, check each exit code, and remove the temporary value. Do not type a credential-bearing assignment into shell history. Explicit environment values take precedence over the ignored local `.env` file.

Migrations use a transaction, advisory lock, and recorded checksums. `.gitattributes` keeps SQL files at LF in Windows and Linux checkouts so checksums stay portable. Never edit an applied migration or manually rewrite its stored checksum. Seeds create fictional accounts and future slots, preserving existing account data and booking history. Rerunning on the same UTC date is idempotent.

As dates advance, run `npm run db:replenish` using the same protected production URL process to add future availability. Nothing automatically seeds a cold-starting API. Never use `TEST_DATABASE_URL`, `npm test`, or browser smoke scripts against Neon; tests are restricted to disposable local databases. Migrate before deploying code that needs a new schema, and use compatible migrations when an old API is still serving traffic.

## 4. Create the Render backend

Connect the approved GitHub repository through Render's GitHub integration, using only the repository access needed. Choose **Web Service**, Node runtime, and the **Free** instance type. Do not create Render Postgres, disks, Redis, cron jobs, preview environments, or paid jobs.

| Setting | Proposed value |
| --- | --- |
| Name | `slotguard-api` (adjust if unavailable; record the assigned URL) |
| Branch | `main` |
| Root directory | Leave blank: repository root |
| Runtime | Node |
| Node version | `24.21.0` (`.node-version`; also set `NODE_VERSION` below) |
| Build command | `npm ci --include=dev && npm run build --workspace server` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Instance type | Free; one instance |
| Pre-deploy command | Leave blank |
| Auto-deploy | Off during initial verification; then **After CI Checks Pass** |
| Region | Available Free region near Neon; confirm in the dashboard |

The root directory must remain blank: the root lockfile, npm workspaces, and `database/migrations` are needed. The compiled entry point is `server/dist/index.js`, reached by the root `npm start` script. [Render monorepo support](https://render.com/docs/monorepo-support).

Set these **backend-only** environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.21.0` |
| `DATABASE_URL` | Actual Neon direct URL with exactly one `sslmode=verify-full` |
| `JWT_SECRET` | Newly generated random secret; at least 32 characters |
| `CORS_ORIGIN` | Exact frontend HTTPS origin, e.g. `https://<assigned-frontend>.onrender.com`, without `/api` or trailing slash |
| `TRUST_PROXY_HOPS` | Proposed `1` for direct Render hosting; verify the actual chain before public release |
| `DB_POOL_MAX` | `5` |

Render supplies `PORT`; leave it unset in the dashboard. The server reads it and binds to `0.0.0.0` (Render's default is `10000`). It checks database connectivity before listening, uses bounded connection/query timeouts, closes the pool on shutdown, and logs error categories without dumping credentials or database messages. The health route checks connectivity; a healthy response does **not** replace migration or login verification. [Render port binding](https://render.com/docs/web-services#port-binding).

Generate the JWT secret locally and paste it into the backend dashboard only:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Do not save the output in this guide or a public ticket. Changing this secret invalidates existing tokens. Use [Render's environment settings](https://render.com/docs/configure-environment-variables) to enter secrets; never use `VITE_` names for them.

Render's Express example proposes one trusted proxy hop, but the actual ingress path must be verified. Do not use unrestricted proxy trust or increase the count by guessing. Confirm that two independent client connections receive separate rate-limit buckets and that a forged `X-Forwarded-For` value cannot reset the caller's bucket. If the topology differs, verify it with the provider before changing the count. With `0`, requests may share a proxy's bucket. [Render Express example](https://render.com/articles/how-to-implement-authentication-and-authorization), [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies.html).

Record the actual backend URL shown by Render. Open `https://<assigned-backend>.onrender.com/api/health` and expect HTTP 200. Configure the planned frontend origin initially, then correct `CORS_ORIGIN` to the **assigned** static-site origin in the next step before testing the UI.

## 5. Create the Render frontend

Choose **Static Site** for the same repository, with free hosting. This is a static build, not a Node web service.

| Setting | Proposed value |
| --- | --- |
| Name | `slotguard` (adjust if unavailable; record the assigned URL) |
| Branch | `main` |
| Root directory | Leave blank: repository root |
| Build command | `npm ci --include=dev && npm run build --workspace client` |
| Publish directory | `client/dist` |
| Auto-deploy | Off during initial verification; then **After CI Checks Pass** |
| PR previews | Disabled |
| Custom domain | None; use the assigned `onrender.com` URL |

| Frontend build variable | Value |
| --- | --- |
| `NODE_VERSION` | `24.21.0` |
| `VITE_API_BASE_URL` | `https://<assigned-backend>.onrender.com/api` |
| `SKIP_INSTALL_DEPS` | `true` (the build command installs the lockfile itself) |

The API address is public and is substituted into the bundle **at build time**. A Render build fails if the value is missing, points to loopback/placeholder hosts, or uses HTTP. After changing it, choose **Save, rebuild, and deploy**. Do not copy the backend environment onto the static site. Render automatically sets `RENDER=true`, which enables this build validation. [Render environment defaults](https://render.com/docs/environment-variables), [Static Site dependency installation](https://render.com/docs/static-sites#dependency-installation).

The current application uses React state navigation at `/`; it does not use React Router or deep links, so no SPA fallback rule is required. If path-based routing is introduced later, add the Render rewrite `/*` to `/index.html` with action **Rewrite**. Do not redirect API requests to the static site. [Render redirects and rewrites](https://render.com/docs/redirects-rewrites).

Record the assigned frontend URL. Set the backend `CORS_ORIGIN` to that exact origin and redeploy the backend. Requests must go from the HTTPS frontend to the HTTPS backend `/api` URL. Do not use wildcard CORS. Static-site URLs and backend origins must match even if Render added a suffix to a requested service name.

## 6. Verify and enable CI-gated deployments

1. Confirm both services are Free, billing is inactive, no payment method was added, and Neon is Free. Inspect usage dashboards and available quotas.
2. Verify the GitHub **CI / Verify** run passed for the commit being deployed, even though the repository's first run already passed.
3. Check the backend HTTPS health route, then sign in through the static site as both Student and Tutor. Inspect browser requests: no localhost address, mixed content, or CORS failure.
4. Create a future half-hour slot as Tutor. Book it as Student, refresh/reload, and confirm the persisted appointment and the Tutor's Student details. Cancel it and confirm it becomes available again. Close an unbooked slot.
5. In two independent browser sessions, sign in as different Students and select the same available slot before either books it. Confirm one reservation succeeds and the other receives a conflict; only one confirmed booking appears.
6. Confirm role and ownership restrictions, production-origin preflight behavior, safe error messages, mobile layout, and keyboard operation. Confirm the proxy/rate-limit behavior described above.
7. Restart/redeploy the API and verify appointments remain in Neon. Inspect logs for startup/database failures without exposing secrets. TLS/network verification is pending until this step runs on real services.
8. Let the Free backend become idle for at least 15 minutes, then verify a cold-start login. Avoid recurring keep-alive requests. The client allows a 90-second request and offers retry feedback; a timed-out mutation requires refreshing before another attempt.
9. Confirm initial seeds and future availability. Establish a manual reminder to replenish demo slots, and repeat it only with the protected production database URL.
10. Set both services to **After CI Checks Pass**, keep previews disabled, and verify the setting. Render's initial service creation/manual deploys still require operator review; CI gating governs subsequent auto-deploys. [Render auto-deploy settings](https://render.com/docs/deploys#configure-auto-deploys).

## Free-tier behavior and shared demo accounts

Render Free web services sleep after 15 idle minutes and typically take about a minute to wake. Neon can also suspend idle compute. Quotas, suspension, and cold starts mean this demo has no availability guarantee; use the dashboards to check current limits, and never enable billing to resolve a quota issue without changing the agreed budget. [Render Free limitations](https://render.com/docs/free), [Neon plans](https://neon.com/docs/introduction/plans).

Demo credentials are deliberately public and appear in the login UI. Anyone can create, cancel, or close fictional data using the shared roles, and simultaneous visitors can change what another visitor sees. These are not real university accounts or personal records. Do not import real student information. JWT expiry and process-local request limits reduce some abuse but do not isolate visitors sharing an account; request counters also reset on restart. There is no public database reset endpoint.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing workspace, lockfile, or SQL migrations | Root directory must be blank; run the documented build from repository root. |
| TypeScript/Vite command missing | Use `npm ci --include=dev`, including build-time development dependencies. |
| Hosted frontend build rejects API URL | Set the actual HTTPS backend `/api` URL; remove placeholders, credentials, and query strings. |
| Browser still requests an old API URL | Rebuild the frontend after changing `VITE_API_BASE_URL`; changing runtime backend settings cannot change a static bundle. |
| CORS failure | Match the assigned frontend HTTPS origin exactly, without a path or trailing slash; redeploy the backend. |
| API never opens a port | Check required environment variable names, JWT length/placeholders, direct database connectivity, and `PORT`; start with `npm start`. |
| Remote database URL is rejected | Use exactly one `sslmode=verify-full`, no host/TLS override options, and the correct Neon direct endpoint. Do not disable certificate checking. |
| TLS verification or connection fails | Verify the copied hostname and password encoding, Node CA trust, Neon endpoint/compute state, and region. Report sanitized error categories, not the connection URL. |
| Health succeeds but login/queries fail | Health checks connectivity only. Confirm migrations and seeds ran against the same database used by the backend. |
| Migration checksum mismatch | Restore the original applied SQL and its LF line endings; add a new version for schema changes. Do not rewrite history/checksums. |
| Login temporarily slow or fails | Check cold starts, provider status/quotas, and startup logs; retry reads/login when appropriate. Refresh after an uncertain booking/cancellation outcome. |
| Visitors share unexpected 429 responses | Verify `TRUST_PROXY_HOPS` for the actual ingress path. Do not disable limits or trust arbitrary headers. |
| CI database tests fail to start | Check the PostgreSQL 18 service health and `TEST_DATABASE_URL`; do not substitute Neon or application data. |
| Local browser smoke fails | Check the browser install, isolated test database, and service readiness. A successful-booking focus assertion timed out intermittently during preparation; investigate before adding this check to CI. |
| Services deploy before CI | Use the GitHub integration and **After CI Checks Pass**, after a successful workflow run. Do not use a deploy hook or Render API token. |
| No future appointments | Run the idempotent `db:replenish` command through the protected production connection process. |
| Free plan/card/payment requirement prevents creation | Stop before accepting; document the limitation and review a free alternative. |

## Local reproduction

Configure only `server/.env.test` with a local database named `slotguard_test` or `slotguard_<suffix>_test`. The isolated browser launcher uses ports `3301` and `5181`, a compiled API, a separate frontend build, and this test database. It never uses the application `DATABASE_URL`. Do not run another integration suite against the same test database concurrently.

```sh
npm ci --include=dev
npm run db:prepare:test
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:client
npm run test:browser:isolated
```

The local browser default is installed Microsoft Edge. For bundled Chromium, install it using `npx --no-install playwright install chromium` (on Linux, use `--with-deps`) and set `SLOTGUARD_BROWSER_CHANNEL=chromium` before running the isolated smoke. Build first; the launcher requires `server/dist/index.js`. Generated builds and screenshots remain ignored. Browser testing is not currently a required CI step for the reliability reason described above.
