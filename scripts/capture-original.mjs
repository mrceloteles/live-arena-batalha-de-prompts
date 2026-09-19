import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const origin = 'https://reddoor-google26.phygitalapp.com.br';
const outputRoot = new URL('../evidence/original-public/', import.meta.url);
const manifestUrl = new URL('../evidence/manifest.json', import.meta.url);
const browserUserAgent =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const attemptsPerResource = 1;
const timeoutMs = 8_000;

const pageRequests = [
  { path: 'index.php', url: 'index.php' },
  { path: 'main.php', url: 'main.php' },
  { path: 'game/station-1.html', url: 'game.php?station=1&mode=wait_all' },
  { path: 'game/station-2.html', url: 'game.php?station=2&mode=wait_all' },
  { path: 'game/station-3.html', url: 'game.php?station=3&mode=wait_all' },
  { path: 'wall.php', url: 'wall.php' },
  { path: 'admin.php', url: 'admin.php' },
  { path: 'report.php', url: 'report.php' },
];
const roomStatus = 'api.php?action=room_status';
const staticAssetPaths = [
  'public/assets/fonts/GoogleSans-Regular.ttf',
  'public/assets/fonts/GoogleSans-Medium.ttf',
  'public/assets/fonts/GoogleSans-SemiBold.ttf',
  'public/assets/fonts/GoogleSans-Bold.ttf',
  'public/assets/figma/battle-prompt-muted.png',
  'public/assets/figma/google-startups-logo.png',
  'public/assets/figma/google-startups-muted.png',
  'public/assets/figma/google-startups-white.png',
  'public/assets/figma/loader.png',
  'public/assets/figma/manual-illustration.png',
  'public/assets/figma/manual-instructions-illustration.png',
  'public/assets/figma/pc-idle-arrow.png',
  'public/assets/figma/player-avatar.png',
  'public/assets/figma/prompt-sample.png',
  'public/assets/figma/star.png',
  'public/assets/figma/start-bg.png',
  'public/assets/figma/tv-waiting-players-illustration.png',
  'public/assets/figma/wall-bg.png',
  'public/assets/figma/wall-illustration.png',
];
const codeAssetPaths = [
  'public/assets/css/app.css',
  'public/assets/js/app.js',
];
const explicitGetRequests = [
  ...pageRequests,
  ...codeAssetPaths.map((path) => ({ path, url: path })),
  ...staticAssetPaths.map((path) => ({ path, url: path })),
];
const allowedGetUrls = new Set(
  explicitGetRequests.map(({ url }) => new URL(url, `${origin}/`).href),
);
const requiredPaths = new Set([
  ...explicitGetRequests.map(({ path }) => path),
  'api/room_status.json',
]);

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function withRetries(operation) {
  let failure;
  for (let attempt = 1; attempt <= attemptsPerResource; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

function pathFor(url) {
  if (url.pathname === '/api.php' && url.searchParams.get('action') === 'room_status') {
    return 'api/room_status.json';
  }
  if (url.pathname === '/game.php' && /^[1-3]$/.test(url.searchParams.get('station') ?? '')) {
    return `game/station-${url.searchParams.get('station')}.html`;
  }
  const decoded = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const safe = normalize(decoded).replace(/^(\.\.([/\\]|$))+/, '');
  if (!safe || safe.startsWith('..') || safe.includes('\\0')) {
    throw new Error(`unsafe capture path: ${url.pathname}`);
  }
  return safe;
}

export function isAllowedCaptureUrl(url) {
  return url instanceof URL && allowedGetUrls.has(url.href);
}

function isImmutableAsset(url) {
  return /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp4|webm)$/i.test(url.pathname);
}

export function createImmutableComparison(browserContents, wgetContents, error) {
  const comparison = {
    method: 'browser-fetch+wget',
    ...(browserContents === null ? {} : { browserSha256: sha256(browserContents) }),
  };
  if (wgetContents === null) {
    return { ...comparison, matches: null, error: String(error) };
  }
  const wgetSha256 = sha256(wgetContents);
  return {
    ...comparison,
    wgetSha256,
    matches: comparison.browserSha256 === wgetSha256,
  };
}

function withUnprovenComparison(entry, error) {
  if (entry.comparison || !isImmutableAsset(new URL(sourceUrlFor(entry.path)))) return entry;
  return {
    ...entry,
    comparison: createImmutableComparison(null, null, error),
  };
}

export function summarizeComparisons(entries) {
  const comparisons = entries.map((entry) => entry.comparison).filter(Boolean);
  const matching = comparisons.filter((comparison) => comparison.matches === true).length;
  const mismatching = comparisons.filter((comparison) => comparison.matches === false).length;
  const unproven = comparisons.filter((comparison) => comparison.matches === null).length;
  return {
    eligible: comparisons.length,
    compared: matching + mismatching,
    matching,
    mismatching,
    unproven,
  };
}

export function formatComparisonSummary(summary) {
  return `immutable comparisons: ${summary.compared} compared (${summary.matching} matching, ${summary.mismatching} mismatching), ${summary.unproven} unproven`;
}

async function browserGet(url) {
  const response = await fetch(url, {
    headers: { accept: '*/*', 'user-agent': browserUserAgent },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const location = response.headers.get('location');
  return {
    status: response.status,
    contents: Buffer.from(await response.arrayBuffer()),
    redirectTo: location ? new URL(location, url).href : undefined,
  };
}

async function wgetGet(url, directory) {
  const destination = join(directory, `wget-${sha256(url.href)}`);
  try {
    await execFileAsync('wget', [
      '--quiet',
      '--tries=1',
      '--timeout=8',
      '--max-redirect=0',
      '--user-agent',
      browserUserAgent,
      '--output-document',
      destination,
      url,
    ]);
  } catch (error) {
    if (error.code !== 8) throw error;
  }
  try {
    return await readFile(destination);
  } catch (error) {
    if (error.code === 'ENOENT') return Buffer.alloc(0);
    throw error;
  }
}

async function writeCaptured(path, contents, rootDirectory = outputRoot.pathname) {
  const resolvedRoot = resolve(rootDirectory);
  const destination = resolve(resolvedRoot, path);
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`capture escaped output directory: ${path}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

async function captureGet(url, comparisonDirectory) {
  const browser = await withRetries(() => browserGet(url));
  if (browser.status !== 200 && browser.status !== 302) {
    throw new Error(`GET ${url} returned ${browser.status}`);
  }
  if (!isImmutableAsset(url)) return browser;
  try {
    const wget = await withRetries(() => wgetGet(url, comparisonDirectory));
    return {
      ...browser,
      comparison: createImmutableComparison(browser.contents, wget),
    };
  } catch (error) {
    return {
      ...browser,
      comparison: createImmutableComparison(browser.contents, null, error.message ?? error),
    };
  }
}

function sourceUrlFor(path) {
  if (path === 'api/room_status.json') return new URL(roomStatus, `${origin}/`).href;
  const station = path.match(/^game\/station-([1-3])\.html$/);
  if (station) return new URL(`game.php?station=${station[1]}&mode=wait_all`, `${origin}/`).href;
  return new URL(path, `${origin}/`).href;
}

async function existingFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await existingFiles(join(directory, entry.name), path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

async function entryMatchesFile(entry, directory) {
  if (entry?.status !== 200 && entry?.status !== 302) return false;
  try {
    const contents = await readFile(join(directory, entry.path));
    return entry.bytes === contents.length && entry.sha256 === sha256(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function lastCaptureAttemptFor(attempt) {
  return {
    status: attempt.status,
    ...(attempt.httpStatus === undefined ? {} : { httpStatus: attempt.httpStatus }),
    capturedAt: attempt.capturedAt,
    captureError: attempt.captureError,
    ...(attempt.comparison ? { comparison: attempt.comparison } : {}),
  };
}

function rejectedDivergentAttempt(attempt) {
  const captureError = 'immutable browser/wget hashes diverged; staged bytes were rejected';
  return {
    url: attempt.url,
    path: attempt.path,
    status: 0,
    httpStatus: attempt.status,
    bytes: 0,
    sha256: sha256(Buffer.alloc(0)),
    capturedAt: attempt.capturedAt,
    captureError,
    comparison: attempt.comparison,
    rejectedCapture: {
      bytes: attempt.bytes,
      sha256: attempt.sha256,
    },
  };
}

function acceptedCaptureEntry(attempt) {
  if (attempt.comparison?.matches === true) {
    return {
      ...attempt,
      provenance: { kind: 'browser-wget-match', verified: true },
    };
  }
  if (attempt.comparison?.matches === null) {
    return {
      ...attempt,
      provenance: { kind: 'single-source-unverified', verified: false },
    };
  }
  return attempt;
}

function failedInventoryEntry(path, reconstructedAt) {
  return {
    url: sourceUrlFor(path),
    path,
    status: 0,
    bytes: 0,
    sha256: sha256(Buffer.alloc(0)),
    capturedAt: reconstructedAt,
    provenance: {
      kind: 'manifest-reconstruction',
      observedAt: reconstructedAt,
    },
    captureError: 'not captured: no local bytes or prior verified capture metadata',
  };
}

export async function indexExistingEvidence({
  evidenceDirectory,
  previousManifest = [],
  reconstructedAt = new Date().toISOString(),
}) {
  const previousByPath = new Map(previousManifest.map((entry) => [entry.path, entry]));
  const manifest = [];
  const files = await existingFiles(evidenceDirectory);
  for (const path of files.sort()) {
    const contents = await readFile(join(evidenceDirectory, path));
    const previous = previousByPath.get(path);
    if (
      (previous?.status === 200 || previous?.status === 302)
      && previous.bytes === contents.length
      && previous.sha256 === sha256(contents)
    ) {
      manifest.push(withUnprovenComparison(previous, 'comparison metadata unavailable in preserved manifest'));
      continue;
    }
    const fileStat = await stat(join(evidenceDirectory, path));
    manifest.push(withUnprovenComparison({
      url: sourceUrlFor(path),
      path,
      status: null,
      bytes: contents.length,
      sha256: sha256(contents),
      capturedAt: fileStat.mtime.toISOString(),
      provenance: {
        kind: 'local-file-mtime',
        observedAt: reconstructedAt,
      },
    }, 'comparison metadata unavailable for local-only evidence'));
  }

  const byPath = new Map(manifest.map((entry) => [entry.path, entry]));
  for (const path of requiredPaths) {
    if (byPath.has(path)) continue;
    const previous = previousByPath.get(path);
    const entry = previous?.status === 0 && previous.captureError
      ? previous
      : failedInventoryEntry(path, reconstructedAt);
    byPath.set(path, withUnprovenComparison(entry, entry.captureError));
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export async function mergeCaptureAttempt({
  outputDirectory,
  stagingDirectory,
  previousManifest = [],
  attemptManifest,
}) {
  const previousByPath = new Map(previousManifest.map((entry) => [entry.path, entry]));
  const merged = new Map(previousByPath);
  for (const attempt of attemptManifest) {
    if (attempt.comparison?.matches === false) {
      const rejected = rejectedDivergentAttempt(attempt);
      const previous = previousByPath.get(attempt.path);
      if (await entryMatchesFile(previous, outputDirectory)) {
        merged.set(attempt.path, {
          ...previous,
          lastCaptureAttempt: lastCaptureAttemptFor(rejected),
        });
      } else {
        merged.set(attempt.path, rejected);
      }
      continue;
    }

    if (attempt.status === 200 || attempt.status === 302) {
      const stagedContents = await readFile(join(stagingDirectory, attempt.path));
      if (attempt.bytes !== stagedContents.length || attempt.sha256 !== sha256(stagedContents)) {
        throw new Error(`staged capture failed verification: ${attempt.path}`);
      }
      const destination = resolve(outputDirectory, attempt.path);
      const resolvedOutput = resolve(outputDirectory);
      if (destination !== resolvedOutput && !destination.startsWith(`${resolvedOutput}${sep}`)) {
        throw new Error(`capture escaped output directory: ${attempt.path}`);
      }
      await mkdir(dirname(destination), { recursive: true });
      await rename(join(stagingDirectory, attempt.path), destination);
      merged.set(attempt.path, acceptedCaptureEntry(attempt));
      continue;
    }

    const previous = previousByPath.get(attempt.path);
    if (await entryMatchesFile(previous, outputDirectory)) {
      merged.set(attempt.path, {
        ...previous,
        lastCaptureAttempt: lastCaptureAttemptFor(attempt),
      });
    } else {
      merged.set(attempt.path, attempt);
    }
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function manifestFromExisting() {
  const reconstructedAt = new Date().toISOString();
  let previousManifest = [];
  try {
    previousManifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const manifest = await indexExistingEvidence({
    evidenceDirectory: outputRoot.pathname,
    previousManifest,
    reconstructedAt,
  });
  await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`indexed ${manifest.length} evidence records from local files and preserved provenance`);
}

async function captureStaticAssets() {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const capturedAt = new Date().toISOString();
  const comparisonDirectory = await mkdtemp(join(tmpdir(), 'descubra-o-prompt-wget-'));
  await mkdir(dirname(outputRoot.pathname), { recursive: true });
  const stagingDirectory = await mkdtemp(join(dirname(outputRoot.pathname), '.original-public-stage-'));
  const attempts = [];
  const captureOne = async (path) => {
    const url = new URL(path, `${origin}/`);
    try {
      const response = await captureGet(url, comparisonDirectory);
      await writeCaptured(path, response.contents, stagingDirectory);
      attempts.push({
        url: url.href,
        path,
        status: response.status,
        bytes: response.contents.length,
        sha256: sha256(response.contents),
        capturedAt,
        ...(response.comparison ? { comparison: response.comparison } : {}),
      });
    } catch (error) {
      const captureError = String(error.message ?? error);
      attempts.push({
        url: url.href,
        path,
        status: 0,
        bytes: 0,
        sha256: sha256(Buffer.alloc(0)),
        capturedAt,
        comparison: createImmutableComparison(null, null, captureError),
        captureError,
      });
    }
  };

  try {
    for (let index = 0; index < staticAssetPaths.length; index += 8) {
      await Promise.all(staticAssetPaths.slice(index, index + 8).map(captureOne));
    }
  } finally {
    await rm(comparisonDirectory, { recursive: true, force: true });
  }
  try {
    const updated = await mergeCaptureAttempt({
      outputDirectory: outputRoot.pathname,
      stagingDirectory,
      previousManifest: manifest,
      attemptManifest: attempts,
    });
    await writeFile(manifestUrl, `${JSON.stringify(updated, null, 2)}\n`);
    const accepted = attempts.filter((entry) => entry.status === 200 && entry.comparison?.matches !== false).length;
    console.log(`static capture attempt: ${accepted}/${staticAssetPaths.length} accepted without divergence; ${formatComparisonSummary(summarizeComparisons(attempts))}`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

async function captureRoomStatus() {
  const response = await withRetries(() => fetch(new URL(roomStatus, `${origin}/`), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': browserUserAgent,
    },
    body: '{}',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  }));
  const contents = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200) throw new Error(`POST ${roomStatus} returned ${response.status}`);
  return { status: response.status, contents };
}

async function main() {
  let previousManifest = [];
  try {
    previousManifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(outputRoot.pathname), { recursive: true });
  await mkdir(outputRoot.pathname, { recursive: true });
  const stagingDirectory = await mkdtemp(join(dirname(outputRoot.pathname), '.original-public-stage-'));
  const comparisonDirectory = await mkdtemp(join(tmpdir(), 'descubra-o-prompt-wget-'));
  const capturedAt = new Date().toISOString();
  const queue = explicitGetRequests.map((request) => ({
    path: request.path,
    url: new URL(request.url, `${origin}/`),
  }));
  const seen = new Set();
  const manifest = [];

  try {
    while (queue.length) {
      const request = queue.shift();
      const { url } = request;
      const path = request.path ?? pathFor(url);
      if (seen.has(path)) continue;
      seen.add(path);
      if (!isAllowedCaptureUrl(url)) throw new Error(`capture URL is not allowlisted: ${url.href}`);

      try {
        const response = await captureGet(url, comparisonDirectory);
        await writeCaptured(path, response.contents, stagingDirectory);
        const entry = {
          url: url.href,
          path,
          status: response.status,
          bytes: response.contents.length,
          sha256: sha256(response.contents),
          capturedAt,
        };
        if (response.redirectTo) entry.redirectTo = response.redirectTo;
        if (response.comparison) entry.comparison = response.comparison;
        manifest.push(entry);
      } catch (error) {
        const captureError = String(error.message ?? error);
        manifest.push({
          url: url.href,
          path,
          status: 0,
          bytes: 0,
          sha256: sha256(Buffer.alloc(0)),
          capturedAt,
          ...(isImmutableAsset(url)
            ? { comparison: createImmutableComparison(null, null, captureError) }
            : {}),
          captureError,
        });
      }
    }

    try {
      const room = await captureRoomStatus();
      await writeCaptured('api/room_status.json', room.contents, stagingDirectory);
      manifest.push({
        url: new URL(roomStatus, `${origin}/`).href,
        path: 'api/room_status.json',
        status: room.status,
        bytes: room.contents.length,
        sha256: sha256(room.contents),
        capturedAt,
      });
    } catch (error) {
      manifest.push({
        url: new URL(roomStatus, `${origin}/`).href,
        path: 'api/room_status.json',
        status: 0,
        bytes: 0,
        sha256: sha256(Buffer.alloc(0)),
        capturedAt,
        captureError: String(error.message ?? error),
      });
    }

    const missing = [...requiredPaths].filter((path) => !manifest.some((entry) => entry.path === path));
    if (missing.length) throw new Error(`capture did not queue required resources: ${missing.join(', ')}`);

    manifest.sort((left, right) => left.path.localeCompare(right.path));
    const merged = await mergeCaptureAttempt({
      outputDirectory: outputRoot.pathname,
      stagingDirectory,
      previousManifest,
      attemptManifest: manifest,
    });
    await writeFile(manifestUrl, `${JSON.stringify(merged, null, 2)}\n`);
    const accepted = manifest.filter(
      (entry) => (entry.status === 200 || entry.status === 302) && entry.comparison?.matches !== false,
    ).length;
    console.log(`capture attempt: ${accepted}/${manifest.length} accepted without divergence; ${formatComparisonSummary(summarizeComparisons(manifest))}`);
  } finally {
    await Promise.all([
      rm(comparisonDirectory, { recursive: true, force: true }),
      rm(stagingDirectory, { recursive: true, force: true }),
    ]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--manifest-from-existing')) {
    await manifestFromExisting();
  } else if (process.argv.includes('--static-assets')) {
    await captureStaticAssets();
  } else {
    await main();
  }
}
