// Etapa D — o diálogo cabe na janela, tem uma região de rolagem e mantém título,
// fechar e salvar alcançáveis em tela baixa.
//
//   node output/qa/probe-etapaD.mjs
//
// O critério de aceite do plano é literal: "salvar/fechar são alcançáveis em
// tela baixa". Tela baixa é 1280×720. A sonda sobe o próprio servidor e mede o
// diálogo "Novo desafio", que é o formulário mais longo do produto.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { abrirNavegador, abrirPagina, carregar, esperarPor, clicarAte, ESPERA } from '../../test/support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const pasta = 'tmp/qa/etapaD';
mkdirSync(pasta, { recursive: true });

const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const servidor = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  adminPassword: 'browser-test-password',
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${servidor.address().port}`;
const login = await fetch(`${base}/api.php?action=admin_login`, {
  method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }),
});
const cookie = login.headers.get('set-cookie').split(';')[0];

const medir = () => {
  const dialogo = document.querySelector('[data-arena-dialog]');
  const cartao = dialogo.querySelector('.arena-dialog-card');
  const corpo = dialogo.querySelector('[data-arena-dialog-body]');
  const fechar = dialogo.querySelector('.arena-dialog-close');
  const salvar = [...dialogo.querySelectorAll('button[type=submit], .arena-dialog-footer button')].pop();
  const titulo = dialogo.querySelector('h3');
  const caixa = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { topo: Math.round(r.top), base: Math.round(r.bottom), h: Math.round(r.height) };
  };
  return {
    janela: { h: window.innerHeight, w: window.innerWidth },
    cartao: caixa(cartao),
    titulo: caixa(titulo),
    fechar: caixa(fechar),
    corpo: corpo
      ? { rolagem: Math.round(corpo.scrollHeight), visivel: Math.round(corpo.clientHeight) }
      : null,
    overlayRola: Math.round(dialogo.scrollHeight) - Math.round(dialogo.clientHeight),
    paginaRola: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    salvarAntes: caixa(salvar),
    tituloVisivelAntes: caixa(titulo)?.topo >= 0,
  };
};

const rolarAteOFimEReler = () => {
  const corpo = document.querySelector('[data-arena-dialog-body]');
  corpo.scrollTop = corpo.scrollHeight;
  const salvar = [...document.querySelectorAll('[data-arena-dialog] button[type=submit]')].pop();
  const titulo = document.querySelector('[data-arena-dialog] h3');
  const r = salvar.getBoundingClientRect();
  const t = titulo.getBoundingClientRect();
  return {
    salvarDepois: { topo: Math.round(r.top), base: Math.round(r.bottom), h: Math.round(r.height) },
    salvarNaPrimeiraTela: r.bottom <= window.innerHeight && r.top >= 0,
    tituloAindaVisivel: t.top >= 0 && t.bottom <= window.innerHeight,
    rolagemDoCorpo: Math.round(corpo.scrollTop),
  };
};

const navegador = await abrirNavegador();
const resultado = {};
try {
  for (const janela of [{ nome: 'baixa', width: 1280, height: 720 }, { nome: 'celular', width: 390, height: 844 }]) {
    const pagina = await abrirPagina(navegador, { viewport: { width: janela.width, height: janela.height } });
    await pagina.setCacheEnabled(false);
    await pagina.setCookie({
      name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1),
      domain: '127.0.0.1', path: '/', httpOnly: true,
    });
    await carregar(pagina, `${base}/admin-arena.php`);
    // O painel se desenha depois da primeira resposta da API.
    await esperarPor(pagina, () => !!document.querySelector('[data-arena-new-challenge]'), { descricao: 'o painel do professor' });
    await clicarAte(pagina, '[data-arena-new-challenge]', () => !!document.querySelector('[data-arena-dialog]')?.open, {
      descricao: 'o diálogo do desafio abrir', timeout: ESPERA.padrao,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    resultado[janela.nome] = { antes: await pagina.evaluate(medir), depois: await pagina.evaluate(rolarAteOFimEReler) };
    await pagina.screenshot({ path: `${pasta}/dialogo-${janela.nome}.png` });
    await pagina.close();
  }
} finally {
  await navegador.close();
  await new Promise((resolve) => servidor.close(resolve));
}

writeFileSync(`${pasta}/medidas.json`, JSON.stringify(resultado, null, 2));
for (const [nome, { antes, depois }] of Object.entries(resultado)) {
  console.log(`${nome} — janela ${antes.janela.w}×${antes.janela.h}`);
  console.log(`  cartão: topo ${antes.cartao.topo} base ${antes.cartao.base} altura ${antes.cartao.h}`);
  console.log(`  corpo: rolagem ${antes.corpo.rolagem} em ${antes.corpo.visivel} visíveis`);
  console.log(`  overlay rola: ${antes.overlayRola}px | página rola: ${antes.paginaRola}px`);
  console.log(`  fechar: topo ${antes.fechar.topo} base ${antes.fechar.base}`);
  console.log(`  salvar antes: ${JSON.stringify(antes.salvarAntes)}`);
  console.log(`  depois de rolar até o fim: salvar ${JSON.stringify(depois.salvarDepois)} alcançável=${depois.salvarNaPrimeiraTela} | título ainda visível=${depois.tituloAindaVisivel} | scrollTop ${depois.rolagemDoCorpo}`);
}
