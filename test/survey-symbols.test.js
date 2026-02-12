import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const symbolDir = path.join(rootDir, 'assets', 'survey-symbols');

const REQUIRED_SYMBOLS = [
  'property-pin.svg',
  'brass-cap.svg',
  'aluminum-cap.svg',
  'coper-cap.svg',
  'water-meter.svg',
  'gas-meter.svg',
  'sewer-manhole.svg',
  'power-pole.svg',
  'sign-single-post.svg',
  'control-point-triangle.svg'
];

test('survey symbol library includes expected core symbols', async () => {
  const files = (await readdir(symbolDir)).filter((name) => name.endsWith('.svg'));
  assert.ok(files.length >= 30, 'expected at least 30 symbol files');

  for (const symbolName of REQUIRED_SYMBOLS) {
    assert.equal(files.includes(symbolName), true, `missing ${symbolName}`);
  }
});

test('survey symbol svgs include structural accessibility tags', async () => {
  const files = (await readdir(symbolDir)).filter((name) => name.endsWith('.svg'));

  for (const symbolName of files) {
    const svg = await readFile(path.join(symbolDir, symbolName), 'utf8');
    assert.match(svg, /<svg[^>]*viewBox="0 0 100 100"/);
    assert.match(svg, /<title id="title">/);
    assert.match(svg, /<desc id="desc">/);
    assert.match(svg, /role="img"/);
  }
});


test('symbol index manifest references existing SVG files', async () => {
  const indexPath = path.join(symbolDir, 'index.json');
  const indexRaw = await readFile(indexPath, 'utf8');
  const manifest = JSON.parse(indexRaw);

  assert.equal(manifest.viewBox, '0 0 100 100');
  assert.ok(Array.isArray(manifest.symbols));
  assert.ok(manifest.symbols.length >= 30);

  for (const symbol of manifest.symbols) {
    assert.match(symbol.file, /\.svg$/);
    const svg = await readFile(path.join(symbolDir, symbol.file), 'utf8');
    assert.match(svg, /<svg/);
  }
});
