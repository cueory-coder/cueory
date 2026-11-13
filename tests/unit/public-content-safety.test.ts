import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Kind = 'sample' | 'placeholder' | 'documentation' | 'empty-sentinel' |
  'curriculum-metadata' | 'visual-source-metadata' | 'empty-video-placeholder';
type PublicFile = { kind: Kind; sha256: string };

// Public corpus at staging 1de038ad. These fingerprints deliberately cover ALL bytes,
// including unknown/nested fields, CSV cells and prose, rather than guessing whether
// a sentence is clinical or whether an answer is real. A sample label alone must
// never authorize a new payload. Review changed content before updating this list;
// do not regenerate fingerprints just to make a failure pass.
// Curriculum outlines and sourced visual manifests are public metadata, not lessons.
const publicFiles: Record<string, PublicFile> = {
  'README.md': { kind: 'documentation', sha256: '4f65826da2b27c742f2ed14621942d2a49ea2a8e2fd12afb5810ae1011acee30' },
  'batches/.gitkeep': { kind: 'empty-sentinel', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  'breaks/ideas.json': { kind: 'sample', sha256: '106106dbc858aeb88c24540a9693f4709aa3f8fa646d44899414f54c3d95175e' },
  'cards/study-skills-01.json': { kind: 'placeholder', sha256: 'b418d781233bba743de42ef9aea130ce19cea87fabad5108a20915051a9d373f' },
  'curriculum/blocks-v4.csv': { kind: 'curriculum-metadata', sha256: 'e79f28456e35c5647f60d0e622d34b64c6c3d48d08a85edcb73590f50af1c33c' },
  'curriculum/objectives-pilot-v4.csv': { kind: 'curriculum-metadata', sha256: '7c138dc51f6d7fe4322880bcd4cceb1e5ecfa61c5413cb0671abca0f653cc54b' },
  'fill-in/study-skills-01.json': { kind: 'sample', sha256: '320de7b0406a7435a3fed0930cf24401c68068fe76ed123998a72b7524c7e197' },
  'games/cueword/sample-01.json': { kind: 'sample', sha256: 'aa135ae100c35acee664a27bdf57c45c46392af2044628c402b3e560a3f7534b' },
  'games/cueword/sample-02.json': { kind: 'sample', sha256: '3e4e71fe4bf23cfdb23391de241eac058f2d1f885a8f9f2fd0ead7ac0831d9dc' },
  'games/cueword/sample-03.json': { kind: 'sample', sha256: 'fa68b04f72ac96d6c69ec4f4026da1e58324c321b713cc049dc233a6d8275268' },
  'games/cueword/sample-04.json': { kind: 'sample', sha256: '409eb85025a4748e62c5efe1e604941d361934e0b9813b8c521a38655242fcf7' },
  'games/cueword/sample-05.json': { kind: 'sample', sha256: 'd2553b800a2b6de47cb2076cabed94410fbbc77275d151215447900a45fea21e' },
  'games/cueword/sample-06.json': { kind: 'sample', sha256: '59ae54e2d4f0444ade97715a2bda375490130aa0a12a74d309c4e1d52dcf1355' },
  'games/cueword/sample-07.json': { kind: 'sample', sha256: '58032ac93801d1ba0a8337ce7a2c0c3d2e640de6f03c86ee90ab61422c919bdf' },
  'games/cueword/sample-08.json': { kind: 'sample', sha256: '6a9683f2bac1d25dc6283df76c4715e5e0bb4b27640cb7b0acf048288a64b354' },
  'games/cueword/sample-09.json': { kind: 'sample', sha256: '8cfb5f2844b090662fdf265e8b8ae42d8f3fc453a6cb76ef19decc274b433c05' },
  'games/hello-cards/starters.json': { kind: 'sample', sha256: '5dfe66be34dd395862022207a05e99258493b748495d77827d93f2ad8a70dae1' },
  'games/pulse/sample-01.json': { kind: 'sample', sha256: '21fe48be95247ade6abab397b393567a9d0b26dea723f7b6d9ad21147eaeda77' },
  'games/pulse/sample-02.json': { kind: 'sample', sha256: '34369f20c72fad6ebe79399702a5e8d676bcff414ebd68c10362c4040cd0d230' },
  'games/pulse/sample-03.json': { kind: 'sample', sha256: 'fec5c5e34138ebff7adf0c7df46f44aad3cd4cd5b358770192c2d2e76cd00059' },
  'games/pulse/sample-04.json': { kind: 'sample', sha256: 'e909a56bd2b7c88e06c5a934dff2a300ffdca2f8fb8be5af4981ba5880dec938' },
  'games/pulse/sample-05.json': { kind: 'sample', sha256: '280fbb551f387c3e8591547d2ac47cbd256b1e9fb4b2547d90ffa5988f7463ec' },
  'games/pulse/sample-06.json': { kind: 'sample', sha256: '39ebc95e0b2753fd20d1675adf3e8cb6c565bfcc108cb6064f9c82e7037dc129' },
  'games/pulse/sample-07.json': { kind: 'sample', sha256: '27c95b532b34f9299f7f5fd971eeca158bb37943cd3cebd0541723dc37a07ab6' },
  'games/pulse/sample-08.json': { kind: 'sample', sha256: 'e3022c1e7db3a03baf445060176d269c0aaf83d162273c81835e73cd5e47e181' },
  'games/pulse/sample-09.json': { kind: 'sample', sha256: 'b9dcf8d7ce165c64b54ac972a20c8b340e6f3d132416580e91d2c14ffb189d22' },
  'games/pulse/sample-10.json': { kind: 'sample', sha256: '461533e04c2843da7d6af15b0ee46408775feefb6b9b38ebd27ba98ee718c357' },
  'games/stat/sample.json': { kind: 'sample', sha256: '8e03334f92ce1e4827378f6f99c82b40f36e16a5db68259f84c378d442286c7c' },
  'games/suture/sample-01.json': { kind: 'sample', sha256: 'd56189466a526e5bdbacb4baa14ac58b6ab434dc7d2d368fdf3a698f335eafb8' },
  'games/suture/sample-02.json': { kind: 'sample', sha256: 'a77709a6849694babeabf71141d7c3ba3c5bdbea608fa94339eda3b1a630502b' },
  'games/suture/sample-03.json': { kind: 'sample', sha256: '8dfc11ad5d7ab660c5affb04d8c0b3347c77c7ceeddd5980db21b703b42cd189' },
  'games/suture/sample-04.json': { kind: 'sample', sha256: 'f3a1e4f67ff6bd03a480ecf29be55a6ea168d5b15d396da349d16fe4176e2da0' },
  'games/suture/sample-05.json': { kind: 'sample', sha256: '265d89961358cfd9ae2442d8dd168dd6518a5871941d6455caa90d1be4c346c5' },
  'games/triage/sample-01.json': { kind: 'sample', sha256: '6ca5563813b09625f10696830eca0139f852b362a150baaf3013caf4788acd94' },
  'games/triage/sample-02.json': { kind: 'sample', sha256: '8267d2eb64dda945efb5da0e51670323326f1d4b756c6822adbe66496564e801' },
  'games/triage/sample-03.json': { kind: 'sample', sha256: 'db4518b97bd15f6806d7d409c925811cecda3ed3478485bb20113b1e95a6dcf2' },
  'games/triage/sample-04.json': { kind: 'sample', sha256: '9de73bd5619c0cfbbaa80a1da34b4f70d994f336330797a4bb786951a6e2aa0b' },
  'games/triage/sample-05.json': { kind: 'sample', sha256: 'db3050ded57a4c4b7d53ec0e5389c0964c04ef58ea9186df91638098e2ddfc44' },
  'games/triage/sample-06.json': { kind: 'sample', sha256: 'aec1ead0e0efa4065f2ad71db9630164cedd633dcd478188a9fb2c6b34695e26' },
  'games/triage/sample-07.json': { kind: 'sample', sha256: 'f8a943ea37ae9494ba3bf1815c0158d7ed6dbf18a9011697c47040cc8215fbb5' },
  'label-it/study-skills-01.json': { kind: 'sample', sha256: '380109a1c13c28116d9f0cc58a2bbf42a1c8279d93500f84d6c0183eaa6b59f9' },
  'lessons/study-skills-01.json': { kind: 'placeholder', sha256: '9eff10936cdd78a2686350bc9e364c7eaab818d2d4da12c1c90afb3e1057bc03' },
  'organizer/study-skills-01.json': { kind: 'sample', sha256: 'fc9c698f5fa9461d52a5ad7cde7183aa00d50a9153197b83d86114916bf7823d' },
  'questions/study-skills-01.json': { kind: 'sample', sha256: 'cdb586ab4efc4fc1ef2b6e69f2c3e92b09e7f8aad797c3ae6361260d2f7618d0' },
  'videos/study-skills-01.json': { kind: 'empty-video-placeholder', sha256: 'e0fd38ba0b7f69bac7e1c33fa2e2cb260eb22cad1e2e6dd1a9b31d602ee03969' },
  'visuals/anatomy-digestive.json': { kind: 'visual-source-metadata', sha256: 'aab9102a096f6660ba7c7b3bb8d7fe7ca66a7db226284614f18c6017b788856a' },
  'visuals/anatomy-heart.json': { kind: 'visual-source-metadata', sha256: 'e765f7d4265bb1e96d0a2d012beb0ca7bdc4e25f6fd2caa2576d7eb3f57205c8' },
  'visuals/anatomy-kidneys.json': { kind: 'visual-source-metadata', sha256: 'f83cdd282a34cba4eaf6f4444ce1342b0a56f59ca12f45f8d3563b92c20ad67c' },
  'visuals/anatomy-lungs.json': { kind: 'visual-source-metadata', sha256: '2c2e38a20fa6b7db0f4a140da7361cff2c5d5f2e6e85a364dbe43bbbdc9e2c51' },
  'visuals/anatomy-muscle.json': { kind: 'visual-source-metadata', sha256: 'e5194edfe155cbfff700cc3e12681db36056a3bead33897ff28823ed4a3f92d8' },
  'visuals/anatomy-nerves.json': { kind: 'visual-source-metadata', sha256: '005240de1eb40d8f1f12858776d46c149fc822f60bdc015fe3de683bc78a9d03' },
  'visuals/anatomy-nervous.json': { kind: 'visual-source-metadata', sha256: '8f88a8923db117abc92f2f8f8dd6418cdcd42cc7491b0616c16da1e5573b519f' },
  'visuals/anatomy-skeleton-axial.json': { kind: 'visual-source-metadata', sha256: '06520f0e922ee29a692634be158f31b15a316cc3af418512be3f27233f7a345b' },
  'visuals/anatomy-skeleton-limbs.json': { kind: 'visual-source-metadata', sha256: '16092a3221f6054bfabb8efe4494a6a0a61af480370ed9df458255fe801e5efa' },
  'visuals/anatomy-skin.json': { kind: 'visual-source-metadata', sha256: 'fd7213ce255eb4e28b7946cf5787d369dcf99af614663de8ba5123463860dfce' },
  'visuals/anatomy-vessels.json': { kind: 'visual-source-metadata', sha256: '3b0a9bbf9eaa71dc163c7112a570751b4483a6a15e22bcb2593cb521261bfa9a' },
  'visuals/fluid-compartments.json': { kind: 'visual-source-metadata', sha256: '2eae0645afe44a8a615704280bea45d3936e9d2af0056e769de92df7ebf774be' },
  'visuals/osmosis-fluid-shifts.json': { kind: 'visual-source-metadata', sha256: '4f8d84befcfcd5eb49502f5924525402fc175d119587769b378073309d026aa2' },
  'visuals/sodium-potassium-pump.json': { kind: 'visual-source-metadata', sha256: 'fb11c2fbf2b72d9dfada6c14537eb478ee86fd12cb529283a6a99c7007915ec3' },
};

function fingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function inspectFile(path: string, bytes: Buffer, inventory = publicFiles): string[] {
  if (!Object.hasOwn(inventory, path)) return [`${path}: unreviewed public content file`];
  const expected = inventory[path];
  // Never echo content in failures: an accidental private payload must not reach logs.
  const findings = fingerprint(bytes) === expected.sha256 ? [] : [`${path}: public content changed; review required`];
  if (expected.kind === 'empty-sentinel') {
    if (bytes.length !== 0) findings.push(`${path}: batch sentinel must stay empty`);
    return findings;
  }
  if (!path.endsWith('.json')) return findings;
  let record: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    record = parsed as Record<string, unknown>;
  } catch {
    return [...findings, `${path}: valid JSON object required`];
  }
  if (expected.kind === 'sample' && !(record.status === 'sample' || (record.status === undefined && record.sample === true))) {
    findings.push(`${path}: explicit sample label required`);
  }
  if (expected.kind === 'placeholder' && record.status !== 'placeholder') {
    findings.push(`${path}: placeholder label required`);
  }
  if (/^(lessons|cards)\//.test(path) && ['draft', 'in_review'].includes(String(record.status))) {
    findings.push(`${path}: unreleased instructional content must stay private`);
  }
  if (path.startsWith('questions/')) {
    if (!Array.isArray(record.items) || record.items.some(item => !item || typeof item !== 'object' || item.status !== 'sample')) {
      findings.push(`${path}: every question must carry its own sample label`);
    }
  }
  if (expected.kind === 'empty-video-placeholder' && !(record.status === 'placeholder' && record.videoId === 'xxxxxxxxxxx' && record.captionsUrl === '' && record.transcriptUrl === '')) {
    findings.push(`${path}: video placeholder must remain empty`);
  }
  return findings;
}

function filesUnder(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`${path}: content symlinks are not allowed`);
    if (entry.isDirectory()) return filesUnder(join(directory, entry.name), `${path}/`);
    if (!entry.isFile()) throw new Error(`${path}: unsupported content entry`);
    return [path];
  }).sort();
}

const contentRoot = join(process.cwd(), 'content');
describe('public content safety boundary', () => {
  it('inventories every content file, including CSV, prose, hidden files and batches', () => {
    expect(filesUnder(contentRoot)).toEqual(Object.keys(publicFiles).sort());
  });
  for (const path of Object.keys(publicFiles)) {
    it(`keeps ${path} within its reviewed public payload and label`, () => {
      expect(inspectFile(path, readFileSync(join(contentRoot, path)))).toEqual([]);
    });
  }

  const fixture = Buffer.from(JSON.stringify({ status: 'sample', items: [{ status: 'sample', key: ['A'], rationales: { A: 'Everyday sample only.' } }] }));
  const fixtureInventory: Record<string, PublicFile> = { 'questions/example.json': { kind: 'sample', sha256: fingerprint(fixture) } };
  it('accepts the exact labeled synthetic sample', () => {
    expect(inspectFile('questions/example.json', fixture, fixtureInventory)).toEqual([]);
  });
  it.each([
    { status: 'sample', metadata: { answer_key: ['synthetic-only'] } },
    { status: 'sample', items: [{ status: 'sample', key: ['B'], rationales: { B: 'Changed synthetic explanation.' } }] },
    { status: 'sample', items: [{ status: 'published', key: ['A'] }] },
    { status: 'published', items: [] },
    { items: [] },
  ])('rejects replaced payloads even when the outer label says sample (%#)', value => {
    expect(inspectFile('questions/example.json', Buffer.from(JSON.stringify(value)), fixtureInventory).length).toBeGreaterThan(0);
  });
  it.each(['questions/new.json', 'lessons/new.json', 'curriculum/new.csv', 'batches/private.json', '.hidden', 'payload.bin', '__proto__'])('rejects uninventoried files of every type: %s', path => {
    expect(inspectFile(path, Buffer.from('synthetic payload'))).toEqual([`${path}: unreviewed public content file`]);
  });
  it.each(['draft', 'in_review'])('rejects unreleased lessons even if a fingerprint is mistakenly refreshed: %s', status => {
    const bytes = Buffer.from(JSON.stringify({ status, sentences: [] }));
    const inventory: Record<string, PublicFile> = { 'lessons/example.json': { kind: 'placeholder', sha256: fingerprint(bytes) } };
    expect(inspectFile('lessons/example.json', bytes, inventory)).toContain('lessons/example.json: unreleased instructional content must stay private');
  });
  it('rejects CSV cell edits without parsing away quoted fields or multiline payloads', () => {
    const path = 'curriculum/example.csv';
    const bytes = Buffer.from('id,note\nexample,"public outline"\n');
    const inventory: Record<string, PublicFile> = { [path]: { kind: 'curriculum-metadata', sha256: fingerprint(bytes) } };
    expect(inspectFile(path, bytes, inventory)).toEqual([]);
    expect(inspectFile(path, Buffer.from('id,note\nexample,"synthetic answer\nsynthetic rationale"\n'), inventory)).toHaveLength(1);
  });
  it('reports paths and reasons without leaking malformed or changed payloads', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    const findings = inspectFile('questions/example.json', Buffer.from(marker), fixtureInventory);
    expect(findings).toHaveLength(2);
    expect(findings.join(' ')).not.toContain(marker);
  });
  it('does not let private batch data hide inside the tracked sentinel', () => {
    expect(inspectFile('batches/.gitkeep', Buffer.from('synthetic payload'))).toHaveLength(2);
  });
});
