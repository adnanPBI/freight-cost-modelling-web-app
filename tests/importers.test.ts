import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { findRegionByLongestPrefix, normalizePostcode, parseAllocationWorkbook, parsePostcodeWorkbook, parseRateWorkbook, parseVolumeWorkbook } from '../src/lib/importers';

async function bytes(wb:ExcelJS.Workbook){return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);}

describe('rate-card imports',()=>{
  it('detects an FTL header away from a fixed row and preserves region 06',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('FTL');
    ws.addRow(['RATES VALID FROM:',new Date('2026-08-01')]); ws.addRow(['ORIGIN DC:','CZ']);
    ws.addRow(['ORIGIN COUNTRY','DEST. COUNTRY','DEST. REGION','DC* REG*','BASE RATE PER TRIP','TRANSIT TIME']);
    ws.addRow(['CZ','DE','06','CZ_DE-06',1234.5,2]);
    const parsed=await parseRateWorkbook(await bytes(wb));
    expect(parsed.rows).toHaveLength(1); expect(parsed.rows[0].mode).toBe('FTL'); expect(parsed.rows[0].destinationRegion).toBe('06'); expect(parsed.rows[0].baseRate).toBe(1234.5);
  });

  it('parses 1-36 pallet bands from the actual two-level header shape',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('LTL-PALLET and PALLET');
    const top=['','','','','','','','','RATE FOR TOTAL PALLETS']; ws.addRow(top);
    const headers=['ORIGIN COUNTRY','DEST. COUNTRY','DEST. REGION','DC* REG*','PRIOR 12 MONTH TRIPS','PRIMARY ASSET MODEL','TRANSIT TIME','CAPACITY',...Array.from({length:36},(_,i)=>i+1)];
    ws.addRow(headers);
    ws.addRow(['CZ','DE','01','CZ_DE-01',10,'EU PALLET',2,33,...Array.from({length:36},(_,i)=>(i+1)*10)]);
    const parsed=await parseRateWorkbook(await bytes(wb),{modeOverride:'PALLET'});
    expect(parsed.rows).toHaveLength(1); expect(parsed.rows[0].mode).toBe('PALLET'); expect(parsed.rows[0].palletBands?.[1]).toBe(10); expect(parsed.rows[0].palletBands?.[36]).toBe(360);
  });

  it('requires an explicit review override when a combined PALLET/LTL sheet is ambiguous',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('LTL-PALLET and PALLET');
    ws.addRow(['ORIGIN COUNTRY','DEST. COUNTRY','DEST. REGION','DC* REG*',...Array.from({length:36},(_,i)=>i+1)]);
    ws.addRow(['CZ','DE','01','CZ_DE-01',...Array.from({length:36},()=>10)]);
    const parsed=await parseRateWorkbook(await bytes(wb));
    expect(parsed.issues.some(i=>i.severity==='error'&&i.message.includes('Select the intended mode'))).toBe(true);
  });
});

describe('allocation imports',()=>{
  it('loads positions 1-5 and customer/ZIP exceptions without inventing carriers',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Allocation');
    ws.addRow(['ALLOCATION KEYS','DC','MODE','ORIGIN COUNTRY','DESTINATION COUNTRY','DESTINATION REGION','DESTINATION ZIP','CUSTOMER FLAG','ALLOCATION ORDER','CARRIER','DC, MODE, DESTINATION REGION','NOTES']);
    for(let i=1;i<=5;i++)ws.addRow(['AK','CZDC','FTL','CZ','DE','01','00000000','DEFAULT001',i,'CARRIER'+i,'CZ_FTL_DE-01','']);
    ws.addRow(['AK','CZDC','FTL','CZ','DE','01','00000000','CUSTOMER123',1,'CARRIER6','CZ_FTL_DE-01','']);
    ws.addRow(['AK','CZDC','FTL','CZ','DE','01','01093000','DEFAULT001',1,'CARRIER7','CZ_FTL_DE-01','']);
    const parsed=await parseAllocationWorkbook(await bytes(wb));
    expect(parsed.rows).toHaveLength(7); expect(parsed.rows.find(r=>r.customerCode==='CUSTOMER123')?.carrier).toBe('CARRIER6'); expect(parsed.rows.find(r=>r.destinationZip==='01093000')?.carrier).toBe('CARRIER7');
  });
});

describe('volume and postcode imports',()=>{
  it('normalizes volume postcodes and retains shipment-level pallet quantities',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Volumes');
    ws.addRow(['DC','MODE','CUSTOMER CODE','CUSTOMER NAME','DESTINATION COUNTRY','DESTINATION POSTCODE','SHIPMENTS','PALLETS','AVERAGE PALLETS PER SHIPMENT','SHIPMENT PALLET QUANTITIES','PERIOD']);
    ws.addRow(['CZ','PALLET','C1','Customer 1','DE','01 093',2,5,2.5,'2;3','2026']);
    const parsed=await parseVolumeWorkbook(await bytes(wb));
    expect(parsed.rows[0].normalizedPostcode).toBe('01093'); expect(parsed.rows[0].shipmentPalletQuantities).toEqual([2,3]);
  });

  it('flags postcode conflicts and applies longest-prefix matching',async()=>{
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Map');
    ws.addRow(['COUNTRY CODE','POSTCODE PREFIX','DESTINATION REGION','VALID FROM']);
    ws.addRow(['DE','01','01','2026-01-01']); ws.addRow(['DE','01093','01','2026-01-01']); ws.addRow(['DE','01093','02','2026-02-01']);
    const parsed=await parsePostcodeWorkbook(await bytes(wb));
    expect(parsed.issues.some(i=>i.severity==='error'&&i.message.includes('Conflicting'))).toBe(true);
    expect(findRegionByLongestPrefix('DE','01 093 000',[{countryCode:'DE',prefix:'01',destinationRegion:'A'},{countryCode:'DE',prefix:'01093',destinationRegion:'B'}])).toBe('B');
    expect(normalizePostcode(' sl4 1aa ')).toBe('SL41AA');
  });
});
