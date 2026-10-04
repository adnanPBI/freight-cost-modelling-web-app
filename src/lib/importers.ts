import * as XLSX from 'xlsx';

export type ImportIssue={sheet:string,row?:number,message:string,severity:'error'|'warning'};
export type ParsedRateRow={sheet:string,row:number,mode:'FTL'|'PALLET'|'LTL-PALLET',originCountry:string,destinationCountry:string,destinationRegion:string,laneIdentifier:string,baseRate?:number,palletBands?:Record<number,number>,transitDays?:number,assetModel?:string,capacity?:number};
export type ParsedAllocationRow={row:number,dc:string,mode:string,originCountry:string,destinationCountry:string,destinationRegion:string,destinationZip?:string,customerFlag?:string,allocationOrder:number,carrier:string,laneKey:string,notes?:string};
export type WorkbookMetadata={validFrom?:string,validTo?:string,originDc?:string,originZip?:string,originSuburb?:string,equipment?:string,transportMode?:string,rfpLink?:string,freeCollectionHours?:number,freeDeliveryHours?:number,supplierCompany?:string,representativeName?:string,email?:string,telephone?:string};

const norm=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
const asText=(v:unknown)=>String(v??'').trim();
const asNum=(v:unknown)=>{ const n=typeof v==='number'?v:Number(String(v??'').replace(/,/g,'')); return Number.isFinite(n)?n:undefined; };
const region=(v:unknown)=>{ if(v===null||v===undefined) return ''; if(typeof v==='number') return Number.isInteger(v)?String(v).padStart(v<10?2:1,'0'):String(v); return String(v).trim(); };
function findHeader(rows:unknown[][], required:string[]){
  for(let i=0;i<Math.min(rows.length,40);i++){ const cells=rows[i].map(norm); if(required.every(h=>cells.some(c=>c.includes(h)))) return i; }
  return -1;
}
function findCol(headers:unknown[], aliases:string[]){ const n=headers.map(norm); return n.findIndex(h=>aliases.some(a=>h===a||h.includes(a))); }
function scanMetadata(rows:unknown[][]):WorkbookMetadata{
  const out:WorkbookMetadata={}; const flat: {k:string,v:unknown}[]=[];
  for(const row of rows.slice(0,40)) for(let c=0;c<row.length-1;c++){ const k=norm(row[c]); if(k) flat.push({k,v:row[c+1]}); }
  const pick=(keys:string[])=>flat.find(x=>keys.some(k=>x.k.includes(k)))?.v;
  out.validFrom=asText(pick(['RATES VALID FROM'])); out.validTo=asText(pick(['RATES VALID TO']));
  out.originDc=asText(pick(['ORIGIN DC'])); out.originZip=asText(pick(['ORIGIN ZIP CODE'])); out.originSuburb=asText(pick(['ORIGIN SUBURB']));
  out.equipment=asText(pick(['EQUIPMENT'])); out.transportMode=asText(pick(['TRANSPORT MODE'])); out.rfpLink=asText(pick(['RFP LINK']));
  out.freeCollectionHours=asNum(pick(['FREE TIME - COLLECTION','FREE TIME COLLECTION'])); out.freeDeliveryHours=asNum(pick(['FREE TIME - DELIVERY','FREE TIME DELIVERY']));
  for(let r=0;r<rows.length;r++){
    const joined=rows[r].map(asText).join(' | ');
    if(joined.toUpperCase().includes('RFP RESPONSE IS PREPARED BY')){
      const next=rows.slice(r+1,r+6).flat().map(asText).filter(Boolean);
      const company=next.find(x=>x.toUpperCase().includes('SUPPLIER COMPANY'));
      if(company) out.supplierCompany=company.replace(/[<>]/g,'').replace(/Enter Supplier Company Name/i,'').trim();
    }
  }
  return out;
}
export function parseRateWorkbook(buffer:Buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true,raw:true}); const rowsOut:ParsedRateRow[]=[]; const issues:ImportIssue[]=[]; let metadata:WorkbookMetadata={};
  for(const sheetName of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:true}) as unknown[][];
    metadata={...metadata,...Object.fromEntries(Object.entries(scanMetadata(rows)).filter(([,v])=>v!==undefined&&v!==''))};
    const hi=findHeader(rows,['ORIGIN COUNTRY','DEST']); if(hi<0) continue; const h=rows[hi];
    const cOrigin=findCol(h,['ORIGIN COUNTRY']); const cCountry=findCol(h,['DEST. COUNTRY','DESTINATION COUNTRY']); const cRegion=findCol(h,['DEST. REGION','DESTINATION REGION']); const cLane=findCol(h,['DC* REG*','LANE IDENTIFIER']); const cBase=findCol(h,['BASE RATE PER TRIP']); const cTransit=findCol(h,['TRANSIT TIME']); const cAsset=findCol(h,['PRIMARY ASSET MODEL']); const cCapacity=findCol(h,['DAILY COMMIT','CAPACITY']);
    const palletStart=h.findIndex(x=>norm(x)==='1'); const isPallet=palletStart>=0; const mode:narrowMode = sheetName.toUpperCase().includes('LTL')?'LTL-PALLET':isPallet?'PALLET':'FTL';
    for(let r=hi+1;r<rows.length;r++){
      const row=rows[r]; if(!row.some(x=>x!==null&&asText(x)!=='')) continue;
      const origin=asText(row[cOrigin]); const dest=asText(row[cCountry]); const reg=region(row[cRegion]); if(!origin||!dest||!reg){ issues.push({sheet:sheetName,row:r+1,message:'Missing origin/destination/region',severity:'error'}); continue; }
      const lane= cLane>=0 && asText(row[cLane]) ? asText(row[cLane]) : `${dest}-${reg}`;
      const rec:ParsedRateRow={sheet:sheetName,row:r+1,mode,originCountry:origin,destinationCountry:dest,destinationRegion:reg,laneIdentifier:lane,transitDays:cTransit>=0?asNum(row[cTransit]):undefined,assetModel:cAsset>=0?asText(row[cAsset]):undefined,capacity:cCapacity>=0?asNum(row[cCapacity]):undefined};
      if(isPallet){ const bands:Record<number,number>={}; for(let p=1;p<=36;p++){ const n=asNum(row[palletStart+p-1]); if(n!==undefined) bands[p]=n; } rec.palletBands=bands; if(Object.keys(bands).length===0) issues.push({sheet:sheetName,row:r+1,message:'No pallet rates populated in 1-36 bands',severity:'warning'}); }
      else { rec.baseRate=cBase>=0?asNum(row[cBase]):undefined; if(rec.baseRate===undefined) issues.push({sheet:sheetName,row:r+1,message:'Missing base rate per trip',severity:'error'}); }
      rowsOut.push(rec);
    }
  }
  return {metadata,rows:rowsOut,issues,sheets:wb.SheetNames};
}
type narrowMode='FTL'|'PALLET'|'LTL-PALLET';
export function parseAllocationWorkbook(buffer:Buffer){
  const wb=XLSX.read(buffer,{type:'buffer',raw:true}); const issues:ImportIssue[]=[]; const rowsOut:ParsedAllocationRow[]=[];
  for(const sheetName of wb.SheetNames){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:null,raw:true}) as unknown[][]; const hi=findHeader(rows,['ALLOCATION','DC','MODE','CARRIER']); if(hi<0) continue; const h=rows[hi];
    const idx=(a:string[])=>findCol(h,a); const cDC=idx(['DC']); const cMode=idx(['MODE']); const cOC=idx(['ORIGIN COUNTRY']); const cDCountry=idx(['DESTINATION COUNTRY']); const cRegion=idx(['DESTINATION REGION']); const cZip=idx(['DESTINATION ZIP']); const cCust=idx(['CUSTOMER FLAG']); const cOrder=idx(['ALLOCATION ORDER']); const cCarrier=idx(['CARRIER']); const cLane=idx(['DC, MODE, DESTINATION REGION']);
    const seen=new Set<string>();
    for(let r=hi+1;r<rows.length;r++){ const row=rows[r]; if(!row.some(x=>x!==null&&asText(x)!=='')) continue; const order=Number(row[cOrder]); const carrier=asText(row[cCarrier]); const dc=asText(row[cDC]); const mode=asText(row[cMode]); const dest=asText(row[cDCountry]); const reg=region(row[cRegion]); if(!dc||!mode||!carrier||!dest||!reg||!Number.isInteger(order)||order<1||order>5){ issues.push({sheet:sheetName,row:r+1,message:'Invalid allocation row: DC/mode/carrier/destination/region/order required; order must be 1-5',severity:'error'}); continue; }
      const key=[dc,mode,dest,reg,asText(row[cZip]),asText(row[cCust]),order].join('|'); if(seen.has(key)){ issues.push({sheet:sheetName,row:r+1,message:'Duplicate allocation row',severity:'error'}); continue;} seen.add(key);
      rowsOut.push({row:r+1,dc,mode,originCountry:asText(row[cOC]),destinationCountry:dest,destinationRegion:reg,destinationZip:asText(row[cZip])||undefined,customerFlag:asText(row[cCust])||undefined,allocationOrder:order,carrier,laneKey:asText(row[cLane])||`${dc}_${mode}_${dest}-${reg}`,notes:asText(row[h.length])||undefined});
    }
  }
  return {rows:rowsOut,issues,sheets:wb.SheetNames};
}
export function normalizePostcode(v:string){ return v.replace(/\s+/g,'').toUpperCase(); }
export function findRegionByLongestPrefix(country:string,postcode:string,mappings:{countryCode:string,prefix:string,destinationRegion:string}[]){ const p=normalizePostcode(postcode); return mappings.filter(m=>m.countryCode.toUpperCase()===country.toUpperCase()&&p.startsWith(normalizePostcode(m.prefix))).sort((a,b)=>normalizePostcode(b.prefix).length-normalizePostcode(a.prefix).length)[0]?.destinationRegion; }
