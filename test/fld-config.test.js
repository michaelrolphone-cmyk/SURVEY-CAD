import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFldConfig } from '../src/fld-config.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function loadFixture() {
  return readFileSync(`${repoRoot}/config/MLS.fld`, 'utf8');
}

test('parseFldConfig parses version tag, columns, and rules', () => {
  const parsed = parseFldConfig(loadFixture());

  assert.equal(parsed.versionTag, '2010V');
  assert.ok(parsed.columns.length >= 205);
  assert.equal(parsed.rules.length, 103);
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
