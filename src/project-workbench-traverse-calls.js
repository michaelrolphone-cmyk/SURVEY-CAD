const BOUNDARYLAB_EVIDENCE_TAG = 'boundarylab-traverse-calls';

export function normalizeBoundaryLabCalls(calls) {
  return (Array.isArray(calls) ? calls : [])
    .map((call) => ({
      bearing: String(call?.bearing || '').trim(),
      distance: Number(call?.distance),
    }))
    .filter((call) => call.bearing && Number.isFinite(call.distance) && call.distance > 0);
}

async function ensureBoundaryLabEvidence(store, casefileId) {
  const evidence = await store.listEvidence(casefileId, { limit: 500, offset: 0, tag: BOUNDARYLAB_EVIDENCE_TAG });
  const existing = Array.isArray(evidence?.items) ? evidence.items[0] : null;
  if (existing?.id) return existing.id;

  const created = await store.createEvidence(casefileId, {
    type: 'other',
    title: 'BoundaryLab Traverse Calls',
    source: 'BoundaryLab',
    tags: [BOUNDARYLAB_EVIDENCE_TAG],
    notes: 'Auto-generated evidence envelope for BoundaryLab traverse call persistence.',
  });
  return created.id;
}

export async function persistBoundaryLabTraverseCalls({ store, casefileId, calls }) {
  if (!calls.length) return [];
  const evidenceId = await ensureBoundaryLabEvidence(store, casefileId);
  const ids = [];
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const extraction = await store.createExtraction(casefileId, {
      evidenceId,
      label: `BoundaryLab Call ${index + 1}`,
      snippet: '(BoundaryLab manual entry)',
      bearingText: call.bearing,
      distance: call.distance,
      distanceUnit: 'ft',
      include: true,
      confidence: 1,
    });
    ids.push(extraction.id);
  }
  return ids;
}

export async function hydrateBoundaryLabTraverseCalls({ store, casefileId, traverse }) {
  const callIds = Array.isArray(traverse?.calls) ? traverse.calls : [];
  const calls = [];
  for (const extractionId of callIds) {
    try {
      const extraction = await store.getExtraction(casefileId, extractionId);
      calls.push({
        bearing: String(extraction?.bearingText || ''),
        distance: Number(extraction?.distance),
      });
    } catch {
      // Skip missing references in legacy/stale traverse configs.
    }
  }

  return {
    ...traverse,
    calls: calls.filter((call) => call.bearing && Number.isFinite(call.distance)),
  };
}

