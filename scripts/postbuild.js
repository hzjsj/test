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
writeFileSync(rootManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

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
</html>`, 'utf-8');

const devtoolsIife = resolve(dist, 'devtools.iife.js');
if (existsSync(devtoolsIife)) {
  renameSync(devtoolsIife, resolve(devtoolsDir, 'devtools.js'));
} else {
  console.warn('devtools.iife.js missing; falling back to stub devtools.js');
  writeFileSync(
    resolve(devtoolsDir, 'devtools.js'),
    `chrome.devtools.panels.create('API Inspector','icons/icon16.png','devtools/panel/panel.html');`,
    'utf-8'
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
</html>`, 'utf-8');

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
</html>`, 'utf-8');

const popupIife = resolve(dist, 'popup.iife.js');
if (existsSync(popupIife)) {
  renameSync(popupIife, resolve(popupDir, 'popup.js'));
}

// Step 6: Setup service-worker
const swIife = resolve(dist, 'service-worker.iife.js');
if (existsSync(swIife)) {
  renameSync(swIife, resolve(dist, 'service-worker.js'));
}

// Step 7: Ensure all JS files are UTF-8 without BOM (Chrome Manifest V3 requirement)
const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const UTF16LE_BOM = Buffer.from([0xFF, 0xFE]);
const UTF16BE_BOM = Buffer.from([0xFE, 0xFF]);

function isLikelyUtf16WithoutBom(buf) {
  if (buf.length < 4) return false;
  let evenNulls = 0;
  let oddNulls = 0;
  const sample = Math.min(buf.length, 4096);
  for (let i = 0; i < sample; i += 1) {
    if (buf[i] === 0x00) {
      if (i % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }
  // ASCII-heavy UTF-16 data usually has many NUL bytes in one parity.
  // Be conservative: require both a high NUL ratio and clear parity skew to avoid false positives.
  const totalNulls = evenNulls + oddNulls;
  if (totalNulls <= sample * 0.2) return false;
  return Math.abs(evenNulls - oddNulls) >= sample * 0.1;
}

function normalizeJsEncoding(jsFile) {
  const raw = readFileSync(jsFile);

  if (raw.slice(0, 3).equals(UTF8_BOM)) {
    writeFileSync(jsFile, raw.slice(3));
    console.log(`[postbuild] stripped UTF-8 BOM: ${jsFile}`);
    return;
  }

  if (raw.slice(0, 2).equals(UTF16LE_BOM)) {
    writeFileSync(jsFile, raw.slice(2).toString('utf16le'), 'utf-8');
    console.log(`[postbuild] converted UTF-16LE to UTF-8: ${jsFile}`);
    return;
  }

  if (raw.slice(0, 2).equals(UTF16BE_BOM)) {
    const swapped = Buffer.alloc(raw.length - 2);
    for (let i = 2; i + 1 < raw.length; i += 2) {
      swapped[i - 2] = raw[i + 1];
      swapped[i - 1] = raw[i];
    }
    writeFileSync(jsFile, swapped.toString('utf16le'), 'utf-8');
    console.log(`[postbuild] converted UTF-16BE to UTF-8: ${jsFile}`);
    return;
  }

  if (isLikelyUtf16WithoutBom(raw)) {
    writeFileSync(jsFile, raw.toString('utf16le'), 'utf-8');
    console.log(`[postbuild] converted likely UTF-16 (no BOM) to UTF-8: ${jsFile}`);
    return;
  }

  // Validate UTF-8 strictly. If invalid, throw to avoid producing a broken package.
  new TextDecoder('utf-8', { fatal: true }).decode(raw);
}


for (const jsFile of [
  resolve(dist, 'content-script.js'),
  resolve(dist, 'service-worker.js'),
  resolve(devtoolsDir, 'devtools.js'),
  resolve(panelDir, 'panel.js'),
  resolve(popupDir, 'popup.js'),
]) {
  if (!existsSync(jsFile)) continue;
  normalizeJsEncoding(jsFile);
}

// Step 8: Clean up
for (const f of ['chunks', 'assets', 'src', 'panel.js', 'popup.js', 'api-inspector.css']) {
  const p = resolve(dist, f);
  if (existsSync(p)) {
    const stat = await import('fs').then(fs => fs.statSync(p));
    if (stat.isDirectory()) rmSync(p, { recursive: true });
    else rmSync(p);
  }
}

console.log('Post-build complete. Extension ready in dist/');
