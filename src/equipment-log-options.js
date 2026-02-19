export function buildEquipmentLogOptionLabel(item = {}) {
  const make = String(item.make || '').trim();
  const model = String(item.model || '').trim();
  const equipmentType = String(item.equipmentType || '').trim();
  const serialNumber = String(item.serialNumber || '').trim();

  const primary = [make, model].filter(Boolean).join(' ').trim();
  const fallback = equipmentType;
  const label = primary || fallback;
  if (!label) return '';

  return serialNumber ? `${label} (${serialNumber})` : label;
}

export function buildEquipmentLogOptions(items = []) {
  const uniqueLabels = new Set();
  for (const item of items) {
    const label = buildEquipmentLogOptionLabel(item);
    if (label) uniqueLabels.add(label);
  }
  return Array.from(uniqueLabels).sort((a, b) => a.localeCompare(b));
}
