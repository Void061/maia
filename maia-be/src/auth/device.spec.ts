import { describe, expect, it } from 'vitest';
import { deviceOf } from './device.js';

describe('deviceOf', () => {
  it('names the Fire TV app and a TV browser', () => {
    const fire = 'Mozilla/5.0 (Linux; Android 9; AFTSS Build/PS7717.5746N; wv) AppleWebKit/537.36 Chrome/120 Safari/537.36';
    expect(deviceOf(`${fire} MaiaTV/1.0`)).toEqual({ device: 'App MAIA su Fire TV', kind: 'tv' });
    expect(deviceOf(fire)).toEqual({ device: 'Fire TV', kind: 'tv' });
    expect(deviceOf('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) Safari/537.36').kind).toBe('tv');
  });

  it('tells phones, tablets and computers apart', () => {
    expect(deviceOf('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/142 Mobile Safari/537.36')).toEqual({
      device: 'Chrome su Telefono Android',
      kind: 'phone',
    });
    expect(deviceOf('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/142 Safari/537.36').kind).toBe('tablet');
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toEqual({
      device: 'Safari su iPhone',
      kind: 'phone',
    });
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36 Edg/142.0')).toEqual({
      device: 'Edge su PC Windows',
      kind: 'computer',
    });
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Gecko/20100101 Firefox/140.0').device).toBe('Firefox su Mac');
  });

  it('does not invent anything without a user agent', () => {
    expect(deviceOf(null)).toEqual({ device: 'Dispositivo sconosciuto', kind: 'other' });
    expect(deviceOf('curl/8.0').kind).toBe('other');
  });
});
