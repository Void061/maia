import { afterEach } from 'vitest';
import { baseUrl, normalizeBaseUrl, serviceHosts, setBaseUrlOverrides } from './base-urls.js';

describe('base URLs', () => {
  afterEach(() => setBaseUrlOverrides(new Map()));

  it('uses the default until an admin changes it', () => {
    expect(baseUrl('sdm')).toBe('http://192.168.1.9');
    setBaseUrlOverrides(new Map([['sdm', 'https://sdm.example.org']]));
    expect(baseUrl('sdm')).toBe('https://sdm.example.org');
  });

  it('counts the current address among the hosts', () => {
    expect(serviceHosts('sdm')).toEqual(['192.168.1.9']);
    setBaseUrlOverrides(new Map([['sdm', 'http://10.0.0.5:8080']]));
    expect(serviceHosts('sdm')).toEqual(['10.0.0.5:8080']);
    expect(serviceHosts('tmdb')).toEqual(['api.themoviedb.org']);
  });

  it('cleans what is typed in the panel', () => {
    expect(normalizeBaseUrl(' http://192.168.1.9/ ')).toBe('http://192.168.1.9');
    expect(normalizeBaseUrl('https://host:8443/media//')).toBe('https://host:8443/media');
    expect(normalizeBaseUrl('ftp://host')).toBeNull();
    expect(normalizeBaseUrl('http://u:p@host')).toBeNull();
    expect(normalizeBaseUrl('http://host/?a=1')).toBeNull();
    expect(normalizeBaseUrl('192.168.1.9')).toBeNull();
  });
});
