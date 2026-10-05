# Carrier Rate & Allocation Platform

Private, tenant-scoped web application for European road-freight rate management, allocation governance, customer-volume costing, scenarios, commercial history and Excel import/export.

## Production stack

- Next.js 16 App Router + TypeScript
- PostgreSQL 17 + Prisma 6
- Email/password authentication with signed HTTP-only session cookies
- @ayocore/exceljs for XLSX import/export
- Render Frankfurt deployment blueprint
- Node.js 22
- Vitest regression/security suite

There is no public registration, no FX engine, no live carrier feed and no AI optimization. Rates are enforced as EUR only.

## Client requirements implemented

### Excel import workflow

All four client workbook families use the same controlled workflow:

1. Upload an `.xlsx` workbook (10 MB maximum).
2. Detect the workbook header instead of relying on a fixed row number.
3. Parse and normalize values while preserving leading-zero postcode/region values.
4. Show a review page with parsed rows, warnings and row-level validation errors.
5. Persist an immutable `ImportJob` record containing checksum, parsed data, issues and audit metadata.
6. Commit business records only after the preview contains no blocking errors.

Supported import types:

- FTL rate cards
- 1–36 pallet-band / LTL-PALLET rate cards, including two-row pallet headers
- Allocation keys with Primary / Secondary / Tertiary / Backup 1 / Backup 2
- Customer volumes
- Postcode-to-region mappings

Rate-card import creates a new rate-card version and never overwrites the previous commercial version. Allocation import creates a Draft key. Postcode changes create effective-dated mapping versions and remap existing volume records through the immutable revision trail.

### Relational model and history

All business rows are tenant-scoped. The model includes:

- tenants and tenant configuration
- users
- carriers and aliases
- DCs and modes
- lanes
- rate cards, lane rates and 1–36 pallet bands
- allocation keys and allocation rules
- customer volumes
- postcode mappings
- fuel surcharges
- accessorial types and carrier agreements
- scenarios and scenario rules
- import history
- audit events
- immutable entity revisions

Version/supersession relationships exist for rate cards, allocation keys, postcode mappings, fuel surcharges and accessorial agreements. Mutable master-data changes are captured through `EntityRevision`.

### Allocation governance

- Primary through Backup 2 ladder
- Draft / Active / Expired lifecycle
- transactional Publish operation
- prior Active key expiry on Publish
- customer-specific and destination-postcode-specific exceptions
- key-to-key comparison
- modelled cost-impact comparison
- scenario-to-Draft promotion

### Costing and lane search

The costing engine resolves, in order:

- tenant
- customer volume
- postcode mapping
- lane
- allocation rule
- carrier
- effective contracted rate card
- FTL rate or pallet band
- applicable fuel surcharge
- applicable accessorial assumptions

It supports DC, mode, lane, carrier and customer views; configured pallet rounding; >36-pallet policy; optional pallet-to-FTL conversion; contracted-carrier alternative search; and separate base/fuel/accessorial/total amounts.

### Scenario modelling

Implemented rule types:

- carrier replacement
- lane volume split
- customer assignment
- customer split
- optional pallet-to-FTL conversion

Scenarios report baseline versus scenario totals and can promote allocation changes to a new Draft allocation key.

### Reporting and Excel export

Available authenticated XLSX outputs:

- allocation key
- key-to-key comparison and cost impact
- lane/carrier comparison
- rate-card register
- rate-version change analysis
- customer volumes
- cost profiles
- scenarios
- Coverage Gaps
- postcode mappings

Coverage Gaps is calculated from live tenant data and checks allocation/rate/mapping/expiry conditions; it is not a hard-coded report.

## Security controls

- No public registration
- Signed HTTP-only secure cookies in production
- tenant-scoped server queries and APIs
- same-origin enforcement for state-changing requests
- authenticated business endpoints
- 10 MB XLSX upload ceiling
- extension and MIME checks
- EUR-only database enum and validation
- import checksum history
- no bootstrap-login bypass
- production `AUTH_SECRET` length enforcement
- security headers in the application configuration
- production dependency audit as a build gate

The current release build reports **0 production dependency vulnerabilities**.

## Automated verification

The production build runs the test suite before compilation. Current regression coverage includes:

- rate-card, pallet-band, allocation, volume and postcode import behavior
- costing and pallet-edge-case rules
- authentication/upload/security controls
- tenant-isolation helpers

Latest verified release: **17 tests passing across 4 test files**.

## Reproducible database/dependency deployment

The repository contains:

- `package-lock.json`
- `prisma/migrations/20261005002634_init/migration.sql`
- `prisma/migrations/migration_lock.toml`
- idempotent `prisma/seed.ts`
- `render.yaml`
- Dockerfile
- CI workflow

Render Blueprint production flow:

- build: `npm ci && npx prisma generate && npm run build`
- pre-deploy: `npm run db:deploy`
- start: `npm start -- -H 0.0.0.0 -p $PORT`

`db:deploy` runs committed Prisma migrations and then the idempotent tenant/master-data seed. An administrator is created only when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are supplied as host secrets.

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL: `docker compose up -d db`.
3. Install exact dependencies: `npm ci`.
4. Generate Prisma: `npm run db:generate`.
5. Apply migrations: `npm run db:migrate`.
6. Seed configuration/master data: `npm run db:seed`.
7. Run tests: `npm test`.
8. Start: `npm run dev`.

Do not commit real credentials or customer workbooks.

## Client-owned production deployment

The committed `render.yaml` specifies a Frankfurt web service and a production PostgreSQL database wired with Render's internal `connectionString`, with migrations/seeding executed as a pre-deploy command.

Three account-owner operations cannot be encoded safely into source control:

1. Apply the Blueprint (or bind `DATABASE_URL` to the production database) in the client's Render account and set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `APP_BASE_URL` as secrets.
2. Attach the client's owned domain to the web service and point DNS at Render. Render will then provision HTTPS/TLS.
3. Make the GitHub repository private and transfer/share it according to the client handover agreement.

The temporary `onrender.com` deployment is suitable for release verification, not a substitute for those client-account ownership steps.

## IP and third-party licences

The project-specific source is covered by the proprietary client-assignment notice in `LICENSE`; dependency licences are listed in `THIRD_PARTY_NOTICES.md`.

Earlier public repository revisions contained GPLv3. A later licence change cannot revoke rights already granted under an earlier valid public licence. That historical legal fact is intentionally documented rather than hidden. Final exclusivity/ownership is governed by the executed client agreement and payment terms.
