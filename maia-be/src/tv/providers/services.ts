// Every outside service MAIA calls from the server, with the hosts its
// requests go to. The admin switches (ServiceSwitches) work per service: a new
// service must be listed here, or it cannot be switched off. `baseUrl`: the
// default address of the streaming source, changeable from the admin panel
// (base-urls.ts); its host counts as one of the service's hosts. `hosts` lists
// the other, fixed hosts.
export type OutsideService = {
  id: string;
  name: string;
  role: string;
  hosts: string[];
  baseUrl?: string;
};

export const SERVICES: OutsideService[] = [
  {
    id: 'sdm',
    name: 'SDM',
    role: 'Streaming dal server di casa',
    baseUrl: 'http://192.168.1.9',
    hosts: [],
  },
  {
    id: 'tmdb',
    name: 'TMDB',
    role: 'Catalogo, locandine e trailer',
    hosts: ['api.themoviedb.org'],
  },
];
