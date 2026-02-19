import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadStoredProjectFile,
  PROJECT_FILE_STORAGE_PREFIX,
  PROJECT_POINT_FILE_STORAGE_PREFIX,
  buildPointFileUploadRecord,
  appendPointFileResource,
  appendResourceToFolder,
  saveStoredProjectFile,
  removeResourceById,
  renameResourceTitle,
  extractCpfInstrumentsFromPointNote,
  findCpfPointLinks,
  findCpfPointLinksAsync,
} from '../src/project-browser-state.js';

function makeStorage(entries = {}) {
  const store = { ...entries };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = value;
    },
    dump() {
      return { ...store };
    },
  };
}

test('loadStoredProjectFile returns persisted project file snapshots by project id', () => {
  const projectId = 'project-abc';
  const storedProject = {
    schemaVersion: '1.0.0',
    folders: [{ key: 'point-files', index: [{ id: 'pointforge-export-1' }] }],
  };
  const storage = makeStorage({
    [`${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`]: JSON.stringify(storedProject),
  });

  const loaded = loadStoredProjectFile(storage, projectId);

  assert.deepEqual(loaded, storedProject);
});

test('loadStoredProjectFile ignores malformed project-file snapshots', () => {
  const projectId = 'project-abc';
  const storage = makeStorage({
    [`${PROJECT_FILE_STORAGE_PREFIX}:${projectId}`]: JSON.stringify({ schemaVersion: '1.0.0', folders: null }),
  });

  const loaded = loadStoredProjectFile(storage, projectId);

  assert.equal(loaded, null);
});

test('buildPointFileUploadRecord normalizes csv and txt uploads into project resources', () => {
  const upload = buildPointFileUploadRecord({
    projectId: 'project-77',
    fileName: 'Topo Notes.txt',
    text: 'Point,Northing,Easting\n1,100,200\n',
    now: 1700000000000,
  });

  assert.equal(upload.resource.folder, 'point-files');
  assert.equal(upload.resource.exportFormat, 'csv');
  assert.equal(upload.resource.reference.type, 'local-storage');
  assert.match(upload.storageKey, new RegExp(`^${PROJECT_POINT_FILE_STORAGE_PREFIX}:project-77:`));
  assert.equal(upload.payload.name, 'Topo Notes.txt');
  assert.equal(upload.payload.text, 'Point,Northing,Easting\n1,100,200');
});

test('appendPointFileResource appends point resources and saveStoredProjectFile persists updates', () => {
  const storage = makeStorage();
  const projectId = 'project-abc';
  const projectFile = {
    schemaVersion: '1.0.0',
    folders: [{ key: 'point-files', index: [] }],
  };

  const appended = appendPointFileResource(projectFile, { id: 'point-1' });
  const saved = saveStoredProjectFile(storage, projectId, projectFile);
  const loaded = loadStoredProjectFile(storage, projectId);

  assert.equal(appended, true);
  assert.equal(saved, true);
  assert.equal(loaded.folders[0].index.length, 1);
  assert.equal(loaded.folders[0].index[0].id, 'point-1');
});



test('removeResourceById removes matching resources from the requested folder', () => {
  const projectFile = {
    folders: [
      { key: 'cpfs', index: [{ id: 'cpf-1' }, { id: 'cpf-2' }] },
      { key: 'point-files', index: [{ id: 'points-1' }] },
    ],
  };

  const removed = removeResourceById(projectFile, 'cpfs', 'cpf-2');

  assert.equal(removed, true);
  assert.deepEqual(projectFile.folders[0].index.map((entry) => entry.id), ['cpf-1']);
});

test('renameResourceTitle updates resource title and metadata filename for project references', () => {
  const projectFile = {
    folders: [
      {
        key: 'cpfs',
        index: [
          {
            id: 'cpf-1',
            title: 'Old Name.pdf',
            reference: {
              type: 'server-upload',
              metadata: { fileName: 'Old Name.pdf' },
            },
          },
        ],
      },
    ],
  };

  const renamed = renameResourceTitle(projectFile, 'cpfs', 'cpf-1', 'Renamed CP&F.pdf');

  assert.equal(renamed, true);
  assert.equal(projectFile.folders[0].index[0].title, 'Renamed CP&F.pdf');
  assert.equal(projectFile.folders[0].index[0].reference.metadata.fileName, 'Renamed CP&F.pdf');
});

test('extractCpfInstrumentsFromPointNote parses CPNFS note instruments', () => {
  const note = 'CPNFS: 2019-12345...2020-00077... 2024-88990 ';

  const instruments = extractCpfInstrumentsFromPointNote(note);

  assert.deepEqual(instruments, ['2019-12345', '2020-00077', '2024-88990']);
});

test('findCpfPointLinks returns linked point numbers for a CP&F instrument', () => {
  const projectFile = {
    folders: [{
      key: 'point-files',
      index: [{
        id: 'points-1',
        title: 'Boundary Export.csv',
        reference: { value: 'surveyfoundryPointFile:project-5:points-1' },
      }],
    }],
  };

  const storage = makeStorage({
    'surveyfoundryPointFile:project-5:points-1': JSON.stringify({
      text: [
        'number,x,y,z,code,notes',
        '10,1,2,0,COR,"CPNFS: 2019-12345...2021-22222"',
        '11,3,4,0,SECOR,"CPNFS: 2020-00077"',
      ].join('\n'),
    }),
  });

  const links = findCpfPointLinks(projectFile, storage, '2019-12345');

  assert.equal(links.length, 1);
  assert.equal(links[0].pointFileTitle, 'Boundary Export.csv');
  assert.equal(links[0].pointNumber, '10');
  assert.equal(links[0].pointCode, 'COR');
});

test('findCpfPointLinksAsync resolves point file text via async resolver function', async () => {
  const csvText = [
    'number,x,y,z,code,notes',
    '10,1,2,0,COR,"CPNFS: 2019-12345...2021-22222"',
    '11,3,4,0,SECOR,"CPNFS: 2020-00077"',
  ].join('\n');

  const projectFile = {
    folders: [{
      key: 'point-files',
      index: [{
        id: 'points-1',
        title: 'Boundary Export.csv',
        reference: { type: 'server-upload', value: '/api/project-files/download?test=1' },
      }],
    }],
  };

  async function resolveText(resource) {
    if (resource?.id === 'points-1') return csvText;
    return null;
  }

  const links = await findCpfPointLinksAsync(projectFile, resolveText, '2019-12345');

  assert.equal(links.length, 1);
  assert.equal(links[0].pointFileTitle, 'Boundary Export.csv');
  assert.equal(links[0].pointNumber, '10');
  assert.equal(links[0].pointCode, 'COR');
});

test('findCpfPointLinksAsync returns empty array for invalid inputs', async () => {
  assert.deepEqual(await findCpfPointLinksAsync(null, async () => '', 'inst'), []);
  assert.deepEqual(await findCpfPointLinksAsync({ folders: [] }, 'not-a-function', 'inst'), []);
  assert.deepEqual(await findCpfPointLinksAsync({ folders: [{ key: 'point-files', index: [] }] }, async () => '', ''), []);
});

test('Project Browser prefers stored project file snapshots before loading API template', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /<script type="module">/, 'Project Browser should use module scripts to import shared state helpers');
  assert.match(projectBrowserHtml, /import\s*\{[\s\S]*loadStoredProjectFile[\s\S]*\}\s*from\s*'\.\/src\/project-browser-state\.js'/, 'Project Browser should import persisted snapshot loader');
  assert.match(projectBrowserHtml, /const storedProjectFile = loadStoredProjectFile\(window\.localStorage, activeProjectId\);/, 'Project Browser should attempt to load local project-file snapshots');
  assert.match(projectBrowserHtml, /if \(storedProjectFile\) \{[\s\S]*renderTree\(storedProjectFile,\s*projectContext\);[\s\S]*return;/, 'Project Browser should render persisted files and skip template requests when available');
});

test('Project Browser supports point file drag-and-drop and mobile file picker uploads via server API', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /picker\.accept\s*=\s*'\.csv,text\/csv,\.txt,text\/plain'/, 'Project Browser should allow csv and txt through file picker');
  assert.match(projectBrowserHtml, /panel\.addEventListener\('drop',\s*\(event\)\s*=>\s*\{[\s\S]*uploadPointFilesToServer\(event\.dataTransfer\?\.files, context\)/, 'Project Browser should support desktop drag-and-drop upload via server API');
  assert.match(projectBrowserHtml, /async function uploadPointFilesToServer\(files, context\)/, 'Project Browser should define an async server upload handler for point files');
  assert.match(projectBrowserHtml, /pointFileState:\s*\{\s*text,\s*exportFormat:\s*'csv'\s*\}/, 'Point file uploads should send point file text/state payloads');
  assert.match(projectBrowserHtml, /fetch\(buildProjectPointFileApiUrl\(context\.activeProjectId\),/, 'Point file uploads should use the project point-file API');
  assert.match(projectBrowserHtml, /await\s+syncProjectPointFilesFromApi\(context\)/, 'Point file uploads should refresh point-file resources from API');
  assert.doesNotMatch(projectBrowserHtml, /indexFile\.innerHTML\s*=\s*'<span class=\"icon\">📄<\/span>index\.json'/, 'Project Browser should hide folder metadata index.json rows from the visible tree');
});

test('Project Browser can open point files directly in PointForge via async text resolution', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /const\s+POINTFORGE_PROJECT_BROWSER_IMPORT_STORAGE_KEY\s*=\s*'pointforgeProjectBrowserImport'/, 'Project Browser should use a stable localStorage key for PointForge launches');
  assert.match(projectBrowserHtml, /async\s+function\s+launchPointForgeFromResource\s*\(/, 'Project Browser should define async PointForge launch helper for point-file resources');
  assert.match(projectBrowserHtml, /async\s+function\s+resolvePointFileText\s*\(resource\)/, 'Project Browser should define an async text resolver for point files');
  assert.match(projectBrowserHtml, /const\s+text\s*=\s*await\s+resolvePointFileText\(resource\)/, 'PointForge launch should resolve text asynchronously');
  assert.match(projectBrowserHtml, /ref\.type\s*===\s*'server-upload'/, 'Text resolver should handle server-upload references');
  assert.match(projectBrowserHtml, /await\s+response\.text\(\)/, 'Text resolver should fetch server-uploaded file content as text');
  assert.match(projectBrowserHtml, /localStorage\.setItem\(POINTFORGE_PROJECT_BROWSER_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*text/, 'Project Browser should persist selected point-file text before launching PointForge');
  assert.match(projectBrowserHtml, /destination\.searchParams\.set\('source',\s*'project-browser'\)/, 'Project Browser should tag PointForge navigation source as project-browser');
  assert.match(projectBrowserHtml, /resource\.classList\.add\('pointforge-openable'\)/, 'Project Browser should make point-file rows tappable for PointForge launch');
  assert.match(projectBrowserHtml, /resource\.addEventListener\('click',\s*\(\)\s*=>\s*launchPointForgeFromResource\(entry, projectContext\)\)/, 'Point-file row tap should launch PointForge directly');
  assert.match(projectBrowserHtml, /resource\.addEventListener\('keydown',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key\s*!==\s*'Enter'[\s\S]*event\.key\s*!==\s*' '\)/, 'Point-file row keyboard activation should support Enter and Space for accessibility');
  assert.match(projectBrowserHtml, /openButton\.addEventListener\('click',\s*\(event\)\s*=>\s*\{[\s\S]*event\.stopPropagation\(\)/, 'Open button click should stop propagation to avoid duplicate launches');
  assert.match(projectBrowserHtml, /textContent\s*=\s*'Open in PointForge'/, 'Project Browser should render an Open in PointForge button for supported point files');
  assert.match(projectBrowserHtml, /entry\?\.reference\?\.type\s*===\s*'project-point-file'/, 'PointForge launch should be available for API-backed point files');
});

test('Project Browser can open CP&F rows as PDF links in a new tab', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /const\s+ADA_CPF_PDF_BASE\s*=\s*'https:\/\/gisprod\.adacounty\.id\.gov\/apps\/acdscpf\/CpfPdfs\/'/, 'Project Browser should define Ada CP&F PDF base URL for instrument lookup links');
  assert.match(projectBrowserHtml, /function\s+getCpfPdfUrl\s*\(/, 'Project Browser should include a CP&F PDF URL resolver helper');
  assert.match(projectBrowserHtml, /const\s+proxyUrl\s*=\s*new URL\('\/api\/ros-pdf', window\.location\.origin\)/, 'Project Browser should route CP&F opens through the PDF proxy endpoint');
  assert.match(projectBrowserHtml, /function\s+openCpfPdfFromResource\s*\(/, 'Project Browser should include a CP&F open handler');
  assert.match(projectBrowserHtml, /window\.open\('', '_blank', 'popup=yes,width=1200,height=900'\)/, 'Project Browser should open CP&F PDFs in a dedicated popup window shell before navigating to the PDF');
  assert.match(projectBrowserHtml, /popup\.location\.replace\(pdfUrl\)/, 'Project Browser should navigate popup windows using location.replace to avoid stale about:blank history entries');
  assert.match(projectBrowserHtml, /const\s+canOpenCpfPdf\s*=\s*folder\.key\s*===\s*'cpfs'\s*&&\s*entry\?\.exportFormat\s*===\s*'pdf'/, 'Project Browser should detect CP&F pdf entries as openable');
  assert.match(projectBrowserHtml, /async\s+function\s+attachPdfPreview\s*\(/, 'Project Browser should lazily load PDF thumbnails asynchronously');
  assert.match(projectBrowserHtml, /\/api\/project-files\/pdf-thumbnail/, 'Project Browser should request server-cached PDF thumbnails');
  assert.match(projectBrowserHtml, /pdf-preview-placeholder/, 'Project Browser should render a placeholder while PDF thumbnail generation is pending');
  assert.match(projectBrowserHtml, /maxAttempts\s*=\s*60/, 'Project Browser should keep polling long-running PDF thumbnail jobs before giving up.');
  assert.match(projectBrowserHtml, /placeholder\.classList\.add\('pdf-preview-failed'\)/, 'Project Browser should mark PDF preview placeholders as failed when generation never completes.');
  assert.match(projectBrowserHtml, /placeholder\.textContent\s*=\s*'Unavailable'/, 'Project Browser should replace perpetual generating placeholders with an unavailable label when thumbnail loading fails.');
  assert.doesNotMatch(projectBrowserHtml, /pendingPdfThumbnailLoads/, 'Project Browser should not share slot-bound thumbnail promises that leave new rows stuck in generating state.');
  assert.match(projectBrowserHtml, /resource\.addEventListener\('click',\s*\(\)\s*=>\s*openCpfPdfFromResource\(entry\)\)/, 'CP&F row tap should open the PDF link');
  assert.match(projectBrowserHtml, /openButton\.textContent\s*=\s*'Open PDF'/, 'Project Browser should render an Open PDF button for CP&F entries');
  assert.match(projectBrowserHtml, /deleteButton\.textContent\s*=\s*'Delete'/, 'Project Browser should render a delete button for CP&F entries');
  assert.match(projectBrowserHtml, /function\s+deleteCpfResource\s*\(/, 'Project Browser should define a CP&F delete handler');
  assert.match(projectBrowserHtml, /findCpfPointLinksAsync\(projectContext\?\.projectFile, resolvePointFileText, instrument\)/, 'CP&F delete flow should detect linked point references by instrument using async resolver');
  assert.match(projectBrowserHtml, /window\.confirm\(`This CP&F is linked to/, 'CP&F delete flow should ask for confirmation when linked points exist');
  assert.match(projectBrowserHtml, /function\s+openCpfPrintPreview\s*\(/, 'Project Browser should define a bulk CP&F print-preview builder');
  assert.match(projectBrowserHtml, /window\.open\('', '_blank'\)/, 'Print preview should open a writable popup window for inline HTML content');
  assert.match(projectBrowserHtml, /printAllButton\.textContent\s*=\s*'Print all'/, 'CP&F folder should render a Print all action');
  assert.match(projectBrowserHtml, /printAllButton\.addEventListener\('click',\s*\(\)\s*=>\s*openCpfPrintPreview\(folder\.index\)\)/, 'Print all action should open a combined CP&F print preview');
  assert.match(projectBrowserHtml, /function\s+buildPrintPreviewPdfUrl\s*\(/, 'Print preview should define a helper to append PDF fit/hide-viewer parameters');
  assert.match(projectBrowserHtml, /#toolbar=0&navpanes=0&scrollbar=0&view=Fit&zoom=page-fit/, 'Print preview PDF URLs should request hidden viewer chrome and fit-to-page scaling');
  assert.match(projectBrowserHtml, /<iframe src="\$\{escapeHtml\(buildPrintPreviewPdfUrl\(url\)\)\}" title="CP&amp;F PDF \$\{index \+ 1\}" class="pdf-frame"><\/iframe>/, 'Print preview should render each PDF in an iframe with print-oriented URL parameters');
  assert.match(projectBrowserHtml, /\.page-block \{ margin: 0 0 1rem; display: flex; justify-content: center; background: #fff; \}/, 'Print preview should center embedded PDF frames on-screen with a white page background');
  assert.match(projectBrowserHtml, /\.pdf-frame \{ width: min\(100%, 8\.5in\);[\s\S]*background: #fff; \}/, 'Print preview iframe styling should avoid dark backgrounds and constrain width for centered preview');
  assert.doesNotMatch(projectBrowserHtml, /<h2>\$\{index \+ 1\}\./, 'Print preview should not inject heading-only pages between PDFs');
  assert.match(projectBrowserHtml, /onclick="window\.print\(\)"/, 'Print preview should include a direct print button');
});


test('appendResourceToFolder appends resource to any valid folder', () => {
  const projectFile = {
    folders: [
      { key: 'drawings', index: [] },
      { key: 'deeds', index: [] },
      { key: 'other', index: [] },
    ],
  };
  const resource = { id: 'upload-test-1', folder: 'deeds', title: 'Test Deed.pdf', exportFormat: 'pdf', reference: { type: 'server-upload', value: '/api/project-files/download?test=1' } };
  const result = appendResourceToFolder(projectFile, 'deeds', resource);
  assert.equal(result, true);
  assert.equal(projectFile.folders[1].index.length, 1);
  assert.equal(projectFile.folders[1].index[0].id, 'upload-test-1');
});

test('appendResourceToFolder returns false for invalid folder key', () => {
  const projectFile = { folders: [{ key: 'drawings', index: [] }] };
  const resource = { id: 'r1', title: 'test' };
  assert.equal(appendResourceToFolder(projectFile, 'nonexistent', resource), false);
  assert.equal(appendResourceToFolder(null, 'drawings', resource), false);
  assert.equal(appendResourceToFolder(projectFile, 'drawings', null), false);
});

test('Project Browser can open drawing resources directly in LineSmith', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /const\s+LINESMITH_PROJECT_BROWSER_DRAWING_IMPORT_STORAGE_KEY\s*=\s*'lineSmithProjectBrowserDrawingImport'/, 'Project Browser should use a stable localStorage key for LineSmith drawing launches');
  assert.match(projectBrowserHtml, /function\s+launchLineSmithFromDrawingResource\s*\(/, 'Project Browser should define LineSmith launch helper for drawing resources');
  assert.match(projectBrowserHtml, /async function\s+syncProjectDrawingsFromApi\(/, 'Project Browser should sync drawing resources through the drawings API');
  assert.match(projectBrowserHtml, /destination\.searchParams\.set\('source',\s*'project-browser-drawing'\)/, 'Project Browser should tag drawing launches for LineSmith bootstrap import');
  assert.match(projectBrowserHtml, /const\s+canOpenLineSmithDrawing\s*=\s*folder\.key\s*===\s*'drawings'[\s\S]*entry\?\.reference\?\.type\s*===\s*'local-storage'[\s\S]*entry\?\.reference\?\.type\s*===\s*'project-drawing'/, 'Project Browser should detect both local and API-backed drawing records as LineSmith-openable');
  assert.match(projectBrowserHtml, /resource\.addEventListener\('click',\s*\(\)\s*=>\s*launchLineSmithFromDrawingResource\(entry, projectContext\)\)/, 'drawing row tap should launch LineSmith directly');
  assert.match(projectBrowserHtml, /openButton\.textContent\s*=\s*'Open in LineSmith'/, 'Project Browser should render an Open in LineSmith button for drawing resources');
});
