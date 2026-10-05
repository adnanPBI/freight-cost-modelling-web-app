import ExcelJS from '@ayocore/exceljs';

export type ImportIssue={sheet:string;row?:number;field?:string;message:string;severity:'error'|'warning'};
export type RateMode='FTL'|'PALLET'|'LTL-PALLET';
export type ParsedRateRow={
  sheet:string;row:number;mode:RateMode;originCountry:string;destinationCountry:string;destinationRegion:string;
  laneIdentifier:string;baseRate?:number;palletBands?:Record<number,number>;transitDays?:number;assetModel?:string;
  capacity?:number;committedTrucks?:number;sourceMetadata?:Record<string,unknown>
};
export type ParsedAllocationRow={
  row:number;dc:string;mode:string;originCountry:string;destinationCountry:string;destinationRegion:string;
  destinationZip?:string;customerCode?:string;allocationOrder:number;percentage?:number;carrier:string;laneKey:string;notes?:string;effectiveFrom?:string
};
export type ParsedVolumeRow={
  row:number;dc:string;mode:string;customerCode:string;customerName:string;destinationCountry:string;
  destinationPostcode:string;normalizedPostcode:string;shipmentCount:number;palletCount?:number;averagePallets?:number;
  shipmentPalletQuantities?:number[];period:string;forecastVolume?:number;notes?:string
};
export type ParsedPostcodeRow={
  row:number;countryCode:string;prefix:string;destinationRegion:string;laneIdentifier?:string;validFrom?:string;notes?:string
};
export type WorkbookMetadata={
  validFrom?:string;validTo?:string;originDc?:string;originZip?:string;originSuburb?:string;equipment?:string;
  transportMode?:string;rfpLink?:string;freeCollectionHours?:number;freeDeliveryHours?:number;supplierCompany?:string;
  representativeName?:string;email?:string;telephone?:string;currency?:string
};

const norm=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
const text=(v:unknown)=>String(v??'').trim();
const numeric=(v:unknown)=>{
  if(v===null||v===undefined||v==='') return undefined;
  if(typeof v==='number') return Number.isFinite(v)?v:undefined;
  const match=String(v).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  if(!match) return undefined;
  const n=Number(match[0]);
  return Number.isFinite(n)?n:undefined;
};
const region=(v:unknown)=>{
  if(v===null||v===undefined) return '';
  if(typeof v==='number') return Number.isInteger(v)&&v>=0&&v<10?String(v).padStart(2,'0'):String(v);
  return String(v).trim();
};
export const normalizePostcode=(v:string)=>v.replace(/\s+/g,'').toUpperCase();

function resolved(cell:ExcelJS.Cell):unknown{
  const value=cell.value as any;
  if(value && typeof value==='object'){
    if(value.result!==undefined && value.result!==null) return value.result;
    if(Array.isArray(value.richText)) return value.richText.map((x:any)=>x.text??'').join('');
    if(value.text!==undefined) return value.text;
    if(value.hyperlink!==undefined) return value.text??value.hyperlink;
  }
  return value;
}

function rowValues(row:ExcelJS.Row){
  const out:unknown[]=[];
  for(let c=1;c<=row.cellCount;c++) out.push(resolved(row.getCell(c)));
  return out;
}

function findHeaderRow(ws:ExcelJS.Worksheet,required:string[]){
  const max=Math.min(ws.rowCount,50);
  for(let r=1;r<=max;r++){
    const cells=rowValues(ws.getRow(r)).map(norm);
    if(required.every(key=>cells.some(c=>c.includes(key)))) return r;
  }
  return -1;
}

function findCol(row:ExcelJS.Row,aliases:string[]){
  const normalized=aliases.map(norm);
  for(let c=1;c<=row.cellCount;c++){
    const value=norm(resolved(row.getCell(c)));
    if(normalized.some(a=>value===a||value.includes(a))) return c;
  }
  return -1;
}

function isoDate(v:unknown){
  if(!v) return undefined;
  if(v instanceof Date) return v.toISOString();
  const d=new Date(String(v));
  return Number.isNaN(+d)?undefined:d.toISOString();
}

function scanMetadata(ws:ExcelJS.Worksheet):WorkbookMetadata{
  const pairs:{key:string;value:unknown}[]=[];
  for(let r=1;r<=Math.min(ws.rowCount,50);r++){
    const row=ws.getRow(r);
    for(let c=1;c<row.cellCount;c++){
      const key=norm(resolved(row.getCell(c)));
      if(key) pairs.push({key,value:resolved(row.getCell(c+1))});
    }
  }
  const pick=(keys:string[])=>pairs.find(p=>keys.some(k=>p.key.includes(norm(k))))?.value;
  const out:WorkbookMetadata={
    validFrom:isoDate(pick(['RATES VALID FROM','VALID FROM'])),
    validTo:isoDate(pick(['RATES VALID TO','VALID TO'])),
    originDc:text(pick(['ORIGIN DC']))||undefined,
    originZip:text(pick(['ORIGIN ZIP CODE','ORIGIN POSTCODE']))||undefined,
    originSuburb:text(pick(['ORIGIN SUBURB']))||undefined,
    equipment:text(pick(['EQUIPMENT']))||undefined,
    transportMode:text(pick(['TRANSPORT MODE','MODE']))||undefined,
    rfpLink:text(pick(['RFP LINK']))||undefined,
    freeCollectionHours:numeric(pick(['FREE TIME - COLLECTION','FREE TIME COLLECTION'])),
    freeDeliveryHours:numeric(pick(['FREE TIME - DELIVERY','FREE TIME DELIVERY'])),
    currency:text(pick(['CURRENCY']))||undefined
  };
  for(let r=1;r<=ws.rowCount;r++){
    const joined=rowValues(ws.getRow(r)).map(text).join(' | ');
    if(!joined.toUpperCase().includes('RFP RESPONSE IS PREPARED BY')) continue;
    for(let rr=r+1;rr<=Math.min(r+8,ws.rowCount);rr++){
      const line=rowValues(ws.getRow(rr)).map(text).filter(Boolean).join(' | ');
      const upper=line.toUpperCase();
      const clean=(label:string)=>line.replace(/[<>]/g,'').replace(new RegExp(label,'i'),'').replace(/^\s*[:|-]\s*/,'').trim();
      if(upper.includes('SUPPLIER COMPANY')) out.supplierCompany=clean('ENTER SUPPLIER COMPANY NAME|SUPPLIER COMPANY NAME');
      if(upper.includes('REPRESENTATIVE')) out.representativeName=clean('ENTER REPRESENTATIVE NAME|REPRESENTATIVE NAME');
      if(upper.includes('EMAIL')) out.email=clean('ENTER EMAIL ADDRESS|EMAIL ADDRESS');
      if(upper.includes('TELEPHONE')) out.telephone=clean('ENTER TELEPHONE NUMBER|TELEPHONE NUMBER');
    }
  }
  return out;
}

function palletBandColumns(header:ExcelJS.Row){
  const bands=new Map<number,number>();
  let sequential=0;
  for(let c=1;c<=header.cellCount;c++){
    const raw=resolved(header.getCell(c));
    const n=numeric(raw);
    if(n && Number.isInteger(n) && n>=1 && n<=36){
      bands.set(n,c); sequential=n; continue;
    }
    const value=header.getCell(c).value as any;
    if(value && typeof value==='object' && value.formula && sequential>=2 && sequential<36){
      sequential+=1; bands.set(sequential,c);
    }
  }
  return bands;
}

function inferRateMode(sheetName:string,header:ExcelJS.Row,metadata:WorkbookMetadata,override?:RateMode):{mode:RateMode;ambiguous:boolean}{
  if(override) return {mode:override,ambiguous:false};
  const base=findCol(header,['BASE RATE PER TRIP']);
  if(base>0) return {mode:'FTL',ambiguous:false};
  const meta=norm(metadata.transportMode);
  if(meta==='LTL-PALLET'||meta.includes('LTL')) return {mode:'LTL-PALLET',ambiguous:false};
  if(meta==='PALLET') return {mode:'PALLET',ambiguous:false};
  const name=norm(sheetName);
  if(name.includes('LTL') && name.includes('PALLET AND PALLET')) return {mode:'PALLET',ambiguous:true};
  if(name.includes('LTL')) return {mode:'LTL-PALLET',ambiguous:false};
  return {mode:'PALLET',ambiguous:false};
}

export async function parseRateWorkbook(buffer:Buffer,options:{modeOverride?:RateMode}={}){
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const rows:ParsedRateRow[]=[]; const issues:ImportIssue[]=[]; let metadata:WorkbookMetadata={};
  for(const ws of wb.worksheets){
    const sheetMeta=scanMetadata(ws);
    metadata={...metadata,...Object.fromEntries(Object.entries(sheetMeta).filter(([,v])=>v!==undefined&&v!==''))};
    const hi=findHeaderRow(ws,['ORIGIN COUNTRY','DEST']);
    if(hi<0) continue;
    const header=ws.getRow(hi);
    const cOrigin=findCol(header,['ORIGIN COUNTRY']);
    const cCountry=findCol(header,['DEST. COUNTRY','DESTINATION COUNTRY']);
    const cRegion=findCol(header,['DEST. REGION','DESTINATION REGION']);
    const cLane=findCol(header,['DC* REG*','LANE IDENTIFIER','LANE ID']);
    const cBase=findCol(header,['BASE RATE PER TRIP']);
    const cTransit=findCol(header,['TRANSIT TIME']);
    const cAsset=findCol(header,['PRIMARY ASSET MODEL','ASSET MODEL']);
    const cCapacity=findCol(header,['CAPACITY']);
    const cCommit=findCol(header,['DAILY COMMIT']);
    const bands=palletBandColumns(header);
    const {mode,ambiguous}=inferRateMode(ws.name,header,{...metadata,...sheetMeta},options.modeOverride);
    if(ambiguous) issues.push({sheet:ws.name,message:'This worksheet can represent PALLET or LTL-PALLET. Select the intended mode during review before committing.',severity:'error'});
    if(cOrigin<0||cCountry<0||cRegion<0){
      issues.push({sheet:ws.name,message:'Required rate-card headers are missing.',severity:'error'});
      continue;
    }
    for(let r=hi+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r);
      const populated=rowValues(row).some(v=>text(v)!=='');
      if(!populated) continue;
      const origin=text(resolved(row.getCell(cOrigin)));
      const dest=text(resolved(row.getCell(cCountry)));
      const reg=region(resolved(row.getCell(cRegion)));
      if(!origin||!dest||!reg){
        issues.push({sheet:ws.name,row:r,message:'Missing origin country, destination country or destination region.',severity:'error'});
        continue;
      }
      const lane=cLane>0&&text(resolved(row.getCell(cLane)))?text(resolved(row.getCell(cLane))):`${dest}-${reg}`;
      const rec:ParsedRateRow={
        sheet:ws.name,row:r,mode,originCountry:origin.toUpperCase(),destinationCountry:dest.toUpperCase(),destinationRegion:reg,
        laneIdentifier:lane,transitDays:cTransit>0?numeric(resolved(row.getCell(cTransit))):undefined,
        assetModel:cAsset>0?text(resolved(row.getCell(cAsset)))||undefined:undefined,
        capacity:cCapacity>0?numeric(resolved(row.getCell(cCapacity))):undefined,
        committedTrucks:cCommit>0?numeric(resolved(row.getCell(cCommit))):undefined,
        sourceMetadata:{}
      };
      if(mode==='FTL'){
        rec.baseRate=cBase>0?numeric(resolved(row.getCell(cBase))):undefined;
        if(rec.baseRate===undefined||rec.baseRate<0) issues.push({sheet:ws.name,row:r,field:'Base Rate',message:'Missing or invalid base rate per trip.',severity:'error'});
      }else{
        const palletBands:Record<number,number>={};
        for(let p=1;p<=36;p++){
          const col=bands.get(p);
          if(!col) continue;
          const rate=numeric(resolved(row.getCell(col)));
          if(rate!==undefined) palletBands[p]=rate;
        }
        rec.palletBands=palletBands;
        if(Object.keys(palletBands).length===0) issues.push({sheet:ws.name,row:r,message:'No 1-36 pallet rates are populated for this lane.',severity:'warning'});
        for(let p=1;p<=36;p++) if(bands.has(p)&&palletBands[p]===undefined) issues.push({sheet:ws.name,row:r,field:`Band ${p}`,message:`Pallet band ${p} is blank and will be reported as unavailable rather than interpolated.`,severity:'warning'});
      }
      rows.push(rec);
    }
  }
  if(metadata.currency && norm(metadata.currency)!=='EUR') issues.push({sheet:'Workbook',field:'Currency',message:'Only EUR commercial data can be committed.',severity:'error'});
  if(rows.length===0) issues.push({sheet:'Workbook',message:'No supported FTL/PALLET/LTL-PALLET rate rows were found.',severity:'error'});
  return {metadata,rows,issues,sheets:wb.worksheets.map(w=>w.name)};
}

const positionNames:[number,string[]][]=[
  [1,['PRIMARY']],[2,['SECONDARY']],[3,['TERTIARY']],[4,['BACKUP 1','BACKUP1']],[5,['BACKUP 2','BACKUP2']]
];

export async function parseAllocationWorkbook(buffer:Buffer){
  const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer as any);
  const rows:ParsedAllocationRow[]=[]; const issues:ImportIssue[]=[];
  for(const ws of wb.worksheets){
    const hi=findHeaderRow(ws,['DC','MODE']);
    if(hi<0) continue;
    const h=ws.getRow(hi);
    const cDC=findCol(h,['DC']);
    const cMode=findCol(h,['MODE']);
    const cOC=findCol(h,['ORIGIN COUNTRY']);
    const cCountry=findCol(h,['DESTINATION COUNTRY','DEST. COUNTRY']);
    const cRegion=findCol(h,['DESTINATION REGION','DEST. REGION']);
    const cZip=findCol(h,['DESTINATION ZIP','POSTCODE','ZIP']);
    const cCust=findCol(h,['CUSTOMER FLAG','CUSTOMER CODE','CUSTOMER ID']);
    const cOrder=findCol(h,['ALLOCATION ORDER','POSITION']);
    const cCarrier=findCol(h,['CARRIER']);
    const cPct=findCol(h,['ALLOCATION %','ALLOCATION PERCENTAGE','PERCENTAGE']);
    const cLane=findCol(h,['DC, MODE, DESTINATION REGION','LANE IDENTIFIER','LANE ID']);
    const cEff=findCol(h,['EFFECTIVE FROM','VALID FROM']);
    const cNotes=findCol(h,['NOTES']);
    const seen=new Set<string>();
    const longFormat=cOrder>0&&cCarrier>0;
    for(let r=hi+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r);
      if(!rowValues(row).some(v=>text(v)!=='')) continue;
      const dc=text(resolved(row.getCell(cDC)));
      const mode=text(resolved(row.getCell(cMode))).toUpperCase();
      const dest=cCountry>0?text(resolved(row.getCell(cCountry))).toUpperCase():'';
      const reg=cRegion>0?region(resolved(row.getCell(cRegion))):'';
      const origin=cOC>0?text(resolved(row.getCell(cOC))).toUpperCase():'';
      const zip=cZip>0?normalizePostcode(text(resolved(row.getCell(cZip)))):'';
      const customer=cCust>0?text(resolved(row.getCell(cCust))):'';
      const laneKey=cLane>0&&text(resolved(row.getCell(cLane)))?text(resolved(row.getCell(cLane))):`${dc}_${mode}_${dest}-${reg}`;
      if(!dc||!mode||!dest||!reg){
        issues.push({sheet:ws.name,row:r,message:'DC, Mode, Destination Country and Destination Region are required.',severity:'error'});
        continue;
      }
      const add=(order:number,carrier:string,pct?:number)=>{
        if(!carrier) return;
        const key=[dc,mode,dest,reg,zip,customer,order].join('|');
        if(seen.has(key)){issues.push({sheet:ws.name,row:r,message:'Duplicate allocation position for the same scope.',severity:'error'});return;}
        seen.add(key);
        rows.push({
          row:r,dc,mode,originCountry:origin,destinationCountry:dest,destinationRegion:reg,destinationZip:zip||undefined,
          customerCode:customer&&norm(customer)!=='DEFAULT001'?customer:undefined,allocationOrder:order,percentage:pct,
          carrier,laneKey,notes:cNotes>0?text(resolved(row.getCell(cNotes)))||undefined:undefined,effectiveFrom:cEff>0?isoDate(resolved(row.getCell(cEff))):undefined
        });
      };
      if(longFormat){
        const order=numeric(resolved(row.getCell(cOrder)));
        const carrier=text(resolved(row.getCell(cCarrier)));
        if(!order||!Number.isInteger(order)||order<1||order>5||!carrier){
          issues.push({sheet:ws.name,row:r,message:'Allocation order must be 1-5 and Carrier must be populated.',severity:'error'});
          continue;
        }
        add(order,carrier,cPct>0?numeric(resolved(row.getCell(cPct))):undefined);
      }else{
        let found=false;
        for(const [order,aliases] of positionNames){
          const col=findCol(h,aliases);
          if(col<1) continue;
          const carrier=text(resolved(row.getCell(col))); if(!carrier) continue;
          found=true;
          const pctCol=findCol(h,aliases.flatMap(a=>[a+' %',a+' PERCENTAGE']));
          add(order,carrier,pctCol>0?numeric(resolved(row.getCell(pctCol))):undefined);
        }
        if(!found) issues.push({sheet:ws.name,row:r,message:'No allocation carrier columns were found on this row.',severity:'warning'});
      }
    }
  }
  const pctGroups=new Map<string,number[]>();
  for(const r of rows){
    if(r.percentage===undefined) continue;
    const key=[r.dc,r.mode,r.destinationCountry,r.destinationRegion,r.destinationZip??'',r.customerCode??''].join('|');
    pctGroups.set(key,[...(pctGroups.get(key)??[]),r.percentage]);
  }
  for(const [key,pcts] of pctGroups){
    const sum=pcts.reduce((a,b)=>a+b,0);
    if(Math.abs(sum-100)>0.01) issues.push({sheet:'Workbook',message:`Allocation percentages for ${key} total ${sum.toFixed(2)}%, not 100%.`,severity:'error'});
  }
  if(rows.length===0) issues.push({sheet:'Workbook',message:'No allocation rows were found.',severity:'error'});
  return {rows,issues,sheets:wb.worksheets.map(w=>w.name)};
}

export async function parseVolumeWorkbook(buffer:Buffer){
  const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer as any);
  const rows:ParsedVolumeRow[]=[]; const issues:ImportIssue[]=[];
  for(const ws of wb.worksheets){
    const hi=findHeaderRow(ws,['DC','MODE','CUSTOMER']);
    if(hi<0) continue;
    const h=ws.getRow(hi);
    const cDC=findCol(h,['DC']);
    const cMode=findCol(h,['MODE']);
    const cCode=findCol(h,['CUSTOMER ID','CUSTOMER CODE','CUSTOMER']);
    const cName=findCol(h,['CUSTOMER NAME']);
    const cCountry=findCol(h,['DESTINATION COUNTRY','DEST. COUNTRY','COUNTRY']);
    const cPost=findCol(h,['DESTINATION ZIP','DESTINATION POSTCODE','POSTCODE','ZIP']);
    const cShip=findCol(h,['SHIPMENT COUNT','SHIPMENTS','NUMBER OF SHIPMENTS']);
    const cPallet=findCol(h,['PALLET COUNT','PALLETS']);
    const cAvg=findCol(h,['AVERAGE PALLETS PER SHIPMENT','AVG PALLETS']);
    const cQty=findCol(h,['SHIPMENT-LEVEL PALLET','SHIPMENT PALLET','PALLET QUANTITIES']);
    const cPeriod=findCol(h,['VOLUME PERIOD','PERIOD','YEAR']);
    const cForecast=findCol(h,['FORECAST VOLUME','FORECAST']);
    const cNotes=findCol(h,['NOTES']);
    for(let r=hi+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r); if(!rowValues(row).some(v=>text(v)!=='')) continue;
      const dc=text(resolved(row.getCell(cDC))); const mode=text(resolved(row.getCell(cMode))).toUpperCase();
      const customerCode=cCode>0?text(resolved(row.getCell(cCode))):''; const customerName=cName>0?text(resolved(row.getCell(cName))):customerCode;
      const country=cCountry>0?text(resolved(row.getCell(cCountry))).toUpperCase():''; const post=cPost>0?text(resolved(row.getCell(cPost))):'';
      const shipments=cShip>0?numeric(resolved(row.getCell(cShip))):undefined; const period=cPeriod>0?text(resolved(row.getCell(cPeriod))):'';
      if(!dc||!mode||!customerCode||!country||!post||shipments===undefined||shipments<0||!period){
        issues.push({sheet:ws.name,row:r,message:'DC, Mode, Customer, Destination Country/Postcode, Shipment Count and Period are required.',severity:'error'}); continue;
      }
      const palletCount=cPallet>0?numeric(resolved(row.getCell(cPallet))):undefined;
      const avg=cAvg>0?numeric(resolved(row.getCell(cAvg))):undefined;
      let quantities:number[]|undefined;
      if(cQty>0){
        const raw=text(resolved(row.getCell(cQty)));
        if(raw){
          quantities=raw.split(/[;,|\s]+/).filter(Boolean).map(Number);
          if(quantities.some(q=>!Number.isFinite(q)||q<=0)){
            issues.push({sheet:ws.name,row:r,field:'Shipment pallet quantities',message:'Zero, blank, negative or non-numeric pallet quantities are excluded from costing.',severity:'warning'});
            quantities=quantities.filter(q=>Number.isFinite(q)&&q>0);
          }
        }
      }
      rows.push({
        row:r,dc,mode,customerCode,customerName,destinationCountry:country,destinationPostcode:post,normalizedPostcode:normalizePostcode(post),
        shipmentCount:shipments,palletCount,averagePallets:avg,shipmentPalletQuantities:quantities,period,
        forecastVolume:cForecast>0?numeric(resolved(row.getCell(cForecast))):undefined,notes:cNotes>0?text(resolved(row.getCell(cNotes)))||undefined:undefined
      });
    }
  }
  if(rows.length===0) issues.push({sheet:'Workbook',message:'No volume rows were found.',severity:'error'});
  return {rows,issues,sheets:wb.worksheets.map(w=>w.name)};
}

export async function parsePostcodeWorkbook(buffer:Buffer){
  const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer as any);
  const rows:ParsedPostcodeRow[]=[]; const issues:ImportIssue[]=[]; const seen=new Map<string,string>();
  for(const ws of wb.worksheets){
    const hi=findHeaderRow(ws,['COUNTRY','REGION']);
    if(hi<0) continue;
    const h=ws.getRow(hi);
    const cCountry=findCol(h,['COUNTRY','COUNTRY CODE']);
    const cPrefix=findCol(h,['POSTCODE PREFIX','ZIP PREFIX','PREFIX','POSTCODE']);
    const cRegion=findCol(h,['DESTINATION REGION','REGION']);
    const cLane=findCol(h,['LANE IDENTIFIER','LANE ID']);
    const cValid=findCol(h,['VALID FROM','EFFECTIVE FROM']);
    const cNotes=findCol(h,['NOTES']);
    for(let r=hi+1;r<=ws.rowCount;r++){
      const row=ws.getRow(r); if(!rowValues(row).some(v=>text(v)!=='')) continue;
      const country=text(resolved(row.getCell(cCountry))).toUpperCase();
      const prefix=cPrefix>0?normalizePostcode(text(resolved(row.getCell(cPrefix)))):'';
      const destRegion=cRegion>0?region(resolved(row.getCell(cRegion))):'';
      if(!country||!prefix||!destRegion){issues.push({sheet:ws.name,row:r,message:'Country, Postcode Prefix and Destination Region are required.',severity:'error'});continue;}
      const key=country+'|'+prefix; const existing=seen.get(key);
      if(existing&&existing!==destRegion){issues.push({sheet:ws.name,row:r,message:`Conflicting mapping for ${country} ${prefix}: ${existing} vs ${destRegion}.`,severity:'error'});continue;}
      seen.set(key,destRegion);
      rows.push({row:r,countryCode:country,prefix,destinationRegion:destRegion,laneIdentifier:cLane>0?text(resolved(row.getCell(cLane)))||undefined:undefined,validFrom:cValid>0?isoDate(resolved(row.getCell(cValid))):undefined,notes:cNotes>0?text(resolved(row.getCell(cNotes)))||undefined:undefined});
    }
  }
  if(rows.length===0) issues.push({sheet:'Workbook',message:'No postcode mapping rows were found.',severity:'error'});
  return {rows,issues,sheets:wb.worksheets.map(w=>w.name)};
}

export function findRegionByLongestPrefix(country:string,postcode:string,mappings:{countryCode:string;prefix:string;destinationRegion:string}[]){
  const p=normalizePostcode(postcode);
  return mappings.filter(m=>m.countryCode.toUpperCase()===country.toUpperCase()&&p.startsWith(normalizePostcode(m.prefix))).sort((a,b)=>normalizePostcode(b.prefix).length-normalizePostcode(a.prefix).length)[0]?.destinationRegion;
}
