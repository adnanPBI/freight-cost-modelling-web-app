import { describe, expect, it } from 'vitest';
import { seedDemoData } from '../prisma/demo-seed';

describe('synthetic demo seed',()=>{
  it('exports the idempotent demo seeder',()=>{
    expect(typeof seedDemoData).toBe('function');
  });
});
