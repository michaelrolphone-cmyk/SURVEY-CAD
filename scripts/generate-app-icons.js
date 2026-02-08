import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { APP_CATALOG } from '../src/app-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function iconSvg({ name, glyph, color, accent }) {
  const safeName = name.replace(/&/g, '&amp;');
  const safeGlyph = glyph.replace(/&/g, '&amp;');
  return `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${safeName} icon">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="96" fill="url(#bg)" />
  <circle cx="256" cy="196" r="112" fill="${accent}" fill-opacity="0.95"/>
  <text x="256" y="214" text-anchor="middle" font-size="72" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${safeGlyph}</text>
  <text x="256" y="354" text-anchor="middle" font-size="36" font-family="Arial, sans-serif" font-weight="600" fill="#ffffff">${safeName}</text>
</svg>`.trimStart();
}

async function generateIcons() {
  for (const app of APP_CATALOG) {
    const outputPath = path.join(rootDir, app.iconPath.replace(/^\//, ''));
    await mkdir(path.dirname(outputPath), { recursive: true });

    const svg = iconSvg(app);
    await writeFile(outputPath, svg, 'utf8');
    console.log(`generated ${outputPath}`);
  }
}

generateIcons();
