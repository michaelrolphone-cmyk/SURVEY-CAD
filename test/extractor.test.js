import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsBasisLabel,
  findBearings,
  parseBasisReference,
  pickBestNearBasis,
  scoreCandidate,
  buildTesseractEnv,
  selectOcrLanguage,
} from '../src/extractor.js';

test('containsBasisLabel detects basis text despite OCR noise', () => {
  assert.equal(containsBasisLabel('BASIS OF BEARING'), true);
  assert.equal(containsBasisLabel('BASIS OF BEARINGS'), true);
  assert.equal(containsBasisLabel('Random notes only'), false);
});

test('findBearings parses standard and compact quadrant bearings', () => {
  const text = 'Line 1 N 89°59\'59" E then N895959E for second line.';
  const hits = findBearings(text);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].bearing, 'N 89°59\'59" E');
  assert.equal(hits[1].bearing, 'N 89°59\'59" E');
});

test('parseBasisReference captures based on trail text', () => {
  const text = 'Basis of bearing is based on monument line between brass caps. Additional notes.';
  assert.equal(parseBasisReference(text), 'monument line between brass caps');
});

test('pickBestNearBasis chooses nearest bearing and following distance', () => {
  const text = 'N 00°00\'01" E 12.00 ft. BASIS OF BEARING N 89°59\'59" E 2640.00 ft based on centerline.';
  const parsed = pickBestNearBasis(text);
  assert.equal(parsed.bearing, 'N 89°59\'59" E');
  assert.equal(parsed.distance, 2640);
  assert.equal(parsed.unit, 'ft');
});

test('scoreCandidate prefers complete label hits', () => {
  const weak = scoreCandidate({ source: 'statement', bearing: null, distance: null, basis_reference: null, psm: 6, prep: 'fixed' });
  const strong = scoreCandidate({ source: 'label', bearing: 'N 01°00\'00" E', distance: 123, basis_reference: 'foo', psm: 11, prep: 'otsu' });
  assert.ok(strong > weak);
});

test('selectOcrLanguage prefers english, falls back, and reports missing tessdata', () => {
  assert.deepEqual(selectOcrLanguage(['eng', 'osd']), { lang: 'eng', warning: null });
  assert.deepEqual(selectOcrLanguage(['spa', 'osd']), {
    lang: 'spa',
    warning: 'Preferred OCR language "eng" is unavailable; using "spa" instead.',
  });
  assert.deepEqual(selectOcrLanguage([]), {
    lang: null,
    warning: 'Tesseract reported no OCR languages. Install tessdata (for example, eng.traineddata) or set TESSDATA_PREFIX.',
  });
});


test('buildTesseractEnv sets TESSDATA_PREFIX when provided', () => {
  assert.deepEqual(buildTesseractEnv({ PATH: '/usr/bin' }, null), { PATH: '/usr/bin' });
  assert.deepEqual(buildTesseractEnv({ PATH: '/usr/bin' }, '/app/.apt/usr/share/tesseract-ocr/5/tessdata'), {
    PATH: '/usr/bin',
    TESSDATA_PREFIX: '/app/.apt/usr/share/tesseract-ocr/5/tessdata',
  });
});
