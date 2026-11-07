# STOICS — Secret Room Manager

Flyff Universe guild management with **Supabase Postgres and Supabase Auth**, Next.js App Router, TypeScript, Prisma, Tailwind CSS, dnd-kit, Zod, and Recharts. The production roster starts empty. The optimizer, transactions, historical snapshots, and UI are preserved through the Supabase migration.

## Set up your Supabase project

Requires Node.js 22+ and a Supabase project. No project is created automatically.

1. Create a Supabase project and save its database password.
2. Copy `.env.example` to `.env`. Existing installations should add the new variables to their current `.env` rather than overwrite it.
3. From the project's API settings, fill `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **server-only** `SUPABASE_SECRET_KEY`. Legacy anon and service-role keys are supported through `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` respectively. Never put a secret/service-role key in a `NEXT_PUBLIC_*` variable.
4. From the **Connect** dialog, copy the transaction pooler connection into `DATABASE_URL` and the direct or session-pooler connection into `DIRECT_URL`. Use the actual region/hostname from your project; the example is a template. URL-encode special characters in the database password.
5. Set `ADMIN_EMAIL` to your real administrator email and `ADMIN_PASSWORD` to a strong password of at least 12 characters. Supabase project password rules must also be satisfied.
6. In Supabase Auth, enable email/password sign-in and disable public account sign-ups for this private workspace. Administrators create guild accounts through Settings. The seed uses the Auth Admin API and confirms the initial admin email; it does not send invitation email.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000), then sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. Until Supabase is configured, the sign-in screen remains available and reports setup errors; there is no fallback to the former local authentication.

### Connection settings

This project uses Prisma 6. `DATABASE_URL` handles runtime queries; `DIRECT_URL` is explicitly configured in `prisma/schema.prisma` for Prisma CLI migrations. A typical serverless runtime connection uses the Supabase transaction pooler on port 6543 with `pgbouncer=true&connection_limit=5&sslmode=require`. Migrations use a direct connection or the session pooler on port 5432. The shared session pooler is useful on IPv4-only networks where the direct database endpoint is unreachable.

Use a database owner / server role that can access the application tables despite RLS for Prisma. The example uses the project's `postgres` account. These credentials stay on the server. The application does not issue database queries from browser components.

See the primary [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma) and [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) for connection options.

## Migrating an existing installation

The new committed migration adds a nullable, unique Supabase Auth UUID to each guild account. It preserves existing guild/account IDs, members, roles, run records, attendance, drafts, audit links, and legacy hashes. Legacy hashes are no longer used for authentication. They are cleared when an account is explicitly linked.

Changing `DATABASE_URL` does **not** copy a local database to Supabase. If you already have guild data:

1. Back up the original database. Restore only the application's `public` tables and migration history into the new project's `public` schema using PostgreSQL backup/restore tooling. Do not overwrite Supabase-managed `auth`, `storage`, or other platform schemas.
2. Point both connection variables at the Supabase project and run `npm run db:migrate`. Do not reset the database or baseline away existing migration history.
3. Run the seed with the existing administrator's email. It creates a Supabase identity and links the existing guild profile without changing its ID or role. If that email already exists in Supabase, `ADMIN_PASSWORD` must match the existing Supabase password before linking is allowed. The seed never resets an existing Auth password or promotes an existing Viewer/Officer profile.
4. For other legacy guild accounts, an Admin can create/link an account in Settings using the same email and a new initial password. This creates a fresh Supabase identity and preserves the old guild profile's ID and historical relations. If the Auth identity already exists, explicitly link that profile with the operator-run seed and its current password, or review the UUID mapping as an administrator.

All users must sign in again. Former `stoics-session` JWT cookies and `SESSION_SECRET` are no longer used. An email match during ordinary sign-in never grants guild access or links an account automatically.

## Authentication and authorization

- Password verification and sessions now belong to Supabase Auth. There is no local bcrypt or custom JWT sign-in path.
- The server uses a request-scoped `@supabase/ssr` client with HttpOnly, SameSite=Strict cookies and Secure cookies in production. Supabase refreshes expired access tokens through the Route Handler cookie adapter.
- Protected APIs verify identity using `auth.getUser()`, then find the guild account by the immutable Supabase user UUID. Guild permissions are loaded from the database on every request, never from editable Supabase `user_metadata`.
- Admin: full management and account creation. Officer: member, roster, attendance, and AI operations. Viewer: read-only guild access.
- Every auth read occurs in a Route Handler, where cookies can be updated, so no Next.js refresh proxy is needed for this implementation. Add the documented proxy flow if future Server Components start reading auth sessions. See [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- New account creation uses the server-only Auth Admin API. The profile, guild revision and audit entry commit together in PostgreSQL; if that transaction fails, the newly created Auth identity is deleted. If cleanup itself fails, the error identifies the orphan UUID for manual recovery. Passwords are excluded from audit entries.
- The migration enables RLS on all 15 guild tables and revokes direct table privileges from `PUBLIC`, `anon`, and `authenticated` where those roles exist. There are deliberately no browser Data API policies: browser requests go through the authorized Next.js API. Supabase Auth users cannot directly create guild profiles or alter their roles. RLS does not protect against trusted database owner/server credentials; those must remain secret.
- Same-host Origin validation remains enabled. Set `APP_ORIGIN=https://your-domain.example` in production and preserve Host through your reverse proxy. Production auth requires HTTPS.
- Per-process login throttling remains in addition to Supabase Auth limits. Use a shared ingress limiter for multiple app replicas. Public signup, email invitations, MFA UI and password-recovery UI are not implemented by this workspace; configure account recovery operationally through Supabase as needed.

## Guild workflow

1. **Members:** add/edit characters or import CSV/XLSX. Review column mappings, new/updated rows, normalized Unicode matches and possible duplicates before confirming. Import changes name, class and level only; ratings, roles, tags, notes and attendance survive. Missing members are flagged, never deleted. CSV/XLSX exports are available. Archive members to preserve history; members with run references cannot be deleted.
2. **Capabilities:** configure primary/secondary eligible roles, four actual ratings (1–10), High DPS/AoE, Core, availability and notes. Bulk actions change availability or add eligible roles. Upload licensed class artwork in Settings; original role/class symbols are included.
3. **Schedule:** defaults to the next Sunday at 10 PM Asia/Manila. Ranking and Drop Runs have independent rosters/status/history. Ranking always targets 24 players; Drop targets 1–24. Runs within two hours cannot share members unless both opt in.
4. **Build:** generate, drag between slots to swap, drag reserves onto occupied slots to replace, remove to reserves, edit roles, lock exact positions, undo/redo and save. Save local changes before regenerating unlocked slots. Unlock and save before moving a locked character. Run rules include exclusions, per-run availability, overlap and Drop participant count.
5. **Finalize:** shared server-side rules enforce counts, uniqueness, capacity, eligibility, locks and Ranking Tank/Support coverage. Finalized plans are immutable. Record actual replacements separately in Attendance History.
6. **Attendance:** mark planned members absent, add replacements, assign real parties/roles and enter duration (seconds), rank, rewards and notes. Confirming Ranking attendance requires 24 actual participants. Historical snapshots survive later character edits or archiving.
7. **Rotation:** confirmed actual attendance alone determines total runs, latest appearance, missed events and consecutive appearances. Simultaneous groups at the exact same scheduled time are one opportunity for missed/consecutive counts, but count as separate attended runs. Missed-event statistics currently span the recorded guild history, including events before a member was imported.
8. **Share:** save first; copy Discord-friendly text or export CSV, PNG or PDF with optional levels, ratings and badges. PNG/PDF render the saved preview and preserve Unicode names/icons. PDF text is rasterized. CSV protects against spreadsheet formula injection.

Imports support a header row, the first XLSX worksheet, up to 2,000 rows and files up to 10 MB. Convert legacy `.xls` files to XLSX/CSV. Screenshot/OCR import remains a future workflow with mandatory review.

## Roster optimizer and AI

`lib/optimizer.ts` remains deterministic. It filters eligibility and cross-run conflicts, respects locks, matches distinct characters to scarce Ranking Tank/Support positions, and fills remaining slots using configured role ratings, buff/AoE coverage, DPS tags, core preference, rotation and party strength. Drop runs amplify fairness. All results pass the shared validator; shortages return actionable errors or composition warnings. Configure weights in Settings.

This is a constraint-checked heuristic, not a proof of a globally optimal lineup or a damage simulation. Party DPS totals sum administrator ratings, not damage. No guaranteed or uncalibrated predicted clear times are shown.

For AI, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default `gpt-4.1-mini`, requiring strict structured JSON chat completions), then restart the app. AI receives relevant ratings, capabilities, planned rosters and recent confirmed attendance; private build/officer notes are excluded. Proposals are validated, shown as a diff, and require explicit approval. Drop participant-count proposals are saved atomically with their full lineup. Stale proposals cannot apply after a guild revision changes. Missing credentials or provider failure leave ordinary generation and manual editing available. Live AI calls require your own key.

## Tests

```sh
npm test
npm run typecheck
npm run build
npm audit
```

The offline suite covers roster constraints and rotation plus Supabase ID authorization, password delegation, unlinked-account rejection, SSR cookie refresh, logout, throttling, bootstrap identity verification, legacy-profile linking and account-provisioning compensation. These auth/provider tests use mocks; they do not claim a live Supabase project was contacted.

The optional database tests use real PostgreSQL to check the UUID uniqueness migration and RLS denial. Run only against a disposable database with permission to create a temporary test role:

```powershell
$env:RUN_DATABASE_TESTS='true'
npm test
```

For full browser tests, configure a **disposable Supabase project**, apply migrations, and start `npm run dev`. Tests create an isolated test guild and Supabase Auth identity, then clean them up:

```powershell
npx playwright install chromium
$env:RUN_SUPABASE_E2E='true'
npm run test:e2e
```

The live suite is skipped unless explicitly enabled. It covers reviewed Unicode import, preserved ratings, generation, real drag-and-drop swaps, undo/redo, downloads, lock enforcement, attendance replacements/snapshots, stale revisions, origin checks, resizing and Viewer access. Screenshots/downloads go to `output/`. With no project configured, separate browser smoke tests check setup errors and rejection of legacy sessions.

`npm run db:local` remains an optional embedded PostgreSQL utility for database-only tests; it does not emulate Supabase Auth. New databases use UTF-8. Prefer a local Supabase CLI stack or a disposable hosted project for full-stack development. The existing `.local` database is retained and never silently copied or deleted.

To intentionally seed demo characters, set `DEMO_SEED=true` in a separate disposable project and run the seed. Names are explicitly `DEMO-*`; production rejects demo seeding. No fake members are added by default.

## Deployment

### GPT Site

The private GPT Site source is in `sites/stoics-manager`. It bundles the existing interface into a portable Cloudflare Worker and uses Supabase HTTPS RPC instead of Prisma TCP. The original Next.js deployment below remains supported. See [the Site deployment guide](sites/stoics-manager/README.md) for activation. After creating your Supabase project, apply **all** Prisma migrations (including the Sites HTTP bridge), bootstrap your admin, configure the three Supabase runtime values in Sites, and redeploy the saved version. No database password is needed in Sites.

Configure the same Supabase variables on your hosting platform. Run `npm run db:migrate` before deploying application code that needs a new schema, and bootstrap the first admin once. Never use a transaction pooler for migrations. Back up data before schema changes.

Docker support uses Supabase for both persistence and Auth; Compose no longer starts a separate PostgreSQL database:

```sh
docker compose up --build -d
```

With a configured `.env`, the migration job applies committed Prisma migrations and the idempotent admin seed before starting the non-root standalone Next.js app on port 3000. Put it behind HTTPS and preserve Host. `.env` is excluded from image builds. The service key is read only at runtime. Docker engine and real cloud connectivity must be available to verify deployment.

## Code map

- `lib/supabase`: request-scoped SSR client, server/CLI admin client and configuration.
- `lib/auth.ts`: verified Supabase identity → current guild permissions.
- `lib/provision-account.ts` / `lib/bootstrap-admin.ts`: account creation, explicit linking and rollback.
- `app/api`: protected read model, mutations, login/logout and AI.
- `lib/domain.ts` / `lib/optimizer.ts`: schemas, eligibility, attendance, constraints and assignment.
- `components`: workspace shell and separate dashboard, roster, member, reserves, attendance, statistics, analysis and settings modules.
- `prisma`: normalized relational schema, additive migrations and explicit seed.

Supabase Postgres remains accessed through Prisma to preserve the existing transactional roster logic. Storage uploads and Realtime subscriptions are not needed by this migration; class icons continue to live in the database.
