// The apps inside MAIA. Until the admin enables apps per account (docs/access.md)
// the list is fixed here.

export type MaiaApp = {
  key: string;
  name: string;
  description: string;
  href: string;
  enabled: boolean;
};

export const apps: MaiaApp[] = [
  { key: "tv", name: "MAIA TV", description: "Film, serie e canali live", href: "/tv", enabled: true },
  { key: "casa", name: "Casa", description: "In arrivo", href: "#", enabled: false },
];
