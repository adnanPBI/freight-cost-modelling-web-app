import * as XLSX from 'xlsx';
export function makeExport(sheetName:string,rows:Record<string,unknown>[],meta:{user?:string;reference?:string;filters?:string}={}){
  const ws=XLSX.utils.json_to_sheet(rows); const info=[['Export date',new Date().toISOString()],['User',meta.user??''],['Reference',meta.reference??''],['Filters',meta.filters??'']];
  XLSX.utils.sheet_add_aoa(ws,info,{origin:'A1'}); XLSX.utils.sheet_add_json(ws,rows,{origin:'A6',skipHeader:false}); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheetName.slice(0,31)); return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
