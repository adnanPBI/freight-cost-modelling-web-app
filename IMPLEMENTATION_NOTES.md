# Implementation notes and assumptions

## Source-specific decisions
1. Rate-card commercial metadata is modelled on the supplied screenshots: valid from/to, origin DC, origin ZIP, origin suburb, equipment, transport mode, RFP link, collection free time and delivery free time. Supplier company / representative details are supported as metadata where the workbook contains them.
2. `DEST. REGION` is treated as text. Numeric workbook values are converted carefully; single-digit numeric regions are left-pad compatible, while literal text such as `06` remains unchanged.
3. The example pallet worksheet currently contains empty band values; the importer loads the lane structure but reports a warning when all 1–36 values are blank.
4. Allocation order maps 1=Primary, 2=Secondary, 3=Tertiary, 4=Backup 1, 5=Backup 2.
5. `CUSTOMER FLAG` and destination ZIP are retained as exception scopes rather than treated as part of the base lane key.

## MVP simplifications aligned to brief
- One permission level is sufficient for normal authenticated users; `ADMIN` is retained for bootstrap/maintenance.
- No public registration.
- No Parcel rate importer until a schema is defined.
- No automatic network optimisation.
- No FX; commercial values are EUR.
- Pallet-to-FTL is modelling only; it does not mutate stored mode/allocation/rate records.
