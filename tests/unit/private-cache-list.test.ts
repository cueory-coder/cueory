/** Task 251: the first-visit cache plan never includes private or preview pages. */
import { describe, expect, it } from 'vitest';
import { firstVisitUrls } from '../../src/scripts/offline';

const origin = 'https://cueory.app';
const privateRoutes = [
  '/preview', '/preview/', '/preview/share', '/preview/states',
  '/account', '/account/', '/account/settings', '/account/two-factor',
  '/admin', '/admin/', '/admin/flags',
  '/auth', '/auth/callback', '/auth/callback?code=sample',
  '/signin', '/signup', '/reset-password',
] as const;

describe('private URLs in the service-worker first-visit cache list', () => {
  it.each(privateRoutes)('never schedules a private page as the first-visit document: %s', route => {
    expect(firstVisitUrls(route, [], origin)).toEqual([]);
    expect(firstVisitUrls(`${origin}${route}`, [], origin)).toEqual([]);
  });

  it.each(privateRoutes)('excludes private resource candidates while keeping public assets: %s', route => {
    expect(firstVisitUrls('/learn/study-skills', [
      route, `${origin}${route}`, `${origin}/_astro/app.js`,
    ], origin)).toEqual([
      `${origin}/learn/study-skills`, `${origin}/_astro/app.js`,
    ]);
  });

  it('does not admit a private document when its fragment is removed', () => {
    expect(firstVisitUrls('/auth/callback#access_token=sample', [
      '/account#settings', '/preview/share#example', '/admin/flags#inbox',
    ], origin)).toEqual([]);
  });

  it('filters private URLs before applying the public-resource count limit', () => {
    const privateCandidates = Array.from({ length: 80 }, (_, index) => `/account/settings/${index}`);
    expect(firstVisitUrls('/learn/study-skills', [
      ...privateCandidates, '/_astro/app.js', '/fonts/lato-latin-400-normal.woff2',
    ], origin)).toEqual([
      `${origin}/learn/study-skills`, `${origin}/_astro/app.js`, `${origin}/fonts/lato-latin-400-normal.woff2`,
    ]);
  });

  it('keeps a valid public document even when every discovered resource is private', () => {
    expect(firstVisitUrls('/learn/study-skills/cards#card-2', privateRoutes, origin))
      .toEqual([`${origin}/learn/study-skills/cards`]);
  });
});
