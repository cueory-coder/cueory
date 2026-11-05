/** Cite the exact BodyParts3D parts table used for structure names, not the overview README. */
export function partsListCitationUrl(readmeUrl, partsSection) {
  const match = /^((?:partof_|isa_)?parts_list_e\.txt), Release (?:3\.0|4\.0)(?:\b|$)/.exec(partsSection);
  if (!match) throw new Error('unrecognized BodyParts3D parts-list section');
  const readme = new URL(readmeUrl);
  if (readme.protocol !== 'https:' || readme.username || readme.password || readme.pathname.split('/').at(-1) !== 'README_e.html') {
    throw new Error('expected an official HTTPS BodyParts3D README source address');
  }
  return new URL(match[1], readme).href;
}
