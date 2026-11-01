import { describe, expect, it } from 'vitest';
import { cacheable, cacheName } from '../../src/scripts/offlineplan';

const ORIGIN = 'https://cueory.app';

describe('offline URL policy for GET requests', () => {
  it.each([
    '/', '/play', '/play/', '/learn/', '/learn/study-skills/cards',
    '/learn/study-skills/cards/', '/_astro/cards.abc123.js',
    '/brand/v1/logo.png', '/fonts/inter.woff2',
    'https://cueory.app/play', '//cueory.app/learn/study-skills/',
    '/learn/study-skills/?view=cards', '/play?mode=daily',
  ])('allows a public page or a built asset: %s', url => {
    expect(cacheable(url, ORIGIN)).toBe(true);
  });

  it.each([
    '/admin', '/admin/', '/admin/questions', '/ADMIN', '/ADMIN/questions',
    '/subscribed', '/subscribed/', '/subscribed/anything',
    '/progress', '/start', '/privacy', '/learn', '/learning/cards',
    '/playground', '/play/account', '/_astro-private/file.js', '/brandish/logo.png',
    '/fonts-private/font.woff2', '/api/questions',
  ])('refuses paths outside the explicit public list: %s', url => {
    expect(cacheable(url, ORIGIN)).toBe(false);
  });

  it.each([
    '?token=sample', '?code=sample', '?key=sample', '?TOKEN=sample', '?Code', '?KEY=',
    '?%74oken=sample', '?%63ode=sample', '?%6bey=sample', '?view=cards&code=sample',
    '?token=one&token=two', '?access_token=sample', '?refresh_token=sample',
    '?id_token=sample', '?token_hash=sample', '?api_key=sample',
  ])('refuses a sensitive decoded query parameter: %s', query => {
    expect(cacheable(`/learn/study-skills/${query}`, ORIGIN)).toBe(false);
    expect(cacheable(`/_astro/sample.js${query}`, ORIGIN)).toBe(false);
  });

  it.each([
    'https://www.youtube.com/play', 'https://sample.supabase.co/learn/cards',
    'https://cueory.app.evil.example/play', 'https://cueory.app@evil.example/play',
    'http://cueory.app/play', 'https://cueory.app:444/play',
    'https://cueory.app./play', '//cueory.app./play',
    'https://sample@cueory.app/play', 'https://sample:sample@cueory.app/play',
    'data:text/html,sample', 'javascript:sample', 'file:///play',
  ])('refuses external origins, credentials and unsupported schemes: %s', url => {
    expect(cacheable(url, ORIGIN)).toBe(false);
  });

  it('compares origins using the URL standard, including default ports', () => {
    expect(cacheable('https://CUEORY.APP:443/play', ORIGIN)).toBe(true);
    expect(cacheable('http://localhost:4321/play', 'http://localhost:4321')).toBe(true);
    expect(cacheable('http://localhost:4322/play', 'http://localhost:4321')).toBe(false);
    expect(cacheable('https://cueory.app/play', 'https://cueory.app.')).toBe(false);
  });

  it.each([
    '/learn%2Fadmin', '/learn/%2fadmin', '/learn/%2F..%2Fadmin',
    '/learn/%5cadmin', '/learn/%252fadmin', '/learn/%25252fadmin',
    '/learn/../admin', '/learn/%2e%2e/admin', '/learn/../subscribed',
    '/learn/%2e%2e/subscribed', '/brand/../../admin',
    '/learn/\\admin', '/learn/%', '/learn/%GG',
    '/play#access_token=sample', '/play#section',
    ' /play', '/play ', '/pl\nay', '/learn/\u0000sample',
  ])('refuses ambiguous, normalized-private or fragment-bearing URLs: %s', url => {
    expect(cacheable(url, ORIGIN)).toBe(false);
  });

  it.each([
    '', 'not an origin', 'null', 'file:///tmp', 'https://cueory.app/learn/',
    'https://sample@cueory.app', 'https://cueory.app?code=sample', 'https://cueory.app#sample',
  ])('fails closed for a malformed origin: %s', origin => {
    expect(cacheable('/play', origin)).toBe(false);
  });

  it('never throws for malformed runtime input', () => {
    expect(cacheable('https://[invalid/play', ORIGIN)).toBe(false);
    expect(cacheable('', ORIGIN)).toBe(false);
    expect(cacheable(null as unknown as string, ORIGIN)).toBe(false);
    expect(cacheable('/play', null as unknown as string)).toBe(false);
  });
});

describe('versioned offline cache name', () => {
  it('is stable within a build and different for different build versions', () => {
    expect(cacheName('build-a')).toBe('cueory-offline-build-a');
    expect(cacheName('build-a')).toBe(cacheName('build-a'));
    expect(cacheName('build-a')).not.toBe(cacheName('build-b'));
    expect(cacheName('build a')).not.toBe(cacheName('build-a'));
  });

  it.each(['', ' ', '\n'])('requires a non-empty build version: %j', version => {
    expect(() => cacheName(version)).toThrow('build version');
  });
});
