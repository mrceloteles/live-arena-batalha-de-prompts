import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const scriptUrl = new URL('scripts/capture-original.mjs', root);
const capture = await import(scriptUrl);

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

test('importing the capture module has no capture side effects', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'capture-original-import-'));
  const fixtureScript = join(fixtureRoot, 'scripts/capture-original.mjs');
  mkdirSync(dirname(fixtureScript), { recursive: true });
  copyFileSync(scriptUrl, fixtureScript);

  try {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "globalThis.fetch = async () => { throw new Error('network forbidden'); }; await import(process.argv[1]);",
        pathToFileURL(fixtureScript).href,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(fixtureRoot, 'evidence/manifest.json')), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('local reindex preserves verified capture metadata and labels legacy file provenance', async () => {
  assert.equal(typeof capture.indexExistingEvidence, 'function');
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'capture-original-index-'));
  const preservedContents = Buffer.from('preserved bytes');
  const legacyContents = Buffer.from('legacy bytes');
  const preservedPath = join(fixtureRoot, 'index.php');
  const legacyPath = join(fixtureRoot, 'main.php');
  writeFileSync(preservedPath, preservedContents);
  writeFileSync(legacyPath, legacyContents);
  const legacyMtime = new Date('2024-03-04T05:06:07.000Z');
  utimesSync(legacyPath, legacyMtime, legacyMtime);
  const previous = {
    url: 'https://reddoor-google26.phygitalapp.com.br/index.php',
    path: 'index.php',
    status: 200,
    bytes: preservedContents.length,
    sha256: digest(preservedContents),
    capturedAt: '2023-01-02T03:04:05.000Z',
    comparison: {
      method: 'browser-fetch+wget',
      browserSha256: digest(preservedContents),
      wgetSha256: digest(preservedContents),
      matches: true,
    },
  };

  try {
    const manifest = await capture.indexExistingEvidence({
      evidenceDirectory: fixtureRoot,
      previousManifest: [previous],
      reconstructedAt: '2030-01-01T00:00:00.000Z',
    });
    assert.deepEqual(manifest.find((entry) => entry.path === 'index.php'), previous);
    const legacy = manifest.find((entry) => entry.path === 'main.php');
    assert.equal(legacy.status, null);
    assert.equal(legacy.capturedAt, legacyMtime.toISOString());
    assert.deepEqual(legacy.provenance, {
      kind: 'local-file-mtime',
      observedAt: '2030-01-01T00:00:00.000Z',
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('failed rerun preserves known-good bytes and successful capture metadata', async () => {
  assert.equal(typeof capture.mergeCaptureAttempt, 'function');
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'capture-original-merge-'));
  const outputDirectory = join(fixtureRoot, 'original-public');
  const stagingDirectory = join(fixtureRoot, 'capture-stage');
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(stagingDirectory, { recursive: true });
  const knownGood = Buffer.from('known-good evidence');
  writeFileSync(join(outputDirectory, 'index.php'), knownGood);
  const previous = {
    url: 'https://reddoor-google26.phygitalapp.com.br/index.php',
    path: 'index.php',
    status: 200,
    bytes: knownGood.length,
    sha256: digest(knownGood),
    capturedAt: '2025-01-01T00:00:00.000Z',
  };
  const failedAttempt = {
    ...previous,
    status: 0,
    bytes: 0,
    sha256: digest(Buffer.alloc(0)),
    capturedAt: '2026-01-01T00:00:00.000Z',
    captureError: 'bounded failure',
  };

  try {
    const merged = await capture.mergeCaptureAttempt({
      outputDirectory,
      stagingDirectory,
      previousManifest: [previous],
      attemptManifest: [failedAttempt],
    });
    assert.deepEqual(readFileSync(join(outputDirectory, 'index.php')), knownGood);
    const entry = merged.find((candidate) => candidate.path === 'index.php');
    assert.equal(entry.status, 200);
    assert.equal(entry.capturedAt, previous.capturedAt);
    assert.deepEqual(entry.lastCaptureAttempt, {
      status: 0,
      capturedAt: failedAttempt.capturedAt,
      captureError: failedAttempt.captureError,
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('mismatched immutable capture cannot replace known-good evidence', async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'capture-original-mismatch-'));
  const outputDirectory = join(fixtureRoot, 'original-public');
  const stagingDirectory = join(fixtureRoot, 'capture-stage');
  const assetPath = 'public/assets/js/app.js';
  const outputPath = join(outputDirectory, assetPath);
  const stagedPath = join(stagingDirectory, assetPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  mkdirSync(dirname(stagedPath), { recursive: true });
  const knownGood = Buffer.from('known-good immutable evidence');
  const divergentBrowserBytes = Buffer.from('divergent browser response');
  const divergentWgetBytes = Buffer.from('divergent wget response');
  writeFileSync(outputPath, knownGood);
  writeFileSync(stagedPath, divergentBrowserBytes);
  const previous = {
    url: 'https://reddoor-google26.phygitalapp.com.br/public/assets/js/app.js',
    path: assetPath,
    status: 200,
    bytes: knownGood.length,
    sha256: digest(knownGood),
    capturedAt: '2025-01-01T00:00:00.000Z',
  };
  const comparison = capture.createImmutableComparison(divergentBrowserBytes, divergentWgetBytes);
  const divergentAttempt = {
    ...previous,
    bytes: divergentBrowserBytes.length,
    sha256: digest(divergentBrowserBytes),
    capturedAt: '2026-02-03T04:05:06.000Z',
    comparison,
  };

  try {
    const merged = await capture.mergeCaptureAttempt({
      outputDirectory,
      stagingDirectory,
      previousManifest: [previous],
      attemptManifest: [divergentAttempt],
    });
    assert.equal(comparison.matches, false);
    assert.deepEqual(readFileSync(outputPath), knownGood);
    const entry = merged.find((candidate) => candidate.path === assetPath);
    assert.equal(entry.status, 200);
    assert.equal(entry.sha256, previous.sha256);
    assert.deepEqual(entry.lastCaptureAttempt, {
      status: 0,
      httpStatus: 200,
      capturedAt: divergentAttempt.capturedAt,
      captureError: 'immutable browser/wget hashes diverged; staged bytes were rejected',
      comparison,
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('capture allowlist rejects unknown PHP and unknown assets', () => {
  assert.equal(typeof capture.isAllowedCaptureUrl, 'function');
  assert.equal(capture.isAllowedCaptureUrl(new URL('https://reddoor-google26.phygitalapp.com.br/main.php')), true);
  assert.equal(capture.isAllowedCaptureUrl(new URL('https://reddoor-google26.phygitalapp.com.br/public/assets/js/app.js')), true);
  assert.equal(capture.isAllowedCaptureUrl(new URL('https://reddoor-google26.phygitalapp.com.br/private.php')), false);
  assert.equal(capture.isAllowedCaptureUrl(new URL('https://reddoor-google26.phygitalapp.com.br/public/assets/unknown.js')), false);
  assert.equal(capture.isAllowedCaptureUrl(new URL('https://example.com/main.php')), false);
});

test('the capture is exempt from git line-ending conversion', () => {
  const attributes = readFileSync(new URL('.gitattributes', root), 'utf8');
  // Sem `-text` o git reescreve a evidência a cada checkout e os digests do
  // manifesto param de fechar: o EOL misto dos HTML capturados e o
  // `wall-illustration.png` (um SVG servido com nome de .png, logo texto sem
  // nenhum byte NUL para o git) não sobrevivem à normalização.
  assert.match(attributes, /^evidence\/\*\*\s+-text\s*$/m, 'evidence/** deve continuar marcado como -text');
});

test('immutable comparison fields and summary distinguish matches, mismatches, and unproven results', () => {
  assert.equal(typeof capture.createImmutableComparison, 'function');
  assert.equal(typeof capture.summarizeComparisons, 'function');
  assert.equal(typeof capture.formatComparisonSummary, 'function');
  const same = Buffer.from('same');
  const different = Buffer.from('different');
  const matching = capture.createImmutableComparison(same, same);
  const mismatching = capture.createImmutableComparison(same, different);
  const unproven = capture.createImmutableComparison(same, null, 'wget failed');
  const notFetched = capture.createImmutableComparison(null, null, 'browser failed');

  assert.deepEqual(matching, {
    method: 'browser-fetch+wget',
    browserSha256: digest(same),
    wgetSha256: digest(same),
    matches: true,
  });
  assert.equal(mismatching.matches, false);
  assert.deepEqual(unproven, {
    method: 'browser-fetch+wget',
    browserSha256: digest(same),
    matches: null,
    error: 'wget failed',
  });
  assert.deepEqual(notFetched, {
    method: 'browser-fetch+wget',
    matches: null,
    error: 'browser failed',
  });

  const summary = capture.summarizeComparisons([
    { comparison: matching },
    { comparison: mismatching },
    { comparison: unproven },
    { comparison: notFetched },
    { status: 200 },
  ]);
  assert.deepEqual(summary, { eligible: 4, compared: 2, matching: 1, mismatching: 1, unproven: 2 });
  assert.equal(
    capture.formatComparisonSummary(summary),
    'immutable comparisons: 2 compared (1 matching, 1 mismatching), 2 unproven',
  );
});
