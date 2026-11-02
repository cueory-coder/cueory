import { describe, expect, it } from 'vitest';
import {
  buildShareText,
  buildShareUrl,
  GAME_IDS,
  SCENE_COLORS,
  SHARE_STYLES,
  shareImagePath,
  STYLE_LABELS,
  TOOL_PATHS,
  xIntentUrl,
  type ShareStyle,
  type ShareToolId,
} from '../../src/islands/share';

const SITE = 'https://cueory.app';

describe('shareImagePath', () => {
  it('maps all game ids to the games group', () => {
    for (const id of GAME_IDS) {
      for (const style of SHARE_STYLES) {
        expect(shareImagePath(id, style)).toBe(`/share/games-${style}.png`);
      }
    }
  });

  it('maps study to the study group', () => {
    for (const style of SHARE_STYLES) {
      expect(shareImagePath('study', style)).toBe(`/share/study-${style}.png`);
    }
  });
});

describe('buildShareUrl', () => {
  const TOOLS: ShareToolId[] = [...GAME_IDS, 'study'];

  it('returns an absolute URL for every tool', () => {
    for (const tool of TOOLS) {
      const url = buildShareUrl(tool, SITE);
      expect(url).toMatch(/^https:\/\/cueory\.app\//);
    }
  });

  it('points games to /play', () => {
    for (const id of GAME_IDS) {
      expect(buildShareUrl(id, SITE)).toBe('https://cueory.app/play');
    }
  });

  it('points study to /learn/study-skills', () => {
    expect(buildShareUrl('study', SITE)).toBe('https://cueory.app/learn/study-skills');
  });

  it('strips a trailing slash from siteUrl', () => {
    expect(buildShareUrl('pulse', 'https://cueory.app/')).toBe('https://cueory.app/play');
  });
});

describe('buildShareText', () => {
  const TOOLS: ShareToolId[] = [...GAME_IDS, 'study'];

  it('returns a non-empty string for every tool', () => {
    for (const tool of TOOLS) {
      expect(buildShareText(tool).length).toBeGreaterThan(0);
    }
  });

  it('contains no personal identifiers', () => {
    for (const tool of TOOLS) {
      const text = buildShareText(tool);
      // No digits that look like a score or user ID
      expect(text).not.toMatch(/\b\d{3,}\b/);
    }
  });
});

describe('xIntentUrl', () => {
  it('returns an x.com/intent/tweet URL', () => {
    const url = xIntentUrl('hello', 'https://cueory.app/play');
    expect(url).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/);
  });

  it('includes the text and URL', () => {
    const url = xIntentUrl('hello there', 'https://cueory.app/play');
    expect(url).toContain('hello+there');
    expect(url).toContain('cueory.app');
  });
});

describe('SCENE_COLORS', () => {
  it('has a color for every game id and study', () => {
    const TOOLS: ShareToolId[] = [...GAME_IDS, 'study'];
    for (const tool of TOOLS) {
      expect(SCENE_COLORS[tool]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('uses distinct colors for games and study', () => {
    expect(SCENE_COLORS.pulse).toBe(SCENE_COLORS.cueword);
    expect(SCENE_COLORS.pulse).not.toBe(SCENE_COLORS.study);
  });
});

describe('STYLE_LABELS', () => {
  it('has a label for every style', () => {
    for (const style of SHARE_STYLES) {
      expect(STYLE_LABELS[style as ShareStyle].length).toBeGreaterThan(0);
    }
  });
});

describe('TOOL_PATHS', () => {
  it('every path starts with a slash', () => {
    const TOOLS: ShareToolId[] = [...GAME_IDS, 'study'];
    for (const tool of TOOLS) {
      expect(TOOL_PATHS[tool]).toMatch(/^\//);
    }
  });
});
