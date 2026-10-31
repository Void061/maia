import { cleanExtraName, presentExtras, type ExtraGroup } from './extras.js';

const item = (id: string, name: string) => ({ id, name, minutes: 5, imageUrl: null });

describe('cleanExtraName', () => {
  it('drops the show name and the date', () => {
    expect(cleanExtraName('Lillo diventa Adriano Celentano - Da Grande - 26/09/2021', 'Da Grande')).toBe('Lillo diventa Adriano Celentano');
    expect(cleanExtraName('Da Grande - Nicoletta Orsomando annuncia Da Grande', 'Da Grande')).toBe('Nicoletta Orsomando annuncia Da Grande');
  });

  it('keeps names that are only the show name', () => {
    expect(cleanExtraName('Da Grande', 'Da Grande')).toBe('Da Grande');
  });
});

describe('presentExtras', () => {
  const clips: ExtraGroup = {
    id: 'g1',
    kind: 'CLIPS',
    label: 'Clip',
    season: null,
    items: [
      item('a', 'Saluti - Da Grande - 26/09/2021'),
      item('b', 'Il Volo - Da Grande - 19/09/2021'),
      item('c', 'Jacobs - Da Grande - 26/09/2021'),
      item('d', 'Backstage'),
    ],
  };

  it('splits clips per puntata, newest first, undated ones apart', () => {
    const out = presentExtras([clips], 'Da Grande', new Set(['2021-09-19', '2021-09-26']));
    expect(out.map((g) => [g.id, g.label, g.items.map((i) => i.name)])).toEqual([
      ['g1:2021-09-26', 'Clip · puntata del 26 settembre 2021', ['Saluti', 'Jacobs']],
      ['g1:2021-09-19', 'Clip · puntata del 19 settembre 2021', ['Il Volo']],
      ['g1', 'Clip', ['Backstage']],
    ]);
  });

  it('keeps a group whole when its clips have no dates', () => {
    const plain: ExtraGroup = { ...clips, items: [item('a', 'Uno'), item('b', 'Due')] };
    expect(presentExtras([plain], 'Da Grande', new Set())).toEqual([plain]);
  });

  it('keeps a daily show in one group, newest first', () => {
    const daily: ExtraGroup = {
      ...clips,
      items: Array.from({ length: 20 }, (_, i) => item(`x${i}`, `Clip ${i} - ${String(i + 1).padStart(2, '0')}/10/2026`)),
    };
    const [only, ...rest] = presentExtras([daily], 'Show', new Set());
    expect(rest).toHaveLength(0);
    expect(only.items[0].name).toBe('Clip 19');
  });
});
