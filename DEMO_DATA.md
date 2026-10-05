# Synthetic Demonstration Dataset

The repository contains an opt-in synthetic dataset in `prisma/demo-seed.ts`.

Enable it with:

```
SEED_DEMO_DATA=true
```

The dataset is deliberately fictional and is intended only for demos, screenshots, acceptance walkthroughs and sales presentations. It does not represent real customers, carriers, prices, contracts or volumes.

## What is seeded

- 12 fictional carriers with aliases
- 72 lanes across CZ, FR and PL DCs
- FTL, PALLET and LTL-PALLET modes
- 60 current/historical/research rate cards
- hundreds of lane-rate rows
- full 1–36 pallet-band tariffs
- current and historical fuel tables
- waiting-time, pallet-return and special-handling agreements
- nine active allocation scopes plus expired and Draft versions
- Primary through Backup 2 ladders with customer/ZIP exceptions
- 98 annual volume rows covering 24 fictional customers
- current and historical postcode mappings
- four saved modelling scenarios
- completed synthetic import-history records
- selected immutable revision/audit records
- a few intentional Coverage Gaps so the dashboard/reporting screens are visually meaningful

The seed is idempotent. A `DemoSeed` audit marker prevents duplicate data on subsequent deployments.

To use a clean production tenant, set `SEED_DEMO_DATA=false` (or remove the environment variable) before provisioning the production database.
