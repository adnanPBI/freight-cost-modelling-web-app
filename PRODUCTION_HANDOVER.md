# Production handover checklist

This file separates **application completion** from **client-account ownership operations**.

## Application release gates

- [x] Tenant-scoped PostgreSQL model
- [x] Committed Prisma migration and migration lock
- [x] Idempotent seed
- [x] Reproducible npm lockfile
- [x] Four Excel import workflows: preview, validation, commit, history
- [x] Versioned rate cards and allocation keys
- [x] Allocation Draft/Publish and comparisons
- [x] Customer-volume costing including fuel/accessorial components
- [x] Alternative contracted-carrier search
- [x] Scenario engine and Draft promotion
- [x] Rate-change analysis
- [x] Coverage Gaps engine
- [x] Authenticated structured XLSX exports
- [x] Authenticated business APIs
- [x] Tenant isolation and EUR-only enforcement
- [x] Automated parser/costing/security/tenant tests
- [x] Production dependency audit gate
- [x] Proprietary project-source notice plus third-party notices

## Render production account operations

Use the committed `render.yaml`.

1. Create/apply the Blueprint in the client's Render workspace.
2. Confirm both resources are in Frankfurt.
3. Use the Blueprint-managed production PostgreSQL plan, not the temporary free database.
4. Set secrets:
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
   - `APP_BASE_URL`
5. Confirm `DATABASE_URL` is populated from the database's **internal connectionString**.
6. Confirm pre-deploy executes `npm run db:deploy`.
7. Open `/api/readiness`; it must return HTTP 200 / `{"status":"ready"}`.
8. Verify backup retention and perform a restore test before production cutover.
9. Add the client-owned domain and complete DNS verification. Use that HTTPS URL for `APP_BASE_URL`.

## GitHub/IP account operations

1. Change repository visibility to **Private** before commercial handover.
2. Add/transfer access to the client-controlled GitHub account or organization.
3. Preserve `LICENSE`, `THIRD_PARTY_NOTICES.md` and repository history.
4. Execute the governing IP-assignment/payment document; source-code notices do not replace a signed agreement.

## Release verification

A release is considered application-ready only when all of these succeed:

```bash
npm ci
npx prisma generate
npm run lint
npm test
npm run audit:security
npm run build
```

The production Render build runs the test suite and production dependency audit as hard gates.
