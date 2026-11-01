// Every outside service MAIA calls from the server, with the hosts its
// requests go to. The admin switches (ServiceSwitches) work per service: a new
// service must be listed here, or it cannot be switched off. `catalog`: a
// source of the catalog, with its own update schedule (admin panel).
// `baseUrl`: the default address of a catalog source, changeable from the admin
// panel (base-urls.ts); its host counts as one of the service's hosts. Every
// catalog source has one. `hosts` lists the other, fixed hosts.
export type OutsideService = { id: string; name: string; role: string; hosts: string[]; baseUrl?: string; catalog?: boolean };

export const SERVICES: OutsideService[] = [
  {
    id: 'raiplay',
    name: 'RaiPlay',
    role: 'Catalogo e link dei video',
    baseUrl: 'https://www.raiplay.it',
    hosts: ['mediapolisvod.rai.it'],
    catalog: true,
  },
  {
    id: 'sdm',
    name: 'SDM',
    role: 'Film e serie dal server di casa',
    baseUrl: 'http://192.168.1.9',
    hosts: [],
    catalog: true,
  },
  {
    id: 'tmdb',
    name: 'TMDB',
    role: 'Schede, locandine e numerazione degli episodi',
    hosts: ['api.themoviedb.org'],
  },
];
