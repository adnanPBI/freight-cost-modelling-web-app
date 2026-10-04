import fs from 'node:fs'; import path from 'node:path'; import {parseRateWorkbook,parseAllocationWorkbook} from '../src/lib/importers';
const root='/mnt/data'; const rate=path.join(root,'Rate card example - FTL, LTL-PALLET and PALLET.xlsx'); const alloc=path.join(root,'Allocation Key example.xlsx');
const rr=parseRateWorkbook(fs.readFileSync(rate)); const aa=parseAllocationWorkbook(fs.readFileSync(alloc));
console.log(JSON.stringify({rateSheets:rr.sheets,rateRows:rr.rows.length,rateModes:Object.fromEntries([...new Set(rr.rows.map(r=>r.mode))].map(m=>[m,rr.rows.filter(r=>r.mode===m).length])),rateIssues:rr.issues,allocationRows:aa.rows.length,allocationIssues:aa.issues,firstAllocation:aa.rows[0]},null,2));
