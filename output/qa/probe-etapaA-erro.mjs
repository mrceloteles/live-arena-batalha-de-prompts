// Etapa A, item 5: o erro aparece junto do campo e não desloca o foco.
//
//   node output/qa/probe-etapaA-erro.mjs
//
// Mede o que muda no formulário quando o erro chega: a posição do botão, a
// posição dos campos, a rolagem e para onde foi o foco. Se nada acima da
// mensagem se move, o item está satisfeito — e isto prova, em vez de supor.
//
// A sonda sobe o próprio servidor (banco em memória, juiz falso): assim ela
// mede o código de agora, e não um processo antigo que ainda tem o texto em
// memória. `PREVIEW_URL` continua valendo para medir contra o Preview aberto.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { abrirNavegador, abrirPagina, carregar, esperarPor } from '../../test/support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const pasta = 'tmp/qa/etapaA-erro';
mkdirSync(pasta, { recursive: true });

let base = process.env.PREVIEW_URL;
let servidor = null;
if (!base) {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  servidor = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    adminPassword: 'browser-test-password',
    adminSecret: 'browser-test-secret-at-least-32-characters',
  }));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await fetch(`${base}/api.php?action=admin_login`, {
    method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await fetch(`${base}/api.php?action=arena_set_open`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ open: true }),
  });
}

const posicoes = () => {
  const caixa = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.height) };
  };
  const alvo = document.querySelector('[data-arena-join-message], [data-admin-arena-message]');
  return {
    campos: [...document.querySelectorAll('.arena-field')].map((el) => Math.round(el.getBoundingClientRect().y)),
    botao: caixa('.arena-form .figma-cta'),
    voltar: caixa('.ghost-link'),
    mensagem: caixa('[data-arena-join-message], [data-admin-arena-message]'),
    textoDaMensagem: alvo?.textContent?.trim() || '',
    rolagem: Math.round(window.scrollY),
    foco: document.activeElement?.name || document.activeElement?.tagName || '?',
  };
};

const casos = [
  {
    nome: 'entrada-do-aluno',
    url: '/play',
    preencher: () => {
      const codigo = document.querySelector('input[name="code"]');
      const nome = document.querySelector('input[name="name"]');
      codigo.value = '000000';
      codigo.dispatchEvent(new Event('input', { bubbles: true }));
      nome.value = 'Sonda';
      nome.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.arena-form .figma-cta').click();
    },
    espera: () => {
      const m = document.querySelector('[data-arena-join-message]');
      return !!m && m.textContent.trim().length > 0;
    },
  },
  {
    nome: 'login-do-professor',
    url: '/admin-arena.php',
    preencher: () => {
      const senha = document.querySelector('input[name="password"]');
      senha.value = 'senha-errada-de-proposito';
      senha.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.admin-login-submit').click();
    },
    espera: () => {
      const m = document.querySelector('[data-admin-arena-message]');
      return !!m && m.textContent.trim().length > 0;
    },
  },
];

const navegador = await abrirNavegador();
const resultado = {};
try {
  for (const caso of casos) {
    const pagina = await abrirPagina(navegador, { viewport: { width: 390, height: 844 } });
    await pagina.setCacheEnabled(false);
    await carregar(pagina, base + caso.url);
    await esperarPor(pagina, (sel) => !!document.querySelector(sel), { descricao: 'formulário', args: '.arena-form' });
    const antes = await pagina.evaluate(posicoes);
    await pagina.evaluate(caso.preencher);
    await esperarPor(pagina, caso.espera, { descricao: 'a mensagem de erro aparecer' });
    const depois = await pagina.evaluate(posicoes);
    resultado[caso.nome] = { antes, depois };
    await pagina.screenshot({ path: `${pasta}/${caso.nome}-erro.png` });
    await pagina.close();
  }
} finally {
  await navegador.close();
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
}

writeFileSync(`${pasta}/medidas.json`, JSON.stringify(resultado, null, 2));
for (const [nome, { antes, depois }] of Object.entries(resultado)) {
  const delta = (a, b) => (a && b ? b.y - a.y : null);
  console.log(`${nome}:`);
  console.log(`  campos y ${antes.campos.join(',')} -> ${depois.campos.join(',')} (delta ${delta({ y: antes.campos[0] }, { y: depois.campos[0] })})`);
  console.log(`  botão  y ${antes.botao.y} -> ${depois.botao.y} (delta ${delta(antes.botao, depois.botao)})`);
  console.log(`  voltar y ${antes.voltar?.y ?? '-'} -> ${depois.voltar?.y ?? '-'}`);
  const linhas = depois.mensagem ? Math.round(depois.mensagem.h / (antes.mensagem?.h || 21)) : 0;
  console.log(`  mensagem y ${depois.mensagem?.y ?? '-'} altura ${depois.mensagem?.h ?? '-'} (${linhas} linha(s) de ${antes.mensagem?.h ?? '-'})`);
  console.log(`  texto: "${depois.textoDaMensagem}"`);
  console.log(`  rolagem ${antes.rolagem} -> ${depois.rolagem} | foco ${antes.foco} -> ${depois.foco}`);
}
