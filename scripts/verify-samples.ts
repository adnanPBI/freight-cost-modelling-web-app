import fs from 'node:fs';
import path from 'node:path';
import { parseRateWorkbook, parseAllocationWorkbook } from '../src/lib/importers';

async function main(){
  const root=process.env.SAMPLE_DIR||'/mnt/data';
  const rate=path.join(root,'Rate card example - FTL, LTL-PALLET and PALLET.xlsx');
  const allocation=path.join(root,'Allocation Key example.xlsx');
  if(!fs.existsSync(rate)||!fs.existsSync(allocation)){
    console.log('Sample workbooks not found; use npm test for self-contained regression tests.');
    return;
  }
  const rr=await parseRateWorkbook(fs.readFileSync(rate));
  const aa=await parseAllocationWorkbook(fs.readFileSync(allocation));
  console.log(JSON.stringify({
    rateSheets:rr.sheets,rateRows:rr.rows.length,rateIssues:rr.issues,
    allocationRows:aa.rows.length,allocationIssues:aa.issues,firstAllocation:aa.rows[0]
  },null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
