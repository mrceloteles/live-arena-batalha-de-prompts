import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';

// A política de espera (test/support/navegador.mjs) é o que sustenta os testes
// da arena: sob carga, o que reprovava o portão 2 era a espera, não o produto —
// um clique que caía num botão já substituído e uma espera de 30 s que estourava
// por causa disso. Este arquivo é a prova dela, sem o produto no meio: uma
// página mínima em que o primeiro clique é engolido de propósito e a consequência
// demora, como acontece quando o painel do professor se redesenha.

const PAGINA = `<!doctype html>
<html lang="pt-BR"><body>
  <button type="button" data-alvo>Agir</button>
  <button type="button" data-mudo>Não faz nada</button>
  <p data-contagem></p>
  <script>
    // O alvo troca de nó a cada 250 ms: é o painel que se redesenha sozinho.
    let alvo = document.querySelector('[data-alvo]');
    const contagem = document.querySelector('[data-contagem]');
    let cliques = 0;
    // O primeiro clique é engolido: acontece como quando o botão é substituído
    // entre a consulta e o clique, e o efeito esperado não chega.
    document.addEventListener('click', (evento) => {
      if (!evento.target.closest('[data-alvo]')) return;
      cliques += 1;
      contagem.textContent = String(cliques);
      if (cliques === 1) return;
      setTimeout(() => {
        const marca = document.createElement('p');
        marca.dataset.consequencia = 'sim';
        document.body.append(marca);
      }, 150);
    }, true);
    // O nó do alvo é trocado de tempo em tempo, sem perder o ouvinte (é no
    // documento): quem clica por coordenada acaba caindo num nó solto.
    setInterval(() => {
      const novo = document.createElement('button');
      novo.type = 'button';
      novo.dataset.alvo = '';
      novo.textContent = 'Agir';
      alvo.replaceWith(novo);
      alvo = novo;
    }, 250);
    setTimeout(() => {
      const marca = document.createElement('p');
      marca.dataset.marca = 'sim';
      document.body.append(marca);
    }, 300);
  </script>
</body></html>`;

const comPagina = async (rodar) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGINA);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    const pagina = await abrirPagina(browser);
    await pagina.goto(base, { waitUntil: 'domcontentloaded' });
    await rodar(pagina);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

test('browser: o clique repetido chega onde um clique único não chega', { timeout: ESPERA.teste }, async () => {
  await comPagina(async (pagina) => {
    // Um clique único sai e não faz efeito (o primeiro é engolido; e o nó do
    // alvo troca a cada 250 ms). A espera comum desistiria aqui.
    await clicarAte(pagina, '[data-alvo]', () => Boolean(document.querySelector('[data-consequencia]')),
      { descricao: 'a consequência do clique aparecer', janela: 400 });
    const cliques = await pagina.$eval('[data-contagem]', (node) => Number(node.textContent));
    assert.ok(cliques >= 2, `o clique precisa ser repetido até fazer efeito, e foi ${cliques} vez(es)`);
  });
});

test('browser: a espera falha dizendo o que esperava, e não engole defeito da condição', { timeout: ESPERA.teste }, async () => {
  await comPagina(async (pagina) => {
    // O caso feliz de `esperarPor`, com opção passada adiante.
    await esperarPor(pagina, (marca) => Boolean(document.querySelector(`[data-${marca}]`)),
      { descricao: 'a marca da página aparecer', timeout: ESPERA.curta, args: 'marca' });

    // O clique que não tem efeito nenhum: desiste no prazo, e o erro diz qual
    // clique e o que se esperava dele — não um "Waiting failed" cru.
    await assert.rejects(
      clicarAte(pagina, '[data-mudo]', () => false, { descricao: 'o botão mudo fazer algo', timeout: 1_200, janela: 300 }),
      /o botão mudo fazer algo.*clique\(s\) em 1200ms/s,
    );

    // A espera que nunca é satisfeita também nomeia o que faltou.
    await assert.rejects(
      esperarPor(pagina, () => false, { descricao: 'o impossível', timeout: 800 }),
      /o impossível/,
    );

    // Uma condição com defeito sobe na hora: repetir o clique esconderia o bug
    // de quem escreveu o teste e o transformaria em "o clique não teve efeito".
    await assert.rejects(
      clicarAte(pagina, '[data-alvo]', (texto) => { throw new Error(`condição com defeito: ${texto}`); },
        { descricao: 'nunca chega', timeout: 2_000, janela: 300, args: 'aqui' }),
      /condição com defeito: aqui/,
    );
  });
});
