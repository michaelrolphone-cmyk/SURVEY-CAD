import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFldConfig, serializeFldConfig } from '../src/fld-config.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function loadFixture() {
  return readFileSync(`${repoRoot}/config/MLS.fld`, 'utf8');
}

test('parseFldConfig parses version tag, columns, and rules', () => {
  const parsed = parseFldConfig(loadFixture());

  assert.equal(parsed.versionTag, '2010V');
  assert.ok(parsed.columns.length >= 205);
  assert.equal(parsed.rules.length, 105);
  assert.ok(parsed.rulesByCode.CPAD);
  assert.equal(parsed.rulesByCode.CPAD.layer, 'EX_CONC');
  assert.equal(parsed.rulesByCode.CPAD.entityType, '2');
  assert.equal(parsed.rulesByCode.CPAD.processingOn, true);
});

test('parseFldConfig keeps raw columns and captures code sequence', () => {
  const parsed = parseFldConfig(loadFixture());
  const elecRule = parsed.rulesByCode.ELEC;

  assert.deepEqual(elecRule.codeSequence, []);
  assert.equal(elecRule.raw.code, 'ELEC');
  assert.equal(elecRule.raw.description, 'ELEC');
  assert.equal(elecRule.raw.processing_on, '1');
  assert.ok(Object.hasOwn(elecRule.raw, 'allow_annotative'));
});

test('parseFldConfig creates unique keys for duplicate column names', () => {
  const parsed = parseFldConfig(loadFixture());
  const duplicateKeys = parsed.columns
    .map((column) => column.key)
    .filter((key) => key.startsWith('distinct_pt_layer'));

  assert.equal(duplicateKeys.length, 2);
  assert.deepEqual(duplicateKeys, ['distinct_pt_layer', 'distinct_pt_layer_2']);
});

test('parseFldConfig captures companion codes for linework-only sequencing', () => {
  const parsed = parseFldConfig(loadFixture());
  const waterLineRule = parsed.rulesByCode.WL;
  const waterMeterRule = parsed.rulesByCode.WM;

  assert.ok(waterLineRule);
  assert.deepEqual(waterLineRule.companionCodes, ['FH', 'WV', 'WM']);
  assert.equal(waterLineRule.entityType, '2');

  assert.ok(waterMeterRule);
  assert.equal(waterMeterRule.entityType, '0');
  assert.deepEqual(waterMeterRule.companionCodes, []);
});

test('serializeFldConfig round-trips parsed FLD data while keeping unknown columns', () => {
  const parsed = parseFldConfig(loadFixture());
  const serialized = serializeFldConfig(parsed);
  const reparsed = parseFldConfig(serialized);

  assert.equal(reparsed.versionTag, parsed.versionTag);
  assert.equal(reparsed.columns.length, parsed.columns.length);
  assert.equal(reparsed.rules.length, parsed.rules.length);
  assert.equal(reparsed.rulesByCode.CPAD.raw.allow_annotative, parsed.rulesByCode.CPAD.raw.allow_annotative);
  assert.equal(reparsed.rulesByCode.WL.raw.companion_codes, parsed.rulesByCode.WL.raw.companion_codes);
});

test('serializeFldConfig preserves newly-added rules with template fields', () => {
  const parsed = parseFldConfig(loadFixture());
  const template = parsed.rules[0].raw;
  const newRaw = {};
  for (const column of parsed.columns) newRaw[column.key] = template[column.key] ?? '';
  newRaw.code = 'ZZTOP';
  newRaw.description = 'ZZTOP';
  newRaw.full_name = 'ZZTOP';
  newRaw.layer = 'EX_TEST';
  newRaw.entity_type = '2';
  newRaw.processing_on = '1';
  newRaw.companion_codes = 'AA,BB';
  parsed.rules.push({ rowNumber: parsed.rules.length + 2, code: 'ZZTOP', raw: newRaw });

  const serialized = serializeFldConfig(parsed);
  const reparsed = parseFldConfig(serialized);
  assert.ok(reparsed.rulesByCode.ZZTOP);
  assert.equal(reparsed.rulesByCode.ZZTOP.raw.allow_annotative, template.allow_annotative);
  assert.equal(reparsed.rulesByCode.ZZTOP.raw.companion_codes, 'AA,BB');
});
