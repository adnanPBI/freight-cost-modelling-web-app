export function roundPalletQty(q:number,mode:'UP'|'NEAREST'='UP'){
  if(!Number.isFinite(q)||q<=0) throw new Error('Invalid pallet quantity');
  return mode==='UP'?Math.ceil(q):Math.round(q);
}
export function ftlBaseCost(shipments:number,rate:number){return shipments*rate;}
export function bandCost(q:number,bands:Record<number,number>,policy:'ERROR'|'NEXT_HIGHER'='ERROR'){
  if(bands[q]!=null) return bands[q];
  if(policy==='NEXT_HIGHER') for(let i=q+1;i<=36;i++) if(bands[i]!=null) return bands[i];
  throw new Error(`Missing pallet band ${q}`);
}
export function palletShipmentCost(qty:number,bands:Record<number,number>,opts:{rounding?:'UP'|'NEAREST';missingBand?:'ERROR'|'NEXT_HIGHER';above36?:'FTL'|'SPLIT'|'ERROR';ftlRate?:number;maxPalletsPerFtl?:number}={}){
  const q=roundPalletQty(qty,opts.rounding??'UP');
  if(q>36){
    if((opts.above36??'FTL')==='FTL'){
      if(opts.ftlRate===undefined) throw new Error('No valid FTL rate');
      return Math.ceil(q/(opts.maxPalletsPerFtl??33))*opts.ftlRate;
    }
    if(opts.above36==='SPLIT'){
      let rem=q,total=0;
      while(rem>0){const part=Math.min(rem,36);total+=bandCost(part,bands,opts.missingBand??'ERROR');rem-=part;}
      return total;
    }
    throw new Error('Shipment above 36 pallets');
  }
  return bandCost(q,bands,opts.missingBand??'ERROR');
}
export function breakEvenPalletQty(bands:Record<number,number>,ftlRate:number,fuelPalletPct=0,fuelFtlPct=0){
  const ftl=ftlRate*(1+fuelFtlPct/100);
  for(let q=1;q<=36;q++){
    const p=bands[q];
    if(p!=null&&p*(1+fuelPalletPct/100)>=ftl) return q;
  }
  return null;
}
export function totalCost(base:number,fuelPct:number,accessorials:number){return base+(base*fuelPct/100)+accessorials;}
export function timeWeightedFuel(ranges:{from:Date;to:Date;pct:number}[],periodFrom:Date,periodTo:Date){
  let days=0,weighted=0;
  for(const r of ranges){
    const from=new Date(Math.max(+r.from,+periodFrom));
    const to=new Date(Math.min(+r.to,+periodTo));
    const d=Math.max(0,(+to-+from)/86400000+1);
    days+=d;weighted+=d*r.pct;
  }
  return days?weighted/days:0;
}
