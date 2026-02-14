const CREW_KEY = 'surveyfoundryCrewProfiles';
const EQUIPMENT_KEY = 'surveyfoundryEquipmentInventory';
const EQUIPMENT_LOGS_KEY = 'surveyfoundryEquipmentLogs';

function parseJsonArray(raw) {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractCollection(snapshot, key) {
  if (!snapshot || typeof snapshot !== 'object') return [];
  return parseJsonArray(snapshot[key]);
}

export function getCrewProfiles(snapshot) {
  return extractCollection(snapshot, CREW_KEY);
}

export function getEquipmentInventory(snapshot) {
  return extractCollection(snapshot, EQUIPMENT_KEY);
}

export function getEquipmentLogs(snapshot) {
  return extractCollection(snapshot, EQUIPMENT_LOGS_KEY);
}

export function findCrewMemberById(snapshot, id) {
  return getCrewProfiles(snapshot).find((p) => p.id === id) || null;
}

export function findEquipmentById(snapshot, id) {
  return getEquipmentInventory(snapshot).find((e) => e.id === id) || null;
}

export function findEquipmentLogById(snapshot, id) {
  return getEquipmentLogs(snapshot).find((l) => l.id === id) || null;
}

export { CREW_KEY, EQUIPMENT_KEY, EQUIPMENT_LOGS_KEY };
