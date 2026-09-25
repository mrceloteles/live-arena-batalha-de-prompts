import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ESPERA, abrirNavegador, abrirPagina, clicarAte } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// A demora e a falha são controladas na fronteira HTTP. O formulário, as
// ações e as gravações continuam sendo os de produção, em banco descartável.
test('ações do professor mostram espera, recusam duplicatas e voltam após erro', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const app = createApplication({
    repositories, judge: createFakeJudge(),
    adminPassword: 'feedback-password',
    adminSecret: 'feedback-secret-at-least-32-characters',
  });
  let controlled;
  const hold = (action, fail = false) => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    controlled = { action, fail, pending, release, calls: 0 };
    return controlled;
  };
  const server = createServer(async (req, res) => {
    const action = new URL(req.url, 'http://test').searchParams.get('action');
    const operation = controlled?.action === action ? controlled : null;
    if (operation) {
      operation.calls += 1;
      await operation.pending;
      if (operation.fail) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Falha temporária de teste.' }));
        return;
      }
    }
    app(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: 'feedback-password' }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const [cookieName, cookieValue] = cookie.split('=');
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };
    browser = await abrirNavegador();
    const page = await abrirPagina(browser, {
      cookie: { name: cookieName, value: cookieValue, domain: '127.0.0.1', path: '/', httpOnly: true },
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`${base}/admin-arena.php`);
    await page.waitForSelector('[onclick="openCreateRoomDialog()"]');
    await page.click('[onclick="openCreateRoomDialog()"]');
    await page.type('[data-arena-create-room] [name=title]', 'Sala de resposta imediata');
    await page.select('[data-arena-create-room] [name=preset]', 'classic');

    const first = hold('arena_create_room', true);
    const busy = await page.evaluate(() => {
      const form = document.querySelector('[data-arena-create-room]');
      form.requestSubmit();
      form.requestSubmit();
      const button = form.querySelector('button[type=submit]');
      return { disabled: button.disabled, label: button.textContent, busy: form.getAttribute('aria-busy') };
    });
    assert.deepEqual(busy, { disabled: true, label: 'Criando sala…', busy: 'true' });
    first.release();
    await page.waitForFunction(() => document.querySelector('[data-arena-create-message]')?.textContent.includes('Falha temporária'));
    assert.equal(first.calls, 1, 'dois submits viram um pedido');
    assert.deepEqual(await page.evaluate(() => {
      const form = document.querySelector('[data-arena-create-room]');
      const button = form.querySelector('button[type=submit]');
      return { disabled: button.disabled, label: button.textContent, busy: form.hasAttribute('aria-busy'), title: form.elements.title.value };
    }), { disabled: false, label: 'Criar sala', busy: false, title: 'Sala de resposta imediata' });

    const second = hold('arena_create_room');
    await page.evaluate(() => {
      const form = document.querySelector('[data-arena-create-room]');
      form.requestSubmit();
      form.requestSubmit();
    });
    second.release();
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    await page.waitForFunction(() => document.querySelector('[data-arena-detail-title]')?.textContent === 'Sala de resposta imediata');
    assert.equal(second.calls, 1);
    controlled = null;
    const status = await post('arena_admin_status');
    assert.equal(status.rooms.filter((room) => room.title === 'Sala de resposta imediata').length, 1, 'a recuperação cria uma única sala');
    const room = status.rooms.find((entry) => entry.title === 'Sala de resposta imediata');

    // A ação de bloqueio usa a mesma guarda dos sorteios e dos comandos da
    // rodada. Depois de uma falha, o próprio botão permite um novo clique.
    const block = hold('arena_update_room', true);
    const actionBusy = await page.evaluate(() => {
      const button = document.querySelector('[data-arena-detail] [data-action=room-block]');
      button.click();
      button.click();
      return { disabled: button.disabled, label: button.textContent, busy: button.getAttribute('aria-busy') };
    });
    assert.deepEqual(actionBusy, { disabled: true, label: 'Aguarde…', busy: 'true' });
    block.release();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-arena-detail] [data-action=room-block]');
      return button && !button.disabled && !button.hasAttribute('aria-busy');
    });
    assert.equal(block.calls, 1);
    controlled = null;
    const request = page.waitForResponse((response) => response.url().includes('action=arena_update_room'));
    await page.evaluate(() => document.querySelector('[data-arena-detail] [data-action=room-block]').click());
    assert.equal((await request).status(), 200);
    assert.equal(Boolean((await post('arena_room_detail', { room_id: room.id })).detail.room.entry_blocked), true);

    // Uma validação local também precisa liberar o botão; nem todo término
    // passa pelo catch de uma requisição HTTP.
    await page.evaluate(() => document.querySelector('[data-arena-new-challenge]').click());
    await page.waitForSelector('[data-challenge-form]');
    await page.evaluate(() => {
      const form = document.querySelector('[data-challenge-form]');
      form.querySelectorAll('[name=criteria]').forEach((input) => { input.checked = false; });
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(await page.evaluate(() => {
      const form = document.querySelector('[data-challenge-form]');
      return {
        disabled: form.querySelector('button[type=submit]').disabled,
        busy: form.hasAttribute('aria-busy'),
        validation: form.querySelector('[data-challenge-form-message]').textContent,
      };
    }), { disabled: false, busy: false, validation: 'Selecione ao menos um criterio.' });
    assert.deepEqual(errors, []);
  } finally {
    controlled?.release();
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('atalho de tela cheia da TV preserva busca, edição de campos e teclas repetidas', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const server = createServer(createApplication({ repositories: createRepositories(opened.database), judge: createFakeJudge() }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    await page.evaluateOnNewDocument(() => {
      window.fullscreenCalls = 0;
      Element.prototype.requestFullscreen = async () => { window.fullscreenCalls += 1; };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/tv.php`);
    await page.waitForSelector('[data-tv-fullscreen]');
    const result = await page.evaluate(() => {
      const fire = (extra = {}) => {
        const event = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ...extra });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      };
      document.activeElement?.blur();
      const ignored = [fire({ ctrlKey: true }), fire({ metaKey: true }), fire({ altKey: true }), fire({ repeat: true })];
      for (const tag of ['input', 'textarea', 'select', 'div']) {
        const field = document.createElement(tag);
        if (tag === 'div') field.contentEditable = 'true';
        document.body.append(field);
        field.focus();
        ignored.push(fire());
        field.remove();
      }
      const before = window.fullscreenCalls;
      const plain = fire();
      const capital = fire({ key: 'F', shiftKey: true });
      return { ignored, before, plain, capital, calls: window.fullscreenCalls };
    });
    assert.deepEqual(result, { ignored: Array(8).fill(false), before: 0, plain: true, capital: true, calls: 2 });
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
