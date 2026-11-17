const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const exists = (f) => fs.existsSync(path.join(root, f));

test('manifest is MV3 with a name and version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Kwitch');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('every file the manifest points to exists', () => {
  const files = [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...manifest.background.scripts,
    ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css || [])]),
  ];
  for (const f of files) assert.ok(exists(f), f + ' is missing');
});

test('shared.js loads before the scripts that use it', () => {
  assert.deepEqual(manifest.background.scripts, ['shared.js', 'background.js']);
  for (const c of manifest.content_scripts) assert.equal(c.js[0], 'shared.js');
});

test('content script runs on both sites and has host access to them', () => {
  const matches = manifest.content_scripts.flatMap((c) => c.matches);
  assert.ok(matches.includes('https://www.twitch.tv/*'));
  assert.ok(matches.includes('https://kick.com/*'));
  assert.ok(manifest.host_permissions.includes('https://*.twitch.tv/*'));
  assert.ok(manifest.host_permissions.includes('https://kick.com/*'));
  assert.ok(manifest.permissions.includes('cookies'));
});

test('firefox settings declare an id and data collection', () => {
  const gecko = manifest.browser_specific_settings.gecko;
  assert.ok(gecko.id);
  assert.deepEqual(gecko.data_collection_permissions.required, ['none']);
});

test('package version matches the manifest', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, manifest.version);
});
