// How extras are shown. Pure functions, applied when the API builds a title
// page: the stored data stays as the service gives it.
import { parseItalianDate } from './providers/raiplay/raiplay.adapter.js';

export type ExtraItem = { id: string; name: string; minutes: number | null; imageUrl: string | null };
export type ExtraGroup = {
  id: string;
  kind: 'HIGHLIGHTS' | 'CLIPS' | 'PREVIEWS' | 'EXTRAS';
  label: string;
  season: number | null;
  items: ExtraItem[];
};

// More puntate than this and a group stays whole (a daily show would get a
// row per day): its clips are only cleaned up and put in date order.
const MAX_SPLIT = 12;

const DATE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
const norm = (s: string) => s.trim().toLocaleLowerCase('it-IT');

// "Lillo diventa Adriano Celentano - Da Grande - 26/09/2021" -> "Lillo diventa
// Adriano Celentano": the parts that repeat the show's name or are only a date
// say nothing on the show's own page.
export function cleanExtraName(name: string, titleName: string): string {
  const parts = name.split(' - ').filter((p) => norm(p) !== norm(titleName) && !/^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(p));
  const cleaned = parts.join(' - ').trim();
  return cleaned || name;
}

export const itDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// A group whose clips come from a few puntate (the date is in their names) is
// split per puntata, newest first: "Clip · puntata del 26 settembre 2021".
// Clips without a date stay in the original group.
export function presentExtras(groups: ExtraGroup[], titleName: string, episodeDates: Set<string>): ExtraGroup[] {
  const out: ExtraGroup[] = [];
  for (const g of groups) {
    const dated = g.items.map((item) => ({ item: { ...item, name: cleanExtraName(item.name, titleName) }, date: DATE.test(item.name) ? parseItalianDate(item.name) : null }));
    const dates = [...new Set(dated.map((d) => d.date).filter((d): d is string => !!d))].sort().reverse();
    const mostlyDated = dated.filter((d) => d.date).length * 2 >= dated.length;
    if (dates.length < 2 || dates.length > MAX_SPLIT || !mostlyDated) {
      // Whole group, newest puntata first when the clips carry dates.
      const items = dates.length ? [...dated].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) : dated;
      out.push({ ...g, items: items.map((d) => d.item) });
      continue;
    }
    for (const date of dates) {
      const label = episodeDates.has(date) ? `${g.label} · puntata del ${itDate(date)}` : `${g.label} · ${itDate(date)}`;
      out.push({ ...g, id: `${g.id}:${date}`, label, items: dated.filter((d) => d.date === date).map((d) => d.item) });
    }
    const undated = dated.filter((d) => !d.date);
    if (undated.length) out.push({ ...g, items: undated.map((d) => d.item) });
  }
  return out;
}
