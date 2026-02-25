import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';

async function startServer(options = {}) {
  const server = createSurveyServer({
    evidenceDeskFileStore: {
      async getFile() { return null; },
      async listFiles() { return { files: [], filesByFolder: {} }; },
    },
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

function createMockHarvestStore() {
  const objects = new Map([
    ['adacounty/recordsofsurvey/2024/R1234501.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Y6QAAAAASUVORK5CYII=', 'base64')],
    ['adacounty/recordsofsurvey/2024/R1234502.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Y6QAAAAASUVORK5CYII=', 'base64')],
    ['adacounty/subdivisionplats/S4000101.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Y6QAAAAASUVORK5CYII=', 'base64')],
  ]);

  return {
    async listObjects(prefix = '') {
      return [...objects.keys()].filter((key) => key.startsWith(prefix));
    },
    async getObject(key) {
      return objects.get(key) || null;
    },
    async putObject() {},
  };
}

test('idaho harvest archive APIs list documents and build merged record-of-survey PDF pages', async () => {
  const harness = await startServer({ mapTileObjectStore: createMockHarvestStore() });
  try {
    const listResponse = await fetch(`${harness.baseUrl}/api/idaho-harvest/records-of-survey`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(Array.isArray(listPayload.records), true);
    assert.equal(listPayload.records.length, 1);
    assert.equal(listPayload.records[0].id, 'R12345');
    assert.equal(listPayload.records[0].pageCount, 2);
    assert.equal(listPayload.records[0].pages.map((page) => page.page).join(','), '1,2');

    const pdfResponse = await fetch(`${harness.baseUrl}/api/idaho-harvest/records-of-survey/R12345/pdf`);
    assert.equal(pdfResponse.status, 200);
    assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
    const pdfText = Buffer.from(await pdfResponse.arrayBuffer()).toString('latin1');
    const pageMatches = pdfText.match(/\/Type \/Page\b/g) || [];
    assert.equal(pageMatches.length, 2);
  } finally {
    await harness.close();
  }
});

test('idaho harvest archive APIs list subdivision plats and return 404 for unknown PDFs', async () => {
  const harness = await startServer({ mapTileObjectStore: createMockHarvestStore() });
  try {
    const listResponse = await fetch(`${harness.baseUrl}/api/idaho-harvest/subdivision-plats`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.plats.length, 1);
    assert.equal(listPayload.plats[0].id, 'S40001');

    const missingPdf = await fetch(`${harness.baseUrl}/api/idaho-harvest/subdivision-plats/UNKNOWN/pdf`);
    assert.equal(missingPdf.status, 404);
  } finally {
    await harness.close();
  }
});
