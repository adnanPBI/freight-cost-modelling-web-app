# Carrier Rate & Allocation Platform — MVP

Private web application implementing the Pantheras Global Limited v1.1 developer brief for carrier rate cards, allocation keys, freight cost modelling, scenarios, commercial history and Excel import/export.

## Stack
- Next.js 16 App Router + TypeScript
- PostgreSQL 17 relational database
- Prisma ORM
- Custom email/password authentication with signed, HTTP-only session cookies
- SheetJS (`xlsx`) for Excel import/export
- Docker-ready deployment

The design deliberately avoids public registration, complex RBAC, AI optimisation, real-time carrier feeds, FX, Parcel import logic and other Phase-2 features that the brief marks as out of scope.

## Implemented MVP foundations
- Tenant ID on every business record and tenant-scoped relational model
- Carriers + aliases, configurable DCs and transport modes
- Versioned rate cards and lane rates, including 1–36 pallet bands
- Versioned allocation keys, five-position allocation ladder, customer/ZIP exceptions, Draft/Active/Expired lifecycle
- Postcode mapping structure, longest-prefix matcher and postcode normalization
- Volume records independent of commercial data
- Fuel and carrier-specific accessorial data separated from base rates
- Scenario/rule data model for replacement, lane split, customer assignment and customer split
- Pallet edge-case costing helpers, FTL base costing, pallet-to-FTL break-even, fuel and total-cost helpers
- Excel rate-card parser with header detection, no fixed row assumptions, FTL and pallet structures, leading-zero-safe destination regions and import issue reporting
- Allocation-key parser calibrated to the provided sample structure and 1–5 allocation order
- Workbook metadata scanning for rate validity, origin DC/ZIP/suburb, equipment, transport mode, RFP link and free-time fields
- Allocation publish transaction that expires the prior active key and retains audit history
- Key-to-key comparison service
- Structured Excel export helper + working Coverage Gaps export endpoint
- Responsive MVP UI for dashboard, imports, carrier master, rate cards, lane search/comparison, allocations, volumes, postcode mappings, scenarios, fuel/accessorials and reports
- Dockerfile and PostgreSQL Docker Compose for local/hosted deployment

## Supplied workbook calibration
The provided rate-card workbook contains:
- `FTL`: header row at row 1, 6 populated lane rows, base rate per trip and operational/commercial attributes.
- `LTL-PALLET and PALLET`: a two-row header structure with `RATE FOR TOTAL PALLETS` above 1–36 pallet bands and 6 populated lanes.

The supplied allocation workbook contains a row-per-allocation-position structure with:
- DC, Mode, origin/destination country, region, ZIP, customer flag, allocation order 1–5, carrier and lane key.
- A general five-carrier ladder, a customer-specific override (`CUSTOMER123`) and a ZIP-specific override (`01093000`).

The parser intentionally treats region values as text at the application boundary so values such as `06` and `01` are retained rather than numerically normalised away.

## Run locally
1. Copy `.env.example` to `.env` and set a strong `AUTH_SECRET`.
2. Start PostgreSQL:
   `docker compose up -d db`
3. Install packages:
   `npm install`
4. Generate Prisma client:
   `npm run db:generate`
5. Create a development migration:
   `npx prisma migrate dev --name init`
6. Seed the tenant, DCs, modes and demo carriers:
   `npm run db:seed`
7. Start the app:
   `npm run dev`

Seed login: `admin@example.com` / `ChangeMe!2026`. Change it immediately outside local demo use.

## UK/EU production deployment
Recommended simple MVP route: deploy the Docker image/application and PostgreSQL database in a UK/EU region under a Pantheras-owned account/domain. Suitable examples are Render Frankfurt, AWS eu-west-2 (London), Azure UK South or an equivalent EU region. Keep uploaded workbooks/backups in the same residency boundary. Enable HTTPS, encryption at rest, database backups, restricted admin access and a provider DPA. Password-reset email, observability or analytics services should only be added after their processing locations are documented.

## Important production hardening before launch
- Replace seed credentials and remove demo data.
- Enforce `AUTH_SECRET` length/rotation and production-only secure cookies.
- Add password-reset email using an approved UK/EU-compatible processor.
- Add CSRF protection for state-changing browser forms if cookie-authenticated HTML forms are expanded.
- Add per-tenant authorization guards to all CRUD API routes as they are added.
- Add malware/file-size/MIME validation around uploads and store originals in a private UK/EU object store.
- Create production Prisma migration files against the target PostgreSQL instance.
- Add automated backup restore test and retention policy.
- Add end-to-end acceptance tests against representative customer volume and mapping workbooks.

## Acceptance mapping
The schema and service layer cover the 25 completion areas from the v1.1 brief: private auth; master data; rate/allocation/postcode import; version/history; volume mapping; five-position allocation ladder; Draft/Publish; comparison; contracted-alternative search model; cost profiling model; pallet edge cases; pallet-to-FTL break-even; rate version comparison foundation; scenarios; scenario promotion data relationship; accessorial/fuel components; total-cost separation; Coverage Gaps data model/report UI; Excel export; tenant enforcement; immutable history; and material exception reporting.

Some UI controls are intentionally MVP-level demonstrations around the implemented service/data model rather than a fully polished enterprise workflow. The next implementation pass should wire remaining CRUD forms directly to the Prisma services and add representative volume/postcode workbooks for end-to-end acceptance testing.
