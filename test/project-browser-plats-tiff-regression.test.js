import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PROJECT_BROWSER maps plat export format from plat URLs and keeps optional generated PDFs', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /const\s+platExtMatch\s*=\s*platUrl\.match\(/,
    'Project Browser should derive plat export formats from the underlying plat URL extension rather than hard-coding PDFs.',
  );
  assert.match(
    html,
    /const\s+exportFormat\s*=\s*platPdfUrl\s*\?\s*'pdf'\s*:\s*\(platExt\s*\|\|\s*'pdf'\);/,
    'Project Browser should force PDF export format whenever a generated plat PDF URL is available.',
  );
  assert.match(
    html,
    /const\s+platPdfUrl\s*=\s*String\(plat\.platPdfUrl\s*\|\|\s*plat\.pdfUrl\s*\|\|\s*plat\?\.metadata\?\.plat\?\.platPdfUrl\s*\|\|\s*generatedPlatPdfUrl\s*\|\|\s*''\)\.trim\(\);/,
    'Project Browser should preserve API-provided plat PDF URLs and derive one from subdivision doc IDs when available.',
  );
  assert.match(
    html,
    /const\s+resolvedPlatValue\s*=\s*platPdfUrl\s*\|\|\s*platUrl\s*\|\|\s*subdivisionName\s*\|\|\s*'';/,
    'Project Browser should prioritize generated plat PDFs when users open EvidenceDesk subdivision plat files.',
  );
});

test('PROJECT_BROWSER opens and thumbnails external plat TIFF links correctly', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /entry\?\.reference\?\.type\s*!==\s*'server-upload'[\s\S]*entry\?\.reference\?\.type\s*!==\s*'external'/,
    'Image thumbnail attachment should support external plat links in addition to server uploads and ROS images.',
  );
  assert.match(
    html,
    /if \(entry\?\.reference\?\.type === 'external'\) \{[\s\S]*if \(entry\?\.exportFormat === 'pdf'\) \{[\s\S]*window\.open\(downloadUrl, '_blank', 'noopener,noreferrer'\);/,
    'Opening an external plat should route PDFs through the PDF viewer and open TIFF/image links directly in a new tab.',
  );
  assert.match(
    html,
    /const\s+isLinkedFile\s*=\s*\(entry\?\.reference\?\.type\s*===\s*'server-upload'\s*\|\|\s*entry\?\.reference\?\.type\s*===\s*'external'\)/,
    'Row open actions should treat external plat links as clickable linked files.',
  );
});
