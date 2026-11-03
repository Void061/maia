import { afterEach, describe, expect, it } from 'vitest';
import { assetUrl, toAsset } from './assets.js';
import { setBaseUrlOverrides } from './base-urls.js';

describe('assets', () => {
  afterEach(() => setBaseUrlOverrides(new Map()));

  it('keeps a path with its service, a full URL alone', () => {
    expect(toAsset('raiplay', '/dl/img/a.jpg')).toEqual({ path: '/dl/img/a.jpg', source: 'raiplay' });
    expect(toAsset('sdm', 'https://cdn.example/a.jpg')).toEqual({ path: 'https://cdn.example/a.jpg', source: null });
    expect(toAsset('raiplay', null)).toEqual({ path: null, source: null });
  });

  it('builds the link with the size of each service', () => {
    expect(assetUrl('/dl/img/a.jpg', 'raiplay', 'poster')).toBe('https://www.raiplay.it/cropgd/384x512/dl/img/a.jpg');
    expect(assetUrl('/abc.jpg', 'tmdb', 'backdrop')).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg');
    expect(assetUrl('https://cdn.example/a.jpg', null, 'thumb')).toBe('https://cdn.example/a.jpg');
    expect(assetUrl(null, 'tmdb', 'poster')).toBeNull();
  });

  it('follows the address set in the admin panel', () => {
    setBaseUrlOverrides(new Map(), new Map([['tmdb', 'https://img.example/t/p']]));
    expect(assetUrl('/abc.jpg', 'tmdb', 'poster')).toBe('https://img.example/t/p/w500/abc.jpg');
    setBaseUrlOverrides(new Map([['raiplay', 'https://rai.example']]));
    expect(assetUrl('/a.jpg', 'raiplay', 'thumb')).toBe('https://rai.example/cropgd/640x360/a.jpg');
  });
});
