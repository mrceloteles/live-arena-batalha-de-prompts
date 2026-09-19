/* Arena de Engenharia de Prompt - frontend (aluno + painel do professor) */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const page = document.body.dataset.page;

  // Mesmos rótulos do servidor (src/domain/room-readiness.mjs): o painel e a
  // prévia do aluno só repetem o que o servidor calculou ("sem imagem",
  // "sem gabarito"), nunca decidem a regra por conta própria.
  const MISSING_LABELS = { imagem: 'sem imagem', gabarito: 'sem gabarito' };

  const MODALITY_LABELS = {
    precisao: 'Precisão',
    contexto: 'Contexto',
    sprint: 'Sprint',
    essencial: 'Prompt Essencial',
    completo: 'Prompt Completo',
    resgate: 'Resgate',
    diagnostico: 'Diagnóstico',
    refinamento: 'Refinamento',
    reversa: 'Engenharia Reversa',
    briefing: 'Briefing de Cliente',
    boss: 'Boss Battle',
    livre: 'Livre',
  };

  const CRITERION_LABELS = {
    objetivo: 'Objetivo',
    contexto: 'Contexto',
    publico: 'Público',
    formato: 'Formato',
    restricoes: 'Restrições',
    criatividade: 'Criatividade',
    clareza: 'Clareza',
    concisao: 'Concisão',
    especificidade: 'Especificidade',
    estrutura: 'Estrutura',
  };

  // -------------------------------------------------------------------------
  // Assets de campeao e vencedor — os mesmos arquivos servidos pela base
  // observada (evidence/manifest.json): trofeu do 1º lugar, prata, bronze,
  // medalha de fita para as demais colocações, avatar do jogador e estrela
  // de pontos. Nada aqui é desenhado por conta própria: o final reaproveita
  // exatamente esses PNGs em vez de emojis.
  // -------------------------------------------------------------------------
  const FIGMA_ASSETS = '/public/assets/figma';
  const RANK_MEDALS = [
    { position: 1, src: `${FIGMA_ASSETS}/trophy-gold.png`, tone: 'is-gold' },
    { position: 2, src: `${FIGMA_ASSETS}/trophy-silver.png`, tone: 'is-silver' },
    { position: 3, src: `${FIGMA_ASSETS}/trophy-bronze.png`, tone: 'is-bronze' },
  ];
  const RANK_RIBBON = `${FIGMA_ASSETS}/medal-ribbon.png`;
  const WINNER_AVATAR = `${FIGMA_ASSETS}/player-avatar.png`;
  const POINTS_STAR = `${FIGMA_ASSETS}/star.png`;

  const rankMedal = (position) => RANK_MEDALS.find((medal) => medal.position === Number(position))
    || { position: Number(position) || 0, src: RANK_RIBBON, tone: 'is-ribbon' };

  const medalImage = (position, className = 'arena-rank-medal') => {
    const medal = rankMedal(position);
    return `<img class="${className} ${medal.tone}" src="${medal.src}" alt="">`;
  };

  const winnerAvatar = (className = 'arena-rank-avatar') => `<img class="${className}" src="${WINNER_AVATAR}" alt="">`;
  const pointsStar = (className = 'arena-points-star') => `<img class="${className}" src="${POINTS_STAR}" alt="">`;

  const HIGHLIGHT_LABELS = [
    ['best_score', `<img class="arena-medal-icon" src="${RANK_MEDALS[0].src}" alt="">`, 'Maior pontuação'],
    ['most_precise', '🎯', 'Mais preciso'],
    ['best_context', '🧠', 'Melhor contexto'],
    ['most_efficient', '✂️', 'Mais eficiente'],
    ['biggest_evolution', '🚀', 'Maior evolução'],
    ['best_refinement', '🔧', 'Melhor refinamento'],
    ['best_sprint', '⚡', 'Melhor sprint'],
    ['best_visual', '🎨', 'Melhor descrição visual'],
  ];

  const STATUS_LABELS = {
    draft: 'Rascunho',
    waiting: 'Aguardando participantes',
    open: 'Aberta',
    playing: 'Em jogo',
    ended: 'Encerrada',
    archived: 'Arquivada',
    pending: 'Pendente',
    results: 'Resultados',
    closed: 'Encerrada',
  };

  const SESSION_KEYS = { participantId: 'arena.participant_id', token: 'arena.token' };

  // Modelos do sorteio da vez (quem joga agora). O rotulo curto fica no botao;
  // a explicacao completa vai no title e no hint abaixo deles.
  // O rótulo basta: a regra de cada modo é escrita inteira na dica logo abaixo
  // (`mode_hint`, que vem do servidor), e o texto curto embaixo do botão dizia
  // a mesma coisa duas vezes na mesma dobra.
  const DRAW_MODE_OPTIONS = [
    ['livre', 'Sorteio livre'],
    ['mata-mata', 'Mata-mata'],
  ];

  const PRESET_LABELS = {
    classic: 'Clássico',
    turma: 'Turma',
    personalizado: 'Personalizado',
    arena: 'Arena — Turma vs. Juiz',
  };

  const PRESET_HINTS = {
    classic: '3 lugares fixos, juiz clássico.',
    turma: 'O clássico para a turma inteira.',
    personalizado: 'Você escolhe os desafios e as regras.',
    arena: 'A turma inteira ataca o Juiz IA.',
  };

  // Quanto a velocidade na pontuação pesa. Está fora do formulário porque o
  // resumo da dobra dos ajustes diz o valor escolhido com o mesmo rótulo do campo.
  const SPEED_LABELS = {
    none: 'Desconsiderar',
    low: 'Influencia baixa',
    medium: 'Influência média',
    high: 'Influencia alta',
  };

  // A missão visual precisa de imagem para a sala abrir. Espelha
  // `requiresImage` do servidor (`domain/room-readiness.mjs`), que é quem de fato
  // recusa a abertura; aqui a regra só decide se o campo da imagem já aparece.
  const modalidadePrecisaDeImagem = (form) => {
    const modalidade = String(form?.elements?.modality?.value || '').toLowerCase();
    const categoria = String(form?.elements?.category?.value || '').toLowerCase();
    return modalidade === 'reversa' || ['imagem', 'reversa'].includes(categoria);
  };

  // ---------------------------------------------------------------------------
  // MODO ARENA — Turma vs. Juiz
  //
  // Rotulos e pedaços de interface compartilhados pelas TRÊS telas (aluno, TV e
  // painel). O modo não decide regra nenhuma aqui: o servidor manda o estado
  // pronto (corações, fase, desafio da vez, energia) e a tela só desenha. Trocar
  // um rótulo em um lugar muda nos três.
  // ---------------------------------------------------------------------------
  const ARENA_PHASE_LABELS_UI = {
    mission: 'Missão — todos escrevem',
    select: 'Sorteio dos competidores',
    wildcard: 'Wild Card — a turma escolhe',
    arena: 'Arena — o Juiz avalia',
    dynamic: 'Desafio da turma',
    reveal: 'Resultado da rodada',
    finished: 'Partida encerrada',
  };

  const ARENA_POWER_GLYPHS = { pista: '🔍', conselho: '📣', revisao: '🛡️', regra: '🎲' };

  /**
   * Corações do Juiz. Cada coração é um <i> — o CSS cuida do cheio/vazio.
   * Com `falling`, o último coração ainda está no ar: o estado já diz 0, mas a
   * TV mostra o coração que acabou de quebrar, antes da manchete de vitória.
   */
  function arenaHeartsMarkup(arena, { size = '', falling = false } = {}) {
    const boss = arena?.boss;
    if (!boss) return '';
    const total = Number(boss.max_health || 0);
    const alive = Math.max(0, Math.min(total, Number(boss.health || 0)));
    const hearts = Array.from({ length: total }, (_, index) => {
      const quebrando = falling && index === total - 1;
      const cheio = index < alive || quebrando;
      const classes = `arena-heart${quebrando ? ' is-breaking' : cheio ? ' is-full' : ''}`;
      return `<i class="${classes}" aria-hidden="true">${cheio ? '❤️' : '🤍'}</i>`;
    }).join('');
    return `<span class="arena-hearts${size ? ` ${size}` : ''}" role="img" aria-label="Vida do Juiz: ${alive} de ${total}">${hearts}</span>`;
  }

  /** Barra de energia da turma (0..max) — o que libera os poderes. */
  function arenaEnergyMarkup(arena, className = '') {
    const energy = arena?.energy;
    if (!energy) return '';
    return `<span class="arena-energy${className ? ` ${className}` : ''}" title="Energia da turma: ${energy.value} de ${energy.max}">
      <span class="arena-energy-track" aria-hidden="true"><i style="width:${Math.min(100, Number(energy.percent || 0))}%"></i></span>
      <b>⚡ ${Number(energy.value)}/${Number(energy.max)}</b>
    </span>`;
  }

  /** Quantos acertaram / quantos responderam, do jeito que a turma lê. */
  function arenaAccuracyMarkup(result) {
    if (!result || result.empty) return '<span class="arena-accuracy">ninguém respondeu</span>';
    return `<span class="arena-accuracy"><b>${Number(result.accuracy)}%</b> acertaram</span>`;
  }

  const ARENA_CRITERION_LABELS = {
    objetivo: 'Objetivo', contexto: 'Contexto', publico: 'Público', formato: 'Formato',
    restricoes: 'Restrições', clareza: 'Clareza', ambiguidade: 'Ambiguidade',
    criatividade: 'Criatividade', concisao: 'Concisão', especificidade: 'Especificidade',
    estrutura: 'Estrutura',
  };

  const arenaOptionLabel = (option) => ARENA_CRITERION_LABELS[option.label] || option.label || '';
  // O que a turma le na frente da opcao. O `key` e o id do voto (um uuid para as
  // dinamicas de competidor) e nao pode ir para a tela — a letra vem do servidor.
  const arenaOptionKey = (option) => String(option.slot || option.key || '');

  // Regras que valem para classic E turma (mesmo motor classico em escala).
  const isClassicish = (room) => room?.preset === 'classic' || room?.preset === 'turma'
    || room?.settings?.judgeKind === 'classic';

  function rulesSummary(room) {
    const settings = room?.settings || {};
    const bits = [];
    if (isClassicish(room)) {
      bits.push(`${room.expected_players || settings.maxPlayers || 35} jogadores`);
      bits.push(`${settings.rounds || 3} rounds`);
      bits.push(settings.roundDuration ? `${settings.roundDuration}s por round` : '60s por round');
    } else {
      if (room.expected_players) bits.push(`até ${room.expected_players} jogadores`);
      bits.push('missões do banco');
      bits.push('juiz por critérios');
    }
    return bits.join(' · ');
  }

  const formatPin = (code) => String(code || '').replace(/^(\d{3})(\d+)$/, '$1 $2');

  // Procedência das notas, em português: o professor precisa saber quando a nota
  // veio do juiz LOCAL (heurístico) em vez do modelo — e por quê. Uma nota local
  // e uma nota de modelo não valem o mesmo numa conversa com a turma.
  // O vocabulário é UM só para a tela inteira porque a fonte também é uma só:
  // a nota que caiu no juiz local e a avaliação que ainda espera vêm das mesmas
  // falhas (`failure.mjs` e `budget.mjs`). Traduzir a mesma falha de dois jeitos
  // faria o professor procurar dois problemas.
  const MOTIVOS_DO_JUIZ_LOCAL = [
    [/orcamento|fila|budget/, 'fila da instalação cheia'],
    [/api_key_missing/, 'sem chave de API'],
    [/cancelled/, 'encerramento do servidor'],
    [/timeout/, 'tempo esgotado no provedor'],
    [/unreadable_text/, 'texto ilegível'],
    [/429/, 'cota do provedor'],
    [/http_5\d\d/, 'erro do provedor'],
    [/invalid_response/, 'resposta do provedor fora do formato'],
  ];
  function rotuloDoMotivo(motivo) {
    const conhecido = MOTIVOS_DO_JUIZ_LOCAL.find(([padrao]) => padrao.test(String(motivo)));
    return conhecido ? conhecido[1] : null;
  }
  function motivoDoJuizLocal(motivos = {}) {
    return Object.entries(motivos)
      .map(([chave, total]) => `${total}× ${rotuloDoMotivo(chave) || 'motivo não catalogado'}`)
      .join(', ');
  }

  // O lote da tela unica vai numa requisicao so; acima disso o painel avisa em
  // vez de mandar meio lote.
  const MAX_BULK_BODY_CHARS = 24_000_000;

  async function api(action, payload = {}, { timeout = 12000 } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`/api.php?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const error = new Error(data.error || 'Falha na requisicao.');
        error.status = response.status;
        error.details = data.details;
        throw error;
      }
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }


  // ---------------------------------------------------------------------------
  // SSE: atualizacoes em tempo real (EventSource com poll como rede de seguranca)
  // ---------------------------------------------------------------------------
  let roomEventSource = null;
  let roomEventUrl = '';
  let roomEventsAlive = false;
  const roomEventHandlers = new Set();

  /**
   * Query do stream: a sala que esta tela segue e a prova de quem assina, no
   * que existir. O painel e a TV entram so com a sala — a credencial deles vai
   * no cookie HttpOnly, que o navegador manda sozinho no EventSource.
   */
  function eventsQuery(roomId, session) {
    const params = new URLSearchParams();
    if (roomId) params.set('room', String(roomId));
    if (session?.participant_id && session.token) {
      params.set('participant_id', String(session.participant_id));
      params.set('token', String(session.token));
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }

  /**
   * Assina o stream DA SALA desta superficie. Quem separa o que e de cada sala
   * e o servidor, pela credencial da conexao: a tela nao descarta mais nada do
   * que chega, porque so chega o que ela provou seguir. Trocar de sala reabre a
   * conexao — o mesmo caminho que o painel ja usava ao trocar de detalhe.
   */
  function subscribeRoomEvents(onEvent, query = '') {
    roomEventHandlers.add(onEvent);
    const url = `/events${query}`;
    if (roomEventSource && roomEventUrl !== url) closeRoomEvents();
    if (!roomEventSource) openRoomEvents(url);
    return () => {
      roomEventHandlers.delete(onEvent);
      if (roomEventHandlers.size === 0) closeRoomEvents();
    };
  }

  function openRoomEvents(url) {
    roomEventUrl = url;
    roomEventsAlive = false;
    roomEventSource = new EventSource(url);
    roomEventSource.onopen = () => { roomEventsAlive = true; };
    roomEventSource.onerror = () => { roomEventsAlive = false; };
    roomEventSource.addEventListener('room', (event) => {
      roomEventsAlive = true;
      let data = {};
      try { data = JSON.parse(event.data); } catch { /* ignora */ }
      if (!String(data.action || '').startsWith('arena_')) return;
      for (const handler of [...roomEventHandlers]) {
        try { handler(data.action, data); } catch { /* nunca derruba o stream */ }
      }
    });
    // O servidor reverifica a autorizacao desta conexao de tempos em tempos; se
    // ela perdeu a sala (aluno removido, token da projecao vencido), avisa e
    // fecha. Sem tratar o aviso, o EventSource reconectaria sozinho — agora em
    // escopo global, so com o evento da arena — e a tela ficaria "ao vivo" sem
    // receber nada da propria sala. Fechando aqui, quem conta a verdade volta a
    // ser o poll, que ja sabe voltar para a entrada quando a sessao caiu.
    roomEventSource.addEventListener('revoked', () => { closeRoomEvents(); });
  }

  function closeRoomEvents() {
    roomEventSource?.close();
    roomEventSource = null;
    roomEventUrl = '';
    roomEventsAlive = false;
  }

  /**
   * Uma consulta em voo por superficie (aluno, painel, TV).
   *
   * Sem isto, uma rajada de eventos de tempo real disparava uma consulta por
   * evento: vinte eventos chegando durante uma leitura abriam vinte chamadas
   * simultaneas para responder a mesma pergunta. Aqui os eventos que chegam
   * enquanto a leitura corre se consolidam em no maximo UMA releitura ao
   * terminar — a ultima leitura ja traz o estado de todos eles.
   */
  function createFetchGate() {
    // `busy` e marcado ANTES de a promessa existir: a parte sincrona da tarefa
    // roda no mesmo instante em que `run` e chamado, e sem esta ordem duas
    // chamadas do mesmo tique abririam duas consultas paralelas.
    let busy = false;
    let pending = false;
    let current = null;
    return {
      get busy() { return busy; },
      run(task) {
        if (busy) { pending = true; return current; }
        busy = true;
        current = (async () => {
          try {
            do { pending = false; await task(); } while (pending);
          } finally { busy = false; current = null; }
        })();
        return current;
      },
    };
  }

  // Campos que mudam em toda leitura sem aparecer na tela. Sem descarta-los,
  // nenhuma leitura seria igual a anterior e o redesenho aconteceria sempre.
  const VOLATILE_FIELDS = new Set(['server_now', 'last_seen_at']);

  /** Chave do que a tela mostra, para pular redesenho de estado equivalente. */
  const renderKey = (value, volatile = VOLATILE_FIELDS) => JSON.stringify(
    value,
    (key, entry) => (volatile.has(key) ? undefined : entry),
  );

  // Aba oculta: o batimento fica 4x mais espacado em vez de parar. Parar de vez
  // deixaria a sala parada para quem deixou a aba (ou a projecao) em segundo
  // plano com a aula acontecendo; e voltar para a aba faz uma leitura imediata.
  const HIDDEN_POLL_MS = 10_000;

  /** Relogio do batimento de uma superficie: em aba oculta, um tique a cada 10 s. */
  function hiddenPollClock() {
    let last = 0;
    return () => {
      if (!document.hidden) return true;
      if (Date.now() - last < HIDDEN_POLL_MS) return false;
      last = Date.now();
      return true;
    };
  }

  /** Aba oculta consulta mais devagar; ao voltar, uma leitura imediata. */
  function onVisibleResume(resume) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resume();
    });
  }

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const formatSeconds = (total) => {
    const seconds = Math.max(0, Math.ceil(Number(total) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  /** Tempo de aula em linguagem de planejamento: "8 min", "1 h 05", "5 min 30 s". */
  const formatTotal = (total) => {
    const seconds = Math.max(0, Math.round(Number(total) || 0));
    if (!seconds) return '0 min';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours) return `${hours} h ${String(minutes).padStart(2, '0')}`;
    if (!rest) return `${minutes} min`;
    return `${minutes} min ${rest} s`;
  };

  /**
   * O tempo de uma missao como o card mostra: "2:00", "sem cronometro" ou
   * "sem cronometro · sugestao 2:45" — a sugestao (modalidade + tamanho da
   * missao) aparece so onde nao existe cronometro, para o professor saber o que
   * pode aceitar antes mesmo de abrir o ajuste.
   */
  const roundTimerLabel = (round) => {
    const seconds = Number(round?.duration_seconds) > 0 ? Number(round.duration_seconds) : 0;
    if (seconds) return formatSeconds(seconds);
    const suggestion = Number(round?.suggested_seconds) > 0 ? Number(round.suggested_seconds) : 0;
    return `sem cronômetro${suggestion ? ` · sugestão ${formatSeconds(suggestion)}` : ''}`;
  };

  /**
   * Quanto tempo a sala soma, em uma linha: o professor monta a aula com isso
   * em maos e precisa saber tambem quantas missoes ficam sem cronometro (essas
   * so terminam quando ele encerra a rodada).
   */
  const timingSummary = (timing) => {
    const total = Number(timing?.total_seconds) || 0;
    const untimed = Number(timing?.untimed) || 0;
    if (!Number(timing?.timed)) return 'nenhuma missão com cronômetro';
    return `${formatTotal(total)} de aula${untimed ? ` · ${untimed} ${untimed === 1 ? 'missão' : 'missões'} sem cronômetro` : ''}`;
  };

  function breakdownBars(breakdown) {
    const entries = Object.entries(breakdown || {}).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<p class="arena-empty">Sem critérios.</p>';
    return entries.map(([criterion, points]) => `
      <div class="arena-breakdown-row">
        <span>${CRITERION_LABELS[criterion] || criterion}</span>
        <div class="arena-breakdown-track"><i style="width:${Math.min(100, (Number(points) / 20) * 100)}%"></i></div>
        <strong>${Number(points)}/20</strong>
      </div>`).join('');
  }

  // =========================================================================
  // ALUNO
  // =========================================================================

  if (page === 'arena') {
    const state = { lobby: null, timer: null, poll: null, joinMessageTimer: null, sseOff: null, lastFetch: 0,
      roomId: null, lobbyKey: null, gate: createFetchGate(), hiddenClock: hiddenPollClock(),
      // Tentativa que o servidor ESTACIONOU (o juiz não entregou a nota agora e vai
      // reprocessar sozinho). Serve para a tela não dizer "conferindo o envio" — a
      // demora não é do lado do aluno, e repetir não acelera nada.
      parkedAttempt: null };
    const screens = $$('[data-arena-screen]');

    function showScreen(name) {
      if (name !== 'lobby') document.body.classList.remove('round-active', 'round-finished');
      screens.forEach((screen) => screen.classList.toggle('is-active', screen.dataset.arenaScreen === name));
    }

    function savedSession() {
      return { participant_id: localStorage.getItem(SESSION_KEYS.participantId), token: localStorage.getItem(SESSION_KEYS.token) };
    }

    function clearSession() {
      localStorage.removeItem(SESSION_KEYS.participantId);
      localStorage.removeItem(SESSION_KEYS.token);
    }

    function message(node, text, tone = '') {
      node.textContent = text || '';
      node.dataset.tone = tone;
    }

    async function joinRoom(code, name) {
      const data = await api('arena_join', { code, name });
      localStorage.setItem(SESSION_KEYS.participantId, data.participant.id);
      localStorage.setItem(SESSION_KEYS.token, data.token);
      await enterLobby();
    }

    async function enterLobby() {
      const session = savedSession();
      if (!session.participant_id || !session.token) {
        showScreen('join');
        return;
      }
      try {
        const data = await api('arena_lobby', session);
        state.lobby = data.lobby;
        state.roomId = data.lobby?.room?.id ?? null;
        state.lobbyKey = renderKey(data.lobby);
        renderLobby(data.lobby);
        showScreen('lobby');
        startPolling();
      } catch (error) {
        if (error.status === 401) clearSession();
        else startPolling();
        showScreen('join');
        message($('[data-arena-join-message]'), error.status === 401 ? error.message : 'Reconectando à sua sala. Seu cadastro foi preservado.', 'error');
      }
    }

    const offlineBanner = $('[data-arena-offline]');
    function setOfflineState(offline) {
      if (!offlineBanner) return;
      offlineBanner.hidden = !offline;
    }
    window.addEventListener('online', () => {
      setOfflineState(false);
      refreshLobby(true);
    });
    window.addEventListener('offline', () => {
      setOfflineState(true);
    });

    function refreshLobby(force) {
      // Evento SSE (force) busca na hora; o poll so consulta quando o SSE
      // esta quieto ha mais de 8s — assim transicoes chegam instantaneas.
      if (!force && roomEventsAlive && Date.now() - state.lastFetch < 8000) return Promise.resolve();
      // Uma consulta em voo: os eventos que chegarem durante ela viram no
      // maximo uma releitura no fim, e a resposta de outra sala e descartada.
      return state.gate.run(async () => {
        const session = savedSession();
        if (!session.participant_id) return;
        try {
          const data = await api('arena_lobby', session, { timeout: 9000 });
          setOfflineState(false);
          state.lastFetch = Date.now();
          state.lobby = data.lobby;
          state.roomId = data.lobby?.room?.id ?? state.roomId;
          // Redesenha so quando algo visivel mudou: a leitura de batimento
          // nao pode trocar o texto que o aluno esta digitando.
          const key = renderKey(data.lobby);
          if (key !== state.lobbyKey) {
            state.lobbyKey = key;
            renderLobby(data.lobby);
          }
          showScreen('lobby');
        } catch (error) {
          if (error.status === 401) {
            clearSession();
            showScreen('join');
          } else if (!error.status) {
            setOfflineState(true);
          }
        }
      });
    }

    function startPolling() {
      if (state.poll) window.clearInterval(state.poll);
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      // A conexao e da sala do aluno e prova a sessao dele: o servidor so manda
      // o que e desta sala (mais o que vale para a arena inteira).
      state.sseOff = subscribeRoomEvents(() => refreshLobby(true), eventsQuery(state.roomId, savedSession()));
      // O poll continua sendo a rede de seguranca quando o SSE cai.
      state.poll = window.setInterval(() => {
        if (!state.hiddenClock()) return;
        refreshLobby(false);
      }, 2500);
    }

    // Aba oculta nao consulta; ao voltar, uma leitura imediata (uma vez so).
    onVisibleResume(() => refreshLobby(true));

    function renderLobby(lobby) {
      const room = lobby.room;
      $('[data-arena-room-title]').textContent = room.title;
      $('[data-arena-room-code]').textContent = room.pin || room.code;
      const connected = Number(room.connected || 0);
      $('[data-arena-connected]').textContent = connected;
      const connectedLabel = $('[data-arena-connected-label]');
      if (connectedLabel) connectedLabel.textContent = connected === 1 ? 'conectado' : 'conectados';

      const classic = Boolean(room.settings?.judgeKind === 'classic');
      state.classicRoom = classic;
      document.body.classList.toggle('arena-classic-room', classic);

      const mission = lobby.current_round;
      const finished = room.phase === 'finished' || room.status === 'ended' || room.status === 'archived';
      document.body.classList.toggle('round-active', Boolean(mission) || finished);
      document.body.classList.toggle('round-finished', finished && !mission);
      const missionPanel = $('[data-arena-mission-panel]');
      missionPanel.classList.toggle('has-mission', Boolean(mission));
      $('[data-arena-mission-empty]').hidden = Boolean(mission);
      $('[data-arena-mission]').hidden = !mission;



      // Uma mensagem por estado. Antes eram camadas equivalentes: a sala
      // classica dizia "Aguardando a batalha comecar" e a linha de baixo
      // repetia a mesma espera com outras palavras — o aluno lia duas.
      $('[data-arena-empty-title]').textContent = finished ? '🏆 Batalha encerrada! 🎉' : 'Aguarde o professor iniciar';

      if (finished) {
        if (!document.body.dataset.celebrated) {
          document.body.dataset.celebrated = '1';
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
          script.onload = () => {
            const duration = 5000;
            const end = Date.now() + duration;
            (function frame() {
              window.confetti({ particleCount: 7, angle: 60, spread: 60, origin: { x: 0 }, colors: ['#174ea6', '#f9cd46', '#e8f0fe'] });
              window.confetti({ particleCount: 7, angle: 120, spread: 60, origin: { x: 1 }, colors: ['#174ea6', '#f9cd46', '#e8f0fe'] });
              if (Date.now() < end) requestAnimationFrame(frame);
            }());
          };
          document.body.appendChild(script);
        }
      }

      // Roster ao vivo: no classico, a lista de quem ja entrou substitui os
      // paineis pedagogicos (resultados/destaques) que nao fazem sentido na
      // batalha original.
      const roster = $('[data-arena-roster]');
      const rosterVisible = classic && lobby.roster && lobby.roster.length > 0 && !mission && !finished;
      roster.hidden = !rosterVisible;
      if (rosterVisible) {
        roster.innerHTML = `
          <h2 class="arena-roster-title">Participantes</h2>
          <ul class="arena-roster-list">
            ${lobby.roster.map((entry) => `
              <li class="arena-roster-item${entry.connected ? ' is-connected' : ''}${entry.is_me ? ' is-me' : ''}">
                <span class="arena-roster-dot" aria-hidden="true"></span>
                <strong>${esc(entry.name)}</strong>
                <em>${entry.is_me ? 'você' : entry.connected ? 'conectado' : 'aguardando'}</em>
              </li>
            `).join('')}
          </ul>
        `;
      }

      if (mission) renderMission(mission, { classic, totalRounds: room.settings?.rounds || lobby.rounds?.length || 3 });

      // Card lateral vazio e ruido em qualquer estado — some ate ter dado de
      // verdade. Antes so sumia no lobby puro: na primeira missao o aluno via
      // tres paineis vazios embaixo do formulario ("Ainda sem resultados.",
      // "Ainda sem pontuacao.", "Os destaques aparecem apos as missoes.").
      // Quando os tres somem, a coluna inteira some junto: o `hidden` vale
      // dentro de [data-arena-screen] (ver o catch-all em arena.css).
      renderResults(lobby.results, true);
      renderRanking(lobby.ranking, true);
      renderHighlights(lobby.highlights, true);
      const side = document.querySelector('.arena-side');
      if (side) side.hidden = [...side.querySelectorAll('.arena-card')].every((card) => card.hidden);

      // Encerramento: a classificação é a leitura principal, e o resultado por
      // missão e os destaques ficam a um clique (o título do cartão é a alça).
      // Durante a partida eles ficam abertos — ali são curtos e são o assunto.
      for (const fold of side ? side.querySelectorAll('[data-arena-fold]') : []) fold.open = !finished;

      // Modo Arena por último: ele decide se o painel da missão cede lugar ao
      // voto da turma (nunca os dois ao mesmo tempo na mão do aluno).
      renderArenaMode(lobby);
    }

    function updateCounter(field) {
      const counter = $('[data-arena-counter]');
      if (!counter || !field) return;
      const count = Array.from(field.value || '').length;
      const max = Number(field.maxLength) || 4000;
      const isEssencial = max <= 250;
      counter.textContent = `${count} / ${max} caracteres${isEssencial ? ' (objetividade)' : ''}`;
      counter.classList.toggle('is-warning', count >= max * 0.85 && count < max);
      counter.classList.toggle('is-limit', count >= max);
    }

    function renderMission(mission, options = {}) {
      const modality = mission.modality;
      const classic = Boolean(options.classic);
      const total = Number(options.totalRounds || mission.position || 3);
      const panel = $('[data-arena-mission-panel]');
      panel.classList.toggle('is-boss', modality === 'boss');
      panel.classList.toggle('is-classic', classic);

      // Nova rodada (ou fim de rodada): zera o estado da tela anterior para
      // nada da rodada passada vazar (texto digitado, mensagem de erro, timer).
      const roundKey = `${mission.id}:${mission.round_over ? 'over' : 'open'}`;
      if (state.lastMissionKey !== roundKey) {
        state.lastMissionKey = roundKey;
        const form = $('[data-arena-prompt-form]');
        if (form) {
          let savedDraft = '';
          try { savedDraft = sessionStorage.getItem(`arena_draft_${mission.id}`) || ''; } catch {}
          form.elements.prompt.value = savedDraft;
        }
        const msg = $('[data-arena-mission-message]');
        if (msg) { msg.textContent = ''; delete msg.dataset.tone; }
      }
      const round = String(mission.position).padStart(2, '0');
      $('[data-arena-round-count]').textContent = `${classic ? 'RODADA' : 'MISSAO'} ${round}/${String(total).padStart(2, '0')}`;
      $('[data-arena-mission-badge]').textContent = classic
        ? 'ADIVINHE O PROMPT'
        : `${modality === 'boss' ? '☠️ ' : ''}${(MODALITY_LABELS[modality] || modality).toUpperCase()}`;
      $('[data-arena-mission-title]').textContent = classic ? 'Escreva o prompt que criou esta imagem' : mission.title;

      // Palco classico: a imagem da rodada em destaque, como na batalha original.
      const classicStage = $('[data-arena-classic]');
      if (classicStage) classicStage.hidden = !classic;
      if (classic) {
        const classicImage = $('[data-arena-classic-image]');
        if (mission.reference_image) {
          classicImage.src = mission.reference_image;
          classicImage.alt = 'Imagem da rodada — escreva o prompt original';
        } else {
          classicImage.removeAttribute('src');
        }
      }

      $('[data-arena-mission-context]').hidden = classic || !mission.context;
      $('[data-arena-mission-context]').textContent = mission.context;

      const rescue = $('[data-arena-rescue]');
      rescue.hidden = modality !== 'resgate';
      $('[data-arena-rescue-prompt]').textContent = mission.mission;

      const reversa = $('[data-arena-reversa]');
      reversa.hidden = modality !== 'reversa';
      if (mission.reference_image) {
        $('[data-arena-reversa-image]').src = mission.reference_image;
        $('[data-arena-reversa-image]').alt = 'Referência visual da missão';
      } else {
        // Sem imagem nesta missao, a anterior nao pode ficar pendurada aqui —
        // acontece na previa de uma sala em rascunho (missao visual sem arte).
        $('[data-arena-reversa-image]').removeAttribute('src');
      }

      // O texto de referencia (gabarito do juiz) NAO e renderizado na tela do
      // aluno em nenhuma modalidade: era o mesmo campo com que o juiz compara a
      // resposta, ou seja, a resposta impressa na tela. So o juiz e o painel veem.
      const scenario = $('[data-arena-scenario]');
      const scenarioLabel = $('[data-arena-scenario-label]');
      const scenarioPrompt = $('[data-arena-scenario-prompt]');
      if (modality === 'diagnostico') {
        scenario.hidden = false;
        scenarioLabel.textContent = 'PROMPT INCOMPLETO — FALTA ALGO';
        scenarioPrompt.textContent = mission.mission;
      } else if (modality === 'briefing') {
        scenario.hidden = false;
        scenarioLabel.textContent = 'PEDIDO DO CLIENTE — DO JEITO QUE ELE FALOU';
        scenarioPrompt.textContent = mission.mission;
      } else if (modality === 'boss') {
        scenario.hidden = false;
        scenarioLabel.textContent = 'DESAFIO DO BOSS';
        scenarioPrompt.textContent = mission.mission;
      } else {
        scenario.hidden = true;
      }

      const completoHint = $('[data-arena-completo-hint]');
      completoHint.hidden = modality !== 'completo';

      const body = $('[data-arena-mission-body]');
      if (modality === 'resgate') {
        body.textContent = 'Sua missão: transforme esse pedido em um prompt realmente utilizável, com objetivo, contexto, público, formato e restrições.';
      } else if (modality === 'reversa') {
        body.textContent = 'Sua missão: escreva o prompt que produziria um resultado com estas características.';
      } else if (modality === 'diagnostico') {
        body.textContent = 'Identifique o que esta faltando (publico? nivel? objetivo? formato? profundidade?) e escreva a versao completa do prompt.';
      } else if (modality === 'briefing') {
        body.textContent = 'Transforme esse pedido confuso em um prompt profissional, claro e pronto para usar.';
      } else if (modality === 'boss') {
        body.textContent = '';
      } else if (modality === 'essencial') {
        body.textContent = 'Objetividade máxima: escreva o melhor prompt possível em até 250 caracteres.';
      } else if (modality === 'refinamento') {
        body.textContent = mission.mission;
      } else {
        body.textContent = mission.mission;
      }

      // Tentativas e resultado
      const attempts = $('[data-arena-attempts]');
      const result = $('[data-arena-result]');
      const myScores = mission.my_scores || [];
      const received = mission.my_submissions || [];
      let pendingSubmission = received.find((entry) => entry.status === 'received');
      try {
        const stored = JSON.parse(sessionStorage.getItem(`arena_pending_${mission.id}`) || 'null');
        if (stored && myScores.some((score) => score.attempt === stored.attempt)) {
          sessionStorage.removeItem(`arena_pending_${mission.id}`);
        } else if (stored) pendingSubmission = stored;
      } catch {}
      const attemptsUsed = received.length || myScores.length;
      const attemptsAllowed = mission.attempts || 1;
      attempts.innerHTML = Array.from({ length: attemptsAllowed }, (_, index) => {
        const attemptNumber = index + 1;
        const score = myScores.find((entry) => Number(entry.attempt) === attemptNumber);
        return `<span class="arena-attempt-dot ${score ? 'is-scored' : attemptNumber <= attemptsUsed ? 'is-pending' : ''}">${attemptNumber}</span>`;
      }).join('');

      const canRetry = Boolean(pendingSubmission) || attemptsUsed < attemptsAllowed;
      state.submitLocked = !canRetry;
      const sendButton = document.querySelector("[data-arena-send]");
      const promptForm = $('[data-arena-prompt-form]');
      const promptField = promptForm ? promptForm.elements.prompt : null;

      // Rodada encerrada (janela de resultados): o form vira um aviso neutro —
      // nada de erro vermelho nem textarea ativo para a rodada que acabou.
      const roundOver = Boolean(mission.round_over);
      if (roundOver) {
        state.submitLocked = true;
        if (promptField) promptField.disabled = true;
      } else {
        if (promptField) promptField.disabled = false;
      }
      // No classico, 1 tentativa por rodada: quem ja enviou fica em "aguardando
      // os demais" — o form desabilita e a mensagem confirma o envio.
      const alreadySent = classic && myScores.length >= 1 && !roundOver;
      if (alreadySent) {
        state.submitLocked = true;
        if (promptField) promptField.disabled = true;
      }
      if (pendingSubmission && !roundOver) {
        if (promptField) { promptField.value = pendingSubmission.prompt; promptField.disabled = true; }
        // Estacionada (o provedor falhou e o servidor vai reprocessar sozinho): a
        // frase diz isso, e não "conferindo o envio" — que soa como problema do
        // lado do aluno e convida a repetir um envio que já está guardado.
        const estacionada = state.parkedAttempt
          && state.parkedAttempt.roundId === mission.id
          && state.parkedAttempt.attempt === pendingSubmission.attempt;
        message($('[data-arena-mission-message]'), estacionada
          ? 'Resposta guardada. O juiz esta indisponivel agora: a nota sera concluida automaticamente.'
          : 'Conferindo o envio. Repetir a solicitação mantém a mesma tentativa.', 'info');
      }
      if (sendButton) sendButton.disabled = state.submitLocked || state.isSubmitting;
      if (myScores.length) {
        const latest = myScores[myScores.length - 1];
        result.hidden = false;
        $('[data-arena-result-label]').textContent = classic ? 'PONTOS' : 'SUA NOTA';
        const points = latest.points ?? Number(latest.percent);
        const el = $('[data-arena-result-percent]');
        // O anel lê a QUALIDADE (0–100) em qualquer modalidade: no clássico o
        // número grande são pontos absolutos e a unidade troca para "acerto" —
        // o anel continua sendo a mesma leitura, sem inventar escala nova.
        const ring = $('[data-arena-score-ring]');
        if (ring) {
          const quality = Math.max(0, Math.min(100, Number(latest.percent) || 0));
          ring.style.setProperty('--la-score', quality.toFixed(1));
        }
        const ringUnit = $('[data-arena-result-unit]');
        if (ringUnit) ringUnit.textContent = classic ? 'acerto' : 'de 100';
        const targetText = classic ? String(Math.round(Number(points))) : `${Number(points).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} PTS`;
        if (el.dataset.target !== targetText) {
          el.dataset.target = targetText;
          const endValue = Number(points);
          const start = performance.now();
          const format = classic ? (v) => String(Math.round(v)) : (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} PTS`;
          const frame = (time) => {
            // O quadro recebe o instante em que ele COMEÇOU, que pode ser
            // anterior ao `performance.now()` deste disparo: sem o piso em zero,
            // o primeiro quadro mostrava uma nota NEGATIVA ("-0,94 PTS", medido
            // em 2 de 3 execuções) antes de o número subir.
            const elapsed = Math.max(0, time - start);
            if (elapsed < 1200) {
              const easeOut = 1 - Math.pow(1 - (elapsed / 1200), 3);
              el.textContent = format(endValue * easeOut);
              requestAnimationFrame(frame);
            } else {
              el.textContent = targetText;
            }
          };
          requestAnimationFrame(frame);
        }
        $('[data-arena-breakdown]').innerHTML = classic ? '' : breakdownBars(latest.breakdown);
        // DIAGNÓSTICO (referência LA-03D): o melhor critério e o que ainda dá
        // ponto, em duas frases. É o que o aluno usa para decidir o próximo
        // movimento — e é por isso que ele fica na frente da dobra, enquanto o
        // detalhe critério a critério continua atrás dela.
        const diagnosis = $('[data-arena-diagnosis]');
        if (diagnosis) {
          const entries = Object.entries(latest.breakdown || {})
            .filter(([, value]) => Number.isFinite(Number(value)))
            .sort((a, b) => Number(b[1]) - Number(a[1]));
          if (classic || entries.length < 2) {
            diagnosis.hidden = true;
            diagnosis.innerHTML = '';
          } else {
            const label = (key) => CRITERION_LABELS[key] || key;
            const best = entries[0];
            const focus = entries[entries.length - 1];
            diagnosis.innerHTML = `
              <p class="arena-diagnosis-item is-best"><span>Melhor ponto</span><strong>${esc(label(best[0]))}</strong><em>${Number(best[1])}/20</em></p>
              <p class="arena-diagnosis-item is-focus"><span>Foco agora</span><strong>${esc(label(focus[0]))}</strong><em>+${Math.max(0, 20 - Number(focus[1]))} pts possíveis</em></p>`;
            diagnosis.hidden = false;
          }
        }
        // O detalhamento dos critérios abre sob demanda: quem acabou de responder
        // lê a nota e o feedback, e pede o detalhe se quiser. No clássico não há
        // critérios (o juiz é outro), então a alça sai inteira da tela.
        const breakdownFold = $('[data-arena-breakdown-fold]');
        if (breakdownFold) breakdownFold.hidden = Boolean(classic);
        $('[data-arena-feedback]').textContent = classic
          ? `${latest.feedback || 'Resposta avaliada.'} (acerto de ${Math.round(Number(latest.percent))}%)`
          : `${latest.feedback || ''} Qualidade: ${Math.round(Number(latest.percent))}%.`;
        const evolution = $('[data-arena-evolution]');
        if (latest.attempt > 1 && Number.isFinite(latest.evolution)) {
          evolution.hidden = false;
          const delta = Number(latest.evolution);
          evolution.textContent = delta >= 0 ? `EVOLUCAO +${delta} PTS` : `EVOLUCAO ${delta} PTS`;
          evolution.classList.toggle('is-positive', delta >= 0);
        } else {
          evolution.hidden = true;
        }
        $('[data-arena-retry]').hidden = !canRetry;
        if (canRetry) $('[data-arena-retry]').textContent = `${modality === 'refinamento' ? 'Melhorar prompt' : 'Tentar novamente'} (${attemptsUsed}/${attemptsAllowed})`;
      } else {
        result.hidden = true;
        $('[data-arena-retry]').hidden = true;
      }

      // Contador dinâmico de caracteres
      const textarea = $('[data-arena-prompt-form] textarea');
      const maxLength = modality === 'essencial' ? 250 : 4000;
      if (textarea) {
        textarea.maxLength = maxLength;
        updateCounter(textarea);
      }

      // Aviso de rodada encerrada: substitui o form por um status neutro e
      // claro ("aguarde o professor"), em vez de deixar o aluno com um erro
      // vermelho de envio que parece falha dele.
      const msg = $('[data-arena-mission-message]');
      // Tentativas esgotadas (fora do classico, que tem o seu proprio aviso):
      // antes sobrava um campo editavel e um botao Enviar apagado, sem uma
      // palavra dizendo por que — o aluno digitava a resposta de verdade e ela
      // nao ia a lugar nenhum.
      const semTentativa = !roundOver && !pendingSubmission && !canRetry;
      if (mission.round_over) {
        // Janela de resultados: form some, status neutro e claro.
        if (promptForm) promptForm.hidden = true;
        message(msg, 'Rodada encerrada — aguarde o professor para a próxima.', 'info');
      } else if (pendingSubmission) {
        // Envio em conferencia: a mensagem ja esta na tela e o aluno pode
        // reenviar para repetir a MESMA tentativa — nao apaga o aviso.
        if (promptForm) promptForm.hidden = false;
      } else if (alreadySent || semTentativa) {
        // Ja enviou (ou usou todas as tentativas): form some para nao incentivar
        // reenvio; a confirmacao e o resultado (PONTOS) respondem "foi
        // enviado?" e "fui bem?" enquanto o aluno espera os demais.
        if (promptForm) promptForm.hidden = true;
        message(msg, alreadySent
          ? 'Aguardando os demais jogadores…'
          : `Resposta enviada — ${attemptsAllowed > 1 ? `as ${attemptsAllowed} tentativas desta missão` : 'a tentativa desta missão'} já ${attemptsAllowed > 1 ? 'foram usadas' : 'foi usada'}. Aguarde o professor para a próxima.`, 'info');
      } else {
        if (promptForm) promptForm.hidden = false;
        message(msg, '', '');
      }

      // Timer
      startTimer(mission);
    }

    function startTimer(mission) {
      if (state.timer) window.clearInterval(state.timer);
      const node = $('[data-arena-timer]');
      if (!node) return;
      // Missao sem cronometro: o lugar do relogio diz o que e. Antes ficava um
      // "--:--" sob o rotulo "Tempo restante", que parece relogio que nao
      // carregou — o aluno ficava esperando um tempo que nunca ia comecar.
      // E como nao ha deadline, tambem nao ha o que contar a cada 250 ms.
      const semCronometro = !mission.round_over && !mission.paused_at && !mission.deadline_at;
      node.classList.toggle('is-untimed', semCronometro);
      if (semCronometro) {
        node.textContent = 'Sem limite';
        node.classList.remove('is-danger', 'is-paused');
        return;
      }
      const lastServerTime = Date.now();
      const tick = () => {
        if (mission.paused_at) {
          node.textContent = '⏸ PAUSADA';
          node.classList.add('is-paused');
          node.classList.remove('is-danger');
          return;
        }
        if (mission.round_over || !mission.deadline_at) {
          node.textContent = mission.round_over ? '—' : '--:--';
          node.classList.remove('is-danger', 'is-paused');
          return;
        }
        const remaining = Number(mission.deadline_at) - (Number(mission.server_now || 0) + (Date.now() - lastServerTime) / 1000);
        node.textContent = formatSeconds(remaining);
        node.classList.toggle('is-danger', remaining <= 30);
        node.classList.remove('is-paused');
        if (remaining <= 0) {
          node.textContent = '00:00';
          if (state.poll) { /* aguarda o poll fechar a rodada */ }
        }
      };
      tick();
      state.timer = window.setInterval(tick, 250);
    }

    function renderResults(results, hideWhenEmpty = false) {
      const panel = $('[data-arena-results-list]');
      const card = $('[data-arena-results-panel]');
      if (card) card.hidden = hideWhenEmpty && !results.length;
      if (!results.length) {
        panel.innerHTML = '<p class="arena-empty">Ainda sem resultados.</p>';
        return;
      }
      panel.innerHTML = results.map((round) => {
        const classic = round.judge_kind === 'classic';
        const scoreValue = round.my_best_points ?? round.my_best_percent;
        const scoreLabel = classic ? ' pts' : ' pts';
        return `
        <article class="arena-result-row${classic ? ' is-classic' : ''}">
          <div class="arena-result-row-head">
            <strong>${classic ? `RODADA ${round.position} — CLÁSSICA` : `MISSAO ${round.position} — ${MODALITY_LABELS[round.modality] || round.modality}`}</strong>
            <span>${round.title}</span>
          </div>
          <p>Você ficou em <strong>${round.my_position ? `${round.my_position}º` : '-'}</strong> com <strong>${scoreValue === null || scoreValue === undefined ? '-' : Math.round(Number(scoreValue))}${scoreLabel}</strong>.</p>
          <ol class="arena-mini-ranking">
            ${round.ranking.slice(0, 5).map((entry) => `<li class="${entry.is_me ? 'is-me' : ''}"><span>${entry.position}º</span><strong>${esc(entry.name)}</strong><em>${Number(entry.points ?? entry.percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</em></li>`).join('')}
          </ol>
        </article>`;
      }).join('');
    }

    function renderRanking(ranking, hideWhenEmpty = false) {
      const panel = $('[data-arena-ranking]');
      const card = panel.closest('.arena-ranking-panel');
      if (card) card.hidden = hideWhenEmpty && !ranking.length;
      if (!ranking.length) {
        panel.innerHTML = '<p class="arena-empty">Ainda sem pontuação.</p>';
        return;
      }
      const classic = Boolean(state.classicRoom);
      panel.innerHTML = ranking.map((row) => {
        const total = row.total_points ?? row.points_sum ?? row.avg_percent;
        const position = Number(row.position) || 0;
        const champion = position === 1;
        return `
        <div class="arena-ranking-row${champion ? ' is-champion' : ''}">
          ${medalImage(position, 'arena-ranking-medal')}
          <span class="arena-ranking-player">
            ${winnerAvatar('arena-ranking-avatar')}
            <span class="arena-ranking-name">
              <strong>${esc(row.name)}</strong>
              <small class="arena-ranking-place">${position ? `${position}º lugar` : 'Sem posição'}${champion ? ' · Campeão' : ''}</small>
            </span>
          </span>
          <em>${Math.round(Number(total))} ${classic ? 'pts' : 'pts'}</em>
        </div>`;
      }).join('');
    }

    function renderHighlights(highlights, hideWhenEmpty = false) {
      const panel = $('[data-arena-highlights]');
      const card = panel.closest('.arena-highlights-panel');
      const hasAny = highlights && Object.values(highlights).some((value) => value && value.name);
      if (card) card.hidden = hideWhenEmpty && !hasAny;
      const entries = HIGHLIGHT_LABELS.map(([key, icon, label]) => [key, icon, label, highlights && highlights[key]])
        .filter(([, , , value]) => value && value.name);
      if (!entries.length) {
        panel.innerHTML = '<p class="arena-empty">Os destaques aparecem após as missões.</p>';
        return;
      }
      panel.innerHTML = entries.map(([, icon, label, value]) => `
        <div class="arena-highlight-row">
          <span>${icon}</span>
          <div><strong>${label}</strong><em>${esc(value.name)}</em></div>
          <b>${Number.isFinite(value.percent || value.avg || value.delta) ? `${Math.round(Number(value.percent ?? value.avg ?? value.delta))}` : ''}</b>
        </div>`).join('');
    }

    // Eventos
    $('[data-arena-join-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('[data-arena-join-form] .arena-submit', form);
      const node = $('[data-arena-join-message]');
      button.disabled = true;
      message(node, 'Entrando...', 'info');
      try {
        await joinRoom(form.elements.code.value, form.elements.name.value);
      } catch (error) {
        message(node, error.message, 'error');
        button.disabled = false;
      }
    });

    $('[data-arena-prompt-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = $('[data-arena-send]', form);
      const node = $('[data-arena-mission-message]');
      const session = savedSession();
      const roundId = state.lobby?.current_round?.id;
      if (!roundId || state.isSubmitting) return;

      state.isSubmitting = true;
      button.disabled = true;
      const span = button.querySelector('span');
      const originalText = span ? span.textContent : button.textContent;
      if (span) span.textContent = 'Avaliando resposta...';

      message(node, 'Enviando seu prompt para a avaliação...', 'info');
      const pendingKey = `arena_pending_${roundId}`;
      const received = state.lobby.current_round.my_submissions || [];
      let pending = received.find((entry) => entry.status === 'received');
      try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null') || pending; } catch {}
      pending ||= { prompt: form.elements.prompt.value, attempt: Math.max(0, ...received.map((entry) => entry.attempt), ...(state.lobby.current_round.my_scores || []).map((entry) => entry.attempt)) + 1 };
      try { sessionStorage.setItem(pendingKey, JSON.stringify(pending)); } catch {}
      try {
        // O prazo do cliente fica ACIMA do prazo do servidor (8 s por padrão): o
        // servidor responde "pendente" antes de o navegador desistir. Sem essa
        // folga, o aluno lia falha de rede enquanto o servidor ainda avaliava —
        // enquanto a avaliacao externa pode levar 12 s mais uma repeticao.
        const enviado = await api('arena_submit', {
          participant_id: session.participant_id,
          token: session.token,
          round_id: roundId,
          prompt: pending.prompt,
          attempt: pending.attempt,
        }, { timeout: 15000 });
        if (enviado.pending) {
          // Aceito e ainda avaliando. O rascunho FICA guardado: repetir a
          // solicitacao continua esta mesma avaliacao (mesma submissao, mesma
          // tentativa). Dizer "avaliado!" aqui seria mentira.
          // `parked` e o caso em que o provedor NAO entregou a nota e o servidor
          // vai reprocessar sozinho: dizer so "continua" esconderia que a espera
          // pode ser maior que a de sempre.
          // A tentativa estacionada fica marcada na tela: o servidor reprocessa
          // sozinho e o aviso não pode ser trocado pelo de "conferindo o envio"
          // quando a lobby for redesenhada.
          state.parkedAttempt = enviado.parked ? { roundId, attempt: pending.attempt } : null;
          message(node, enviado.parked
            ? 'Resposta guardada. O juiz esta indisponivel agora: a nota sera concluida automaticamente.'
            : 'Resposta recebida. A avaliacao continua e a nota aparece aqui assim que terminar.', 'info');
        } else {
          try { sessionStorage.removeItem(pendingKey); } catch {}
          try { sessionStorage.removeItem(`arena_draft_${roundId}`); } catch {}
          message(node, 'Prompt avaliado!', 'info');
        }
        form.elements.prompt.value = '';
        updateCounter(form.elements.prompt);
        const data = await api('arena_lobby', session);
        state.lobby = data.lobby;
        renderLobby(data.lobby);
        const result = $('[data-arena-result]');
        if (result && !result.hidden) result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        let scored = false, receivedByServer = false;
        try {
          const data = await api('arena_lobby', session);
          state.lobby = data.lobby;
          renderLobby(data.lobby);
          const summary = data.lobby.rounds.find((round) => round.id === roundId);
          scored = summary?.my_scores?.some((score) => score.attempt === pending.attempt);
          receivedByServer = data.lobby.current_round?.my_submissions?.some((entry) => entry.attempt === pending.attempt);
        } catch {}
        if (scored) {
          try { sessionStorage.removeItem(pendingKey); sessionStorage.removeItem(`arena_draft_${roundId}`); } catch {}
          message(node, 'Envio confirmado e avaliação recuperada.', 'info');
        } else if (receivedByServer) {
          // O servidor TEM a resposta (fila cheia, cota da hora ou rede): nao e
          // falha do aluno, e repetir continua a MESMA avaliacao. O aviso so
          // acrescenta quanto esperar quando o servidor diz.
          const espera = Number(error?.details?.retry_after);
          const quando = Number.isFinite(espera) && espera > 0 ? ` Tente de novo em ~${Math.ceil(espera)} s.` : '';
          message(node, `Prompt recebido.${quando} Repetir a solicitação continua a mesma avaliação.`, 'info');
        } else {
          message(node, 'Não foi possível confirmar o envio. Tente novamente: a mesma tentativa será preservada.', 'error');
        }
      } finally {
        state.isSubmitting = false;
        if (span) span.textContent = originalText;
        button.disabled = Boolean(state.submitLocked);
      }
    });

    $('[data-arena-retry]').addEventListener('click', () => {
      const form = $('[data-arena-prompt-form]');
      form.elements.prompt.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('[data-arena-leave]').addEventListener('click', () => {
      clearSession();
      if (state.poll) window.clearInterval(state.poll);
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      showScreen('join');
    });

    // -------------------- MODO ARENA (aluno) --------------------
    //
    // O aluno nunca precisa perguntar "o que eu faço agora?": a tela mostra o
    // que está acontecendo, a ação de agora, o tempo e o que vem depois. Cada
    // fase tem UMA ação — e nenhuma tela acumula estatística.
    const arenaChoice = { wildcard: null, dynamic: null, pending: false };

    function arenaVoteStatus(message, tone) {
      const node = $('[data-arena-vote-status]');
      if (!node) return;
      node.textContent = message || '';
      node.dataset.tone = tone || '';
      node.hidden = !message;
    }

    function renderArenaMode(lobby) {
      const arena = lobby?.arena;
      const hud = $('[data-arena-mode-hud]');
      const vote = $('[data-arena-mode-vote]');
      if (!hud || !vote) return;
      const enabled = Boolean(arena?.enabled);
      document.body.classList.toggle('arena-mode-room', enabled);
      hud.hidden = !enabled;
      if (!enabled) { vote.hidden = true; return; }

      $('[data-arena-hearts]').innerHTML = arenaHeartsMarkup(arena);
      const fill = $('[data-arena-energy-fill]');
      if (fill) fill.style.width = `${Math.min(100, Number(arena.energy?.percent || 0))}%`;
      const team = $('[data-arena-team]');
      if (team) {
        team.hidden = !arena.my_team;
        if (arena.my_team) team.textContent = `${arena.my_team.glyph} TIME ${arena.my_team.name}`;
      }
      renderArenaVote(arena);
    }

    function renderArenaVote(arena) {
      const card = $('[data-arena-mode-vote]');
      const kicker = $('[data-arena-vote-kicker]');
      const question = $('[data-arena-vote-question]');
      const intro = $('[data-arena-vote-intro]');
      const promptBox = $('[data-arena-vote-prompt]');
      const options = $('[data-arena-vote-options]');
      const confidence = $('[data-arena-confidence]');
      const confidenceOptions = $('[data-arena-confidence-options]');
      if (!card) return;
      // Voto e missão nunca disputam a tela: quando a turma está votando, o
      // painel da missão sai de cena (e volta sozinho na próxima fase).
      const panel = $('[data-arena-mission-panel]');
      const show = () => { card.hidden = false; if (panel) panel.hidden = true; };
      const hide = () => { card.hidden = true; if (panel) panel.hidden = false; };

      const setIntro = (value) => {
        intro.hidden = !value;
        intro.textContent = value || '';
      };
      const setPrompt = (value) => {
        promptBox.hidden = !value;
        promptBox.textContent = value || '';
      };
      const showOptions = (list, kind, selected) => {
        options.innerHTML = list.map((option) => `
          <button type="button" class="arena-vote-option${String(selected) === String(option.key) ? ' is-picked' : ''}"
            data-arena-vote-choice="${esc(option.key)}" data-arena-vote-kind="${kind}"
            aria-pressed="${String(selected) === String(option.key)}">
            <b>${esc(arenaOptionKey(option))}</b><span>${esc(arenaOptionLabel(option))}</span>
          </button>`).join('');
      };

      confidence.hidden = true;
      confidenceOptions.innerHTML = '';
      const wildcard = arena.wildcard;
      const dynamic = arena.dynamic;

      if (wildcard && !wildcard.revealed) {
        show();
        kicker.textContent = '🎲 WILD CARD';
        question.textContent = 'Qual prompt merece entrar na Arena?';
        setIntro('Escolha o prompt que merece entrar em campo.');
        setPrompt('');
        if (!wildcard.can_vote) {
          options.innerHTML = '';
          arenaVoteStatus('Você está no Wild Card — quem está em campo não vota.', 'info');
          return;
        }
        showOptions(wildcard.options.map((option) => ({ key: option.key, label: option.prompt?.slice(0, 120) || option.key })), 'wildcard', wildcard.my_vote || arenaChoice.wildcard);
        arenaVoteStatus(wildcard.my_vote ? 'Voto registrado. Pode trocar até o professor fechar.' : '');
        return;
      }

      if (dynamic && !dynamic.revealed) {
        show();
        const definition = dynamic.label || 'Desafio da turma';
        kicker.textContent = `⚔️ ${definition.toUpperCase()}`;
        question.textContent = dynamic.question;
        setIntro(dynamic.hint ? `A turma aprendeu algo: ${dynamic.hint}` : '');
        setPrompt(dynamic.prompt || '');
        const picked = arenaChoice.dynamic || dynamic.my_vote;
        showOptions(dynamic.options, 'dynamic', picked);
        if (dynamic.needs_confidence && picked) {
          confidence.hidden = false;
          confidenceOptions.innerHTML = (dynamic.confidence_options || []).map((entry) => `
            <button type="button" class="arena-vote-option is-small${String(dynamic.my_confidence) === entry.key ? ' is-picked' : ''}"
              data-arena-confidence-choice="${esc(entry.key)}">${esc(entry.label)}</button>`).join('');
        }
        arenaVoteStatus(picked && !dynamic.needs_confidence ? 'Voto registrado. Pode trocar até o professor fechar.' : '');
        return;
      }

      if (dynamic && dynamic.revealed && dynamic.result) {
        const result = dynamic.result;
        show();
        kicker.textContent = '📣 RESULTADO';
        question.textContent = result.damaged ? 'DANO NO JUIZ! −1 ❤️' : 'O JUIZ RESISTIU.';
        setIntro(`${Number(result.correct || 0)} de ${Number(result.total || 0)} acertaram${result.needed ? ` — eram necessários ${result.needed}` : ''}.`);
        setPrompt('');
        options.innerHTML = '';
        confidence.hidden = true;
        const mine = dynamic.my_vote;
        const right = mine && String(mine) === String(result.correct_key);
        arenaVoteStatus(mine ? (right ? 'Você leu o Juiz certo. 👏' : 'Não foi dessa vez — repare no critério que o Juiz apontou.') : 'Você não votou neste desafio.');
        return;
      }

      hide();
    }

    /** Envia o voto (Wild Card ou desafio) e recarrega a sala na hora. */
    async function sendArenaVote(choice, kind, extra = {}) {
      if (arenaChoice.pending) return;
      const session = savedSession();
      if (!session.participant_id) return;
      arenaChoice.pending = true;
      if (kind === 'wildcard') arenaChoice.wildcard = choice;
      else arenaChoice.dynamic = choice;
      try {
        await api('arena_mode_vote', { ...session, choice, ...extra }, { timeout: 9000 });
        arenaVoteStatus('Voto registrado ✓', 'ok');
        await refreshLobby(true);
      } catch (error) {
        arenaVoteStatus(error.message || 'Não foi possível registrar seu voto.', 'error');
      } finally {
        arenaChoice.pending = false;
      }
    }

    document.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-arena-vote-choice]');
      if (choice) {
        const kind = choice.dataset.arenaVoteKind || 'dynamic';
        sendArenaVote(choice.dataset.arenaVoteChoice, kind);
        return;
      }
      const level = event.target.closest('[data-arena-confidence-choice]');
      if (level) {
        const picked = arenaChoice.dynamic || state.lobby?.arena?.dynamic?.my_vote;
        if (!picked) {
          arenaVoteStatus('Escolha primeiro quem o Juiz vai colocar em primeiro.', 'error');
          return;
        }
        sendArenaVote(picked, 'dynamic', { confidence: level.dataset.arenaConfidenceChoice });
      }
    });

    // Textarea auto-ajuste + contador dinâmico + salvamento de rascunho
    const promptTextarea = $('[data-arena-prompt-form] textarea');
    promptTextarea?.addEventListener('input', (event) => {
      const field = event.currentTarget;
      field.style.height = 'auto';
      field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
      updateCounter(field);
      const roundId = state.lobby?.current_round?.id;
      if (roundId) {
        try { sessionStorage.setItem(`arena_draft_${roundId}`, field.value); } catch {}
      }
    });

    // Atalho universal de envio (Ctrl + Enter / Cmd + Enter)
    promptTextarea?.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        const form = event.currentTarget.form;
        if (form && !state.submitLocked && !state.isSubmitting) {
          form.requestSubmit ? form.requestSubmit() : form.querySelector('button[type="submit"]')?.click();
        }
      }
    });

    // Lightbox / Zoom da imagem de referência no mobile
    const lightbox = $('[data-arena-lightbox]');
    const lightboxImg = $('[data-arena-lightbox-img]');
    function openLightbox(src) {
      if (!lightbox || !lightboxImg || !src) return;
      lightboxImg.src = src;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      document.body.style.overflow = '';
    }
    lightbox?.addEventListener('click', closeLightbox);
    $('[data-arena-lightbox-close]')?.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

    $('[data-arena-classic-image]')?.addEventListener('click', (e) => openLightbox(e.currentTarget.src));
    $('[data-arena-reversa-image]')?.addEventListener('click', (e) => openLightbox(e.currentTarget.src));

    // ---------------------------------------------------------------------
    // PREVIA DO PROFESSOR (/aluno-preview.php?room=ID): a mesma tela do aluno,
    // alimentada pela sala e sem sessao de participante. Nada e enviado.
    // -----------------------------------------------------------------
    const previewState = { room: null, missions: [], end: null, timing: null, index: 0, mode: 'missao', showGabarito: false, prepAberto: false, navAberto: false };
    const PREVIEW_MODES = [
      ['missao', 'Missão'],
      ['resultado', 'Depois de responder'],
      ['fim', 'Fim da sala'],
    ];

    /**
     * Monta um passo da previa com o MESMO caminho da tela do aluno
     * (renderLobby -> renderMission / renderResults / renderRanking), passando um
     * lobby sintetico. Assim a previa nao guarda uma copia paralela do que o
     * aluno ve — inclusive das telas de nota e de fim.
     *
     * - missao: a missao aberta, como o aluno a recebe;
     * - resultado: a mesma missao no estado "rodada encerrada" (nota, criterios,
     *   feedback) e o acumulado das missoes anteriores;
     * - fim: a sala encerrada, com resultado por missao, classificacao e destaques.
     */
    function renderPreviewMission(index) {
      const mission = previewState.missions[index];
      if (!mission) return;
      previewState.index = index;
      const room = previewState.room;
      const end = previewState.end || { results: [], ranking: [], highlights: [] };
      const classic = room.judge_kind === 'classic';
      const mode = previewState.mode;
      const finished = mode === 'fim';
      const current = mode === 'missao'
        ? mission
        : mode === 'resultado'
          ? { ...mission, round_over: true, my_scores: mission.preview_scores || [] }
          : null;
      // No meio do jogo o aluno ja ve o resultado das missoes anteriores e a
      // classificacao corrente; no fim, tudo. No passo "Missao" nada disso
      // aparece, para a tela ficar igual a da missao aberta.
      const showEnd = mode !== 'missao';
      renderLobby({
        room: {
          title: room.title, code: room.pin, pin: room.pin, connected: 0,
          phase: finished ? 'finished' : 'playing', status: finished ? 'ended' : 'open',
          settings: { judgeKind: classic ? 'classic' : 'criteria', rounds: previewState.missions.length },
        },
        current_round: current,
        rounds: previewState.missions.length,
        results: !showEnd ? [] : finished
          ? (end.results || [])
          : (end.results || []).filter((entry) => Number(entry.position) < Number(mission.position)),
        ranking: showEnd ? (end.ranking || []) : [],
        highlights: showEnd ? (end.highlights || []) : [],
        roster: [],
      });
      if (mode === 'missao') {
        // O composer e vitrine: o professor ve o convite, mas nao escreve pelo aluno.
        const field = $('[data-arena-prompt-form] textarea');
        if (field) {
          field.value = '';
          field.disabled = true;
          field.placeholder = 'O aluno escreve a resposta aqui';
        }
        const send = $('[data-arena-send]');
        if (send) send.disabled = true;
        message($('[data-arena-mission-message]'), 'Prévia do aluno: nada é enviado.', 'info');
      }
      renderPreviewBar(mission, room);
    }

    function renderPreviewBar(mission, room) {
      let bar = $('[data-arena-preview-bar]');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'arena-preview-bar';
        bar.dataset.arenaPreviewBar = '';
        const header = $('.arena-lobby-header');
        if (header?.parentNode) header.parentNode.insertBefore(bar, header);
        else $('.arena-lobby')?.prepend(bar);
      }
      const total = previewState.missions.length;
      const mode = previewState.mode;
      const hasMission = mode !== 'fim';
      const missing = hasMission ? (mission.missing || []).map((key) => MISSING_LABELS[key] || key).join(' · ') : '';
      // O gabarito existe so aqui: o aluno nunca o recebe (ver missionView).
      const referencia = hasMission ? (mission.judge_reference || '').trim() : '';
      // Resultado e podio dependem de pontuacao: sem nenhuma resposta na sala,
      // o que aparece e amostra — e a barra diz isso em vez de deixar parecer
      // placar de verdade.
      const end = previewState.end || {};
      const sample = hasMission ? Boolean(mission.result_sample) : Boolean(end.sample);
      const selo = !hasMission || mode === 'resultado'
        ? `<span class="arena-preview-sample${sample ? ' is-sample' : ''}">${sample
          ? 'NÚMEROS DE EXEMPLO — esta sala ainda não tem respostas'
          : `Dados reais desta sala${end.player ? ` (${esc(end.player)})` : ''}`}</span>`
        : '';
      // Com UMA missão não há para onde navegar: "Anterior"/"Próxima" ficavam
      // desabilitados e a grade numerada repetia a única missão. A contagem
      // continua à vista; os controles só existem a partir de duas missões.
      const navegavel = total > 1;
      // A barra fica no alto da tela do aluno: identificação, voltar e o seletor
      // de estado/missão ficam à vista, e o que é PREPARAÇÃO ou NAVEGAÇÃO —
      // código, tempo da sala, ir para outra missão — abre sob a alça. O aviso de
      // simulação vira a alça, então ele não some e não custa palavra nova; a
      // pendência da missão (⚠) sobe para o cabeçalho, onde não se esconde atrás
      // de nenhuma dobra.
      bar.innerHTML = `
        <div class="arena-preview-head">
          <span class="arena-preview-tag">PRÉVIA DO PROFESSOR</span>
          <strong>${esc(room.title)}</strong>
          ${hasMission && missing ? `<span class="arena-preview-missing">⚠ ${esc(missing)}</span>` : ''}
          <details class="arena-preview-prep" data-preview-prep${previewState.prepAberto ? ' open' : ''}>
            <summary class="arena-preview-note">Nada disto está no ar.</summary>
            <p class="arena-preview-prep-body">
              <span>PIN ${esc(room.pin || '—')}</span>
              ${previewState.missions.length ? `<span class="arena-preview-total" data-preview-timing>⏱ ${esc(timingSummary(previewState.timing))}</span>` : ''}
              ${hasMission ? `<span class="arena-preview-meta">${MODALITY_LABELS[mission.modality] || mission.modality}${mission.duration_seconds ? ` · tempo ${formatSeconds(mission.duration_seconds)}` : ' · sem cronômetro'}${Number(mission.attempts) > 1 ? ` · ${mission.attempts} tentativas` : ''}</span>` : ''}
              ${hasMission && !missing ? '<span class="arena-preview-ok">✓ pronta para ir ao ar</span>' : ''}
            </p>
          </details>
          <a class="arena-preview-back" href="/admin-arena.php">← Voltar ao painel</a>
        </div>
        <div class="arena-preview-modes">
          ${PREVIEW_MODES.map(([value, label]) => `<button type="button" class="arena-preview-mode${value === mode ? ' is-current' : ''}" data-preview-mode="${value}" aria-pressed="${value === mode}">${label}</button>`).join('')}
          ${selo}
        </div>
        ${hasMission ? `<div class="arena-preview-nav">
          ${navegavel ? `<details class="arena-preview-nav-fold" data-preview-nav-fold${previewState.navAberto ? ' open' : ''}>
            <summary class="arena-preview-count">Missão <b>${mission.position}</b> de <b>${total}</b></summary>
            <div class="arena-preview-nav-row">
              <button type="button" data-preview-step="-1" ${previewState.index === 0 ? 'disabled' : ''}>‹ Anterior</button>
              <button type="button" data-preview-step="1" ${previewState.index >= total - 1 ? 'disabled' : ''}>Próxima ›</button>
            </div>
            <div class="arena-preview-jump">
          ${previewState.missions.map((entry, index) => {
            const timed = Number(entry.duration_seconds) > 0;
            // O tracejado marca a missao SEM cronometro: ela so termina quando o
            // professor encerra a rodada, e isso muda o ritmo da aula.
            const marca = timed ? `tempo ${formatSeconds(entry.duration_seconds)}` : 'sem cronômetro';
            return `<button type="button" class="${index === previewState.index ? 'is-current' : ''}${(entry.missing || []).length ? ' has-issue' : ''}${timed ? '' : ' is-untimed'}" data-preview-jump="${index}" data-preview-timer="${timed ? entry.duration_seconds : ''}" title="Missão ${entry.position}: ${esc(entry.title)} · ${marca}">${entry.position}</button>`;
          }).join('')}
          ${previewState.missions.some((entry) => !(Number(entry.duration_seconds) > 0)) ? '<span class="arena-preview-legend">tracejado = sem cronômetro (você encerra a rodada)</span>' : ''}
            </div>
          </details>` : `<span class="arena-preview-count">Missão <b>${mission.position}</b> de <b>${total}</b></span>`}
          ${referencia ? `<button type="button" class="arena-preview-gabarito-toggle" data-preview-gabarito aria-expanded="${previewState.showGabarito}">${previewState.showGabarito ? 'Ocultar gabarito' : '👁 Ver gabarito'}</button>` : ''}
        </div>` : ''}
        ${previewState.showGabarito && referencia ? `<div class="arena-preview-gabarito" data-preview-gabarito-panel>
          <span>GABARITO DO JUIZ — O ALUNO NÃO VÊ ESTE TEXTO</span>
          <p>${esc(referencia)}</p>
        </div>` : ''}`;
    }

    function wirePreviewKeys() {
      // O painel da prévia se redesenha a cada troca de missão: sem guardar a
      // escolha, o que o professor abriu fecharia no clique seguinte.
      document.addEventListener('toggle', (event) => {
        const alvo = event.target instanceof Element ? event.target : null;
        const nav = alvo ? alvo.closest('[data-preview-nav-fold]') : null;
        if (nav) { previewState.navAberto = nav.open; return; }
        const prep = alvo ? alvo.closest('[data-preview-prep]') : null;
        if (prep) previewState.prepAberto = prep.open;
      }, true);
      document.addEventListener('click', (event) => {
        const mode = event.target.closest('[data-preview-mode]');
        if (mode) {
          previewState.mode = mode.dataset.previewMode;
          // Ao voltar para uma missao, nao perde o gabarito aberto.
          renderPreviewMission(previewState.index);
          return;
        }
        const step = event.target.closest('[data-preview-step]');
        if (step) {
          renderPreviewMission(previewState.index + Number(step.dataset.previewStep));
          return;
        }
        const jump = event.target.closest('[data-preview-jump]');
        if (jump) renderPreviewMission(Number(jump.dataset.previewJump));
        if (event.target.closest('[data-preview-gabarito]')) {
          previewState.showGabarito = !previewState.showGabarito;
          renderPreviewMission(previewState.index);
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { window.location.assign('/admin-arena.php'); return; }
        // Sem missao na tela (fim da sala), as setas nao tem para onde ir.
        if (previewState.mode === 'fim') return;
        if (event.key === 'ArrowRight') renderPreviewMission(previewState.index + 1);
        else if (event.key === 'ArrowLeft') renderPreviewMission(previewState.index - 1);
      });
    }

    async function startPreview(roomId) {
      if (!roomId) {
        message($('[data-arena-join-message]'), 'Abra a prévia pelo painel: falta o código da sala.', 'error');
        return;
      }
      try {
        const data = await api('arena_room_preview', { room_id: roomId }, { timeout: 20000 });
        previewState.room = data.room;
        previewState.missions = data.missions || [];
        previewState.end = data.end || null;
        previewState.timing = data.timing || null;
        document.title = `Prévia — ${data.room.title}`;
        $('[data-arena-leave]')?.remove();
        showScreen('lobby');
        wirePreviewKeys();
        if (previewState.missions.length) {
          renderPreviewMission(0);
        } else {
          renderLobby({
            room: { title: data.room.title, code: data.room.pin, pin: data.room.pin, connected: 0, phase: 'lobby', status: 'draft', settings: { rounds: 0 } },
            current_round: null, rounds: 0, results: [], ranking: [], highlights: [], roster: [],
          });
          const bar = document.createElement('div');
          bar.className = 'arena-preview-bar';
          bar.dataset.arenaPreviewBar = '';
          bar.innerHTML = `<div class="arena-preview-head"><span class="arena-preview-tag">PRÉVIA DO PROFESSOR</span><strong>${esc(data.room.title)}</strong><span class="arena-preview-note">Esta sala ainda não tem missão nenhuma.</span><a class="arena-preview-back" href="/admin-arena.php">← Voltar ao painel</a></div>`;
          $('.arena-lobby')?.prepend(bar);
        }
      } catch (error) {
        message($('[data-arena-join-message]'), error.message, 'error');
      }
    }

    if (document.body.dataset.arenaPreview === '1') {
      startPreview(new URLSearchParams(window.location.search).get('room'));
      return;
    }

    // Inicio: checa o gate, auto-preenche PIN da URL e restaura sessao
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const urlPin = (params.get('pin') || params.get('code') || '').trim();

      try {
        const status = await api('arena_status');
        const form = $('[data-arena-join-form]');
        if (!status.open) {
          form.querySelector('button').disabled = true;
          message($('[data-arena-join-message]'), 'A Arena esta fechada no momento.', 'error');
        }
      } catch { /* offline: deixa tentar */ }

      // Se o aluno entrou por um link/QR com PIN específico, mas já tinha uma sessão salva
      // de outra sala, limpa a sessão antiga para entrar na nova sem conflito.
      if (urlPin && savedSession().participant_id) {
        try {
          const lobbyData = await api('arena_lobby', savedSession());
          const currentPin = String(lobbyData?.lobby?.room?.pin || lobbyData?.lobby?.room?.code || '').trim();
          if (currentPin && currentPin !== urlPin) {
            clearSession();
          }
        } catch {
          clearSession();
        }
      }

      if (savedSession().participant_id) {
        await enterLobby();
      } else {
        showScreen('join');
        const form = $('[data-arena-join-form]');
        if (urlPin && form && form.elements.code) {
          form.elements.code.value = urlPin;
          if (form.elements.name) {
            form.elements.name.focus();
          }
        }
      }
    })();
  }

  // =========================================================================
  // PAINEL DO PROFESSOR
  // =========================================================================

  if (page === 'admin-arena') {
    // A autenticacao e via cookie HttpOnly+SameSite (o servidor injeta o token
    // nas chamadas): o JS nao guarda nem envia admin_token.
    const state = {
      rooms: [],
      challenges: [],
      lessons: [],
      open: false,
      selectedRoomId: null,
      editingChallengeId: null,
      // Sala de onde veio uma correcao de desafio: ao salvar, o cockpit dela e
      // atualizado e o professor ve o que ainda falta.
      fixReturn: null,
      detailPoll: null,
      countdownTimer: null,
      sseOff: null,
      lastDetailFetch: 0,
      detailKey: null,
      detailGate: createFetchGate(),
      hiddenClock: hiddenPollClock(),
      // Escolha do professor em cada dobra do painel (`[data-fold-key]`). O
      // painel se redesenha a cada leitura do servidor; sem isto o que ele
      // abriu fecharia no poll seguinte.
      folds: new Map(),
    };

    function startAdminCountdown(rounds, serverNow) {
      if (state.countdownTimer) window.clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      const open = (rounds || []).find((round) => round.status === 'open');
      if (!open || !open.deadline_at) return;
      if (open.paused_at != null && Number.isFinite(Number(open.paused_at))) return;
      const lastServerTime = Date.now();
      const tick = () => {
        const remaining = Number(open.deadline_at) - (Number(serverNow) + (Date.now() - lastServerTime) / 1000);
        document.querySelectorAll('[data-round-countdown]').forEach((node) => {
          node.textContent = formatSeconds(remaining);
          node.classList.toggle('is-danger', remaining <= 30);
        });
      };
      tick();
      state.countdownTimer = window.setInterval(tick, 1000);
    }

    const message = (node, text, tone = '') => {
      node.textContent = text || '';
      node.dataset.tone = tone;
    };

    const adminApi = (action, payload = {}) => api(action, payload, { timeout: 20000 });

    const blockersSummary = (blockers = []) => blockers
      .map((entry) => `Missão ${entry.position} ${entry.title}: ${(entry.missing || []).map((key) => MISSING_LABELS[key] || key).join(' e ')}`)
      .join('; ');

    /**
     * A sala não abre com missão sem gabarito nem com missão visual sem imagem.
     * O servidor recusa e devolve a lista; este diálogo mostra exatamente qual
     * missão está travando e o que falta nela.
     */
    function showBlockersDialog(error, roomId = null) {
      const blockers = error?.details?.blockers || [];
      if (!blockers.length) return false;
      openDialog('Faltando para abrir a sala', `
        <p class="arena-blockers-lead">${esc(error.message)}</p>
        <ul class="arena-blockers-list">
          ${blockers.map((entry) => `<li>
            <strong>Missão ${entry.position} — ${esc(entry.title)}</strong>
            <span>${(entry.missing || []).map((key) => esc(MISSING_LABELS[key] || key)).join(' · ')}</span>
            ${entry.challenge_id ? `<button type="button" class="arena-fix-button" data-action="fix-round" data-challenge-id="${esc(entry.challenge_id)}" data-missing="${esc((entry.missing || []).join(','))}">✎ Corrigir agora</button>` : ''}
          </li>`).join('')}
        </ul>
        <p class="arena-blockers-help">Corrigir abre o desafio aqui mesmo, no campo que falta.</p>
        ${roomId ? `<button type="button" class="figma-cta figma-cta-blue arena-fix-all" data-action="fix-all" data-room-id="${esc(roomId)}">✎ Preencher ${blockers.length === 1 ? 'esta missão' : `estas ${blockers.length} missões`} de uma vez</button>` : ''}
      `);
      return true;
    }

    function showLogin() {
      const panel = $('[data-admin-arena-login-panel]');
      const content = $('[data-admin-arena-content]');
      if (panel) panel.hidden = false;
      if (content) content.hidden = true;
    }

    function showContent() {
      const panel = $('[data-admin-arena-login-panel]');
      const content = $('[data-admin-arena-content]');
      if (panel) panel.hidden = true;
      if (content) content.hidden = false;
    }

    async function login(password) {
      // O servidor valida a senha e grava o cookie HttpOnly; sem token no corpo
      // nem na URL. O reload pede a pagina autenticada (o cookie vai junto).
      await api('admin_login', { password });
      window.location.replace('/admin-arena.php');
    }

    async function refreshAll() {
      const status = await adminApi('arena_admin_status');
      state.open = Boolean(status.open);
      state.rooms = status.rooms || [];
      renderGate();
      renderHero();
      renderRooms();
      await refreshChallenges();
      await refreshLessons();
      if (state.selectedRoomId) await refreshDetail(state.selectedRoomId);
    }

    function renderGate() {
      const button = $('[data-arena-gate-toggle]');
      button.textContent = state.open ? 'Fechar Arena' : 'Abrir Arena';
      button.classList.toggle('figma-cta-blue', !state.open);
      button.classList.toggle('figma-cta-gradient', state.open);
      const pill = $('[data-arena-gate-status]');
      if (pill) {
        pill.hidden = false;
        pill.textContent = state.open ? 'Arena aberta' : 'Arena fechada';
        pill.classList.toggle('is-closed', !state.open);
      }
    }

    async function toggleGate() {
      const button = $('[data-arena-gate-toggle]');
      button.disabled = true;
      try {
        const data = await adminApi('arena_set_open', { open: !state.open });
        state.open = data.open;
        renderGate();
      } finally {
        button.disabled = false;
      }
    }

    /**
     * Cartão-herói do painel (referência LA-05): os números da Arena num lugar
     * só. São os MESMOS dados da lista de salas, contados aqui — nenhuma rota
     * nova no servidor, nenhum número inventado.
     */
    function renderHero() {
      const target = $('[data-arena-hero-stats]');
      if (!target) return;
      const rooms = state.rooms || [];
      const playing = rooms.filter((room) => room.status === 'playing').length;
      const students = rooms.reduce((total, room) => total + Number(room.participants || 0), 0);
      const online = rooms.reduce((total, room) => total + Number(room.connected || 0), 0);
      const tiles = [
        ['Salas', rooms.length, false],
        ['Em andamento', playing, false],
        ['Alunos', students, false],
        ['Online agora', online, online > 0],
      ];
      target.innerHTML = tiles.map(([label, value, live]) => `
        <div class="arena-hero-stat">
          <span>${label}</span>
          <strong class="${live ? 'is-live' : ''}">${Number(value).toLocaleString('pt-BR')}</strong>
        </div>`).join('');
    }

    function renderRooms() {
      const list = $('[data-arena-room-list]');
      const countEl = $('[data-arena-room-count]');
      if (countEl) {
        countEl.textContent = state.rooms.length ? `${state.rooms.length} ${state.rooms.length === 1 ? 'sala' : 'salas'}` : '';
      }
      if (!state.rooms.length) {
        list.innerHTML = '<p class="arena-empty">Nenhuma sala ainda.</p>';
        return;
      }
      list.innerHTML = state.rooms.map((room) => `
        <article class="arena-room-card ${room.id === state.selectedRoomId ? 'is-selected' : ''}" data-room-id="${esc(room.id)}">
          <div class="arena-room-card-main">
            <div class="arena-room-card-title">
              <strong>${esc(room.title)}</strong>
            </div>
            <div class="arena-room-card-badges">
              <span class="arena-status-badge is-${esc(room.status)}">${STATUS_LABELS[room.status] || room.status}</span>
              <span class="arena-room-code" title="Código de entrada (PIN)">${esc(formatPin(room.pin || room.code))}</span>
              <span class="arena-room-missions-badge" title="Missões configuradas nesta sala">${Number(room.rounds_count || 0)} ${Number(room.rounds_count || 0) === 1 ? 'missão' : 'missões'}</span>
              <span class="arena-preset-chip is-${esc(room.preset || '')}">${PRESET_LABELS[room.preset] || (room.preset || 'sala')}</span>
              ${(room.blockers || []).length ? `<span class="arena-room-blocked-badge" title="Missões que impedem abrir a sala">⚠ ${(room.blockers || []).length} a corrigir</span>` : ''}
            </div>
          </div>
          <div class="arena-room-card-stats">
            <div class="arena-stat">
              <b>${room.participants}</b>
              <span>${room.expected_players ? `de ${room.expected_players} ` : ''}alunos</span>
            </div>
            <div class="arena-stat-divider"></div>
            <div class="arena-stat">
              <b class="${room.connected > 0 ? 'is-live' : ''}">${room.connected}</b>
              <span>online</span>
            </div>
          </div>
          <div class="arena-room-card-actions">
            <button type="button" data-action="detail">Ver sala</button>
            ${room.status === 'draft' ? `<button type="button" data-action="publish" class="${(room.blockers || []).length ? 'is-blocked' : ''}" title="${esc((room.blockers || []).length ? `Ainda não abre — ${blockersSummary(room.blockers)}` : 'Abrir a sala para os alunos entrarem')}">Abrir sala</button>` : ''}
            ${room.can_start ? `<button type="button" data-action="start">${isClassicish(room) ? 'Iniciar batalha' : 'Iniciar missão'}</button>` : ''}
            ${room.status === 'playing' ? `<button type="button" data-action="end-room">Encerrar sala</button>` : ''}
            ${room.status === 'ended' ? `<button type="button" data-action="archive">Arquivar</button>` : ''}
            ${['draft', 'waiting'].includes(room.status) ? `<button type="button" data-action="delete" class="is-danger">Excluir</button>` : ''}
          </div>
        </article>`).join('');
    }

    async function refreshChallenges() {
      const data = await adminApi('arena_list_challenges');
      state.challenges = (data.challenges || []).map((challenge) => ({
        ...challenge,
        reference_text: challenge.referenceText,
        reference_image: challenge.referenceImage,
        expected_result: challenge.expectedResult,
        duration_seconds: challenge.durationSeconds,
        speed_weight: challenge.speedWeight,
      }));
      renderChallenges();
    }
    async function refreshLessons() {
      try {
        const data = await adminApi('arena_list_lessons');
        state.lessons = data.lessons || [];
      } catch {
        state.lessons = [];
      }
      renderLessons();
    }

    /** As modalidades da aula, com quantas missões de cada uma. */
    function contagemPorTipo(lesson) {
      const porTipo = new Map();
      for (const challenge of lesson.challenges) {
        const label = MODALITY_LABELS[challenge.modality] || challenge.modality;
        porTipo.set(label, (porTipo.get(label) || 0) + 1);
      }
      return [...porTipo];
    }

    /**
     * O resumo da aula no estado FECHADO: o tamanho dela, e o tipo quando a aula
     * inteira é de um tipo só. A enumeração completa desceu para dentro da
     * abertura (`lessonMix`), porque no fechado ela era a maior linha do cartão
     * — a Aula 5 gastava 28 palavras só no resumo, contra as 15 da Aula 2 e as 5
     * da Aula 4, e o cartão mais barato de ler era justamente o mais informado.
     * A consolidação da rodada anterior fica: um selo por missão sai, a
     * quantidade fica.
     */
    function lessonResumo(lesson) {
      const total = lesson.challenges.length;
      const tipos = contagemPorTipo(lesson);
      const quantidade = `${total} ${total === 1 ? 'missão' : 'missões'}`;
      return tipos.length === 1 ? `${quantidade} de ${tipos[0][0]}` : quantidade;
    }

    /** A enumeração completa das modalidades, numa linha, dentro da dobra. */
    function lessonMix(lesson) {
      const tipos = contagemPorTipo(lesson);
      if (tipos.length < 2) return '';
      return tipos.map(([label, quantidade]) => `${quantidade}× ${label}`).join(' · ');
    }

    /**
     * Reaplica nas dobras a escolha que o professor já fez. O painel se redesenha
     * sozinho a cada leitura do servidor, e sem isto o que ele abriu fecharia no
     * poll seguinte. O `open` do markup vale enquanto ele não tocar na alça;
     * depois, quem manda é a escolha dele (é o mesmo objeto que o `toggle`
     * alimenta).
     */
    function aplicarDobras() {
      for (const fold of document.querySelectorAll('[data-fold-key]')) {
        const escolha = state.folds.get(fold.dataset.foldKey);
        if (escolha !== undefined) fold.open = escolha;
      }
    }

    // `toggle` não borbulha: o listener é de captura no documento. Guarda a
    // escolha do professor em cada dobra do painel, para o próximo redesenho
    // devolvê-la do jeito que ele deixou.
    document.addEventListener('toggle', (event) => {
      const fold = event.target instanceof Element ? event.target.closest('[data-fold-key]') : null;
      if (fold) state.folds.set(fold.dataset.foldKey, fold.open);
    }, true);

    function renderLessons() {
      const list = $('[data-arena-lesson-list]');
      if (!state.lessons.length) {
        list.innerHTML = '<p class="arena-empty">Nenhuma aula no catalogo.</p>';
        return;
      }
      const hasRoom = Boolean(state.selectedRoomId);
      list.innerHTML = state.lessons.map((lesson) => `
        <article class="arena-lesson-card">
          <div class="arena-lesson-head">
            <span class="arena-lesson-icon">${lesson.icon || '📚'}</span>
            <div>
              <strong>${esc(lesson.title)}</strong>
              <small>${esc(lesson.focus)}</small>
            </div>
          </div>
          <details class="arena-round-fold arena-lesson-fold" data-fold-key="aula:${esc(lesson.id)}">
            <summary>${esc(lessonResumo(lesson))}</summary>
            ${lessonMix(lesson) ? `<p class="arena-lesson-mix">${esc(lessonMix(lesson))}</p>` : ''}
            <ul class="arena-lesson-chips">
              ${lesson.challenges.map((challenge) => `<li>${esc(challenge.title)} · ${MODALITY_LABELS[challenge.modality] || challenge.modality}</li>`).join('')}
            </ul>
          </details>
          <div class="arena-lesson-actions">
            <button type="button" class="figma-cta figma-cta-blue" data-action="add-lesson-room" data-lesson="${esc(lesson.id)}" ${hasRoom ? '' : 'disabled'}>Adicionar a sala</button>
            <button type="button" class="figma-cta" data-action="add-lesson-bank" data-lesson="${esc(lesson.id)}">So criar no banco</button>
          </div>
          <p class="form-message" data-lesson-message="${esc(lesson.id)}"></p>
        </article>`).join('');
      aplicarDobras();
    }

    async function addLesson(lessonId, roomId) {
      await adminApi('arena_add_lesson', { lesson_id: lessonId, ...(roomId ? { room_id: roomId } : {}) });
      await refreshChallenges();
      if (roomId) await refreshDetail(roomId);
      if (state.selectedRoomId) await refreshDetail(state.selectedRoomId);
    }


    function renderChallenges() {
      const list = $('[data-arena-challenge-list]');
      if (!state.challenges.length) {
        list.innerHTML = '<p class="arena-empty">Nenhum desafio ainda. Crie o primeiro!</p>';
        return;
      }
      list.innerHTML = state.challenges.map((challenge) => `
        <article class="arena-challenge-card">
          <div class="arena-challenge-head">
            <span class="arena-status-badge is-${esc(challenge.modality)}">${MODALITY_LABELS[challenge.modality] || challenge.modality}</span>
            <strong>${esc(challenge.title)}</strong>
            <small>${esc(challenge.category)}${challenge.duration_seconds ? ` · ${formatSeconds(challenge.duration_seconds)}` : ' · sem cronômetro'}${challenge.attempts > 1 ? ` · ${challenge.attempts} tentativas` : ''}</small>
          </div>
          <p>${esc(challenge.mission).slice(0, 140)}${challenge.mission.length > 140 ? '…' : ''}</p>
          <div class="arena-challenge-criteria">
            ${(challenge.criteria || []).map((entry) => `<span>${CRITERION_LABELS[entry.criterion] || entry.criterion} ${entry.weight}%</span>`).join('')}
          </div>
          <div class="arena-challenge-actions">
            <button type="button" data-action="edit" data-id="${esc(challenge.id)}">Editar</button>
            <button type="button" data-action="duplicate" data-id="${esc(challenge.id)}">Duplicar</button>
            <button type="button" data-action="delete" data-id="${esc(challenge.id)}" class="is-danger">Excluir</button>
          </div>
        </article>`).join('');
    }

    async function refreshDetail(roomId) {
      const data = await adminApi('arena_room_detail', { room_id: roomId });
      renderDetail(data.detail);
      renderReport(data.detail);
      state.detailKey = renderKey(data.detail);
      state.selectedRoomId = roomId;
      renderLessons();
      scheduleDetailPoll(roomId);
    }

    function refreshDetailQuiet(roomId) {
      return state.detailGate.run(() => readDetail(roomId));
    }

    async function readDetail(roomId) {
      try {
        const data = await adminApi('arena_room_detail', { room_id: roomId });
        // Resposta atrasada da sala anterior: o professor ja trocou de detalhe
        // (ou saiu do painel) enquanto esta leitura estava em voo.
        if (state.selectedRoomId !== roomId) return;
        state.lastDetailFetch = Date.now();
        // Com um dialogo aberto (corrigir, tempos, tela unica), a releitura nao
        // redesenha o fundo: o professor esta no dialogo, e redesenhar por baixo
        // troca os botoes do detalhe no exato instante do clique — um deles some
        // da tela em vez de responder.
        if ($('[data-arena-dialog]')?.open) return;
        // Nada visivel mudou: redesenhar so trocaria os nos do DOM (e o foco de
        // quem esta com o teclado) para mostrar exatamente a mesma tela.
        const key = renderKey(data.detail);
        if (key === state.detailKey) return;
        state.detailKey = key;
        const saved = captureViewState();
        renderDetail(data.detail);
        renderReport(data.detail);
        restoreViewState(saved);
      } catch (error) {
        if (error.status === 404) {
          // Sala removida em outro lugar: fecha o detalhe e para o poll,
          // em vez de consultar uma sala que nao existe mais (404 em loop).
          if (state.detailPoll) window.clearInterval(state.detailPoll);
          state.detailPoll = null;
          if (state.sseOff) { state.sseOff(); state.sseOff = null; }
          state.selectedRoomId = null;
          const detail = $('[data-arena-detail]');
          if (detail) detail.hidden = true;
          refreshAll();
        }
        /* outros erros: mantem a ultima renderizacao */
      }
    }

    function scheduleDetailPoll(roomId) {
      if (state.detailPoll) window.clearInterval(state.detailPoll);
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      // A conexao e da sala aberta: o servidor so entrega o que esta sala
      // provou poder seguir. A pergunta que sobra aqui e do professor — se ele
      // ja trocou de detalhe enquanto o evento chegava.
      state.sseOff = subscribeRoomEvents(() => {
        if (state.selectedRoomId === roomId) refreshDetailQuiet(roomId);
      }, eventsQuery(roomId));
      state.detailPoll = window.setInterval(() => {
        if (state.selectedRoomId !== roomId) return;
        if (!state.hiddenClock()) return;
        // Com SSE ativo, o poll vira batimento cardiaco: so consulta se nada chegou a tempo.
        if (roomEventsAlive && Date.now() - state.lastDetailFetch < 6000) return;
        refreshDetailQuiet(roomId);
      }, 3000);
    }

    // Aba oculta nao consulta; ao voltar, uma leitura imediata do detalhe aberto.
    onVisibleResume(() => {
      if (state.selectedRoomId) refreshDetailQuiet(state.selectedRoomId);
    });

    /**
     * Sorteio da vez: quem entra em campo agora. "Livre" sorteia sempre da
     * turma inteira (o vencedor continua concorrendo); "mata-mata" so volta a
     * sortear entre quem venceu. O estado vive no servidor: recarregar a pagina
     * no meio da aula nao perde o sorteio, e outro aparelho ve o mesmo.
     */
    function drawPanel(draw) {
      if (!draw || !draw.counts) return '';
      const total = Number(draw.counts.total || 0);
      const eligible = Number(draw.counts.eligible || 0);
      const current = draw.current;
      const champion = draw.champion;
      const knockout = draw.mode === 'mata-mata';
      const round = Number(draw.round) || 1;
      // Na primeira rodada o balaio e a turma inteira (ninguem venceu nada ainda);
      // da segunda em diante, so vencedores.
      const poolLabel = knockout
        ? (round > 1 ? (eligible === 1 ? 'vencedor na disputa' : 'vencedores na disputa') : 'na disputa')
        : 'no sorteio';
      // Com campeao, o balaio nao tem mais nada a dizer: dizer "0 na disputa"
      // era confuso (parecia um erro). A linha diz o que aconteceu.
      const progress = champion
        ? 'sorteio encerrado'
        : `${round > 1 && knockout ? `Rodada ${round} · ` : ''}<b>${eligible}</b> ${poolLabel}`;
      // O numero do botao vem do servidor: no mata-mata o grupo pode encolher
      // para nao sobrar um sozinho (4 pessoas com grupos de 3 viram 2 + 2).
      const nextCount = Math.max(2, Number(draw.next_size) || Number(draw.group_size) || 3);
      const history = draw.history || [];
      const notDrawn = (draw.eligible || []).filter((entry) => !entry.plays).map((entry) => entry.name);
      const alreadyDrawn = (draw.eligible || []).filter((entry) => entry.plays > 0)
        .map((entry) => `${entry.name}${entry.plays > 1 ? ` ${entry.plays}×` : ''}`);
      return `
        <section class="arena-draw" data-arena-draw>
          <div class="arena-draw-head">
            <h3>🎲 Sorteio da vez</h3>
            <span class="arena-draw-count">${total} na sala · ${progress}</span>
          </div>
          <div class="arena-draw-setup">
            <div class="arena-draw-modes" role="group" aria-label="Modelo do sorteio">
              ${DRAW_MODE_OPTIONS.map(([key, label]) => `
                <button type="button" class="arena-draw-mode${draw.mode === key ? ' is-on' : ''}" data-action="draw-mode" data-mode="${esc(key)}" title="${esc(label)}" aria-pressed="${draw.mode === key ? 'true' : 'false'}">
                  <b>${esc(label)}</b>
                </button>`).join('')}
            </div>
            <label class="arena-draw-size"><span>Quantos por vez</span>
              <input type="number" min="2" max="10" step="1" value="${Number(draw.group_size) || 3}" data-draw-size data-draw-mode="${esc(draw.mode)}">
            </label>
            ${draw.started ? '<button type="button" class="arena-draw-reset" data-action="draw-reset">↺ Recomeçar</button>' : ''}
          </div>
          <p class="arena-draw-hint">${esc(draw.mode_hint || '')}</p>
          ${current ? `
            <div class="arena-draw-current">
              <p class="arena-draw-lead">Rodada ${round} · vez de <b>${current.ids.length}</b> — quem venceu esta disputa?</p>
              <ul class="arena-draw-names">${current.names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul>
              <div class="arena-draw-pick">
                ${current.ids.map((id, index) => `<button type="button" data-action="draw-winner" data-pid="${esc(id)}">🏆 ${esc(current.names[index])}</button>`).join('')}
              </div>
              <button type="button" class="arena-draw-again" data-action="draw-next">🎲 Sortear de novo</button>
            </div>` : ''}
          ${champion ? `
            <div class="arena-draw-champion">
              <span>🏆 CAMPEÃO DO SORTEIO</span>
              <strong>${esc(champion.name)}</strong>
              <small>Recomece para jogar outra vez.</small>
            </div>` : ''}
          ${!current && !champion ? `
            <button type="button" class="figma-cta figma-cta-blue arena-draw-cta" data-action="draw-next"${draw.can_draw ? '' : ' disabled'}>🎲 Sortear ${nextCount}</button>
            ${draw.can_draw && !knockout && notDrawn.length ? `<p class="arena-draw-fair">Ainda não foram sorteados: <b>${notDrawn.length}</b>${alreadyDrawn.length ? ` · já jogaram: ${esc(alreadyDrawn.join(' · '))}` : ''}</p>` : ''}` : ''}
          ${!current && !draw.can_draw ? `<p class="arena-draw-blocked">${esc(draw.cannot_reason || '')}</p>` : ''}
          ${history.length ? `
            <details class="arena-draw-history">
              <summary>Histórico — ${history.length} ${history.length === 1 ? 'disputa' : 'disputas'}</summary>
              <ol>
                ${history.map((entry) => `<li>
                  <span>R${Number(entry.round) || 1}</span>
                  <strong>${entry.names.map((name) => esc(name)).join(' · ')}</strong>
                  <em>${entry.bye ? 'passou direto' : `🏆 ${esc(entry.winner_name || '')}`}</em>
                </li>`).join('')}
              </ol>
              ${draw.eliminated?.length ? `<p class="arena-draw-out">Fora do jogo: ${draw.eliminated.map((entry) => `${esc(entry.name)}${entry.round ? ` (R${entry.round})` : ''}`).join(' · ')}</p>` : ''}
            </details>` : ''}
        </section>`;
    }

    /**
     * MODO ARENA no painel do professor.
     *
     * Duas coisas que ele precisa ver de relance: como está a vida do Juiz e
     * qual é a PRÓXIMA ação. Um botão principal por fase — nada de mural de
     * configuração no meio da aula (o que é ajuste fica recolhido embaixo).
     */
    function arenaPanel(arena, room) {
      if (!arena?.enabled) return '';
      const phase = arena.phase;
      const boss = arena.boss || {};
      const wildcard = arena.wildcard;
      const dynamic = arena.dynamic;
      const result = dynamic?.result;
      const competitors = arena.competitors || [];
      const submitted = Number(arena.submitted || 0);
      const rosterSize = Number(arena.roster_size || 0);
      const canDraw = Boolean(arena.can_draw);
      const attacksLeft = Number(arena.attacks_left || 0);
      const powers = arena.energy?.powers || [];

      const competitorCards = competitors.length
        ? `<ol class="arena-mode-field">
            ${competitors.map((entry) => `<li>
              <span class="arena-mode-slot">${esc(entry.slot)}</span>
              <div>
                <strong>${esc(entry.name)}</strong>
                ${entry.source === 'wildcard' ? '<em class="arena-mode-tag">Wild Card</em>' : ''}
                <p class="arena-mode-field-prompt">${esc((arena.prompt_of?.[entry.id] || 'sem prompt enviado').slice(0, 260))}${(arena.prompt_of?.[entry.id] || '').length > 260 ? '…' : ''}</p>
              </div>
            </li>`).join('')}
          </ol>`
        : `<p class="arena-mode-hint">${submitted >= 3
            ? `${submitted} prompts enviados — sorteie os 3 competidores quando a turma terminar de escrever.`
            : `Esperando os prompts da turma: ${submitted} de ${rosterSize} enviados.`}</p>`;

      let actionArea = '';
      if (phase === 'mission') {
        actionArea = '<p class="arena-mode-next">Encerre a missão para abrir o sorteio.</p>';
      } else if (phase === 'select' || (phase !== 'wildcard' && phase !== 'dynamic' && phase !== 'reveal' && !competitors.length)) {
        actionArea = `<button type="button" class="figma-cta figma-cta-blue" data-action="arena-draw"${canDraw ? '' : ' disabled'}>🎲 Sortear os competidores</button>`;
      }

      if (wildcard && !wildcard.revealed) {
        actionArea = `
          <div class="arena-mode-wildcard">
            <span class="arena-mode-wildcard-head">🎲 WILD CARD — a turma escolhe quem entra (${Number(wildcard.votes || 0)} ${Number(wildcard.votes || 0) === 1 ? 'voto' : 'votos'})</span>
            <ol>
              ${wildcard.options.map((option) => `<li>
                <b>${esc(option.key)}</b>
                <span>${esc(String(option.prompt || '').slice(0, 200))}${String(option.prompt || '').length > 200 ? '…' : ''}</span>
                <em>${Number(option.votes || 0)}</em>
              </li>`).join('')}
            </ol>
            ${wildcard.revealed ? '' : '<p class="arena-mode-hint">Os nomes só aparecem depois da votação — é o que impede o voto de virar popularidade.</p>'}
            <button type="button" class="figma-cta figma-cta-blue" data-action="arena-wildcard-close">✔ Fechar o Wild Card</button>
          </div>`;
      }

      if (dynamic && !dynamic.revealed) {
        actionArea = `
          <div class="arena-mode-dynamic">
            <span class="arena-mode-dynamic-head">⚔️ ${esc(dynamic.label || '')} — votação aberta${dynamic.first_total ? ` · ${Number(dynamic.first_total)} votaram antes da pista` : ''}</span>
            <h4>${esc(dynamic.question)}</h4>
            ${dynamic.hint ? `<p class="arena-mode-hint">Informação revelada: ${esc(dynamic.hint)}</p>` : ''}
            ${dynamic.prompt ? `<blockquote class="arena-mode-dynamic-prompt">${esc(String(dynamic.prompt).slice(0, 300))}${String(dynamic.prompt).length > 300 ? '…' : ''}</blockquote>` : ''}
            <ul class="arena-mode-dynamic-options">${(dynamic.options || []).map((option) => `<li><b>${esc(arenaOptionKey(option))}</b>${esc(arenaOptionLabel(option))}</li>`).join('')}</ul>
            <button type="button" class="figma-cta figma-cta-blue" data-action="arena-dynamic-close">📣 Revelar o resultado</button>
          </div>`;
      }

      if (dynamic && dynamic.revealed && result) {
        actionArea = `
          <div class="arena-mode-attack${result.damaged ? ' is-damage' : ' is-resist'}">
            <strong>${result.damaged ? 'DANO NO JUIZ! −1 ❤️' : 'O JUIZ RESISTIU.'}</strong>
            <span>${Number(result.accuracy || 0)}% acertaram · ${Number(result.correct || 0)} de ${Number(result.total || 0)}${result.needed ? ` · precisava de ${result.needed}` : ''}</span>
            ${result.energy_gained ? `<span>⚡ +${Number(result.energy_gained)} de energia${result.powers_unlocked?.length ? ` · poder desbloqueado: ${result.powers_unlocked.map((key) => esc(ARENA_POWER_GLYPHS[key] || key)).join(' ')}` : ''}</span>` : ''}
          </div>
          ${attacksLeft > 0 && !boss.defeated ? `<div class="arena-mode-next-attack">
            <span>Ainda cabe ${attacksLeft === 1 ? 'um ataque' : `${attacksLeft} ataques`} nesta rodada:</span>
            <div class="arena-mode-dynamics">
              ${(arena.dynamic_catalog || []).filter((entry) => entry.attacks).map((entry) => `<button type="button" data-action="arena-dynamic-open" data-dynamic="${esc(entry.key)}" title="${esc(entry.teach || '')}">${esc(entry.label)}</button>`).join('')}
            </div>
          </div>` : ''}
          <div class="arena-mode-advance">
            <button type="button" class="figma-cta figma-cta-blue" data-action="arena-next">${boss.defeated ? '🏆 Encerrar a partida' : 'Próxima rodada →'}</button>
          </div>`;
      }

      if (phase === 'arena' && competitors.length) {
        actionArea = `
          ${actionArea}
          <div class="arena-mode-next-attack">
            <span>Enquanto o Juiz avalia, a turma joga:</span>
            <div class="arena-mode-dynamics">
              ${(arena.dynamic_catalog || []).map((entry) => `<button type="button" data-action="arena-dynamic-open" data-dynamic="${esc(entry.key)}" title="${esc(entry.teach || '')}">${entry.attacks ? '⚔️ ' : ''}${esc(entry.label)}</button>`).join('')}
            </div>
          </div>`;
      }

      const attacks = arena.attacks_summary || [];
      const teamRosters = (arena.team_rosters || []).filter((team) => team.members.length);
      const notes = arena.power_notes || [];

      return `
        <section class="arena-mode-panel" data-arena-mode-panel>
          <div class="arena-mode-head">
            <div>
              <span class="arena-mode-kicker">ARENA — TURMA VS. JUIZ</span>
              <h3>Rodada ${Number(arena.round)} de ${Number(arena.rounds)} · ${esc(ARENA_PHASE_LABELS_UI[phase] || phase)}</h3>
              <small class="arena-mode-rotation">${Number(arena.competed_count || 0)} de ${rosterSize} alunos já passaram pela Arena</small>
            </div>
            <button type="button" class="ghost-link" data-action="arena-reset" title="Recomeçar do zero">↺ Recomeçar partida</button>
          </div>

          <!-- Os tres numeros da partida (Juiz, energia e acerto) subiram para a
               faixa de indicadores do cartao da sala. Aqui eles apareciam uma
               SEGUNDA vez, poucos pixels abaixo, e o mesmo numero dito duas
               vezes na mesma tela nao informa nada. O que so existia aqui —
               poderes disponiveis e ataques da rodada — fica nesta linha. -->
          <p class="arena-mode-round-context">
            <span><b>${powers.filter((power) => power.unlocked && !power.used).length}</b> poder(es) disponível(is)</span>
            <span>${attacksLeft} de ${Number(arena.config?.attacksPerRound || 0)} ataques nesta rodada</span>
            <span>DANO <b>${Number(arena.threshold)}% de acerto</b></span>
          </p>

          ${competitors.length ? competitorCards : ''}
          ${actionArea}
          ${!competitors.length && phase !== 'mission' ? competitorCards : ''}

          ${notes.length ? `<div class="arena-mode-notes">
            <span>Poderes usados</span>
            ${notes.map((note) => `<p><b>${esc(ARENA_POWER_GLYPHS[note.power] || '')} ${esc(note.label)}</b> ${esc(note.text)}</p>`).join('')}
          </div>` : ''}

          ${attacks.length ? `<ol class="arena-mode-attacks">
            ${attacks.map((attack) => `<li class="${attack.damaged ? 'is-damage' : ''}">
              <span>R${Number(attack.round)}</span>
              <strong>${esc(attack.dynamic_label)}</strong>
              <em>${Number(attack.accuracy)}% ${attack.damaged ? '−1 ❤️' : 'resistiu'}</em>
            </li>`).join('')}
          </ol>` : ''}

          ${arena.awards ? `<div class="arena-mode-awards">
            <strong>${esc(arena.awards.collective)}</strong>
            <ul>
              ${arena.awards.champion ? `<li>🏆 Campeão da Arena <b>${esc(arena.awards.champion.name)}</b> <em>${Math.round(Number(arena.awards.champion.value || 0))}%</em></li>` : ''}
              ${arena.awards.analyst ? `<li>🧠 Melhor Analista <b>${esc(arena.awards.analyst.name)}</b> <em>${Number(arena.awards.analyst.value || 0)} acertos</em></li>` : ''}
              ${arena.awards.calibration ? `<li>🎯 Mestre da Calibração <b>${esc(arena.awards.calibration.name)}</b> <em>${Math.round(Number(arena.awards.calibration.value || 0) * 100)}%</em></li>` : ''}
              ${arena.awards.evolution ? `<li>📈 Maior Evolução <b>${esc(arena.awards.evolution.name)}</b> <em>+${Math.round(Number(arena.awards.evolution.value || 0))}%</em></li>` : ''}
            </ul>
          </div>` : ''}

          <details class="arena-mode-config">
            <summary>⚙ Configuração da partida</summary>
            <div class="arena-mode-config-grid">
              <label>Rodadas<input type="number" min="1" max="6" value="${Number(arena.config?.rounds || 3)}" data-arena-config="rounds"></label>
              <label>Corações do Juiz<input type="number" min="1" max="10" value="${Number(arena.config?.bossMaxHealth || 5)}" data-arena-config="boss_max_health"></label>
              <label>% para causar dano<input type="number" min="5" max="100" value="${Number(arena.threshold)}" data-arena-config="damage_threshold"></label>
              <label>Ataques por rodada<input type="number" min="1" max="3" value="${Number(arena.config?.attacksPerRound || 2)}" data-arena-config="attacks_per_round"></label>
              <label class="is-check"><input type="checkbox" data-arena-config="teams"${arena.config?.teams ? ' checked' : ''}> Times temporários</label>
              <label class="is-check"><input type="checkbox" data-arena-config="powers"${arena.config?.powers ? ' checked' : ''}> Poderes da turma</label>
            </div>
            <div class="arena-mode-config-actions">
              <button type="button" class="figma-cta figma-cta-blue" data-action="arena-config">Salvar configuração</button>
              <button type="button" data-action="arena-teams">🎲 Reorganizar os times</button>
            </div>
            <p class="arena-mode-hint">Mudanças só valem numa partida nova.</p>
            ${teamRosters.length ? `<div class="arena-mode-teams">
              ${teamRosters.map((team) => `<div><span>${team.glyph} ${esc(team.name)}</span><p>${team.members.map((member) => esc(member.name)).join(' · ')}</p></div>`).join('')}
            </div>` : ''}
            ${arena.energy?.powers?.length && phase !== 'finished' ? `<div class="arena-mode-powers">
              ${arena.energy.powers.map((power) => `<button type="button" data-action="arena-power" data-power="${esc(power.key)}"${power.unlocked && !power.used ? '' : ' disabled'} title="${esc(power.hint)}">${esc(ARENA_POWER_GLYPHS[power.key] || '')} ${esc(power.label)}${power.used ? ' (usado)' : power.unlocked ? '' : ` — ${power.at}⚡`}</button>`).join('')}
            </div>` : ''}
          </details>
        </section>`;
    }

    // Marcas que identificam um controle de forma estavel — as mesmas que os
    // cliques ja usam. Sem elas nao ha como reancorar o foco depois do desenho.
    const CONTROL_ATTRS = ['data-action', 'data-id', 'data-fold-key', 'data-dynamic', 'data-challenge-id', 'data-room-id', 'data-participant-id', 'name'];

    function controlSelector(node) {
      if (!node || !node.tagName || node === document.body) return null;
      const parts = CONTROL_ATTRS
        .filter((attr) => node.hasAttribute(attr))
        .map((attr) => `[${attr}="${String(node.getAttribute(attr)).replace(/(["\\])/g, '\\$1')}"]`);
      return parts.length ? `${node.tagName.toLowerCase()}${parts.join('')}` : null;
    }

    /**
     * O corpo do detalhe e do relatorio sao substituidos por markup inteiro. O
     * que a pessoa tinha em maos — foco, selecao, texto digitado e rolagem —
     * vive nos nos antigos: guardar antes e devolver depois e o que impede a
     * releitura ao vivo de tirar o controle de baixo do professor.
     */
    function captureViewState() {
      const active = document.activeElement;
      const selector = controlSelector(active);
      const isField = Boolean(active) && typeof active.value === 'string'
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      return {
        selector,
        scrollY: window.scrollY,
        field: isField
          ? { value: active.value, start: active.selectionStart ?? null, end: active.selectionEnd ?? null }
          : null,
      };
    }

    function restoreViewState(saved) {
      if (!saved?.selector) return;
      const again = document.querySelector(saved.selector);
      if (!again) return;
      if (saved.field && typeof again.value === 'string' && again.value !== saved.field.value) {
        again.value = saved.field.value;
      }
      if (saved.field && saved.field.start !== null && typeof again.setSelectionRange === 'function') {
        try { again.setSelectionRange(saved.field.start, saved.field.end); } catch { /* campo sem selecao */ }
      }
      if (typeof again.focus === 'function') again.focus({ preventScroll: true });
      if (saved.scrollY) window.scrollTo(0, saved.scrollY);
    }

    // ------------------------------------------------------------------
    // Quem enviou e ainda não tem nota
    // ------------------------------------------------------------------
    //
    // O `waiting` do detalhe é o BANCO (submissão sem linha em `arena_scores`)
    // cruzado com o relógio do pátio, que vive no processo. O que a tela
    // acrescenta é a DECISÃO de quem está dando aula: a nota volta sozinha ou
    // depende de alguém? Sem essa resposta, "sem nota" só diz que algo deu
    // errado — e não se espera, se pede novo envio ao aluno ou se chama quem
    // opera o servidor.
    const esperaEmTexto = (segundos) => {
      const total = Math.max(0, Math.round(Number(segundos) || 0));
      if (total < 60) return `${total} s`;
      const minutos = Math.floor(total / 60);
      if (minutos < 60) return `${minutos} min`;
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;
      return resto ? `${horas} h ${resto} min` : `${horas} h`;
    };

    const ESPERA_ESTADOS = {
      avaliando: {
        classe: 'is-avaliando',
        rotulo: '⚙️ avaliando agora',
        nota: () => 'sendo avaliada neste instante',
      },
      na_fila: {
        classe: 'is-na-fila',
        rotulo: '⏳ na fila',
        nota: (item) => (Number.isFinite(item.next_retry_seconds)
          ? `nova tentativa em ${esperaEmTexto(item.next_retry_seconds)}`
          : 'nova tentativa em instantes'),
      },
      vai_retomar: {
        classe: 'is-vai-retomar',
        rotulo: '🔄 volta sozinha',
        nota: () => 'a recuperação automática retoma esta avaliação',
      },
      esgotada: {
        classe: 'is-esgotada',
        rotulo: '⛔ não volta sozinha',
        nota: () => 'as tentativas automáticas se esgotaram: a nota depende de novo envio',
      },
      encerrada: {
        classe: 'is-encerrada',
        rotulo: '⛔ sala encerrada',
        nota: () => 'a aula não está mais em andamento: a recuperação automática não a retoma',
      },
      fora_da_janela: {
        classe: 'is-fora-da-janela',
        rotulo: '⛔ fora do prazo',
        nota: () => 'o envio é mais antigo que a janela de recuperação',
      },
    };
    // Oito linhas cobrem a sala inteira em uso normal; acima disso a lista vira
    // rolagem e o que importa (há quantos e se voltam) já está no cabeçalho.
    const LIMITE_ESPERA_LISTADA = 8;

    function blocoDeEspera(waiting, participantes = []) {
      const itens = Array.isArray(waiting?.items) ? waiting.items : [];
      if (!itens.length) return '';
      const semVolta = itens.filter((item) => ['esgotada', 'encerrada', 'fora_da_janela'].includes(item.state)).length;
      const aCaminho = itens.length - semVolta;
      const nomeDe = (item) => item.participant_name
        || participantes.find((entry) => String(entry.id) === String(item.participant_id))?.name
        || 'Participante';
      const linhas = itens.slice(0, LIMITE_ESPERA_LISTADA).map((item) => {
        const estado = ESPERA_ESTADOS[item.state] || { classe: '', rotulo: '⏳ sem nota', nota: () => '' };
        const motivo = item.reason
          ? (rotuloDoMotivo(item.reason) || `motivo não catalogado (${item.reason})`)
          : 'motivo não registrado';
        return `<li class="arena-waiting-item ${estado.classe}">
          <strong>${esc(nomeDe(item))}</strong>
          <span class="arena-waiting-mission">Missão ${esc(String(item.round_position))} — ${esc(item.round_title || '')}</span>
          <span class="arena-waiting-age">há ${esc(esperaEmTexto(item.waiting_seconds))}</span>
          <span class="arena-waiting-state">${estado.rotulo}</span>
          <small class="arena-waiting-note">${esc(estado.nota(item))} · ${esc(motivo)}${item.attempts ? ` · ${esc(String(item.attempts))} tentativa(s)` : ''}</small>
        </li>`;
      }).join('');
      return `<div class="arena-waiting" data-arena-waiting>
        <div class="arena-waiting-head">
          <strong>⏳ ${itens.length} ${itens.length === 1 ? 'envio' : 'envios'} ainda sem nota</strong>
          <span>${semVolta
            ? `${aCaminho} com a nota a caminho · ${semVolta} sem tentativa automática`
            : 'a nota de todos eles chega sozinha — não é preciso reenviar'}</span>
        </div>
        <ul class="arena-waiting-list">${linhas}</ul>
        ${itens.length > LIMITE_ESPERA_LISTADA
          ? `<p class="arena-waiting-more">… e mais ${itens.length - LIMITE_ESPERA_LISTADA} envio(s) sem nota nesta sala.</p>`
          : ''}
      </div>`;
    }

    function renderDetail(detail) {
      const panel = $('[data-arena-detail]');
      panel.hidden = false;
      // Sem o código no título: ele já aparece grande no convite, e o mesmo
      // número escrito duas vezes na mesma tela não informa nada.
      $('[data-arena-detail-title]').textContent = detail.room.title;
      const room = detail.room;
      const roomClassic = isClassicish(room);
      // O selo do estado subiu para o cabecalho, ao lado de "sala em destaque"
      // (LA-06): e o mesmo dado, dito uma vez so. O corpo comeca na linha de
      // numeros e termina nas acoes.
      const estadoSlot = $('[data-arena-detail-state]');
      if (estadoSlot) {
        estadoSlot.textContent = STATUS_LABELS[room.status] || room.status;
        estadoSlot.className = `arena-detail-state is-${esc(room.status)}`;
        estadoSlot.hidden = false;
      }
      const rosterTotal = roomClassic ? (room.expected_players || room.settings?.maxPlayers || 3) : (room.expected_players || detail.participants.filter((p) => p.active).length || 35);
      const activeCount = detail.participants.filter((p) => p.active).length;
      const connectedCount = detail.participants.filter((p) => p.connected).length;
      const startLabel = roomClassic ? 'Iniciar batalha' : 'Iniciar missão';
      const rounds = detail.rounds || [];
      const current = rounds.find((round) => round.status === 'open');
      const results = rounds.find((round) => round.status === 'results');
      // A rodada que a partida esta vivendo: a aberta, ou a que fechou para
      // mostrar as notas. E ela que ocupa o painel da partida (LA-06).
      const rodadaNoAr = current || results || null;
      // So o preset Personalizado escolhe missoes, e so antes de comecar.
      const canEditRounds = !roomClassic && ['draft', 'waiting'].includes(room.status);
      const arena = detail.arena || null;

      const highlightRows = HIGHLIGHT_LABELS.map(([key, icon, label]) => {
        const value = detail.highlights?.[key];
        return value && value.name ? `<span>${icon} ${label}: <b>${esc(value.name)}</b></span>` : '';
      }).filter(Boolean).join('');

      const openSubmitters = new Set((current?.submitters || []).map(String));

      // O convite: código, link, QR e projeção. Na espera ele fica aberto, que é
      // quando ele serve para trazer gente; com a atividade em andamento vai para
      // uma dobra com o PIN na alça — o atrasado entra, e a missão não desce.
      const emAtividade = ['open', 'playing'].includes(room.status);
      // Duas colunas, como a referencia (LA-06): acesso a esquerda — codigo,
      // link, QR e projecao — e partida a direita, com o preset, a regra, a
      // rodada que esta no ar e a acao primaria. Embaixo, na coluna da partida,
      // a faixa de indicadores do modo Arena (so onde esses dados existem).
      const rodadaPausada = rodadaNoAr && rodadaNoAr.paused_at != null && Number.isFinite(Number(rodadaNoAr.paused_at));
      const convite = `
        <div class="arena-cockpit${roomClassic ? ' is-classic' : ''}">
          <div class="arena-cockpit-code arena-detail-access">
            <small>CÓDIGO DA SALA</small>
            <p class="arena-detail-pin"><strong>${esc(formatPin(room.pin || room.code))}</strong></p>
            ${emAtividade ? '' : '<p>Alunos entram com este código.</p>'}
            <div class="arena-cockpit-copy-group">
              <button type="button" class="arena-copy-code" data-action="copy-code" data-code="${esc(room.pin || room.code)}">Copiar código</button>
              <button type="button" class="arena-copy-code arena-copy-link" data-action="copy-link" data-link="${window.location.origin}/play?pin=${encodeURIComponent(room.pin || room.code)}">🔗 Copiar link</button>
            </div>
            <div class="arena-qr-entry" data-qr-entry hidden>
              <small>ACESSO RÁPIDO</small>
              <img class="arena-qr-entry-img" alt="QR code — abrir a tela de entrada dos alunos no celular">
              <span class="arena-qr-entry-url" data-qr-entry-url></span>
            </div>
            <a class="arena-tv-open" href="#" data-action="open-tv">📺 Abrir tela de projeção →</a>
          </div>
          <div class="arena-cockpit-info arena-detail-match">
            <header class="arena-detail-match-head">
              <span class="arena-preset-chip is-${esc(room.preset || '')}">${PRESET_LABELS[room.preset] || (room.preset || 'sala')}</span>
              <span class="arena-detail-seats">${activeCount} de ${rosterTotal} lugares</span>
            </header>
            <div class="arena-cockpit-rules">
              <strong>${esc(rulesSummary(room))}</strong>
            </div>
            ${rodadaNoAr ? `<article class="arena-detail-current is-${esc(rodadaNoAr.status)}">
              <span class="arena-detail-current-kicker">MISSÃO ${rodadaNoAr.position} — ${MODALITY_LABELS[rodadaNoAr.modality] || rodadaNoAr.modality}</span>
              <h4>${esc(rodadaNoAr.title)}</h4>
              <p>${esc(STATUS_LABELS[rodadaNoAr.status] || rodadaNoAr.status)} · ${rodadaPausada
                ? '⏸ pausada'
                : (rodadaNoAr.status === 'open' && rodadaNoAr.deadline_at
                  ? `⏱ <span class="arena-round-countdown" data-round-countdown="${Number(rodadaNoAr.deadline_at)}"></span>`
                  : `⏱ ${esc(roundTimerLabel(rodadaNoAr))}`)}</p>
            </article>` : ''}
            ${['waiting', 'open'].includes(room.status) && rounds.some((round) => round.status === 'pending') ? `
              <div class="arena-cockpit-start arena-detail-start">
                <p>${roomClassic
                  ? (activeCount >= rosterTotal
                    ? 'Sala cheia — todos os lugares preenchidos. É só começar.'
                    : `Aguardando jogadores... <b>${activeCount} / ${rosterTotal}</b>`)
                  : (activeCount
                    ? 'Pode começar quando quiser; quem não entrar até o fim do round é zerado.'
                    : 'Aguardando o primeiro jogador entrar...')}</p>
                <button type="button" class="figma-cta figma-cta-blue arena-start-big" data-action="start"${roomClassic && activeCount < rosterTotal ? ' disabled' : ''}>▶ ${startLabel}</button>
              </div>` : ''}
            ${arena && arena.enabled ? `<div class="arena-detail-stats">
              <article class="arena-stat-card is-boss">
                <small>☠️ JUIZ IA</small>
                <strong>${Number(arena.boss?.health ?? 0)}<i>/${Number(arena.boss?.max_health ?? 0)}</i></strong>
                ${arenaHeartsMarkup(arena)}
                <span>${arena.boss?.defeated ? 'derrotado' : `${Number(arena.boss?.health ?? 0)} de ${Number(arena.boss?.max_health ?? 0)} corações`}</span>
              </article>
              <article class="arena-stat-card is-energy">
                <small>⚡ ENERGIA DA TURMA</small>
                ${arenaEnergyMarkup(arena)}
              </article>
              <article class="arena-stat-card is-accuracy">
                <small>ACERTO DA TURMA</small>
                ${arenaAccuracyMarkup(arena.dynamic && arena.dynamic.result)}
              </article>
            </div>` : ''}
          </div>
        </div>`;

      // A ordem das camadas é a da decisão: primeiro o estado e o que dá para
      // fazer agora, depois o convite (que vira dobra quando a aula já começou) e
      // só então os painéis longos. Antes o convite vinha em cima e empurrava o
      // estado para baixo dele — o botão principal ficava 299px acima do estado
      // que ele muda.
      const blocoConvite = ['waiting', 'open', 'playing'].includes(room.status)
        ? (emAtividade
          ? `<details class="arena-invite-fold" data-fold-key="convite">
          <summary>Convite da sala — <b>${esc(formatPin(room.pin || room.code))}</b></summary>
          ${convite}
        </details>`
          : convite)
        : '';

      $('[data-arena-detail-body]').innerHTML = `
        ${(detail.blockers || []).length ? `<div class="arena-blockers" role="alert">
          <strong>⚠ Esta sala ainda não abre</strong>
          <ul class="arena-blockers-list">
            ${(detail.blockers || []).map((entry) => `<li>
              <strong>Missão ${entry.position} — ${esc(entry.title)}</strong>
              <span>${(entry.missing || []).map((key) => esc(MISSING_LABELS[key] || key)).join(' · ')}</span>
              ${entry.challenge_id ? `<button type="button" class="arena-fix-button" data-action="fix-round" data-challenge-id="${esc(entry.challenge_id)}" data-missing="${esc((entry.missing || []).join(','))}">✎ Corrigir</button>` : ''}
            </li>`).join('')}
          </ul>
          <p><b>Corrigir</b> abre o desafio aqui mesmo, no campo que falta: o <b>gabarito do juiz</b> (nas missões de imagem, o prompt que gerou a imagem) ou a imagem. Missão que não vai ser usada pode sair com <b>Remover da sala</b>.</p>
          <button type="button" class="figma-cta figma-cta-blue arena-fix-all" data-action="fix-all" data-room-id="${esc(room.id)}">✎ Preencher ${(detail.blockers || []).length === 1 ? 'esta missão' : `estas ${(detail.blockers || []).length} missões`} de uma vez</button>
        </div>` : ''}
        <div class="arena-detail-head">
          <p class="arena-detail-meta">
            <span><b>${activeCount}</b> participantes</span>
            <span class="arena-detail-dot" aria-hidden="true">•</span>
            <span><b>${connectedCount}</b> ${connectedCount === 1 ? 'conectado' : 'conectados'}</span>
            ${rodadaNoAr ? `<span class="arena-detail-dot" aria-hidden="true">•</span>
            <span>Rodada <b>${rodadaNoAr.position}</b> de <b>${rounds.length}</b></span>` : ''}
            ${rounds.length ? `<span class="arena-detail-dot" aria-hidden="true">•</span>
            <button type="button" class="arena-timing-chip" data-action="room-timing" data-room-timing title="Quanto tempo cada missão leva: aceite as sugestões ou ajuste antes de abrir a sala.">⏱ ${esc(timingSummary(detail.timing))}<span class="arena-timing-chip-edit">ajustar</span></button>` : ''}
          </p>
          <div class="arena-room-card-actions">
            <a class="arena-preview-open" href="/aluno-preview.php?room=${encodeURIComponent(room.id)}" target="_blank" rel="noopener">👁 Ver como o aluno</a>
            <a class="arena-preview-open is-tv is-primary" href="/tv-preview.php?room=${encodeURIComponent(room.id)}" target="_blank" rel="noopener">📺 Ver na TV</a>
            ${current ? (current.paused_at != null && Number.isFinite(Number(current.paused_at))
              ? '<button type="button" data-action="resume-round">▶ Retomar missão</button>'
              : '<button type="button" data-action="pause-round">⏸ Pausar missão</button>')
              + '<button type="button" data-action="end-round">Encerrar rodada</button>' : ''}
            ${results ? '<button type="button" data-action="close-round">Fechar resultados</button>' : ''}
            ${room.status === 'playing' && !current && !results && rounds.some((round) => round.status === 'pending') ? `<button type="button" data-action="start" class="is-primary">${startLabel}</button>` : ''}
            ${room.status === 'playing' ? '<button type="button" data-action="end-room" class="is-danger">Encerrar sala</button>' : ''}
            <details class="arena-admin-tools" data-fold-key="gerenciar">
              <summary>Gerenciar sala</summary>
              <div>
              <button type="button" data-action="room-edit">Editar sala</button>
              <button type="button" data-action="room-block">${room.entry_blocked ? 'Liberar entrada' : 'Bloquear entrada'}</button>
            ${room.status === 'ended' ? '<button type="button" data-action="archive">Arquivar</button>' : ''}
            ${['draft', 'waiting'].includes(room.status) ? '<button type="button" data-action="delete" class="is-danger">Excluir sala</button>' : ''}
              </div>
            </details>
          </div>
        </div>

        ${blocoConvite}

        ${blocoDeEspera(detail.waiting, detail.participants)}

        ${highlightRows ? `<div class="arena-detail-highlights">${highlightRows}</div>` : ''}

        ${arenaPanel(detail.arena, room)}

        ${drawPanel(detail.draw)}

        <details class="arena-fold-block" data-fold-key="participantes"${['draft', 'waiting', 'open'].includes(room.status) ? ' open' : ''}>
          <summary><h3>Participantes</h3></summary>
          <div class="arena-table-wrap">
          <table class="arena-table">
            <thead><tr><th>Nome</th><th>Status</th>${current ? '<th>Missao atual</th>' : ''}<th>Entrou</th><th></th></tr></thead>
            <tbody>
              ${detail.participants.map((participant) => `
                <tr class="${participant.active ? '' : 'is-inactive'}">
                  <td><strong>${esc(participant.name)}</strong></td>
                  <td>${participant.active ? (participant.connected ? '🟢 online' : '🟡 ausente') : '🚫 removido'}</td>
                  ${current ? `<td>${participant.active && openSubmitters.has(String(participant.id)) ? '<span class="arena-mission-done">✅ enviou</span>' : '<span class="arena-mission-waiting">⏳ escrevendo</span>'}</td>` : ''}
                  <td>${new Date(Number(participant.joined_at) * 1000).toLocaleTimeString('pt-BR')}</td>
                  <td>
                    ${participant.active ? `<button type="button" data-action="rename-participant" data-pid="${esc(participant.id)}">Renomear</button> <button type="button" data-action="remove-participant" data-pid="${esc(participant.id)}" class="is-danger">Remover</button>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </details>

        <div class="arena-detail-section-head">
          <h3>Missões</h3>
          ${['draft', 'waiting'].includes(room.status) ? '<button type="button" data-action="add-round">+ Adicionar missão</button>' : ''}
        </div>
        ${rounds.length ? `<div class="arena-rounds-grid">${rounds.map((round, roundIndex) => `
          <article class="arena-round-card is-${esc(round.status)}${round.paused_at != null && Number.isFinite(Number(round.paused_at)) ? ' is-paused' : ''}" data-round-id="${esc(round.id)}">
            <div class="arena-round-row">
            ${round.reference_image || (round.missing || []).includes('imagem') ? `<div class="arena-round-preview">
              ${round.reference_image
                ? `<img src="${esc(round.reference_image)}" alt="Imagem que o aluno vai ver nesta missão" loading="lazy">`
                : '<span class="arena-round-preview-empty">FALTA IMAGEM</span>'}
            </div>` : ''}
            <span class="arena-round-num" aria-hidden="true">${round.position}</span>
            <div class="arena-round-head">
              <h4 class="arena-round-title">${esc(round.title)}</h4>
              <p class="arena-round-meta">
                <span class="arena-status-badge is-${esc(round.status)}">${round.paused_at != null && Number.isFinite(Number(round.paused_at)) ? 'PAUSADA' : STATUS_LABELS[round.status] || round.status}</span>
                <span class="arena-round-kicker">MISSAO ${round.position} — ${MODALITY_LABELS[round.modality] || round.modality}</span>
                <span class="arena-round-timer${Number(round.duration_seconds) > 0 ? '' : ' is-untimed'}" data-round-timer title="${Number(round.duration_seconds) > 0 ? 'Cronômetro desta missão' : 'Sem cronômetro: a rodada termina quando você encerrar'}">⏱ ${esc(roundTimerLabel(round))}</span>
                ${(round.missing || []).length ? `<span class="arena-round-missing">⚠ ${(round.missing || []).map((key) => MISSING_LABELS[key] || key).join(' · ')}</span>` : ''}
              </p>
            </div>
            ${canEditRounds || (round.missing || []).length ? `<div class="arena-round-manage">
              ${(round.missing || []).length ? `<button type="button" data-action="fix-round" class="is-fix" title="Abrir este desafio em edição, no campo que falta" data-challenge-id="${esc(round.challenge_id)}" data-missing="${esc((round.missing || []).join(','))}">✎ Corrigir</button>` : ''}
              ${canEditRounds ? `<button type="button" data-action="move-round" data-dir="up" ${roundIndex === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
              <button type="button" data-action="move-round" data-dir="down" ${roundIndex === rounds.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>
              <button type="button" data-action="remove-round" class="is-danger">Remover da sala</button>` : ''}
            </div>` : ''}
            </div>
            ${round.mission ? `<details class="arena-round-fold" data-fold-key="missao:${esc(round.id)}">
              <summary>O aluno recebe</summary>
              <p class="arena-round-mission">${esc(round.mission)}</p>
            </details>` : ''}
            ${(round.missing || []).includes('gabarito')
              ? '<div class="arena-round-gabarito is-missing"><span>SEM GABARITO</span><p>Sem ele o juiz só compara com a missão. Use <b>Corrigir</b> abaixo para preencher agora.</p></div>'
              : `<details class="arena-round-fold" data-fold-key="gabarito:${esc(round.id)}">
              <summary>Gabarito do juiz</summary>
              <div class="arena-round-gabarito">
              <p>${esc(round.gabarito_text || '')}</p>
              ${round.reference_text && round.expected_result ? `<p class="is-alt">${esc(round.expected_result)}</p>` : ''}
              </div>
            </details>`}
            <p><b>${round.submitted}</b> envios · <b>${round.scored}</b> avaliados
              ${round.status === 'open'
                ? (round.paused_at != null && Number.isFinite(Number(round.paused_at))
                  ? ' · <span class="arena-round-countdown is-paused">⏸ pausada</span>'
                  : (round.deadline_at ? ` · <span class="arena-round-countdown" data-round-countdown="${Number(round.deadline_at)}"></span>` : ''))
                : (round.deadline_at ? ` · prazo ${new Date(Number(round.deadline_at) * 1000).toLocaleTimeString('pt-BR')}` : '')}</p>
            ${round.judge && round.judge.local
              ? `<p>${round.judge.local} de ${round.judge.total} nota(s) vieram do juiz local (${esc(motivoDoJuizLocal(round.judge.reasons))}).</p>`
              : (round.judge && round.judge.total && round.judge.model
                ? `<p>Notas avaliadas por <b>${esc(round.judge.model)}</b>.</p>`
                : '')}
            ${round.ranking.length ? `<ol class="arena-mini-ranking">${round.ranking.slice(0, 5).map((entry) => `
              <li><span>${entry.position}º</span><strong>${esc(detail.participants.find((p) => p.id === entry.participant_id)?.name || 'Participante')}</strong><em>${Math.round(Number(entry.percent))} pts</em></li>`).join('')}</ol>` : '<p class="arena-empty">Sem pontuação ainda.</p>'}
          </article>`).join('')}</div>` : `<p class="arena-empty">Esta sala ainda não tem missão nenhuma. Use <b>Adicionar missão</b> aqui em cima ou o botão <b>Adicionar à sala</b> em uma aula — o que o aluno vai ver aparece nesta lista, com imagem e gabarito.</p>`}

        <h3>Classificação geral</h3>
        ${(detail.ranking || []).length ? `<ol class="arena-mini-ranking is-evolution">${detail.ranking.map((row) => {
          const evolution = (row.evolution || []).map((entry, index) => {
            const prev = (row.evolution || [])[index - 1];
            const delta = prev ? Math.round(Number(entry.percent) - Number(prev.percent)) : null;
            const deltaLabel = delta === null ? '' : ` <em class="${delta >= 0 ? 'is-positive' : 'is-negative'}">${delta >= 0 ? '+' : ''}${delta}</em>`;
            return `M${entry.position}: ${Math.round(Number(entry.percent))}${deltaLabel}`;
          }).join(' · ');
          return `<li><span>${row.position}º</span><strong>${esc(row.name)}</strong><em>${Number(row.total_points ?? row.points_sum ?? row.avg_percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</em>${evolution ? `<small>${evolution}</small>` : ''}</li>`;
        }).join('')}</ol>` : '<p class="arena-empty">Ainda sem pontuação.</p>'}
      `;
      startAdminCountdown(rounds, Number(detail.server_now));
      aplicarDobras();
      // QR da tela de entrada dos alunos: escaneia no celular e abre /play
      // (PIN + nome continuam digitados, como no Kahoot). Cache por sala para
      // nao re-gerar a cada poll do detalhe.
      if (['waiting', 'open', 'playing'].includes(room.status)) {
        const currentRoomId = state.selectedRoomId;
        const entrySlot = $('[data-qr-entry]');
        if (entrySlot) {
          const cached = state.qrCache && state.qrCache[currentRoomId];
          if (!cached) {
            const playPath = `/play?pin=${encodeURIComponent(room.pin || room.code)}`;
            api('arena_qr', { path: playPath, origin: window.location.origin })
              .then((qr) => {
                state.qrCache = state.qrCache || {};
                state.qrCache[currentRoomId] = qr;
                const slot = $('[data-qr-entry]');
                if (!slot) return;
                slot.hidden = false;
                const img = slot.querySelector('img');
                if (img) img.src = qr.data_url;
                const urlNode = slot.querySelector('[data-qr-entry-url]');
                if (urlNode) urlNode.textContent = qr.url;
              })
              .catch(() => { /* QR nao bloqueia o cockpit */ });
          } else {
            entrySlot.hidden = false;
            const img = entrySlot.querySelector('img');
            if (img && !img.src) img.src = cached.data_url;
            const urlNode = entrySlot.querySelector('[data-qr-entry-url]');
            if (urlNode && !urlNode.textContent) urlNode.textContent = cached.url;
          }
        }
      }
    }

    function renderReport(detail) {
      const panel = $('[data-arena-report-panel]');
      panel.hidden = false;
      const rounds = detail.rounds || [];
      const scoredRounds = rounds.filter((round) => round.ranking && round.ranking.length);
      if (!scoredRounds.length) {
        $('[data-arena-report-body]').innerHTML = '<p class="arena-empty">Os resultados coletivos aparecem após a primeira missão pontuada.</p>';
        return;
      }
      const perRound = scoredRounds.map((round) => {
        const avg = round.ranking.reduce((sum, entry) => sum + Number(entry.percent), 0) / round.ranking.length;
        return { position: round.position, modality: round.modality, title: round.title, avg: Math.round(avg) };
      });
      const criteriaTotals = {};
      let criteriaCount = 0;
      for (const round of scoredRounds) {
        for (const entry of round.ranking) {
          criteriaCount += 1;
          for (const [criterion, points] of Object.entries(entry.breakdown || {})) {
            criteriaTotals[criterion] = (criteriaTotals[criterion] || 0) + Number(points);
          }
        }
      }
      const criteriaAvg = Object.entries(criteriaTotals)
        .map(([criterion, total]) => ({ criterion, avg: total / criteriaCount }))
        .sort((a, b) => b.avg - a.avg);
      // Com todos os critérios na mesma média (uma turma de uma pessoa, por
      // exemplo), a fatia de cima e a de baixo são as MESMAS — e o painel dizia
      // "maior facilidade: Objetivo e Contexto" seguido de "maior dificuldade:
      // Contexto e Objetivo". Empate se anuncia, não se contradiz.
      const melhorMedia = criteriaAvg.length ? criteriaAvg[0].avg : 0;
      const piorMedia = criteriaAvg.length ? criteriaAvg[criteriaAvg.length - 1].avg : 0;
      const empatados = criteriaAvg.length > 1 && Math.abs(melhorMedia - piorMedia) < 0.01;
      const temCriterios = criteriaAvg.length > 0;
      const easiest = criteriaAvg.slice(0, 2);
      const hardest = criteriaAvg.filter((entry) => entry.avg < melhorMedia).slice(-2).reverse();
      $('[data-arena-report-body]').innerHTML = `
        <div class="arena-report-grid">
          <div>
            <h4>Média por missão</h4>
            ${perRound.map((round) => `<div class="arena-report-row"><span>M${round.position} · ${MODALITY_LABELS[round.modality] || round.modality}</span><strong>${round.avg} pts</strong></div>`).join('')}
          </div>
          <div>
            <h4>Média por critério</h4>
            ${criteriaAvg.map((entry) => `<div class="arena-report-row"><span>${CRITERION_LABELS[entry.criterion] || entry.criterion}</span><strong>${Math.round((entry.avg / 20) * 100)}%</strong></div>`).join('')}
          </div>
        </div>
        ${temCriterios ? `<div class="arena-report-insight">
          ${empatados
            ? '<p>📊 Todos os critérios ficaram com a mesma média nesta rodada — não há um ponto mais forte nem mais fraco para destacar.</p>'
            : `<p>🎉 Maior facilidade da turma: <b>${easiest.map((entry) => CRITERION_LABELS[entry.criterion] || entry.criterion).join(' e ')}</b>.</p>
               ${hardest.length ? `<p>📚 Maior dificuldade: <b>${hardest.map((entry) => CRITERION_LABELS[entry.criterion] || entry.criterion).join(' e ')}</b>. Vale reforçar na próxima aula.</p>` : ''}`}
        </div>` : ''}
      `;
    }

    async function roomAction(action, roomId, extra = {}) {
      const mapping = {
        publish: 'arena_publish_room',
        start: 'arena_start_round',
        'end-round': 'arena_end_round',
        'close-round': 'arena_close_round',
        'pause-round': 'arena_pause_round',
        'resume-round': 'arena_resume_round',
        'end-room': 'arena_end_room',
        archive: 'arena_archive_room',
        delete: 'arena_delete_room',
      };
      const name = mapping[action];
      if (!name) return;
      if ((action === 'delete' || action === 'end-room' || action === 'archive') && !window.confirm('Confirmar esta acao?')) return;
      const data = await adminApi(name, { room_id: roomId, ...extra });
      if (data.room && data.room.room) renderDetail(data.room);
      if (action === 'delete') {
        // Fecha o detalhe e para o poll: a sala nao existe mais.
        if (state.detailPoll) window.clearInterval(state.detailPoll);
        state.detailPoll = null;
        if (state.sseOff) { state.sseOff(); state.sseOff = null; }
        state.selectedRoomId = null;
        $('[data-arena-detail]').hidden = true;
      }
      await refreshAll();
    }

    // Contador do seletor de missões da nova sala ("3 missões marcadas").
    function updateMissionCount(form) {
      const node = form?.querySelector('[data-arena-room-missions-count]');
      if (!node) return;
      const total = form.querySelectorAll('input[name="mission_ids"]').length;
      const chosen = form.querySelectorAll('input[name="mission_ids"]:checked').length;
      node.textContent = chosen
        ? `${chosen} ${chosen === 1 ? 'missão marcada' : 'missões marcadas'} — a sala começa com ${chosen === 1 ? 'ela' : 'elas'} nesta ordem.`
        : (total ? 'Nenhuma missão marcada.' : '');
    }

    function openDialog(title, bodyHtml) {
      const dialog = $('[data-arena-dialog]');
      $('[data-arena-dialog-body]').innerHTML = `<h3>${esc(title)}</h3>${bodyHtml}`;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    function closeDialog() {
      const dialog = $('[data-arena-dialog]');
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    /** Imagem escolhida no formulário -> data URL (o que o servidor guarda). */
    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(file);
    });

    /**
     * Aberto a partir do card da missao, o formulario leva o professor ao
     * primeiro campo que falta e pulsa os campos pendentes — sem duvida sobre
     * o que preencher para a sala poder abrir.
     */
    function focusFixFields(fields = []) {
      const order = ['imagem', 'gabarito'].filter((key) => fields.includes(key));
      if (!order.length) return;
      const dialog = $('[data-arena-dialog]');
      window.setTimeout(() => {
        const nodes = [...dialog.querySelectorAll('[data-fix-field]')];
        nodes.forEach((node) => {
          node.classList.add('is-fix-pulse');
          window.setTimeout(() => node.classList.remove('is-fix-pulse'), 2400);
        });
        const first = nodes.find((node) => node.dataset.fixField === order[0]) || nodes[0];
        if (!first) return;
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const input = first.querySelector('input:not([type="hidden"]), textarea, select');
        if (input) {
          try { input.focus({ preventScroll: true }); } catch { input.focus(); }
        }
      }, 40);
    }

    /**
     * Abre o desafio em edicao a partir da sala (card da missao, banner ou
     * dialogo de pendencias), no campo que falta. A sala de origem fica
     * guardada para, ao salvar, o cockpit se atualizar sozinho.
     */
    async function openChallengeFix({ challengeId, missing = [], roomId } = {}) {
      if (!challengeId) return;
      let challenge = state.challenges.find((entry) => String(entry.id) === String(challengeId));
      if (!challenge) {
        await refreshChallenges();
        challenge = state.challenges.find((entry) => String(entry.id) === String(challengeId));
      }
      if (!challenge) {
        alert('Este desafio não está mais no Banco de Desafios. Abra o banco para conferir.');
        return;
      }
      state.fixReturn = roomId || null;
      state.editingChallengeId = challenge.id;
      openDialog(`Corrigir missão — ${challenge.title}`, challengeFormHtml(challenge, { fix: missing }));
      focusFixFields(missing);
    }

    /**
     * Depois de salvar uma correcao vinda da sala: diz se a sala ja pode abrir
     * ou o que ainda falta, com atalho para a proxima pendencia.
     */
    function flashFixNote(roomId, salvas = 0) {
      if (!roomId || state.selectedRoomId !== roomId) return;
      const body = $('[data-arena-detail-body]');
      if (!body) return;
      const next = (state.rooms.find((entry) => entry.id === roomId)?.blockers || [])[0];
      const feito = salvas > 1 ? `${salvas} missões salvas.` : 'Missão salva.';
      const note = document.createElement('div');
      note.className = `arena-fix-flash${next ? '' : ' is-ready'}`;
      note.setAttribute('role', 'status');
      note.innerHTML = next
        ? `<strong>${feito}</strong> Ainda falta <b>Missão ${esc(next.position)} — ${esc(next.title)}</b> · ${(next.missing || []).map((key) => esc(MISSING_LABELS[key] || key)).join(' · ')}${next.challenge_id ? ` <button type="button" data-action="fix-round" data-challenge-id="${esc(next.challenge_id)}" data-missing="${esc((next.missing || []).join(','))}">Corrigir esta</button>` : ''}`
        : `<strong>${feito}</strong> A sala está pronta para abrir.`;
      body.prepend(note);
      window.setTimeout(() => note.remove(), 8000);
    }

    // Dialog de projecao: codigo curto para a TV em outro aparelho + abertura
    // no proprio computador (popup). A URL vai so com o PIN; o codigo e a
    // alternativa para qualquer aparelho, digitado na tela de /tv.php.
    function showProjectionDialog(tv) {
      const rawCode = tv.tv_code || '';
      const prettyCode = formatPin(rawCode) || '——————';
      const origin = window.location.origin;
      openDialog('Projeção da sala', `
        <div class="arena-proj-box">
          <p class="arena-proj-lead">Código de projeção <span>— para a TV</span></p>
          <div class="arena-proj-qr-slot" data-proj-qr></div>
          <div class="arena-proj-code" data-tv-code="${esc(rawCode)}">${esc(prettyCode)}</div>
          <div class="arena-proj-actions">
            <button type="button" class="figma-cta arena-proj-copy" data-copy-tv-code>Copiar código</button>
            <a class="figma-cta figma-cta-blue" href="${esc(tv.url)}" target="_blank" rel="noopener">Abrir neste computador</a>
          </div>
          <p class="arena-proj-hint" data-proj-hint>Escaneie o QR code — ou abra o endereço e digite o código.</p>
        </div>
      `);
      // QR direto com o codigo curto: escanear em outro aparelho projeta sem
      // digitar nada (o codigo vira sessao no cookie do aparelho, 8h).
      if (rawCode) {
        api('arena_qr', { path: `/tv.php?code=${encodeURIComponent(rawCode)}`, origin })
          .then((qr) => {
            const slot = $('[data-proj-qr]');
            if (!slot) return;
            slot.innerHTML = `<img class="arena-proj-qr" src="${qr.data_url}" alt="QR code da projeção da sala"><span class="arena-proj-url">${esc(qr.url)}</span>`;
          })
          .catch(() => {
            // Sem imagem do QR, o endereço continua no MESMO lugar: é ele que a
            // instrução chama de "o endereço". Antes a URL era escrita duas
            // vezes — como texto na instrução e como rótulo do QR —, e uma frase
            // nova de fallback custaria dez palavras ao cliente para dizer o que
            // o próprio endereço já diz.
            const slot = $('[data-proj-qr]');
            if (slot) slot.innerHTML = `<span class="arena-proj-url">${esc(origin + '/tv.php')}</span>`;
          });
      }
      $('[data-copy-tv-code]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(rawCode);
        } catch {
          const field = document.createElement('textarea');
          field.value = rawCode;
          document.body.appendChild(field);
          field.select();
          document.execCommand('copy');
          field.remove();
        }
        button.textContent = 'copiado ✓';
        window.setTimeout(() => { button.textContent = 'Copiar código'; }, 1500);
      });
    }

    function challengeFormHtml(challenge, options = {}) {
      // `options.fix`: o que falta nesta missao ("imagem", "gabarito"). O
      // formulario aberto a partir do card da sala marca esses campos e diz por
      // que a sala ainda nao abre, para o professor corrigir sem ter que achar
      // o desafio no banco.
      const fixFields = Array.isArray(options.fix) ? options.fix.filter(Boolean) : [];
      const fixClass = (key) => (fixFields.includes(key) ? ' is-needs-fix' : '');
      const criteria = challenge?.criteria?.length
        ? challenge.criteria
        : [
            { criterion: 'objetivo', weight: 20 },
            { criterion: 'contexto', weight: 20 },
            { criterion: 'publico', weight: 20 },
            { criterion: 'formato', weight: 20 },
            { criterion: 'restricoes', weight: 20 },
          ];
      const weightMap = new Map(criteria.map((entry) => [entry.criterion, entry.weight]));
      // Três leituras, e só elas: o que o ALUNO recebe, o que o JUIZ usa para
      // avaliar e os ajustes da rodada. As duas primeiras são o trabalho e ficam
      // abertas; o que é opcional abre sob a alça — com o valor já escolhido no
      // próprio resumo, e sem apagar nada ao fechar (os campos continuam no form,
      // então recolher é só esconder o que não decide agora).
      const categoria = String(challenge?.category || 'Fundamentos');
      const precisaImagem = fixFields.includes('imagem')
        || Boolean(challenge?.reference_image)
        || challenge?.modality === 'reversa'
        || ['Imagem', 'Reversa'].includes(categoria);
      const pesos = [...weightMap.values()].map((peso) => Number(peso) || 0);
      const criteriaResumo = `${pesos.length} ${pesos.length === 1 ? 'critério' : 'critérios'} · ${pesos.reduce((soma, peso) => soma + peso, 0)}%`;
      const tentativas = Number(challenge?.attempts) || 1;
      const rodadaResumo = `${tentativas}× · ${Number(challenge?.duration_seconds) > 0 ? formatSeconds(challenge.duration_seconds) : 'sem cronômetro'} · ${SPEED_LABELS[challenge?.speed_weight || 'none']}`;
      return `
        <form class="arena-challenge-form" data-challenge-form>
          <input type="hidden" name="challenge_id" value="${esc(challenge?.id || '')}">
          ${fixFields.length ? `<div class="arena-fix-callout">
            <strong>Falta nesta missão: ${esc(fixFields.map((key) => MISSING_LABELS[key] || key).join(' · '))}</strong>
            <p>Preencha o que está destacado e salve: a sala libera na hora.</p>
          </div>` : ''}
          <fieldset class="arena-form-group">
            <legend>O aluno recebe</legend>
            <label class="text-field"><span>Título</span><input name="title" maxlength="120" value="${esc(challenge?.title || '')}" required></label>
            <div class="arena-form-grid">
              <label class="text-field"><span>Modalidade</span>
                <select name="modality">${Object.entries(MODALITY_LABELS).map(([value, label]) => `<option value="${value}" ${challenge?.modality === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
              </label>
              <label class="text-field"><span>Categoria</span>
                <select name="category">${['Fundamentos', 'Texto', 'Imagem', 'Documentos', 'Refinamento', 'Reversa', 'Briefing', 'Avançado'].map((entry) => `<option ${(challenge?.category || 'Fundamentos') === entry ? 'selected' : ''}>${entry}</option>`).join('')}</select>
              </label>
            </div>
            <label class="text-field"><span>Missão</span><textarea name="mission" rows="3" maxlength="4000" required>${esc(challenge?.mission || '')}</textarea></label>
            <details class="arena-form-fold" data-form-fold="imagem"${precisaImagem ? ' open' : ''}>
              <summary>Imagem que o aluno vê</summary>
              <label class="text-field${fixClass('imagem')}" data-fix-field="imagem"><span>Arquivo até ~1,4 MB</span><input type="file" name="reference_image_file" accept="image/png,image/jpeg,image/webp"><input type="hidden" name="reference_image" value="${esc(challenge?.reference_image || '')}"></label>
              <label class="text-field"><span>Ou URL</span><input type="url" name="reference_image_url" placeholder="https://..."></label>
              ${challenge?.reference_image ? `<div class="arena-image-preview"><img src="${esc(challenge.reference_image)}" alt="Imagem que o aluno vai ver"></div>` : '<div class="arena-image-preview" data-image-preview hidden><img alt="Preview"><button type="button" data-image-preview-clear>Remover imagem</button></div>'}
            </details>
            <details class="arena-form-fold" data-form-fold="extras">
              <summary>Campos opcionais</summary>
              <label class="text-field"><span>Contexto</span><textarea name="context" rows="2" maxlength="4000">${esc(challenge?.context || '')}</textarea></label>
              <label class="text-field"><span>Resultado esperado</span><textarea name="expected_result" rows="2" maxlength="4000">${esc(challenge?.expected_result || '')}</textarea></label>
            </details>
          </fieldset>
          <fieldset class="arena-form-group">
            <legend>O juiz avalia</legend>
            <label class="text-field${fixClass('gabarito')}" data-fix-field="gabarito"><span>Gabarito do juiz — o aluno não vê</span><textarea name="reference_text" rows="3" maxlength="8000" placeholder="Resposta de referência — o prompt que gerou a imagem.">${esc(challenge?.reference_text || '')}</textarea></label>
            <details class="arena-form-fold" data-form-criteria>
              <summary>Critérios e pesos — ${criteriaResumo}</summary>
              <div class="arena-criteria-grid">
                ${Object.entries(CRITERION_LABELS).map(([criterion, label]) => `
                  <label class="arena-criterion">
                    <input type="checkbox" name="criteria" value="${criterion}" ${weightMap.has(criterion) ? 'checked' : ''}>
                    <span>${label}</span>
                    <input type="number" name="weight_${criterion}" min="1" max="100" value="${weightMap.get(criterion) || 10}" ${weightMap.has(criterion) ? '' : 'disabled'}>
                  </label>`).join('')}
              </div>
            </details>
          </fieldset>
          <details class="arena-form-fold" data-form-fold="rodada">
            <summary>Ajustes da rodada — ${rodadaResumo}</summary>
            <div class="arena-form-grid">
              <label class="text-field"><span>Tentativas</span>
                <select name="attempts">${[1, 2, 3].map((value) => `<option value="${value}" ${Number(challenge?.attempts || 1) === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
              </label>
              <label class="text-field"><span>Tempo</span>
                <select name="duration_seconds">
                  <option value="">Sem cronômetro</option>
                  ${[...new Set([60, 90, 120, 180, 300, Number(challenge?.duration_seconds)].filter((value) => value > 0))].sort((a, b) => a - b).map((value) => `<option value="${value}" ${Number(challenge?.duration_seconds) === value ? 'selected' : ''}>${formatSeconds(value)}</option>`).join('')}
                </select>
              </label>
              <label class="text-field"><span>Velocidade na pontuação</span>
                <select name="speed_weight">${Object.entries(SPEED_LABELS).map(([value, label]) => `<option value="${value}" ${(challenge?.speed_weight || 'none') === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
              </label>
            </div>
          </details>
          <p class="form-message" data-challenge-form-message></p>
          <div class="arena-dialog-actions">
            <button class="figma-cta figma-cta-gradient" type="submit">Salvar</button>
          </div>
        </form>`;
    }

    function editRoomDialog(room) {
      openDialog('Editar sala', `
        <form class="arena-challenge-form" data-room-form>
          <input type="hidden" name="room_id" value="${esc(room.id)}">
          <label class="text-field"><span>Título</span><input name="title" maxlength="120" value="${esc(room.title)}" required></label>
          <label class="text-field"><span>Limite de participantes (0 = sem limite)</span><input name="expected_players" type="number" min="0" max="50" value="${room.expected_players}"></label>
          <label class="text-field"><span>Bloquear novas entradas</span>
            <select name="entry_blocked"><option value="false">Nao</option><option value="true" ${room.entry_blocked ? 'selected' : ''}>Sim</option></select>
          </label>
          <button class="figma-cta figma-cta-blue" type="submit">Salvar</button>
          <p class="form-message" data-room-form-message></p>
        </form>`);
    }

    /**
     * Tela unica das pendencias da sala: uma linha por missao que falta, com o
     * campo (ou os campos) que a travam, para preencher tudo de uma vez.
     */
    function bulkFixDialog(roomId, detail) {
      const rounds = detail.rounds || [];
      const blockers = detail.blockers || [];
      const items = blockers.map((entry) => {
        const challengeId = entry.challenge_id;
        const round = rounds.find((candidate) => String(candidate.challenge_id) === String(challengeId));
        const missing = entry.missing || [];
        return `
          <fieldset class="arena-bulk-item" data-bulk-item="${esc(challengeId)}" data-bulk-only="${missing.join(',')}">
            <legend>
              <strong>Missão ${entry.position} — ${esc(entry.title)}</strong>
              <span class="arena-bulk-missing">${missing.map((key) => esc(MISSING_LABELS[key] || key)).join(' · ')}</span>
            </legend>
            ${round?.mission ? `<p class="arena-bulk-mission"><span>O ALUNO RECEBE</span>${esc(round.mission)}</p>` : ''}
            ${missing.includes('imagem') ? `
              <label class="text-field"><span>Imagem que o aluno vê (PNG, JPG ou WebP, até ~1,4 MB)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" data-bulk-image="${esc(challengeId)}">
              </label>
              <label class="text-field"><span>Ou URL da imagem</span>
                <input type="url" placeholder="https://..." data-bulk-image-url="${esc(challengeId)}">
              </label>
              <div class="arena-image-preview" data-bulk-preview="${esc(challengeId)}" hidden><img alt="Prévia da imagem escolhida"><small>Prévia da imagem</small></div>` : ''}
            ${missing.includes('gabarito') ? `
              <label class="text-field"><span>Gabarito do juiz — o aluno não vê${missing.includes('imagem') ? ' (nas missões de imagem, o prompt que gerou a imagem)' : ''}</span>
                <textarea rows="3" maxlength="8000" placeholder="O texto com que o juiz compara a resposta do aluno. Ele nunca aparece na tela do aluno." data-bulk-gabarito="${esc(challengeId)}"></textarea>
                <small class="arena-bulk-from" data-bulk-from hidden>Preenchido pelo prompt de cima — ajuste se esta missão for diferente.</small>
              </label>` : ''}
          </fieldset>`;
      }).join('');
      const temGabarito = blockers.some((entry) => (entry.missing || []).includes('gabarito'));
      return `
        <form class="arena-challenge-form arena-bulk-form" data-bulk-fix-form>
          <input type="hidden" name="room_id" value="${esc(roomId)}">
          <p class="arena-bulk-lead"><b>${blockers.length}</b> ${blockers.length === 1 ? 'missão ainda não pode ir ao ar' : 'missões ainda não podem ir ao ar'} nesta sala. Preencha o que falta e salve de uma vez.</p>
          ${temGabarito ? `<div class="arena-bulk-fill">
            <label class="text-field"><span>Prompt que gerou as imagens (vira o gabarito do juiz, o aluno não vê)</span>
              <textarea rows="2" maxlength="8000" data-bulk-fill-source placeholder="Cole aqui o prompt original: ele é o gabarito do juiz. Uma linha por missão também vale."></textarea>
            </label>
            <div class="arena-bulk-fill-actions">
              <button type="button" class="figma-cta figma-cta-blue" data-bulk-apply="somente">Aplicar às que só pedem gabarito</button>
              <button type="button" class="figma-cta" data-bulk-apply="todas">Aplicar a todas em branco</button>
              <button type="button" class="figma-cta" data-bulk-apply="linhas" hidden>Uma linha para cada</button>
            </div>
            <p class="arena-bulk-fill-hint" data-bulk-fill-hint></p>
            <p class="arena-bulk-fill-message" data-bulk-fill-message></p>
          </div>` : ''}
          <div class="arena-bulk-list">${items}</div>
          <p class="form-message" data-bulk-fix-message></p>
          <div class="arena-dialog-actions">
            <button class="figma-cta figma-cta-gradient" type="submit">Salvar as missões preenchidas</button>
          </div>
        </form>`;
    }

    /**
     * Colar uma vez, preencher várias: o prompt que gerou as imagens costuma ser
     * o proprio gabarito, entao a tela unica aceita colar o texto e distribuir
     * entre as missoes em branco — sem repetir a digitacao linha por linha.
     */
    function bulkFillCounts(form) {
      const items = $$('[data-bulk-item]', form);
      const blank = items.filter((item) => {
        const field = $('[data-bulk-gabarito]', item);
        return field && !field.value.trim();
      });
      return { blank, soGabarito: blank.filter((item) => item.dataset.bulkOnly === 'gabarito') };
    }

    function refreshBulkFill() {
      const form = $('[data-bulk-fix-form]');
      if (!form) return;
      const source = $('[data-bulk-fill-source]', form);
      if (!source) return;
      const { blank, soGabarito } = bulkFillCounts(form);
      const lines = source.value.split('\n').map((line) => line.trim()).filter(Boolean);
      const hint = $('[data-bulk-fill-hint]', form);
      if (hint) {
        hint.textContent = blank.length
          ? `${blank.length} gabarito${blank.length > 1 ? 's' : ''} em branco${soGabarito.length ? ` — ${soGabarito.length} ${soGabarito.length > 1 ? 'missões pedem' : 'missão pede'} só isso` : ''}.`
          : 'Nenhum gabarito em branco.';
      }
      const only = $('[data-bulk-apply="somente"]', form);
      const all = $('[data-bulk-apply="todas"]', form);
      const each = $('[data-bulk-apply="linhas"]', form);
      if (only) only.disabled = soGabarito.length === 0;
      if (all) all.disabled = blank.length === 0;
      if (each) {
        each.hidden = lines.length < 2;
        each.disabled = blank.length === 0 || lines.length < 2;
      }
    }

    function applyBulkFill(scope) {
      const form = $('[data-bulk-fix-form]');
      const node = $('[data-bulk-fill-message]', form);
      const source = ($('[data-bulk-fill-source]', form)?.value || '').trim();
      if (!source) {
        message(node, 'Cole o prompt no campo de cima para aplicar.', 'error');
        return;
      }
      const { blank, soGabarito } = bulkFillCounts(form);
      const targets = scope === 'somente' ? soGabarito : blank;
      if (!targets.length) {
        message(node, 'Nenhum gabarito em branco nessa opção.', 'error');
        return;
      }
      const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
      let filled = 0;
      for (const item of targets) {
        const field = $('[data-bulk-gabarito]', item);
        const value = scope === 'linhas' ? lines[filled] : source;
        if (!field || !value) continue;
        field.value = value;
        item.classList.add('is-filled');
        const note = $('[data-bulk-from]', item);
        if (note) note.hidden = false;
        filled += 1;
      }
      if (!filled) {
        message(node, 'Acabaram as linhas antes das missões.', 'error');
        return;
      }
      message(node, scope === 'linhas'
        ? `${filled} ${filled > 1 ? 'gabaritos preenchidos' : 'gabarito preenchido'}, uma linha para cada.`
        : `${filled} gabarito${filled > 1 ? 's' : ''} com o mesmo prompt.`, 'info');
      refreshBulkFill();
    }

    /** Abre a tela unica com as pendencias atuais da sala (sempre relidas). */
    async function openBulkFix(roomId) {
      if (!roomId) return;
      const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
      const blockers = detail.blockers || [];
      if (!blockers.length) {
        await refreshAll();
        flashFixNote(roomId);
        return;
      }
      state.fixReturn = roomId;
      openDialog(`Preencher ${blockers.length} ${blockers.length === 1 ? 'missão' : 'missões'} de uma vez`,
        bulkFixDialog(roomId, detail));
      refreshBulkFill();
    }

    // ---------------------------------------------------------------------
    // TEMPO DAS MISSOES DA SALA: quanto tempo cada missao leva, com a sugestao
    // vinda da modalidade + tamanho do que o aluno le. O professor aceita ou
    // ajusta — nada e aplicado sozinho. O tempo pertence ao DESAFIO, entao o
    // painel avisa quando outra sala usa o mesmo desafio (o tempo vale la tambem).
    // ---------------------------------------------------------------------

    /** "2:00" ou "120" -> segundos; null quando vazio; NaN quando fora da faixa. */
    function parseDurationText(raw) {
      const text = String(raw ?? '').trim();
      if (!text) return null;
      const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
      const seconds = clock
        ? Number(clock[1]) * 60 + Number(clock[2])
        : (/^\d+$/.test(text) ? Number(text) : NaN);
      if (!Number.isFinite(seconds)) return NaN;
      return seconds >= 15 && seconds <= 3600 ? seconds : NaN;
    }

    /**
     * A linha responde o que o professor decide — missão, tempo de agora (o selo
     * entra quando o campo diverge dele, não como cópia do campo) e sugestão
     * aplicável — e as duas coisas que ele lê UMA vez para decidir
     * (o enunciado e a justificativa da sugestão) abrem sob as próprias alças.
     * O formato do campo e o que "vazio" significa ficam no aviso do topo, uma
     * vez, em vez de repetidos em cada uma das missões.
     */
    function timingRowHtml(round) {
      const suggestion = Number(round.suggested_seconds) > 0 ? Number(round.suggested_seconds) : 0;
      const current = Number(round.duration_seconds) > 0 ? Number(round.duration_seconds) : null;
      const outras = Number(round.other_rooms) || 0;
      const id = esc(round.challenge_id);
      return `
        <fieldset class="arena-timing-item" data-timing-item="${id}" data-timing-current="${current ?? ''}">
          <legend>
            <strong>Missão ${round.position} — ${esc(round.title)}</strong>
            <span class="arena-timing-modality">${MODALITY_LABELS[round.modality] || round.modality}</span>
            <span class="arena-timing-now" data-timing-now hidden></span>
          </legend>
          <div class="arena-timing-row">
            <label class="text-field"><span>Tempo</span>
              <input type="text" inputmode="numeric" autocomplete="off" data-timing-input="${id}" value="${current ? esc(formatSeconds(current)) : ''}" placeholder="${suggestion ? esc(formatSeconds(suggestion)) : 'sem cronômetro'}">
            </label>
            <div class="arena-timing-suggest">
              ${suggestion && current === suggestion
                ? '<span class="arena-timing-none">O tempo atual já é a sugestão.</span>'
                : suggestion
                  ? `<details class="arena-timing-reason"><summary>Sugestão: <b>${esc(formatSeconds(suggestion))}</b></summary>${round.suggested_reason ? `<p>${esc(round.suggested_reason)}</p>` : ''}</details>
                     <button type="button" class="arena-btn-secondary" data-timing-use="${id}" data-timing-value="${suggestion}">usar sugestão</button>`
                  : '<span class="arena-timing-none">Sem sugestão para esta missão.</span>'}
            </div>
          </div>
          ${round.mission ? `<details class="arena-timing-brief"><summary>O aluno recebe</summary><p class="arena-timing-mission">${esc(round.mission)}</p></details>` : ''}
          ${outras ? `<p class="arena-timing-shared">⚠ Este desafio é usado em <b>${outras}</b> outra${outras > 1 ? 's salas' : ' sala'} — o tempo novo vale lá também.</p>` : ''}
          <p class="arena-timing-error" data-timing-error></p>
        </fieldset>`;
    }

    /** Total ao vivo: o professor ve o tempo da aula mudar enquanto ajusta. */
    function refreshTimingTotal() {
      const form = $('[data-room-timing-form]');
      if (!form) return;
      let total = 0;
      let semTempo = 0;
      let invalidos = 0;
      for (const item of $$('[data-timing-item]', form)) {
        const field = $('[data-timing-input]', item);
        const errorNode = $('[data-timing-error]', item);
        const seconds = parseDurationText(field?.value);
        const invalid = Number.isNaN(seconds);
        item.classList.toggle('is-invalid', invalid);
        if (errorNode) {
          errorNode.textContent = invalid
            ? 'Use mm:ss (ex.: 2:00) ou segundos, de 15 s a 1 h.'
            : '';
        }
        // O selo só aparece quando o campo deixa de dizer o que está no ar:
        // enquanto os dois dizem a mesma coisa, ele era a duração escrita duas
        // vezes na mesma linha. Divergindo (rascunho ou campo inválido), ele
        // passa a ser a única fonte do que já está gravado.
        const selo = $('[data-timing-now]', item);
        if (selo) {
          const salvo = item.dataset.timingCurrent === '' ? null : Number(item.dataset.timingCurrent);
          const divergente = invalid || seconds !== salvo;
          selo.hidden = !divergente;
          selo.classList.toggle('is-untimed', salvo === null);
          selo.textContent = divergente
            ? `no ar: ${salvo === null ? 'sem cronômetro' : formatSeconds(salvo)}`
            : '';
        }
        if (invalid) invalidos += 1;
        else if (seconds === null) semTempo += 1;
        else total += seconds;
      }
      const node = $('[data-timing-total]', form);
      if (node) {
        node.textContent = invalidos
          ? `${invalidos} campo${invalidos > 1 ? 's' : ''} para corrigir antes de salvar.`
          : `Se salvar assim: ${formatTotal(total)} de aula${semTempo ? ` · ${semTempo} ${semTempo === 1 ? 'missão' : 'missões'} sem cronômetro` : ''}.`;
        node.className = `arena-timing-total${invalidos ? ' is-invalid' : ''}`;
      }
    }

    /** Abre o ajuste de tempos com a sala relida agora (sugestões sempre frescas). */
    async function openTimingDialog(roomId) {
      if (!roomId) return;
      const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
      const rounds = detail.rounds || [];
      if (!rounds.length) {
        window.alert('Esta sala ainda não tem missão nenhuma.');
        return;
      }
      const semCronometro = rounds.filter((round) => !(Number(round.duration_seconds) > 0)).length;
      openDialog(`Tempo das missões — ${detail.room.title}`, `
        <form class="arena-challenge-form arena-timing-form" data-room-timing-form>
          <input type="hidden" name="room_id" value="${esc(roomId)}">
          <p class="arena-timing-lead">Tempo em <b>mm:ss</b>; vazio = <b>sem cronômetro</b> — a missão então termina no <b>Encerrar rodada</b>.</p>
          ${semCronometro ? `<div class="arena-timing-actions">
            <button type="button" class="arena-btn-secondary" data-timing-apply-suggestions>Aceitar as sugestões das ${semCronometro} ${semCronometro === 1 ? 'missão' : 'missões'} sem cronômetro</button>
          </div>` : ''}
          <div class="arena-timing-list">${rounds.map(timingRowHtml).join('')}</div>
          <p class="arena-timing-total" data-timing-total></p>
          <p class="form-message" data-room-timing-message></p>
          <div class="arena-dialog-actions">
            <button class="figma-cta figma-cta-gradient" type="submit">Salvar tempos</button>
          </div>
        </form>`);
      refreshTimingTotal();
    }

    /** Depois de salvar: o tempo da aula mudou — diz para quanto. */
    function flashTimingNote(roomId, data) {
      if (!roomId || state.selectedRoomId !== roomId) return;
      const body = $('[data-arena-detail-body]');
      if (!body) return;
      const timing = data?.timing || {};
      const salvo = Number(data?.count) > 1 ? `${Number(data.count)} tempos salvos.` : 'Tempo salvo.';
      const depois = Number(timing.timed)
        ? `A sala soma <b>${esc(formatTotal(timing.total_seconds))}</b> de aula${Number(timing.untimed) ? ` e <b>${Number(timing.untimed)}</b> ${Number(timing.untimed) === 1 ? 'missão' : 'missões'} sem cronômetro` : ''}.`
        : 'Nenhuma missão desta sala tem cronômetro.';
      const note = document.createElement('div');
      note.className = 'arena-fix-flash is-ready';
      note.setAttribute('role', 'status');
      note.innerHTML = `<strong>${esc(salvo)}</strong> ${depois}`;
      body.prepend(note);
      window.setTimeout(() => note.remove(), 8000);
    }

    /** Salva SO os tempos que mudaram, numa chamada (o servidor grava em transação). */
    async function saveTimingForm(form) {
      const node = $('[data-room-timing-message]', form);
      const roomId = form.elements.room_id.value;
      const times = [];
      let invalidos = 0;
      for (const item of $$('[data-timing-item]', form)) {
        const seconds = parseDurationText($('[data-timing-input]', item)?.value);
        if (Number.isNaN(seconds)) { invalidos += 1; continue; }
        const before = item.dataset.timingCurrent === '' ? null : Number(item.dataset.timingCurrent);
        if (seconds === before) continue;
        times.push({ challenge_id: item.dataset.timingItem, duration_seconds: seconds });
      }
      if (invalidos) {
        refreshTimingTotal();
        message(node, 'Confira os campos marcados — nada foi enviado.', 'error');
        return;
      }
      if (!times.length) {
        message(node, 'Nada mudou: os tempos desta sala já são estes.', 'info');
        return;
      }
      message(node, `Salvando ${times.length} ${times.length === 1 ? 'tempo' : 'tempos'}...`, 'info');
      let data;
      try {
        data = await api('arena_set_round_times', { room_id: roomId, times }, { timeout: 60000 });
      } catch (error) {
        // Erro de validação tem detalhes e segue para o aviso normal; queda de
        // rede não: o servidor grava tudo ou nada.
        if (error?.details) throw error;
        message(node, 'A conexão falhou e nada foi gravado. Os tempos que você digitou continuam aqui — clique em salvar de novo.', 'error');
        return;
      }
      closeDialog();
      await refreshAll();
      flashTimingNote(roomId, data);
    }

    function addRoundDialog(roomId) {
      const options = state.challenges.length
        ? state.challenges.map((challenge) => `<option value="${esc(challenge.id)}">${MODALITY_LABELS[challenge.modality] || challenge.modality} — ${esc(challenge.title)}</option>`).join('')
        : '<option value="">Nenhum desafio disponível</option>';
      openDialog('Adicionar missão', `
        <form class="arena-challenge-form" data-add-round-form>
          <input type="hidden" name="room_id" value="${esc(roomId)}">
          <label class="text-field"><span>Desafio</span><select name="challenge_id" data-add-round-challenge>${options}</select></label>
          <div class="arena-add-round-preview" data-add-round-preview></div>
          <button class="figma-cta figma-cta-blue" type="submit" ${state.challenges.length ? '' : 'disabled'}>Adicionar</button>
          <p class="form-message" data-add-round-message></p>
        </form>`);
      renderAddRoundPreview();
    }

    // O desafio escolhido aparece com o que decide a escolha — imagem, título,
    // modalidade, tempo e o que faltaria para a sala abrir — e o enunciado e o
    // gabarito ficam a um clique: confirmar a missão não exige ler o gabarito
    // inteiro, mas ninguém adiciona às cegas.
    function renderAddRoundPreview() {
      const slot = $('[data-add-round-preview]');
      const select = $('[data-add-round-challenge]');
      if (!slot) return;
      const challenge = state.challenges.find((entry) => entry.id === select?.value);
      if (!challenge) { slot.innerHTML = ''; return; }
      const gabarito = challenge.reference_text || challenge.expected_result;
      const modalidade = String(challenge.modality || '').toLowerCase();
      const categoria = String(challenge.category || '').toLowerCase();
      const exigeImagem = modalidade === 'reversa'
        || categoria === 'imagem' || categoria === 'reversa' || categoria === 'classico';
      const faltando = [
        exigeImagem && !challenge.reference_image ? MISSING_LABELS.imagem : '',
        !gabarito ? MISSING_LABELS.gabarito : '',
      ].filter(Boolean);
      slot.innerHTML = `
        <div class="arena-round-summary">
          ${challenge.reference_image ? `<img src="${esc(challenge.reference_image)}" alt="Imagem que o aluno vai ver" loading="lazy">` : ''}
          <div>
            <strong>${esc(challenge.title)}</strong>
            <small>${MODALITY_LABELS[challenge.modality] || challenge.modality}${challenge.duration_seconds ? ` · ${formatSeconds(challenge.duration_seconds)}` : ' · sem cronômetro'}${Number(challenge.attempts) > 1 ? ` · ${challenge.attempts} tentativas` : ''}</small>
            ${faltando.length ? `<span class="arena-round-flag">⚠ ${esc(faltando.join(' · '))}</span>` : ''}
          </div>
        </div>
        ${challenge.mission ? `<details class="arena-round-fold"><summary>O aluno recebe</summary><p class="arena-round-mission">${esc(challenge.mission)}</p></details>` : ''}
        <details class="arena-round-fold"><summary>Gabarito do juiz</summary>
          <p>${gabarito ? esc(gabarito) : 'Sem gabarito: o juiz compara só com a missão.'}</p>
        </details>`;
    }

    // Eventos do painel
    $('[data-admin-arena-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const node = $('[data-admin-arena-message]');
      message(node, 'Entrando...', 'info');
      try {
        await login(event.currentTarget.elements.password.value);
      } catch (error) {
        message(node, error.message, 'error');
      }
    });

    $('[data-arena-admin-logout]')?.addEventListener('click', async () => {
      // Limpa o cookie no servidor e recarrega para o shell de login — o
      // markup do painel nao permanece no DOM apos sair.
      await api('admin_logout').catch(() => {});
      window.location.replace('/admin-arena.php');
    });

    $('[data-arena-gate-toggle]')?.addEventListener('click', () => toggleGate().catch((error) => alert(error.message)));

    // (Removido: a criacao de sala agora é feita via Modal Premium com event delegation no final do arquivo)

    $('[data-arena-room-list]')?.addEventListener('click', async (event) => {
      const card = event.target.closest('[data-room-id]');
      if (!card) return;
      const roomId = card.dataset.roomId;
      const action = event.target.dataset.action;
      if (!action) return;
      try {
        if (action === 'detail') {
          state.selectedRoomId = roomId;
          renderLessons();
          await refreshDetail(roomId);
          const detail = $('[data-arena-detail]');
          if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          await roomAction(action, roomId);
        }
      } catch (error) {
        if (showBlockersDialog(error, roomId)) return;
        alert(error.message);
      }
    });

    // Sorteio: mudar "quantos por vez" grava na hora (mantendo o mesmo modelo, o
    // historico fica); valor fora da faixa nem chega ao servidor.
    $('[data-arena-detail-body]')?.addEventListener('change', async (event) => {
      if (!event.target.matches('[data-draw-size]')) return;
      const roomId = state.selectedRoomId;
      const size = Number(event.target.value);
      if (!roomId) return;
      if (!Number.isInteger(size) || size < 2 || size > 10) {
        alert('Escolha de 2 a 10 pessoas por sorteio.');
        event.target.value = event.target.defaultValue;
        return;
      }
      try {
        await adminApi('arena_draw_setup', {
          room_id: roomId,
          mode: event.target.dataset.drawMode,
          group_size: size,
        });
        await refreshDetail(roomId);
      } catch (error) {
        alert(error.message);
      }
    });

    $('[data-arena-detail-body]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action], a[data-action="open-tv"]');
      if (!button) return;
      const action = button.dataset.action;
      const roomId = state.selectedRoomId;
      if (!roomId) return;
      if (action === 'open-tv') event.preventDefault();
      try {
        if (action === 'room-edit') {
          const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          editRoomDialog(detail.room);
        } else if (action === 'room-block') {
          const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          await adminApi('arena_update_room', { room_id: roomId, entry_blocked: !detail.room.entry_blocked });
          await refreshDetail(roomId);
        } else if (action === 'remove-round') {
          if (!window.confirm('Remover esta missão da sala?')) return;
          await adminApi('arena_remove_round', { room_id: roomId, round_id: button.closest('[data-round-id]')?.dataset.roundId });
          // refreshAll mantém a contagem de missões da lista de salas em dia.
          await refreshAll();
        } else if (action === 'fix-round') {
          await openChallengeFix({
            challengeId: button.dataset.challengeId,
            missing: (button.dataset.missing || '').split(',').filter(Boolean),
            roomId,
          });
        } else if (action === 'move-round') {
          const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          const ids = (detail.rounds || []).map((entry) => entry.id);
          const from = ids.indexOf(button.closest('[data-round-id]')?.dataset.roundId || '');
          const to = button.dataset.dir === 'up' ? from - 1 : from + 1;
          if (from < 0 || to < 0 || to >= ids.length) return;
          [ids[from], ids[to]] = [ids[to], ids[from]];
          await adminApi('arena_reorder_rounds', { room_id: roomId, positions: ids });
          await refreshAll();
        } else if (action === 'remove-participant') {
          if (!window.confirm('Remover este participante?')) return;
          await adminApi('arena_remove_participant', { room_id: roomId, participant_id: button.dataset.pid });
          await refreshDetail(roomId);
        } else if (action === 'rename-participant') {
          const name = window.prompt('Novo nome:');
          if (name && name.trim().length >= 2) {
            try {
              await adminApi('arena_rename_participant', { room_id: roomId, participant_id: button.dataset.pid, name: name.trim() });
              await refreshDetail(roomId);
            } catch (error) {
              alert(error.message);
            }
          }
        } else if (action === 'open-tv') {
          const tv = await adminApi('arena_tv_token', { room_id: roomId });
          showProjectionDialog(tv);
        } else if (action === 'copy-code') {
          const code = button.dataset.code || '';
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            const field = document.createElement('textarea');
            field.value = code;
            document.body.appendChild(field);
            field.select();
            document.execCommand('copy');
            field.remove();
          }
          button.textContent = 'copiado ✓';
          window.setTimeout(() => { button.textContent = `Copiar ${code}`; }, 1500);
        } else if (action === 'copy-link') {
            const link = button.dataset.link || '';
            try {
              await navigator.clipboard.writeText(link);
            } catch {
              const field = document.createElement('textarea');
              field.value = link;
              document.body.appendChild(field);
              field.select();
              document.execCommand('copy');
              field.remove();
            }
            button.textContent = 'link copiado ✓';
            window.setTimeout(() => { button.textContent = '🔗 Copiar link direto'; }, 1500);
          } else if (action === 'room-timing') {
          await openTimingDialog(roomId);
        } else if (action === 'draw-next') {
          if (button.disabled) return;
          button.disabled = true;
          await adminApi('arena_draw_next', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'draw-winner') {
          await adminApi('arena_draw_settle', { room_id: roomId, winner_id: button.dataset.pid });
          await refreshDetail(roomId);
        } else if (action === 'draw-mode') {
          const { draw } = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          const mode = button.dataset.mode;
          if (draw?.mode === mode) return;
          // Trocar de modelo nao converte um sorteio no outro: recomeca, e o
          // professor confirma isso antes.
          if (draw?.started && !window.confirm('Trocar o modelo recomeça o sorteio do zero. Continuar?')) return;
          await adminApi('arena_draw_setup', { room_id: roomId, mode, group_size: draw?.group_size || 3, reset: Boolean(draw?.started) });
          await refreshDetail(roomId);
        } else if (action === 'draw-reset') {
          if (!window.confirm('Recomeçar o sorteio? O histórico desta sala é apagado.')) return;
          await adminApi('arena_draw_reset', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-draw') {
          if (button.disabled) return;
          button.disabled = true;
          await adminApi('arena_mode_draw', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-wildcard-close') {
          await adminApi('arena_mode_wildcard_close', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-dynamic-open') {
          button.disabled = true;
          await adminApi('arena_mode_dynamic_open', { room_id: roomId, dynamic: button.dataset.dynamic });
          await refreshDetail(roomId);
        } else if (action === 'arena-dynamic-close') {
          await adminApi('arena_mode_dynamic_close', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-next') {
          await adminApi('arena_mode_next', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-power') {
          const data = await adminApi('arena_mode_power', { room_id: roomId, power: button.dataset.power });
          await refreshDetail(roomId);
          if (data.note) window.alert(data.note);
        } else if (action === 'arena-teams') {
          await adminApi('arena_mode_teams', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-config') {
          const read = (key) => {
            const field = document.querySelector(`[data-arena-config="${key}"]`);
            if (!field) return undefined;
            return field.type === 'checkbox' ? field.checked : field.value;
          };
          await adminApi('arena_mode_configure', {
            room_id: roomId,
            rounds: read('rounds'),
            boss_max_health: read('boss_max_health'),
            damage_threshold: read('damage_threshold'),
            attacks_per_round: read('attacks_per_round'),
            teams: read('teams'),
            powers: read('powers'),
          });
          await refreshDetail(roomId);
        } else if (action === 'arena-reset') {
          if (!window.confirm('Recomeçar a partida? O Juiz volta cheio, a energia zera e ninguém competiu.')) return;
          await adminApi('arena_mode_reset', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'fix-all') {
          await openBulkFix(button.dataset.roomId || roomId);
        } else {
          await roomAction(action, roomId);
        }
      } catch (error) {
        if (showBlockersDialog(error, roomId)) return;
        alert(error.message);
      }
    });

    $('[data-arena-close-detail]')?.addEventListener('click', () => {
      const panel = $('[data-arena-detail]');
      if (panel) panel.hidden = true;
      state.selectedRoomId = null;
      if (state.detailPoll) window.clearInterval(state.detailPoll);
      state.detailPoll = null;
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      renderRooms();
      renderLessons();
    });

    $('[data-arena-new-challenge]')?.addEventListener('click', () => {
      state.editingChallengeId = null;
      openDialog('Novo desafio', challengeFormHtml(null));
    });

    $('[data-arena-lesson-list]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const lessonId = button.dataset.lesson;
      const messageNode = $('[data-lesson-message="' + lessonId + '"]');
      try {
        if (button.dataset.action === 'add-lesson-room') {
          if (!state.selectedRoomId) return;
          message(messageNode, 'Adicionando...', 'info');
          await addLesson(lessonId, state.selectedRoomId);
          message(messageNode, 'Aula adicionada a sala!', '');
        } else if (button.dataset.action === 'add-lesson-bank') {
          message(messageNode, 'Criando...', 'info');
          await addLesson(lessonId, null);
          message(messageNode, 'Desafios criados no banco!', '');
        }
      } catch (error) {
        message(messageNode, error.message, 'error');
      }
    });

    $('[data-arena-challenge-list]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = button.dataset.id;
      try {
        if (button.dataset.action === 'edit') {
          state.editingChallengeId = id;
          const challenge = state.challenges.find((entry) => entry.id === id);
          openDialog('Editar desafio', challengeFormHtml(challenge));
        } else if (button.dataset.action === 'duplicate') {
          await adminApi('arena_duplicate_challenge', { challenge_id: id });
          await refreshChallenges();
        } else if (button.dataset.action === 'delete') {
          if (!window.confirm('Excluir este desafio?')) return;
          await adminApi('arena_delete_challenge', { challenge_id: id });
          await refreshChallenges();
        }
      } catch (error) {
        alert(error.message);
      }
    });

    // Delegacao de formularios dentro do dialog
    $('[data-arena-dialog]')?.addEventListener('submit', async (event) => {
      const form = event.target.closest('form');
      if (!form) return;
      event.preventDefault();
      const submit = (node) => { message(node, 'Salvando...', 'info'); };
      const fail = (node, error) => { message(node, error.message, 'error'); };
      try {
        if (form.matches('[data-challenge-form]')) {
          const node = $('[data-challenge-form-message]', form);
          submit(node);
          const criteria = $$('input[name="criteria"]:checked', form).map((input) => ({
            criterion: input.value,
            weight: Number($(`input[name="weight_${input.value}"]`, form).value || 10),
          }));
          if (!criteria.length) {
            message(node, 'Selecione ao menos um criterio.', 'error');
            // O erro está dentro de uma dobra: ela abre e o foco vai para o
            // primeiro critério, em vez de o professor ter de procurar o campo.
            const fold = $('[data-form-criteria]', form);
            if (fold) {
              fold.open = true;
              $('input[name="criteria"]', fold)?.focus();
            }
            return;
          }
          const imageFile = form.elements.reference_image_file?.files?.[0];
          let referenceImage = form.elements.reference_image.value || '';
          const url = form.elements.reference_image_url?.value?.trim();
          if (url) referenceImage = url;
          if (imageFile) {
            if (imageFile.size > 1_400_000) {
              message(node, 'Imagem muito grande (máximo ~1,4 MB).', 'error');
              return;
            }
            referenceImage = await fileToDataUrl(imageFile);
          }
          await adminApi('arena_save_challenge', {
            challenge_id: form.elements.challenge_id.value || undefined,
            title: form.elements.title.value,
            modality: form.elements.modality.value,
            mission: form.elements.mission.value,
            context: form.elements.context.value,
            reference_text: form.elements.reference_text.value,
            reference_image: referenceImage,
            expected_result: form.elements.expected_result.value,
            attempts: Number(form.elements.attempts.value),
            duration_seconds: form.elements.duration_seconds.value ? Number(form.elements.duration_seconds.value) : null,
            speed_weight: form.elements.speed_weight.value,
            category: form.elements.category.value,
            criteria,
          });
          closeDialog();
          // Correcao vinda da sala: mantem a lista de salas (chip "a corrigir")
          // e o cockpit em dia, e diz o que ainda falta. Fora desse fluxo, o
          // banco de desafios basta se atualizar.
          const returnRoom = state.fixReturn;
          state.fixReturn = null;
          if (returnRoom) {
            await refreshAll();
            flashFixNote(returnRoom);
          } else {
            await refreshChallenges();
          }
        } else if (form.matches('[data-room-timing-form]')) {
          await saveTimingForm(form);
        } else if (form.matches('[data-bulk-fix-form]')) {
          const node = $('[data-bulk-fix-message]', form);
          const roomId = form.elements.room_id.value;
          // Prompt colado e nao aplicado: avisa em vez de sumir com o texto.
          if (($('[data-bulk-fill-source]', form)?.value || '').trim() && bulkFillCounts(form).blank.length) {
            message(node, 'O prompt colado ainda não foi aplicado.', 'error');
            return;
          }
          const pendentes = [];
          for (const item of $$('[data-bulk-item]', form)) {
            const challengeId = item.dataset.bulkItem;
            const challenge = state.challenges.find((entry) => String(entry.id) === String(challengeId));
            if (!challenge) continue;
            const file = $(`[data-bulk-image="${challengeId}"]`, item)?.files?.[0];
            const url = $(`[data-bulk-image-url="${challengeId}"]`, item)?.value?.trim() || '';
            const gabaritoNode = $(`[data-bulk-gabarito="${challengeId}"]`, item);
            const gabarito = gabaritoNode ? gabaritoNode.value.trim() : '';
            // Linha em branco: a missão continua como está, sem sobrescrever nada.
            if (!file && !url && !gabarito) continue;
            if (file && file.size > 1_400_000) {
              message(node, `A imagem de “${challenge.title}” é maior que 1,4 MB.`, 'error');
              return;
            }
            pendentes.push({ challenge, file, url, gabarito });
          }
          if (!pendentes.length) {
            message(node, 'Preencha o gabarito ou escolha uma imagem em pelo menos uma missão.', 'error');
            return;
          }
          // Uma chamada so, transacional no servidor: se a conexão cair no meio,
          // nada entrou pela metade e a sala continua exatamente como estava.
          const challenges = [];
          for (const entry of pendentes) {
            const image = entry.file ? await fileToDataUrl(entry.file) : (entry.url || entry.challenge.reference_image || '');
            // Vai o registro inteiro: o que não foi preenchido aqui continua igual.
            challenges.push({
              challenge_id: entry.challenge.id,
              title: entry.challenge.title,
              modality: entry.challenge.modality,
              mission: entry.challenge.mission,
              context: entry.challenge.context || '',
              category: entry.challenge.category,
              reference_text: entry.gabarito || entry.challenge.reference_text || '',
              reference_image: image,
              expected_result: entry.challenge.expected_result || '',
              attempts: Number(entry.challenge.attempts || 1),
              duration_seconds: entry.challenge.duration_seconds ?? null,
              speed_weight: entry.challenge.speed_weight || 'none',
              criteria: entry.challenge.criteria || [],
            });
          }
          const corpo = JSON.stringify({ challenges });
          if (corpo.length > MAX_BULK_BODY_CHARS) {
            message(node, 'São muitas imagens de uma vez (o lote passaria de ~24 MB). Salve em duas rodadas — nada foi enviado.', 'error');
            return;
          }
          message(node, `Salvando ${challenges.length} ${challenges.length === 1 ? 'missão' : 'missões'} numa chamada só...`, 'info');
          let data;
          try {
            data = await api('arena_save_challenges', { challenges }, { timeout: 180000 });
          } catch (error) {
            // Erro de validação tem detalhes e segue para o aviso normal; queda de
            // rede não: o servidor grava tudo ou nada, então aqui só resta avisar
            // que nada mudou e que o formulário continua preenchido.
            if (error?.details) throw error;
            message(node, 'A conexão falhou durante o salvamento e nada foi gravado. As missões continuam preenchidas aqui — clique em salvar de novo.', 'error');
            return;
          }
          closeDialog();
          state.fixReturn = null;
          await refreshAll();
          flashFixNote(roomId, Number(data.count) || challenges.length);
        } else if (form.matches('[data-room-form]')) {
          const node = $('[data-room-form-message]', form);
          submit(node);
          await adminApi('arena_update_room', {
            room_id: form.elements.room_id.value,
            title: form.elements.title.value,
            expected_players: Number(form.elements.expected_players.value || 0),
            entry_blocked: form.elements.entry_blocked.value === 'true',
          });
          closeDialog();
          await refreshAll();
          if (state.selectedRoomId) await refreshDetail(state.selectedRoomId);
        } else if (form.matches('[data-add-round-form]')) {
          const node = $('[data-add-round-message]', form);
          submit(node);
          await adminApi('arena_add_round', {
            room_id: form.elements.room_id.value,
            challenge_id: form.elements.challenge_id.value,
          });
          closeDialog();
          await refreshDetail(form.elements.room_id.value);
        } else if (form.matches('[data-arena-create-room]')) {
          const node = form.querySelector('[data-arena-create-message]');
          message(node, 'Criando sala...', 'info');
          const preset = form.elements.preset?.value || 'turma';
          const arenaConfigPayload = preset === 'arena' ? {
            arena_rounds: Number(form.elements.arena_rounds?.value || 3),
            arena_boss_health: Number(form.elements.arena_boss_health?.value || 5),
            arena_damage_threshold: Number(form.elements.arena_damage_threshold?.value || 60),
            arena_attacks_per_round: Number(form.elements.arena_attacks_per_round?.value || 2),
          } : {};
          const data = await adminApi('arena_create_room', {
            title: form.elements.title.value,
            preset,
            expected_players: Number(form.elements.expected_players.value || 0),
            ...arenaConfigPayload,
          });
          const room = data.room;
          if (room && room.id) {
            // A sala nasce já com as missões marcadas, na ordem do formulário:
            // o professor abre a sala sabendo exatamente o que os alunos vão ver.
            const missionIds = [...form.querySelectorAll('input[name="mission_ids"]:checked')].map((input) => input.value);
            for (const [index, challengeId] of missionIds.entries()) {
              message(node, `Montando a sala — missão ${index + 1} de ${missionIds.length}...`, 'info');
              await adminApi('arena_add_round', { room_id: room.id, challenge_id: challengeId });
            }
            closeDialog();
            state.selectedRoomId = room.id;
            await refreshAll();
            await refreshDetail(room.id);
          }
        }
      } catch (error) {
        const node = $('.form-message', form);
        fail(node, error);
      }
    });

    // Preset da nova sala: o campo de participantes e o seletor de missoes
    // dependem da escolha (Personalizado e o unico que escolhe missoes).
    $('[data-arena-dialog]')?.addEventListener('change', (event) => {
      if (event.target.matches('[data-arena-preset]')) {
        const preset = event.target.value;
        const form = event.target.closest('form');
        const hint = form.querySelector('[data-arena-preset-hint]');
        if (hint) hint.textContent = PRESET_HINTS[preset] || '';
        const playersField = form.querySelector('[data-arena-players-field]');
        if (playersField) playersField.hidden = preset === 'classic';
        const missionsField = form.querySelector('[data-arena-room-missions]');
        if (missionsField) missionsField.hidden = !['personalizado', 'arena'].includes(preset);
        const arenaField = form.querySelector('[data-arena-room-arena]');
        if (arenaField) arenaField.hidden = preset !== 'arena';
        updateMissionCount(form);
      } else if (event.target.matches('[data-add-round-challenge]')) {
        renderAddRoundPreview();
      } else if (event.target.matches('input[name="mission_ids"]')) {
        updateMissionCount(event.target.closest('form'));
      } else if (event.target.matches('[data-bulk-image]')) {
        const file = event.target.files?.[0];
        const preview = $(`[data-bulk-preview="${event.target.dataset.bulkImage}"]`);
        if (!file || !preview) return;
        if (file.size > 1_400_000) {
          alert('Imagem muito grande (máximo ~1,4 MB).');
          event.target.value = '';
          return;
        }
        fileToDataUrl(file).then((dataUrl) => {
          const img = $('img', preview);
          if (img) img.src = dataUrl;
          preview.hidden = false;
        });
      } else if (event.target.matches('[data-challenge-form] [name="modality"], [data-challenge-form] [name="category"]')) {
        // A modalidade escolhida decide se a missão precisa de imagem. O campo
        // passa a aparecer quando vira necessário — e nunca some com o que já
        // existe: o input fica no formulário, aberto ou fechado.
        const form = event.target.closest('[data-challenge-form]');
        const fold = $('[data-form-fold="imagem"]', form);
        if (fold && modalidadePrecisaDeImagem(form)) fold.open = true;
      } else if (event.target.matches('input[name="reference_image_file"]')) {
        const file = event.target.files?.[0];
        const preview = $('[data-image-preview]');
        if (!file || !preview) return;
        if (file.size > 1_400_000) {
          alert('Imagem muito grande (máximo ~1,4 MB).');
          event.target.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          preview.hidden = false;
          $('img', preview).src = String(reader.result);
        };
        reader.readAsDataURL(file);
      }
    });

    $('[data-arena-dialog]')?.addEventListener('click', async (event) => {
      if (event.target.closest('[data-arena-dialog-close]')) {
        closeDialog();
        return;
      }
      // O aviso de pendencias tambem corrige: um modal nao abre outro, entao
      // fecha o aviso e abre o desafio no campo que falta.
      const apply = event.target.closest('button[data-bulk-apply]');
      if (apply) {
        applyBulkFill(apply.dataset.bulkApply);
        return;
      }
      // Tempo: "usar sugestão" preenche a linha com o tempo sugerido (o professor
      // ainda pode ajustar depois de aceitar).
      const useTiming = event.target.closest('button[data-timing-use]');
      if (useTiming) {
        const item = useTiming.closest('[data-timing-item]');
        const field = $('[data-timing-input]', item);
        const suggestion = Number(useTiming.dataset.timingValue) || 0;
        if (field && suggestion > 0) field.value = formatSeconds(suggestion);
        refreshTimingTotal();
        return;
      }
      const applySuggestions = event.target.closest('button[data-timing-apply-suggestions]');
      if (applySuggestions) {
        const node = $('[data-room-timing-message]', applySuggestions.closest('form'));
        let filled = 0;
        for (const item of $$('[data-timing-item]')) {
          const field = $('[data-timing-input]', item);
          const suggestion = Number($('button[data-timing-use]', item)?.dataset.timingValue) || 0;
          // Só o que está em branco: o tempo que o professor já digitou fica.
          if (field && !field.value.trim() && suggestion > 0) {
            field.value = formatSeconds(suggestion);
            filled += 1;
          }
        }
        refreshTimingTotal();
        message(node, filled
          ? `${filled} ${filled === 1 ? 'tempo aceito' : 'tempos aceitos'} das sugestões. Ajuste o que quiser antes de salvar.`
          : 'Nenhuma missão em branco: as sugestões já foram aceitas.', 'info');
        return;
      }
      const fixAll = event.target.closest('button[data-action="fix-all"]');
      if (fixAll) {
        const roomId = fixAll.dataset.roomId;
        closeDialog();
        try {
          await openBulkFix(roomId);
        } catch (error) {
          alert(error.message);
        }
        return;
      }
      const fix = event.target.closest('button[data-action="fix-round"]');
      if (fix) {
        const payload = {
          challengeId: fix.dataset.challengeId,
          missing: (fix.dataset.missing || '').split(',').filter(Boolean),
          roomId: state.selectedRoomId,
        };
        closeDialog();
        try {
          await openChallengeFix(payload);
        } catch (error) {
          alert(error.message);
        }
        return;
      }
      const clear = event.target.closest('[data-image-preview-clear]');
      if (clear) {
        const preview = $('[data-image-preview]');
        preview.hidden = true;
        $('img', preview).src = '';
        const input = $('input[name="reference_image_file"]');
        if (input) input.value = '';
        const hidden = $('input[name="reference_image"]');
        if (hidden) hidden.value = '';
      }
    });

    // Tela unica: digitar no prompt de cima (ou num gabarito) atualiza as contas
    // e quais atalhos de aplicacao fazem sentido agora.
    $('[data-arena-dialog]')?.addEventListener('input', (event) => {
      if (event.target.matches('[data-bulk-fill-source], [data-bulk-gabarito]')) refreshBulkFill();
      if (event.target.matches('[data-timing-input]')) refreshTimingTotal();
      if (event.target.closest('[data-arena-create-room]')) refreshArenaConfigResumo();
    });

    // Criterios: habilita/desabilita peso
    $('[data-arena-dialog]')?.addEventListener('change', (event) => {
      if (event.target.matches('input[name="criteria"]')) {
        const weight = $(`input[name="weight_${event.target.value}"]`);
        if (weight) weight.disabled = !event.target.checked;
      }
    });

    // Detalhe: botao de adicionar missao (draft/waiting)
    $('[data-arena-detail]')?.addEventListener('click', (event) => {
      if (event.target.matches('[data-action="add-round"]')) {
        addRoundDialog(state.selectedRoomId);
      }
    });

    /**
     * O resumo da alça dos ajustes da partida (modo Arena): o professor lê o que
     * escolheu sem abrir nada — "3 rodadas · Juiz 5 ♥ · dano a partir de 60% · 2
     * ataques". Campo vazio cai no valor recomendado, que é o mesmo que o
     * servidor aplica ao receber o formulário: o resumo não promete à sala o que
     * ela não vai fazer. O resumo lê o formulário, não um objeto paralelo — o que
     * ele diz é o que está nos campos, inclusive depois de fechar e reabrir.
     */
    function arenaConfigResumo(form) {
      const numero = (nome, recomendado) => {
        const valor = Number(String(form?.querySelector(`[name="${nome}"]`)?.value ?? '').replace(',', '.'));
        return Number.isFinite(valor) && valor > 0 ? valor : recomendado;
      };
      return `Partida — ${numero('arena_rounds', 3)} rodadas · Juiz ${numero('arena_boss_health', 5)} ♥ · dano a partir de ${numero('arena_damage_threshold', 60)}% · ${numero('arena_attacks_per_round', 2)} ataques`;
    }

    function refreshArenaConfigResumo() {
      const resumo = $('[data-arena-arena-summary]');
      if (resumo) resumo.textContent = arenaConfigResumo($('[data-arena-create-room]'));
    }

    // Create room function
    window.openCreateRoomDialog = function() {
      openDialog('Nova sala', `
        <form class="arena-challenge-form" data-arena-create-room>
          <label class="arena-field">
            <span>Título</span>
            <input name="title" maxlength="120" placeholder="ENGENHARIA DE PROMPT - TURMA 2026" required>
          </label>
          <label class="arena-field">
            <span>Modo de jogo</span>
            <select name="preset" data-arena-preset>
              <option value="turma">Turma</option>
              <option value="classic">Clássico</option>
              <option value="personalizado">Personalizado</option>
              <option value="arena">Arena — Turma vs. Juiz</option>
            </select>
            <p class="arena-field-hint" data-arena-preset-hint>${PRESET_HINTS['turma'] || ''}</p>
          </label>
          <label class="arena-field" data-arena-players-field>
            <span>Participantes</span>
            <input name="expected_players" type="number" min="0" max="50" value="35">
          </label>
          <fieldset class="arena-room-missions" data-arena-room-missions hidden>
            <legend>Missões desta sala</legend>
            <p class="arena-room-missions-hint">Marque os desafios desta sala, na ordem em que os alunos vão ver.</p>
            <div class="arena-room-missions-list">
              ${state.challenges.length ? state.challenges.map((challenge) => `
                <label class="arena-room-mission-option">
                  <input type="checkbox" name="mission_ids" value="${esc(challenge.id)}">
                  <span class="arena-room-mission-thumb">${challenge.reference_image ? `<img src="${esc(challenge.reference_image)}" alt="" loading="lazy">` : '<i>sem imagem</i>'}</span>
                  <span class="arena-room-mission-text">
                    <strong>${esc(challenge.title)}</strong>
                    <small>${MODALITY_LABELS[challenge.modality] || challenge.modality} · ${challenge.reference_text ? 'com gabarito' : 'sem gabarito'}</small>
                  </span>
                </label>`).join('') : '<p class="arena-empty">Nenhum desafio no banco ainda. Crie um em “Desafios” ou use uma aula.</p>'}
            </div>
            <p class="arena-room-missions-count" data-arena-room-missions-count></p>
          </fieldset>
          <details class="arena-form-fold arena-room-arena" data-arena-room-arena hidden>
            <summary data-arena-arena-summary>${esc(arenaConfigResumo(null))}</summary>
            <div class="arena-arena-config-grid">
              <label><span>Rodadas</span><input name="arena_rounds" type="number" min="1" max="6" value="3"></label>
              <label><span>Corações do Juiz</span><input name="arena_boss_health" type="number" min="1" max="10" value="5"></label>
              <label><span>% para causar dano</span><input name="arena_damage_threshold" type="number" min="5" max="100" value="60"></label>
              <label><span>Ataques por rodada</span><input name="arena_attacks_per_round" type="number" min="1" max="3" value="2"></label>
            </div>
          </details>
          <p class="form-message" data-arena-create-message></p>
          <div class="arena-dialog-actions">
            <button class="ghost-link" type="button" data-arena-dialog-close>Cancelar</button>
            <button class="figma-cta figma-cta-blue" type="submit">Criar sala</button>
          </div>
        </form>
      `);
      refreshArenaConfigResumo();
    };

    // Inicio: o servidor ja decidiu pelo cookie se entrega o login ou o painel
    // completo (hasContent). RefreshAll valida a sessao; se o cookie expirar
    // entre o render e o primeiro fetch (401), cai de volta no login.
    (async () => {
      const hasContent = Boolean($('[data-admin-arena-content]'));
      if (hasContent) {
        showContent();
        
        // Setup sidebar active state toggle
        const sidebarLinks = document.querySelectorAll('.sidebar-link');
        if (sidebarLinks.length > 0) {
          const updateActive = () => {
            const hash = window.location.hash || '#overview';
            sidebarLinks.forEach(l => {
              const href = l.getAttribute('href');
              if (href && href.startsWith('#')) {
                if (href === hash) l.classList.add('is-active');
                else l.classList.remove('is-active');
              }
            });
          };
          window.addEventListener('hashchange', updateActive);
          // Only update if there's a hash, otherwise let the default HTML 'is-active' stand
          if (window.location.hash) updateActive();
        }
        
        try {
          await refreshAll();
        } catch (error) {
          showLogin();
        }
      } else {
        showLogin();
      }
    })();
  }

  // =========================================================================
  // TV / PROJECAO (tela da sala na parede: PIN, participantes e rodada ao vivo)
  // =========================================================================

  if (page === 'tv') {
    // A sessao de projecao (8h) viaja no cookie HttpOnly arena_tv_session —
    // a URL so carrega o PIN da sala; o servidor injeta tv_token no payload.
    const params = new URLSearchParams(window.location.search);
    // `let`: o codigo curto digitado na TV define o pin apos validar.
    let pin = (params.get('pin') || '').trim();
    const content = $('[data-tv-content]');
    const roomMeta = $('[data-tv-room]');
    const presetChip = $('[data-tv-preset]');
    const roomTitleEl = $('[data-tv-room-title]');
    const pad = (value) => String(value).padStart(2, '0');

    // Alternar tela cheia na projeção (botão e atalho tecla F)
    const fsBtn = $('[data-tv-fullscreen]');
    function toggleTvFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
    fsBtn?.addEventListener('click', toggleTvFullscreen);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
          toggleTvFullscreen();
        }
      }
    });
    document.addEventListener('fullscreenchange', () => {
      if (fsBtn) {
        fsBtn.textContent = document.fullscreenElement ? '✕ Sair' : '⛶ Tela cheia';
      }
    });

    let clockTimer = null;
    let lastFetch = 0;
    let sseOff = null;
    let poll = null;
    let dead = false;
    // Uma consulta em voo, a sala desta projecao e a chave do que ja esta na
    // tela: a parede so redesenha quando o estado visivel muda.
    const gate = createFetchGate();
    const hiddenClock = hiddenPollClock();
    let tvRoomId = null;
    let tvKey = null;

    // Substitui o conteudo da parede. Sem guarda propria de proposito: quem
    // evita reconstruir a mesma tela e a comparacao de estado em `refresh`, e
    // manter as duas guardas faria a segunda nunca disparar (a primeira ja
    // cortou). O cronometro continua rodando por fora, no intervalo local.
    function setContent(markup, kind) {
      content.className = 'arena-tv-content' + (kind ? ` is-${kind}` : '');
      content.innerHTML = markup;
    }

    function standingValue(row, classic) {
      return Number(row.total_points ?? row.points_sum ?? row.points ?? row.avg_percent ?? row.percent ?? 0);
    }

    function standingLabel(row, classic) {
      return `${standingValue(row, classic).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts`;
    }

    function rankingMarkup(rows, classic) {
      if (!rows || !rows.length) return '<p class="arena-tv-empty">Ainda sem pontuação.</p>';
      return rows.map((row, index) => {
        const position = index + 1;
        const champion = position === 1;
        return `
          <li class="arena-tv-rank pos-${Math.min(position, 9)}${champion ? ' is-champion' : ''}">
            <span class="arena-tv-rank-pos">
              ${medalImage(position, 'arena-tv-rank-medal')}
              <span>${position}º</span>
            </span>
            <span class="arena-tv-rank-player">
              ${winnerAvatar('arena-tv-rank-avatar')}
              <strong>${esc(row.name)}</strong>
            </span>
            <b class="arena-tv-rank-points">${pointsStar('arena-tv-rank-star')}${esc(standingLabel(row, classic))}</b>
          </li>`;
      }).join('');
    }

    function rosterMarkup(tv) {
      const room = tv.room;
      const expected = room.expected_players || room.settings?.maxPlayers || 0;
      const spots = expected > 0 ? `${room.participants} de ${expected}` : `${room.participants}`;
      const entries = tv.roster && tv.roster.length ? tv.roster.map((entry) => `
        <li class="${entry.connected ? 'is-on' : ''}" title="${entry.connected ? 'conectado' : 'aguardando'}">
          <i aria-hidden="true"></i>${esc(entry.name)}
        </li>`).join('') : '<li class="arena-tv-empty-li">Ninguém na sala ainda.</li>';
      return `
        <section class="arena-tv-roster-panel">
          <header class="arena-tv-block-head">
            <h2>Participantes</h2>
            <span class="arena-tv-spots"><b>${spots}</b> na sala</span>
          </header>
          <ul class="arena-tv-roster">${entries}</ul>
        </section>`;
    }

    function miniRankingMarkup(tv, classic) {
      if (!tv.ranking || !tv.ranking.length) return '';
      return `
        <section class="arena-tv-mini-ranking">
          <header class="arena-tv-block-head">
            <h2>Classificação geral</h2>
          </header>
          <ol class="arena-tv-rank-list">${rankingMarkup(tv.ranking, classic)}</ol>
        </section>`;
    }

    /**
     * Sorteio da vez na projecao: o que a turma precisa ver sem o professor
     * dizer em voz alta — quem entra em campo agora, o ultimo resultado e, no
     * mata-mata, quem continua no jogo e quem saiu. Sem controles: a TV so
     * mostra (quem sorteia e o painel).
     */
    function drawTvMarkup(tv) {
      const draw = tv?.draw;
      // Sem sorteio comecado nao ha o que projetar — nada de bloco vazio na
      // espera (a TV da espera ja mostra PIN, QR e quem entrou).
      if (!draw || !draw.counts || !(draw.started || draw.current || draw.champion)) return '';
      const knockout = draw.mode === 'mata-mata';
      const round = Number(draw.round) || 1;
      const current = draw.current;
      const champion = draw.champion;
      const last = (draw.history || []).slice(-1)[0];
      // Nome de turma inteira nao cabe na parede: lista os primeiros e conta o resto.
      const cap = (list, limit = 12) => (list.length > limit
        ? `${list.slice(0, limit).join(' · ')} · e mais ${list.length - limit}`
        : list.join(' · '));
      return `
        <section class="arena-tv-draw" data-tv-draw>
          <header class="arena-tv-block-head">
            <h2>🎲 Sorteio da vez</h2>
            <span class="arena-tv-draw-mode">${knockout ? `Mata-mata · Rodada ${round}` : 'Sorteio livre'}</span>
          </header>
          ${current ? `
            <div class="arena-tv-draw-now">
              <small>É A VEZ DE</small>
              <ul class="arena-tv-draw-names">${current.names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul>
            </div>`
          : champion ? `
            <div class="arena-tv-draw-champion">
              <span>🏆 CAMPEÃO DO SORTEIO</span>
              <strong>${esc(champion.name)}</strong>
            </div>`
          : last ? `
            <p class="arena-tv-draw-last">
              <span>Última disputa</span> ${esc(last.names.join(' · '))}
              <b>${last.bye ? 'passou direto' : `🏆 ${esc(last.winner_name)}`}</b>
            </p>` : ''}
          ${knockout ? `
            <div class="arena-tv-draw-bracket">
              <p class="is-in"><b>${draw.counts.in_game ?? draw.counts.eligible}</b> ainda no jogo${draw.in_game?.length ? ` — ${esc(cap(draw.in_game.map((entry) => entry.name)))}` : ''}</p>
              ${draw.eliminated?.length ? `<p class="is-out"><b>${draw.eliminated.length}</b> fora do jogo — ${esc(cap(draw.eliminated.map((entry) => entry.name)))}</p>` : ''}
            </div>` : ''}
        </section>`;
    }

    /**
     * Modo Arena na parede: o Juiz com os corações que sobraram, a energia da
     * turma e — o que a TV precisa contar sem o professor falar nada — o desafio
     * da vez, o voto e o resultado do ataque. Uma informação principal por
     * momento: quem está escrevendo vê a missão; a turma votando vê a pergunta;
     * o ataque apareceu, vê o dano.
     */
    /**
     * Bloco do Modo Arena na projecao.
     *
     * `compact` e a faixa da rodada em andamento: enquanto a turma escreve, a
     * TV precisa continuar contando a historia (Juiz e energia), sem repetir o
     * cabecalho da rodada nem despejar a pergunta do desafio no meio da missao.
     */
    function arenaTvMarkup(tv, { compact = false, headlineIn = false } = {}) {
      const arena = tv?.arena;
      if (!arena?.enabled) return '';
      const boss = arena.boss || {};
      const dynamic = arena.dynamic;
      const wildcard = arena.wildcard;
      const revealed = Boolean(dynamic?.revealed);
      const result = dynamic?.result;
      const phase = arena.phase;

      if (compact) {
        return `
        <section class="arena-tv-mode is-strip" data-tv-arena>
          <div class="arena-tv-mode-boss">
            <span class="arena-tv-mode-boss-label">☠️ JUIZ IA</span>
            ${arenaHeartsMarkup(arena)}
            ${arenaEnergyMarkup(arena, 'is-tv')}
          </div>
          ${arena.competitors?.length ? `<p class="arena-tv-mode-competitors">EM CAMPO${arena.competitors.map((entry) => ` <b>${esc(entry.name)}</b>`).join(' · ')}</p>` : ''}
        </section>`;
      }

      // Pergunta da vez: Wild Card (quem entra) ou desafio coletivo.
      let question = '';
      if (phase === 'wildcard' && wildcard && !wildcard.revealed) {
        question = `<div class="arena-tv-question">
          <small>🎲 WILD CARD — QUEM ENTRA NA ARENA?</small>
          <ul class="arena-tv-options">
            ${wildcard.options.map((option) => `<li><b>${esc(option.key)}</b><span>${esc(String(option.prompt || '').slice(0, 180))}${String(option.prompt || '').length > 180 ? '…' : ''}</span><em>${Number(option.votes || 0)} voto${Number(option.votes || 0) === 1 ? '' : 's'}</em></li>`).join('')}
          </ul>
          <p class="arena-tv-question-foot">${Number(wildcard.votes || 0)} voto${Number(wildcard.votes || 0) === 1 ? '' : 's'} até agora</p>
        </div>`;
      } else if (dynamic && !revealed) {
        question = `<div class="arena-tv-question">
          <small>${esc(dynamic.label)}</small>
          <h2>${esc(dynamic.question)}</h2>
          ${dynamic.hint ? `<p class="arena-tv-question-hint">🔍 ${esc(dynamic.hint)}</p>` : ''}
          ${dynamic.prompt ? `<blockquote class="arena-tv-question-prompt">${esc(String(dynamic.prompt).slice(0, 320))}${String(dynamic.prompt).length > 320 ? '…' : ''}</blockquote>` : ''}
          <ul class="arena-tv-options">${(dynamic.options || []).map((option) => `<li><b>${esc(arenaOptionKey(option))}</b><span>${esc(arenaOptionLabel(option))}</span></li>`).join('')}</ul>
        </div>`;
      } else if (phase === 'reveal' && result) {
        question = `<div class="arena-tv-attack${result.damaged ? ' is-damage' : ' is-resist'}">
          <span class="arena-tv-attack-accuracy">${esc(String(result.accuracy ?? 0))}%</span>
          <strong>${result.damaged ? 'DANO NO JUIZ! −1 ❤️' : 'O JUIZ RESISTIU.'}</strong>
          <small>${Number(result.correct || 0)} de ${Number(result.total || 0)} acertaram${result.needed ? ` · eram necessários ${result.needed}` : ''}</small>
          ${result.energy_gained ? `<p class="arena-tv-attack-energy">⚡ +${Number(result.energy_gained)} de energia${result.powers_unlocked?.length ? ` · PODER DESBLOQUEADO: ${result.powers_unlocked.map((key) => esc(ARENA_POWER_GLYPHS[key] || key)).join(' ')}` : ''}</p>` : ''}
        </div>`;
      } else if (phase === 'finished') {
        const awards = arena.awards;
        question = `<div class="arena-tv-attack is-verdict${headlineIn ? ' is-in' : ''}${boss.defeated ? ' is-damage' : ' is-resist'}">
          <strong><span class="arena-tv-verdict-mark" aria-hidden="true">${boss.defeated ? '🏆' : '😈'}</span> ${boss.defeated ? 'A TURMA DERROTOU O JUIZ' : 'O JUIZ SOBREVIVEU'}</strong>
          <small>${boss.defeated ? 'O Juiz ficou sem corações.' : `Sobraram ${Number(boss.health || 0)} de ${Number(boss.max_health || 0)} corações.`}</small>
          ${awards ? `<ul class="arena-tv-awards">
            ${awards.champion ? `<li><span>🏆 Campeão da Arena</span><b>${esc(awards.champion.name)}</b><em>${Math.round(Number(awards.champion.value || 0))}%</em></li>` : ''}
            ${awards.analyst ? `<li><span>🧠 Melhor Analista</span><b>${esc(awards.analyst.name)}</b><em>${Number(awards.analyst.value || 0)} acertos</em></li>` : ''}
            ${awards.calibration ? `<li><span>🎯 Mestre da Calibração</span><b>${esc(awards.calibration.name)}</b><em>${Math.round(Number(awards.calibration.value || 0) * 100)}%</em></li>` : ''}
            ${awards.evolution ? `<li><span>📈 Maior Evolução</span><b>${esc(awards.evolution.name)}</b><em>+${Math.round(Number(awards.evolution.value || 0))}%</em></li>` : ''}
          </ul>` : ''}
        </div>`;
      }

      return `
        <section class="arena-tv-mode" data-tv-arena>
          <header class="arena-tv-mode-head">
            <span class="arena-tv-mode-round">RODADA ${esc(String(arena.round))}/${esc(String(arena.rounds))}</span>
            <span class="arena-tv-mode-phase">${esc(ARENA_PHASE_LABELS_UI[phase] || phase)}</span>
          </header>
          <div class="arena-tv-mode-boss">
            <span class="arena-tv-mode-boss-label">☠️ JUIZ IA</span>
            ${arenaHeartsMarkup(arena, { size: 'is-big' })}
            ${arenaEnergyMarkup(arena, 'is-tv')}
          </div>
          ${arena.competitors?.length ? `<p class="arena-tv-mode-competitors">EM CAMPO${arena.competitors.map((entry) => ` <b>${esc(entry.name)}</b>`).join(' · ')}</p>` : ''}
          ${question}
        </section>`;
    }

    /**
     * O instante da vitória: o Juiz já está em 0, mas o último coração ainda
     * está no ar — a TV mostra ele quebrando e caindo antes de anunciar a
     * manchete. Nada de texto novo: a imagem conta a história.
     */
    function arenaVerdictFallMarkup(tv) {
      const arena = tv.arena;
      return `
        <section class="arena-tv-mode is-fall" data-tv-arena data-tv-arena-fall>
          <header class="arena-tv-mode-head">
            <span class="arena-tv-mode-round">RODADA ${esc(String(arena.round))}/${esc(String(arena.rounds))}</span>
            <span class="arena-tv-mode-phase">${esc(ARENA_PHASE_LABELS_UI[arena.phase] || arena.phase)}</span>
          </header>
          <div class="arena-tv-mode-boss">
            <span class="arena-tv-mode-boss-label">☠️ JUIZ IA</span>
            ${arenaHeartsMarkup(arena, { size: 'is-big', falling: true })}
          </div>
        </section>`;
    }

    // Quanto tempo a queda do último coração segura a manchete. Curto de
    // propósito: o momento precisa ser lido, não atrasar a aula.
    const VERDICT_FALL_MS = 2100;
    let fallRoom = '';
    let fallUntil = 0;
    let fallTimer = null;
    let headlineIn = false;

    /** Quem prefere menos movimento recebe a manchete na hora, sem a queda. */
    function semMovimento() {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    }

    /**
     * A TV no fim da partida passa por dois quadros: a queda do último
     * coração e a manchete. A queda roda uma vez por sala, e enquanto está no
     * ar a TV não redesenha — um redesenho reiniciaria a animação do zero.
     */
    function paintArenaVerdict(tv) {
      const arena = tv.arena;
      const key = arena?.boss?.defeated ? String(tv.room?.pin || tv.room?.id || '') : '';
      if (!key || semMovimento()) {
        // Juiz vivo (ou quem prefere menos movimento): manchete direto. Soltar a
        // sala aqui faz a queda voltar a valer num recomeço da partida.
        fallRoom = '';
        setContent(arenaTvMarkup(tv), 'results');
        return;
      }
      if (Date.now() < fallUntil) return;
      if (fallRoom !== key) {
        fallRoom = key;
        fallUntil = Date.now() + VERDICT_FALL_MS;
        setContent(arenaVerdictFallMarkup(tv), 'results');
        if (fallTimer) window.clearTimeout(fallTimer);
        fallTimer = window.setTimeout(() => {
          fallTimer = null;
          fallUntil = 0;
          headlineIn = true;
          renderTV(tv);
        }, VERDICT_FALL_MS);
        return;
      }
      const entra = headlineIn;
      headlineIn = false;
      setContent(arenaTvMarkup(tv, { headlineIn: entra }), 'results');
    }

    function lobbyMarkup(tv) {
      const room = tv.room;
      const classic = isClassicish(room);
      const waiting = room.status === 'waiting' || room.status === 'open';
      return `
        <div class="arena-tv-lobby">
          <div class="arena-tv-lobby-main">
            <div class="arena-tv-pin">
              <small>CODIGO DA SALA</small>
              <strong>${esc(formatPin(room.pin))}</strong>
            </div>
            <p class="arena-tv-waiting">
              <span class="arena-tv-pulse" aria-hidden="true"></span>
              ${waiting ? 'Aguardando o professor iniciar a batalha…' : 'Aguardando a próxima rodada…'}
            </p>
            ${arenaTvMarkup(tv)}
            ${drawTvMarkup(tv)}
            ${tv.entry_qr ? `
            <div class="arena-tv-join">
              <img class="arena-tv-join-qr" src="${tv.entry_qr.data_url}" alt="QR code — tela de entrada dos alunos no celular">
              <div class="arena-tv-join-text">
                <strong>Entrem no celular</strong>
                <span>${esc(tv.entry_qr.url)}</span>
                <small>código <b>${esc(formatPin(room.pin))}</b> + nome de vocês</small>
              </div>
            </div>` : ''}
            ${rosterMarkup(tv)}
          </div>
          ${miniRankingMarkup(tv, classic)}
        </div>`;
    }

    function roundMarkup(tv) {
      const room = tv.room;
      const round = tv.current_round;
      const classic = isClassicish(room);
      const total = tv.total_rounds || room.settings?.rounds || tv.rounds?.length || 3;
      const paused = round.paused_at != null && Number.isFinite(Number(round.paused_at));
      const title = classic ? 'Escreva o prompt que criou esta imagem' : round.title;
      const tagline = classic
        ? 'A imagem veio de um prompt real.'
        : (round.mission ? round.mission.slice(0, 220) : '');
      // Missao sem cronometro nao tem 0:00 para contar: a TV diz o que e. Tres
      // estados diferentes, com o mesmo espaco na tela: pausada, sem limite e
      // contando (que ai sim pode chegar a 0:00 quando o tempo acaba).
      const untimed = !paused && !round.deadline_at;
      const remaining = paused || untimed ? 0 : Math.max(0, Number(round.deadline_at) - Number(round.server_now || 0));
      const timerLabel = paused ? 'Pausada' : untimed ? 'Sem limite de tempo' : formatSeconds(remaining);
      return `
        <div class="arena-tv-round">
          <div class="signal-tape" aria-hidden="true"></div>
          <header class="arena-tv-round-head">
            <span class="arena-tv-round-badge">${classic ? `RODADA ${pad(round.position)}/${pad(total)} — ADIVINHE O PROMPT` : `MISSAO ${pad(round.position)}/${pad(total)}`}</span>
            <span class="arena-tv-timer${paused ? ' is-paused' : ''}${untimed ? ' is-untimed' : ''}" data-tv-countdown="${esc(round.deadline_at ?? '')}" data-tv-server="${esc(round.server_now ?? '')}" data-tv-base-ms="${Date.now()}" data-tv-paused="${paused ? '1' : ''}" data-tv-untimed="${untimed ? '1' : ''}">${timerLabel}</span>
          </header>
          ${arenaTvMarkup(tv, { compact: true })}
          <div class="arena-tv-round-body">
            ${round.reference_image ? `<figure class="arena-tv-figure"><img src="${esc(round.reference_image)}" alt="Imagem da rodada"></figure>` : ''}
            <div class="arena-tv-round-copy">
              <h1>${esc(title)}</h1>
              ${tagline ? `<p>${esc(tagline)}</p>` : ''}
              ${tv.draw?.current?.names?.length ? `<p class="arena-tv-round-vez">🎲 Vez de <b>${tv.draw.current.names.map((name) => esc(name)).join(' · ')}</b></p>` : ''}
              ${tv.arena?.enabled && tv.arena.competitors?.length ? `<p class="arena-tv-round-vez is-arena">⚔️ Na Arena: <b>${tv.arena.competitors.map((entry) => esc(entry.name)).join(' · ')}</b></p>` : ''}
              <div class="arena-tv-progress">
                <b>${Number(round.submissions || 0)}</b>
                <span>de ${Math.max(room.participants || 0, Number(round.submissions || 0))} prompts recebidos</span>
              </div>
            </div>
          </div>
        </div>`;
    }

    function resultsMarkup(tv, results, final) {
      const room = tv.room;
      const classic = isClassicish(room);
      const rows = final ? tv.ranking : results?.ranking || [];
      const closed = room.status === 'ended' || room.status === 'archived';
      // UM título principal por estado. O selo que dizia "CLASSIFICAÇÃO FINAL"
      // acima de "Batalha encerrada!" era a terceira camada dizendo o mesmo que
      // o h1; e a linha de baixo repetia o número da rodada que o próprio h1 já
      // diz, então ela carrega só o nome da missão, que é informação nova.
      const heading = final ? (closed ? 'Batalha encerrada!' : 'Resultado final') : `Resultado da rodada ${results?.position || ''}`;
      const sub = results?.title && !final ? results.title : '';
      const champion = final && rows && rows.length ? rows[0] : null;
      const winner = champion ? `
            <div class="arena-tv-champion">
              ${medalImage(1, 'arena-tv-champion-medal')}
              ${winnerAvatar('arena-tv-champion-avatar')}
              <span class="arena-tv-champion-copy">
                <span class="arena-tv-champion-kicker">Campeão da batalha</span>
                <strong>${esc(champion.name)}</strong>
                <b>${pointsStar('arena-tv-champion-star')}${esc(standingLabel(champion, classic))}</b>
              </span>
            </div>` : '';
      return `
        <div class="arena-tv-results">
          <div class="signal-tape" aria-hidden="true"></div>
          <header class="arena-tv-results-head">
            <h1>${esc(heading)}</h1>
            ${sub ? `<p>${esc(sub)}</p>` : ''}
            ${winner}
          </header>
          <ol class="arena-tv-rank-list arena-tv-rank-list-large">${rankingMarkup(rows, classic)}</ol>
          ${arenaTvMarkup(tv)}
        </div>`;
    }

    function renderTV(tv) {
      const room = tv?.room;
      if (!room) return;
      roomMeta.hidden = false;
      presetChip.textContent = PRESET_LABELS[room.preset] || room.preset || 'Sala';
      presetChip.className = `arena-preset-chip is-${esc(room.preset || '')}`;
      roomTitleEl.textContent = room.title || 'Sala';

      const finished = room.status === 'ended' || room.status === 'archived';
      if (finished) {
        setContent(resultsMarkup(tv, null, true), 'results');
        return;
      }
      // O Modo Arena termina com veredito proprio: com a sala ainda aberta, a
      // parede nao pode dizer "aguardando o professor iniciar a batalha" com o
      // Juiz ja derrotado — o fim da partida E o conteudo principal da TV.
      if (tv.arena?.enabled && tv.arena.phase === 'finished') {
        paintArenaVerdict(tv);
        return;
      }
      const liveResults = [...(tv.results || [])].reverse().find((entry) => entry.status === 'results');
      if (room.phase === 'final_results') {
        setContent(resultsMarkup(tv, liveResults, true), 'results');
        return;
      }
      if (tv.current_round) {
        setContent(roundMarkup(tv), 'round');
        startCountdown();
        return;
      }
      if (liveResults && room.phase === 'round_results') {
        setContent(resultsMarkup(tv, liveResults, false), 'results');
        return;
      }
      setContent(lobbyMarkup(tv), 'lobby');
    }

    function startCountdown() {
      stopCountdown();
      // Sem cronometro ou pausada, nao ha o que contar: nada de acordar de 250
      // em 250ms para nao mudar nada na tela.
      const current = $('[data-tv-countdown]');
      if (current?.dataset.tvUntimed === '1' || current?.dataset.tvPaused === '1') return;
      clockTimer = window.setInterval(() => {
        const node = $('[data-tv-countdown]');
        if (!node) return stopCountdown();
        if (node.dataset.tvPaused === '1') return;
        const deadline = Number(node.dataset.tvCountdown || 0);
        if (!deadline) return;
        const base = Number(node.dataset.tvServer || 0);
        const elapsed = (Date.now() - Number(node.dataset.tvBaseMs || Date.now())) / 1000;
        const remaining = Math.max(0, deadline - base - elapsed);
        node.textContent = formatSeconds(remaining);
      }, 250);
    }

    function stopCountdown() {
      if (clockTimer) { window.clearInterval(clockTimer); clockTimer = null; }
    }

    function refresh(force) {
      if (dead) return Promise.resolve();
      if (!force && roomEventsAlive && Date.now() - lastFetch < 8000) return Promise.resolve();
      return gate.run(() => readTV());
    }

    async function readTV() {
      try {
        const data = await api('arena_tv', { pin }, { timeout: 9000 });
        lastFetch = Date.now();
        tvRoomId = data.tv?.room?.id ?? tvRoomId;
        // Estado equivalente: nao remexe a parede (e nao reinicia o que estiver
        // animando nela) para mostrar exatamente a mesma coisa.
        const key = renderKey(data.tv);
        if (key === tvKey) return;
        tvKey = key;
        renderTV(data.tv);
      } catch (error) {
        if (error.status === 404 || error.status === 403) {
          dead = true;
          stopPoll();
          stopCountdown();
          if (error.status === 403 && pin) {
            // Sessao expirada: volta para o codigo curto em vez de travar.
            showCodeEntry('Sua sessão de projeção expirou. Digite o código de projeção novamente.');
            return;
          }
          const expired = error.status === 403;
          setContent(`<div class="arena-tv-error"><h1>${esc(expired ? 'Sessão de projeção expirada' : 'Sala não encontrada')}</h1><p>${esc(expired ? 'Abra a projeção novamente pelo Painel do professor, na sala escolhida.' : 'Confira o código e abra a projeção pelo Painel do professor.')}</p></div>`, 'error');
        }
        // Outros erros: mantem o que esta na tela e tenta de novo no poll.
      }
    }

    // Tela da TV sem sessao: formulario de codigo curto (projecao em outro
    // aparelho). Ao validar, o servidor grava o cookie e entregamos a sala.
    function showCodeEntry(message) {
      stopPoll();
      setContent(`
        <div class="arena-tv-code-entry">
          <h1>Projeção da sala</h1>
          <p class="arena-tv-code-message">${esc(message || 'Peça o código de projeção ao professor — ele aparece no Painel do professor, em “Projeção”.')}</p>
          <form class="arena-tv-code-form" data-tv-code-form>
            <input data-tv-code-input inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000 000" aria-label="Código de projeção">
            <button type="submit" class="arena-tv-code-submit">Projetar</button>
          </form>
          <p class="arena-tv-code-error" data-tv-code-error hidden></p>
        </div>
      `, 'connect');
      const form = $('[data-tv-code-form]');
      if (!form) return;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = $('[data-tv-code-input]');
        const errorNode = $('[data-tv-code-error]');
        const digits = (input?.value || '').replace(/\D+/g, '');
        if (errorNode) errorNode.hidden = true;
        if (digits.length !== 6) {
          if (errorNode) { errorNode.textContent = 'Digite os 6 dígitos do código.'; errorNode.hidden = false; }
          input?.select();
          return;
        }
        const button = form.querySelector('button');
        if (button) { button.disabled = true; button.textContent = 'Conectando…'; }
        try {
          await redeemCode(digits);
        } catch (error) {
          if (button) { button.disabled = false; button.textContent = 'Projetar'; }
          if (errorNode) {
            errorNode.textContent = error.status === 429 ? error.message : 'Código inválido ou expirado. Confira com o professor.';
            errorNode.hidden = false;
          }
          console.error('[projecao]', error);
          input?.select();
        }
      });
      $('[data-tv-code-input]')?.focus();
    }

    // Troca o codigo curto por uma sessao de projecao (cookie no aparelho).
    // `fromQr` indica que o codigo veio da URL (?code=...) — nesse caso ele e
    // removido da URL apos validar, para nao ficar no historico do aparelho.
    async function redeemCode(digits, fromQr = false) {
      const data = await api('arena_tv_code', { code: digits }, { timeout: 9000 });
      pin = data.pin || data.tv?.room?.pin || data.tv?.room?.code || '';
      if (!pin) throw Object.assign(new Error('Sala não encontrada.'), { status: 404 });
      if (fromQr) {
        const next = '/tv.php' + (pin ? `?pin=${encodeURIComponent(pin)}` : '');
        try { history.replaceState(null, '', next); } catch { /* URL nao muda se nao der */ }
      }
      dead = false;
      tvRoomId = data.tv?.room?.id ?? tvRoomId;
      tvKey = renderKey(data.tv);
      renderTV(data.tv);
      connectAndPoll();
    }

    function connectAndPoll() {
      if (sseOff) { sseOff(); sseOff = null; }
      // A conexao e da sala projetada, provada pelo cookie da projecao.
      sseOff = subscribeRoomEvents(() => refresh(true), eventsQuery(tvRoomId));
      poll = window.setInterval(() => {
        if (!hiddenClock()) return;
        refresh(false);
      }, 2500);
      refresh(true);
    }

    // Projecao em aba oculta nao consulta; ao voltar, uma leitura imediata.
    onVisibleResume(() => { if (!dead) refresh(true); });

    function stopPoll() {
      if (poll) { window.clearInterval(poll); poll = null; }
      if (sseOff) { sseOff(); sseOff = null; }
    }

    // ---------------------------------------------------------------------
    // PREVIA DA PROJECAO (/tv-preview.php?room=ID): o mesmo renderTV, com o
    // estado escolhido pelo professor e sem sessao de projecao — a TV da turma
    // nao e aberta, nao e afetada e nada e gravado.
    // ---------------------------------------------------------------------
    const TV_PREVIEW_MODES = [
      ['lobby', 'Espera'],
      ['round', 'Rodada'],
      ['results', 'Resultado'],
      ['final', 'Fim / Campeão'],
    ];
    const tvPreviewState = { data: null, mode: 'lobby', roomId: '' };

    function tvPreviewBarMarkup(state) {
      const sample = Boolean(state?.sample);
      const selo = sample
        ? `<span class="arena-tv-preview-sample is-sample">EXEMPLO — ${esc(state.sample_reason || 'esta sala ainda não tem dados')}</span>`
        : `<span class="arena-tv-preview-sample">Dados reais desta sala${tvPreviewState.data?.player ? ` (${esc(tvPreviewState.data.player)})` : ''}</span>`;
      return `
        <div class="arena-tv-preview-head">
          <span class="arena-tv-preview-tag">PRÉVIA DA PROJEÇÃO</span>
          <strong>${esc(tvPreviewState.data?.room?.title || 'Sala')}</strong>
          <span>PIN ${esc(formatPin(tvPreviewState.data?.room?.pin || ''))}</span>
          <span class="arena-tv-preview-note">Nada disto está no ar.</span>
          ${selo}
          <a class="arena-tv-preview-back" href="/admin-arena.php">← Voltar ao painel</a>
        </div>
        <div class="arena-tv-preview-modes">
          ${TV_PREVIEW_MODES.map(([value, label]) => `<button type="button" class="arena-tv-preview-mode${value === tvPreviewState.mode ? ' is-current' : ''}" data-tv-preview-mode="${value}" aria-pressed="${value === tvPreviewState.mode}">${label}</button>`).join('')}
          <button type="button" class="arena-tv-preview-refresh" data-tv-preview-refresh title="Reler a sala agora">↻ Atualizar</button>
          <button type="button" class="arena-tv-preview-open" data-tv-preview-open>⛶ Abrir a TV de verdade</button>
          <span class="arena-tv-preview-message" data-tv-preview-message></span>
        </div>`;
    }

    function renderTvPreview() {
      const state = tvPreviewState.data?.states?.[tvPreviewState.mode];
      if (!state) return;
      const bar = $('[data-tv-preview-bar]');
      if (bar) bar.innerHTML = tvPreviewBarMarkup(state);
      stopCountdown();
      renderTV(state.tv);
    }

    /**
     * Relê a sala e redesenha o estado atual. O professor deixa a previa aberta
     * enquanto a turma joga: sem isso, o que ele veria seria a foto do momento
     * em que abriu a tela.
     */
    async function refreshTvPreview() {
      tvPreviewState.data = await api('arena_tv_preview', { room_id: tvPreviewState.roomId }, { timeout: 20000 });
      renderTvPreview();
    }

    async function selectTvMode(value) {
      tvPreviewState.mode = value;
      const note = $('[data-tv-preview-message]');
      if (note) note.textContent = '';
      try {
        await refreshTvPreview();
      } catch (error) {
        renderTvPreview();
        const node = $('[data-tv-preview-message]');
        if (node) node.textContent = error.message;
      }
    }

    /** Abre a projecao REAL da sala (token de 8h no cookie), em outra aba. */
    async function openRealProjection() {
      const note = $('[data-tv-preview-message]');
      const tab = window.open('about:blank', '_blank');
      try {
        const tv = await api('arena_tv_token', { room_id: tvPreviewState.roomId }, { timeout: 20000 });
        if (note) note.textContent = '';
        if (tab) tab.location.assign(tv.url);
        else window.location.assign(tv.url);
      } catch (error) {
        if (tab) tab.close();
        if (note) note.textContent = error.message;
      }
    }

    function wireTvPreview() {
      document.addEventListener('click', (event) => {
        const mode = event.target.closest('[data-tv-preview-mode]');
        if (mode) {
          selectTvMode(mode.dataset.tvPreviewMode);
          return;
        }
        if (event.target.closest('[data-tv-preview-refresh]')) {
          selectTvMode(tvPreviewState.mode);
          return;
        }
        if (event.target.closest('[data-tv-preview-open]')) openRealProjection();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { window.location.assign('/admin-arena.php'); return; }
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const order = TV_PREVIEW_MODES.map(([value]) => value);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        selectTvMode(order[(order.indexOf(tvPreviewState.mode) + step + order.length) % order.length]);
      });
    }

    async function startTvPreview() {
      const roomId = new URLSearchParams(window.location.search).get('room') || '';
      if (!roomId) {
        setContent('<div class="arena-tv-error"><h1>Prévia sem sala</h1><p>Abra a prévia pelo Painel do professor, na sala escolhida.</p></div>', 'error');
        return;
      }
      tvPreviewState.roomId = roomId;
      try {
        tvPreviewState.data = await api('arena_tv_preview', { room_id: roomId }, { timeout: 20000 });
        document.title = `Prévia da TV — ${tvPreviewState.data.room?.title || 'Sala'}`;
        const bar = document.createElement('div');
        bar.className = 'arena-tv-preview-bar';
        bar.dataset.tvPreviewBar = '';
        $('[data-arena-tv]')?.prepend(bar);
        wireTvPreview();
        renderTvPreview();
      } catch (error) {
        setContent(`<div class="arena-tv-error"><h1>Não foi possível abrir a prévia</h1><p>${esc(error.message)}</p></div>`, 'error');
      }
    }

    function startTV() {
      if (pin) {
        // O PIN identifica a sala na URL, mas o ID da sala vem do servidor — e a
        // conexao do stream e DA SALA. Entao a primeira leitura vem antes dela:
        // sem o id, a conexao nasceria no escopo global (so o evento da arena) e
        // a TV perderia o empurrao da propria sala.
        refresh(true).then(() => { if (tvRoomId) connectAndPoll(); });
        return;
      }
      // QR code do cockpit carrega /tv.php?code=... — valida sozinho, sem
      // digitar nada, e remove o codigo da URL (ja virou sessao no cookie).
      const codeParam = (params.get('code') || '').trim().replace(/\D+/g, '');
      if (codeParam.length === 6) {
        setContent(`<div class="arena-tv-error"><h1>Conectando…</h1><p>Validando o código de projeção.</p></div>`, 'connect');
        redeemCode(codeParam, true).catch((error) => {
          console.error('[projecao]', error);
          showCodeEntry(error.status === 403
            ? 'Código inválido ou expirado. Peça um novo código ao professor.'
            : 'Não foi possível conectar. Peça o código ao professor e digite abaixo.');
        });
        return;
      }
      // Sem PIN na URL: a TV pode ser aberta em qualquer aparelho digitando
      // o codigo curto de projecao exibido no cockpit.
      showCodeEntry();
    }

    window.addEventListener('pagehide', () => {
      stopCountdown();
      stopPoll();
    });

    // A previa nao entra na projecao de verdade: sem token, sem poll, sem SSE.
    if (document.body.dataset.tvPreview === '1') {
      startTvPreview();
      return;
    }

    startTV();
  }
})();


