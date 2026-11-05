import { spawnSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { partsListCitationUrl } from '../../scripts/anatomy-source-url.mjs';

const latest = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html';

describe('regenerating the BodyParts3D anatomy source citations', () => {
  it('rejects Release 3.0 before loading sources or writing wrongly licensed models', () => {
    const builder = new URL('../../scripts/build-anatomy.mjs', import.meta.url);
    const result = spawnSync(process.execPath, [builder.pathname,
      '--source', '/not-an-existing-bodyparts3d-source', '--release', '3.0'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--release 3.0 is not approved');
    expect(result.stderr).toContain('share-alike licensing');
    // It must reject from argument parsing, before trying to open the source path.
    expect(result.stderr).not.toContain('not a folder');
  });

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
    for (const section of ['README_e.html, Release 4.0', '../README_e.html, Release 4.0', 'custom_parts_list_e.txt, Release 4.0', 'parts_list_e.txt, Release 4.0']) {
      expect(() => partsListCitationUrl(latest, section)).toThrow('unrecognized BodyParts3D');
    }
    expect(() => partsListCitationUrl('http://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html', 'isa_parts_list_e.txt, Release 4.0'))
      .toThrow('HTTPS');
  });

  it('rejects lookalike hosts, unapproved archive paths and mismatched release claims', () => {
    const section = 'partof_parts_list_e.txt, Release 4.0';
    for (const url of [
      'https://evil.example/data/bodyparts3d/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp.evil.example/data/bodyparts3d/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/../20110915/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/../LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/./README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/%52EADME_e.html',
      'https://user@dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp:8443/data/bodyparts3d/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html?download=1',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html#section',
      'not-a-url',
    ]) {
      expect(() => partsListCitationUrl(url, section), url).toThrow('official HTTPS BodyParts3D');
    }
    expect(() => partsListCitationUrl(
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
      'isa_parts_list_e.txt, Release 3.0 (2011-09-15)',
    )).toThrow('unrecognized BodyParts3D');
    expect(() => partsListCitationUrl(latest, 'parts_list_e.txt, Release 3.0'))
      .toThrow('official HTTPS BodyParts3D');
  });

  it('fails closed on Release 3.0 before generating models with the wrong rights metadata', () => {
    const builder = fileURLToPath(new URL('../../scripts/build-anatomy.mjs', import.meta.url));
    // The source path deliberately does not exist. Licensing must be rejected
    // during argument validation, before any input read or GLB write.
    const result = spawnSync(process.execPath, [
      builder, '--source', '/nonexistent-cueory-legacy-atlas', '--release', '3.0',
    ], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Release 3.0 generation is disabled');
    expect(result.stderr).toContain('historical source rights');
  });

  it('keeps the builder wired to direct table links for each structure', () => {
    const builder = readFileSync(new URL('../../scripts/build-anatomy.mjs', import.meta.url), 'utf8');
    expect(builder).toContain("import { partsListCitationUrl } from './anatomy-source-url.mjs';");
    expect(builder).toContain('url: partsListCitationUrl(release.url, release.partsSection(tree))');
    // The geometry-wide README citation remains on the README.
    expect(builder).toContain("section: release.readmeSection, url: release.url");
  });
});
