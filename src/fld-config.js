import fs from 'node:fs/promises';

function toKey(label, index) {
  const cleaned = String(label || '').trim();
  if (!cleaned) return `column_${index + 1}`;
  const slug = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `column_${index + 1}`;
}

function ensureUniqueKeys(columns) {
  const used = new Map();
  return columns.map((column) => {
    const count = used.get(column.key) || 0;
    used.set(column.key, count + 1);
    if (!count) return column;
    return { ...column, key: `${column.key}_${count + 1}` };
  });
}

function normalizeHeader(rawHeaderLine) {
  const headerLine = String(rawHeaderLine || '').replace(/^#([^#]+)#\s*/, '');
  const labels = headerLine.split('|');
  return labels.map((name, index) => ({
    index,
    name: name.trim() || `Column ${index + 1}`,
    key: toKey(name, index),
  }));
}

function buildColumns(headerColumns, targetLength) {
  const columns = [...headerColumns];
  for (let i = columns.length; i < targetLength; i++) {
    columns.push({
      index: i,
      name: `Extra Column ${i + 1}`,
      key: `extra_column_${i + 1}`,
    });
  }
  return ensureUniqueKeys(columns);
}

function parseRuleRecord(columns, values, rowNumber) {
  const record = {};
  for (let i = 0; i < columns.length; i++) {
    const value = values[i] ?? '';
    record[columns[i].key] = value;
  }

  const codeSequence = [
    record.code1,
    record.code2,
    record.code3,
    record.code4,
    record.code5,
    record.code6,
    record.code7,
    record.code8,
    record.code9,
    record.code10,
    record.code11,
    record.code12,
  ].filter((code) => code && String(code).trim());

  const companionCodes = String(record.companion_codes || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  return {
    rowNumber,
    code: String(record.code || '').trim(),
    description: String(record.description || '').trim(),
    fullName: String(record.full_name || '').trim(),
    layer: String(record.layer || '').trim(),
    entityType: String(record.entity_type || '').trim(),
    lineType: String(record.linetype || '').trim(),
    processingOn: record.processing_on === '1',
    codeSequence,
    companionCodes,
    raw: record,
  };
}

export function parseFldConfig(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length);

  if (!lines.length) {
    return {
      versionTag: null,
      columns: [],
      rules: [],
      rulesByCode: {},
    };
  }

  const versionMatch = /^#([^#]+)#/.exec(lines[0]);
  const versionTag = versionMatch ? versionMatch[1].trim() : null;

  const rawHeaderColumns = normalizeHeader(lines[0]);
  const parsedRows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    values: line.split('|'),
  }));

  const widestRow = parsedRows.reduce((max, row) => Math.max(max, row.values.length), rawHeaderColumns.length);
  const columns = buildColumns(rawHeaderColumns, widestRow);

  const rules = parsedRows.map((row) => parseRuleRecord(columns, row.values, row.rowNumber));
  const rulesByCode = rules.reduce((acc, rule) => {
    if (!rule.code) return acc;
    acc[rule.code] = rule;
    return acc;
  }, {});

  return {
    versionTag,
    columns,
    rules,
    rulesByCode,
  };
}

export async function loadFldConfig(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return parseFldConfig(content);
}
