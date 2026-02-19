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

function upsertInCollection(snapshot, key, item) {
  const collection = extractCollection(snapshot, key);
  const idx = collection.findIndex((entry) => entry.id === item.id);
  if (idx !== -1) {
    collection[idx] = { ...collection[idx], ...item, updatedAt: new Date().toISOString() };
  } else {
    collection.push(item);
  }
  return JSON.stringify(collection);
}

function removeFromCollection(snapshot, key, id) {
  const collection = extractCollection(snapshot, key);
  const next = collection.filter((entry) => entry?.id !== id);
  return {
    removed: next.length !== collection.length,
    value: JSON.stringify(next),
  };
}

export async function saveCrewMember(store, member) {
  const state = await store.getState();
  const updatedValue = upsertInCollection(state.snapshot, CREW_KEY, member);
  return await store.applyDifferential({
    operations: [{ type: 'set', key: CREW_KEY, value: updatedValue }],
    baseChecksum: state.checksum,
  });
}

export async function saveEquipmentItem(store, item) {
  const state = await store.getState();
  const updatedValue = upsertInCollection(state.snapshot, EQUIPMENT_KEY, item);
  return await store.applyDifferential({
    operations: [{ type: 'set', key: EQUIPMENT_KEY, value: updatedValue }],
    baseChecksum: state.checksum,
  });
}

export async function deleteEquipmentItem(store, id) {
  const state = await store.getState();
  const { removed, value } = removeFromCollection(state.snapshot, EQUIPMENT_KEY, id);
  if (!removed) return null;
  return await store.applyDifferential({
    operations: [{ type: 'set', key: EQUIPMENT_KEY, value }],
    baseChecksum: state.checksum,
  });
}

export async function saveEquipmentLog(store, log) {
  const state = await store.getState();
  const updatedValue = upsertInCollection(state.snapshot, EQUIPMENT_LOGS_KEY, log);
  return await store.applyDifferential({
    operations: [{ type: 'set', key: EQUIPMENT_LOGS_KEY, value: updatedValue }],
    baseChecksum: state.checksum,
  });
}

export { CREW_KEY, EQUIPMENT_KEY, EQUIPMENT_LOGS_KEY };
