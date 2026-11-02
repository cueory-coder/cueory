/**
 * Builds the website copies of Christian's brand v1.0 logo artwork (DECISIONS.md, D-55).
 *
 * The source of truth is the PNG artwork in brand-source/v1.0/ (brand guide §2). This script never redraws, traces
 * or retypes the logo. For each logo it:
 *   1. reads an opaque source file: Espresso on Ivory for the Daytime palette, Ivory on Charcoal for the Evening one;
 *   2. works out how much ink covers each pixel, by placing the pixel's color on the line from the background color
 *      to the ink color, which keeps the artwork's own smooth edges;
 *   3. writes the ink in exactly one brand color with that coverage as its transparency, so the logo sits on the silk
 *      or any background without a box around it, and the cruet's empty top half stays empty (guide §4.1);
 *   4. crops to the visible artwork (guide §3.5: scale from the visible bounding box) and saves a few widths.
 * It also writes browser and app icons (the emblem on Ivory) and brand-source/v1.0/manifest.json, which records
 * where every file came from with checksums (guide §2.3). tests/unit/brand.test.ts checks all of it.
 *
 * Run from the repository root (sharp comes with Astro):
 *   node scripts/build-brand-v1.mjs           writes public/brand/v1/ and the manifest
 *   node scripts/build-brand-v1.mjs --check   only reports sizes and compares the Daytime and Evening artwork
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SOURCE_DIR = 'brand-source/v1.0';
const OUT_DIR = 'public/brand/v1';
const EXPORTED = '2026-11-01';

/** The three logo colors (guide §4.1). Partly blended edge pixels are normal anti-aliasing, not new colors. */
const COLORS = {
  ivory: { hex: '#F9F5EF', rgb: [249, 245, 239] },
  espresso: { hex: '#3E2C23', rgb: [62, 44, 35] },
  charcoal: { hex: '#1C1917', rgb: [28, 25, 23] },
};

/** Daytime: Espresso ink on Ivory. Evening: Ivory ink on Charcoal (guide §4.1, exact pairings). */
const PAIRINGS = {
  light: { background: COLORS.ivory, ink: COLORS.espresso },
  dark: { background: COLORS.charcoal, ink: COLORS.ivory },
};

/**
 * The approved families the site uses (guide §3.4) and the widths we serve: they cover the sizes on the site at 1x to
 * 3x, and none is wider than the artwork in its source (the script stops if one would be: nothing is scaled up).
 */
const FAMILIES = [
  {
    name: 'logo-full',
    role: 'Primary full logo: the wordmark with the cruet',
    sources: { light: 'cueory_name_Light_logo.png', dark: 'cueory_name_dark_logo.png' },
    widths: [480, 960, 1440],
    // Same drawing in both files (about 96% overlap), but the dark file's edges are stair-stepped and the light
    // file's are smooth. Both palettes use the light file's drawing (only the color changes, guide §4.5).
    drawing: 'light',
  },
  {
    name: 'emblem',
    role: 'Compact emblem: the water-drop c with the cruet',
    sources: { light: 'cueory_letter_Light_logo.png', dark: 'cueory_letter_dark_logo.png' },
    widths: [96, 192, 384],
    // The dark file draws the emblem only 348 px wide; the light file draws the same emblem 1,824 px wide. Both
    // palettes use the light file's drawing (only the color changes, guide §4.5), so the icons stay sharp.
    drawing: 'light',
  },
  {
    name: 'cruet',
    role: 'The cruet alone: a small supporting mark, never the only identifier (pillo game mark, Task 138)',
    sources: { light: 'cueory_cruet_light_logo.png', dark: 'cueory_cruet_dark_logo.png' },
    // Its files draw it only about 135 px wide, so the widest copy stays under that. pillo shows it about 10 to 13 px
    // wide, so these cover 1x to 3x and more.
    widths: [32, 64, 128],
    // The two files are not the same drawing: the dark file draws the handle as one thick loop and stripes the neck
    // (about 74% overlap), while the light file matches the cruet in the approved emblem. Both palettes use the light
    // file's drawing (only the color changes, guide §4.5), and the script checks it against the emblem's cruet instead.
    drawing: 'light',
    sameAs: { file: 'cueory_letter_Light_logo.png', part: 'the cruet in the approved emblem (all but the c)' },
  },
];

/** Square icons: the Daytime emblem on Ivory, filling 72% of the height (browser tab, home screen, app stores). */
const ICON_SIZES = [32, 180, 192, 512];
const ICON_FILL = 0.72;

/** Every file Christian supplied for v1.0, with its role from the guide (§2.2). */
const SOURCE_ROLES = {
  'Cueory_Brand_Guide.md': 'Brand identity and implementation specification v1.0',
  'cueory_name_Light_logo.png': 'Primary full logo, light (opaque Ivory)',
  'cueory_name_dark_logo.png': 'Primary full logo, dark (opaque Charcoal)',
  'cueory_name_BW_logo.png': 'Full logo, monochrome source (transparent, black ink with a white cruet interior)',
  'cueory_letter_Light_logo.png': 'Compact emblem, light (opaque Ivory)',
  'cueory_letter_dark_logo.png': 'Compact emblem, dark (opaque Charcoal)',
  'cueory_letter_logo.png': 'Compact emblem, monochrome source (transparent)',
  'cueory_cruet_light_logo.png': 'Cruet, light (opaque Ivory)',
  'cueory_cruet_dark_logo.png': 'Cruet, dark (opaque Charcoal)',
  'cueory_cruet_BW_logo.png': 'Cruet, monochrome source (transparent)',
  'cueory-waterdrop-wordmark-transparent.png': 'Historical filename: actually the emblem, transparent color (use with caution)',
  'cueory_letter_logo_source.psd': 'Photoshop working file for the emblem (two layers: the c and the cruet)',
};

/**
 * Below this overlap the Daytime and Evening files are different drawings, so the script stops and asks Christian
 * (guide §2.1). Same drawings score 0.89 to 0.96 here (the small files lose a little along the thin cruet lines);
 * the Photoshop working file, whose cruet sits elsewhere, scores 0.65 to 0.70 against the approved emblem.
 */
const SAME_DRAWING = 0.85;

/** Coverage below LOW is background, above HIGH is solid ink; in between keeps the artwork's own edge. */
const LOW = 0.02;
const HIGH = 0.98;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/** How much ink covers each pixel of an opaque source, 0 to 1, from its pairing. */
async function coverage(file, pairing) {
  const { data, info } = await sharp(`${SOURCE_DIR}/${file}`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [br, bg, bb] = pairing.background.rgb;
  const [ir, ig, ib] = pairing.ink.rgb;
  const [dr, dg, db] = [ir - br, ig - bg, ib - bb];
  const length2 = dr * dr + dg * dg + db * db;
  const amount = new Float32Array(info.width * info.height);
  for (let i = 0, p = 0; p < amount.length; i += 3, p += 1) {
    const t = ((data[i] - br) * dr + (data[i + 1] - bg) * dg + (data[i + 2] - bb) * db) / length2;
    amount[p] = t <= LOW ? 0 : t >= HIGH ? 1 : (t - LOW) / (HIGH - LOW);
  }
  return { amount, width: info.width, height: info.height };
}

/** The visible artwork's box: every pixel with any ink. */
function boundingBox({ amount, width, height }) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (amount[y * width + x] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error('no artwork found');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** The emblem's cruet: its ink without the largest connected shape, which is the c. */
function withoutLargestShape(cover) {
  const { width, height, amount } = cover;
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const stack = [];
  for (let start = 0; start < amount.length; start += 1) {
    if (amount[start] <= 0 || label[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop();
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const q = yy * width + xx;
          if (amount[q] > 0 && label[q] < 0) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    sizes.push(size);
  }
  const largest = sizes.indexOf(Math.max(...sizes));
  return { ...cover, amount: amount.map((v, p) => (label[p] === largest ? 0 : v)) };
}

/** The ink as one brand color with coverage as transparency, cropped to the artwork, as a sharp image. */
function inkImage(cover, box, ink) {
  const pixels = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      const o = (y * box.width + x) * 4;
      pixels[o] = ink.rgb[0];
      pixels[o + 1] = ink.rgb[1];
      pixels[o + 2] = ink.rgb[2];
      pixels[o + 3] = Math.round(cover.amount[(box.top + y) * cover.width + box.left + x] * 255);
    }
  }
  return sharp(pixels, { raw: { width: box.width, height: box.height, channels: 4 } });
}

/** The ink at a new size as a PNG: resizing only changes transparency, never the color. */
async function inkPng(image, size, ink) {
  const { data, info } = await image
    .clone()
    .resize({ ...size, kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Resampling can nudge the color of nearly transparent edge pixels: put every pixel back to the exact ink.
  const [r, g, b] = ink.rgb;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return { png, width: info.width, height: info.height };
}

/** Writes the ink at a given width and returns what the manifest records. */
async function writeInk(image, width, path, ink) {
  const { png, height } = await inkPng(image, { width }, ink);
  writeFileSync(path, png);
  return { width, height, sha256: sha256(png) };
}

/**
 * How much of the ink two coverage maps share (1 = identical). The Daytime and Evening files of a family are the same
 * drawing, sometimes framed at a different scale on the canvas, so the larger artwork is scaled down to the smaller
 * one's size, then nudged up to 3 pixels either way to line them up. Thin strokes make this strict: a one-pixel
 * difference along the cruet's outline already costs a few percent.
 */
async function overlap(a, b) {
  const solidBox = (cover) => boundingBox({ ...cover, amount: cover.amount.map((v) => (v > 0.5 ? 1 : 0)) });
  const crop = (cover, box) => {
    const gray = Buffer.alloc(box.width * box.height);
    for (let y = 0; y < box.height; y += 1) {
      for (let x = 0; x < box.width; x += 1) {
        gray[y * box.width + x] = Math.round(cover.amount[(box.top + y) * cover.width + box.left + x] * 255);
      }
    }
    return sharp(gray, { raw: { width: box.width, height: box.height, channels: 1 } });
  };
  const boxA = solidBox(a);
  const boxB = solidBox(b);
  const [large, largeBox, small, smallBox] = boxA.width >= boxB.width ? [a, boxA, b, boxB] : [b, boxB, a, boxA];
  const { width, height } = smallBox;
  const ms = await crop(small, smallBox).toColourspace('b-w').raw().toBuffer();
  const ml = await crop(large, largeBox)
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  let best = 0;
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      let both = 0;
      let either = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const inS = ms[y * width + x] > 127;
          const yl = y + dy;
          const xl = x + dx;
          const inL = yl >= 0 && yl < height && xl >= 0 && xl < width && ml[yl * width + xl] > 127;
          if (inS && inL) both += 1;
          if (inS || inL) either += 1;
        }
      }
      best = Math.max(best, both / either);
    }
  }
  return best;
}

/** The coverage map a family's drawing comes from (both palettes use it when the family names one). */
const drawnFrom = (family, light, dark) => ((family.drawing ?? 'light') === 'light' ? light : dark);

const checkOnly = process.argv.includes('--check');
const manifest = {
  brand: 'cueory',
  revision: 'v1.0',
  guide: `${SOURCE_DIR}/Cueory_Brand_Guide.md`,
  exported: EXPORTED,
  approval:
    'Christian approved the v1.0 artwork on 2026-10-31. These web copies keep its geometry and exact colors; he checks them on the staging site.',
  method:
    'Ink coverage from an opaque source file, written in one exact brand color with coverage as transparency, cropped to the visible artwork. Nothing is traced, redrawn or retyped. Each family names the file its drawing comes from; the other palette file is checked to be the same drawing (overlap).',
  colors: Object.fromEntries(Object.entries(COLORS).map(([name, color]) => [name, color.hex])),
  sources: {},
  families: {},
  icons: {},
};

for (const [file, role] of Object.entries(SOURCE_ROLES)) {
  manifest.sources[file] = { role, sha256: sha256(readFileSync(`${SOURCE_DIR}/${file}`)) };
}

if (!checkOnly) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
}

let lightEmblem;
for (const family of FAMILIES) {
  const light = await coverage(family.sources.light, PAIRINGS.light);
  const dark = await coverage(family.sources.dark, PAIRINGS.dark);
  const lightBox = boundingBox(light);
  const darkBox = boundingBox(dark);
  const darkFile = await overlap(light, dark);
  // Usually the other palette's file is the check. A family with sameAs is checked against approved artwork instead.
  const reference = family.sameAs
    ? withoutLargestShape(await coverage(family.sameAs.file, PAIRINGS.light))
    : undefined;
  const same = reference ? await overlap(drawnFrom(family, light, dark), reference) : darkFile;
  const aspect = (box) => (box.width / box.height).toFixed(3);
  const touches = (box, cover) =>
    box.left === 0 || box.top === 0 || box.left + box.width === cover.width || box.top + box.height === cover.height;
  console.log(
    `${family.name}: light ${lightBox.width}x${lightBox.height} (aspect ${aspect(lightBox)}${touches(lightBox, light) ? ', TOUCHES EDGE' : ''}), ` +
      `dark ${darkBox.width}x${darkBox.height} (aspect ${aspect(darkBox)}${touches(darkBox, dark) ? ', TOUCHES EDGE' : ''}), ` +
      `same geometry ${(darkFile * 100).toFixed(1)}%` +
      (reference ? `; ${family.drawing} drawing vs ${family.sameAs.part}: ${(same * 100).toFixed(1)}%` : ''),
  );
  if (same < SAME_DRAWING) {
    throw new Error(`${family.name}: the Daytime and Evening files are different drawings; ask Christian (guide §2.1)`);
  }
  const drawn = (mode) => (family.drawing ?? mode) === 'light' ? { cover: light, box: lightBox } : { cover: dark, box: darkBox };
  for (const mode of ['light', 'dark']) {
    if (family.widths.some((width) => width > drawn(mode).box.width)) {
      throw new Error(`${family.name}: a ${mode} export would be wider than its source artwork`);
    }
  }
  if (checkOnly) continue;

  const entry = {
    role: family.role,
    sources: family.sources,
    drawing: family.drawing ? `both palettes from ${family.sources[family.drawing]}` : 'each palette from its own file',
    overlap: Number(same.toFixed(3)),
    ...(family.sameAs && {
      overlapWith: `${family.sameAs.part}, ${family.sameAs.file}`,
      darkFileOverlap: Number(darkFile.toFixed(3)),
    }),
    files: {},
  };
  for (const mode of ['light', 'dark']) {
    const { cover, box } = drawn(mode);
    const image = inkImage(cover, box, PAIRINGS[mode].ink);
    for (const width of family.widths) {
      const name = `${family.name}-${mode}-${width}.png`;
      const result = await writeInk(image, width, `${OUT_DIR}/${name}`, PAIRINGS[mode].ink);
      entry.files[name] = { mode, color: PAIRINGS[mode].ink.hex, ...result };
    }
  }
  manifest.families[family.name] = entry;
  if (family.name === 'emblem') lightEmblem = { cover: light, box: lightBox };
}

if (!checkOnly) {
  const emblem = inkImage(lightEmblem.cover, lightEmblem.box, COLORS.espresso);
  const ivory = { r: 249, g: 245, b: 239, alpha: 1 };
  for (const size of ICON_SIZES) {
    const { png: mark, width, height } = await inkPng(emblem, { height: Math.round(size * ICON_FILL) }, COLORS.espresso);
    const png = await sharp({ create: { width: size, height: size, channels: 4, background: ivory } })
      .composite([{ input: mark, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
      .flatten({ background: ivory })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const name = `icon-${size}.png`;
    writeFileSync(`${OUT_DIR}/${name}`, png);
    manifest.icons[name] = { from: 'emblem (Daytime)', background: COLORS.ivory.hex, width: size, height: size, sha256: sha256(png) };
  }
  writeFileSync(`${SOURCE_DIR}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${OUT_DIR}/ and ${SOURCE_DIR}/manifest.json`);
}
