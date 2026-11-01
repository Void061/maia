import { romeTime } from '../providers/raiplay/raiplay.adapter.js';
import { romeDay } from './live.service.js';

describe('romeTime', () => {
  it('reads Rome wall-clock time in winter (UTC+1)', () => {
    expect(romeTime('31/10/2026', '20:35').toISOString()).toBe('2026-10-31T19:35:00.000Z');
  });

  it('reads Rome wall-clock time in summer (UTC+2)', () => {
    expect(romeTime('01/07/2026', '00:10').toISOString()).toBe('2026-06-30T22:10:00.000Z');
  });

  it('accepts the dash format of the schedule URLs', () => {
    expect(romeTime('25-10-2026', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });
});

describe('romeDay', () => {
  it('gives the Rome calendar day, not the UTC one', () => {
    // 23:30 UTC on 31 October is already 1 November in Rome.
    expect(romeDay(0, Date.parse('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(romeDay(-1, Date.parse('2026-10-31T23:30:00Z'))).toBe('2026-10-31');
  });
});
