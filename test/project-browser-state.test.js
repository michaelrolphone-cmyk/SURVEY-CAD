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
  moveResourceById,
  renameResourceTitle,
  extractCpfInstrumentsFromPointNote,
  findCpfPointLinks,
  findCpfPointLinksAsync,
  groupCpfsByCorner,
  aliquotCornerLabelFromNormXY,
  cornerDesignationFromAliquots,
  CPF_CORNER_GROUP_RADIUS_FEET,
  addCustomFolder,
  removeCustomFolder,
  getFolderDepth,
  getFolderChildren,
  MAX_FOLDER_DEPTH,
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

test('moveResourceById moves resources between folders and rewrites folder metadata', () => {
  const projectFile = {
    folders: [
      { key: 'drawings', index: [{ id: 'draw-1', folder: 'drawings', title: 'Boundary' }] },
      { key: 'other', index: [] },
    ],
  };

  const moved = moveResourceById(projectFile, 'drawings', 'other', 'draw-1');

  assert.equal(moved, true);
  assert.equal(projectFile.folders[0].index.length, 0);
  assert.equal(projectFile.folders[1].index.length, 1);
  assert.equal(projectFile.folders[1].index[0].folder, 'other');
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

test('findCpfPointLinksAsync returns north and east from point file when present', async () => {
  const csvText = [
    'number,northing,easting,z,code,notes',
    '10,1200500.5,2300100.25,0,COR,"CPNFS: 2019-12345"',
  ].join('\n');
  const projectFile = {
    folders: [{
      key: 'point-files',
      index: [{ id: 'pf-1', title: 'Points.csv', reference: { value: 'key1' } }],
    }],
  };
  const links = await findCpfPointLinksAsync(projectFile, async () => csvText, '2019-12345');
  assert.equal(links.length, 1);
  assert.equal(links[0].north, 1200500.5);
  assert.equal(links[0].east, 2300100.25);
});

test('groupCpfsByCorner clusters entries within 33 feet and labels by coordinates', () => {
  const e1 = { id: 'a', title: 'CP&F 1' };
  const e2 = { id: 'b', title: 'CP&F 2' };
  const e3 = { id: 'c', title: 'CP&F 3' };
  const entries = [
    { entry: e1, north: 1000, east: 2000 },
    { entry: e2, north: 1005, east: 2005 },
    { entry: e3, north: 5000, east: 6000 },
  ];
  const groups = groupCpfsByCorner(entries, 33);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].entries.length, 2);
  assert.ok(groups[0].entries.includes(e1) && groups[0].entries.includes(e2));
  assert.equal(groups[1].entries.length, 1);
  assert.equal(groups[1].entries[0], e3);
  assert.match(groups[0].label, /Corner at N \d+, E \d+/);
});

test('groupCpfsByCorner labels grouped CP&Fs by aliquot-derived corner designation when consistent', () => {
  const entries = [
    { entry: { id: 'a', reference: { metadata: { aliquots: ['NENW'] } } }, north: 1010, east: 2020 },
    { entry: { id: 'b', reference: { metadata: { aliquots: ['nenw'] } } }, north: 1014, east: 2024 },
  ];

  const groups = groupCpfsByCorner(entries, 33);
  assert.equal(groups.length, 1);
  assert.match(groups[0].label, /^Sixteenth corner \(N \d+, E \d+\)$/);
});

test('groupCpfsByCorner puts entries without coordinates in No linked location', () => {
  const e1 = { id: 'a' };
  const groups = groupCpfsByCorner([{ entry: e1, north: undefined, east: undefined }], 33);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'No linked location');
  assert.equal(groups[0].entries[0], e1);
});

test('groupCpfsByCorner sorts grouped entries by highest instrument number first', () => {
  const entries = [
    { entry: { id: 'a', title: 'CP&F 2019-12345', reference: { value: '2019-12345' } }, north: 1000, east: 2000 },
    { entry: { id: 'b', title: 'CP&F 2021-00002', reference: { value: '2021-00002' } }, north: 1001, east: 2001 },
    { entry: { id: 'c', title: 'CP&F 2020-90000', reference: { value: '2020-90000' } }, north: 1002, east: 2002 },
  ];

  const groups = groupCpfsByCorner(entries, 33);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].entries.map((entry) => entry.id), ['b', 'c', 'a']);
});

test('aliquotCornerLabelFromNormXY returns section and quarter labels', () => {
  assert.equal(aliquotCornerLabelFromNormXY(0, 0), 'Section corner');
  assert.equal(aliquotCornerLabelFromNormXY(0.5, 0.5), 'Center of section');
  assert.equal(aliquotCornerLabelFromNormXY(0.5, 1), 'North quarter corner');
  assert.equal(aliquotCornerLabelFromNormXY(0.5, 0), 'South quarter corner');
  assert.equal(aliquotCornerLabelFromNormXY(1, 0.5), 'East quarter corner');
  assert.equal(aliquotCornerLabelFromNormXY(0.25, 0.25), 'Sixteenth corner');
});

test('cornerDesignationFromAliquots infers section, quarter, center, and sixteenth corners', () => {
  assert.equal(cornerDesignationFromAliquots(['NW']), 'Section corner');
  assert.equal(cornerDesignationFromAliquots(['N']), 'North quarter corner');
  assert.equal(cornerDesignationFromAliquots(['C']), 'Center of section');
  assert.equal(cornerDesignationFromAliquots(['NENW']), 'Sixteenth corner');
  assert.equal(cornerDesignationFromAliquots(['NE', 'SW']), null);
});

test('CPF_CORNER_GROUP_RADIUS_FEET is 33', () => {
  assert.equal(CPF_CORNER_GROUP_RADIUS_FEET, 33);
});

test('findCpfPointLinksAsync returns empty array for invalid inputs', async () => {
  assert.deepEqual(await findCpfPointLinksAsync(null, async () => '', 'inst'), []);
  assert.deepEqual(await findCpfPointLinksAsync({ folders: [] }, 'not-a-function', 'inst'), []);
  assert.deepEqual(await findCpfPointLinksAsync({ folders: [{ key: 'point-files', index: [] }] }, async () => '', ''), []);
});

test('Project Browser prefers stored project file snapshots before loading API template', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /<script type="module">/, 'Project Browser should use module scripts to import shared state helpers');
  assert.match(projectBrowserHtml, /import\s*\*\s*as\s*projectBrowserState\s*from\s*'\.\/src\/project-browser-state\.js'/, 'Project Browser should import project-browser helpers through a namespace for compatibility-safe destructuring');
  assert.match(projectBrowserHtml, /const\s*\{[\s\S]*loadStoredProjectFile[\s\S]*\}\s*=\s*projectBrowserState;/, 'Project Browser should destructure persisted snapshot loader from project-browser-state namespace');
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
  assert.match(projectBrowserHtml, /async\s+function\s+resolvePointFileText\s*\(resource,\s*\{\s*versionId\s*=\s*''\s*\}\s*=\s*\{\}\)/, 'Project Browser should define an async text resolver for point files');
  assert.match(projectBrowserHtml, /const\s+text\s*=\s*await\s+resolvePointFileText\(resource\)/, 'PointForge launch should resolve text asynchronously');
  assert.match(projectBrowserHtml, /ref\.type\s*===\s*'server-upload'/, 'Text resolver should handle server-upload references');
  assert.match(projectBrowserHtml, /await\s+response\.text\(\)/, 'Text resolver should fetch server-uploaded file content as text');
  assert.match(projectBrowserHtml, /localStorage\.setItem\(POINTFORGE_PROJECT_BROWSER_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*text/, 'Project Browser should persist selected point-file text before launching PointForge');
  assert.match(projectBrowserHtml, /destination\.searchParams\.set\('source',\s*'project-browser'\)/, 'Project Browser should tag PointForge navigation source as project-browser');
  assert.match(projectBrowserHtml, /resource\.classList\.add\('pointforge-openable'\)/, 'Project Browser should make point-file rows tappable for PointForge launch');
  assert.match(projectBrowserHtml, /if \(downloadUrl\) \{[\s\S]*resource\.classList\.add\('pointforge-openable'\)/, 'Project Browser should only bind linked-file open handlers when a download URL exists.');
  assert.doesNotMatch(projectBrowserHtml, /if \(!downloadUrl\) continue;/, 'Project Browser should not use loop-control statements inside file-row builder callbacks.');
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
  assert.match(projectBrowserHtml, /referenceType\s*===\s*'server-upload'\s*&&\s*referenceValue/, 'CP&F resolver should treat uploaded server files differently from referenced instruments');
  assert.match(projectBrowserHtml, /return\s+new URL\(referenceValue, window\.location\.origin\)\.toString\(\)/, 'Uploaded CP&F entries should resolve to same-origin download URLs for preview/open actions');
  assert.match(projectBrowserHtml, /if\s*\(metadataPdf\.startsWith\('\/'\)\)/, 'CP&F resolver should support relative metadata pdf URLs without forcing county lookup fallback');
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
  assert.match(projectBrowserHtml, /starButton\.textContent\s*=\s*starred\s*\?\s*'★ Starred'\s*:\s*'☆ Star'/, 'Project Browser should render a star toggle button for CP&F field-book selection');
  assert.match(projectBrowserHtml, /deleteButton\.textContent\s*=\s*'Delete'/, 'Project Browser should render a delete button for CP&F entries');
  assert.match(projectBrowserHtml, /function\s+deleteCpfResource\s*\(/, 'Project Browser should define a CP&F delete handler');
  assert.match(projectBrowserHtml, /async\s+function\s+deleteResourceFromEvidenceDesk\s*\([\s\S]*try\s*\{[\s\S]*if\s*\(folder\?\.key\s*===\s*'cpfs'\)\s*\{[\s\S]*await\s+deleteCpfResource\(/, 'CP&F delete should run inside the shared delete try/catch so runtime errors surface as controlled remove errors');
  assert.match(projectBrowserHtml, /findCpfPointLinksAsync\(projectContext\?\.projectFile, resolvePointFileText, instrument\)/, 'CP&F delete flow should detect linked point references by instrument using async resolver');
  assert.match(projectBrowserHtml, /window\.confirm\(`This CP&F is linked to/, 'CP&F delete flow should ask for confirmation when linked points exist');
  assert.match(projectBrowserHtml, /function\s+isCpfStarredForFieldBook\s*\(/, 'Project Browser should define a field-book star helper for CP&F records');
  assert.match(projectBrowserHtml, /async\s+function\s+setCpfFieldBookStar\s*\(/, 'Project Browser should define an API-backed CP&F star toggle helper');
  assert.match(projectBrowserHtml, /async\s+function\s+openCpfPrintPreview\s*\(/, 'Project Browser should define an async bulk CP&F print-preview builder');
  assert.match(projectBrowserHtml, /const\s+entries\s*=\s*Array\.isArray\(group\.entries\)\s*\?\s*group\.entries\s*:\s*\[\]/, 'Project Browser should normalize grouped CP&F entry arrays before rendering rows');
  assert.match(projectBrowserHtml, /groupDiv\.appendChild\(buildOneFileRow\(entries\[0\]\)\)/, 'Project Browser should keep CP&F groups collapsed to the first entry by default');
  assert.match(projectBrowserHtml, /const\s+moreDetails\s*=\s*document\.createElement\('details'\)/, 'Project Browser should render expandable details wrappers for additional grouped CP&Fs');
  assert.match(projectBrowserHtml, /for\s*\(const\s+entry\s+of\s+entries\.slice\(1\)\)/, 'Project Browser should place additional grouped CP&Fs inside the expandable section');
  assert.match(projectBrowserHtml, /window\.open\('', '_blank'\)/, 'Print preview should open a writable popup window for inline HTML content');
  assert.match(projectBrowserHtml, /\.filter\(\(entry\) => isCpfStarredForFieldBook\(entry\)\)/, 'Print preview should include only starred CP&F records');
  assert.match(projectBrowserHtml, /printAllButton\.textContent\s*=\s*'Print starred'/, 'CP&F folder should render a Print starred action for field-book CP&Fs');
  assert.match(projectBrowserHtml, /printAllButton\.addEventListener\('click',\s*\(\)\s*=>\s*openCpfPrintPreview\(folder\.index\)\)/, 'Print starred action should open a combined CP&F print preview');
  assert.match(projectBrowserHtml, /async\s+function\s+fetchPdfThumbnailDataUrl\s*\(/, 'Project Browser should define a reusable PDF thumbnail fetcher for previews and print jobs');
  assert.match(projectBrowserHtml, /thumbnail generation timed out/, 'Thumbnail fetch helper should fail with a timeout when generation never completes');
  assert.match(projectBrowserHtml, /<img src="\$\{escapeHtml\(thumbnailDataUrl\)\}" alt="CP&amp;F thumbnail \$\{index \+ 1\}"/, 'Print preview should render CP&F thumbnail images instead of PDF iframes');
  assert.match(projectBrowserHtml, /\.page-block \{ margin: 0 0 1rem; display: flex; justify-content: center; background: #fff; \}/, 'Print preview should center thumbnail pages on-screen with a white background');
  assert.match(projectBrowserHtml, /\.cpf-print-thumbnail \{ width: min\(100%, 8\.5in\);[\s\S]*object-fit: contain;[\s\S]*background: #fff; \}/, 'Print preview should constrain each thumbnail and preserve full-page aspect ratio');
  assert.doesNotMatch(projectBrowserHtml, /<h2>\$\{index \+ 1\}\./, 'Print preview should not inject heading-only pages between PDFs');
  assert.match(projectBrowserHtml, /onclick="window\.print\(\)"/, 'Print preview should include a direct print button');
  assert.match(projectBrowserHtml, /\.cpf-hover-preview-tooltip\s*\{[\s\S]*position:\s*fixed;/, 'Project Browser should style a fixed CP&F hover preview tooltip container');
  assert.match(projectBrowserHtml, /\.cpf-hover-preview-tooltip\s*\{[\s\S]*box-sizing:\s*border-box;/, 'Hover preview tooltip sizing should include padding so viewport clamping remains accurate.');
  assert.match(projectBrowserHtml, /\.cpf-hover-preview-image\s*\{[\s\S]*object-fit:\s*contain;/, 'CP&F hover preview image should use object-fit contain so full pages are visible');
  assert.match(projectBrowserHtml, /const\s+maxHeight\s*=\s*Math\.max\(220,\s*Math\.floor\(viewportHeight\s*\*\s*0\.9\)\)/, 'CP&F hover preview height should be capped at 90% of the viewport');
  assert.match(projectBrowserHtml, /const\s+imageAspectRatio\s*=\s*imageNaturalWidth\s*>\s*0\s*\?\s*\(imageNaturalWidth\s*\/\s*safeImageHeight\)\s*:\s*\(8\.5\s*\/\s*11\)/, 'CP&F hover preview should size itself from the source image aspect ratio');
  assert.match(projectBrowserHtml, /const\s+shouldPlaceRight\s*=\s*availableRight\s*>=\s*previewWidth\s*\|\|\s*availableRight\s*>=\s*availableLeft;/, 'CP&F hover preview should choose left or right placement based on available horizontal space');
  assert.match(projectBrowserHtml, /tooltip\.style\.width\s*=\s*`\$\{Math\.round\(previewWidth\)\}px`;/, 'CP&F hover preview width should use the fitted image width rather than full viewport width');
  assert.match(projectBrowserHtml, /thumb\.tabIndex\s*=\s*0;[\s\S]*bindCpfHoverPreview\(thumb, entry\);/, 'CP&F thumbnails should be keyboard-focusable and wired to the hover preview behavior');
  assert.match(projectBrowserHtml, /function\s+bindHoverPreview\s*\(thumb,\s*entry,\s*\{[\s\S]*requireLoadedFlag\s*=\s*false[\s\S]*\}\s*=\s*\{\}\)\s*\{/, 'Project Browser should define a reusable hover-preview binder for thumbnail images.');
  assert.match(projectBrowserHtml, /async\s+function\s+attachPointFilePreview\s*\([\s\S]*thumb\.tabIndex\s*=\s*0;[\s\S]*bindHoverPreview\(thumb, entry, \{ requireLoadedFlag: false \}\);/, 'Expanded point-file rows should bind hover previews for generated thumbnails.');
  assert.match(projectBrowserHtml, /async\s+function\s+attachDrawingPreview\s*\([\s\S]*thumb\.tabIndex\s*=\s*0;[\s\S]*bindHoverPreview\(thumb, entry, \{ requireLoadedFlag: false \}\);/, 'Expanded drawing rows should bind hover previews for generated thumbnails.');
  assert.match(projectBrowserHtml, /function\s+attachImagePreview\s*\([\s\S]*thumb\.tabIndex\s*=\s*0;[\s\S]*bindHoverPreview\(thumb, entry, \{ requireLoadedFlag: false \}\);/, 'Expanded image rows should bind hover previews for generated thumbnails.');
  assert.match(projectBrowserHtml, /\.image-preview-thumb\s*\{[\s\S]*cursor:\s*zoom-in;/, 'Expanded image thumbnails should expose hover affordance for preview tooltips.');
  assert.doesNotMatch(projectBrowserHtml, /\.image-preview-thumb\s*\{[\s\S]*pointer-events:\s*none;/, 'Expanded image thumbnails should accept pointer events so photo hover previews can open.');
  assert.match(projectBrowserHtml, /async\s+function\s+attachPdfPreview\s*\([\s\S]*thumb\.tabIndex\s*=\s*0;[\s\S]*if \(folder\?\.key === 'cpfs'\) bindCpfHoverPreview\(thumb, entry\);[\s\S]*else bindHoverPreview\(thumb, entry, \{ requireLoadedFlag: false \}\);/, 'Expanded PDF rows should show hover previews in all folders, not only CP&F.');
  assert.match(projectBrowserHtml, /bindHoverPreview\(thumbImg, entry, \{[\s\S]*requireLoadedFlag:\s*true[\s\S]*\}\);/, 'Collapsed folder thumbnail strips should continue using hover previews once thumbnails are loaded.');
});


test('Project Browser keeps hover previews in viewport and enables photo hover events', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /\.cpf-hover-preview-tooltip\s*\{[\s\S]*box-sizing:\s*border-box;/, 'Hover preview tooltip should include padding in its measured width/height so viewport clamps remain accurate.');
  assert.match(projectBrowserHtml, /\.image-preview-thumb\s*\{[\s\S]*cursor:\s*zoom-in;/, 'Image thumbnails should advertise hover preview behavior with a zoom cursor.');
  assert.doesNotMatch(projectBrowserHtml, /\.image-preview-thumb\s*\{[\s\S]*pointer-events:\s*none;/, 'Image thumbnails should receive mouse events so hover previews work for photos.');
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

test('Project Browser allows tagging uploaded photos with point numbers for LineSmith lookup', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /async function saveUploadedResourceMetadata\(folder, entry, updatesRaw, projectContext = \{\}\)/, 'Project Browser should centralize server-upload metadata PATCH updates');
  assert.match(projectBrowserHtml, /const metadataUrl = new URL\('\/api\/project-files\/metadata', window\.location\.origin\)/, 'Project Browser should call metadata PATCH endpoint for uploaded file metadata');
  assert.match(projectBrowserHtml, /function normalizePointNumber\(value = ''\)/, 'Project Browser should normalize point-number metadata input values');
  assert.match(projectBrowserHtml, /async function setPointNumberForUploadedResource\(folder, entry, pointNumberRaw, projectContext = \{\}\)/, 'Project Browser should define a point-number metadata save helper used by upload rows');
  assert.match(projectBrowserHtml, /setPointNumberForUploadedResource\(folder, entry, pointInlineInput\.value, projectContext\)/, 'image upload rows should save point-number metadata through dedicated helper');
  assert.match(projectBrowserHtml, /pointInlineInput\.placeholder = 'Point #'/, 'image upload rows should provide a point number inline input');
  assert.match(projectBrowserHtml, /pointButton\.textContent = 'Save Point #'/, 'image upload rows should provide a Save Point action for point metadata');
  assert.match(projectBrowserHtml, /metadata\?\.pointNumber/, 'rendered resources should read point-number metadata for badges and editing state');
});

test('addCustomFolder appends a new folder with a slugified key and custom marker', () => {
  const projectFile = { folders: [{ key: 'drawings', index: [] }, { key: 'other', index: [] }] };

  const folder = addCustomFolder(projectFile, { label: 'Field Photos', description: 'Site photos', defaultFormat: 'jpg' });

  assert.ok(folder, 'should return the new folder');
  assert.equal(folder.key, 'field-photos');
  assert.equal(folder.label, 'Field Photos');
  assert.equal(folder.description, 'Site photos');
  assert.equal(folder.defaultFormat, 'jpg');
  assert.equal(folder.custom, true);
  assert.deepEqual(folder.index, []);
  assert.equal(projectFile.folders.length, 3);
  assert.equal(projectFile.folders[2].key, 'field-photos');
});

test('addCustomFolder deduplicates keys when a collision exists', () => {
  const projectFile = { folders: [{ key: 'field-photos', index: [] }] };

  const folder = addCustomFolder(projectFile, { label: 'Field Photos' });

  assert.equal(folder.key, 'field-photos-1');
  assert.equal(projectFile.folders.length, 2);
});

test('addCustomFolder uses default format bin and empty description when omitted', () => {
  const projectFile = { folders: [] };

  const folder = addCustomFolder(projectFile, { label: 'Misc' });

  assert.equal(folder.key, 'misc');
  assert.equal(folder.defaultFormat, 'bin');
  assert.equal(folder.description, '');
});

test('addCustomFolder returns null for empty or missing label', () => {
  const projectFile = { folders: [] };

  assert.equal(addCustomFolder(projectFile, { label: '' }), null);
  assert.equal(addCustomFolder(projectFile, {}), null);
  assert.equal(projectFile.folders.length, 0);
});

test('addCustomFolder returns null for invalid projectFile', () => {
  assert.equal(addCustomFolder(null, { label: 'Test' }), null);
  assert.equal(addCustomFolder({ folders: null }, { label: 'Test' }), null);
});

test('removeCustomFolder removes an empty custom folder', () => {
  const projectFile = {
    folders: [
      { key: 'drawings', index: [] },
      { key: 'field-photos', index: [], custom: true },
    ],
  };

  const result = removeCustomFolder(projectFile, 'field-photos');

  assert.equal(result, true);
  assert.equal(projectFile.folders.length, 1);
  assert.equal(projectFile.folders[0].key, 'drawings');
});

test('removeCustomFolder refuses to remove a folder that has items', () => {
  const projectFile = {
    folders: [
      { key: 'field-photos', index: [{ id: 'photo-1' }], custom: true },
    ],
  };

  const result = removeCustomFolder(projectFile, 'field-photos');

  assert.equal(result, false);
  assert.equal(projectFile.folders.length, 1);
});

test('removeCustomFolder refuses to remove a non-custom folder', () => {
  const projectFile = {
    folders: [{ key: 'drawings', index: [] }],
  };

  const result = removeCustomFolder(projectFile, 'drawings');

  assert.equal(result, false);
  assert.equal(projectFile.folders.length, 1);
});

test('removeCustomFolder returns false for unknown folder key', () => {
  const projectFile = { folders: [{ key: 'drawings', index: [], custom: true }] };

  assert.equal(removeCustomFolder(projectFile, 'nonexistent'), false);
});

test('Project Browser includes custom folder management UI', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /addCustomFolder/, 'Project Browser should import and use addCustomFolder');
  assert.match(projectBrowserHtml, /removeCustomFolder/, 'Project Browser should import and use removeCustomFolder');
  assert.match(projectBrowserHtml, /add-folder-panel/, 'Project Browser should render the add-folder UI panel');
  assert.match(projectBrowserHtml, /remove-folder-btn/, 'Project Browser should render remove buttons for custom folders');
  assert.match(projectBrowserHtml, /folder\.custom/, 'Project Browser should check folder.custom to show remove controls');
});

test('MAX_FOLDER_DEPTH is 5', () => {
  assert.equal(MAX_FOLDER_DEPTH, 5);
});

test('getFolderDepth returns 1 for top-level folders', () => {
  const projectFile = {
    folders: [{ key: 'drawings', index: [] }],
  };
  assert.equal(getFolderDepth(projectFile, 'drawings'), 1);
});

test('getFolderDepth returns correct depth for nested folders', () => {
  const projectFile = {
    folders: [
      { key: 'drawings', index: [] },
      { key: 'sub-a', index: [], custom: true, parentKey: 'drawings' },
      { key: 'sub-b', index: [], custom: true, parentKey: 'sub-a' },
      { key: 'sub-c', index: [], custom: true, parentKey: 'sub-b' },
    ],
  };
  assert.equal(getFolderDepth(projectFile, 'drawings'), 1);
  assert.equal(getFolderDepth(projectFile, 'sub-a'), 2);
  assert.equal(getFolderDepth(projectFile, 'sub-b'), 3);
  assert.equal(getFolderDepth(projectFile, 'sub-c'), 4);
});

test('getFolderDepth returns 0 for invalid inputs', () => {
  assert.equal(getFolderDepth(null, 'drawings'), 0);
  assert.equal(getFolderDepth({ folders: [] }, null), 0);
});

test('getFolderChildren returns direct children of a folder', () => {
  const projectFile = {
    folders: [
      { key: 'drawings', index: [] },
      { key: 'sub-a', index: [], custom: true, parentKey: 'drawings' },
      { key: 'sub-b', index: [], custom: true, parentKey: 'drawings' },
      { key: 'sub-c', index: [], custom: true, parentKey: 'sub-a' },
    ],
  };

  const drawingsChildren = getFolderChildren(projectFile, 'drawings');
  assert.equal(drawingsChildren.length, 2);
  assert.ok(drawingsChildren.some((f) => f.key === 'sub-a'));
  assert.ok(drawingsChildren.some((f) => f.key === 'sub-b'));

  const subAChildren = getFolderChildren(projectFile, 'sub-a');
  assert.equal(subAChildren.length, 1);
  assert.equal(subAChildren[0].key, 'sub-c');

  assert.equal(getFolderChildren(projectFile, 'sub-b').length, 0);
});

test('getFolderChildren returns empty array for invalid inputs', () => {
  assert.deepEqual(getFolderChildren(null, 'drawings'), []);
  assert.deepEqual(getFolderChildren({ folders: [] }, null), []);
});

test('addCustomFolder creates a subfolder with parentKey when parentKey is provided', () => {
  const projectFile = {
    folders: [{ key: 'drawings', index: [] }],
  };

  const subfolder = addCustomFolder(projectFile, { label: 'Archive', parentKey: 'drawings' });

  assert.ok(subfolder, 'should return the new subfolder');
  assert.equal(subfolder.key, 'archive');
  assert.equal(subfolder.label, 'Archive');
  assert.equal(subfolder.parentKey, 'drawings');
  assert.equal(subfolder.custom, true);
  assert.equal(projectFile.folders.length, 2);
});

test('addCustomFolder enforces MAX_FOLDER_DEPTH limit', () => {
  const projectFile = {
    folders: [
      { key: 'l1', index: [] },
      { key: 'l2', index: [], custom: true, parentKey: 'l1' },
      { key: 'l3', index: [], custom: true, parentKey: 'l2' },
      { key: 'l4', index: [], custom: true, parentKey: 'l3' },
      { key: 'l5', index: [], custom: true, parentKey: 'l4' },
    ],
  };

  assert.equal(getFolderDepth(projectFile, 'l5'), 5);

  const subfolder = addCustomFolder(projectFile, { label: 'Too Deep', parentKey: 'l5' });
  assert.equal(subfolder, null, 'should refuse to create a folder beyond MAX_FOLDER_DEPTH');
  assert.equal(projectFile.folders.length, 5, 'folder count should not change');
});

test('addCustomFolder allows nesting at exactly MAX_FOLDER_DEPTH - 1', () => {
  const projectFile = {
    folders: [
      { key: 'l1', index: [] },
      { key: 'l2', index: [], custom: true, parentKey: 'l1' },
      { key: 'l3', index: [], custom: true, parentKey: 'l2' },
      { key: 'l4', index: [], custom: true, parentKey: 'l3' },
    ],
  };

  assert.equal(getFolderDepth(projectFile, 'l4'), 4);

  const subfolder = addCustomFolder(projectFile, { label: 'Level 5', parentKey: 'l4' });
  assert.ok(subfolder, 'should allow creating a folder at depth 5');
  assert.equal(getFolderDepth(projectFile, subfolder.key), 5);
});

test('addCustomFolder returns null when parentKey does not exist', () => {
  const projectFile = { folders: [{ key: 'drawings', index: [] }] };

  const result = addCustomFolder(projectFile, { label: 'Sub', parentKey: 'nonexistent' });
  assert.equal(result, null);
});

test('removeCustomFolder refuses to remove a folder that has child folders', () => {
  const projectFile = {
    folders: [
      { key: 'parent', index: [], custom: true },
      { key: 'child', index: [], custom: true, parentKey: 'parent' },
    ],
  };

  const result = removeCustomFolder(projectFile, 'parent');

  assert.equal(result, false);
  assert.equal(projectFile.folders.length, 2);
});

test('removeCustomFolder removes a leaf subfolder with no children and no files', () => {
  const projectFile = {
    folders: [
      { key: 'parent', index: [], custom: true },
      { key: 'child', index: [], custom: true, parentKey: 'parent' },
    ],
  };

  const result = removeCustomFolder(projectFile, 'child');

  assert.equal(result, true);
  assert.equal(projectFile.folders.length, 1);
  assert.equal(projectFile.folders[0].key, 'parent');
});

test('Project Browser includes subfolder management UI', async () => {
  const projectBrowserHtml = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(projectBrowserHtml, /getFolderDepth/, 'Project Browser should import getFolderDepth for depth enforcement');
  assert.match(projectBrowserHtml, /getFolderChildren/, 'Project Browser should import getFolderChildren for child detection');
  assert.match(projectBrowserHtml, /projectBrowserState\.MAX_FOLDER_DEPTH/, 'Project Browser should read MAX_FOLDER_DEPTH from project-browser-state namespace');
  assert.match(projectBrowserHtml, /const\s+MAX_FOLDER_DEPTH\s*=\s*Number\.isFinite\(projectBrowserState\.MAX_FOLDER_DEPTH\)[\s\S]*:\s*5;/, 'Project Browser should fallback to depth 5 when MAX_FOLDER_DEPTH export is unavailable');
  assert.match(projectBrowserHtml, /add-subfolder-panel/, 'Project Browser should render add-subfolder panels');
  assert.match(projectBrowserHtml, /Add subfolder/, 'Project Browser should render Add subfolder buttons');
  assert.match(projectBrowserHtml, /folder-children/, 'Project Browser should render folder-children containers for nesting');
  assert.match(projectBrowserHtml, /parentKey: folder\.key/, 'Project Browser should pass parentKey when creating subfolders');
  assert.match(projectBrowserHtml, /folderChildrenContainerMap/, 'Project Browser should track folder containers for hierarchical rendering');
  assert.match(projectBrowserHtml, /remove its subfolders first/, 'Project Browser should block removal of folders with subfolders');
});
