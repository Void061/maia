// Every outside service MAIA calls from the server, with the hosts its
// requests go to. The admin switches (ServiceSwitches) work per service: a new
// service must be listed here, or it cannot be switched off. `catalog`: a
// source of the catalog, with its own update schedule (admin panel).
export type OutsideService = { id: string; name: string; role: string; hosts: string[]; catalog?: boolean };

export const SERVICES: OutsideService[] = [
  {
    id: 'raiplay',
    name: 'RaiPlay',
    role: 'Catalogo e link dei video',
    hosts: ['www.raiplay.it', 'mediapolisvod.rai.it'],
    catalog: true,
  },
  {
    id: 'tmdb',
    name: 'TMDB',
    role: 'Schede, locandine e numerazione degli episodi',
    hosts: ['api.themoviedb.org'],
  },
];
