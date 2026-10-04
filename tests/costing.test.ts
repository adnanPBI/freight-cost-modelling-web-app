import { describe, expect, it } from 'vitest';
import { bandCost, breakEvenPalletQty, palletShipmentCost, roundPalletQty, timeWeightedFuel, totalCost } from '../src/lib/costing';

describe('costing primitives',()=>{
  it('rounds fractional pallet quantities conservatively by default',()=>{expect(roundPalletQty(2.01)).toBe(3);expect(roundPalletQty(2.49,'NEAREST')).toBe(2);});
  it('does not interpolate missing pallet bands',()=>{expect(()=>bandCost(2,{1:10,3:30},'ERROR')).toThrow('Missing pallet band 2');expect(bandCost(2,{1:10,3:30},'NEXT_HIGHER')).toBe(30);});
  it('handles above-36 policy with explicit FTL fallback',()=>{expect(palletShipmentCost(40,{36:500},{above36:'FTL',ftlRate:700,maxPalletsPerFtl:33})).toBe(1400);expect(()=>palletShipmentCost(40,{36:500},{above36:'FTL'})).toThrow('No valid FTL rate');});
  it('finds break-even and keeps components auditable',()=>{expect(breakEvenPalletQty({1:100,2:200,3:300},250)).toBe(3);expect(totalCost(1000,5,20)).toBe(1070);});
  it('time-weights fuel percentages across validity ranges',()=>{const pct=timeWeightedFuel([{from:new Date('2026-01-01'),to:new Date('2026-01-10'),pct:5},{from:new Date('2026-01-11'),to:new Date('2026-01-20'),pct:7}],new Date('2026-01-01'),new Date('2026-01-20'));expect(pct).toBeCloseTo(6);});
});
