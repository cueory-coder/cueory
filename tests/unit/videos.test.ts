import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isShowable, videoSchema } from '../../src/videos/schema';

const base = { lesson: 'study-skills-01', title: 'A video', status: 'published', videoId: 'abcDEF_-123', captionsUrl: '', transcriptUrl: '' };
const ok = (over: Record<string, unknown> = {}) => videoSchema.safeParse({ ...base, ...over }).success;

describe('video schema', () => {
  it('accepts a normal video', () => {
    expect(ok()).toBe(true);
  });

  it.each(['..', '', 'short', 'twelve_chars', 'abc/def1234', 'abc def1234', 'abcdef123?x', 'abcdef123%2'])(
    'rejects the video id %j',
    (videoId) => expect(ok({ videoId })).toBe(false),
  );

  it.each(['captionsUrl', 'transcriptUrl'])('%s accepts https and site paths only', (field) => {
    for (const good of ['', 'https://example.org/t.vtt', '/transcripts/a.html']) expect(ok({ [field]: good })).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://example.org/a', '//evil.example/a', 'https://', 'ftp://x.org/a', ' /a']) {
      expect(ok({ [field]: bad }), bad).toBe(false);
    }
  });

  it('thumbnail must be a self-hosted image path', () => {
    expect(ok({ thumbnail: '/videos/study-skills-01.webp' })).toBe(true);
    for (const bad of ['https://i.ytimg.com/vi/x/hq.jpg', '//evil.example/a.png', '/../a.png', '/a/../b.png', 'a.png', '/a.html']) {
      expect(ok({ thumbnail: bad }), bad).toBe(false);
    }
  });

  it('shows only published videos', () => {
    expect(isShowable('published')).toBe(true);
    for (const s of ['placeholder', 'draft', 'in_review']) expect(isShowable(s)).toBe(false);
  });
});

describe('video content files', () => {
  const dir = new URL('../../content/videos/', import.meta.url);
  it.each(readdirSync(dir).filter((f) => f.endsWith('.json')))('%s is valid', (file) => {
    expect(videoSchema.safeParse(JSON.parse(readFileSync(new URL(file, dir), 'utf8'))).success).toBe(true);
  });
  it('the empty video is explicitly labeled as a placeholder and never shown', () => {
    const v = JSON.parse(readFileSync(new URL('study-skills-01.json', dir), 'utf8'));
    expect(v.status).toBe('placeholder');
    expect(v.videoId).toBe('xxxxxxxxxxx');
    expect(v.captionsUrl).toBe('');
    expect(v.transcriptUrl).toBe('');
    expect(isShowable(v.status)).toBe(false);
  });
});
