import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../src/web/pages/index.mjs';

const routes = ['/', '/index.php', '/tv.php'];
const adminRoutes = ['/admin-arena.php', '/report.php'];

test('legacy admin page redirects to the unified arena panel', () => {
  const response = renderPage('/admin.php');
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/admin-arena.php');
});

test('report is admin surface: anonymous is redirected to the panel login', () => {
  const response = renderPage('/report.php');
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/admin-arena.php');
  const authed = renderPage('/report.php', { authenticated: true });
  assert.equal(authed.status, 200);
});

test('arena admin markup is gated server-side: anonymous gets only the login card', () => {
  const anonymous = renderPage('/admin-arena.php').body;
  assert.match(anonymous, /data-admin-arena-login-panel/);
  assert.doesNotMatch(anonymous, /data-admin-arena-content/);
  assert.doesNotMatch(anonymous, /data-arena-create-room/);
  assert.doesNotMatch(anonymous, /data-arena-challenge-list/);
  assert.doesNotMatch(anonymous, /data-arena-gate-toggle/);
});

test('arena admin full markup renders only when authenticated', () => {
  const authed = renderPage('/admin-arena.php', { authenticated: true }).body;
  assert.match(authed, /data-admin-arena-content/);
  // O formulario de criar sala e montado pelo painel (arena.js) dentro do
  // dialogo; o markup do servidor carrega o botao que o abre.
  assert.match(authed, /openCreateRoomDialog\(\)/);
  assert.match(authed, /data-arena-gate-toggle/);
  assert.match(authed, /data-arena-room-list/);
  assert.match(authed, /data-arena-dialog/);
  assert.match(authed, /data-arena-admin-logout/);
});

test('renders every observed PHP-compatible route', () => {
  for (const route of routes) {
    const response = renderPage(route);
    assert.equal(response.status, 200, route);
    assert.match(response.body, /<!doctype html>/i, route);
    assert.match(response.headers['content-type'], /text\/html/);
  }
});

test('preview da sala como o aluno ve e superficie administrativa', () => {
  const anonymous = renderPage('/aluno-preview.php');
  assert.equal(anonymous.status, 302);
  assert.equal(anonymous.headers.location, '/admin-arena.php');
  const authed = renderPage('/aluno-preview.php', { authenticated: true });
  assert.equal(authed.status, 200);
  // E a mesma tela do aluno (mesma casca e mesmo painel de missao), so marcada
  // como previa — nada de uma copia paralela da tela.
  assert.match(authed.body, /data-page="arena" data-arena-preview="1"/);
  assert.match(authed.body, /data-arena-mission-panel/);
  assert.match(authed.body, /data-arena-prompt-form/);
  assert.doesNotMatch(authed.body, /data-admin-arena-content/);
});

test('arena projection TV page renders the stage containers', () => {
  const tv = renderPage('/tv.php').body;
  assert.match(tv, /data-arena-tv/);
  assert.match(tv, /data-tv-content/);
  assert.match(tv, /data-tv-room/);
  assert.ok(tv.includes('arena.js'), 'tv page loads the arena client');
});

test('arena projection TV page targets the per-room cockpit entry', () => {
  const tv = renderPage('/tv.php').body;
  assert.match(tv, /data-page="tv"/);
});

test('administrative report identifies every persisted participant field', () => {
  const report = renderPage('/report.php', { authenticated: true }).body;
  for (const heading of ['Jogador', 'E-mail', 'Cargo', 'Empresa', 'Rodadas', 'Pontos', 'Precisão']) {
    assert.match(report, new RegExp(`<th>${heading}</th>`));
  }
});

// A etapa 5 do plano de carga de leitura mudou o relatório de "tudo aberto"
// para "resumo + consulta sob demanda". A guarda é estrutural de propósito: ela
// morde se um painel voltar a ser cartão fixo (o texto volta a ser atravessado
// na rolagem) ou se uma dobra ficar SEM alça — uma seção que ninguém consegue
// abrir é pior que texto demais.
//
// A etapa 4 do refino (16/09/2026) agrupou as consultas por assunto e levou as
// quatro operacionais (comparações por computador e por modo, jogos e rodadas do
// evento) para DENTRO de uma única dobra de grupo: são doze consultas, mas nove
// dobras. O grupo é uma dobra só — dobrar dentro de dobra para chegar a um dado
// simples é o que o plano reprova — e é por isso que a conta deixou de ser
// "doze painéis": ela virou painéis + blocos do grupo.
test('a consulta do relatório é resumo à vista e o resto em dobra com alça', () => {
  const report = renderPage('/report.php', { authenticated: true }).body;
  // O resumo do período e o ranking são a primeira leitura.
  assert.match(report, /<section class="metric-grid" data-metric-cards data-report-data>/);
  assert.match(report, /<details class="report-panel report-panel-wide" open>/);
  // Toda dobra tem alça com o título que já existia — nenhum rótulo novo foi
  // escrito só para virar alça, e o resumo do grupo usa o mesmo do painel.
  assert.doesNotMatch(report, /<(?:div|section)[^>]*class="report-panel/, 'painel fixo no relatório');
  const dobras = report.match(/<details class="/g) ?? [];
  const alcas = report.match(/<summary class="panel-title">/g) ?? [];
  assert.equal(dobras.length, alcas.length, 'dobra do relatório sem alça');
  const paineis = report.match(/<details class="report-panel/g) ?? [];
  const blocos = report.match(/class="report-block"/g) ?? [];
  assert.equal(paineis.length + blocos.length, 12, `esperava as 12 consultas do relatório, achei ${paineis.length + blocos.length}`);
  assert.equal(report.match(/<details class="report-group-fold"/g)?.length, 1, 'o grupo operacional é UMA dobra');
  // O grupo leva os blocos ABERTOS quando a dobra abre: nada de dobra dentro de
  // dobra dentro de dobra para chegar a uma comparação por computador.
  assert.match(report, /<div class="report-group-body">[\s\S]*<h3>Por computador<\/h3>/);
  const corpoDoGrupo = report.slice(report.indexOf('<div class="report-group-body">'));
  assert.doesNotMatch(
    corpoDoGrupo.slice(0, corpoDoGrupo.indexOf('</section>')),
    /<details/,
    'dobra dentro da dobra do grupo',
  );
  // Os dois 'Rodadas' da mesma rolagem deixaram de se chamar igual: o gráfico
  // diz por onde passa e a tabela diz do que fala.
  assert.equal(report.match(/<h[23]>Rodadas<\/h[23]>/g)?.length ?? 0, 0, 'os dois Rodadas voltaram a se chamar igual');
  assert.equal(report.match(/<h2>Rodadas pontuadas<\/h2>/g)?.length ?? 0, 1);
  assert.equal(report.match(/<h3>Rodadas do evento<\/h3>/g)?.length ?? 0, 1);
  // E o período é escrito UMA vez na tela (a pílula do filtro). A segunda cópia,
  // na linha de impressão, saiu em 16/09/2026 — as duas diziam o mesmo, lado a
  // lado. O que sobra de impressão é o carimbo de atualização.
  assert.equal(report.match(/data-report-print-period/g)?.length ?? 0, 0);
  assert.equal(report.match(/data-report-period/g)?.length, 1);
  // Um único painel começa aberto (o ranking); o resto é consulta sob demanda.
  assert.equal((report.match(/<details class="report-panel[^"]*" open>/g) ?? []).length, 1);
  // Os indicadores que sobram ficam no mesmo cartão do resumo, recolhidos.
  assert.match(report, /data-report-more-metrics[\s\S]*data-metric-cards-extra/);
  // E existe um lugar só para o período sem dados.
  assert.match(report, /<section class="report-empty" data-report-empty hidden><\/section>/);
});

test('uses a neutral lockup and contains no visible Google branding', () => {
  for (const route of [...routes, ...adminRoutes]) {
    const body = renderPage(route, { authenticated: true }).body;
    assert.doesNotMatch(body, /Google(?: for Startups)?/i, route);
    assert.doesNotMatch(body, /google-startups/i, route);
  }
});

test('rejects unknown and removed legacy routes', () => {
  assert.equal(renderPage('/missing').status, 404);
  assert.equal(renderPage('/game.php?station=1').status, 404);
  assert.equal(renderPage('/wall.php').status, 404);
  assert.equal(renderPage('/join.php').status, 404);
  assert.equal(renderPage('/main.php').status, 404, 'legacy main TV was replaced by /tv.php');
});

test('home names the three roles and keeps the legacy station links out', () => {
  const home = renderPage('/').body;
  // A home diz QUEM entra, além do que o produto é. O CTA único ("Entrar na
  // Arena") só servia a quem já era aluno: recebendo o endereço, nem o professor
  // nem quem liga a TV da sala sabiam que existiam.
  //
  // O que mudou nesta passada (a régua foi devolvida à intenção, não ao
  // desenho): os três papéis eram três CARTÕES com micro-rótulo e título, e a
  // asserção cobrava a ordem professor, aluno, TV desses cartões. A home voltou
  // à composição da referência (LA-01) — lockup, tagline, uma LINHA de ações e
  // a faixa de prova —, e os três papéis passaram a ser as três AÇÕES dessa
  // linha. A ordem passa a ser a da referência, que abre pela ação do aluno:
  // aluno (/play), professor (/admin-arena.php) e TV (/tv.php). As duas ações
  // silenciosas nomeiam o papel, como o "Painel do professor" da referência.
  const portas = [...home.matchAll(/href="(\/play|\/admin-arena\.php|\/tv\.php)"/g)].map((m) => m[1]);
  assert.deepEqual(
    portas,
    ['/play', '/admin-arena.php', '/tv.php'],
    'as três portas do produto aparecem na home, na ordem aluno, professor, TV',
  );
  assert.match(home, /Entrar na Arena/);
  assert.match(home, /Painel do professor/, 'a porta do professor nomeia o papel');
  assert.match(home, /Projeção da TV/, 'a porta da TV nomeia o papel');
  // O que NAO volta: a home classica listava PCs, modos e o ambiente.
  assert.ok(!home.includes('game.php?station'), 'no legacy station links');
  assert.ok(!home.includes('>PC 1<'), 'no PC 1 card');
  assert.ok(!home.includes('BATALHA CLASSICA'), 'no classic mode card');
  assert.ok(!home.includes('main.php'), 'no ambiente link');
});

test('arena play page keeps the roster container for the classic lobby', () => {
  const play = renderPage('/play').body;
  assert.match(play, /data-arena-roster/);
  assert.match(play, /data-arena-mission-message/);
});
