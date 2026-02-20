export function normalizePointFileExportFormat(fileName = '') {
  const lower = String(fileName || '').trim().toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  return 'csv';
}

export function buildEquipmentLogPointFilePayload({ fileName = '', text = '', log = {}, projectId = '' } = {}) {
  const normalizedText = String(text || '').trim();
  if (!projectId || !fileName || !normalizedText) return null;

  const name = String(fileName || '').trim();
  const sourceBits = [
    String(log?.jobFileName || '').trim(),
    String(log?.equipmentType || '').trim(),
    String(log?.rodman || '').trim(),
  ].filter(Boolean);

  const sourceLabel = sourceBits.length
    ? `Equipment log: ${sourceBits.join(' · ')}`
    : 'Equipment log attachment';

  const user = String(log?.rodman || log?.user || log?.createdBy || '').trim() || 'unknown-user';

  return {
    pointFileName: name,
    pointFileState: {
      text: normalizedText,
      exportFormat: normalizePointFileExportFormat(name),
    },
    source: 'equipment-log',
    sourceLabel,
    changeContext: {
      app: 'equipment-log',
      user,
    },
  };
}
