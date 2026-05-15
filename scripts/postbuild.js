import { copyFileSync, mkdirSync, existsSync, writeFileSync, rmSync, readFileSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });

/** Semver patch +1 (e.g. 1.0.3 -> 1.0.4). */
function bumpPatchVersion(version) {
  const parts = String(version).split('.');
  if (parts.length < 3) return version;
  const patch = parseInt(parts[2], 10);
  parts[2] = String(Number.isFinite(patch) ? patch + 1 : 1);
  return parts.join('.');
}

// Step 1: Bump root manifest patch, sync to dist (Chrome uses version to invalidate cached devtools paths)
const rootManifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(rootManifestPath, 'utf-8'));
manifest.version = bumpPatchVersion(manifest.version);
writeFileSync(rootManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Step 2: Copy icons
const iconsDir = resolve(dist, 'icons');
mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 48, 128]) {
  copyFileSync(resolve(root, `icons/icon${size}.png`), resolve(iconsDir, `icon${size}.png`));
}

// Step 3: Create devtools directory
const devtoolsDir = resolve(dist, 'devtools');
mkdirSync(devtoolsDir, { recursive: true });
writeFileSync(resolve(devtoolsDir, 'devtools.html'), `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>API Inspector DevTools</title></head>
<body>
<script src="devtools.js"><\/script>
</body>
</html>`);

const devtoolsIife = resolve(dist, 'devtools.iife.js');
if (existsSync(devtoolsIife)) {
  renameSync(devtoolsIife, resolve(devtoolsDir, 'devtools.js'));
} else {
  console.warn('devtools.iife.js missing; falling back to stub devtools.js');
  writeFileSync(
    resolve(devtoolsDir, 'devtools.js'),
    `chrome.devtools.panels.create('API Inspector','icons/icon16.png','devtools/panel/panel.html');`
  );
}

// Step 4: Setup panel
const panelDir = resolve(dist, 'devtools/panel');
mkdirSync(panelDir, { recursive: true });

// Inline panel CSS into HTML
let panelCss = '';
const panelCssPath = resolve(dist, 'assets/panel.css');
if (existsSync(panelCssPath)) panelCss = readFileSync(panelCssPath, 'utf-8');

writeFileSync(resolve(panelDir, 'panel.html'), `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>API Inspector</title>
<style>${panelCss}</style>
</head>
<body>
<div id="app"></div>
<script src="panel.js"><\/script>
</body>
</html>`);

// Move panel IIFE to panel dir
const panelIife = resolve(dist, 'panel.iife.js');
if (existsSync(panelIife)) {
  renameSync(panelIife, resolve(panelDir, 'panel.js'));
}

// Step 5: Setup popup
const popupDir = resolve(dist, 'popup');
mkdirSync(popupDir, { recursive: true });

let popupCss = '';
const popupCssPath = resolve(dist, 'assets/popup.css');
if (existsSync(popupCssPath)) popupCss = readFileSync(popupCssPath, 'utf-8');

writeFileSync(resolve(popupDir, 'popup.html'), `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>API Inspector</title>
<style>${popupCss}</style>
</head>
<body>
<div id="app"></div>
<script src="popup.js"><\/script>
</body>
</html>`);

const popupIife = resolve(dist, 'popup.iife.js');
if (existsSync(popupIife)) {
  renameSync(popupIife, resolve(popupDir, 'popup.js'));
}

// Step 6: Setup service-worker
const swIife = resolve(dist, 'service-worker.iife.js');
if (existsSync(swIife)) {
  renameSync(swIife, resolve(dist, 'service-worker.js'));
}

// Step 7: Clean up
for (const f of ['chunks', 'assets', 'src', 'panel.js', 'popup.js', 'api-inspector.css']) {
  const p = resolve(dist, f);
  if (existsSync(p)) {
    const stat = await import('fs').then(fs => fs.statSync(p));
    if (stat.isDirectory()) rmSync(p, { recursive: true });
    else rmSync(p);
  }
}

console.log('Post-build complete. Extension ready in dist/');
