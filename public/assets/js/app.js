(() => {
  const body = document.body;
  const page = body?.dataset.page;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  // Estado só do que as duas páginas vivas usam: o portal (`/`, `/index.php`) e o
  // relatório (`/report.php`). Partida, rodada, relógios da projeção, transições de
  // tela e a fila de retentativa do Gemini eram do cliente clássico e saíram com
  // ele.
  const state = {
    knownResetAt: Number(body?.dataset.resetAt || 0),
    resetReloading: false,
    networkVisible: false,
    reportMetrics: null,
  };

  function ensureNetworkModal() {
    let modal = $('[data-network-modal]');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'network-modal';
    modal.dataset.networkModal = '';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="network-modal-card" role="alertdialog" aria-live="assertive" aria-label="Internet instável">
        <strong>Internet instável</strong>
        <p>Reconectando com o servidor…</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  let networkRecoveryTimer = null;

  function scheduleNetworkRecovery() {
    if (networkRecoveryTimer) return;
    // Auto-recuperacao: some do banner assim que o servidor voltar, mesmo sem nova acao do usuario.
    networkRecoveryTimer = window.setInterval(async () => {
      try {
        const response = await fetch('/healthz', { cache: 'no-store' });
        if (response.ok) hideNetworkModal();
      } catch { /* servidor ainda fora: continua tentando */ }
    }, 2000);
  }

  function showNetworkModal() {
    const modal = ensureNetworkModal();
    state.networkVisible = true;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
    scheduleNetworkRecovery();
  }

  function hideNetworkModal() {
    if (networkRecoveryTimer) {
      window.clearInterval(networkRecoveryTimer);
      networkRecoveryTimer = null;
    }
    const modal = ensureNetworkModal();
    state.networkVisible = false;
    modal.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!state.networkVisible) modal.hidden = true;
    }, 220);
  }

  function isConnectionError(error) {
    return !navigator.onLine
      || error instanceof TypeError
      || error?.networkIssue === true;
  }

  function isNetworkError(error) {
    return isConnectionError(error);
  }

  async function api(action, payload = {}, options = {}) {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? 12000;
    const networkWarningDelay = options.networkWarningDelay ?? 0;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutTimer = window.setTimeout(() => controller.abort(), timeout);
      const slowTimer = networkWarningDelay > 0
        ? window.setTimeout(showNetworkModal, networkWarningDelay)
        : null;

      try {
        const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (slowTimer) window.clearTimeout(slowTimer);

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
          handleServerReset(data);
          const message = typeof data.error === 'string' ? data.error : 'Nao foi possivel concluir a acao.';
          const error = new Error(message);
          error.details = data.error;
          error.httpStatus = response.status;
          error.networkIssue = response.status >= 500;
          if (error.networkIssue && options.showNetworkModal !== false) showNetworkModal();
          else hideNetworkModal();
          throw error;
        }

        handleServerReset(data);
        hideNetworkModal();
        return data;
      } catch (error) {
        if (slowTimer) window.clearTimeout(slowTimer);
        if (error?.name === 'AbortError') {
          error.timedOut = true;
        }
        lastError = error;
        if (isConnectionError(error) && options.showNetworkModal !== false) showNetworkModal();
        if (attempt < retries) {
          await delay(450 * (attempt + 1));
        }
      } finally {
        window.clearTimeout(timeoutTimer);
      }
    }

    throw lastError;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }



  // O servidor anuncia um `reset_at` novo quando a sala é zerada. Nas páginas
  // vivas isso significa recarregar: a tela inteira se monta no load. O ramo que
  // devolvia o jogador clássico ao idle sem recarregar saiu com /game.php, e com
  // ele a sessão guardada no localStorage.
  function handleServerReset(data) {
    const resetAt = Number(data?.reset_at || 0);
    if (!resetAt) return;

    // Primeira resposta depois do load: só registra a referência, para não
    // recarregar quem acabou de carregar.
    if (!state.knownResetAt) {
      state.knownResetAt = resetAt;
      return;
    }
    if (resetAt <= state.knownResetAt) return;

    state.knownResetAt = resetAt;
    if (state.resetReloading) return;
    state.resetReloading = true;
    window.location.reload();
  }

  function toast(message) {
    const node = $('[data-toast]');
    if (!node) return;
    node.hidden = false;
    node.textContent = message;
    window.clearTimeout(node._timer);
    node._timer = window.setTimeout(() => {
      node.hidden = true;
    }, 4200);
  }

  function setBusy(button, busy, busyText = 'Aguarde...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
      button.classList.add('is-loading');
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function initReport() {
    // A autenticacao e via cookie HttpOnly: o servidor injeta o token nas
    // chamadas admin. Se o cookie faltar/expirar (401), volta ao login.
    const redirectUnauthorized = (error) => {
      if (error && error.status === 401) {
        window.location.replace('/admin-arena.php');
        return true;
      }
      return false;
    };
    const form = $('[data-report-filters]');
    const printButton = $('[data-print-report]');
    const exportButton = $('[data-export-report]');
    const resetButton = $('[data-admin-reset]');
    const logoutButton = $('[data-admin-logout]');
    const getPayload = () => ({
      start_date: form?.elements?.start_date?.value || '',
      end_date: form?.elements?.end_date?.value || '',
    });

    const load = async () => {
      const data = await api('report_metrics', getPayload(), { timeout: 20000, retries: 1 });
      state.reportMetrics = data.metrics || {};
      renderFullReport(state.reportMetrics);
    };

    // Impressão: o papel não tem clique, então as dobras do relatório abrem
    // antes de imprimir e voltam como estavam depois. Vale para o botão e para
    // o Ctrl+P, porque os dois passam por `beforeprint`.
    const abrirDobrasParaImpressao = () => {
      const fechadas = $$('[data-report-data] details').filter((dobra) => !dobra.open);
      fechadas.forEach((dobra) => { dobra.open = true; });
      return () => fechadas.forEach((dobra) => { dobra.open = false; });
    };
    let restaurarDobras = null;
    window.addEventListener('beforeprint', () => {
      if (!restaurarDobras) restaurarDobras = abrirDobrasParaImpressao();
    });
    window.addEventListener('afterprint', () => {
      if (!restaurarDobras) return;
      restaurarDobras();
      restaurarDobras = null;
    });
    printButton?.addEventListener('click', () => window.print());
    exportButton?.addEventListener('click', () => {
      try {
        exportReportCsv();
      } catch (error) {
        toast(error?.message || 'Nao foi possivel exportar o CSV.');
      }
    });
    logoutButton?.addEventListener('click', async () => {
      await api('admin_logout').catch(() => {});
      window.location.replace('/admin-arena.php');
    });
    resetButton?.addEventListener('click', async (event) => {
      if (!confirm('Reiniciar a sala? O historico e preservado no relatorio.')) return;
      const button = event.currentTarget;
      setBusy(button, true, 'Reiniciando...');
      try {
        await api('admin_reset');
        toast('Sala reiniciada.');
        await load();
      } catch (error) {
        toast(error?.message || 'Nao foi possivel reiniciar a sala.');
      } finally {
        setBusy(button, false);
      }
    });
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      setBusy(button, true, 'Atualizando...');
      try {
        await load();
      } catch (error) {
        if (isNetworkError(error)) showNetworkModal();
        else toast(error.message);
      } finally {
        setBusy(button, false);
      }
    });

    try {
      await load();
      bindReportImageModal();
    } catch (error) {
      if (!redirectUnauthorized(error)) {
        if (isNetworkError(error)) showNetworkModal();
        else toast(error.message);
      }
    }
  }

  function metricCard(label, value, hint = '') {
    return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`;
  }

  // UM aviso para as três famílias de seção vazia (tabela, comparação e mapa de
  // calor). Antes eram três frases diferentes para a mesma informação, e no
  // período sem dados o relatório mostrava oito cartões repetindo "sem dados" —
  // medido em 2026-09-15: 7 ocorrências na tela em 390 e em 1440.
  const SEM_DADOS = 'Sem dados no periodo.';

  /**
   * O período não tem uma linha em lugar nenhum. É a única situação em que o
   * relatório troca todos os cartões por um aviso: com dado em alguma seção, o
   * que está vazio é só aquela seção, e esconder as outras mentiria sobre o que
   * existe.
   */
  function periodoSemDados(metrics) {
    const cards = metrics.cards || {};
    // `by_hour` NÃO entra na conta das listas: ela sempre traz as 24 horas do dia,
    // com zero nas vazias, e olhar só o tamanho dela diria "tem dado" em qualquer
    // período. Medido em 2026-09-15, com o filtro em 2020: by_hour com 24 linhas
    // e todo o resto em zero.
    if (['total_sessions', 'unique_players', 'games_started', 'matches_started', 'matches_scored']
      .some((campo) => Number(cards[campo] || 0) > 0)) return false;
    const listas = [
      metrics.by_day, metrics.by_day_hour, metrics.by_station, metrics.by_mode, metrics.by_round,
      metrics.top_players,
      metrics.tables?.sessions, metrics.tables?.matches, metrics.tables?.games, metrics.tables?.rounds,
    ];
    return listas.every((lista) => !Array.isArray(lista) || lista.length === 0);
  }

  /** Um estado vazio útil no lugar de oito cartões dizendo "sem dados". */
  function renderReportVazio(vazio) {
    $$('[data-report-data]').forEach((bloco) => { bloco.hidden = vazio; });
    const alvo = $('[data-report-empty]');
    if (!alvo) return;
    alvo.hidden = !vazio;
    alvo.innerHTML = vazio
      ? `<strong>${SEM_DADOS}</strong><span>Ajuste as datas para consultar outro periodo.</span>`
      : '';
  }

  function renderFullReport(metrics) {
    const cards = metrics.cards || {};
    const period = metrics.period || {};
    // A primeira leitura é o resumo do período: quatro indicadores, e só. Os
    // outros oito são do mesmo tipo e ficam no mesmo cartão, a um clique.
    const cardTarget = $('[data-metric-cards]');
    const extraTarget = $('[data-metric-cards-extra]');
    if (cardTarget) {
      cardTarget.innerHTML = [
        metricCard('Participantes', formatInteger(cards.total_sessions), ''),
        metricCard('Envios', formatInteger(cards.matches_started), 'Tentativas recebidas'),
        metricCard('Acerto medio', formatReportPercent(cards.avg_percent), ''),
        metricCard('Tempo medio', formatDurationValue(cards.avg_response_seconds), ''),
      ].join('');
    }
    if (extraTarget) {
      extraTarget.innerHTML = [
        metricCard('Pessoas unicas', formatInteger(cards.unique_players), 'Por e-mail informado'),
        metricCard('Jogos', formatInteger(cards.games_started), ''),
        metricCard('Pontuadas', formatInteger(cards.matches_scored), `${formatReportPercent(cards.completion_rate)} de conclusao`),
        metricCard('Melhor nota', formatReportPercent(cards.best_percent), ''),
        metricCard('Pico por dia', cards.peak_day || '-', `${formatInteger(cards.peak_day_value)} pontuadas`),
        metricCard('Pico por hora', cards.peak_hour || '-', `${formatInteger(cards.peak_hour_value)} pontuadas`),
        metricCard('PCs ativos', formatInteger(cards.active_stations), ''),
        metricCard('Fallbacks', formatInteger(cards.fallback_count), 'Pontuacao local'),
      ].join('');
      const contagem = $('[data-report-more-count]');
      if (contagem) contagem.textContent = extraTarget.children.length ? `(${extraTarget.children.length})` : '';
    }

    const periodText = period.label || '';
    // O período aparece UMA vez na tela: na pílula do filtro, que é quem diz o
    // que está sendo consultado. A segunda cópia (na linha de impressão) saiu em
    // 16/09/2026 — eram duas frases idênticas lado a lado na área de filtro.
    $('[data-report-period]') && ($('[data-report-period]').textContent = periodText);
    $('[data-updated-at]') && ($('[data-updated-at]').textContent = `Atualizado as ${new Date().toLocaleString('pt-BR')}`);
    if (period.start_date && formInput('start_date')) formInput('start_date').value = period.start_date;
    if (period.end_date && formInput('end_date')) formInput('end_date').value = period.end_date;

    drawGroupedBars($('#dailyChart'), metrics.by_day || [], [
      { key: 'sessions', label: 'Cadastros', color: '#4285f4' },
      { key: 'matches_started', label: 'Partidas', color: '#fbbc04' },
      { key: 'matches_scored', label: 'Pontuadas', color: '#34a853' },
    ]);
    drawBars($('#hourChart'), (metrics.by_hour || []).map((row) => ({
      ...row,
      value: row.matches_scored || 0,
    })), '#4285f4');
    drawGroupedBars($('#roundChart'), metrics.by_round || [], [
      { key: 'matches_scored', label: 'Pontuadas', color: '#34a853' },
      { key: 'avg_percent', label: 'Media %', color: '#4285f4' },
    ]);

    renderHeatmap(metrics.by_day_hour || []);
    renderComparison($('[data-station-comparison]'), metrics.by_station || []);
    renderComparison($('[data-mode-comparison]'), metrics.by_mode || []);
    renderPlayerTable(metrics.top_players || []);
    renderSessionReportTable(metrics.tables?.sessions || []);
    renderMatchReportTable(metrics.tables?.matches || []);
    renderGameReportTable(metrics.tables?.games || []);
    renderRoundReportTable(metrics.tables?.rounds || []);
    // As tabelas continuam sendo desenhadas com o período vazio: o DOM é o
    // caminho de reserva da exportação, e voltar o filtro tem de mostrar dado.
    renderReportVazio(periodoSemDados(metrics));
  }

  function exportReportCsv() {
    const lines = [];

    reportCsvSections(state.reportMetrics || {}).forEach((section, index) => {
      const sectionLines = dataToCsvLines(section.title, section.rows, section.columns);
      if (!sectionLines.length) return;
      if (index > 0 && lines.length) lines.push('');
      lines.push(...sectionLines);
    });

    if (!lines.length) {
      const sections = [
        ['Ranking dos participantes', $('[data-player-table]')],
        ['Cadastros', $('[data-session-table]')],
        ['Partidas e respostas', $('[data-match-table]')],
        ['Jogos', $('[data-game-table]')],
        ['Rodadas', $('[data-round-table]')],
      ];

      sections.forEach(([title, table], index) => {
        const sectionLines = tableToCsvLines(table, title);
        if (!sectionLines.length) return;
        if (index > 0 && lines.length) lines.push('');
        lines.push(...sectionLines);
      });
    }

    if (!lines.length) {
      throw new Error('Nenhum dado disponivel para exportacao.');
    }

    const blob = new Blob(["\uFEFF" + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const period = ($('[data-report-period]')?.textContent || 'periodo').trim().replace(/[^\w\-]+/g, '-');
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    const fileName = `relatorio-${period || 'periodo'}-${stamp}.csv`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 0);
  }

  function reportCsvSections(metrics) {
    const tables = metrics?.tables || {};
    return [
      {
        title: 'Ranking dos participantes',
        rows: metrics?.top_players || [],
        columns: completeCsvColumns(metrics?.top_players || [], [
          { key: 'position', label: '#' },
          { key: 'session_id', label: 'Sessao ID' },
          { key: 'room_id', label: 'Sala' },
          { key: 'game_id', label: 'Jogo ID' },
          { key: 'round_id', label: 'Rodada ID' },
          { key: 'station_id', label: 'PC' },
          { key: 'player_name', label: 'Nome' },
          { key: 'first_name', label: 'Primeiro nome' },
          { key: 'email', label: 'E-mail' },
          { key: 'role', label: 'Cargo' },
          { key: 'company', label: 'Empresa' },
          { key: 'lgpd_accepted', label: 'LGPD', value: (row) => formatBoolean(row.lgpd_accepted) },
          { key: 'lgpd_accepted_at', label: 'Aceite LGPD timestamp' },
          { key: 'lgpd_accepted_label', label: 'Aceite LGPD em' },
          { key: 'mode', label: 'Modo', value: (row) => formatReportMode(row.mode) },
          { key: 'started_at', label: 'Cadastro timestamp' },
          { key: 'started_label', label: 'Cadastro em' },
          { key: 'updated_at', label: 'Atualizado timestamp' },
          { key: 'updated_label', label: 'Atualizado em' },
          { key: 'matches_started', label: 'Tentativas recebidas' },
          { key: 'rounds_completed', label: 'Rodadas concluídas' },
          { key: 'matches_submitted', label: 'Rodadas enviadas' },
          { key: 'matches_scored', label: 'Tentativas avaliadas' },
          { key: 'avg_percent', label: 'Media', value: (row) => formatNullablePercent(row.avg_percent) },
          { key: 'best_percent', label: 'Melhor', value: (row) => formatNullablePercent(row.best_percent) },
          { key: 'avg_seconds', label: 'Tempo medio (s)' },
          { key: 'avg_duration', label: 'Tempo medio', value: (row) => formatDurationValue(row.avg_seconds) },
          { key: 'total_points', label: 'Pontos', value: (row) => formatNullableInteger(row.total_points) },
        ]),
      },
      {
        title: 'Cadastros',
        rows: tables.sessions || [],
        columns: completeCsvColumns(tables.sessions || [], [
          { key: 'id', label: 'Cadastro ID' },
          { key: 'room_id', label: 'Sala' },
          { key: 'game_id', label: 'Jogo ID' },
          { key: 'round_id', label: 'Rodada ID' },
          { key: 'station_id', label: 'PC' },
          { key: 'player_name', label: 'Nome' },
          { key: 'email', label: 'E-mail' },
          { key: 'role', label: 'Cargo' },
          { key: 'company', label: 'Empresa' },
          { key: 'lgpd_accepted', label: 'LGPD', value: (row) => formatBoolean(row.lgpd_accepted) },
          { key: 'lgpd_accepted_at', label: 'Aceite LGPD timestamp' },
          { key: 'lgpd_accepted_label', label: 'Aceite LGPD em' },
          { key: 'mode', label: 'Modo' },
          { key: 'started_at', label: 'Cadastro timestamp' },
          { key: 'started_label', label: 'Cadastro em' },
          { key: 'updated_at', label: 'Atualizado timestamp' },
          { key: 'updated_label', label: 'Atualizado em' },
          { key: 'matches_started', label: 'Tentativas recebidas' },
          { key: 'rounds_completed', label: 'Rodadas concluídas' },
          { key: 'matches_submitted', label: 'Rodadas enviadas' },
          { key: 'matches_scored', label: 'Tentativas avaliadas' },
          { key: 'avg_percent', label: 'Media', value: (row) => formatNullablePercent(row.avg_percent) },
          { key: 'best_percent', label: 'Melhor', value: (row) => formatNullablePercent(row.best_percent) },
          { key: 'avg_seconds', label: 'Tempo medio (s)' },
          { key: 'avg_duration', label: 'Tempo medio', value: (row) => formatDurationValue(row.avg_seconds) },
          { key: 'total_points', label: 'Pontos', value: (row) => formatNullableInteger(row.total_points) },
        ]),
      },
      {
        title: 'Partidas e respostas',
        rows: tables.matches || [],
        columns: completeCsvColumns(tables.matches || [], [
          { key: 'id', label: 'Partida ID' },
          { key: 'session_id', label: 'Sessao ID' },
          { key: 'game_id', label: 'Jogo ID' },
          { key: 'round_id', label: 'Rodada ID' },
          { key: 'round_number', label: 'Rodada' },
          { key: 'station_id', label: 'PC' },
          { key: 'player_name', label: 'Jogador' },
          { key: 'email', label: 'E-mail' },
          { key: 'role', label: 'Cargo' },
          { key: 'company', label: 'Empresa' },
          { key: 'mode', label: 'Modo' },
          { key: 'status', label: 'Status' },
          { key: 'gemini_status', label: 'Status Gemini' },
          { key: 'prompt_key', label: 'Prompt key' },
          { key: 'image_file', label: 'Imagem arquivo' },
          { key: 'image_url', label: 'Imagem URL' },
          { key: 'started_at', label: 'Inicio timestamp' },
          { key: 'started_label', label: 'Inicio' },
          { key: 'submitted_at', label: 'Envio timestamp' },
          { key: 'submitted_label', label: 'Envio' },
          { key: 'scored_at', label: 'Pontuacao timestamp' },
          { key: 'scored_label', label: 'Pontuacao em' },
          { key: 'elapsed_seconds', label: 'Tempo (s)' },
          { key: 'duration_label', label: 'Tempo' },
          { key: 'percent', label: 'Nota', value: (row) => formatNullablePercent(row.percent) },
          { key: 'points', label: 'Pontos', value: (row) => formatNullableInteger(row.points) },
          { key: 'fallback_used', label: 'Fallback', value: (row) => formatBoolean(row.fallback_used) },
          { key: 'base_prompt', label: 'Prompt base' },
          { key: 'user_prompt', label: 'Prompt enviado' },
          { key: 'feedback', label: 'Feedback' },
        ]),
      },
      {
        title: 'Jogos',
        rows: tables.games || [],
        columns: completeCsvColumns(tables.games || [], [
          { key: 'id', label: 'Jogo ID' },
          { key: 'room_id', label: 'Sala' },
          { key: 'mode', label: 'Modo' },
          { key: 'status', label: 'Status' },
          { key: 'current_round_number', label: 'Rodada atual' },
          { key: 'total_rounds', label: 'Total rodadas' },
          { key: 'sessions', label: 'Jogadores' },
          { key: 'matches', label: 'Partidas' },
          { key: 'scored', label: 'Pontuadas' },
          { key: 'avg_percent', label: 'Media', value: (row) => formatNullablePercent(row.avg_percent) },
          { key: 'created_label', label: 'Criado em' },
          { key: 'started_label', label: 'Iniciado em' },
          { key: 'finished_label', label: 'Finalizado em' },
        ]),
      },
      {
        title: 'Rodadas',
        rows: tables.rounds || [],
        columns: completeCsvColumns(tables.rounds || [], [
          { key: 'id', label: 'Rodada ID' },
          { key: 'game_id', label: 'Jogo ID' },
          { key: 'round_number', label: 'Rodada' },
          { key: 'room_id', label: 'Sala' },
          { key: 'mode', label: 'Modo' },
          { key: 'status', label: 'Status' },
          { key: 'prompt_key', label: 'Prompt key' },
          { key: 'image_file', label: 'Imagem arquivo' },
          { key: 'matches', label: 'Partidas' },
          { key: 'submitted', label: 'Enviadas' },
          { key: 'scored', label: 'Pontuadas' },
          { key: 'avg_percent', label: 'Media', value: (row) => formatNullablePercent(row.avg_percent) },
          { key: 'created_label', label: 'Criada em' },
          { key: 'started_label', label: 'Iniciada em' },
          { key: 'results_label', label: 'Resultados em' },
        ]),
      },
    ];
  }

  function completeCsvColumns(rows, columns) {
    const known = new Set(columns.map((column) => column.key));
    const extraKeys = [];
    (rows || []).forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (known.has(key) || extraKeys.includes(key)) return;
        extraKeys.push(key);
      });
    });
    return [
      ...columns,
      ...extraKeys.map((key) => ({ key, label: key })),
    ];
  }

  function dataToCsvLines(title, rows, columns) {
    if (!rows?.length || !columns?.length) return [];
    const lines = [csvEscape(title), columns.map((column) => csvEscape(column.label)).join(';')];
    rows.forEach((row) => {
      lines.push(columns.map((column) => csvEscape(csvDataValue(row, column))).join(';'));
    });
    return lines;
  }

  function csvDataValue(row, column) {
    const value = column.value ? column.value(row) : row?.[column.key];
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return formatBoolean(value);
    if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
    return normalizeCsvCell(value);
  }

  function tableToCsvLines(table, title) {
    if (!table) return [];
    const headers = $$('thead th', table).map((cell) => normalizeCsvCell(cell.textContent));
    const rows = $$('tbody tr', table)
      .map((row) => $$('td', row).map((cell) => csvCellValue(cell)))
      .filter((cells) => cells.length > 0);
    if (!headers.length || !rows.length) return [];

    const lines = [csvEscape(title), headers.map(csvEscape).join(';')];
    rows.forEach((cells) => {
      lines.push(cells.map(csvEscape).join(';'));
    });
    return lines;
  }

  function csvCellValue(cell) {
    const plain = normalizeCsvCell(cell?.textContent);
    if (plain) return plain;
    const imageButton = $('[data-report-image-src]', cell);
    if (imageButton) {
      return String(imageButton.dataset.reportImageSrc || imageButton.dataset.reportImageTitle || '').trim();
    }
    return '';
  }

  function normalizeCsvCell(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  // Planilhas (Excel, LibreOffice, Sheets) tratam um campo que COMECA com
  // `=`, `+`, `-`, `@`, tabulacao ou CR como formula, e as aspas do CSV nao
  // impedem isso. Como o aluno escolhe o proprio nome e escreve o prompt, o
  // relatorio exportado virava vetor: um nome `=HYPERLINK(...)` executava na
  // maquina de quem abre o arquivo. O apostrofo na frente forca texto; numero
  // puro (inclusive negativo, como `-3` ou `-12,5`) fica intacto, porque
  // prefixar ali so estragaria o dado.
  const CSV_COMECA_FORMULA = /^\s*[=+@\t\r]/;
  // O traco so e suspeito quando nao e o nosso "sem dado" nem um numero
  // negativo: `-` e `-3` continuam saindo como sempre sairam.
  const CSV_TRACO_INOFENSIVO = /^\s*-(?:\s*$|\d+(?:[.,]\d+)?\s*$)/;

  function csvEscape(value) {
    const raw = String(value ?? '');
    const suspeito = CSV_COMECA_FORMULA.test(raw)
      || (raw.trimStart().startsWith('-') && !CSV_TRACO_INOFENSIVO.test(raw));
    const text = suspeito ? `'${raw}` : raw;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function formInput(name) {
    return $(`[data-report-filters] [name="${name}"]`);
  }

  function formatInteger(value) {
    return Number(value || 0).toLocaleString('pt-BR');
  }

  function formatReportPercent(value) {
    return `${Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }

  function formatNullablePercent(value) {
    if (value === null || value === undefined || value === '') return '-';
    return formatReportPercent(value);
  }

  function formatNullableInteger(value) {
    if (value === null || value === undefined || value === '') return '-';
    return formatInteger(value);
  }

  function formatBoolean(value) {
    if (value === null || value === undefined || value === '') return '-';
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'sim', 'yes', 'aceito'].includes(normalized)) return 'Sim';
    if (['0', 'false', 'nao', 'no'].includes(normalized)) return 'Nao';
    return String(value);
  }

  function formatReportMode(value) {
    const mode = String(value || '').trim();
    if (mode === 'instant') return 'Instantaneo';
    if (mode === 'wait_all') return 'Aguardar todos';
    return mode || '-';
  }

  function formatDurationValue(seconds) {
    if (seconds === null || seconds === undefined || seconds === '-') return '-';
    const safe = Math.max(0, Math.round(Number(seconds || 0)));
    if (safe < 60) return `${safe}s`;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function shortText(value, max = 90) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text || '-';
    return `${text.slice(0, max - 1)}...`;
  }

  function reportPromptCell(value, max = 160) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '-';
    return `<span class="report-prompt-cell" title="${escapeHtml(text)}">${escapeHtml(shortText(text, max))}</span>`;
  }

  function drawBars(canvas, items, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f6f8fc';
    ctx.fillRect(0, 0, width, height);

    const padding = 36;
    const max = Math.max(1, ...items.map((item) => Number(item.value || 0)));
    const barWidth = (width - padding * 2) / Math.max(1, items.length);

    ctx.fillStyle = '#001c50';
    ctx.font = '12px Google Sans, Arial, sans-serif';
    items.forEach((item, index) => {
      const barHeight = ((height - padding * 2) * Number(item.value || 0)) / max;
      const x = padding + index * barWidth + 4;
      const y = height - padding - barHeight;
      const gradient = ctx.createLinearGradient(0, y, 0, height - padding);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, '#c8dafc');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, Math.max(4, barWidth - 8), barHeight);
      ctx.fillStyle = '#8a94a6';
      if (index % Math.ceil(items.length / 8) === 0) {
        ctx.fillText(item.label, x, height - 12);
      }
    });
  }

  function drawGroupedBars(canvas, items, series) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 34, right: 24, bottom: 42, left: 44 };
    const max = Math.max(1, ...items.flatMap((item) => series.map((entry) => Number(item[entry.key] || 0))));
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const groupWidth = plotWidth / Math.max(1, items.length);
    const barWidth = Math.max(4, (groupWidth - 10) / Math.max(1, series.length));

    ctx.strokeStyle = '#e7edf8';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (plotHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.font = '12px Google Sans, Arial, sans-serif';
    series.forEach((entry, index) => {
      ctx.fillStyle = entry.color;
      ctx.fillRect(padding.left + index * 112, 12, 12, 12);
      ctx.fillStyle = '#667085';
      ctx.fillText(entry.label, padding.left + 18 + index * 112, 23);
    });

    items.forEach((item, itemIndex) => {
      series.forEach((entry, seriesIndex) => {
        const value = Number(item[entry.key] || 0);
        const barHeight = (plotHeight * value) / max;
        const x = padding.left + itemIndex * groupWidth + 5 + seriesIndex * barWidth;
        const y = padding.top + plotHeight - barHeight;
        ctx.fillStyle = entry.color;
        ctx.fillRect(x, y, Math.max(3, barWidth - 2), barHeight);
      });

      if (itemIndex % Math.ceil(items.length / 9) === 0) {
        ctx.fillStyle = '#8a94a6';
        ctx.fillText(item.label || '', padding.left + itemIndex * groupWidth + 4, height - 14);
      }
    });
  }

  function renderHeatmap(days) {
    const target = $('[data-heatmap]');
    if (!target) return;
    if (!days.length) {
      target.innerHTML = `<p class="empty-state">${SEM_DADOS}</p>`;
      return;
    }
    const max = Math.max(1, ...days.flatMap((day) => (day.hours || []).map((hour) => Number(hour.matches_scored || 0))));
    const hourHead = Array.from({ length: 24 }, (_, hour) => `<span>${String(hour).padStart(2, '0')}</span>`).join('');
    const rows = days.map((day) => {
      const cells = (day.hours || []).map((hour) => {
        const value = Number(hour.matches_scored || 0);
        const intensity = value / max;
        const alpha = (0.08 + intensity * 0.84).toFixed(2);
        const color = intensity > 0.58 ? '#ffffff' : '#001c50';
        return `<span class="heatmap-cell" style="background: rgba(66, 133, 244, ${alpha}); color: ${color};" title="${escapeHtml(day.label)} ${escapeHtml(hour.label)} - ${value} pontuadas">${value || ''}</span>`;
      }).join('');
      return `<div class="heatmap-row"><strong>${escapeHtml(day.label)}</strong>${cells}</div>`;
    }).join('');

    target.innerHTML = `
      <div class="heatmap-row heatmap-head"><strong>Dia</strong>${hourHead}</div>
      ${rows}
    `;
  }

  function renderComparison(target, rows) {
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = `<p class="empty-state">${SEM_DADOS}</p>`;
      return;
    }
    const max = Math.max(1, ...rows.map((row) => Number(row.matches_started || 0)));
    target.innerHTML = rows.map((row) => {
      const width = Math.max(4, (Number(row.matches_started || 0) / max) * 100);
      return `
        <div class="comparison-row">
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <span>${formatInteger(row.matches_started)} partidas | ${formatInteger(row.matches_scored)} pontuadas</span>
          </div>
          <small>${formatReportPercent(row.avg_percent)} media</small>
          <i style="width: ${width}%"></i>
        </div>
      `;
    }).join('');
  }

  function renderReportTable(target, columns, rows, emptyMessage = SEM_DADOS) {
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = `<tbody><tr><td>${escapeHtml(emptyMessage)}</td></tr></tbody>`;
      return;
    }
    target.innerHTML = `
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map((column) => `<td>${column.html ? column.value(row) : escapeHtml(column.value(row))}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  function renderPlayerTable(rows) {
    renderReportTable($('[data-player-table]'), [
      { label: '#', value: (row) => row.position || '-' },
      { label: 'Nome', value: (row) => row.player_name || '-' },
      { label: 'PC', value: (row) => `PC ${row.station_id || '-'}` },
      { label: 'Cargo', value: (row) => row.role || '-' },
      { label: 'Empresa', value: (row) => row.company || '-' },
      { label: 'Rodadas concluídas', value: (row) => row.rounds_completed || 0 },
      { label: 'Tentativas', value: (row) => row.matches_started || 0 },
      { label: 'Media', value: (row) => formatReportPercent(row.avg_percent) },
      { label: 'Melhor', value: (row) => formatReportPercent(row.best_percent) },
      { label: 'Tempo medio', value: (row) => formatDurationValue(row.avg_seconds) },
      { label: 'Pontos', value: (row) => formatInteger(row.total_points) },
    ], rows);
  }

  function renderSessionReportTable(rows) {
    renderReportTable($('[data-session-table]'), [
      { label: 'Data', value: (row) => row.started_label || '-' },
      { label: 'PC', value: (row) => `PC ${row.station_id || '-'}` },
      { label: 'Nome', value: (row) => row.player_name || '-' },
      { label: 'E-mail', value: (row) => row.email || '-' },
      { label: 'Cargo', value: (row) => row.role || '-' },
      { label: 'Empresa', value: (row) => row.company || '-' },
      { label: 'LGPD', value: (row) => row.lgpd_accepted ? 'Aceito' : 'Nao' },
      { label: 'Aceite LGPD em', value: (row) => row.lgpd_accepted_label || '-' },
      { label: 'Modo', value: (row) => row.mode || '-' },
      { label: 'Media', value: (row) => formatReportPercent(row.avg_percent) },
    ], rows);
  }

  function renderMatchReportTable(rows) {
    renderReportTable($('[data-match-table]'), [
      { label: 'Inicio', value: (row) => row.started_label || '-' },
      { label: 'Imagem', html: true, value: (row) => reportImageThumb(row) },
      { label: 'Envio', value: (row) => row.submitted_label || '-' },
      { label: 'PC', value: (row) => `PC ${row.station_id || '-'}` },
      { label: 'Jogador', value: (row) => row.player_name || '-' },
      { label: 'Cargo', value: (row) => row.role || '-' },
      { label: 'Empresa', value: (row) => row.company || '-' },
      { label: 'Rodada', value: (row) => row.round_number || '-' },
      { label: 'Tentativa', value: (row) => row.attempt || 1 },
      { label: 'Conta no ranking', value: (row) => row.counts_for_ranking ? 'Sim' : 'Não' },
      { label: 'Status', value: (row) => row.status || '-' },
      { label: 'Nota', value: (row) => row.percent === null ? '-' : formatReportPercent(row.percent) },
      { label: 'Tempo', value: (row) => row.duration_label || '-' },
      { label: 'Pontos', value: (row) => row.points === null ? '-' : formatInteger(row.points) },
      { label: 'Fallback', value: (row) => row.fallback_used ? 'Sim' : 'Nao' },
      { label: 'Prompt base', html: true, value: (row) => reportPromptCell(row.base_prompt, 220) },
      { label: 'Prompt enviado', html: true, value: (row) => reportPromptCell(row.user_prompt, 180) },
    ], rows);
    bindReportImageModal();
  }

  function reportImageThumb(row) {
    const src = row.image_url || '';
    if (!src) return '-';
    const title = `Partida ${row.id || '-'} | ${row.image_file || 'Imagem'}`;
    return `
      <button class="report-image-thumb" type="button" data-report-image-src="${escapeHtml(src)}" data-report-image-title="${escapeHtml(title)}">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy">
      </button>
    `;
  }

  function bindReportImageModal() {
    const table = $('[data-match-table]');
    const modal = $('[data-report-image-modal]');
    const img = $('[data-report-image-modal-img]');
    const title = $('[data-report-image-modal-title]');
    if (!table || !modal || !img) return;
    if (!table.dataset.modalBound) {
      table.dataset.modalBound = '1';
      table.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-report-image-src]');
        if (!button) return;
        img.src = button.dataset.reportImageSrc || '';
        img.alt = button.dataset.reportImageTitle || 'Imagem da partida';
        if (title) title.textContent = button.dataset.reportImageTitle || '';
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('is-visible'));
      });
    }
    $$('[data-close-report-image]').forEach((button) => {
      if (button.dataset.modalCloseBound) return;
      button.dataset.modalCloseBound = '1';
      button.addEventListener('click', closeReportImageModal);
    });
    if (!document.body.dataset.reportImageKeyBound) {
      document.body.dataset.reportImageKeyBound = '1';
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeReportImageModal();
      });
    }
  }

  function closeReportImageModal() {
    const modal = $('[data-report-image-modal]');
    const img = $('[data-report-image-modal-img]');
    if (!modal) return;
    modal.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!modal.classList.contains('is-visible')) {
        modal.hidden = true;
        if (img) img.src = '';
      }
    }, 180);
  }

  function renderGameReportTable(rows) {
    renderReportTable($('[data-game-table]'), [
      { label: 'Jogo', value: (row) => row.id || '-' },
      { label: 'Criado', value: (row) => row.created_label || '-' },
      { label: 'Modo', value: (row) => row.mode || '-' },
      { label: 'Status', value: (row) => row.status || '-' },
      { label: 'Jogadores', value: (row) => row.sessions || 0 },
      { label: 'Partidas', value: (row) => row.matches || 0 },
      { label: 'Media', value: (row) => formatReportPercent(row.avg_percent) },
    ], rows);
  }

  function renderRoundReportTable(rows) {
    renderReportTable($('[data-round-table]'), [
      { label: 'Rodada', value: (row) => row.round_number || '-' },
      { label: 'Jogo', value: (row) => row.game_id || '-' },
      { label: 'Criada', value: (row) => row.created_label || '-' },
      { label: 'Imagem', value: (row) => row.image_file || '-' },
      { label: 'Status', value: (row) => row.status || '-' },
      { label: 'Partidas', value: (row) => row.matches || 0 },
      { label: 'Pontuadas', value: (row) => row.scored || 0 },
      { label: 'Media', value: (row) => formatReportPercent(row.avg_percent) },
    ], rows);
  }


  ensureNetworkModal();
  window.addEventListener('online', () => {
    hideNetworkModal();
    toast('Conexao restaurada. Seguimos no jogo.');
  });
  window.addEventListener('offline', showNetworkModal);

  // Só o relatório (`/report.php`) tem handler próprio aqui. O portal (`/`,
  // `/index.php`) carrega o arquivo pela mesma casca, mas para ele sobrou só o
  // aviso de rede abaixo: o `initIndex` montava a grade de PCs das estações
  // clássicas, e nenhuma página viva emite o `[data-index-stations]` que ele
  // procurava — nem existe mais a rota game.php para onde ele linkava.
  if (page === 'report') initReport();
})();
