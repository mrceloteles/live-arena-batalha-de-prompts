const refinementStyles = '<link rel="stylesheet" href="/public/assets/css/refinement.css?v=21">';
const assets = '<link rel="stylesheet" href="/public/assets/css/app-authorial.css?v=31"><link rel="stylesheet" href="/public/assets/css/design.css?v=56">' + refinementStyles;
const arenaAssets = '<link rel="stylesheet" href="/public/assets/css/app-authorial.css?v=31"><link rel="stylesheet" href="/public/assets/css/arena.css?v=67"><link rel="stylesheet" href="/public/assets/css/design.css?v=56">' + refinementStyles;
const script = '<script src="/public/assets/js/app.js?v=42"></script>';
const arenaScript = '<script src="/public/assets/js/arena.js?v=106"></script>';

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

function indexPage() {
  return shell('Live Arena — Batalha de Prompts', 'data-page="index"', `
    <main class="portal-shell portal-shell-center">
        <section class="portal-hero brand-tape">
            <div class="portal-hero-brand">
                ${brandLogo('light', 'default')}
            </div>
            <div class="portal-hero-callout">
                <h1 class="portal-hero-headline">Descubra o <span>PROMPT</span></h1>
                <span class="brand-swoosh brand-swoosh--wide" aria-hidden="true"></span>
            </div>
            <a class="figma-cta portal-enter" href="/play">Entrar na Arena</a>
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
      <section class="arena-screen is-active" data-arena-screen="join" aria-label="Entrar na Arena">
        <div class="arena-bg"></div>
        <div class="arena-card join-card brand-tape">
          <div class="join-head">
            <div class="join-brand-wrapper">
              ${brandLogo('light', 'default')}
            </div>
            <h1>Entrar na batalha</h1>
            <span class="brand-swoosh" aria-hidden="true"></span>
          </div>
          <p class="arena-kicker">O código vem do professor.</p>
          <form class="arena-form" data-arena-join-form>
            <label class="arena-field">
              <span>Código da sala</span>
              <input name="code" autocomplete="one-time-code" inputmode="numeric" maxlength="10" placeholder="Ex.: 244 416" required>
            </label>
            <label class="arena-field">
              <span>Seu nome</span>
              <input name="name" autocomplete="off" maxlength="60" placeholder="Como você quer aparecer" required>
            </label>
            <button class="figma-cta arena-submit" type="submit">Entrar</button>
            <p class="arena-message" data-arena-join-message></p>
          </form>
          <a class="ghost-link" href="/">Voltar ao início</a>
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
                <img class="arena-wait-illustration" src="/public/assets/figma/tv-waiting-players-illustration.svg" alt="">
                <h1 data-arena-empty-title>Aguarde o professor iniciar</h1>
                <div class="arena-roster" data-arena-roster></div>
              </div>
              <div class="arena-mission round-workspace" data-arena-mission hidden>
                <link rel="stylesheet" href="/public/assets/css/round.css?v=19">
                <div class="arena-mission-top">
                  <span class="arena-mission-meta">
                    <span class="arena-round-count" data-arena-round-count></span>
                    <span class="arena-mission-badge" data-arena-mission-badge>MISSÃO</span>
                    <!-- As tentativas são dado da PARTIDA, como o tempo: na
                         referência (LA-03B) elas aparecem na banda de cima do
                         ringue, ao lado do nome da batalha, e não dentro do
                         compositor — lá elas empilhavam um segundo micro-rótulo
                         colado no rótulo do campo. -->
                    <span class="round-attempts-group"><span>Tentativas</span>
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
                <h2>Classificação geral</h2>
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
        <nav class="arena-sidebar-nav" aria-label="Seções do painel">
          <a href="#gate" class="sidebar-link is-active"><span class="sidebar-icon">${iconDashboard}</span> Visão Geral</a>
          <a href="#rooms" class="sidebar-link"><span class="sidebar-icon">${iconRooms}</span> Salas Ativas</a>
          <a href="#challenges" class="sidebar-link"><span class="sidebar-icon">${iconChallenges}</span> Banco de Desafios</a>
          <a href="#lessons" class="sidebar-link"><span class="sidebar-icon">${iconLessons}</span> Aulas e Trilhas</a>
          <a href="/report.php" class="sidebar-link"><span class="sidebar-icon">${iconReport}</span> Relatório Analytics</a>
        </nav>
        <div class="arena-sidebar-bottom">
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
        <header class="arena-admin-head-top">
          <div class="arena-topbar-title">
            <b>Painel da Arena</b>
            <small>Operação ao vivo</small>
          </div>
          <div class="arena-admin-topright">
            <nav class="arena-admin-crumb" aria-label="Navegação rápida">
              <a class="ghost-link" href="/report.php">Analytics</a>
              <a class="ghost-link" href="/">Portal</a>
            </nav>
            <span class="status-live arena-admin-status" data-arena-gate-status hidden></span>
            <button class="figma-cta" style="height: 36px; min-height: 36px; padding: 0 16px; font-size: 13px;" type="button" data-arena-gate-toggle>Carregando...</button>
          </div>
        </header>

        <div class="arena-admin-scroll-area arena-admin">
          <div data-admin-arena-content>
        <!-- Cartão-herói do painel (referência LA-05): UM cartão para o trabalho
             "visão geral" — título, ação primária e os números da Arena numa
             faixa. O portão de entrada continua no cabeçalho, onde ele já era o
             controle da operação inteira; aqui não se repete o botão. -->
        <section class="report-panel admin-arena-hero">
          <div class="arena-hero-main">
            <div class="arena-hero-stats" data-arena-hero-stats></div>
            <button class="figma-cta figma-cta-blue arena-hero-primary" type="button" onclick="openCreateRoomDialog()">+ Nova sala</button>
          </div>
          <div class="arena-hero-stats" data-arena-hero-stats></div>
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
          <div class="arena-detail-head-bar">
            <div class="arena-detail-heading">
              <div class="arena-detail-chips">
                <span class="arena-detail-badge-live">● SALA EM DESTAQUE</span>
                <span class="arena-detail-state" data-arena-detail-state hidden></span>
              </div>
              <h1 data-arena-detail-title>Sala</h1>
            </div>
            <button class="ghost-link arena-detail-close" type="button" data-arena-close-detail title="Recolher detalhes da sala">✕ Fechar detalhes</button>
          </div>
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







