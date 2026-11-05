import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { partsListCitationUrl } from '../../scripts/anatomy-source-url.mjs';

const latest = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html';

describe('regenerating the BodyParts3D anatomy source citations', () => {
  it('links 4.0 source names to the exact table, not the overview README', () => {
    expect(partsListCitationUrl(latest, 'partof_parts_list_e.txt, Release 4.0'))
      .toBe('https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt');
    expect(partsListCitationUrl(latest, 'isa_parts_list_e.txt, Release 4.0'))
      .toBe('https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt');
  });

  it('preserves the separate archived Release 3.0 parts-table citation', () => {
    expect(partsListCitationUrl(
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
      'parts_list_e.txt, Release 3.0 (2011-09-15)',
    )).toBe('https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/parts_list_e.txt');
  });

  it('rejects non-table source sections and malformed README addresses', () => {
    for (const section of ['README_e.html, Release 4.0', '../README_e.html, Release 4.0', 'custom_parts_list_e.txt, Release 4.0']) {
      expect(() => partsListCitationUrl(latest, section)).toThrow('unrecognized BodyParts3D');
    }
    expect(() => partsListCitationUrl('http://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html', 'isa_parts_list_e.txt, Release 4.0'))
      .toThrow('HTTPS');
  });

  it('keeps the builder wired to direct table links for each structure', () => {
    const builder = readFileSync(new URL('../../scripts/build-anatomy.mjs', import.meta.url), 'utf8');
    expect(builder).toContain("import { partsListCitationUrl } from './anatomy-source-url.mjs';");
    expect(builder).toContain('url: partsListCitationUrl(release.url, release.partsSection(tree))');
    // The geometry-wide README citation remains on the README.
    expect(builder).toContain("section: release.readmeSection, url: release.url");
  });
});
