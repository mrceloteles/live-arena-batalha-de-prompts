import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const manifestUrl = new URL('evidence/manifest.json', root);

const requiredResources = [
  { path: 'index.php', url: '/index.php', status: 200 },
  { path: 'main.php', url: '/main.php', status: 200 },
  { path: 'game/station-1.html', url: '/game.php?station=1&mode=wait_all', status: 200 },
  { path: 'game/station-2.html', url: '/game.php?station=2&mode=wait_all', status: 200 },
  { path: 'game/station-3.html', url: '/game.php?station=3&mode=wait_all', status: 200 },
  { path: 'wall.php', url: '/wall.php', status: 200 },
  { path: 'admin.php', url: '/admin.php', status: 200 },
  { path: 'report.php', url: '/report.php', status: 302, redirectTo: '/admin.php' },
  { path: 'public/assets/css/app.css', url: '/public/assets/css/app.css', status: 200 },
  { path: 'public/assets/js/app.js', url: '/public/assets/js/app.js', status: 200 },
];

const requiredFonts = [
  'public/assets/fonts/GoogleSans-Regular.ttf',
  'public/assets/fonts/GoogleSans-Medium.ttf',
  'public/assets/fonts/GoogleSans-SemiBold.ttf',
  'public/assets/fonts/GoogleSans-Bold.ttf',
];

const requiredImages = [
  'battle-prompt-muted.png',
  'google-startups-logo.png',
  'google-startups-muted.png',
  'google-startups-white.png',
  'loader.png',
  'manual-illustration.png',
  'manual-instructions-illustration.png',
  'pc-idle-arrow.png',
  'player-avatar.png',
  'prompt-sample.png',
  'star.png',
  'start-bg.png',
  'tv-waiting-players-illustration.png',
  'wall-bg.png',
  'wall-illustration.png',
].map((name) => `public/assets/figma/${name}`);

test('manifest preserves every required public page and asset with its digest', () => {
  assert.equal(existsSync(manifestUrl), true, 'capture manifest must exist');

  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  assert.ok(Array.isArray(manifest), 'manifest must be an inventory array');

  for (const required of requiredResources) {
    const entry = manifest.find((candidate) => candidate.path === required.path);
    assert.ok(entry, `manifest is missing required resource: ${required.path}`);
    assert.match(entry.url, /^https:\/\/reddoor-google26\.phygitalapp\.com\.br\//);
    assert.equal(new URL(entry.url).pathname + new URL(entry.url).search, required.url);
    assert.equal(entry.status, required.status);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.match(entry.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
    if (required.redirectTo) {
      assert.equal(new URL(entry.redirectTo).pathname, required.redirectTo);
    }

    const resourceUrl = new URL(`evidence/original-public/${entry.path}`, root);
    const contents = readFileSync(resourceUrl);
    assert.equal(entry.bytes, statSync(resourceUrl).size);
    assert.equal(entry.sha256, createHash('sha256').update(contents).digest('hex'));
  }
});

test('manifest records the only permitted POST capture even when it times out', () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const roomStatus = manifest.find((entry) => entry.path === 'api/room_status.json');
  assert.ok(roomStatus, 'room_status POST must be inventoried');
  assert.equal(new URL(roomStatus.url).pathname + new URL(roomStatus.url).search, '/api.php?action=room_status');
  assert.ok(roomStatus.status === 200 || roomStatus.captureError, 'room_status must be captured or report its bounded failure');
});

test('manifest deterministically records captured and unavailable static assets without inventing bytes', () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const capturedPaths = new Set(manifest.filter((entry) => entry.status === 200).map((entry) => entry.path));

  assert.ok([...capturedPaths].some((path) => path.endsWith('.php') || path.endsWith('.html')), 'HTML page required');
  assert.ok([...capturedPaths].some((path) => path.endsWith('.css')), 'CSS asset required');
  assert.ok([...capturedPaths].some((path) => path.endsWith('.js')), 'JavaScript asset required');
  assert.equal(requiredFonts.length, 4);
  assert.equal(requiredImages.length, 15);

  let capturedImages = 0;
  for (const path of [...requiredFonts, ...requiredImages]) {
    const entry = manifest.find((candidate) => candidate.path === path);
    assert.ok(entry, `manifest is missing static asset: ${path}`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);

    if (entry.status === 200) {
      const resourceUrl = new URL(`evidence/original-public/${path}`, root);
      assert.equal(existsSync(resourceUrl), true, `captured bytes must exist locally: ${path}`);
      const contents = readFileSync(resourceUrl);
      assert.equal(entry.bytes, contents.length);
      assert.equal(entry.sha256, createHash('sha256').update(contents).digest('hex'));
      if (/\.(?:png|webp|jpg|jpeg)$/i.test(path)) capturedImages += 1;
    } else {
      assert.ok(entry.captureError, `unavailable capture must preserve its failure reason: ${path}`);
      assert.equal(entry.bytes, 0, `unavailable capture must not claim bytes: ${path}`);
      assert.equal(entry.sha256, createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
    }
  }

  assert.ok(capturedImages > 0, 'at least one referenced image must have preserved bytes');
  const css = readFileSync(new URL('evidence/original-public/public/assets/css/app.css', root), 'utf8');
  assert.match(css, /font-family\s*:/i, 'captured CSS must preserve its font inventory');
});