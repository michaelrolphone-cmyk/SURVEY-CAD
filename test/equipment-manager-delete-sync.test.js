import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('EquipmentManager persists deletes to /api/equipment', async () => {
  const html = await readFile(new URL('../EquipmentManager.html', import.meta.url), 'utf8');

  assert.match(html, /async function\s+deleteEquipmentItemById\(id\)/, 'EquipmentManager should define a delete API helper');
  assert.match(html, /fetch\(`\$\{EQUIPMENT_API_URL\}\?id=\$\{encodeURIComponent\(id\)\}`,[\s\S]*method:\s*'DELETE'/, 'EquipmentManager should issue DELETE /api/equipment?id=... requests');
  assert.match(html, /deleteEquipmentItemById\(id\)\.catch\(/, 'single-item delete flow should attempt server deletion and handle failures');
  assert.match(html, /Promise\.all\(prevItems\.map\(\(item\) => deleteEquipmentItemById\(item\.id\)\)\)/, 'clear-all flow should delete each server-side equipment record');
});
