import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurveyServer } from '../src/server.js';

async function startServer(options = {}) {
  const server = createSurveyServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('ROS thumbnail endpoint deduplicates generation and returns cached PNG thumbnails', async () => {
  let renderCalls = 0;
  const evidenceDeskFileStore = {
    async getFile(projectId, folderKey, fileName) {
      if (projectId === 'p1' && folderKey === 'ros' && fileName === 'scan.tif') {
        return { buffer: Buffer.from('TIFFDATA', 'utf8') };
      }
      return null;
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    rosThumbnailRenderer: async () => {
      renderCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return Buffer.from('ROSPNG', 'utf8');
    },
  });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=ros&fileName=scan.tif');
    const thumbnailUrl = `${baseUrl}/api/project-files/ros-thumbnail?source=${source}`;

    const [first, second] = await Promise.all([fetch(thumbnailUrl), fetch(thumbnailUrl)]);
    assert.equal(first.status, 202);
    assert.equal(second.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 120));
    const cached = await fetch(thumbnailUrl);
    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get('content-type'), 'image/png');
    const body = Buffer.from(await cached.arrayBuffer()).toString('utf8');
    assert.equal(body, 'ROSPNG');
    assert.equal(renderCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('ROS thumbnail endpoint validates source parameter', async () => {
  const { server, baseUrl } = await startServer({ evidenceDeskFileStore: { async getFile() { return null; } } });
  try {
    const response = await fetch(`${baseUrl}/api/project-files/ros-thumbnail?source=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(response.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('ROS thumbnail endpoint reports missing source TIFFs as not found failures', async () => {
  const evidenceDeskFileStore = {
    async getFile() {
      return null;
    },
  };

  const { server, baseUrl } = await startServer({
    evidenceDeskFileStore,
    rosThumbnailRenderer: async () => Buffer.from('ROSPNG', 'utf8'),
  });

  try {
    const source = encodeURIComponent('/api/project-files/download?projectId=p1&folderKey=ros&fileName=missing.tif');
    const thumbnailUrl = `${baseUrl}/api/project-files/ros-thumbnail?source=${source}`;

    const first = await fetch(thumbnailUrl);
    assert.equal(first.status, 202);

    await new Promise((resolve) => setTimeout(resolve, 30));
    const failed = await fetch(thumbnailUrl);
    assert.equal(failed.status, 404);
    const payload = await failed.json();
    assert.equal(payload.status, 'failed');
    assert.match(payload.detail, /not found/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
