import { syncCrons } from './queues.js';

describe('syncCrons', () => {
  it('manual: nothing scheduled', () => {
    expect(syncCrons({ mode: 'MANUAL', at: '03:00', everyHours: 3 })).toEqual({ full: null, check: null });
  });

  it('daily pass only', () => {
    expect(syncCrons({ mode: 'AUTO', at: '03:00', everyHours: null })).toEqual({ full: '0 3 * * *', check: null });
  });

  it('checks every 6 hours between the daily passes, never at the same time', () => {
    expect(syncCrons({ mode: 'AUTO', at: '03:30', everyHours: 6 })).toEqual({ full: '30 3 * * *', check: '30 9,15,21 * * *' });
  });

  it('wraps around midnight and keeps the hours in order', () => {
    expect(syncCrons({ mode: 'AUTO', at: '22:00', everyHours: 8 })).toEqual({ full: '0 22 * * *', check: '0 6,14 * * *' });
  });

  it('03:00 and every 3 hours (the old fixed schedule)', () => {
    expect(syncCrons({ mode: 'AUTO', at: '03:00', everyHours: 3 }).check).toBe('0 0,6,9,12,15,18,21 * * *');
  });
});
