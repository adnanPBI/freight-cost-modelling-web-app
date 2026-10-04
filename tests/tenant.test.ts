import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertEUR, assertTenantRecord } from '../src/lib/tenant';

describe('tenant and currency guards',()=>{
  it('rejects records belonging to another tenant',()=>{expect(()=>assertTenantRecord('tenant-a',{tenantId:'tenant-b',id:'x'})).toThrow('NOT_FOUND');expect(assertTenantRecord('tenant-a',{tenantId:'tenant-a',id:'x'}).id).toBe('x');});
  it('enforces EUR',()=>{expect(assertEUR('EUR')).toBe('EUR');expect(()=>assertEUR('GBP')).toThrow('Only EUR');});
  it('puts tenantId directly on every business model',()=>{
    const schema=fs.readFileSync('prisma/schema.prisma','utf8');
    const models=['TenantConfig','User','EntityRevision','Carrier','CarrierAlias','DistributionCentre','TransportMode','Lane','RateCard','LaneRate','PalletBand','AllocationKey','AllocationRule','ImportJob','VolumeRecord','PostcodeMapping','AccessorialType','CarrierAccessorial','FuelSurcharge','Scenario','ScenarioRule','AuditEvent'];
    for(const name of models){const match=schema.match(new RegExp('model '+name+' \\{([\\s\\S]*?)\\n\\}'));expect(match?.[1],name).toContain('tenantId');}
  });
});
