import { parseItalianDate } from './raiplay.adapter.js';

describe('parseItalianDate', () => {
  it('reads the date in an episode name', () => {
    expect(parseItalianDate('Telefono giallo: Puntata del 12/3/1988')).toBe('1988-03-12');
  });

  it('ignores names without a date', () => {
    expect(parseItalianDate('Puntata 4')).toBeNull();
  });

  it('ignores dates that do not exist', () => {
    expect(parseItalianDate('Telefono giallo: Puntata del 00/00/1992')).toBeNull();
    expect(parseItalianDate('Puntata del 31/02/2024')).toBeNull();
    expect(parseItalianDate('Puntata del 12/13/2024')).toBeNull();
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseItalianDate('Puntata del 29/02/2024')).toBe('2024-02-29');
  });
});
