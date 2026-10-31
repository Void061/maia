// Every outside service MAIA calls from the server, with the hosts its
// requests go to. The admin switches (ServiceSwitches) work per service: a new
// service must be listed here, or it cannot be switched off.
export type OutsideService = { id: string; name: string; role: string; hosts: string[] };

export const SERVICES: OutsideService[] = [
  {
    id: 'raiplay',
    name: 'RaiPlay',
    role: 'Catalogo e link dei video',
    hosts: ['www.raiplay.it', 'mediapolisvod.rai.it'],
  },
  {
    id: 'tmdb',
    name: 'TMDB',
    role: 'Schede, locandine e numerazione degli episodi',
    hosts: ['api.themoviedb.org'],
  },
];
