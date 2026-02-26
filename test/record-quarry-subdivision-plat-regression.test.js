import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry builds subdivision plat doc-id index and caps nearby subdivision results', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+SUBDIVISION_NEARBY_MAX_RESULTS\s*=\s*18\s*;/, 'RecordQuarry should cap nearby subdivision results to avoid rendering freezes.');
  assert.match(html, /const\s+byDocId\s*=\s*new\s+Map\(\);[\s\S]*if\s*\(docIdKey\s*&&\s*!byDocId\.has\(docIdKey\)\)\s+byDocId\.set\(docIdKey,\s*parsed\);/, 'RecordQuarry should index subdivision plats by document id for fast matching.');
  assert.match(html, /for\s*\(const\s+sourceId\s+of\s+sourceIds\)\s*\{[\s\S]*byDocId\?\.get\(/, 'RecordQuarry should match subdivision plats via the indexed source-id map.');

  assert.match(html, /titlePart\s*=\s*titlePart\.replace\(resolvedPath,\s*' '\)/, 'RecordQuarry should parse subdivision plat lines where the file path and subdivision name are in the same whitespace-delimited field.');
  assert.match(html, /\.replace\(\/\\bS\\d\{4,\}\\d\{0,2\}\\b\/g,\s*' '\)/, 'RecordQuarry should remove inline subdivision plat document-id tokens before name matching.');
  assert.match(html, /function\s+getSubdivisionNameCandidates\s*\(/, 'RecordQuarry should derive multiple subdivision name candidates from feature attributes for plat matching.');
  assert.match(html, /const\s+normalizedCandidates\s*=\s*getSubdivisionNameCandidates\(attrs,\s*subdivisionName\);/, 'RecordQuarry should match subdivision plats from a prioritized set of subdivision name candidates.');
  assert.match(html, /function\s+buildSubdivisionPlatThumbnailUrl\s*\(/, 'RecordQuarry should normalize subdivision plat thumbnails through a helper.');
  assert.match(html, /const\s+SUBDIVISION_THUMB_PLACEHOLDER_DATA_URL\s*=\s*`data:image\/svg\+xml;utf8,\$\{encodeURIComponent\(/, 'RecordQuarry should define an inline SVG placeholder while subdivision thumbnails are generating.');
  assert.match(html, /function\s+buildSubdivisionThumbnailMarkup\s*\([\s\S]*data-keep-placeholder="1"/, 'RecordQuarry should render subdivision plat <img> markup with a keep-placeholder flag for deferred thumbnail APIs.');
  assert.ok(html.includes(".replace(/\\\\+/g, '/')"), 'RecordQuarry should normalize SubPagesList Windows-style backslash plat paths into URL-safe forward slashes.');
  assert.ok(html.includes("const fileMatch = raw.match(/[A-Za-z0-9._\\\\/ -]+\\.(?:pdf|jpe?g|png|tiff?)/i);"), 'RecordQuarry should parse local SubPagesList plat paths that use backslash directory separators.');
  assert.match(html, /\/api\/project-files\/ros-thumbnail\?\$\{new URLSearchParams\(\{ source: sourceUrl \}\)\}/, 'RecordQuarry should route subdivision TIFF thumbnails through the ros-thumbnail API endpoint.');
  assert.match(html, /thumbnailUrl:\s*buildSubdivisionPlatThumbnailUrl\(platUrl\)/, 'RecordQuarry should derive subdivision card thumbnails from the normalized plat-thumbnail helper.');
  assert.match(html, /wrap\.innerHTML\s*=\s*buildSubdivisionThumbnailMarkup\(subdivisionName,\s*plat\.thumbnailUrl\);/, 'RecordQuarry subdivision cards should always render thumbnail markup via the shared subdivision thumbnail helper.');
  assert.match(html, /c\.classList\.add\('subdivision-card'\);/, 'RecordQuarry subdivision cards should mark cards with a subdivision class so card-specific layout rules can apply.');
  assert.match(html, /const\s+subdivisionThumb\s*=\s*c\.querySelector\('img\.subdivision-plat-thumb'\);[\s\S]*wrap\.className\s*=\s*'subdivision-thumb-float';[\s\S]*c\.insertBefore\(wrap,\s*c\.firstChild\);/, 'RecordQuarry should move subdivision thumbnails into a floating left wrapper so the thumbnail sits beside the header like ROS cards.');
  assert.match(html, /\.card\.subdivision-card\s*>\s*\.chead\{[\s\S]*padding-right:44px;/, 'RecordQuarry subdivision card headers should reserve space for the star toggle button.');
  assert.match(html, /\.subdivision-thumb-float\{[\s\S]*float:left;/, 'RecordQuarry should define a floating subdivision thumbnail wrapper style.');
  assert.match(html, /\.subdivision-thumb-float\s*>\s*\.subdivision-plat-thumb\{[\s\S]*float:none;[\s\S]*display:block;/, 'RecordQuarry subdivision floating thumbnail wrapper should normalize subdivision image sizing/alignment.');
  assert.match(html, /if\s*\(!ok\s*&&\s*img\.dataset\.keepPlaceholder\s*!==\s*'1'\)\s*img\.style\.display\s*=\s*'none';/, 'RecordQuarry should keep subdivision placeholder images visible when deferred thumbnail generation does not complete yet.');
  assert.match(html, /function\s+subdivisionTokenOverlapScore\s*\(/, 'RecordQuarry should score subdivision-name token overlap to match plat list entries when legal descriptions add extra words.');
  assert.match(html, /if\s*\(bestEntry\s*&&\s*bestScore\s*>=\s*0\.67\)\s*return\s+bestEntry;/, 'RecordQuarry should accept high-confidence token-overlap subdivision matches to resolve plat thumbnails.');
  assert.match(html, /geometryType:\s*'esriGeometryPoint'[\s\S]*geometry:\s*`\$\{centroid\.x\},\$\{centroid\.y\}`[\s\S]*distance:\s*SUBDIVISION_NEARBY_RADIUS_M/, 'RecordQuarry should query nearby subdivisions from the parcel centroid point with the configured radius.');
  assert.match(html, /state\.nearbySubdivisions\s*=\s*dedupeNearbySubdivisionEntries\(nearbyWithPlatData,\s*parcel\);/, 'RecordQuarry should dedupe nearby subdivision results using subdivision identity, not parcel-lot object IDs.');
  assert.match(html, /state\.nearbySubdivisions\s*=\s*limitNearbySubdivisionEntries\(state\.nearbySubdivisions,\s*parcel,\s*SUBDIVISION_NEARBY_MAX_RESULTS\);/, 'RecordQuarry should trim nearby subdivision entries before rendering cards.');
  assert.match(html, /function\s+simplifyPolygonForDisplay\s*\(/, 'RecordQuarry should simplify heavy subdivision geometries before drawing.');
  assert.match(html, /const\s+displayFeature\s*=\s*simplifyPolygonForDisplay\(feature,\s*SUBDIVISION_DRAW_MAX_VERTICES\);/, 'RecordQuarry should render subdivision polygons using simplified display geometry.');
});
