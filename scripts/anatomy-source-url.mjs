/** Cite the exact official BodyParts3D parts table used for structure names. */
export function partsListCitationUrl(readmeUrl, partsSection) {
  const match = /^((?:partof_|isa_)?parts_list_e\.txt), Release (3\.0|4\.0)(?:\b|$)/.exec(partsSection);
  if (!match) throw new Error('unrecognized BodyParts3D parts-list section');

  let readme;
  try { readme = new URL(readmeUrl); }
  catch { throw new Error('expected an official HTTPS BodyParts3D README source address'); }

  const expectedPath = match[2] === '4.0'
    ? '/data/bodyparts3d/LATEST/README_e.html'
    : '/data/bodyparts3d/20110915/README_e.html';
  if (readme.protocol !== 'https:' ||
      readme.hostname !== 'dbarchive.biosciencedbc.jp' ||
      readme.port || readme.username || readme.password ||
      readme.pathname !== expectedPath || readme.search || readme.hash ||
      // Reject encoded path bytes rather than letting another consumer reinterpret them.
      /%/.test(readmeUrl)) {
    throw new Error('expected an official HTTPS BodyParts3D README source address');
  }
  return new URL(match[1], readme).href;
}
