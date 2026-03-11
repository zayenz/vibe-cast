import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const workspaceRoot = process.cwd();
const distDir = path.join(workspaceRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const assetFiles = fs.readdirSync(assetsDir).sort();

function extractIndexAsset(regex) {
  const match = indexHtml.match(regex);
  return match ? match[1] : null;
}

function findAsset(prefix) {
  return assetFiles.find((file) => file.startsWith(prefix)) ?? null;
}

function sizeInfo(relativePath) {
  const fullPath = path.join(distDir, relativePath);
  const content = fs.readFileSync(fullPath);
  return {
    relativePath,
    rawBytes: content.length,
    gzipBytes: zlib.gzipSync(content).length,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(2)} KiB`;
  }

  return `${(kib / 1024).toFixed(2)} MiB`;
}

function printGroup(title, entries) {
  console.log(`\n${title}`);
  let rawTotal = 0;
  let gzipTotal = 0;

  for (const entry of entries) {
    rawTotal += entry.rawBytes;
    gzipTotal += entry.gzipBytes;
    console.log(
      `- ${entry.relativePath}: raw=${formatBytes(entry.rawBytes)}, gzip=${formatBytes(entry.gzipBytes)}`,
    );
  }

  console.log(`  total: raw=${formatBytes(rawTotal)}, gzip=${formatBytes(gzipTotal)}`);
}

const entryScript = extractIndexAsset(/src="\/assets\/([^"]+)"/);
const entryStylesheet = extractIndexAsset(/href="\/assets\/([^"]+)"/);

const remoteRelatedAssets = [
  entryScript ? sizeInfo(path.join('assets', entryScript)) : null,
  entryStylesheet ? sizeInfo(path.join('assets', entryStylesheet)) : null,
  findAsset('RemoteControl-') ? sizeInfo(path.join('assets', findAsset('RemoteControl-'))) : null,
  findAsset('useAppState-') ? sizeInfo(path.join('assets', findAsset('useAppState-'))) : null,
  findAsset('iconSet-') ? sizeInfo(path.join('assets', findAsset('iconSet-'))) : null,
].filter(Boolean);

const desktopHeavyAssets = [
  findAsset('ControlPlaneRouter-') ? sizeInfo(path.join('assets', findAsset('ControlPlaneRouter-'))) : null,
  findAsset('VisualizerWindow-') ? sizeInfo(path.join('assets', findAsset('VisualizerWindow-'))) : null,
  findAsset('store-') ? sizeInfo(path.join('assets', findAsset('store-'))) : null,
].filter(Boolean);

console.log('Remote bundle report');
console.log(`dist: ${distDir}`);

printGroup('Estimated phone remote first-load assets', remoteRelatedAssets);
printGroup('Desktop-heavy emitted assets', desktopHeavyAssets);
