// Generate app + tray icons from the brand logo (public/icon.jpg).
//
// Two different jobs, two different sources:
//   • App / window / dock / packaging → the FULL logo, as a crisp multi-size PNG
//     (build/icon.png). Looks great at 32px+.
//   • Tray icon (~16–24px) → a SIMPLIFIED, bold, high-contrast mortar-&-pestle
//     MARK. The full logo — even the text-free photo emblem — is thin cream
//     line-art on terracotta; at tray size the low contrast + fine detail turn
//     to mush no matter how it's scaled. A bold vector mark stays legible.
//
// Tray sizing is also platform-specific (see src/main/tray.ts):
//   • Windows: exact small sizes + HiDPI scale-factor variants (@1.25x/@1.5x/@2x).
//   • Linux (GTK/AppIndicator, e.g. Cinnamon): one LARGE png the panel downscales.
//   • macOS: a monochrome TEMPLATE image the menu bar renders + recolors.
//
// Run: npm run icons   (sharp is a devDependency)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const OUT = 'build';
const BG = '#823818'; // sampled logo background (terracotta)
const CREAM = '#f2e4d8';

await mkdir(OUT, { recursive: true });

// Full logo → PNG for window / dock / packaging.
await sharp('public/icon.jpg').resize(512, 512, { kernel: 'lanczos3' }).png().toFile(`${OUT}/icon.png`);

// Simplified mark — rounded terracotta tile + bold cream mortar & pestle.
const tileSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 100 100">
  <rect x="4" y="4" width="92" height="92" rx="20" fill="${BG}"/>
  <g fill="none" stroke="${CREAM}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <line x1="55" y1="58" x2="74" y2="32"/>
    <path d="M26 55 Q50 47 74 55"/>
    <path d="M28 56 Q31 82 50 82 Q69 82 72 56"/>
  </g>
  <circle cx="75" cy="31" r="3.5" fill="${CREAM}"/>
</svg>`;

// Monochrome glyph (mark only, black) → macOS template image.
const glyphSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 100 100">
  <g fill="none" stroke="#000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <line x1="55" y1="58" x2="74" y2="32"/>
    <path d="M26 55 Q50 47 74 55"/>
    <path d="M28 56 Q31 82 50 82 Q69 82 72 56"/>
  </g>
  <circle cx="75" cy="31" r="4" fill="#000"/>
</svg>`;

const tile = (n) => sharp(Buffer.from(tileSvg)).resize(n, n, { kernel: 'lanczos3' }).png();
const tmpl = (n) => sharp(Buffer.from(glyphSvg)).resize(n, n, { kernel: 'lanczos3' }).png();

// Windows / generic tray: exact size + DPI variants.
await (await tile(16)).toFile(`${OUT}/tray.png`);
await (await tile(20)).toFile(`${OUT}/tray@1.25x.png`);
await (await tile(24)).toFile(`${OUT}/tray@1.5x.png`);
await (await tile(32)).toFile(`${OUT}/tray@2x.png`);
// Linux tray: large source the panel downscales cleanly.
await (await tile(256)).toFile(`${OUT}/tray-large.png`);
// macOS tray template.
await (await tmpl(16)).toFile(`${OUT}/trayTemplate.png`);
await (await tmpl(32)).toFile(`${OUT}/trayTemplate@2x.png`);

// The MARK is also the window/taskbar icon on Linux/Windows, where that icon
// renders small (~24–48px) and the full logo would be as blurry as the tray was.
// (macOS uses the full logo for its large dock icon — see index.ts.)
await (await tile(512)).toFile(`${OUT}/mark.png`);
// A copy the renderer can serve for the in-app header (public/ → '/').
await (await tile(64)).toFile('public/mark.png');

console.log('icons written to', OUT + '/  (+ public/mark.png)');
