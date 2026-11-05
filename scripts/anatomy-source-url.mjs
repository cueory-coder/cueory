/** Cite the exact official BodyParts3D parts table used for structure names. */
export function partsListCitationUrl(readmeUrl, partsSection) {
  const match = /^((?:partof_|isa_)?parts_list_e\.txt), Release (3\.0(?: \(2011-09-15\))?|4\.0)$/.exec(partsSection);
  if (!match || (match[2] === '4.0' ? match[1] === 'parts_list_e.txt' : match[1] !== 'parts_list_e.txt')) {
    throw new Error('unrecognized BodyParts3D parts-list section');
  }

  // URL() silently normalizes /../ and /./ back into a canonical path.
  const rawAddress = typeof readmeUrl === 'string' ? readmeUrl.split(/[?#]/, 1)[0] : '';
  if (/[\\/]\.{1,2}(?:[\\/]|$)/.test(rawAddress)) {
    throw new Error('expected an official HTTPS BodyParts3D README source address');
  }

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
