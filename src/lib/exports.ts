import ExcelJS from '@ayocore/exceljs';

export type ExportMeta={user:string;reference?:string;filters?:string;tenant?:string};

function safeSheetName(name:string){return name.replace(/[\\/*?:[\]]/g,' ').slice(0,31)||'Export';}

export async function makeExport(sheets:{name:string;rows:Record<string,unknown>[]}[],meta:ExportMeta){
  const wb=new ExcelJS.Workbook();
  wb.creator='Carrier Rate & Allocation Platform';
  wb.created=new Date();
  for(const sheet of sheets){
    const ws=wb.addWorksheet(safeSheetName(sheet.name),{views:[{state:'frozen',ySplit:6}]});
    const keys=[...new Set(sheet.rows.flatMap(r=>Object.keys(r)))];
    ws.getCell('A1').value=sheet.name; ws.getCell('A1').font={bold:true,size:14};
    ws.getCell('A2').value='Export Date'; ws.getCell('B2').value=new Date().toISOString();
    ws.getCell('A3').value='User'; ws.getCell('B3').value=meta.user;
    ws.getCell('A4').value='Reference'; ws.getCell('B4').value=meta.reference??'';
    ws.getCell('A5').value='Filters'; ws.getCell('B5').value=meta.filters??'';
    if(keys.length){
      keys.forEach((k,i)=>{const cell=ws.getRow(6).getCell(i+1);cell.value=k;cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9EEF5'}};});
      for(const row of sheet.rows) ws.addRow(keys.map(k=>{const v=row[k];if(v==null)return '';if(Array.isArray(v)||typeof v==='object')return JSON.stringify(v);return v as any;}));
      keys.forEach((k,i)=>{const max=Math.min(50,Math.max(k.length,...sheet.rows.map(r=>String(r[k]??'').length))+2);ws.getColumn(i+1).width=Math.max(10,max);});
      ws.autoFilter={from:{row:6,column:1},to:{row:6,column:keys.length}};
    }
  }
  const out=await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export function allocationExportRows(key:any){
  return key.rules.map((r:any)=>({
    'ALLOCATION KEYS':key.displayKey,'DC':key.dc?.code??'','MODE':key.mode?.code??'',
    'ORIGIN COUNTRY':r.lane.originCountry,'DESTINATION COUNTRY':r.lane.destinationCountry,
    'DESTINATION REGION':r.lane.destinationRegion,'DESTINATION ZIP':r.destinationZip??'00000000',
    'CUSTOMER FLAG':r.customerCode??'DEFAULT001',
    'ALLOCATION ORDER':({PRIMARY:1,SECONDARY:2,TERTIARY:3,BACKUP_1:4,BACKUP_2:5} as any)[r.position],
    'ALLOCATION %':r.percentage==null?'':Number(r.percentage),'CARRIER':r.carrier.code,
    'DC, MODE, DESTINATION REGION':r.lane.laneIdentifier??`${key.dc?.code}_${key.mode?.code}_${r.lane.destinationCountry}-${r.lane.destinationRegion}`,
    'EFFECTIVE FROM':key.effectiveFrom?.toISOString().slice(0,10)??'','NOTES':r.notes??''
  }));
}

export function mappingExportRows(rows:any[]){
  return rows.map(r=>({'Country':r.countryCode,'Postcode Prefix':r.prefix,'Destination Region':r.destinationRegion,'Lane Identifier':r.lane?.laneIdentifier??'','Valid From':r.validFrom?.toISOString().slice(0,10)??'','Valid To':r.validTo?.toISOString().slice(0,10)??'','Version':r.version,'Notes':r.notes??''}));
}
