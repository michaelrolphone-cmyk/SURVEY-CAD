function parseJsonObject(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function summarizePointFileRecord(record = {}) {
  const versions = Array.isArray(record.versions) ? record.versions : [];
  return {
    pointFileId: String(record.pointFileId || ''),
    pointFileName: String(record.pointFileName || ''),
    exportFormat: String(record.exportFormat || 'csv'),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    latestVersionId: versions.length ? String(versions[versions.length - 1]?.versionId || '') : null,
    versionCount: versions.length,
    source: record.source || null,
    sourceLabel: record.sourceLabel || null,
  };
}

function collectPointFileSummaryFromIndex(snapshot = {}) {
  const grouped = {};
  for (const [key, value] of Object.entries(snapshot)) {
    const match = key.match(/^project:point-file-index:([^:]+)$/);
    if (!match) continue;
    const projectId = String(match[1] || '').trim();
    if (!projectId) continue;
    const parsed = parseJsonObject(value);
    if (!parsed) continue;
    grouped[projectId] = Object.values(parsed)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        pointFileId: String(entry.pointFileId || ''),
        pointFileName: String(entry.pointFileName || ''),
        exportFormat: String(entry.exportFormat || 'csv'),
        createdAt: entry.createdAt || null,
        updatedAt: entry.updatedAt || null,
        latestVersionId: entry.latestVersionId || null,
        versionCount: Number.isFinite(entry.versionCount) ? Number(entry.versionCount) : 0,
        source: entry.source || null,
        sourceLabel: entry.sourceLabel || null,
      }))
      .filter((entry) => entry.pointFileId);
  }
  return grouped;
}

export function buildSyncResponseState(state = {}) {
  const snapshot = state?.snapshot && typeof state.snapshot === 'object' && !Array.isArray(state.snapshot)
    ? state.snapshot
    : {};

  const summarizedSnapshot = {};
  const pointFileSummary = collectPointFileSummaryFromIndex(snapshot);

  for (const [key, value] of Object.entries(snapshot)) {
    const pointFileMatch = key.match(/^project:point-file:([^:]+):([^:]+)$/);
    if (pointFileMatch) {
      const projectId = String(pointFileMatch[1] || '').trim();
      const parsed = parseJsonObject(value);
      if (projectId && parsed) {
        if (!Array.isArray(pointFileSummary[projectId])) pointFileSummary[projectId] = [];
        const dedupeKey = String(parsed.pointFileId || pointFileMatch[2] || '').trim();
        const alreadyExists = pointFileSummary[projectId].some((entry) => entry.pointFileId === dedupeKey);
        if (!alreadyExists) {
          pointFileSummary[projectId].push(summarizePointFileRecord(parsed));
        }
      }
      continue;
    }

    summarizedSnapshot[key] = value;
  }

  return {
    version: Number.isFinite(state?.version) ? Number(state.version) : 0,
    snapshot: summarizedSnapshot,
    checksum: String(state?.checksum || ''),
    updatedAt: state?.updatedAt || null,
    pointFileSummary,
  };
}

