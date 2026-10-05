import { Prisma, PrismaClient } from '@prisma/client';

const DEMO_SEED_VERSION='demo-2026-10-05-v1';

const carrierDefs=[
  ['ATL','Atlas Freight Europe',['Atlas Freight','Atlas EU']],
  ['BLR','BlueRoute Logistics',['BlueRoute','BR Logistics']],
  ['CTH','Continental Haulage',['Continental','CTH Freight']],
  ['DNF','Danube Freight Network',['Danube Freight','DNF']],
  ['EHL','EuroHaul Transport',['EuroHaul','EHL']],
  ['IBR','Iberia Cargo Link',['Iberia Cargo','IBR Logistics']],
  ['MFD','Meridian Freight Direct',['Meridian Freight','MFD']],
  ['NCS','NorthStar Cargo Solutions',['NorthStar Cargo','NCS']],
  ['RRL','RhineRoad Logistics',['RhineRoad','RRL']],
  ['TNV','TransNova Europe',['TransNova','TNV']],
  ['ACN','Alpine Carrier Network',['Alpine Carrier','ACN']],
  ['BBL','BalticBridge Logistics',['BalticBridge','BBL']]
] as const;

const destinations=[
  {country:'DE',region:'01',prefix:'01093',label:'Dresden / Saxony'},
  {country:'DE',region:'06',prefix:'60311',label:'Frankfurt / Hesse'},
  {country:'AT',region:'10',prefix:'1010',label:'Vienna'},
  {country:'BE',region:'14',prefix:'1400',label:'Walloon Brabant'},
  {country:'FR',region:'80',prefix:'80000',label:'Amiens / Somme'},
  {country:'NL',region:'13',prefix:'1300',label:'Flevoland'},
  {country:'SE',region:'70',prefix:'70100',label:'Örebro'},
  {country:'IT',region:'20',prefix:'20100',label:'Milan / Lombardy'}
] as const;

const dcCodes=['CZ','FR','PL'] as const;
const modeCodes=['FTL','PALLET','LTL-PALLET'] as const;

const customers=[
  ['CUST-001','Aster Retail Group'],['CUST-002','Boreal Home Products'],['CUST-003','Cobalt Industrial Supply'],
  ['CUST-004','Delta Consumer Goods'],['CUST-005','Evergreen Components'],['CUST-006','Futura Store Network'],
  ['CUST-007','Granite Tools Europe'],['CUST-008','Helios Lighting'],['CUST-009','Innova Office Systems'],
  ['CUST-010','Juniper Marketplaces'],['CUST-011','Kestrel Manufacturing'],['CUST-012','Lumina Appliances'],
  ['CUST-013','MetroPack Distribution'],['CUST-014','Nexa Automotive Parts'],['CUST-015','Orion Building Products'],
  ['CUST-016','Pioneer Kitchenware'],['CUST-017','Quartz Medical Supply'],['CUST-018','Riviera Furnishings'],
  ['CUST-019','Summit Outdoor Europe'],['CUST-020','TerraGarden Products'],['CUST-021','UrbanNest Interiors'],
  ['CUST-022','Vertex Electronics'],['CUST-023','Westbridge Wholesale'],['CUST-024','Zenith Packaging']
] as const;

const iso=(s:string)=>new Date(s+'T00:00:00.000Z');
const scope=(dc:string,mode:string)=>dc+'|'+mode;
const laneKey=(dc:string,mode:string,country:string,region:string)=>[dc,mode,country,region].join('|');

function contractedCodes(dcIndex:number,modeIndex:number){
  const start=(dcIndex*4+modeIndex*2)%carrierDefs.length;
  return Array.from({length:5},(_,i)=>carrierDefs[(start+i)%carrierDefs.length][0]);
}

function ftlRate(destIndex:number,carrierRank:number,dcIndex:number,multiplier=1){
  return Math.round((760+destIndex*78+carrierRank*24+dcIndex*37)*multiplier*100)/100;
}

function palletRate(mode:string,destIndex:number,carrierRank:number,dcIndex:number,qty:number,multiplier=1){
  const modeFactor=mode==='LTL-PALLET'?1.1:1;
  const congestion=destIndex*4.8+carrierRank*2.6+dcIndex*3.2;
  const amount=(58+congestion+qty*(24.5-Math.min(qty,30)*0.22))*modeFactor*multiplier;
  return Math.round(amount*100)/100;
}

function postcodeFor(prefix:string,salt:number){
  const suffix=String((salt*37)%997).padStart(3,'0');
  return (prefix+suffix).slice(0,8);
}

export async function seedDemoData(prisma:PrismaClient,tenantId:string,userId?:string){
  const done=await prisma.auditEvent.findFirst({where:{tenantId,entityType:'DemoSeed',entityId:DEMO_SEED_VERSION,action:'SEED'}});
  if(done){
    console.log('Demo dataset already present:',DEMO_SEED_VERSION);
    return;
  }

  await prisma.$transaction(async tx=>{
    await tx.tenantConfig.update({
      where:{tenantId},
      data:{palletRounding:'UP',above36Policy:'FTL',maxPalletsPerFtl:33,minContractedCarriers:2,defaultExpiryHorizonDays:90,requireFuelForCosting:false}
    });

    const carrierByCode=new Map<string,{id:string;code:string;name:string}>();
    for(const [code,name,aliases] of carrierDefs){
      const carrier=await tx.carrier.upsert({
        where:{tenantId_code:{tenantId,code}},
        update:{name,active:true,notes:'Synthetic demonstration carrier'},
        create:{tenantId,code,name,active:true,notes:'Synthetic demonstration carrier'}
      });
      carrierByCode.set(code,{id:carrier.id,code,name});
      for(const alias of aliases){
        await tx.carrierAlias.upsert({
          where:{tenantId_alias:{tenantId,alias}},
          update:{carrierId:carrier.id},
          create:{tenantId,carrierId:carrier.id,alias}
        });
      }
    }

    const dcs=await tx.distributionCentre.findMany({where:{tenantId,code:{in:[...dcCodes]}}});
    const modes=await tx.transportMode.findMany({where:{tenantId,code:{in:[...modeCodes]}}});
    const dcByCode=new Map(dcs.map(x=>[x.code,x]));
    const modeByCode=new Map(modes.map(x=>[x.code,x]));

    const laneByKey=new Map<string,any>();
    for(let di=0;di<dcCodes.length;di++){
      const dcCode=dcCodes[di]; const dc=dcByCode.get(dcCode);
      if(!dc) throw new Error('Demo seed missing DC '+dcCode);
      for(const modeCode of modeCodes){
        const mode=modeByCode.get(modeCode);
        if(!mode) throw new Error('Demo seed missing mode '+modeCode);
        for(const dest of destinations){
          const key=laneKey(dcCode,modeCode,dest.country,dest.region);
          const lane=await tx.lane.upsert({
            where:{tenantId_dcId_modeId_destinationCountry_destinationRegion:{
              tenantId,dcId:dc.id,modeId:mode.id,destinationCountry:dest.country,destinationRegion:dest.region
            }},
            update:{active:true,laneIdentifier:`${dcCode}_${modeCode}_${dest.country}-${dest.region}`},
            create:{
              tenantId,dcId:dc.id,modeId:mode.id,originCountry:dc.countryCode,
              destinationCountry:dest.country,destinationRegion:dest.region,
              laneIdentifier:`${dcCode}_${modeCode}_${dest.country}-${dest.region}`,active:true
            }
          });
          laneByKey.set(key,lane);
        }
      }
    }

    // Effective-dated postcode history plus more-specific prefixes for longest-prefix demos.
    for(let i=0;i<destinations.length;i++){
      const dest=destinations[i];
      const representative=laneByKey.get(laneKey('CZ','FTL',dest.country,dest.region));
      let priorId:string|undefined;
      if(i<4){
        const prior=await tx.postcodeMapping.create({data:{
          tenantId,countryCode:dest.country,prefix:dest.prefix,destinationRegion:dest.region,laneId:representative?.id,
          validFrom:iso('2025-01-01'),validTo:iso('2026-07-31'),version:1,notes:'Synthetic prior mapping version',createdById:userId
        }});
        priorId=prior.id;
      }
      await tx.postcodeMapping.create({data:{
        tenantId,countryCode:dest.country,prefix:dest.prefix,destinationRegion:dest.region,laneId:representative?.id,
        validFrom:iso('2026-08-01'),version:priorId?2:1,supersedesId:priorId,notes:'Synthetic current postcode mapping',createdById:userId
      }});
      if(i<3){
        const specific=(dest.prefix+String(10+i)).slice(0,Math.min(dest.prefix.length+2,8));
        await tx.postcodeMapping.create({data:{
          tenantId,countryCode:dest.country,prefix:specific,destinationRegion:dest.region,laneId:representative?.id,
          validFrom:iso('2026-08-01'),version:1,notes:'More-specific synthetic prefix for longest-prefix demonstration',createdById:userId
        }});
      }
    }

    const scopeCarriers=new Map<string,string[]>();
    let rateCardCount=0,laneRateCount=0,bandCount=0;
    const activeCards:any[]=[];

    for(let di=0;di<dcCodes.length;di++){
      const dcCode=dcCodes[di]; const dc=dcByCode.get(dcCode)!;
      for(let mi=0;mi<modeCodes.length;mi++){
        const modeCode=modeCodes[mi]; const mode=modeByCode.get(modeCode)!;
        const codes=contractedCodes(di,mi); scopeCarriers.set(scope(dcCode,modeCode),codes);
        const scopeIndex=di*modeCodes.length+mi;

        for(let rank=0;rank<codes.length;rank++){
          const code=codes[rank]; const carrier=carrierByCode.get(code)!;
          let supersedesId:string|undefined; let version=1;
          if(rank===0){
            const oldCard=await tx.rateCard.create({data:{
              tenantId,carrierId:carrier.id,dcId:dc.id,modeId:mode.id,currency:'EUR',
              validFrom:iso('2025-07-01'),validTo:iso('2026-07-31'),commercialStatus:'SUPERSEDED',status:'SUPERSEDED',
              originalFilename:`DEMO_${dcCode}_${modeCode}_${code}_2025.xlsx`,uploadChecksum:`demo-${dcCode}-${modeCode}-${code}-v1`,
              version:1,notes:'Synthetic historical rate card for comparison',createdById:userId,
              metadata:{demo:true,tender:'FY2025',source:'Synthetic demonstration dataset'}
            }});
            rateCardCount++;
            supersedesId=oldCard.id; version=2;
            for(let destIndex=0;destIndex<destinations.length;destIndex++){
              const dest=destinations[destIndex]; const lane=laneByKey.get(laneKey(dcCode,modeCode,dest.country,dest.region));
              const lr=await tx.laneRate.create({data:{
                tenantId,rateCardId:oldCard.id,laneId:lane.id,
                baseRate:modeCode==='FTL'?ftlRate(destIndex,rank,di,0.955):null,
                transitDays:1+(destIndex%4),assetModel:modeCode==='FTL'?'13.6m curtainsider':'Euro-pallet groupage',
                capacity:modeCode==='FTL'?33:36,committedTrucks:modeCode==='FTL'?2+(destIndex%3):null,sourceRow:destIndex+2,
                sourceMetadata:{demo:true,revision:'historical'}
              }});
              laneRateCount++;
              if(modeCode!=='FTL'){
                const data=Array.from({length:36},(_,q)=>({tenantId,laneRateId:lr.id,palletQty:q+1,rate:palletRate(modeCode,destIndex,rank,di,q+1,0.955)}));
                await tx.palletBand.createMany({data}); bandCount+=data.length;
              }
            }
          }

          const expiring=(scopeIndex%3===0&&rank===0);
          const card=await tx.rateCard.create({data:{
            tenantId,carrierId:carrier.id,dcId:dc.id,modeId:mode.id,currency:'EUR',
            validFrom:iso('2026-08-01'),validTo:expiring?iso('2026-11-25'):iso('2027-06-30'),
            commercialStatus:'CONTRACTED_ACTIVE',status:'ACTIVE',
            originalFilename:`DEMO_${dcCode}_${modeCode}_${code}_2026.xlsx`,uploadChecksum:`demo-${dcCode}-${modeCode}-${code}-v${version}`,
            version,supersedesId,notes:expiring?'Synthetic active contract intentionally expiring soon':'Synthetic active contracted rate card',
            createdById:userId,metadata:{demo:true,tender:'FY2026',currency:'EUR',source:'Synthetic demonstration dataset'}
          }});
          activeCards.push(card); rateCardCount++;

          for(let destIndex=0;destIndex<destinations.length;destIndex++){
            const dest=destinations[destIndex]; const lane=laneByKey.get(laneKey(dcCode,modeCode,dest.country,dest.region));
            const lr=await tx.laneRate.create({data:{
              tenantId,rateCardId:card.id,laneId:lane.id,
              baseRate:modeCode==='FTL'?ftlRate(destIndex,rank,di,1):null,
              transitDays:1+(destIndex%4),assetModel:modeCode==='FTL'?'13.6m curtainsider':modeCode==='PALLET'?'Pallet network':'Direct LTL groupage',
              capacity:modeCode==='FTL'?33:36,committedTrucks:modeCode==='FTL'?2+((rank+destIndex)%4):null,sourceRow:destIndex+2,
              sourceMetadata:{demo:true,contractRank:rank+1}
            }});
            laneRateCount++;
            if(modeCode!=='FTL'){
              const data=Array.from({length:36},(_,q)=>({tenantId,laneRateId:lr.id,palletQty:q+1,rate:palletRate(modeCode,destIndex,rank,di,q+1,1)}));
              await tx.palletBand.createMany({data}); bandCount+=data.length;
            }
          }
        }

        if(scopeIndex%2===0){
          const code=carrierDefs[(di*5+mi*3+7)%carrierDefs.length][0]; const carrier=carrierByCode.get(code)!;
          const research=await tx.rateCard.create({data:{
            tenantId,carrierId:carrier.id,dcId:dc.id,modeId:mode.id,currency:'EUR',
            validFrom:iso('2026-09-01'),validTo:iso('2027-03-31'),commercialStatus:'SUBMISSION_RESEARCH',status:'ACTIVE',
            originalFilename:`DEMO_RESEARCH_${dcCode}_${modeCode}_${code}.xlsx`,uploadChecksum:`demo-research-${dcCode}-${modeCode}-${code}`,
            version:1,notes:'Synthetic tender/research submission – excluded from operational default',createdById:userId,
            metadata:{demo:true,tender:'RFP-2027',research:true}
          }});
          rateCardCount++;
          for(let destIndex=0;destIndex<destinations.length;destIndex++){
            const dest=destinations[destIndex]; const lane=laneByKey.get(laneKey(dcCode,modeCode,dest.country,dest.region));
            const lr=await tx.laneRate.create({data:{
              tenantId,rateCardId:research.id,laneId:lane.id,baseRate:modeCode==='FTL'?ftlRate(destIndex,5,di,0.93):null,
              transitDays:2+(destIndex%3),assetModel:modeCode==='FTL'?'13.6m curtainsider':'Tender groupage',capacity:modeCode==='FTL'?33:36,
              sourceRow:destIndex+2,sourceMetadata:{demo:true,research:true}
            }});
            laneRateCount++;
            if(modeCode!=='FTL'){
              const data=Array.from({length:36},(_,q)=>({tenantId,laneRateId:lr.id,palletQty:q+1,rate:palletRate(modeCode,destIndex,5,di,q+1,0.93)}));
              await tx.palletBand.createMany({data}); bandCount+=data.length;
            }
          }
        }
      }
    }

    // Global fuel tables with historical versions on half the carrier set.
    for(let i=0;i<carrierDefs.length;i++){
      const carrier=carrierByCode.get(carrierDefs[i][0])!;
      let priorId:string|undefined;
      if(i<6){
        const prior=await tx.fuelSurcharge.create({data:{
          tenantId,carrierId:carrier.id,percentage:4.4+i*0.28,validFrom:iso('2026-01-01'),validTo:iso('2026-06-30'),
          version:1,notes:'Synthetic H1 fuel table',createdById:userId
        }}); priorId=prior.id;
      }
      await tx.fuelSurcharge.create({data:{
        tenantId,carrierId:carrier.id,percentage:5.1+i*0.31,validFrom:iso('2026-07-01'),validTo:iso('2027-06-30'),
        version:priorId?2:1,supersedesId:priorId,notes:'Synthetic current fuel surcharge',createdById:userId
      }});
    }

    const typeRows=await tx.accessorialType.findMany({where:{tenantId,code:{in:['WAITING_TIME','PALLET_RETURN','SPECIAL_HANDLING']}}});
    const typeByCode=new Map(typeRows.map(x=>[x.code,x]));
    for(let i=0;i<carrierDefs.length;i++){
      const carrier=carrierByCode.get(carrierDefs[i][0])!;
      const waiting=typeByCode.get('WAITING_TIME')!,palletReturn=typeByCode.get('PALLET_RETURN')!,special=typeByCode.get('SPECIAL_HANDLING')!;
      let priorId:string|undefined;
      if(i<4){
        const prior=await tx.carrierAccessorial.create({data:{
          tenantId,carrierId:carrier.id,typeId:waiting.id,amount:34+i,chargingBasis:'PER_HOUR',validFrom:iso('2026-01-01'),validTo:iso('2026-06-30'),
          commercialStatus:'SUPERSEDED',version:1,notes:'Synthetic prior waiting-time agreement',createdById:userId
        }}); priorId=prior.id;
      }
      await tx.carrierAccessorial.create({data:{
        tenantId,carrierId:carrier.id,typeId:waiting.id,amount:39+i*1.25,currency:'EUR',chargingBasis:'PER_HOUR',
        validFrom:iso('2026-07-01'),validTo:iso('2027-06-30'),commercialStatus:'CONTRACTED_ACTIVE',
        version:priorId?2:1,supersedesId:priorId,notes:'Synthetic current waiting-time agreement',createdById:userId
      }});
      await tx.carrierAccessorial.create({data:{
        tenantId,carrierId:carrier.id,typeId:palletReturn.id,amount:2.1+i*0.09,currency:'EUR',chargingBasis:'PER_PALLET',
        validFrom:iso('2026-07-01'),validTo:iso('2027-06-30'),commercialStatus:'CONTRACTED_ACTIVE',
        version:1,notes:'Synthetic pallet-return charge',createdById:userId
      }});
      await tx.carrierAccessorial.create({data:{
        tenantId,carrierId:carrier.id,typeId:special.id,amount:16+i*0.8,currency:'EUR',chargingBasis:'PER_SHIPMENT',
        validFrom:iso('2026-07-01'),validTo:iso('2027-06-30'),commercialStatus:'CONTRACTED_ACTIVE',
        version:1,notes:'Synthetic special-handling charge',createdById:userId
      }});
    }

    let allocationKeyCount=0,allocationRuleCount=0;
    for(let di=0;di<dcCodes.length;di++){
      const dcCode=dcCodes[di],dc=dcByCode.get(dcCode)!;
      for(let mi=0;mi<modeCodes.length;mi++){
        const modeCode=modeCodes[mi],mode=modeByCode.get(modeCode)!;
        const codes=scopeCarriers.get(scope(dcCode,modeCode))!;
        const idx=di*modeCodes.length+mi;
        let prior:any=null;
        if(idx<3){
          prior=await tx.allocationKey.create({data:{
            tenantId,displayKey:`AK-${dcCode}-${modeCode}-2026-01`,version:1,dcId:dc.id,modeId:mode.id,status:'EXPIRED',
            effectiveFrom:iso('2026-01-01'),effectiveTo:iso('2026-07-31'),changeNote:'Synthetic prior allocation version',source:'demo-seed',createdById:userId
          }}); allocationKeyCount++;
          const priorRules:any[]=[];
          for(let destIndex=0;destIndex<destinations.length;destIndex++){
            const dest=destinations[destIndex],lane=laneByKey.get(laneKey(dcCode,modeCode,dest.country,dest.region));
            for(let p=0;p<5;p++) priorRules.push({tenantId,allocationKeyId:prior.id,laneId:lane.id,carrierId:carrierByCode.get(codes[(p+1)%5])!.id,position:['PRIMARY','SECONDARY','TERTIARY','BACKUP_1','BACKUP_2'][p] as any,notes:'Synthetic previous ladder'});
          }
          await tx.allocationRule.createMany({data:priorRules}); allocationRuleCount+=priorRules.length;
        }

        const active=await tx.allocationKey.create({data:{
          tenantId,displayKey:`AK-${dcCode}-${modeCode}-2026-02`,version:prior?2:1,dcId:dc.id,modeId:mode.id,status:'ACTIVE',
          effectiveFrom:iso('2026-08-01'),changeNote:'Synthetic published network allocation',source:'demo-seed',supersedesId:prior?.id,createdById:userId
        }}); allocationKeyCount++;
        const activeRules:any[]=[];
        for(let destIndex=0;destIndex<destinations.length;destIndex++){
          const dest=destinations[destIndex],lane=laneByKey.get(laneKey(dcCode,modeCode,dest.country,dest.region));
          const positions=['PRIMARY','SECONDARY','TERTIARY','BACKUP_1','BACKUP_2'] as const;
          for(let p=0;p<5;p++){
            if(destIndex===0&&p===3) continue; // intentional Backup 1 exception for Coverage Gaps demo
            activeRules.push({tenantId,allocationKeyId:active.id,laneId:lane.id,carrierId:carrierByCode.get(codes[p])!.id,position:positions[p],notes:p<3?'Synthetic operating ladder':'Synthetic resilience backup'});
          }
          if(destIndex===0) activeRules.push({tenantId,allocationKeyId:active.id,laneId:lane.id,carrierId:carrierByCode.get(codes[1])!.id,position:'PRIMARY',customerCode:'CUST-005',notes:'Synthetic customer-specific override'});
          if(destIndex===1) activeRules.push({tenantId,allocationKeyId:active.id,laneId:lane.id,carrierId:carrierByCode.get(codes[2])!.id,position:'PRIMARY',destinationZip:dest.prefix.slice(0,3),notes:'Synthetic postcode-specific override'});
        }
        await tx.allocationRule.createMany({data:activeRules}); allocationRuleCount+=activeRules.length;

        if(idx<3){
          const draft=await tx.allocationKey.create({data:{
            tenantId,displayKey:`AK-${dcCode}-${modeCode}-2026-03-DRAFT`,version:(prior?3:2),dcId:dc.id,modeId:mode.id,status:'DRAFT',
            changeNote:'Synthetic tender optimisation draft',source:'demo-seed',supersedesId:active.id,createdById:userId
          }}); allocationKeyCount++;
          const draftRules=activeRules.map((r:any)=>({...r,allocationKeyId:draft.id}));
          const targetLane=laneByKey.get(laneKey(dcCode,modeCode,destinations[2].country,destinations[2].region));
          const primary=draftRules.find((r:any)=>r.laneId===targetLane.id&&r.position==='PRIMARY'&&!r.customerCode&&!r.destinationZip);
          if(primary) primary.carrierId=carrierByCode.get(codes[1])!.id;
          await tx.allocationRule.createMany({data:draftRules}); allocationRuleCount+=draftRules.length;
        }
      }
    }

    const laneList=[...laneByKey.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const volumeData:any[]=[];
    for(let i=0;i<laneList.length;i++){
      const [key,lane]=laneList[i]; const [dcCode,modeCode,country,region]=key.split('|');
      const dest=destinations.find(d=>d.country===country&&d.region===region)!;
      const [customerCode,customerName]=customers[i%customers.length];
      const shipmentCount=65+((i*17)%96); const avg=modeCode==='FTL'?null:4+((i*5)%27);
      const assumptions:Record<string,number>={};
      if(i%4===0) assumptions.WAITING_TIME=1+(i%3)*0.5;
      if(i%7===0) assumptions.SPECIAL_HANDLING=2+(i%4);
      if(i%9===0&&modeCode!=='FTL') assumptions.PALLET_RETURN=5+(i%6);
      volumeData.push({
        tenantId,dcId:lane.dcId,modeId:lane.modeId,laneId:lane.id,customerCode,customerName,
        destinationCountry:country,destinationPostcode:postcodeFor(dest.prefix,i+1),normalizedPostcode:postcodeFor(dest.prefix,i+1),
        destinationRegion:region,shipmentCount,palletCount:avg?shipmentCount*avg:null,averagePallets:avg,
        accessorialAssumptions:Object.keys(assumptions).length?assumptions:Prisma.JsonNull,period:'FY2026',
        forecastVolume:Math.round(shipmentCount*1.08),notes:'Synthetic annual customer-volume record',mappedAt:iso('2026-10-01')
      });
      if(i<24){
        const [code2,name2]=customers[(i+7)%customers.length]; const shipments2=32+((i*11)%58); const avg2=modeCode==='FTL'?null:6+((i*3)%22);
        volumeData.push({
          tenantId,dcId:lane.dcId,modeId:lane.modeId,laneId:lane.id,customerCode:code2,customerName:name2,
          destinationCountry:country,destinationPostcode:postcodeFor(dest.prefix,i+101),normalizedPostcode:postcodeFor(dest.prefix,i+101),
          destinationRegion:region,shipmentCount:shipments2,palletCount:avg2?shipments2*avg2:null,averagePallets:avg2,
          accessorialAssumptions:i%5===0?{WAITING_TIME:1}:Prisma.JsonNull,period:'FY2026',forecastVolume:Math.round(shipments2*1.12),
          notes:'Synthetic secondary customer-volume record',mappedAt:iso('2026-10-01')
        });
      }
    }
    const cz=dcByCode.get('CZ')!,ftl=modeByCode.get('FTL')!,pallet=modeByCode.get('PALLET')!;
    volumeData.push({
      tenantId,dcId:cz.id,modeId:ftl.id,laneId:null,customerCode:'CUST-023',customerName:'Westbridge Wholesale',
      destinationCountry:'DE',destinationPostcode:'99999',normalizedPostcode:'99999',destinationRegion:null,shipmentCount:48,
      palletCount:null,averagePallets:null,accessorialAssumptions:Prisma.JsonNull,period:'FY2026',forecastVolume:52,
      notes:'Intentional unmapped demo record for Coverage Gaps'
    });
    volumeData.push({
      tenantId,dcId:cz.id,modeId:pallet.id,laneId:null,customerCode:'CUST-024',customerName:'Zenith Packaging',
      destinationCountry:'NL',destinationPostcode:'9999ZZ',normalizedPostcode:'9999ZZ',destinationRegion:null,shipmentCount:36,
      palletCount:540,averagePallets:15,accessorialAssumptions:{PALLET_RETURN:12},period:'FY2026',forecastVolume:40,
      notes:'Intentional unmapped pallet record for Coverage Gaps'
    });
    await tx.volumeRecord.createMany({data:volumeData});

    const firstCzFtl=scopeCarriers.get('CZ|FTL')!;
    const czFtlLanes=destinations.map(d=>laneByKey.get(laneKey('CZ','FTL',d.country,d.region)));
    const czPalletLanes=destinations.map(d=>laneByKey.get(laneKey('CZ','PALLET',d.country,d.region)));

    const s1=await tx.scenario.create({data:{
      tenantId,name:'Carrier Consolidation 2027',description:'Replace selected Primary carriers with lower-cost contracted alternatives on strategic lanes.',
      modellingDate:iso('2026-10-05'),enablePalletToFtl:false,maxPalletsPerFtl:33,createdById:userId,createdAt:iso('2026-09-20')
    }});
    await tx.scenarioRule.createMany({data:[
      {tenantId,scenarioId:s1.id,type:'CARRIER_REPLACEMENT',laneId:czFtlLanes[0].id,carrierId:carrierByCode.get(firstCzFtl[0])!.id,replacementCarrierId:carrierByCode.get(firstCzFtl[1])!.id,notes:'Synthetic tender replacement'},
      {tenantId,scenarioId:s1.id,type:'CARRIER_REPLACEMENT',laneId:czFtlLanes[3].id,carrierId:carrierByCode.get(firstCzFtl[0])!.id,replacementCarrierId:carrierByCode.get(firstCzFtl[2])!.id,notes:'Synthetic tender replacement'}
    ]});

    const palletCodes=scopeCarriers.get('CZ|PALLET')!;
    const s2=await tx.scenario.create({data:{
      tenantId,name:'Germany 60/40 Resilience Split',description:'Model a dual-carrier allocation for a high-volume German pallet lane.',
      modellingDate:iso('2026-10-05'),enablePalletToFtl:false,maxPalletsPerFtl:33,createdById:userId,createdAt:iso('2026-09-26')
    }});
    await tx.scenarioRule.createMany({data:[
      {tenantId,scenarioId:s2.id,type:'LANE_SPLIT',laneId:czPalletLanes[1].id,replacementCarrierId:carrierByCode.get(palletCodes[0])!.id,percentage:60,notes:'60% lead carrier'},
      {tenantId,scenarioId:s2.id,type:'LANE_SPLIT',laneId:czPalletLanes[1].id,replacementCarrierId:carrierByCode.get(palletCodes[1])!.id,percentage:40,notes:'40% resilience carrier'}
    ]});

    const s3=await tx.scenario.create({data:{
      tenantId,name:'Strategic Customer Override',description:'Assign a named strategic customer to a preferred contracted carrier without changing the general lane ladder.',
      modellingDate:iso('2026-10-05'),enablePalletToFtl:false,maxPalletsPerFtl:33,createdById:userId,createdAt:iso('2026-10-01')
    }});
    await tx.scenarioRule.create({data:{
      tenantId,scenarioId:s3.id,type:'CUSTOMER_ASSIGNMENT',laneId:czFtlLanes[0].id,customerCode:'CUST-001',
      replacementCarrierId:carrierByCode.get(firstCzFtl[1])!.id,notes:'Synthetic customer-specific preferred carrier'
    }});

    await tx.scenario.create({data:{
      tenantId,name:'Pallet-to-FTL Optimisation',description:'Compare pallet tariffs with FTL economics and convert only when FTL is cheaper.',
      modellingDate:iso('2026-10-05'),enablePalletToFtl:true,maxPalletsPerFtl:33,createdById:userId,createdAt:iso('2026-10-05')
    }});

    const imports=[
      ['RATE_CARD','DEMO_CZ_FTL_2026.xlsx','demo-import-rate-1',40],
      ['RATE_CARD','DEMO_CZ_PALLET_2026.xlsx','demo-import-rate-2',40],
      ['ALLOCATION_KEY','DEMO_Allocation_Key_2026.xlsx','demo-import-alloc-1',120],
      ['VOLUME','DEMO_Customer_Volumes_FY2026.xlsx','demo-import-volume-1',volumeData.length],
      ['POSTCODE_MAPPING','DEMO_Postcode_Region_Map.xlsx','demo-import-postcode-1',destinations.length+3]
    ] as const;
    for(const [type,filename,checksum,successRows] of imports){
      await tx.importJob.create({data:{
        tenantId,type,filename,checksum,status:'COMPLETED',successRows,errorRows:0,warningRows:type==='RATE_CARD'?2:0,
        issues:type==='RATE_CARD'?[{severity:'warning',sheet:'Demo',message:'Synthetic demonstration workbook'}]:[],
        parsedData:{demo:true,rows:successRows},createdById:userId,createdAt:iso('2026-10-02'),committedAt:iso('2026-10-02')
      }});
    }

    await tx.entityRevision.createMany({data:carrierDefs.slice(0,6).map(([code,name],i)=>({
      tenantId,entityType:'Carrier',entityId:carrierByCode.get(code)!.id,version:1,changeType:'CREATE',
      snapshot:{code,name,active:true,demo:true},changedById:userId,changedAt:iso('2026-09-'+String(10+i).padStart(2,'0'))
    }))});

    await tx.auditEvent.create({data:{
      tenantId,userId,entityType:'DemoSeed',entityId:DEMO_SEED_VERSION,action:'SEED',
      summary:'Loaded synthetic freight demonstration dataset',
      details:{version:DEMO_SEED_VERSION,carriers:carrierDefs.length,lanes:laneByKey.size,rateCards:rateCardCount,laneRates:laneRateCount,palletBands:bandCount,allocationKeys:allocationKeyCount,allocationRules:allocationRuleCount,volumes:volumeData.length,scenarios:4}
    }});
  },{maxWait:15000,timeout:300000});

  console.log('Synthetic demo dataset loaded:',DEMO_SEED_VERSION,'| 12 carriers | 72 lanes | 60 rate cards | 98 volume records | 4 scenarios');
}
