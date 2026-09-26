const refinementStyles = '<link rel="stylesheet" href="/public/assets/css/refinement.css?v=88">';
// A JORNADA DO ALUNO tem folha própria: `aluno.css` é o dono das telas do aluno
// que esta frente construiu (a espera com o caminho de entrada e a leitura
// "Como a batalha funciona"), e é onde as telas que ainda faltam portar
// aterrissam. Ela entra DEPOIS de `refinement.css` e ANTES de `round.css` (que
// o painel da missão linka por conta própria) — a mesma vizinhança de cascata
// que esses seletores tinham quando viviam no fim de `refinement.css`.
const alunoStyles = '<link rel="stylesheet" href="/public/assets/css/aluno.css?v=12">';
const assets = '<link rel="stylesheet" href="/public/assets/css/app-authorial.css?v=31"><link rel="stylesheet" href="/public/assets/css/design.css?v=66">' + refinementStyles;
const arenaAssets = '<link rel="stylesheet" href="/public/assets/css/app-authorial.css?v=31"><link rel="stylesheet" href="/public/assets/css/arena.css?v=71"><link rel="stylesheet" href="/public/assets/css/design.css?v=66">' + refinementStyles + alunoStyles;
const script = '<script src="/public/assets/js/app.js?v=42"></script>';
const arenaScript = '<script src="/public/assets/js/arena.js?v=144"></script>';

// Ícones SVG oficiais Material / Feather para a barra lateral e navegação
const iconDashboard = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
const iconRooms = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
const iconChallenges = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
const iconLessons = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>';
const iconReport = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>';

// Componente oficial padronizado de Marca (LIVE ARENA · Batalha de Prompts)
const brandLogo = (theme = 'light', size = 'default') => `
  <div class="brand-identity brand-identity--${theme} brand-identity--${size}">
    <div class="mark" aria-hidden="true">
      <span class="prompt-arrow"></span>
      <span class="prompt-line"></span>
    </div>
    <div class="brand-identity-text">
      <span class="brand-identity-main">LIVE <b>ARENA</b></span>
      <span class="brand-identity-sub">BATALHA DE PROMPTS</span>
    </div>
  </div>
`;

const shell = (title, body, content) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${assets}
</head>
<body ${body}>
  ${content}
  ${script}
</body>
</html>`;

const arenaShell = (title, body, content) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${arenaAssets}
</head>
<body ${body}>
  ${content}
  ${arenaScript}
</body>
</html>`;

/**
 * A home monta a composição da referência (LA-01): marca, lockup em dois
 * degraus ("Descubra o" / "PROMPT"), a linha que explica o produto, a linha de
 * ações e a faixa de prova — na ordem em que a referência as empilha.
 *
 * As três ações são as três portas do produto (aluno, professor, TV). A
 * referência desenha duas; a terceira já existia no produto e continua aqui,
 * mas na MESMA família de ação: uma pílula primária e duas silenciosas, para
 * que a tela tenha UMA ação dominante — a de quem chega pelo link para jogar.
 * Os rótulos são os que o produto já tinha em cada porta.
 *
 * O que esta passada devolveu: a tagline e a faixa de prova, que a composição
 * aprovada do portal previa (o comentário da HOME em `design.css` as nomeia
 * desde a v4) e que uma passada anterior desta frente tinha trocado por três
 * cartões de papel.
 */
function indexPage() {
  return shell('Live Arena — Batalha de Prompts', 'data-page="index"', `
    <main class="portal-shell portal-shell-center">
        <section class="portal-hero brand-tape">
            <div class="portal-hero-brand">
                ${brandLogo('light', 'default')}
            </div>
            <div class="portal-hero-callout">
                <h1 class="portal-hero-headline">
                    <span class="portal-hero-overline">Descubra o</span>
                    <strong class="portal-hero-word">PROMPT</strong>
                </h1>
                <span class="brand-swoosh brand-swoosh--wide" aria-hidden="true"></span>
            </div>
            <p class="portal-hero-tagline">Uma arena ao vivo em que cada rodada transforma observação, estratégia e linguagem em um desafio de engenharia de prompt.</p>
            <div class="portal-actions">
                <a class="figma-cta portal-enter" href="/play">Entrar na Arena</a>
                <a class="figma-cta portal-enter portal-enter-quiet" href="/admin-arena.php">Painel do professor</a>
                <a class="figma-cta portal-enter portal-enter-quiet" href="/tv.php">Projeção da TV</a>
            </div>
            <ul class="portal-proof">
                <li><b>3 rodadas</b><span>progressão clara</span></li>
                <li><b>tempo ao vivo</b><span>ritmo de sala</span></li>
                <li><b>feedback imediato</b><span>aprendizado visível</span></li>
                <li><b>ranking coletivo</b><span>engajamento sem ruído</span></li>
            </ul>
        </section>
    </main>
  `);
}

/**
 * Casca da TV. Em modo `preview` é a MESMA tela de projeção, marcada como
 * prévia: o professor confere na TV o que a turma vai ver na parede (espera,
 * rodada, resultado e classificação final com o campeão) sem abrir sessão de
 * projeção e sem tirar a sala do lugar.
 */
function tvPage({ preview = false } = {}) {
  const bodyAttrs = preview ? 'data-page="tv" data-tv-preview="1"' : 'data-page="tv"';
  return arenaShell('Live Arena — Batalha de Prompts', bodyAttrs, `
    <main class="arena-tv" data-arena-tv>
      <div class="arena-tv-bg" aria-hidden="true"></div>
      <header class="arena-tv-topbar">
        <div class="arena-tv-brand">
          ${brandLogo('dark', 'default')}
        </div>
        <div class="arena-tv-room" data-tv-room hidden>
          <span class="arena-preset-chip" data-tv-preset></span>
          <strong data-tv-room-title></strong>
        </div>
        <button class="arena-tv-fullscreen-btn" type="button" data-tv-fullscreen aria-label="Alternar tela cheia">
          ⛶ Tela cheia
        </button>
      </header>
      <!-- O aviso de conexao da parede: discreto, e SEM apagar o que ja esta na
           tela. Um placar de dois minutos atras continua sendo o placar; o que
           nao pode e a sala inteira nao saber que a TV parou de atualizar. -->
      <div class="arena-tv-reconnect" data-tv-reconnect hidden role="status" aria-live="polite">
        <span>⚡ Conexão instável — reconectando...</span>
      </div>
      <section class="arena-tv-stage" data-tv-stage aria-live="polite">
        <div class="arena-tv-content is-connect" data-tv-content>
          <div class="arena-tv-spinner" aria-hidden="true"></div>
          <h1 data-tv-heading>Conectando a sala...</h1>
          <p data-tv-text>A projeção abre pelo Painel do professor, na sala escolhida.</p>
        </div>
      </section>
    </main>
  `);
}
function reportPage() {
  return shell('Live Arena — Batalha de Prompts', 'data-page="report" data-reset-at="0"', `
    <main class="report-shell report-page-shell">
        <header class="report-header report-head">
            <div class="arena-admin-topbar">
                <div class="report-brand-wrapper">
                  ${brandLogo('light', 'default')}
                </div>
                <div class="arena-admin-topright">
                    <div class="report-header-actions admin-links">
                        <a class="ghost-link" href="admin-arena.php">‹ Voltar ao painel</a>
                        <button class="figma-cta" type="button" data-export-report>Exportar CSV</button>
                        <button class="figma-cta figma-cta-blue" type="button" data-print-report>Imprimir</button>
                    </div>
                </div>
            </div>
            <div class="arena-admin-titles">
                <small class="arena-admin-kicker">Professor</small>
                <h1>Relatório do evento</h1>
                <span class="brand-swoosh" aria-hidden="true"></span>
            </div>
        </header>

        <section class="report-filter-panel report-panel">
            <form class="report-filters" data-report-filters>
                <label class="text-field report-date-field">
                    <span>De</span>
                    <input name="start_date" type="date">
                </label>
                <label class="text-field report-date-field">
                    <span>Ate</span>
                    <input name="end_date" type="date">
                </label>
                <button class="figma-cta figma-cta-blue" type="submit">Filtrar</button>
                <span class="report-period-pill" data-report-period></span>
                <small class="report-print-meta">
                    <span data-updated-at></span>
                </small>
            </form>
        </section>

        <section class="metric-grid" data-metric-cards data-report-data></section>

        <details class="report-panel report-more-metrics" data-report-more-metrics data-report-data>
            <summary class="panel-title"><h2>Mais indicadores</h2><span data-report-more-count></span></summary>
            <section class="metric-grid report-metric-extra" data-metric-cards-extra></section>
        </details>

        <section class="report-empty" data-report-empty hidden></section>

        <section class="report-group" data-report-data data-report-group="atividade">
            <h2 class="report-group-title">Atividade</h2>
            <div class="report-grid">
            <details class="report-panel">
                <summary class="panel-title"><h2>Atividade diaria</h2></summary>
                <canvas id="dailyChart" width="900" height="240" aria-label="Atividade diaria"></canvas>
            </details>
            <details class="report-panel">
                <summary class="panel-title"><h2>Pontuadas por hora</h2></summary>
                <canvas id="hourChart" width="900" height="240" aria-label="Pontuadas por hora"></canvas>
            </details>
            <details class="report-panel">
                <summary class="panel-title"><h2>Rodadas pontuadas</h2><span>Pontuadas e media %</span></summary>
                <canvas id="roundChart" width="900" height="240" aria-label="Rodadas pontuadas"></canvas>
            </details>
            <details class="report-panel">
                <summary class="panel-title"><h2>Calor dia x hora</h2><span>Partidas pontuadas</span></summary>
                <div class="heatmap" data-heatmap></div>
            </details>
            </div>
        </section>

        <section class="report-group" data-report-data data-report-group="pessoas">
            <h2 class="report-group-title">Participantes e respostas</h2>
            <div class="report-grid report-full-grid">
            <details class="report-panel report-panel-wide" open>
                <summary class="panel-title"><h2>Ranking dos participantes</h2><span data-report-csv-note>Top por pontos</span></summary>
                <div class="report-table-wrap">
                    <table class="report-data-table report-data-table-dense" data-player-table>
                        <thead>
                            <tr><th>#</th><th>Jogador</th><th>E-mail</th><th>Cargo</th><th>Empresa</th><th>PC</th><th>Rodadas</th><th>Pontos</th><th>Precisão</th><th>Melhor</th><th>Tempo médio</th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </details>
            <details class="report-panel">
                <summary class="panel-title"><h2>Cadastros</h2></summary>
                <div class="report-table-wrap">
                    <table class="report-data-table" data-session-table>
                        <thead>
                            <tr><th>Data</th><th>PC</th><th>Jogador</th><th>E-mail</th><th>Cargo</th><th>Empresa</th><th>Modo</th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </details>
            <details class="report-panel">
                <summary class="panel-title"><h2>Partidas e respostas</h2></summary>
                <div class="report-table-wrap">
                    <table class="report-data-table" data-match-table>
                        <thead>
                            <tr><th>Inicio</th><th>Jogador</th><th>PC</th><th>Rodada</th><th>Status</th><th>Nota</th><th>Tempo</th><th>Pontos</th><th>Prompt enviado</th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </details>
            </div>
        </section>

        <section class="report-group" data-report-data data-report-group="operacional">
            <details class="report-group-fold">
                <summary class="panel-title"><h2>Operacional</h2></summary>
                <div class="report-group-body">
                    <div class="report-block">
                        <h3>Por computador</h3>
                        <div class="comparison-table" data-station-comparison></div>
                    </div>
                    <div class="report-block">
                        <h3>Por modo</h3>
                        <div class="comparison-table" data-mode-comparison></div>
                    </div>
                    <div class="report-block">
                        <h3>Jogos</h3>
                        <div class="report-table-wrap">
                            <table class="report-data-table" data-game-table>
                                <thead>
                                    <tr><th>Jogo</th><th>Criado</th><th>Modo</th><th>Status</th><th>Jogadores</th><th>Partidas</th><th>Media</th></tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="report-block">
                        <h3>Rodadas do evento</h3>
                        <div class="report-table-wrap">
                            <table class="report-data-table" data-round-table>
                                <thead>
                                    <tr><th>Rodada</th><th>Jogo</th><th>Criada</th><th>Status</th><th>Partidas</th><th>Pontuadas</th><th>Media</th></tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </details>
        </section>

        <div class="report-image-modal" data-report-image-modal hidden>
            <button class="report-image-modal-backdrop" type="button" data-report-image-close aria-label="Fechar imagem"></button>
            <article class="report-image-modal-card" role="dialog" aria-modal="true">
                <strong data-report-image-title></strong>
                <img data-report-image-img alt="">
            </article>
        </div>
    </main>
  `);
}

/**
 * Casca da Arena. Em modo `preview` é a MESMA tela do aluno, só marcada como
 * prévia (o painel abre a sala aqui antes de publicar) — assim o professor vê
 * exatamente o layout, o CSS e o painel de missão que o aluno vai receber.
 */
function arenaPage({ preview = false } = {}) {
  const bodyAttrs = preview ? 'data-page="arena" data-arena-preview="1"' : 'data-page="arena"';
  return arenaShell('Live Arena — Batalha de Prompts', bodyAttrs, `
    <div class="arena-offline-banner" data-arena-offline hidden role="status" aria-live="polite">
      <span>⚡ Conexão instável — tentando reconectar...</span>
    </div>
    <main class="arena-shell">
      <!-- ENTRADA DO ALUNO (referência LA-02, linhas 100–123). O desenho é um
           palco de DUAS colunas — contexto à esquerda, formulário estreito à
           direita —, e o que a referência pede de dados que o produto não
           coleta NÃO entrou aqui: e-mail, cargo, empresa/instituição e aceite
           de termos não existem na ação arena_join, e inventar campo para copiar
           tela é coletar dado do aluno sem função. O motivo está escrito também
           no cabeçalho de public/assets/css/aluno.css. -->
      <section class="arena-screen is-active" data-arena-screen="join" aria-label="Entrar na Arena">
        <div class="arena-bg"></div>
        <div class="arena-card join-card arena-join-stage brand-tape">
          <div class="arena-join-context">
            <div class="join-head">
              <div class="join-brand-wrapper">
                ${brandLogo('light', 'default')}
              </div>
              <p class="arena-kicker">Entrada do aluno</p>
              <h1>Entrar na batalha</h1>
              <span class="brand-swoosh" aria-hidden="true"></span>
            </div>
            <p class="arena-join-note">Entre na sala. O professor inicia a batalha quando a turma estiver pronta.</p>
            <div class="arena-join-art" aria-hidden="true">
              <div class="arena-join-art-ring"></div>
              <div class="arena-join-art-phone"><i></i><span></span></div>
              <div class="arena-join-art-bolt"></div>
            </div>
          </div>
          <form class="arena-form arena-join-form" data-arena-join-form>
            <h2>Código e nome</h2>
            <p class="arena-join-hint">O código vem do professor.</p>
            <label class="arena-field">
              <span>Código da sala</span>
              <input name="code" autocomplete="one-time-code" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="10" placeholder="Ex.: ABC123" required>
            </label>
            <label class="arena-field">
              <span>Seu nome</span>
              <input name="name" autocomplete="off" maxlength="60" placeholder="Como você quer aparecer" required>
            </label>
            <button class="figma-cta arena-submit" type="submit">Entrar</button>
            <p class="arena-message" data-arena-join-message role="status" aria-live="polite"></p>
            <a class="ghost-link arena-join-back" href="/">Voltar ao início</a>
          </form>
        </div>
      </section>

      <section class="arena-screen" data-arena-screen="lobby" aria-label="Arena">
        <div class="arena-lobby">
          <header class="arena-lobby-header">
            <div class="arena-lobby-brand">
              ${brandLogo('dark', 'small')}
              <div class="arena-lobby-sep" aria-hidden="true"></div>
              <div class="arena-lobby-room-meta">
                <strong data-arena-room-title>Arena</strong>
                <span class="arena-room-code" data-arena-room-code></span>
              </div>
            </div>
            <div class="arena-lobby-stats">
              <span><strong data-arena-connected>0</strong> <span data-arena-connected-label>conectados</span></span>
              <button class="ghost-link" type="button" data-arena-leave>Sair</button>
            </div>
          </header>

          <!-- MODO ARENA — Turma vs. Juiz: HUD coletivo sempre visivel enquanto a
               partida corre (coracoes do Juiz, energia e o time do aluno). -->
          <div class="arena-mode-hud" data-arena-mode-hud hidden>
            <div class="arena-mode-boss">
              <span class="arena-mode-boss-label">☠️ JUIZ IA</span>
              <span class="arena-mode-hearts" data-arena-hearts role="img" aria-label="Vida do Juiz"></span>
            </div>
            <div class="arena-mode-energy">
              <span class="arena-mode-energy-label">⚡ Energia da turma</span>
              <span class="arena-mode-energy-track" aria-hidden="true"><i data-arena-energy-fill></i></span>
            </div>
            <span class="arena-mode-team" data-arena-team hidden></span>
          </div>

          <div class="arena-lobby-body">
            <!-- Voto da turma (Wild Card e desafio coletivo): uma acao por tela,
                 como o aluno precisa — nada de painel de estatisticas. -->
            <section class="arena-mode-vote" data-arena-mode-vote hidden aria-live="polite">
              <span class="arena-mode-vote-kicker" data-arena-vote-kicker></span>
              <h2 data-arena-vote-question></h2>
              <p class="arena-mode-vote-intro" data-arena-vote-intro hidden></p>
              <blockquote class="arena-mode-vote-prompt" data-arena-vote-prompt hidden></blockquote>
              <div class="arena-mode-vote-options" data-arena-vote-options role="group"></div>
              <div class="arena-mode-confidence" data-arena-confidence hidden>
                <span>Quanta certeza você tem?</span>
                <div class="arena-mode-confidence-options" data-arena-confidence-options></div>
              </div>
              <p class="arena-mode-vote-status" data-arena-vote-status role="status"></p>
            </section>

            <section class="arena-mission-panel" data-arena-mission-panel>
              <div class="signal-tape" aria-hidden="true"></div>
              <div class="arena-mission-empty" data-arena-mission-empty>
                <img class="arena-wait-illustration" src="/public/assets/figma/student-waiting-v5.svg" alt="">
                <h1 data-arena-empty-title>Aguarde o professor iniciar</h1>
                <div class="arena-victory" data-arena-victory hidden aria-live="polite"></div>
                <p class="arena-between-copy" data-arena-between-copy hidden></p>
                <div class="arena-between-score" data-arena-between-score hidden></div>
                <!-- O CAMINHO DE ENTRADA (referência LA-02B, linhas 125-145): na
                     espera o código da sala é a peça central, com o QR ao lado.
                     Quem está esperando é quem tem como chamar quem falta — e é
                     por isso que o QR vive AQUI no celular do aluno, e não só na
                     projeção: ele é o que se mostra para o colega do lado.
                     O QR só aparece quando o servidor consegue montá-lo (ele é
                     montado com o endereço da requisição); sem ele fica o
                     código, que é o que o aluno realmente lê.
                     O desenho deste bloco mora em public/assets/css/aluno.css. -->
                <div class="arena-wait-entry" data-arena-wait-entry hidden>
                  <div class="arena-wait-code">
                    <span class="arena-wait-code-label">Código da sala</span>
                    <strong data-arena-wait-code></strong>
                    <p>Mostre o código ou o QR a quem falta entrar.</p>
                  </div>
                  <figure class="arena-wait-qr" data-arena-wait-qr-box>
                    <a data-arena-wait-qr-link target="_blank" rel="noopener">
                      <img data-arena-wait-qr alt="QR de entrada nesta sala" width="168" height="168">
                    </a>
                    <figcaption>Abra em outro aparelho</figcaption>
                  </figure>
                </div>
                <div class="arena-roster" data-arena-roster></div>
                <!-- A explicação é da espera: quem está esperando é quem tem o que
                     ler. Ela sai da tela quando a batalha termina (o cliente
                     esconde a porta nesse estado). -->
                <button class="ghost-link arena-how-open" type="button" data-arena-how-open>Como funciona</button>
              </div>
              <div class="arena-mission round-workspace" data-arena-mission hidden>
                <link rel="stylesheet" href="/public/assets/css/round.css?v=50">
                <div class="arena-mission-top">
                  <span class="arena-mission-meta">
                    <span class="arena-round-count" data-arena-round-count></span>
                    <span class="arena-mission-badge" data-arena-mission-badge>MISSÃO</span>
                    <!-- As tentativas são dado da PARTIDA, como o tempo: na
                         referência (LA-03B) elas aparecem na banda de cima do
                         ringue, ao lado do nome da batalha, e não dentro do
                         compositor — lá elas empilhavam um segundo micro-rótulo
                         colado no rótulo do campo. -->
                    <span class="round-attempts-group" hidden><span>Tentativas</span>
                    <span class="arena-attempts" data-arena-attempts></span>
                    </span>
                  </span>
                  <div class="round-clock"><span>Tempo restante</span><span class="arena-timer" role="timer" aria-label="Tempo restante" data-arena-timer>--:--</span></div>
                </div>
                <div class="round-layout">
                <section class="round-briefing" aria-labelledby="round-challenge-label">
                <div class="arena-classic-stage" data-arena-classic hidden>
                  <figure class="arena-classic-figure">
                    <img data-arena-classic-image alt="">
                  </figure>
                </div>
                <h1 data-arena-mission-title id="round-challenge-label">Missão</h1>
                <span class="brand-swoosh" aria-hidden="true"></span>
 
                <div class="arena-rescue" data-arena-rescue hidden>
                  <span>PROMPT ORIGINAL — SEU PONTO DE PARTIDA</span>
                  <blockquote data-arena-rescue-prompt></blockquote>
                </div>
                <div class="arena-scenario" data-arena-scenario hidden>
                  <span data-arena-scenario-label></span>
                  <blockquote data-arena-scenario-prompt></blockquote>
                </div>
                <div class="arena-completo-hint" data-arena-completo-hint hidden>
                  <span>PROMPT COMPLETO — INCLUA</span>
                  <ul>
                    <li>contexto</li><li>instruções</li><li>restrições</li>
                    <li>público</li><li>formato</li><li>critérios</li><li>resultado esperado</li>
                  </ul>
                </div>
                <div class="arena-reversa" data-arena-reversa hidden>
                  <span>REFERÊNCIA VISUAL</span>
                  <!-- A figura tem dono: o selo de ampliar precisa de uma caixa
                       com posição própria. O clique que abre o lightbox já
                       existia no cliente e a tela não dizia nada — o selo é
                       decorativo e sem palavra, porque o orçamento de cópia da
                       tela do aluno está no teto. -->
                  <figure class="arena-reversa-figure">
                    <img data-arena-reversa-image alt="Referência visual da missão">
                    <span class="arena-reversa-zoom" aria-hidden="true">🔍</span>
                  </figure>
                  <p>Escreva o prompt que produziria algo com estas características.</p>
                </div>
                <p class="arena-mission-context" data-arena-mission-context hidden></p>
                <p class="arena-mission-body" data-arena-mission-body></p>
                </section>
                <section class="round-composer" aria-labelledby="round-answer-label">
                <form class="arena-prompt-form" data-arena-prompt-form>
                  <label class="arena-field">
                    <span id="round-answer-label">Escreva seu prompt</span>
                    <textarea name="prompt" rows="8" maxlength="4000" required></textarea>
                    <small class="arena-counter" data-arena-counter></small>
                  </label>
                  <div class="round-submit-row">
                  <button class="figma-cta figma-cta-gradient arena-submit" type="submit" data-arena-send>
                    <span>Enviar prompt</span>
                    <span class="arena-submit-hint" aria-hidden="true">Ctrl + Enter ↵</span>
                  </button>
                  </div>
                  <p class="arena-message" role="status" aria-live="polite" data-arena-mission-message></p>
                </form>

                <div class="arena-result" data-arena-result hidden>
                  <!-- Anel da nota (referência LA-03D): o mesmo número de
                       sempre, agora dentro de um anel que se preenche. Quem
                       manda no TEXTO continua sendo o [data-arena-result-percent]
                       — o anel é leitura, não dado novo. -->
                  <div class="arena-result-score">
                    <span data-arena-result-label>SUA NOTA</span>
                    <div class="arena-score-ring" data-arena-score-ring>
                      <strong data-arena-result-percent>0</strong>
                      <!-- A unidade é escrita pelo JS junto com o valor ("de 100"
                           no percentual, "acerto" na sala clássica): texto que não
                           muda sozinho não ocupa a tela antes de existir nota. -->
                      <span class="arena-score-ring-unit" data-arena-result-unit></span>
                    </div>
                  </div>
                  <p class="arena-feedback" data-arena-feedback></p>
                  <!-- Diagnóstico: onde o prompt foi melhor e onde ainda há
                       ponto a ganhar — as duas frases que decidem o próximo
                       movimento. O detalhe critério a critério continua atrás
                       da dobra, como já era. -->
                  <div class="arena-diagnosis" data-arena-diagnosis hidden></div>
                  <p class="arena-evolution" data-arena-evolution hidden></p>
                  <button class="figma-cta figma-cta-blue" type="button" data-arena-retry hidden>Melhorar prompt</button>
                  <p class="arena-result-next" data-arena-result-next hidden></p>
                  <!-- Os critérios abrem sob demanda: a nota, o feedback e o próximo
                       passo ficam na frente, e quem quiser o detalhe pede. -->
                  <details class="arena-breakdown-fold" data-arena-breakdown-fold>
                    <summary>Ver critérios</summary>
                    <div class="arena-breakdown" data-arena-breakdown></div>
                  </details>
                </div>
                </section>
                </div>
              </div>
            </section>

            <aside class="arena-side">
              <!-- Resultados por missão e destaques abrem sob demanda: o cartão é
                   uma dobra fechada e o próprio título é a alça. Depois da
                   partida, a leitura principal é a classificação. -->
              <details class="arena-card arena-results-panel" data-arena-results-panel data-arena-fold>
                <summary><h2>Resultados das missões</h2></summary>
                <div data-arena-results-list><p class="arena-empty">Ainda sem resultados.</p></div>
              </details>
              <section class="arena-card arena-ranking-panel">
                <h2 data-arena-ranking-heading data-title-active="Classificação parcial" data-title-final="Classificação geral">Classificação parcial</h2>
                <div data-arena-ranking><p class="arena-empty">Ainda sem pontuação.</p></div>
              </section>
              <details class="arena-card arena-highlights-panel" data-arena-fold>
                <summary><h2>Destaques</h2></summary>
                <div data-arena-highlights><p class="arena-empty">Aparecem após as missões.</p></div>
              </details>
            </aside>
          </div>
        </div>
      </section>

      <!-- COMO A BATALHA FUNCIONA (referência LA-04, tela "how"). O desenho desta
           tela mora em public/assets/css/aluno.css — a folha dona da jornada do
           aluno, e o lugar onde as telas que ainda faltam portar aterrissam.
           A tela entra
           na jornada entre a espera e a rodada — o aluno chega pelo botão da
           espera e sai para a sala. A superfície é a mesma da sala (arena-lobby)
           e a faixa é a NOSSA (brand-tape), não a fita amarela transparente da
           referência: esta tela não inventa um quarto pintor da fita.
           O texto diz só o que o produto faz: a missão pede um prompt, o juiz
           devolve a nota com os critérios, e os três TIPOS de missão são os do
           catálogo. Nada de "três rodadas": quantas rodadas a sala tem é
           decisão do professor. -->
      <section class="arena-screen" data-arena-screen="how" data-arena-how aria-label="Como a batalha funciona">
        <div class="arena-lobby arena-how">
          <article class="arena-card arena-how-card brand-tape">
            <p class="arena-kicker">Seu percurso</p>
            <h1>Como jogar</h1>
            <span class="brand-swoosh" aria-hidden="true"></span>
            <ol class="arena-how-steps">
              <li><span>01</span><strong>Entenda a missão</strong></li>
              <li><span>02</span><strong>Escreva o prompt</strong></li>
              <li><span>03</span><strong>Veja sua pontuação</strong></li>
            </ol>
            <details class="arena-how-types">
              <summary>Tipos de missão</summary>
            <ul class="arena-how-rounds">
              <li>
                <strong>Engenharia reversa</strong>
                <span>Você vê uma referência e escreve o prompt que poderia produzi-la.</span>
              </li>
              <li>
                <strong>Resgate</strong>
                <span>Um prompt fraco é o ponto de partida: complete o que falta.</span>
              </li>
              <li>
                <strong>Prompt completo</strong>
                <span>A instrução inteira: contexto, restrições, público e formato.</span>
              </li>
            </ul>
            </details>
            <button class="figma-cta figma-cta-blue arena-how-back" type="button" data-arena-how-back>Voltar à sala</button>
          </article>
        </div>
      </section>

      <div class="arena-lightbox" data-arena-lightbox hidden>
        <button class="arena-lightbox-close" type="button" data-arena-lightbox-close title="Fechar imagem">✕</button>
        <div class="arena-lightbox-content">
          <img data-arena-lightbox-img alt="Imagem ampliada">
          <p class="arena-lightbox-hint">Toque para fechar</p>
        </div>
      </div>
    </main>
  `);
}

function adminLoginPage() {
  return arenaShell('Live Arena — Batalha de Prompts', 'data-page="admin-arena"', `
    <main class="portal-shell admin-login-shell">
      <div class="admin-login-card brand-tape" data-admin-arena-login-panel>
        <div class="admin-login-brand">
          ${brandLogo('light', 'default')}
        </div>
        <div class="admin-login-head">
          <h1>Entrar no painel</h1>
          <span class="brand-swoosh" aria-hidden="true"></span>
        </div>
        <form class="arena-form admin-login-form" data-admin-arena-login>
          <label class="arena-field">
            <span>Senha Administrativa</span>
            <input type="password" name="password" autocomplete="current-password" required>
          </label>
          <button class="figma-cta figma-cta-blue admin-login-submit" type="submit">Entrar</button>
          <p class="form-message" data-admin-arena-message></p>
        </form>
        <a class="ghost-link admin-login-back" href="/">‹ Voltar ao início da Arena</a>
      </div>
    </main>
  `);
}

function adminArenaPage(authenticated = false) {
  if (!authenticated) {
    return adminLoginPage();
  }

  const logoutLink = '<button class="ghost-link sidebar-logout" type="button" data-arena-admin-logout>Sair da conta</button>';

  return arenaShell('Live Arena — Batalha de Prompts', 'data-page="admin-arena"', `
    <main class="arena-admin-layout">
      <!-- SIDEBAR -->
      <aside class="arena-admin-sidebar">
        <div class="brand-logo-sidebar">
          ${brandLogo('light', 'default')}
        </div>
        <!-- O título do painel morava numa faixa acima do conteúdo, com o portão
             da Arena e o menu rápido ao lado. A faixa saiu (ela gastava uma
             altura inteira em toda tela para repetir o que a lateral já diz, e
             "Analytics" já era item da navegação); o título desce para o topo
             da coluna por onde o professor troca de seção. -->
        <p class="arena-sidebar-title">
          <b>Painel da Arena</b>
          <small>Operação ao vivo</small>
        </p>
        <nav class="arena-sidebar-nav" aria-label="Seções do painel">
          <a href="#gate" class="sidebar-link is-active"><span class="sidebar-icon">${iconDashboard}</span> Visão Geral</a>
          <a href="#rooms" class="sidebar-link"><span class="sidebar-icon">${iconRooms}</span> Salas Ativas</a>
          <a href="#challenges" class="sidebar-link"><span class="sidebar-icon">${iconChallenges}</span> Banco de Desafios</a>
          <a href="#lessons" class="sidebar-link"><span class="sidebar-icon">${iconLessons}</span> Aulas e Trilhas</a>
          <a href="/report.php" class="sidebar-link"><span class="sidebar-icon">${iconReport}</span> Relatório Analytics</a>
        </nav>
        <div class="arena-sidebar-bottom">
          <!-- O PÉ DA LATERAL TEM UMA COISA SÓ: quem está conectado. Aqui
               moravam o portão da Arena, o selo do estado dele e um link
               "Portal" — um bloco de operação no canto onde a pessoa procura
               a conta, três ações de naturezas diferentes na mesma pilha. O
               portão subiu para o cartão da Visão Geral (o do topo do
               conteúdo), que é onde o painel mostra o estado da operação
               inteira, e o atalho do portal saiu: a lateral já navega o
               painel, e o portal é a porta de quem entra. -->
          <div class="admin-user-card">
            <div class="admin-user-avatar">P</div>
            <div class="admin-user-info">
              <b>Professor</b>
              <small>Sessão ativa</small>
            </div>
          </div>
          ${logoutLink}
        </div>
      </aside>

      <!-- MAIN CONTENT -->
      <div class="arena-admin-main">
        <div class="arena-admin-scroll-area arena-admin">
          <div data-admin-arena-content>
        <!-- A faixa do painel: sessao que venceu no meio da aula ou conexao que
             oscilou. Fica DENTRO do conteudo autenticado — quando o login volta
             a aparecer, ela some junto, em vez de flutuar sobre a tela errada. -->
        <div class="arena-session-banner" data-arena-session-banner hidden role="status" aria-live="polite">
          <span data-arena-session-text></span>
          <!-- A REENTRADA mora aqui, dentro da faixa. A pagina autenticada nao
               carrega o cartao de login no DOM (o servidor entrega uma pagina
               ou outra), entao mandar o professor para "o login" era mandar
               para uma tela vazia: o conteudo saia de cena e nao havia
               formulario nenhum para entrar de novo. -->
          <form class="arena-session-retry" data-arena-session-retry-form hidden>
            <input type="password" name="password" autocomplete="current-password" aria-label="Senha administrativa" required>
            <button class="figma-cta figma-cta-blue" type="submit" data-arena-session-retry hidden>Entrar de novo</button>
          </form>
        </div>
        <!-- Cartão-herói do painel (referência LA-05): UM cartão para o trabalho
             "visão geral" — os números da Arena numa faixa e as duas ações do
             painel inteiro, em ordem de leitura: o estado da entrada (o portão
             da Arena, que vale para toda sala) e a ação primária ("+ Nova
             sala"). O portão estava no pé da barra lateral, num bloco de
             operação no canto onde a pessoa procura a             conta; aqui ele lê como o
             que ele é — o estado do painel —, e o cartão só existe nesta tela
             quando nenhuma sala está aberta (com a sala em cena ele sai de
             cena, e o portão volta sozinho se estiver fechado: a regra do
             admin-arena-hero vive em refinement.css). -->
        <section class="report-panel admin-arena-hero">
          <div class="arena-hero-main">
            <div class="arena-hero-stats" data-arena-hero-stats></div>
            <!-- OS DOIS CONTROLES DO PAINEL SÃO UM BLOCO SÓ. Soltos, quando a
                 linha não cabia mais o botão que sobrava caía sozinho na linha
                 de baixo, alinhado à esquerda (medido em 1180: o portão ficava
                 na ponta direita da primeira linha e o "+ Nova sala" sozinho
                 embaixo). Juntos e encostados à direita, ou cabem os dois, ou
                 descem os dois. -->
            <div class="arena-hero-controls">
              <div class="arena-hero-gate">
                <span class="status-live arena-admin-status" data-arena-gate-status hidden></span>
                <button class="figma-cta figma-cta-blue arena-gate-button" type="button" data-arena-gate-toggle>Carregando...</button>
              </div>
              <button class="figma-cta figma-cta-blue arena-hero-primary" type="button" onclick="openCreateRoomDialog()">+ Nova sala</button>
            </div>
          </div>
        </section>
        <!-- Painel Cockpit da Sala Selecionada (sempre no topo para controle em tempo real).
             Cabeçalho no desenho da referência (LA-06): os dois selos em cima —
             "sala em destaque" e o estado da sala, que o cliente escreve — e o
             título grande embaixo. A linha de dados, as ações e as duas colunas
             vêm do renderDetail, logo abaixo. O título é um h1 porque é o
             assunto da tela quando o detalhe está aberto: o h1 da página é o
             nome do painel, e o detalhe mora dentro dele. (Nada de crase nesta
             nota: ela vive dentro de um template literal.) -->
        <section id="room-detail" class="report-panel admin-arena-detail" data-arena-detail hidden>
          <!-- SEM fita de sinal. A referência da sala em destaque abre o cartão
               com uma faixa diagonal amarela e preta; ela foi adotada na LA-10 e
               recusada depois, a pedido: no Live Arena o amarelo já significa
               outra coisa (o gabarito do juiz e o PIN), e uma tarja de obra no
               topo do cartão mais importante da aula não é sinal nenhum. A borda
               do cartão faz o mesmo trabalho sem gastar a cor. -->
          <article class="arena-room-card">
          <!-- O CABEÇALHO DA SALA EM DESTAQUE, na ordem da referência: os dois
               selos, o título, a linha de números e as ações da aula — os
               controles do meio da aula (pausar, encerrar a rodada, fechar o
               placar), as duas portas de inspeção na MESMA sala e, no fim, o que
               fecha a conta (encerrar sala, arquivar). A ação da vez não mora
               aqui: ela é o botão grande do palco da partida, na coluna da
               direita, e um controle da mesma ação em dois lugares foi como esta
               linha virou uma lista de sete botões com o mesmo peso. -->
          <header class="arena-detail-head-bar" data-arena-detail-head>
            <!-- A FAIXA DE ESTADO: o bloco que diz EM QUE PÉ a sala está, escrito
                 pelo cliente a cada leitura do servidor. Ela é a casca de três
                 linhas do cabeçalho — os selos, o título e a linha de números —,
                 e é o data-arena-state-bar porque é ela que os portões de
                 navegador leem para conferir que a tela diz o estado, os lugares,
                 os envios e a próxima ação. O estado é o PRIMEIRO selo (ao lado de
                 "sala em destaque", como a referência desenha), os números vêm
                 na terceira linha e a ação da vez fecha a linha dos números: sem
                 ela o professor teria de deduzir o próximo passo do botão, que
                 fica duas dobras abaixo. -->
            <div class="arena-detail-band" data-arena-state-bar>
            <div class="arena-detail-chips">
              <span class="arena-detail-badge-live">● Sala em destaque</span>
              <span class="arena-detail-state arena-state-cell is-estado" data-arena-detail-state hidden></span>
              <!-- A PORTA DO ALUNO fica na linha dos selos, na ponta: ela é uma
                   inspeção, não um comando da aula, e no print ela não ocupa a
                   fila dos botões. O slot é escrito por renderTopbarQuick. -->
              <div class="arena-chips-doors" data-arena-chips-doors hidden></div>
              <button class="ghost-link arena-detail-close" type="button" data-arena-close-detail title="Recolher detalhes da sala" aria-label="Fechar detalhes">✕</button>
            </div>
            <!-- O TÍTULO E A AÇÃO DA VEZ NA MESMA LINHA, uma em cada ponta.
                 A pílula da vez já morou no fim da linha de números e era ela
                 que desestabilizava a faixa: 221 px de pílula disputando a fila
                 com quatro dados, ela caía numa linha diferente a cada largura
                 — medida em 1280, 1180 e 1024, trocou de casa três vezes. Ao
                 lado do título ela tem lugar fixo em qualquer tela, e a linha
                 de números fica sendo só dado. -->
            <div class="arena-detail-title-row">
              <h1 data-arena-detail-title>Sala</h1>
              <span class="arena-detail-proxima" data-arena-proxima hidden></span>
            </div>
            <!-- A LINHA DE NÚMEROS (participantes, conectados, rodada, envios) e
                 o selo da sincronia: só número com o nome do dado, que é o que a
                 referência escreve. -->
            <div class="arena-detail-numbers">
              <div class="arena-state-bar" data-arena-numbers></div>
              <span class="arena-workbench-sync" data-arena-workbench-sync></span>
            </div>
            </div>
            <div class="arena-room-card-actions arena-detail-command">
              <!-- Os controles da batalha, escritos pelo cliente. -->
              <div class="arena-hero-actions" data-arena-hero-actions></div>
              <!-- A PORTA DA PROJEÇÃO ("ver na TV") entra na fila dos comandos,
                   como o print a desenha: ela é a quarta pílula da linha, entre
                   "encerrar rodada" e "encerrar sala". É a inspeção da MESMA
                   sala em destaque, e o slot é do cliente — sem sala
                   selecionada ele fica vazio e escondido. -->
              <div class="arena-topbar-quick" data-arena-topbar-quick hidden></div>
              <!-- O que fecha a conta da aula: encerrar a sala e arquivar. -->
              <div class="arena-room-danger" data-arena-room-danger hidden></div>
            </div>
          </header>
          <!-- AS DUAS COLUNAS DO CARTÃO (referência LA-06): o acesso à esquerda —
               código, cópias, QR e projeção, com a gestão da sala embaixo — e a
               partida à direita — preset, palco da rodada com a ação da vez,
               indicadores e a frase do próximo passo. -->
          <div class="arena-detail-grid">
            <aside class="arena-detail-access arena-cockpit-code" data-arena-hero-access></aside>
            <section class="arena-detail-match" data-arena-detail-match></section>
          </div>
          </article>
          <div data-arena-detail-body></div>
        </section>
        <!-- Lista de Salas (com altura contida para não esticar a página) -->
        <section id="rooms" class="report-panel admin-arena-rooms">
          <div class="arena-panel-title-wrap">
            <h2>Salas</h2>
            <span class="arena-room-counter-pill" data-arena-room-count></span>
          </div>
          <div class="admin-arena-room-list" data-arena-room-list><p class="arena-empty">Nenhuma sala ainda.</p></div>
        </section>

        <section id="challenges" class="report-panel admin-arena-challenges">
          <h2>Banco de desafios</h2>
          <div class="admin-arena-challenge-actions">
            <button class="figma-cta figma-cta-blue" type="button" data-arena-new-challenge>Novo desafio</button>
            <p class="form-message" data-arena-challenge-message></p>
          </div>
          <div class="admin-arena-challenge-grid" data-arena-challenge-list><p class="arena-empty">Nenhum desafio ainda.</p></div>
        </section>

        <section class="report-panel" data-arena-report-panel hidden>
          <h2>Resultados coletivos</h2>
          <div data-arena-report-body></div>
        </section>

        <section id="lessons" class="report-panel admin-arena-lessons">
          <h2>Progressão das aulas</h2>
          <div class="admin-arena-lesson-grid" data-arena-lesson-list><p class="arena-empty">Carregando aulas...</p></div>
        </section>
      </div>
     </div> <!-- /scroll-area -->
    </div> <!-- /arena-admin-main -->
    </main>

    <dialog class="arena-dialog" data-arena-dialog>
      <div class="arena-dialog-card" data-arena-dialog-form>
        <button class="arena-dialog-close" type="button" data-arena-dialog-close aria-label="Fechar">&times;</button>
        <div data-arena-dialog-body></div>
      </div>
    </dialog>
  `);
}

export function renderPage(input, { authenticated = false } = {}) {
  const url = new URL(input, 'http://local');
  if (url.pathname === '/' || url.pathname === '/index.php') return ok(indexPage());
  if (url.pathname === '/tv.php') return ok(tvPage());
  // Prévia da projeção: superfície administrativa, sem sessão de TV.
  if (url.pathname === '/tv-preview.php') return authenticated ? ok(tvPage({ preview: true })) : redirect('/admin-arena.php');
  if (url.pathname === '/arena.php') return ok(arenaPage());
  if (url.pathname === '/play') return ok(arenaPage());
  if (url.pathname === '/admin-arena.php') return ok(adminArenaPage(authenticated));
  // Prévia do aluno: superfície administrativa (monta a missão como o aluno a
  // recebe, sem o gabarito do juiz) — anônimos caem no login do painel.
  if (url.pathname === '/aluno-preview.php') return authenticated ? ok(arenaPage({ preview: true })) : redirect('/admin-arena.php');
  if (url.pathname === '/admin.php') return redirect('/admin-arena.php');
  // O relatorio e superficie administrativa: anonimos vao para o login do painel.
  if (url.pathname === '/report.php') return authenticated ? ok(reportPage()) : redirect('/admin-arena.php');
  return response(404, notFoundPage());
}

/**
 * Página não encontrada. Era texto puro numa resposta HTML — sem marca, sem
 * fundo, sem caminho de volta. Usa a mesma casca do portal, então a tipografia,
 * o fundo e o botão são os do produto, sem uma folha nova para isto.
 */
function notFoundPage() {
  return shell('Live Arena — Batalha de Prompts', 'data-page="index"', `
    <main class="portal-shell portal-shell-center">
        <section class="portal-hero brand-tape">
            <div class="portal-hero-brand">
                ${brandLogo('light', 'default')}
            </div>
            <div class="portal-hero-callout">
                <h1 class="portal-hero-headline">Página não encontrada</h1>
                <span class="brand-swoosh brand-swoosh--wide" aria-hidden="true"></span>
            </div>
            <a class="figma-cta portal-enter" href="/">Voltar ao início</a>
        </section>
    </main>
  `);
}

const ok = body => response(200, body);
const redirect = (location) => ({ status: 302, headers: { location }, body: '' });
const response = (status, body) => ({
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  },
  body,
});

export { indexPage, tvPage, reportPage, arenaPage, adminArenaPage };
