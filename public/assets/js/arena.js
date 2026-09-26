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

  // O LIMITE DE CARACTERES DO CAMPO DO ALUNO, em um lugar só.
  // A regra já estava escrita duas vezes (o campo da missão e a prévia), e a
  // "Rodada ativa" do painel passou a escrevê-la uma terceira: três lugares
  // decidindo o mesmo número é como duas telas acabam discordando na frente do
  // aluno. `essencial` é a modalidade da objetividade, e é ela que limita.
  const LIMITE_ESSENCIAL = 250;
  const LIMITE_PADRAO = 4000;
  const limiteDeCaracteres = (modality) => (modality === 'essencial' ? LIMITE_ESSENCIAL : LIMITE_PADRAO);

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

  // `roomCode` fica junto da sessao para reconhecer um SEGUNDO clique no mesmo
  // codigo (ver o tratador do formulario de entrada): sem ele, a unica forma de
  // saber se o aluno ja esta na sala seria perguntar ao servidor, que responde
  // 409 ("nome ja em uso") — verdade para ele e erro nenhum para quem ja entrou.
  const SESSION_KEYS = { participantId: 'arena.participant_id', token: 'arena.token', roomCode: 'arena.room_code' };

  /** O codigo da sala so com os digitos: "890 897" e "890897" sao o mesmo PIN. */
  const soDigitos = (valor) => String(valor ?? '').replace(/\D+/g, '');

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
    // Resposta 200 sem número para pontuar. É o motivo da aula relatada
    // (`gemini_invalid_numeric_output`), que a tela mostrava como "motivo não
    // catalogado (gemini_invalid_numeric_output)" — o professor lia o código
    // cru justamente na falha que precisava dele para entender a fila.
    [/invalid_numeric_output/, 'provedor respondeu sem número'],
    [/429/, 'cota do provedor'],
    [/http_4\d\d/, 'acesso recusado pelo provedor'],
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
  // A superficie diz o que fazer quando o stream CAI e quando ele VOLTA: sao
  // duas acoes diferentes do mesmo dono (quem assina), e sem elas o EventSource
  // volta em silencio — a tela fica "ao vivo" sem ter relido o estado.
  let roomEventsReconnect = null;
  let roomEventsDrop = null;
  // Ja houve uma conexao aberta nesta sessao? A primeira abertura nao e
  // "reconexao": quem acabou de assinar le o estado logo depois, por conta.
  let roomEventsOpened = false;

  function subscribeRoomEvents(onEvent, query = '', { onReconnect = null, onDrop = null } = {}) {
    roomEventHandlers.add(onEvent);
    const url = `/events${query}`;
    // Mesma URL (outra parte da mesma tela assinando): os ganchos sao do dono
    // novo, que e quem sabe reler o estado desta superficie.
    if (onReconnect) roomEventsReconnect = onReconnect;
    if (onDrop) roomEventsDrop = onDrop;
    if (roomEventSource && roomEventUrl !== url) {
      closeRoomEvents();
      // A conexao mudou de SALA: a versao pintada era da anterior e nao diz
      // nada sobre esta. Sem esquecer, o primeiro aviso da sala nova podia ser
      // dispensado por parecer velho (ver `eventoAvanca`) — e a tela so voltaria
      // ao estado certo no tique seguinte do poll.
      revisoes.clear();
    }
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
    roomEventSource.onopen = () => {
      const reconectou = roomEventsOpened && !roomEventsAlive;
      roomEventsAlive = true;
      roomEventsOpened = true;
      // RELEITURA na volta do stream: o que passou durante a queda pode ter
      // escapado do poll (aba oculta, espera progressiva), e estado so se sabe
      // perguntando. Sem isto, a tela volta a receber eventos novos sem nunca
      // ter buscado o que perdeu.
      if (reconectou) {
        pollSteps.clear();
        try { roomEventsReconnect?.(); } catch { /* o poll cobre */ }
      }
    };
    roomEventSource.onerror = () => {
      const caiu = roomEventsAlive;
      roomEventsAlive = false;
      // `onerror` dispara a cada tentativa do navegador; o aviso e UM, na queda.
      if (caiu) { try { roomEventsDrop?.(); } catch { /* segue no poll */ } }
    };
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
    roomEventsOpened = false;
    roomEventsReconnect = null;
    roomEventsDrop = null;
    pollSteps.clear();
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
  //
  // `revision` entra na lista pelo mesmo motivo: ela sobe a cada mutacao, mas
  // quem decide redesenhar e o conteudo (rodada, envios, nota), e nao a versao.
  // Fora daqui, um toque no nome de um participante trocaria a revisao e o
  // painel redesenhasse por baixo do campo que o professor esta digitando.
  const VOLATILE_FIELDS = new Set(['server_now', 'last_seen_at', 'revision']);

  /** Chave do que a tela mostra, para pular redesenho de estado equivalente. */
  const renderKey = (value, volatile = VOLATILE_FIELDS) => JSON.stringify(
    value,
    (key, entry) => (volatile.has(key) ? undefined : entry),
  );

  /**
   * A REVISAO da sala: a versao monotonica do estado (ver `revision` no schema).
   *
   * Cada superficie da tela (aluno, painel, TV) lembra a ultima revisao que
   * PINTOU e recusa uma leitura mais velha. E o que resolve a corrida entre uma
   * resposta de acao que demorou e um evento de tempo real que chegou antes:
   * sem isso, o desenho final dependia de qual das duas respostas voltava por
   * ultimo, e a tela podia voltar para um estado que ja tinha passado.
   *
   * Trocar de sala ZERA a memoria — revisao da sala A nao diz nada sobre a B —,
   * e payload sem o campo (servidor antigo) passa: a guarda nao inventa versao.
   */
  const revisoes = new Map();
  function aceitaRevisao(superficie, sala) {
    const revisao = Number(sala?.revision);
    if (!Number.isFinite(revisao)) return true;
    const anterior = revisoes.get(superficie);
    if (Number.isFinite(anterior) && revisao < anterior) return false;
    revisoes.set(superficie, revisao);
    return true;
  }
  /** A sala mudou: a memoria de revisao da superficie nao vale mais. */
  function trocouDeSala(superficie, salaId) {
    const chave = `${superficie}:sala`;
    const anterior = revisoes.get(chave);
    if (anterior === salaId) return false;
    revisoes.set(chave, salaId);
    revisoes.delete(superficie);
    return true;
  }

  /**
   * O aviso de tempo real merece uma releitura?
   *
   * O evento carrega a versao que ele anuncia, e uma tela que JA pintou essa
   * versao nao ganha nada lendo de novo: a leitura voltaria com o mesmo estado
   * (o proprio `aceitaRevisao` a aceitaria, por ser igual). Sem esta guarda,
   * cada evento vira uma consulta — e uma rajada de eventos, uma rajada delas.
   *
   * Antes da primeira leitura nao ha versao pintada, e ai o evento NAO e
   * dispensado: e justamente ele que manda buscar o estado. Evento sem versao
   * (ou com versao nao numerica) tambem passa, para o cliente nunca ficar mudo
   * por causa de um campo que faltou. E trocar de sala esquece o numero (em
   * `subscribeRoomEvents`), senao a versao da sala anterior decidiria pela nova.
   */
  function eventoAvanca(superficie, evento) {
    const pintada = revisoes.get(superficie);
    const versao = Number(evento?.revision);
    if (!Number.isFinite(pintada) || !Number.isFinite(versao)) return true;
    return versao > pintada;
  }

  /**
   * O rotulo do botao de envio, em um lugar so.
   *
   * Tres estados, e a diferenca entre eles importa: "Enviando…" enquanto a
   * requisicao esta em voo, "Enviado ✓" quando o servidor ja tem a resposta
   * (com ou sem nota) e "Enviar prompt" quando ainda cabe um envio. O defeito
   * que isto conserta e de HONESTIDADE: o envio confirmado voltava a dizer
   * "Enviar prompt" — o aluno recarregava a pagina, via o botao pedindo de novo
   * e reenviava uma resposta que ja estava guardada.
   */
  function rotuloDoEnvio(estado, alvo = null) {
    const button = alvo || $('[data-arena-send]');
    if (!button) return;
    const span = button.querySelector('span');
    if (!span) return;
    // O rotulo do estado "livre" e o proprio texto do markup, guardado na
    // primeira chamada: uma frase existe em UM lugar so (o bundle nao duplica a
    // frase que o HTML ja escreve), e editar o HTML edita os dois estados.
    if (!button.dataset.sendLabelFree) button.dataset.sendLabelFree = span.textContent;
    const textos = { enviando: 'Enviando…', confirmado: 'Enviado ✓', livre: button.dataset.sendLabelFree };
    if (textos[estado]) span.textContent = textos[estado];
    button.dataset.sendState = estado;
  }

  /**
   * O que dizer ao aluno quando a sessao dele caiu.
   *
   * O servidor diz a CAUSA no 401 (`details.reason`, ver `requireAdmin` e
   * `participantSession`): sessao que nunca existiu nesta aba, sessao que perdeu
   * a validade (o professor removeu o participante) e falha sem motivo
   * declarado terminam na MESMA acao — entrar de novo —, mas nao na mesma
   * frase. "Sua sessao expirou" e mentira para quem acabou de abrir a pagina.
   */
  function motivoDaSessaoDoAluno(error) {
    const motivo = error?.details?.reason;
    if (motivo === 'session_missing') return 'Sua sessão não está mais nesta aba. Entre de novo.';
    if (motivo === 'session_expired') return 'Sua sessão expirou. Entre de novo.';
    return error?.message || 'Sua sessão expirou. Entre de novo.';
  }

  /**
   * Quando o stream esta caido, o poll espera mais a cada leitura que falha.
   *
   * Com SSE vivo, o tique e o combinado (2,5 s); depois da primeira queda, 5 s;
   * da segunda em diante, 10 s. Nao e economia de banda — e nao transformar uma
   * queda de rede numa tempestade: tres telas de duas dezenas de alunos a 2,5 s
   * viram centenas de requisicoes por segundo justamente quando o servidor esta
   * pior. O ritmo normal volta no primeiro evento (o stream vivo zera o passo).
   */
  const pollSteps = new Map();
  function pollDue(superficie, base = 2500) {
    const agora = Date.now();
    const estado = pollSteps.get(superficie) || { proximo: 0, passo: 0 };
    if (agora < estado.proximo) return false;
    estado.passo = roomEventsAlive ? 0 : Math.min(estado.passo + 1, 2);
    estado.proximo = agora + (roomEventsAlive ? base : Math.min(10_000, base * 2 ** estado.passo));
    pollSteps.set(superficie, estado);
    return true;
  }

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
      parkedAttempt: null,
      // O aluno abriu a explicação ("Como funciona") enquanto esperava. É escolha
      // dele, e o batimento de 2,5 s não pode arrastá-lo de volta: quem devolve a
      // tela é a BATALHA, não o relógio (ver `telaDoLobby`).
      onHow: false, reviewedScoreKey: null, editingRetry: false };
    const screens = $$('[data-arena-screen]');

    function showScreen(name) {
      if (name !== 'lobby') document.body.classList.remove('round-active', 'round-finished');
      screens.forEach((screen) => screen.classList.toggle('is-active', screen.dataset.arenaScreen === name));
    }

    // ----------------------------------------------------------------
    // A JORNADA DO ALUNO NESTE ARQUIVO — inventário do que esta frente criou,
    // para o próximo que chegar não procurar no arquivo inteiro. Marcação:
    // `src/web/pages/index.mjs` (as `<section data-arena-screen>`, incluindo a
    // espera com o caminho de entrada e a leitura "Como funciona"). Desenho:
    // `public/assets/css/aluno.css` — dono exclusivo. Aqui, no cliente, moram
    // exatamente três coisas:
    //   1. `state.onHow` — se o aluno abriu a explicação;
    //   2. `telaDoLobby()` — QUAL tela está em cena, e quem a devolve é a
    //      batalha, não o relógio do batimento;
    //   3. a pintura da espera (o bloco do `[data-arena-wait-entry]`, que
    //      escreve o código e o `entry_qr` que o servidor manda) e os dois
    //      ouvintes de `[data-arena-how-open]` / `[data-arena-how-back]`.
    // As telas que faltam portar (`join`, `round`, `result`) entram como seção
    // em `index.mjs`, folha em `aluno.css` e, se precisarem de regra de estado,
    // um caso a mais em `telaDoLobby()` — nunca um quarto lugar.
    // ----------------------------------------------------------------
    // QUAL TELA O LOBBY MOSTRA — o cliente decide só QUAL está em cena; o
    // desenho das duas telas é de `public/assets/css/aluno.css`.
    // A explicação ("Como funciona") é leitura de preparação entre a espera e a
    // rodada, e fica aberta até o aluno sair dela.
    // Quem a fecha é a batalha: assim que entra missão no ar (ou a sala termina),
    // a leitura cede para a tela do jogo — a explicação nunca vira beco sem saída
    // quando o professor inicia com o aluno ainda lendo.
    function telaDoLobby(lobby) {
      if (!state.onHow) return 'lobby';
      const acabou = lobby?.room?.phase === 'finished'
        || lobby?.room?.status === 'ended'
        || lobby?.room?.status === 'archived';
      if (!lobby?.current_round && !acabou) return 'how';
      state.onHow = false;
      return 'lobby';
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
      localStorage.setItem(SESSION_KEYS.roomCode, String(code));
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
          // Revisao mais velha que a que ja esta na tela: a leitura perdeu a
          // corrida para um evento (ou para a resposta de um envio) e nao pode
          // voltar o aluno para um estado que ja passou.
          trocouDeSala('aluno', data.lobby?.room?.id ?? null);
          if (!aceitaRevisao('aluno', data.lobby?.room)) return;
          state.lobby = data.lobby;
          state.roomId = data.lobby?.room?.id ?? state.roomId;
          // Redesenha so quando algo visivel mudou: a leitura de batimento
          // nao pode trocar o texto que o aluno esta digitando.
          const key = renderKey(data.lobby);
          if (key !== state.lobbyKey) {
            state.lobbyKey = key;
            renderLobby(data.lobby);
          }
          showScreen(telaDoLobby(data.lobby));
        } catch (error) {
          if (error.status === 401) {
            clearSession();
            showScreen('join');
            // O servidor diz a CAUSA (ver `reason` no 401): sessao que nunca
            // existiu nesta aba e sessao que perdeu a validade pedem a mesma
            // acao do aluno (entrar de novo), mas nao a mesma frase.
            message($('[data-arena-join-message]'), motivoDaSessaoDoAluno(error), 'error');
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
      state.sseOff = subscribeRoomEvents((acao, evento) => {
        // Aviso de uma versao que a tela ja pintou nao vira consulta.
        if (eventoAvanca('aluno', evento)) refreshLobby(true);
      }, eventsQuery(state.roomId, savedSession()), {
        // O stream VOLTOU: releitura completa (o que passou na queda pode nao
        // ter sido visto) e o aviso de conexao sai.
        onReconnect: () => { setOfflineState(false); refreshLobby(true); },
        // Caiu: o aviso e o mesmo da conexao instavel — o aluno le uma frase so.
        onDrop: () => { setOfflineState(true); },
      });
      // O poll continua sendo a rede de seguranca quando o SSE cai — com espera
      // progressiva enquanto ele estiver caido (ver `pollDue`).
      state.poll = window.setInterval(() => {
        if (!state.hiddenClock()) return;
        if (!pollDue('aluno')) return;
        refreshLobby(false);
      }, 2500);
    }

    // Aba oculta nao consulta; ao voltar, uma leitura imediata (uma vez so).
    onVisibleResume(() => refreshLobby(true));    function renderLobby(lobby) {
      const room = lobby.room;
      // Sala diferente zera a memoria; revisao velha na mesma sala e descartada.
      trocouDeSala('aluno', room.id);
      if (!aceitaRevisao('aluno', room)) return;
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
      const completedRound = !mission && !finished && room.status === 'playing'
        && (lobby.rounds || []).some((round) => round.status === 'results' || round.status === 'closed');
      document.body.classList.toggle('round-active', Boolean(mission) || finished);
      document.body.classList.toggle('round-finished', finished && !mission);
      document.body.classList.toggle('round-between', completedRound);
      const missionPanel = $('[data-arena-mission-panel]');
      missionPanel.classList.toggle('has-mission', Boolean(mission));
      $('[data-arena-mission-empty]').hidden = Boolean(mission);
      $('[data-arena-mission]').hidden = !mission;



      // Uma mensagem por estado. Antes eram camadas equivalentes: a sala
      // classica dizia "Aguardando a batalha comecar" e a linha de baixo
      // repetia a mesma espera com outras palavras — o aluno lia duas.
      const resultsPending = finished && Number(lobby.results_pending || 0) > 0;
      document.body.classList.toggle('results-pending', resultsPending);
      const winner = finished && !resultsPending ? lobby.ranking?.[0] : null;
      const champions = winner ? (lobby.ranking || []).filter((row) => Number(row.position) === 1) : [];
      const tied = champions.length > 1;
      // Preserve every participant tied at the podium cutoff; the server owns
      // the places and tie-break rules, not the presentation.
      const finalPodium = winner ? (lobby.ranking || []).filter((row, index) => (Number(row.position) || index + 1) <= 3) : [];
      const rankingHeading = $('[data-arena-ranking-heading]');
      if (rankingHeading) rankingHeading.textContent = winner ? 'Demais colocados' : rankingHeading.dataset.titleActive;
      $('[data-arena-empty-title]').textContent = resultsPending
        ? 'Conferindo resultado'
        : winner ? (tied ? 'Temos campeões' : 'Temos um campeão') : finished ? 'Batalha encerrada'
          : completedRound ? 'Missão concluída' : 'Aguarde o professor iniciar';
      const victory = $('[data-arena-victory]');
      if (victory) {
        victory.hidden = !winner;
        victory.classList.toggle('is-tied', tied);
        if (winner) {
          const total = Number(winner.total_points ?? winner.points_sum ?? winner.avg_percent ?? 0);
          const podium = finalPodium;
          const orderedPodium = !tied && podium.length <= 3 ? [podium[1], podium[0], podium[2]].filter(Boolean) : podium;
          const key = `${room.id}:${podium.map((row) => `${row.participant_id || row.name}:${row.position}:${row.total_points ?? row.points_sum ?? row.avg_percent ?? 0}`).join('|')}`;
          if (victory.dataset.resultKey !== key) {
            victory.dataset.resultKey = key;
            victory.innerHTML = `
              <div class="arena-victory-confetti" aria-hidden="true">${Array.from({ length: 64 }, (_, index) => `<i style="--piece:${index};--left:${(index * 37 + 11) % 98}%;--delay:${(index * 71) % 1700}ms;--drift:${((index * 29) % 180) - 90}px"></i>`).join('')}</div>
              <div class="arena-victory-rays" aria-hidden="true"></div>
              <div class="arena-victory-sparkles" aria-hidden="true"></div>
              <div class="arena-victory-copy">
                <span>${tied ? 'CAMPEÕES DA BATALHA' : 'CAMPEÃO DA BATALHA'}</span>
                <img src="/public/assets/figma/champion-medal-gold.svg" alt="" width="64" height="72">
                <strong>${tied ? 'Vitória compartilhada' : esc(winner.name)}</strong>
                <p>${total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pontos${!tied && String(winner.participant_id) === String(lobby.me?.id) ? ' · Você venceu!' : ''}</p>
              </div>
              <div class="arena-victory-podium" data-count="${podium.length}" aria-label="Pódio final">
                ${orderedPodium.map((row) => {
                  const place = Number(row.position) || podium.indexOf(row) + 1;
                  const score = Number(row.total_points ?? row.points_sum ?? row.avg_percent ?? 0);
                  const medal = ['gold', 'silver', 'bronze'][place - 1] || 'bronze';
                  return `<div class="arena-victory-place is-place-${place}" aria-label="${esc(row.name)}, ${place}º lugar, ${score.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pontos">
                    <img src="/public/assets/figma/champion-medal-${medal}.svg" alt="" width="38" height="44">
                    ${place === 1 && !tied ? '' : `<strong>${esc(row.name)}</strong><span>${score.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</span>`}
                    <div class="arena-victory-plinth" aria-hidden="true">${place}</div>
                  </div>`;
                }).join('')}
              </div>`;
          }
        } else {
          delete victory.dataset.resultKey;
          victory.replaceChildren();
        }
      }
      const betweenCopy = $('[data-arena-between-copy]');
      const betweenScore = $('[data-arena-between-score]');
      if (betweenCopy) {
        betweenCopy.hidden = !completedRound && !resultsPending;
        if (resultsPending) betweenCopy.textContent = `${lobby.results_pending} ${Number(lobby.results_pending) === 1 ? 'avaliação pendente' : 'avaliações pendentes'}.`;
      }
      if (betweenScore) betweenScore.hidden = !completedRound;
      if (completedRound) {
        if (betweenCopy) betweenCopy.textContent = 'Aguarde o professor.';
        const lastRound = [...lobby.rounds].reverse().find((round) => round.status === 'results' || round.status === 'closed');
        const points = lastRound?.best_points;
        if (betweenScore) {
          betweenScore.hidden = points == null || !Number.isFinite(Number(points));
          if (!betweenScore.hidden) betweenScore.innerHTML = `<span>Sua nota</span><strong>${Number(points).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</strong>`;
        }
      }
      // A porta da explicação só existe enquanto há espera: na batalha encerrada
      // ela levaria a uma leitura sem próxima ação.
      const howOpen = $('[data-arena-how-open]');
      if (howOpen) howOpen.hidden = finished || completedRound;

      // O CAMINHO DE ENTRADA da espera (referência LA-02B): o código em tamanho
      // de leitura com o QR ao lado. O código pequeno do cabeçalho sai enquanto
      // o grande está na tela — o mesmo dado em dois tamanhos é ruído.
      // O DESENHO desta peça mora em `public/assets/css/aluno.css`, a folha dona
      // da jornada do aluno (o mesmo lugar da leitura "Como funciona" e das
      // telas do aluno que ainda faltam portar). Aqui fica só o comportamento.
      const entry = $('[data-arena-wait-entry]');
      const roomCode = room.pin || room.code;
      const entryVisible = Boolean(!finished && !completedRound && !mission && roomCode);
      if (entry) {
        entry.hidden = !entryVisible;
        if (entryVisible) {
          $('[data-arena-wait-code]').textContent = roomCode;
          const qr = lobby.entry_qr;
          const qrBox = $('[data-arena-wait-qr-box]');
          // O QR vem do servidor — o MESMO da projeção — e só existe quando ele
          // conseguiu montar o endereço a partir da requisição. Sem ele fica o
          // código, que é o que o aluno realmente lê.
          qrBox.hidden = !qr?.data_url;
          if (qr?.data_url) {
            const qrImg = $('[data-arena-wait-qr]');
            // Troca só quando muda: o batimento de 2,5 s não reinicia a imagem.
            if (qrImg.getAttribute('src') !== qr.data_url) qrImg.src = qr.data_url;
            const qrLink = $('[data-arena-wait-qr-link]');
            if (qrLink.href !== qr.url) qrLink.href = qr.url;
          }
        }
      }
      $('[data-arena-room-code]').hidden = entryVisible;

      // Roster ao vivo: no classico, a lista de quem ja entrou substitui os
      // paineis pedagogicos (resultados/destaques) que nao fazem sentido na
      // batalha original.
      const roster = $('[data-arena-roster]');
      // A lista de quem já entrou é da ESPERA em qualquer modo: na referência
      // (LA-02B) ela fica logo abaixo do código. Antes só o Clássico a mostrava,
      // e as salas de turma/Arena esperavam sem ver quem havia chegado.
      const rosterVisible = lobby.roster && lobby.roster.length > 0 && !mission && !finished && !completedRound;
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
      renderRanking(winner ? (lobby.ranking || []).filter((row) => !finalPodium.includes(row)) : lobby.ranking, true, Boolean(winner));
      renderHighlights(lobby.highlights, true);
      const side = document.querySelector('.arena-side');
      if (side) side.hidden = resultsPending || [...side.querySelectorAll('.arena-card')].every((card) => card.hidden);

      // Encerramento: a classificação é a leitura principal, e o resultado por
      // missão e os destaques ficam a um clique (o título do cartão é a alça).
      // Durante a partida eles ficam abertos — ali são curtos e são o assunto.
      const foldKey = `${room.id}:${mission?.id || 'wait'}:${finished ? 'finished' : 'active'}`;
      for (const fold of side ? side.querySelectorAll('[data-arena-fold]') : []) {
        if (fold.dataset.arenaFoldKey === foldKey) continue;
        fold.dataset.arenaFoldKey = foldKey;
        // Os destaques são opcionais e começam fechados. A escolha de abrir
        // qualquer seção permanece durante as atualizações ao vivo.
        fold.open = !finished && !fold.classList.contains('arena-highlights-panel');
      }

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
        state.reviewedScoreKey = null;
        state.editingRetry = false;
        const send = $('[data-arena-send]');
        if (send) send.dataset.sendLabelFree = 'Enviar prompt';
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
      $('[data-arena-round-count]').textContent = `${classic ? 'RODADA' : 'MISSÃO'} ${round}/${String(total).padStart(2, '0')}`;
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
      // O mesmo rotulo que o envio deixou, recalculado do estado do SERVIDOR:
      // recarregar a pagina nao pode devolver "Enviar prompt" para uma resposta
      // ja guardada.
      //
      // A pergunta que o rotulo responde e "o servidor ja tem esta resposta?",
      // e nao "cabe outro envio?". Sao perguntas diferentes, e era por isso
      // que a tela pedia "Enviar prompt" de novo enquanto a avaliacao corria —
      // o aluno recebia confirmacao de um envio e, na releitura seguinte, um
      // botao convidando a enviar o que ja estava guardado.
      const envioConfirmado = Boolean(pendingSubmission) || !canRetry;
      state.envioConfirmado = envioConfirmado;
      rotuloDoEnvio(state.isSubmitting ? 'enviando' : state.editingRetry && !pendingSubmission ? 'livre' : envioConfirmado ? 'confirmado' : 'livre', sendButton);
      if (myScores.length) {
        const latest = myScores[myScores.length - 1];
        const scoreKey = `${mission.id}:${latest.attempt}`;
        if (state.reviewedScoreKey !== scoreKey) {
          state.reviewedScoreKey = scoreKey;
          state.editingRetry = false;
        }
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
            if (el.dataset.target !== targetText) return;
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
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) el.textContent = targetText;
          else requestAnimationFrame(frame);
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
          if (classic || entries.length < 2 || Number(entries[0][1]) === Number(entries[entries.length - 1][1])) {
            diagnosis.hidden = true;
            diagnosis.innerHTML = '';
          } else {
            const label = (key) => CRITERION_LABELS[key] || key;
            const best = entries[0];
            const focus = entries[entries.length - 1];
            diagnosis.innerHTML = `
              <p class="arena-diagnosis-item is-best"><span>Melhor ponto</span><strong>${esc(label(best[0]))}</strong><em>${Number(best[1])}/20</em></p>
              <p class="arena-diagnosis-item is-focus"><span>Na próxima missão</span><strong>${esc(label(focus[0]))}</strong><em>${Number(focus[1])}/20</em></p>`;
            diagnosis.hidden = false;
          }
        }
        // O detalhamento dos critérios abre sob demanda: quem acabou de responder
        // lê a nota e o feedback, e pede o detalhe se quiser. No clássico não há
        // critérios (o juiz é outro), então a alça sai inteira da tela.
        const breakdownFold = $('[data-arena-breakdown-fold]');
        if (breakdownFold) breakdownFold.hidden = Boolean(classic);
        const feedback = String(latest.feedback || 'Resposta avaliada.')
          .replace(/na próxima tentativa/gi, 'na próxima missão')
          .replace(/em uma próxima tentativa/gi, 'em uma próxima missão');
        $('[data-arena-feedback]').textContent = classic
          ? `${feedback} (acerto de ${Math.round(Number(latest.percent))}%)`
          : feedback;
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
        const next = $('[data-arena-result-next]');
        next.hidden = canRetry;
        if (!canRetry) next.textContent = 'Aguarde o professor.';
      } else {
        result.hidden = true;
        $('[data-arena-retry]').hidden = true;
        $('[data-arena-result-next]').hidden = true;
      }

      // Contador dinâmico de caracteres
      const textarea = $('[data-arena-prompt-form] textarea');
      const maxLength = limiteDeCaracteres(modality);
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
        message(msg, 'Rodada encerrada. Aguarde o professor.', 'info');
      } else if (pendingSubmission) {
        // Envio em conferencia: a mensagem ja esta na tela e o aluno pode
        // reenviar para repetir a MESMA tentativa — nao apaga o aviso.
        if (promptForm) promptForm.hidden = false;
      } else if (alreadySent || semTentativa) {
        // Ja enviou (ou usou todas as tentativas): form some para nao incentivar
        // reenvio; a confirmacao e o resultado (PONTOS) respondem "foi
        // enviado?" e "fui bem?" enquanto o aluno espera os demais.
        if (promptForm) promptForm.hidden = true;
        message(msg, alreadySent ? 'Aguardando os demais jogadores…' : 'Resposta enviada. Aguarde o professor.', 'info');
      } else {
        if (promptForm) promptForm.hidden = false;
        message(msg, '', '');
      }

      // Uma nota nova é um momento de leitura. O campo volta só quando o aluno
      // escolhe melhorar o prompt; o polling não pode desfazer essa escolha.
      $('[data-arena-mission]').classList.toggle('is-reviewing', myScores.length > 0 && !state.editingRetry && !pendingSubmission);
      $('[data-arena-mission]').classList.toggle('is-editing-retry', myScores.length > 0 && state.editingRetry && !pendingSubmission);
      $('[data-arena-mission]').classList.toggle('is-awaiting-retry', myScores.length > 0 && Boolean(pendingSubmission));

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
            <strong>${classic ? `RODADA ${round.position} — CLÁSSICA` : `MISSÃO ${round.position} — ${MODALITY_LABELS[round.modality] || round.modality}`}</strong>
            <span>${round.title}</span>
          </div>
          <p>Você ficou em <strong>${round.my_position ? `${round.my_position}º` : '-'}</strong> com <strong>${scoreValue === null || scoreValue === undefined ? '-' : Math.round(Number(scoreValue))}${scoreLabel}</strong>.</p>
          <ol class="arena-mini-ranking">
            ${round.ranking.slice(0, 5).map((entry) => `<li class="${entry.is_me ? 'is-me' : ''}"><span>${entry.position}º</span><strong>${esc(entry.name)}</strong><em>${Number(entry.points ?? entry.percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</em></li>`).join('')}
          </ol>
        </article>`;
      }).join('');
    }

    function renderRanking(ranking, hideWhenEmpty = false, isFinal = false) {
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
        const champion = isFinal && position === 1;
        return `
        <div class="arena-ranking-row${champion ? ' is-champion' : ''}">
          ${isFinal ? medalImage(position, 'arena-ranking-medal') : `<span class="arena-ranking-position">${position}</span>`}
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
      const codigo = form.elements.code.value;
      button.disabled = true;
      // Clique duplo (ou segundo envio depois de uma resposta perdida): se esta
      // aba JA tem sessao na MESMA sala, entrar de novo e a mesma entrada — o
      // servidor recusaria com 409 ("nome ja em uso"), que para quem ja esta
      // dentro nao e erro, e a tela dizia o contrario do que aconteceu.
      const jaTem = savedSession();
      const codigoAnterior = localStorage.getItem(SESSION_KEYS.roomCode);
      if (jaTem.participant_id && jaTem.token && soDigitos(codigoAnterior) && soDigitos(codigoAnterior) === soDigitos(codigo)) {
        message(node, 'Você já está nesta sala.', 'info');
        await enterLobby();
        return;
      }
      message(node, 'Entrando...', 'info');
      try {
        await joinRoom(codigo, form.elements.name.value);
        // A confirmacao fica no no da tela de entrada (que sai de vista quando o
        // lobby aparece): o lobby ja mostra codigo e nome, e o texto aqui existe
        // para quando a tela voltar — e para o teste poder ler sem correr atras
        // do instante em que a tela trocou.
        message(node, 'Você entrou na sala.', 'info');
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
      rotuloDoEnvio('enviando', button);
      // `confirmado` atravessa os ramos: envio aceito (com nota na hora, com
      // nota depois ou estacionado) e envio que o servidor TEM — os tres levam
      // o botao a "Enviado ✓", e o `finally` nao volta atras.
      let confirmado = false;

      // O botão já informa o progresso; repetir a mesma frase abaixo só ocupa tela.
      message(node, '', '');
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
        confirmado = true;
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
            : 'Resposta recebida. A nota aparecerá aqui.', 'info');
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
          confirmado = true;
          message(node, 'Envio confirmado e avaliação recuperada.', 'info');
        } else if (receivedByServer) {
          confirmado = true;
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
        // O rotulo segue o ENVIO, nao o formulario: "Enviado ✓" fica. Devolver
        // o texto original aqui (como era) prometia um envio novo para uma
        // resposta que o servidor ja tinha. `state.envioConfirmado` cobre o caso
        // de o envio NAO ter sido confirmado nesta tentativa e mesmo assim
        // existir uma resposta guardada de antes — o rotulo nao regride.
        rotuloDoEnvio(state.editingRetry && !state.submitLocked ? 'livre' : confirmado || state.envioConfirmado ? 'confirmado' : 'livre', button);
        button.disabled = Boolean(state.submitLocked);
      }
    });

    $('[data-arena-retry]').addEventListener('click', () => {
      state.editingRetry = true;
      $('[data-arena-mission]').classList.remove('is-reviewing');
      $('[data-arena-mission]').classList.add('is-editing-retry');
      const form = $('[data-arena-prompt-form]');
      $('[data-arena-send]').dataset.sendLabelFree = 'Enviar nova versão';
      rotuloDoEnvio('livre');
      $('[data-arena-result]').hidden = true;
      form.elements.prompt.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('[data-arena-leave]').addEventListener('click', () => {
      clearSession();
      if (state.poll) window.clearInterval(state.poll);
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      showScreen('join');
    });

    // As duas portas da explicação: abrir na espera, voltar para a sala. A
    // leitura não começa a batalha — quem começa é o professor.
    $('[data-arena-how-open]')?.addEventListener('click', () => {
      state.onHow = true;
      showScreen('how');
      document.querySelector('[data-arena-how]')?.scrollIntoView({ block: 'start' });
    });
    $('[data-arena-how-back]')?.addEventListener('click', () => {
      state.onHow = false;
      showScreen('lobby');
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
      // A prévia mostra o tempo configurado, sem simular uma contagem ao vivo.
      // Usar o deadline real da sala aqui podia exibir 00:00 em vermelho numa
      // missão que o professor só queria inspecionar.
      if (state.timer) window.clearInterval(state.timer);
      const previewClock = $('[data-arena-timer]');
      if (previewClock && !finished) {
        const duration = Number(mission.duration_seconds);
        previewClock.textContent = duration > 0 ? formatSeconds(duration) : 'Sem limite';
        previewClock.classList.remove('is-danger', 'is-paused');
        previewClock.classList.toggle('is-untimed', !(duration > 0));
        const clockLabel = $('.round-clock > span:first-child');
        if (clockLabel) clockLabel.textContent = 'Tempo previsto';
      }
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
      // Filtro da lista de alunos da sala em destaque (Todos, Enviados,
      // Respondendo, Precisando de atenção). Vive aqui pela mesma razão das
      // dobras: a tabela é reescrita a cada poll, e a escolha do professor não.
      filtroDeAlunos: 'todos',
      // Estado da conexão de tempo real, para o selo do cabeçalho dos comandos.
      // `true` até o servidor dizer o contrário: abrir a tela já conectado é o
      // caso normal, e um selo que nasce apagado alarmaria sem motivo.
      conexaoAoVivo: true,
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

    /**
     * Toda chamada administrativa passa por aqui — e aqui é que a sessão vencida
     * é reconhecida, UMA vez.
     *
     * O 401 tem um caminho só: para o poll, fecha o stream, avisa na faixa e
     * oferece entrar de novo (ver `sessaoExpirada`). Sem este funil, cada
     * chamada nova nascia sem essa guarda — e bastava um caminho esquecer de
     * tratar o 401 para o painel ficar consultando para sempre sem avisar. O
     * erro continua subindo (quem chamou decide o resto), mas a faixa já está na
     * tela; e a faixa é idempotente, então repetir não empilha aviso.
     */
    const adminApi = (action, payload = {}) => api(action, payload, { timeout: 20000 })
      .catch((error) => {
        if (error.status === 401) sessaoExpirada(error);
        throw error;
      });

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
      // Sem cartao de login no DOM, esconder o conteudo deixava o professor
      // numa tela VAZIA: a pagina autenticada nao traz o cartao (o servidor
      // entrega a pagina de login ou o painel, nunca os dois). Quem responde
      // pela reentrada nessa pagina e a faixa da sessao (ver a faixa abaixo).
      if (!panel) return;
      panel.hidden = false;
      if (content) content.hidden = true;
    }

    function showContent() {
      const panel = $('[data-admin-arena-login-panel]');
      const content = $('[data-admin-arena-content]');
      if (panel) panel.hidden = true;
      if (content) content.hidden = false;
    }

    /**
     * A faixa do painel: uma tela so para as duas coisas que o professor precisa
     * saber sem tirar os olhos da sala — a sessao caiu e a conexao oscilou.
     *
     * Por que NAO recarregar para o login: ele esta no meio da aula, com a sala
     * aberta. A faixa avisa, o detalhe CONTINUA na tela (o ultimo estado valido e
     * informacao, nao lixo) e a entrada de novo acontece ali mesmo, sem perder o
     * contexto de qual sala estava sendo acompanhada.
     */
    const sessionBanner = $('[data-arena-session-banner]');
    function faixaDoPainel(texto, { entrarDeNovo = false } = {}) {
      if (!sessionBanner) return;
      const textoNode = $('[data-arena-session-text]', sessionBanner);
      const botao = $('[data-arena-session-retry]', sessionBanner);
      const formulario = $('[data-arena-session-retry-form]', sessionBanner);
      if (textoNode) textoNode.textContent = texto || '';
      if (botao) botao.hidden = !entrarDeNovo;
      // O CAMPO so aparece quando o professor pede para entrar de novo: a faixa
      // de "reconectando" nao tem o que fazer com uma senha na frente.
      if (formulario) formulario.hidden = true;
      sessionBanner.hidden = !texto;
    }

    /**
     * A sessao do painel caiu (401 em qualquer chamada). Para TUDO — o poll do
     * detalhe, o stream e o que estiver em voo —, avisa e oferece entrar de novo.
     *
     * Antes disto, o 401 caia no `catch` do detalhe, que existe para nao apagar a
     * tela por erro de rede ("mantem a ultima renderizacao"), e o poll seguia
     * batendo a cada 3 s para sempre: o professor via um painel que nao atualizava
     * mais, sem aviso nenhum, e a explicacao so existia no console do navegador.
     */
    function sessaoExpirada(error) {
      if (state.sessionLost) return;
      state.sessionLost = true;
      if (state.detailPoll) { window.clearInterval(state.detailPoll); state.detailPoll = null; }
      if (state.sseOff) { state.sseOff(); state.sseOff = null; }
      // A conexão morreu junto com a sessão: o selo do cabeçalho não pode
      // continuar prometendo tempo real.
      state.conexaoAoVivo = false;
      pintarSeloDeSincronia();
      const motivo = error?.details?.reason;
      faixaDoPainel(motivo === 'session_expired'
        ? 'Sua sessão expirou. Entre de novo para continuar.'
        : 'Sua sessão no painel não vale mais. Entre de novo.', { entrarDeNovo: true });
    }

    /** A conexao de tempo real caiu/voltou: avisa sem tirar nada da tela. */
    function conexaoOscilou(caiu) {
      // O selo do cabeçalho dos comandos é escrito ANTES da guarda da sessão: a
      // conexão que caiu é fato, e a sessão vencida é outra conversa. A faixa do
      // painel continua sendo quem fala da sessão.
      state.conexaoAoVivo = !caiu;
      pintarSeloDeSincronia();
      if (state.sessionLost) return; // a faixa ja diz o que importa agora
      faixaDoPainel(caiu ? 'Reconectando ao servidor…' : '');
    }

    // "Entrar de novo": revela o campo da senha NA PROPRIA FAIXA e poe o foco
    // nele. O professor nao perde a sala que estava acompanhando e nao cai numa
    // tela vazia.
    $('[data-arena-session-retry]')?.addEventListener('click', () => {
      const formulario = $('[data-arena-session-retry-form]');
      if (!formulario) return;
      formulario.hidden = false;
      const campo = formulario.elements.password;
      if (campo) campo.focus();
    });

    $('[data-arena-session-retry-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formulario = event.currentTarget;
      const campo = formulario.elements.password;
      const botao = formulario.querySelector('button[type=submit]');
      // O rotulo de repouso vem do PROPRIO markup, guardado na primeira vez — a
      // mesma regra do botao de envio do aluno: uma frase existe num lugar so, e
      // o bundle nao duplica o que o HTML ja escreve.
      if (botao && !botao.dataset.labelRepouso) botao.dataset.labelRepouso = botao.textContent;
      if (botao) botao.disabled = true;
      try {
        // `login` ja sabe reentrar sem recarregar quando o painel esta na tela:
        // ele limpa a faixa, mostra o conteudo e rele tudo com a sessao nova.
        await login(campo?.value || '');
      } catch (error) {
        // A causa vem do servidor ("Senha administrativa incorreta."): o aviso
        // de sessao nao vira alerta, e o campo continua aberto para a nova
        // tentativa. Sem mensagem do servidor, o aviso que ja estava na tela
        // continua valendo — melhor que inventar uma segunda frase.
        if (sessionBanner) {
          const textoNode = $('[data-arena-session-text]', sessionBanner);
          if (textoNode && error.message) textoNode.textContent = error.message;
          sessionBanner.hidden = false;
        }
        if (botao) { botao.disabled = false; botao.textContent = botao.dataset.labelRepouso || botao.textContent; }
        campo?.select();
      }
    });

    async function login(password) {
      // O servidor valida a senha e grava o cookie HttpOnly; sem token no corpo
      // nem na URL.
      await api('admin_login', { password });
      // Sessao que venceu COM o painel na tela: o cookie novo ja vale para esta
      // pagina, entao entrar de novo no lugar devolve o professor a sala que ele
      // estava acompanhando — o detalhe aberto volta a atualizar, sem recarga.
      // Sem painel renderizado (entrada do zero), o reload e o caminho: a pagina
      // autenticada vem do servidor.
      if ($('[data-admin-arena-content]')) {
        state.sessionLost = false;
        faixaDoPainel('');
        showContent();
        await refreshAll();
        return;
      }
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
      // O ESTADO DO PORTÃO NO PRÓPRIO BOTÃO: com a sala em cena o cartão da
      // Visão Geral sai de cena — e leva o portão junto. Fechado, ele é uma
      // trava de verdade: a turma não entra em sala nenhuma. Por isso o cartão
      // volta só nesse caso (a regra vive em `refinement.css`), e é este
      // atributo que a folha lê.
      button.dataset.gate = state.open ? 'open' : 'closed';
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

    /**
     * A LISTA é um SELETOR, não um painel de controle em miniatura.
     *
     * Cada sala chegou a carregar seis botões (ver, abrir, iniciar, encerrar,
     * arquivar, excluir), cinco selos (estado, PIN, missões, modalidade, o aviso
     * de missão pendente) e um par de números — tudo com o mesmo peso, repetido
     * para cada sala. Quem procurava "qual aula eu abro agora" tinha antes de
     * decidir o que olhar. Aqui a linha responde duas coisas e para: QUAL é a
     * sala e EM QUE PÉ ela está (o estado e quem está online). O resto — abrir,
     * começar, encerrar, arquivar, excluir — mora na sala em destaque, que é o
     * centro de comando, e vale para a sala selecionada.
     *
     * A linha inteira é UM controle: o botão ocupa a área toda (`arena-room-pick`)
     * e leva `data-action="detail"`, de modo que clicar em qualquer ponto do
     * cartão seleciona. Selo de missão pendente fica: sala que não abre é uma
     * sala que o professor precisa enxergar na lista.
     */
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
      list.innerHTML = state.rooms.map((room) => {
        const selecionada = room.id === state.selectedRoomId;
        const online = Number(room.connected || 0);
        return `
        <article class="arena-room-row${selecionada ? ' is-selected' : ''}" data-room-id="${esc(room.id)}">
          <button type="button" class="arena-room-pick" data-action="detail"${selecionada ? ' aria-current="true"' : ''}>
            <strong class="arena-room-pick-title">${esc(room.title)}</strong>
            <span class="arena-room-pick-line">
              <span class="arena-status-badge is-${esc(room.status)}">${STATUS_LABELS[room.status] || room.status}</span>
              <span class="arena-room-pick-sep" aria-hidden="true">·</span>
              <span class="arena-room-pick-online${online > 0 ? ' is-live' : ''}">${online} online</span>
              ${(room.blockers || []).length ? `<span class="arena-room-blocked-badge" title="Missões que impedem abrir a sala">⚠ ${(room.blockers || []).length} a corrigir</span>` : ''}
            </span>
          </button>
        </article>`;
      }).join('');
      renderTopbarQuick();
    }

    /**
     * AS DUAS PORTAS DE INSPEÇÃO da sala em destaque, no topo do painel.
     *
     * Ver como o aluno e ver a projeção é o que o professor mais faz NO MEIO da
     * aula — conferir o que a turma recebeu e o que está na parede —, e as duas
     * estavam atrás do •••, junto de editar, bloquear, arquivar e excluir. Aqui
     * elas ficam à mão, ligadas à sala em destaque (é ELA que elas abrem), e o
     * ••• volta a ser o que o nome diz: o menu do que é administrativo. Sem sala
     * selecionada não há o que inspecionar, e as portas não aparecem — um botão
     * que abre "a sala" sem dizer qual é pior do que botão nenhum.
     */
    function renderTopbarQuick() {
      // AS DUAS PORTAS moram em lugares diferentes, como no print: a do aluno é
      // uma INSPEÇÃO e fica na linha dos selos, na ponta; a da projeção entra na
      // fila dos comandos da aula, entre "encerrar rodada" e "encerrar sala".
      const alvo = $('[data-arena-topbar-quick]');
      const portas = $('[data-arena-chips-doors]');
      if (!alvo && !portas) return;
      const room = (state.rooms || []).find((entrada) => entrada.id === state.selectedRoomId);
      if (!room) {
        for (const slot of [alvo, portas]) {
          if (!slot) continue;
          slot.hidden = true;
          slot.innerHTML = '';
        }
        return;
      }
      if (portas) {
        portas.hidden = false;
        portas.innerHTML = `<a class="arena-preview-open" href="/aluno-preview.php?room=${encodeURIComponent(room.id)}" target="_blank" rel="noopener">👁 Ver como o aluno</a>`;
      }
      if (alvo) {
        alvo.hidden = false;
        alvo.innerHTML = `<a class="arena-preview-open is-tv" href="/tv-preview.php?room=${encodeURIComponent(room.id)}" target="_blank" rel="noopener">📺 Ver na TV</a>`;
      }
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

    /**
     * O FILTRO DA LISTA DE ALUNOS — a escolha do professor, reaplicada a cada
     * desenho.
     *
     * A tabela é reescrita inteira a cada leitura do servidor, e sem isto o
     * filtro voltaria para "Todos" no poll seguinte, no meio da aula. A regra é
     * a mesma que a linha usa para se classificar (`data-aluno-estado`), e o
     * botão aceso diz qual delas está valendo.
     */
    function aplicarFiltroDeAlunos() {
      // A TABELA DOS ALUNOS VIVE ABERTA na seção "Participantes da arena"
      // (`.arena-people`): a dobra `[data-fold-key=participantes]` que este leitor
      // procurava deixou de existir quando a lista foi para o centro da tela, e o
      // seletor órfão fazia este `return` acontecer sempre — o botão de filtro
      // aceso e nenhuma linha escondida, que é um controle morto na mão do
      // professor. A folha que apaga a linha (`tr[data-filtro-fora]`) já estava
      // lá, esperando quem escrevesse a marca.
      const corpo = $('[data-arena-detail-body] .arena-table tbody');
      if (!corpo) return;
      const filtro = state.filtroDeAlunos || 'todos';
      const grupos = {
        enviados: ['is-enviou', 'is-avaliando', 'is-avaliado'],
        respondendo: ['is-escrevendo'],
        atencao: ['is-desconectado', 'is-removido', 'is-sem-nota'],
      };
      for (const linha of corpo.querySelectorAll('tr')) {
        const estado = linha.dataset.alunoEstado || '';
        const visivel = filtro === 'todos' || (grupos[filtro] || []).includes(estado);
        // Esconder é por MARCA, não pelo atributo `hidden`: a linha da tabela tem
        // `display` de tabela declarado pela folha, e o `hidden` do navegador
        // (folha do usuário) perde para ele — a linha continuaria pintada. Quem
        // apaga a linha é a folha, no composto que casa esta marca.
        if (visivel) delete linha.dataset.filtroFora;
        else linha.dataset.filtroFora = '';
      }
      for (const botao of document.querySelectorAll('[data-student-filters] [data-student-filter]')) {
        const aceso = botao.dataset.studentFilter === filtro;
        botao.classList.toggle('is-on', aceso);
        botao.setAttribute('aria-pressed', aceso ? 'true' : 'false');
      }
    }

    /**
     * O SELO DA SINCRONIA do cabeçalho dos comandos.
     *
     * Ele diz o que o professor precisa saber sem procurar: o tempo real está de
     * pé. Nasce escrito pelo markup e é reescrito quando o stream cai ou volta
     * (`conexaoOscilou`) — a mesma informação que a faixa do painel dá, no lugar
     * onde ele está olhando quando aperta um controle.
     */
    function pintarSeloDeSincronia() {
      const selo = $('[data-arena-workbench-sync]');
      if (!selo) return;
      const caindo = state.conexaoAoVivo === false;
      selo.classList.toggle('is-caindo', caindo);
      selo.textContent = caindo ? '● reconectando' : '● sincronização ao vivo';
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
      // Resposta de acao que perdeu a corrida para um evento mais novo: nao
      // repinta (ver `aceitaRevisao`).
      trocouDeSala('painel', data.detail?.room?.id ?? null);
      if (!aceitaRevisao('painel', data.detail?.room)) return;
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
        // Revisao mais velha que a que ja esta na tela: a leitura perdeu a
        // corrida para um evento — descarta, em vez de voltar o painel para um
        // estado que ja passou.
        trocouDeSala('painel', data.detail?.room?.id ?? null);
        if (!aceitaRevisao('painel', data.detail?.room)) return;
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
        // Sessao vencida: para o poll e avisa. Sem este ramo, o 401 caia no
        // "mantem a ultima renderizacao" abaixo e a consulta continuava a cada
        // 3 s, para sempre, sem ninguem saber.
        if (error.status === 401) { sessaoExpirada(error); return; }
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
      state.sseOff = subscribeRoomEvents((acao, evento) => {
        if (state.selectedRoomId !== roomId) return;
        // Aviso de uma versao que a tela ja pintou nao vira consulta.
        if (eventoAvanca('painel', evento)) refreshDetailQuiet(roomId);
      }, eventsQuery(roomId), {
        // Stream de volta: releitura completa do detalhe aberto (o que passou na
        // queda pode nao ter sido visto) e o aviso de conexao sai.
        onReconnect: () => {
          conexaoOscilou(false);
          if (state.selectedRoomId === roomId) refreshDetailQuiet(roomId);
        },
        onDrop: () => conexaoOscilou(true),
      });
      state.detailPoll = window.setInterval(() => {
        // Sessao caida: quem fala com o professor e a faixa, e nao uma consulta
        // por segundo levando 401.
        if (state.sessionLost) return;
        if (state.selectedRoomId !== roomId) return;
        if (!state.hiddenClock()) return;
        // Com SSE ativo, o poll vira batimento cardiaco: so consulta se nada chegou a tempo.
        if (!pollDue('painel', 3000)) return;
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
          <!-- O CABEÇALHO DO SORTEIO é o do print: o ícone num ladrilho, o título
               em caixa alta com a linha que diz para que ele serve, e a contagem
               na ponta. Sem a linha de apoio o professor tinha de deduzir do
               título o que o sorteio faz. -->
          <div class="arena-draw-head">
            <span class="arena-draw-icon" aria-hidden="true">🎲</span>
            <div class="arena-draw-title">
              <h3>Sorteio da vez</h3>
              <p>Selecione participantes para a banca ou duelo ao vivo.</p>
            </div>
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

    /**
     * OS INDICADORES DA PARTIDA — três cartões, um número cada (LA-06).
     *
     * A referência abre o painel da partida com três cartões na mesma linha:
     * quem está dentro, quantos já entregaram e como o juiz está vendo a turma.
     * Nas salas do Modo Arena os MESMOS três lugares mostram o Juiz/Boss, a
     * energia da turma e o acerto — é o que aquela batalha mede, e trocar o
     * conteúdo dos cartões (não o desenho deles) é o que mantém uma linguagem só.
     *
     * Cada número sai do mesmo detalhe que o resto do painel lê: contagem de
     * participantes, envios da rodada no ar e ranking da missão. Nada aqui é
     * calculado no cliente sem lastro no servidor. O CARTÃO DA RODADA, com o
     * cronômetro, saiu desta faixa e mora no palco da partida, logo acima — é
     * onde a referência o põe, e é ele que decide a próxima ação.
     */
    function indicadoresDaPartida({ connectedCount, activeCount, rosterTotal, rounds, rodadaNoAr, rodadaPausada, exigeSalaCheia, arena }) {
      const parte = (valor, todo) => (Number(todo) > 0 ? Math.max(0, Math.min(100, (Number(valor) / Number(todo)) * 100)) : 0);
      const medidor = (valor) => `<span class="arena-metric-bar" aria-hidden="true"><span style="width:${valor.toFixed(1)}%"></span></span>`;
      const faltam = Math.max(0, rosterTotal - activeCount);
      // A RODADA DESTES CARTÕES: a que está no ar; sem ela, a ÚLTIMA que tem o
      // que dizer (envios ou notas). Numa sala que já jogou, os cartões não
      // podem ficar em branco: o número existe — a linha de estado, logo acima,
      // chega a escrever "3 enviados" no mesmo instante em que o cartão dizia
      // "sem missão no ar". Era o defeito da tela encerrada: dado da própria
      // aula escondido atrás de um traço.
      const rodadaDaFaixa = rodadaNoAr
        || [...(rounds || [])].reverse().find((round) => Number(round.submitted || 0) > 0 || (round.ranking || []).length > 0)
        || null;
      const encerrada = !rodadaNoAr && Boolean(rodadaDaFaixa);
      const enviados = Number(rodadaDaFaixa?.submitted || 0);
      const abertos = rodadaDaFaixa?.status === 'open' && !rodadaPausada;
      const digitando = abertos ? Math.max(0, activeCount - enviados) : 0;
      const notas = (rodadaDaFaixa?.ranking || []).map((linha) => Number(linha.percent)).filter((valor) => Number.isFinite(valor));
      const media = notas.length ? Math.round(notas.reduce((soma, valor) => soma + valor, 0) / notas.length) : null;
      // Uma linha por cartão, e nada de parágrafo: o que falta para começar é a
      // única coisa que muda a ação do professor, e é ela que a nota diz.
      const fraseDeOnline = !activeCount
        ? 'ninguém entrou ainda'
        : (exigeSalaCheia && faltam
          ? `faltam ${faltam} para começar`
          : (faltam ? `${faltam} ${faltam === 1 ? 'vaga livre' : 'vagas livres'}` : 'sala completa'));
      const cartoes = arena && arena.enabled ? `
          <article class="arena-metric is-boss">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Juiz / Boss</span>
              <span class="arena-metric-value"><b>${Number(arena.boss?.health ?? 0)}</b><i>/${Number(arena.boss?.max_health ?? 0)}</i></span>
            </header>
            ${arenaHeartsMarkup(arena)}
            <p class="arena-metric-note">${arena.boss?.defeated ? 'derrotado' : `${Number(arena.boss?.health ?? 0)} ${Number(arena.boss?.health ?? 0) === 1 ? 'coração' : 'corações'} restantes`}</p>
          </article>
          <article class="arena-metric is-energy">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Energia da turma</span>
              <span class="arena-metric-value"><b>${Number(arena.energy?.current ?? 0)}</b><i> EP</i></span>
            </header>
            ${arenaEnergyMarkup(arena)}
            <p class="arena-metric-note">${Number((arena.energy?.powers || []).length)} poder(es) pronto(s)</p>
          </article>
          <article class="arena-metric is-accuracy">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Acerto da turma</span>
              <span class="arena-metric-value"><b>${arena.dynamic?.result?.percent != null ? `${Math.round(Number(arena.dynamic.result.percent))}%` : '—'}</b></span>
            </header>
            ${arenaAccuracyMarkup(arena.dynamic && arena.dynamic.result)}
            <p class="arena-metric-note">calculado em tempo real</p>
          </article>` : `
          <article class="arena-metric is-online">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Conectados</span>
              <span class="arena-metric-value"><b>${connectedCount}</b><i>/ ${rosterTotal}</i></span>
            </header>
            ${medidor(parte(connectedCount, rosterTotal))}
            <p class="arena-metric-note">${activeCount} inscritos · ${esc(fraseDeOnline)}</p>
          </article>
          <article class="arena-metric is-submits">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Envios de prompts</span>
              <span class="arena-metric-value"><b>${rodadaDaFaixa ? enviados : '—'}</b><i>${rodadaDaFaixa ? `/ ${activeCount}` : ''}</i></span>
            </header>
            ${medidor(rodadaDaFaixa ? parte(enviados, activeCount) : 0)}
            <p class="arena-metric-note">${rodadaDaFaixa
              ? `${parte(enviados, activeCount).toFixed(0)}% concluído${digitando ? ` · ${digitando} digitando` : ''}`
              : 'abra a missão para acompanhar'}</p>
          </article>
          <article class="arena-metric is-judge">
            <header class="arena-metric-head">
              <span class="arena-metric-label">Média do juiz</span>
              <span class="arena-metric-value"><b>${media != null ? `${media}%` : '—'}</b></span>
            </header>
            ${medidor(media ?? 0)}
            <p class="arena-metric-note">${notas.length
              ? `${notas.length} ${notas.length === 1 ? 'avaliado' : 'avaliados'}${encerrada ? ' · última missão' : ''}`
              : 'nada avaliado nesta missão'}</p>
          </article>`;
      return `
        <section class="arena-metrics" aria-label="Indicadores da partida">${cartoes}
        </section>`;
    }

    /**
     * A LEITURA DA PARTIDA — o que o palco diz e o que o pé do painel diz.
     *
     * A referência abre o painel da partida com o nome da rodada e o que está
     * acontecendo com ela, e fecha com uma frase de uma linha que explica qual é
     * o próximo passo ("Finalize a missão para avançar para a próxima etapa").
     * São estas as duas frases — nenhuma delas repete contagem: lugares, envios e
     * notas já estão na linha de estado do cabeçalho e nos indicadores logo
     * abaixo. Cada frase sai de um dado do servidor; nenhuma é enfeite.
     */
    function leituraDaPartida({ room, detail, rodadaNoAr, rodadaPausada, activeCount, rosterTotal, exigeSalaCheia }) {
      const rodadas = detail.rounds || [];
      const total = rodadas.length || 1;
      const proxima = rodadas.find((rodada) => rodada.status === 'pending') || null;
      const posicao = proxima ? Number(proxima.position || 1) : 0;
      const noAr = Boolean(rodadaNoAr);
      const entregaram = Number(rodadaNoAr?.submitted || 0);
      const avaliados = (rodadaNoAr?.ranking || []).length;
      const trava = exigeSalaCheia && activeCount < rosterTotal;
      let selo = 'SALA EM DESTAQUE';
      let titulo = room.title;
      let nota = '';
      if ((detail.blockers || []).length) {
        selo = 'ANTES DE ABRIR';
        titulo = 'Falta o que o juiz precisa';
        nota = 'Corrija as missões abaixo para a sala abrir.';
      } else if (room.status === 'draft') {
        selo = 'SALA EM RASCUNHO';
        titulo = proxima ? `Missão ${posicao} — ${proxima.title}` : 'Sem missão nesta sala';
        nota = proxima ? 'Abra a sala para o código aceitar alunos.' : 'Adicione a primeira missão da aula.';
      } else if (noAr) {
        selo = rodadaPausada
          ? `RODADA ${Number(rodadaNoAr.position)} DE ${total} · PAUSADA`
          : (rodadaNoAr.status === 'results'
            ? `MISSÃO ${Number(rodadaNoAr.position)} DE ${total} · RESULTADO NA TELA`
            : `RODADA ${Number(rodadaNoAr.position)} DE ${total} · AO VIVO`);
        titulo = rodadaPausada
          ? `Rodada ${Number(rodadaNoAr.position)} de ${total} — ${rodadaNoAr.title}`
          : (rodadaNoAr.status === 'results'
            ? `Missão ${Number(rodadaNoAr.position)} de ${total} — ${rodadaNoAr.title}`
            : `Rodada ${Number(rodadaNoAr.position)} de ${total} — ${rodadaNoAr.title}`);
        nota = rodadaPausada
          ? 'Cronômetros congelados: retome para a turma voltar a escrever.'
          : (rodadaNoAr.status === 'results'
            ? `Notas no telão${avaliados ? ` · ${avaliados} ${avaliados === 1 ? 'avaliado' : 'avaliados'}` : ''}. Feche os resultados para seguir.`
            : (activeCount > 0 && entregaram >= activeCount
              ? 'Todos entregaram: encerre a rodada para fechar a missão.'
              : 'A turma escreve até o cronômetro acabar ou você encerrar a rodada.'));
      } else if (trava) {
        selo = 'SALA ABERTA · ESPERANDO A TURMA';
        titulo = 'O início espera a sala lotar';
        nota = `Faltam ${Math.max(0, rosterTotal - activeCount)} de ${rosterTotal} lugares para o início.`;
      } else if (['waiting', 'open', 'playing'].includes(room.status)) {
        selo = `BATALHA DE ${rodadas.length} ${rodadas.length === 1 ? 'MISSÃO' : 'MISSÕES'}`;
        titulo = proxima ? `Missão ${posicao} — ${proxima.title}` : room.title;
        nota = room.status === 'playing'
          ? 'A turma escreve até você abrir a próxima missão.'
          : 'A missão abre no telão e no aparelho de cada aluno.';
      } else if (room.status === 'ended') {
        selo = 'BATALHA ENCERRADA';
        titulo = 'As notas estão no relatório';
        nota = 'Outra batalha mantém código e missões e zera as tentativas.';
      }
      return { selo, titulo, nota };
    }

    /**
     * O ROTEIRO DE MISSÕES (referência LA-06).
     *
     * A referência lista as missões da sala em LINHAS: o número da posição, o
     * nome, o que a missão é (modalidade, tempo, tentativas), as setas de ordem e
     * o "Editar". O que o aluno recebe e o gabarito do juiz continuam ali, um
     * clique abaixo, na dobra de cada linha — é o mesmo dado de antes, na altura
     * em que o professor o procura, sem transformar cada missão num cartão
     * grande.
     *
     * As classes e os ganchos são os mesmos de antes (`arena-round-card`,
     * `.arena-rounds-grid`, `[data-round-timer]`, `data-round-id` e as dobras por
     * missão): o que mudou foi o desenho da linha, não o vocabulário do cliente.
     */
    function roteiroDeMissoes({ room, rounds, rodadaNoAr, canEditRounds }) {
      const abertura = `
          <header class="arena-section-head">
            <div class="arena-section-title">
              <h2>Roteiro de missões</h2>
              <p>Ordem e configuração das missões desta sala.</p>
            </div>
            ${canEditRounds ? '<button type="button" class="arena-section-cta" data-action="add-round">+ Adicionar do banco</button>' : ''}
          </header>`;
      if (!rounds.length) {
        return `
        <section class="arena-queue arena-roadmap" aria-label="Roteiro de missões">${abertura}
          <p class="arena-empty">Esta sala ainda não tem missão nenhuma. Use <b>Adicionar do banco</b> aqui em cima ou o botão <b>Adicionar à sala</b> em uma aula — o que o aluno vai ver aparece nesta lista, com imagem e gabarito.</p>
        </section>`;
      }
      const linhas = rounds.map((round, roundIndex) => {
        const noAr = Boolean(rodadaNoAr && round.id === rodadaNoAr.id);
        const faltando = round.missing || [];
        const tentativas = Number(round.attempts || 1);
        const segundos = Number(round.duration_seconds) || 0;
        const criterios = round.criteria || [];
        const avaliados = (round.ranking || []).length;
        const enviados = Number(round.submitted || 0);
        const pausada = round.paused_at != null && Number.isFinite(Number(round.paused_at));
        const stats = enviados || avaliados || round.status === 'open'
          ? `<p class="arena-round-stats"><b>${enviados}</b> ${enviados === 1 ? 'envio' : 'envios'} · <b>${avaliados}</b> ${avaliados === 1 ? 'avaliado' : 'avaliados'}${round.status === 'open'
            ? (pausada
              ? ' · <span class="arena-round-countdown is-paused">⏸ pausada</span>'
              : (round.deadline_at ? ` · <span class="arena-round-countdown" data-round-countdown="${Number(round.deadline_at)}"></span>` : ''))
            : (round.deadline_at ? ` · prazo ${new Date(Number(round.deadline_at) * 1000).toLocaleTimeString('pt-BR')}` : '')}</p>`
          : '';
        return `
          <li class="arena-round-card is-${esc(round.status)}${noAr ? ' is-live' : ''}${pausada ? ' is-paused' : ''}" data-round-id="${esc(round.id)}">
            <div class="arena-round-row">
              <span class="arena-round-num" aria-hidden="true">${round.position}</span>
              <div class="arena-round-head">
                <h4 class="arena-round-title">${esc(round.title)}</h4>
                <p class="arena-round-meta">
                  <span class="arena-status-badge is-${esc(round.status)}">${pausada ? 'PAUSADA' : STATUS_LABELS[round.status] || round.status}</span>
                  <span class="arena-round-kicker">${esc(MODALITY_LABELS[round.modality] || round.modality)} · ${segundos ? `${segundos}s` : 'sem tempo'} · ${tentativas} ${tentativas === 1 ? 'tentativa' : 'tentativas'}</span>
                  <span class="arena-round-timer${segundos > 0 ? '' : ' is-untimed'}" data-round-timer title="${segundos > 0 ? 'Cronômetro desta missão' : 'Sem cronômetro: a rodada termina quando você encerrar'}">⏱ ${esc(roundTimerLabel(round))}</span>
                  ${faltando.length ? `<span class="arena-round-missing">⚠ ${faltando.map((key) => MISSING_LABELS[key] || key).join(' · ')}</span>` : ''}
                </p>
                ${stats}
              </div>
              <div class="arena-round-manage">
                ${canEditRounds ? `<button type="button" data-action="move-round" data-dir="up" ${roundIndex === 0 ? 'disabled' : ''} title="Mover para cima">↑</button>
                <button type="button" data-action="move-round" data-dir="down" ${roundIndex === rounds.length - 1 ? 'disabled' : ''} title="Mover para baixo">↓</button>` : ''}
                <button type="button" class="arena-round-edit${faltando.length ? ' is-fix' : ''}" data-action="fix-round"${faltando.length ? ` data-missing="${esc(faltando.join(','))}"` : ''} data-challenge-id="${esc(round.challenge_id || '')}">${faltando.length ? '✎ Corrigir' : 'Editar'}</button>
                ${canEditRounds ? '<button type="button" class="arena-round-remove" data-action="remove-round">Remover da sala</button>' : ''}
              </div>
            </div>
            <details class="arena-round-fold" data-fold-key="missao:${esc(round.id)}">
              <summary>O aluno recebe</summary>
              ${round.reference_image
                ? `<figure class="arena-round-figure"><img src="${esc(round.reference_image)}" alt="Imagem que o aluno vai ver nesta missão" loading="lazy"></figure>`
                : (faltando.includes('imagem') ? '<p class="arena-round-figure is-missing">FALTA IMAGEM</p>' : '')}
              ${round.mission ? `<p class="arena-round-mission">${esc(round.mission)}</p>` : ''}
              <p class="arena-round-limits">Limite: <b>${esc(limiteDeCaracteres(round.modality))} caracteres</b> · ${tentativas} ${tentativas === 1 ? 'tentativa' : 'tentativas'}</p>
              ${criterios.length ? `<ul class="arena-mission-criteria" aria-label="Critérios do juiz">${criterios.map((entrada) => `<li>${esc(CRITERION_LABELS[entrada.criterion] || entrada.criterion)} ${Number(entrada.weight) || 0}%</li>`).join('')}</ul>` : ''}
            </details>
            ${faltando.includes('gabarito')
              ? '<div class="arena-round-gabarito is-missing"><span>SEM GABARITO</span><p>Sem ele o juiz só compara com a missão. Use <b>Corrigir</b> acima para preencher agora.</p></div>'
              : `<details class="arena-round-fold" data-fold-key="gabarito:${esc(round.id)}">
              <summary>Gabarito do juiz</summary>
              <div class="arena-round-gabarito">
              <p>${esc(round.gabarito_text || '')}</p>
              ${round.reference_text && round.expected_result ? `<p class="is-alt">${esc(round.expected_result)}</p>` : ''}
              </div>
            </details>`}
            ${round.judge && round.judge.local
              ? `<p class="arena-round-judge">${round.judge.local} de ${round.judge.total} nota(s) vieram do juiz local (${esc(motivoDoJuizLocal(round.judge.reasons))}).</p>`
              : (round.judge && round.judge.total && round.judge.model
                ? `<p class="arena-round-judge">Notas avaliadas por <b>${esc(round.judge.model)}</b>.</p>`
                : '')}
          </li>`;
      }).join('');
      return `
        <section class="arena-queue arena-roadmap" aria-label="Roteiro de missões">${abertura}
          <ol class="arena-rounds-grid">${linhas}</ol>
        </section>`;
    }

    function renderDetail(detail) {
      const panel = $('[data-arena-detail]');
      panel.hidden = false;
      renderTopbarQuick();
      // Sem o código no título: ele já aparece grande no convite, e o mesmo
      // número escrito duas vezes na mesma tela não informa nada.
      $('[data-arena-detail-title]').textContent = detail.room.title;
      const room = detail.room;
      const roomClassic = isClassicish(room);
      // O selo do estado subiu para o cabecalho, ao lado de "sala em destaque"
      // (LA-06): e o mesmo dado, dito uma vez so. O corpo comeca na linha de
      // numeros e termina nas acoes.
      const rosterTotal = roomClassic ? (room.expected_players || room.settings?.maxPlayers || 3) : (room.expected_players || detail.participants.filter((p) => p.active).length || 35);
      // Sala cheia e exigencia de quem TRAVA o cadastro (`rosterLocksAtStart`, o
      // preset Classico de 3 lugares fixos), nao da familia do juiz: o preset
      // Turma e classico no juiz e LIVRE na entrada (o formulario ate chama a
      // quantidade de Participantes, que o professor le como capacidade). A acao
      // do servidor sempre olhou esta bandeira; a tela e que pedia a sala cheia
      // e desabilitava o inicio com 3 alunos de 35.
      const exigeSalaCheia = roomClassic && room.settings?.rosterLocksAtStart === true;
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
      // As duas leituras que o estado de cada aluno consulta: a fila do juiz (o
      // envio que ainda não voltou com nota) e o ranking da rodada no ar.
      const aguardandoJuiz = new Set((detail.waiting?.items || []).map((entry) => String(entry.participant_id)));
      const notaDaRodada = new Map(((rodadaNoAr?.ranking) || []).map((entry) => [String(entry.participant_id), entry]));

      // O convite: código, link, QR e projeção. Na espera ele fica aberto, que é
      // quando ele serve para trazer gente; com a atividade em andamento vai para
      // uma dobra com o PIN na alça — o atrasado entra, e a missão não desce.
      // O código tem um estado, e ele muda o que o professor FAZ com ele: a sala
      // que recebe gente, a bloqueada que recusa quem tem o número na mão e a que
      // já fechou. Antes disso a única pista era a frase "Alunos entram com este
      // código" — que sumia justamente durante a aula, quando o atrasado bate na
      // porta e o professor precisa saber se ele ainda entra.
      const recebe = podeEntrar(room, rounds);
      const estadoDoAcesso = room.entry_blocked
        ? { classe: 'is-bloqueado', rotulo: 'Entrada bloqueada' }
        : (recebe ? { classe: 'is-ativo', rotulo: 'Ativo' } : { classe: 'is-encerrado', rotulo: 'Fechado' });
      // Duas colunas, como a referencia (LA-06): acesso a esquerda — codigo,
      // link, QR e projecao — e partida a direita, com o preset, a regra, a
      // rodada que esta no ar e a acao primaria. Embaixo, na coluna da partida,
      // a faixa de indicadores do modo Arena (so onde esses dados existem).
      const rodadaPausada = rodadaNoAr && rodadaNoAr.paused_at != null && Number.isFinite(Number(rodadaNoAr.paused_at));
      // O estado vivo e a ação da vez: as duas perguntas que o professor faz
      // olhando a tela. `faltam` é quem ainda não enviou na missão aberta — o
      // número que separa "acompanhar" de "encerrar" —, e `marca` escreve no
      // botão que executa a ação o atributo que o desenho destaca. `acao.id`
      // vazio não marca botão nenhum, e isso é resposta: a ação é esperar.
      const faltam = current ? Math.max(0, activeCount - openSubmitters.size) : 0;
      const acao = acaoDaVez({
        room, detail, current, results, pausada: rodadaPausada, startLabel, faltam,
        // A trava do início: a mesma condição do `disabled` do botão grande.
        trava: exigeSalaCheia && activeCount < rosterTotal,
      });
      const semNota = Number(detail.waiting?.total || 0);
      // `marca` é o desenho da ação da vez: UM botão recebe o peso de primário, e
      // é o mesmo que a célula "Próxima ação" aponta. `fix-all` fica de fora
      // porque quem o executa é o botão da faixa de bloqueios, logo acima —
      // repetir aqui daria dois botões para o mesmo conserto.
      const marca = (id) => (acao.id === id ? ' data-proximo' : '');
      const pendentes = rounds.some((round) => round.status === 'pending');
      const travaDoInicio = exigeSalaCheia && activeCount < rosterTotal;
      // Sala travada espera a turma: a ação existe (iniciar), mas o botão dela
      // não pode nada. Ele fica no lugar da primária, desabilitado e com o
      // motivo no `title` — esconder deixaria o professor procurando o que
      // fazer, e habilitar prometeria uma partida que o servidor recusa.
      const startTravado = travaDoInicio && ['waiting', 'open'].includes(room.status) && pendentes;
      // A AÇÃO DA VEZ É UMA SÓ, E ELA MORA NO PALCO DA PARTIDA.
      //
      // A referência abre o painel da partida com o nome da rodada à esquerda e o
      // botão grande à direita; o cabeçalho fica com os controles do MEIO da aula
      // (pausar, encerrar a rodada, fechar o placar) e com as portas de inspeção.
      // Antes, a primária era um ladrilho no meio deles: o professor tinha de ler
      // a linha inteira para achar o botão que a tela estava pedindo.
      const primario = acao.id && acao.id !== 'fix-all'
        ? `<button type="button" class="arena-detail-primary" data-action="${esc(acao.id)}" data-proximo>${esc(acao.rotulo)}</button>`
        : (startTravado
          ? `<button type="button" class="arena-detail-primary" data-action="start" disabled title="Faltam ${Math.max(0, rosterTotal - activeCount)} lugares.">${esc(startLabel)}</button>`
          : '');
      // Os controles DA BATALHA ficam à vista, no cabeçalho: pausar, encerrar a
      // rodada e fechar o placar são decisões do meio da aula e não podem custar
      // dois cliques. O que já está no botão do palco sai daqui — dois controles
      // para a mesma ação foi como esta linha virou uma lista de sete botões com
      // o mesmo peso.
      const secundarias = [
        current ? (rodadaPausada
          ? { id: 'resume-round', html: `<button type="button" data-action="resume-round">${ROTULOS_DA_BATALHA.resumeRound}</button>` }
          : { id: 'pause-round', html: '<button type="button" data-action="pause-round">Pausar missão</button>' }) : null,
        current ? { id: 'end-round', html: `<button type="button" data-action="end-round">${ROTULOS_DA_BATALHA.endRound}</button>` } : null,
        results ? { id: 'close-round', html: `<button type="button" data-action="close-round">${ROTULOS_DA_BATALHA.closeRound}</button>` } : null,
        room.status === 'playing' && !current && !results && pendentes
          ? { id: 'start', html: `<button type="button" data-action="start">${esc(startLabel)}</button>` } : null,
      ].filter((entrada) => entrada && entrada.id !== acao.id);
      // O selo do estado sobe para o cabeçalho: ele e a linha de números leem o
      // MESMO rótulo, e a pausa da rodada informa melhor a decisão imediata do
      // que o estado técnico "Em jogo".
      const estado = estadoDaSala({
        room, exigeSalaCheia, activeCount, rosterTotal,
        pendentes: (detail.rounds || []).some((round) => round.status === 'pending'),
      });
      // O ESTADO VIVO DA RODADA, escrito no mesmo rótulo do selo: com uma missão
      // no ar, "Em jogo" sozinho não diz qual delas, e é essa a pergunta que o
      // professor faz no meio da aula. Pausa e resultados entram pelo mesmo
      // caminho — são os dois instantes em que o relógio não corre mais.
      const estadoVivo = !rodadaNoAr
        ? (room.status === 'playing' ? 'Entre rodadas' : '')
        : rodadaPausada
          ? 'Pausada'
          : rodadaNoAr.status === 'results'
            ? `Missão ${Number(rodadaNoAr.position)} · resultados no ar`
            : `Missão ${Number(rodadaNoAr.position)} de ${rounds.length}`;
      const estadoSlot = $('[data-arena-detail-state]');
      if (estadoSlot) {
        // O selo é TAMBÉM a célula de estado da faixa (`arena-state-cell
        // is-estado`): é ele que os portões leem para conferir que a tela diz
        // em que pé a sala está. O `<b>` é o valor, como nas outras células — o
        // desenho já o escrevia no `textContent` e o portão não tinha o que ler.
        // O rótulo vivo SÓ entra quando acrescenta alguma coisa: na rodada
        // pausada o valor base já é "Pausada" e o vivo também — o selo saía
        // escrito duas vezes ("Pausada · Pausada"), que é a repetição que o
        // plano proíbe. Mesma regra para qualquer estado em que os dois
        // coincidam: repetir não informa.
        const rotuloEstado = rodadaPausada ? 'Pausada' : estado.texto;
        const vivo = estadoVivo && estadoVivo !== rotuloEstado ? estadoVivo : '';
        estadoSlot.innerHTML = `<b>${esc(rotuloEstado)}${vivo ? ` · ${esc(vivo)}` : ''}</b>`;
        estadoSlot.className = `arena-detail-state arena-state-cell is-estado is-${esc(estado.classe)}`;
        estadoSlot.hidden = false;
      }
      // A LINHA DE NÚMEROS DO CABEÇALHO (referência LA-06). São as contagens que
      // o professor lê em voz alta para a turma — quem está dentro, quantos estão
      // conectados, em que rodada a aula está e quantos já entregaram. O estado
      // técnico mora no selo ao lado do título; aqui fica só número com o nome do
      // dado, que é o que a referência escreve ("28 participantes · 24 conectados
      // · Rodada 1 de 3"). O chip do tempo é o único controle da linha: ele ajusta
      // a duração sugerida das missões antes de a sala abrir.
      // A LINHA DE NÚMEROS DA REFERÊNCIA ("3 participantes · 3 conectados ·
      // Rodada 1 de 4") e a AÇÃO DA VEZ fechando a linha. A ação é a MESMA frase
      // do botão que a executa, escrita uma vez só em `acaoDaVez` — uma pílula
      // que prometesse "Encerrar rodada" em cima de um botão escrito "Fechar
      // resultados" é o defeito que o portão do painel existe para pegar. Sem
      // rótulo (a ação é esperar) a pílula não nasce: uma célula vazia no lugar
      // de uma frase é pior que nenhuma célula.
      // A LINHA DE NÚMEROS CARREGA DADO, E SÓ.
      //
      // Ela já carregou também a pílula da vez (221 px) e o chip do tempo
      // (177 px) — dois controles numa fila de quatro números. Medido em oito
      // larguras, era isso que a faixa fazia: em 1920 cabia tudo numa linha; em
      // 1280 o chip caía sozinho na segunda, deixando um vão à direita dele; em
      // 1024 a linha virava quatro. Cada controle foi para o lugar onde a
      // decisão acontece — a ação da vez ao lado do título, o tempo ao lado da
      // configuração da partida — e a linha ficou com o que o professor lê em
      // voz alta.
      const faixaSlot = $('[data-arena-numbers]');
      if (faixaSlot) {
        faixaSlot.innerHTML = `
            <span class="arena-state-cell is-alunos"><b>${activeCount}</b> ${activeCount === 1 ? 'participante' : 'participantes'}</span>
            <span class="arena-state-cell is-conectados"><b>${connectedCount}</b> ${connectedCount === 1 ? 'conectado' : 'conectados'}</span>
            ${rodadaNoAr
              ? `<span class="arena-state-cell is-rodada"><b>Rodada ${Number(rodadaNoAr.position)}</b> de ${rounds.length}</span>`
              : (rounds.length ? `<span class="arena-state-cell is-rodada"><b>${rounds.length}</b> ${rounds.length === 1 ? 'missão' : 'missões'}</span>` : '')}
            ${rodadaNoAr ? `<span class="arena-state-cell is-envios"><b>${Number(rodadaNoAr.submitted || 0)}</b> ${Number(rodadaNoAr.submitted || 0) === 1 ? 'envio' : 'envios'}</span>` : ''}
            ${semNota ? `<span class="arena-state-cell is-avaliacoes is-pendente"><b>${semNota}</b> sem nota</span>` : ''}`;
      }
      // A AÇÃO DA VEZ, no lugar fixo ao lado do título. A frase é a MESMA do
      // botão que a executa, escrita uma vez só em `acaoDaVez`. Sem rótulo (a
      // ação é esperar) o slot fica vazio e escondido: uma pílula apontando para
      // nada é pior que pílula nenhuma.
      const proximaSlot = $('[data-arena-proxima]');
      if (proximaSlot) {
        proximaSlot.innerHTML = acao.rotulo
          ? `<span class="arena-state-cell is-proxima"><small>Próxima ação</small><b>${esc(acao.rotulo)}</b></span>`
          : '';
        proximaSlot.hidden = !acao.rotulo;
      }
      // A COLUNA DO CÓDIGO (referência LA-06): o PIN grande com o selo do acesso,
      // as duas cópias, o QR da entrada e a porta da projeção. É a primeira
      // coluna do cartão, e a gestão da sala fecha embaixo dela — as três ações
      // de ciclo de vida ficam juntas, longe dos comandos da aula.
      const ofereceAcesso = ['waiting', 'open', 'playing', 'ended'].includes(room.status);
      const acessoDaSala = `
            <span class="arena-code-label">Código de acesso da sala</span>
            <div class="arena-code-line">
              <p class="arena-detail-pin"><strong>${esc(formatPin(room.pin || room.code))}</strong></p>
              <span class="arena-access-state ${estadoDoAcesso.classe}">${estadoDoAcesso.rotulo}</span>
            </div>
            <p class="arena-code-note">Compartilhe com os alunos para entrarem na sala.</p>
            <div class="arena-code-copy">
              <button type="button" class="arena-copy-code" data-action="copy-code" data-code="${esc(room.pin || room.code)}">Copiar código</button>
              <button type="button" class="arena-copy-link" data-action="copy-link" data-link="${window.location.origin}/play?pin=${encodeURIComponent(room.pin || room.code)}">Copiar link</button>
            </div>
            <div class="arena-qr-entry" data-qr-entry hidden>
              <img class="arena-qr-entry-img" alt="QR code — abre a tela de entrada dos alunos no celular">
              <div class="arena-qr-entry-text">
                <small>Acesso rápido</small>
                <span class="arena-qr-entry-url" data-qr-entry-url></span>
              </div>
            </div>
            <button type="button" class="arena-hero-action arena-tv-open arena-projection" data-action="open-tv">Abrir tela de projeção →</button>`;
      const gerirDaSala = `
            <div class="arena-room-management" aria-label="Gerenciar sala">
              <button type="button" data-action="room-edit">Editar</button>
              <button type="button" data-action="room-block"${room.status === 'ended' ? ' disabled title="A entrada já está encerrada"' : ''}>${room.entry_blocked ? 'Liberar' : 'Bloquear'}</button>
              <button type="button" class="is-danger" data-action="delete"${['draft', 'waiting', 'archived'].includes(room.status) ? '' : ' disabled title="Encerre e arquive a sala antes de excluir"'}>Excluir</button>
            </div>`;
      const slotAcesso = $('[data-arena-hero-access]');
      if (slotAcesso) {
        // A sala em RASCUNHO ainda não tem PIN: ela mostra só a gestão, porque um
        // número para digitar que não abre nada é a promessa vazia que o selo do
        // acesso existe para não fazer.
        slotAcesso.innerHTML = ofereceAcesso ? `${acessoDaSala}${gerirDaSala}` : gerirDaSala;
        slotAcesso.hidden = false;
      }
      // O PAINEL DA PARTIDA (referência LA-06, coluna da direita): o preset e os
      // lugares numa linha, o palco da rodada com a ação da vez, os três
      // indicadores e a frase que diz o próximo passo. O relógio do palco exporta
      // o mesmo `data-round-countdown` que o contador do cliente procura — só
      // mudou de casa, para o lado da decisão.
      const leitura = leituraDaPartida({ room, detail, rodadaNoAr, rodadaPausada, activeCount, rosterTotal, exigeSalaCheia });
      const relogioDoPalco = rodadaPausada
        ? 'cronômetro pausado'
        : (rodadaNoAr && rodadaNoAr.status === 'open'
          ? (rodadaNoAr.deadline_at
            ? `<b data-round-countdown="${Number(rodadaNoAr.deadline_at)}"></b> restantes`
            : 'sem cronômetro')
          : (rodadaNoAr ? esc(STATUS_LABELS[rodadaNoAr.status] || rodadaNoAr.status) : ''));
      const metaDoPalco = rodadaNoAr
        ? `Missão ativa · ${esc(MODALITY_LABELS[rodadaNoAr.modality] || rodadaNoAr.modality)}${relogioDoPalco ? ` · ${relogioDoPalco}` : ''}`
        : '';
      const vagas = Number(room.expected_players || room.settings?.maxPlayers || rosterTotal) || rosterTotal;
      const livres = Math.max(0, vagas - activeCount);
      const slotMatch = $('[data-arena-detail-match]');
      if (slotMatch) {
        slotMatch.innerHTML = `
        <header class="arena-match-head">
          <span class="arena-match-preset">${esc(PRESET_LABELS[room.preset] || room.preset || 'Sala')}</span>
          <span class="arena-match-places">${activeCount} ${activeCount === 1 ? 'lugar usado' : 'lugares usados'} · ${livres} ${livres === 1 ? 'disponível' : 'disponíveis'}</span>
          ${room.status === 'ended' && canStartNewBattle(room, detail)
            ? `<button type="button" class="arena-match-replay" data-action="new-battle">↻ ${esc(ROTULOS_DA_BATALHA.newBattle)}</button>` : ''}
        </header>
        <article class="arena-match-stage${rodadaNoAr ? ' is-live' : ''}${rodadaPausada ? ' is-pausada' : ''}">
          <div class="arena-match-text">
            <p class="arena-match-kicker">${esc(leitura.selo)}</p>
            <h2 class="arena-match-title">${esc(leitura.titulo)}</h2>
            ${metaDoPalco ? `<p class="arena-match-meta">${metaDoPalco}</p>` : ''}
          </div>
          ${primario}
        </article>
        ${indicadoresDaPartida({ connectedCount, activeCount, rosterTotal, rounds, rodadaNoAr, rodadaPausada, exigeSalaCheia, arena })}
        <footer class="arena-match-foot">
          <span class="arena-match-note">${esc(leitura.nota)}</span>
          <!-- O TEMPO DAS MISSÕES É CONFIGURAÇÃO, e fica ao lado do que configura
               a partida. Ele já foi um chip solto no fim da linha de números, no
               meio de dados que o professor só lê — ninguém procura "ajustar o
               tempo" embaixo de "0 envios" —, e era ele (177 px) que empurrava a
               linha de números para uma segunda fileira em 1280 px. -->
          <div class="arena-match-setup">
            ${rounds.length ? `<button type="button" class="arena-timing-chip" data-action="room-timing" data-room-timing title="Quanto tempo cada missão leva: aceite as sugestões ou ajuste antes de abrir a sala.">⏱ ${esc(timingSummary(detail.timing))}<span class="arena-timing-chip-edit">ajustar</span></button>` : ''}
            <button type="button" class="arena-match-config" data-action="room-edit">⚙ Configuração da partida</button>
          </div>
        </footer>`;
      }
      // AS PORTAS DA SALA abrem a MESMA sala que está em destaque, e por isso
      // apontam para a prévia do aluno e a projeção DELA (slots escritos por
      // renderTopbarQuick). O que fecha a conta da aula — encerrar a sala e
      // arquivar — fica no fim da linha, onde a referência põe o botão vermelho.
      // OS CONTROLES DA BATALHA ficam à vista, na linha de comando do cabeçalho:
      // pausar, encerrar a rodada e fechar o placar são decisões do meio da aula
      // e não podem custar dois cliques. Eles não tinham casa nenhuma — a lista
      // existia no cliente e ninguém a escrevia na tela, e era essa a razão de a
      // sala em jogo aparecer sem um botão para encerrar a rodada. O que já é o
      // botão do palco sai daqui: dois controles para a mesma ação foi como esta
      // linha virou uma lista de sete botões com o mesmo peso.
      const slotBatalha = $('[data-arena-hero-actions]');
      if (slotBatalha) {
        slotBatalha.innerHTML = secundarias.map((entrada) => entrada.html).join('');
        slotBatalha.hidden = secundarias.length === 0;
      }
      const slotDanger = $('[data-arena-room-danger]');
      if (slotDanger) {
        slotDanger.hidden = !['playing', 'ended'].includes(room.status);
        slotDanger.innerHTML = [
          room.status === 'playing' ? '<button type="button" class="is-danger" data-action="end-room">Encerrar sala</button>' : '',
          room.status === 'ended' ? '<button type="button" data-action="archive">Arquivar</button>' : '',
        ].join('');
      }

      // A LISTA DE ALUNOS, linha por linha, com o selo da missão e a chave do
      // filtro. A referência clara põe três filtros sobre a lista (enviados,
      // respondendo, precisando de atenção), e no meio da aula é isso que o
      // professor usa: com trinta alunos, "quem ainda não entregou" é a
      // pergunta, e rolar a tabela procurando o selo é o trabalho que o filtro
      // tira.
      //
      // O filtro é do CLIENTE — nenhuma rota, nenhuma releitura: ele lê o MESMO
      // estado que a linha já escreve (`data-aluno-estado`, a classe do selo da
      // missão) e as contagens saem das próprias linhas. O que ele guarda
      // (`state.filtroDeAlunos`) sobrevive ao redesenho de cada poll, como a
      // escolha das dobras.
      const filtroDoAluno = (classe) => {
        if (['is-enviou', 'is-avaliado', 'is-avaliando'].includes(classe)) return 'enviados';
        if (classe === 'is-escrevendo') return 'respondendo';
        if (['is-desconectado', 'is-removido', 'is-sem-nota'].includes(classe)) return 'atencao';
        return '';
      };
      const contagemDeFiltro = { todos: detail.participants.length, enviados: 0, respondendo: 0, atencao: 0 };
      const linhasDeAluno = detail.participants.map((participant) => {
        const aluno = estadoDoAluno(participant, {
          emMissao: Boolean(rodadaNoAr),
          emAberto: Boolean(current),
          enviaram: openSubmitters,
          aguardando: aguardandoJuiz,
          nota: notaDaRodada,
        });
        const estadoDaCelula = aluno.missao ? aluno.missao.classe : aluno.classe;
        const chaveDoFiltro = filtroDoAluno(estadoDaCelula);
        if (chaveDoFiltro) contagemDeFiltro[chaveDoFiltro] += 1;
        return `
                <tr class="${aluno.classe}" data-aluno-estado="${esc(estadoDaCelula)}">
                  <td data-label="Aluno"><span class="arena-student-name"><span class="arena-student-avatar" aria-hidden="true">${esc(iniciaisDoNome(participant.name))}</span><strong>${esc(participant.name)}</strong></span></td>
                  <td data-label="Estado"><span class="arena-student-state ${aluno.classe}"><i aria-hidden="true"></i>${aluno.rotulo}</span></td>
                  ${rodadaNoAr ? `<td data-label="Missao">${aluno.missao ? `<span class="arena-student-mission ${aluno.missao.classe}"><span aria-hidden="true">${aluno.missao.icone}</span>${aluno.missao.rotulo}</span>` : ''}</td>` : ''}
                  <td class="arena-student-clock" data-label="Entrou">${new Date(Number(participant.joined_at) * 1000).toLocaleTimeString('pt-BR')}</td>
                  <td${participant.active ? ' data-label="Acoes"' : ''}>
                    ${participant.active ? `<details class="arena-row-tools">
                      <summary aria-label="Ações de ${esc(participant.name)}">Gerenciar</summary>
                      <div>
                      <button type="button" data-action="rename-participant" data-pid="${esc(participant.id)}">Renomear</button>
                      <button type="button" data-action="remove-participant" data-pid="${esc(participant.id)}" class="is-danger">Remover</button>
                      </div>
                    </details>` : ''}
                  </td>
                </tr>`;
      }).join('');
      // O SELO DO JUIZ acima da lista: a fila de avaliação é a única coisa da
      // aula que o professor não descobre olhando os alunos. Sem fila ele diz
      // que não há fila, em vez de sumir — sumir deixaria a dúvida no lugar da
      // resposta.
      const avaliadosNaRodada = (rodadaNoAr?.ranking || []).length;
      const fraseDoJuiz = semNota
        ? `⏳ ${semNota} na fila do juiz`
        : (avaliadosNaRodada ? `✓ ${avaliadosNaRodada} ${avaliadosNaRodada === 1 ? 'nota' : 'notas'} do juiz` : '');
      // O SELO DO JUIZ NÃO NASCE VAZIO. Sem fila e sem nota avaliada a frase é
      // vazia, e o selo era uma pílula VERDE sem uma letra dentro — medido na
      // sonda do olhar: 24×12 px nas seis larguras. Pior que o vazio era o
      // efeito: a linha dos filtros é `space-between`, e a pílula sem conteúdo
      // ocupava a esquerda e empurrava os quatro filtros para a linha de baixo,
      // deixando um selo mudo acima de uma fileira de botões. Sem frase, sem
      // selo — o `semNota` e o `is-espera` continuam valendo quando há o que
      // dizer, que é o caso em que este selo existe para o professor.
      const FILTROS_DA_LISTA = [
        { chave: 'todos', rotulo: 'Todos' },
        { chave: 'enviados', rotulo: 'Enviados' },
        { chave: 'respondendo', rotulo: 'Respondendo' },
        { chave: 'atencao', rotulo: 'Atenção' },
      ];
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
          <button type="button" class="figma-cta figma-cta-blue arena-fix-all" data-action="fix-all" data-room-id="${esc(room.id)}"${marca('fix-all')}>✎ Preencher ${(detail.blockers || []).length === 1 ? 'esta missão' : `estas ${(detail.blockers || []).length} missões`} de uma vez</button>
        </div>` : ''}

        <!-- O ROTEIRO DE MISSÕES, DEPOIS DO CARTÃO (referência LA-06).
             A ordem é a da referência: primeiro o cartão da sala — código,
             partida e indicadores —, e só então o que ainda vai acontecer. A
             fila já morou na coluna da direita, espremida em 400 px enquanto a
             página inteira tinha o dobro disso livre. -->
        ${roteiroDeMissoes({ room, rounds, rodadaNoAr, canEditRounds })}

        <!-- O PAINEL DA PARTIDA (Modo Arena), entre o roteiro e o sorteio.
             Ele é a MONTAGEM DOS CONTROLES da partida — sortear, próximo,
             reiniciar, Wild Card, ataque dinâmico, poderes e times —, e a
             chamada de arenaPanel existia no último commit (c82359e, na mesma
             posição, antes do drawPanel) e se perdeu na reorganização da sala
             em destaque: o ESTADO da partida mudou para a faixa de indicadores
             (decisão registrada), mas os controles viajaram dentro do mesmo
             template e ficaram sem quem os montasse. Sem esta linha o professor
             não consegue dar o poder da turma nem ver os times, e o portão da
             tela do Modo Arena reprova por isso. arenaPanel já devolve string
             vazia quando a sala não é do Modo Arena. -->
        ${arenaPanel(detail.arena, room)}

        ${drawPanel(detail.draw)}

        <!-- PARTICIPANTES DA ARENA (referência LA-06): o título em caixa alta, a
             contagem, o selo do juiz e a porta da fila de notas na mesma linha;
             abaixo, os filtros e a tabela com nome, estado, missão, entrada e
             ações. É a mesa de acompanhamento da aula, e ela é de largura
             inteira — em duas colunas ela era uma tira com rolagem por dentro. -->
        <section class="arena-people" aria-label="Participantes da arena">
          <header class="arena-section-head">
            <div class="arena-section-title">
              <span class="arena-section-icon" aria-hidden="true">👥</span>
              <h2>Participantes da arena</h2>
              <span class="arena-table-count">${connectedCount} de ${activeCount} conectados</span>
            </div>
            ${fraseDoJuiz ? `<span class="arena-judge-chip${semNota ? ' is-espera' : ''}">${esc(fraseDoJuiz)}</span>` : ''}
            ${(detail.waiting?.items || []).length ? '<a class="arena-people-queue" href="#fila-de-avaliacoes">📥 Fila de avaliações</a>' : ''}
          </header>
          <p class="arena-fold-note">Digitação, envio e nota do juiz, por aluno.</p>
          <div class="arena-students-tools">
            <div class="arena-student-filters" data-student-filters role="group" aria-label="Filtrar participantes">
              ${FILTROS_DA_LISTA.map((filtro) => `<button type="button" data-student-filter="${filtro.chave}"${filtro.chave === 'todos' ? ' class="is-on"' : ''} aria-pressed="${filtro.chave === 'todos'}">${esc(filtro.rotulo)} (${contagemDeFiltro[filtro.chave] || 0})</button>`).join('')}
            </div>
          </div>
          ${highlightRows ? `<p class="arena-detail-highlights">${highlightRows}</p>` : ''}
          <div class="arena-table-wrap">
          <table class="arena-table">
            <thead><tr><th>Nome</th><th>Status</th>${rodadaNoAr ? '<th>Missão atual</th>' : ''}<th>Entrou</th><th>Ações</th></tr></thead>
            <tbody>
              ${linhasDeAluno}
            </tbody>
          </table>
          </div>
        </section>

        <!-- A FILA DE AVALIAÇÕES: quem já enviou e ainda não tem nota. Ela tem
             casa própria, e o link do cartão dos participantes aponta para cá —
             a pergunta ("quem ainda está sem nota?") nasce na lista de alunos. -->
        ${(detail.waiting?.items || []).length ? `<section class="arena-notes" id="fila-de-avaliacoes" aria-label="Fila de avaliações">
          ${blocoDeEspera(detail.waiting, detail.participants)}
        </section>` : ''}

        <!-- A CLASSIFICAÇÃO GERAL GANHA CASA (plano LA-06).
             Ela era um <h3> e uma lista soltos no corpo do detalhe, na largura
             inteira da sala, enquanto todo o resto mora dentro de um cartão. É o
             mesmo dado no mesmo desenho dos outros blocos: quem lê a tela de
             cima para baixo não encontra uma seção sem casa no meio das que
             têm. -->
        <section class="arena-ranking-card" aria-label="Classificação geral">
        <div class="arena-section-head">
        <h2>Classificação geral</h2>
        </div>
        ${(detail.ranking || []).length ? `<ol class="arena-mini-ranking is-evolution">${detail.ranking.map((row) => {
          const evolution = (row.evolution || []).map((entry, index) => {
            const prev = (row.evolution || [])[index - 1];
            const delta = prev ? Math.round(Number(entry.percent) - Number(prev.percent)) : null;
            const deltaLabel = delta === null ? '' : ` <em class="${delta >= 0 ? 'is-positive' : 'is-negative'}">${delta >= 0 ? '+' : ''}${delta}</em>`;
            return `M${entry.position}: ${Math.round(Number(entry.percent))}${deltaLabel}`;
          }).join(' · ');
          return `<li><span>${row.position}º</span><strong>${esc(row.name)}</strong><em>${Number(row.total_points ?? row.points_sum ?? row.avg_percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} pts</em>${evolution ? `<small>${evolution}</small>` : ''}</li>`;
        }).join('')}</ol>` : '<p class="arena-empty">Ainda sem pontuação.</p>'}
        </section>
      `;
      startAdminCountdown(rounds, Number(detail.server_now));
      aplicarDobras();
      // As duas escolhas que o redesenho não pode perder: o filtro da lista de
      // alunos (quem o professor está olhando) e o selo da sincronia (o estado
      // da conexão, que o markup escreve e o evento reescreve).
      aplicarFiltroDeAlunos();
      pintarSeloDeSincronia();
      // QR da tela de entrada dos alunos: escaneia no celular e abre /play
      // (PIN + nome continuam digitados, como no Kahoot). Cache por sala para
      // nao re-gerar a cada poll do detalhe.
      // O QR vive no CABEÇALHO e é escrito uma vez por sala: quem sai da sala de
      // uma aula e olha a de outra não pode ver o QR antigo — código errado é pior
      // que código nenhum. Por isso a sala que não recebe gente ESCONDE o QR, e
      // não só deixa de escrevê-lo.
      // Ele segue a MESMA regra do selo do código (`ofereceAcesso`), e não uma
      // lista própria: na sala encerrada ele ficava escondido ao lado de um
      // "Copiar link do aluno" aceso, e os dois apontam para o MESMO endereço.
      const entrySlotForaDoAr = $('[data-qr-entry]');
      if (entrySlotForaDoAr && !ofereceAcesso) entrySlotForaDoAr.hidden = true;
      if (ofereceAcesso) {
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

    /**
     * A sala já tem uma batalha para repetir?
     *
     * O criterio é o mesmo do servidor: alguma rodada da batalha viva saiu de
     * `pending` (alguém já jogou algo) e a sala não está em rascunho nem
     * arquivada. Sem isso o botão prometeria uma coisa que a ação recusa.
     */
    function canStartNewBattle(room, detail) {
      if (!room || room.status === 'draft' || room.status === 'archived') return false;
      return Number(detail?.battle?.rounds_played || 0) > 0;
    }

    /**
     * O estado da SALA na língua do professor.
     *
     * A coluna do banco tem `waiting`, `open`, `playing`; o professor pergunta
     * outra coisa — "já posso começar?". Enquanto falta gente, a sala que espera
     * é "Aguardando participantes". Quando a condição de início está satisfeita
     * ela vira "Pronta para começar", e a condição é a do PRESET, não um número
     * solto: o Clássico trava o cadastro nos lugares da sala (os três fixos da
     * batalha), e os presets livres aceitam quem entra até o fim da rodada — por
     * isso a sala livre fica pronta com o primeiro aluno, que é exatamente o que
     * o cockpit escreve em prosa ("pode começar quando quiser").
     */
    /**
     * A SALA RECEBE ALGUÉM AGORA? — a pergunta que o selo do código responde.
     *
     * É a mesma regra do servidor (`canJoinRoom`, em src/domain/room-phases.mjs),
     * escrita aqui para a tela poder dizer o estado do código sem uma rota nova, e
     * é a única duplicação desta frente: o professor apertando "Bloquear entrada"
     * precisa ver a resposta no mesmo instante, e o atrasado tentando entrar pelo
     * código precisa encontrar a mesma resposta. O portão de navegador cobra as
     * duas juntas — o selo da tela e o que o servidor faz com o mesmo PIN.
     *
     * As razões de recusa que moram no ESTADO da sala, na ordem em que o servidor
     * as aplica: sala que ainda não abriu ou já encerrou, sala em que o cadastro
     * trava no começo (os três lugares fixos do Clássico) e sala em jogo com todas
     * as missões fechadas.
     *
     * O interruptor do professor (`entry_blocked`) NÃO entra aqui, e é uma decisão:
     * ele é campo da sala, não estado, e quem o lê é o selo, um nível acima — este
     * corpo responde pela condição que o professor não pode adivinhar olhando o
     * status. Repetir a checagem aqui deixava uma linha que nenhuma mutação
     * conseguia reprovar, que é o mesmo que não estar lá.
     */
    function podeEntrar(room, rounds) {
      if (!room) return false;
      if (['draft', 'ended', 'archived'].includes(room.status)) return false;
      if (room.status === 'waiting' || room.status === 'open') return true;
      if (room.status !== 'playing') return false;
      if (room.settings?.rosterLocksAtStart) return false;
      return !(rounds.length > 0 && rounds.every((round) => round.status === 'closed'));
    }

    /**
     * As iniciais do aluno, para a linha de participantes ter um rosto antes do
     * nome — o desenho da referência da sala em destaque (LA-08). Sem nome não
     * há inicial: o `?` é a ausência, dita, e não um espaço em branco no lugar
     * onde o olho procura a letra.
     */
    function iniciaisDoNome(nome) {
      const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
      if (!partes.length) return '?';
      const ultima = partes.length > 1 ? partes[partes.length - 1].slice(0, 1) : '';
      return (partes[0].slice(0, 1) + ultima).toUpperCase();
    }

    /**
     * O ESTADO DE UM ALUNO na linha de participantes, em duas perguntas: ele
     * está conectado? e em que pé está a missão dele?
     *
     * As duas respostas existiam, mas espalhadas em emoji (`🟢 online`,
     * `⏳ escrevendo`) e sem dizer o que mais importa no meio da aula: quem
     * enviou e ainda ESPERA o juiz. `aguardando` é a fila de avaliação do
     * servidor; `nota` é o ranking da rodada no ar. Nenhuma rota nova e nenhum
     * número inventado — as três leituras a tela já fazia.
     */
    function estadoDoAluno(participante, { emMissao, emAberto, enviaram, aguardando, nota }) {
      const chave = String(participante.id);
      const situacao = !participante.active
        ? { classe: 'is-removido', rotulo: 'Removido' }
        : (participante.connected
          ? { classe: 'is-conectado', rotulo: 'Conectado' }
          : { classe: 'is-desconectado', rotulo: 'Desconectado' });
      if (!emMissao || !participante.active) return situacao;
      const comNota = nota.get(chave);
      if (comNota) return { ...situacao, missao: { classe: 'is-avaliado', icone: '★', rotulo: `${Number(comNota.percent)}%` } };
      if (aguardando.has(chave)) return { ...situacao, missao: { classe: 'is-avaliando', icone: '⏳', rotulo: 'Avaliando' } };
      if (!emAberto) return { ...situacao, missao: { classe: 'is-sem-nota', icone: '—', rotulo: 'Sem nota' } };
      return { ...situacao, missao: enviaram.has(chave)
        ? { classe: 'is-enviou', icone: '✓', rotulo: 'Enviou' }
        : { classe: 'is-escrevendo', icone: '✎', rotulo: 'Escrevendo' } };
    }

    function estadoDaSala({ room, exigeSalaCheia, activeCount, rosterTotal, pendentes }) {
      const texto = STATUS_LABELS[room.status] || room.status;
      const esperando = room.status === 'waiting' || room.status === 'open';
      if (!esperando || !pendentes) return { texto, classe: room.status };
      const pronta = exigeSalaCheia
        ? rosterTotal > 0 && activeCount >= rosterTotal
        : activeCount > 0;
      return pronta ? { texto: 'Pronta para começar', classe: 'pronta' } : { texto, classe: room.status };
    }

    /**
     * Os rótulos das ações que CONDUZEM a batalha, em um lugar só.
     *
     * Eles são repetidos de propósito em dois pontos da tela — a faixa de estado
     * diz "a ação é esta" e o botão logo abaixo a executa —, e é aí que a frase
     * costuma divergir: `"Encerrar rodada"` de um lado e `"Encerrar a missão"`
     * do outro deixam o professor procurando na linha de ações um botão com
     * outro nome. Escritos uma vez, os dois pontos não podem divergir, e o porteiro
     * (`test/browser/painel-estado.test.mjs`) cobra que continuem idênticos.
     */
    const ROTULOS_DA_BATALHA = {
      endRound: 'Encerrar rodada',
      closeRound: 'Fechar resultados',
      resumeRound: 'Retomar missão',
      newBattle: 'Nova batalha nesta sala',
    };

    /**
     * A AÇÃO da vez na sala em destaque.
     *
     * O painel tinha o problema de qualquer painel que cresceu: com a missão no
     * ar, pausar, encerrar a rodada, ver a TV, encerrar a sala e começar uma
     * batalha nova apareciam lado a lado, com o mesmo peso, e cabia ao professor
     * descobrir qual delas era a dele naquele minuto. Aqui a decisão passa a
     * existir em UM lugar: o `id` é o `data-action` do botão que executa, e é
     * ele que a faixa de estado aponta e o desenho destaca (`data-proximo`).
     *
     * `id: ''` é resposta legítima e não é erro: com a missão aberta e gente
     * ainda escrevendo, a ação do professor é esperar — não há botão para
     * apertar, e inventar um ("pular", "forçar") seria criar um controle que
     * ninguém pediu. Nesse estado a faixa diz o que está acontecendo e o placar
     * de envios, e é só.
     */
    function acaoDaVez({ room, detail, current, results, pausada, startLabel, faltam, trava }) {
      const pendentes = (detail.rounds || []).some((round) => round.status === 'pending');
      // Sala que ainda espera lugar: a ação existe, mas o BOTÃO dela está
      // desabilitado (o preset Clássico trava o cadastro nos 3 lugares, e o
      // servidor recusa a partida incompleta). Apontar "Iniciar batalha" numa
      // faixa que promete o que o botão não faz é o defeito que esta frente
      // existe para tirar: aqui a faixa cala, e quem diz o que falta são a
      // própria célula de estado (Aguardando participantes) e a contagem
      // (2 de 3), com o botão desabilitado logo abaixo.
      // Sala que não abre não tem próxima ação de aula: tem conserto. O botão que
      // a executa é o da faixa de bloqueios, logo abaixo do cabeçalho.
      if ((detail.blockers || []).length) return { id: 'fix-all', rotulo: 'Corrigir as missões' };
      // A sala em RASCUNHO tem uma ação e uma só, e ela passou a morar aqui
      // quando a lista deixou de ter botões: enquanto "Abrir sala" vivia em cada
      // linha da lista, o rascunho não precisava de ação da vez no destaque — e
      // tirar o botão da lista sem isto deixaria a sala nascer sem porta.
      if (room.status === 'draft') return { id: 'publish', rotulo: 'Abrir sala' };
      if (trava && ['waiting', 'open'].includes(room.status) && pendentes) return { id: '', rotulo: '' };
      if (pausada) return { id: 'resume-round', rotulo: ROTULOS_DA_BATALHA.resumeRound };
      if (current) {
        return faltam > 0
          ? { id: '', rotulo: 'Acompanhar os envios' }
          : { id: 'end-round', rotulo: ROTULOS_DA_BATALHA.endRound };
      }
      if (results) return { id: 'close-round', rotulo: ROTULOS_DA_BATALHA.closeRound };
      if (['waiting', 'open', 'playing'].includes(room.status) && pendentes) {
        return { id: 'start', rotulo: startLabel };
      }
      if (room.status === 'ended' && canStartNewBattle(room, detail)) {
        return { id: 'new-battle', rotulo: ROTULOS_DA_BATALHA.newBattle };
      }
      return { id: '', rotulo: '' };
    }

    /**
     * Diálogo da batalha nova. Diz o que fica (código, missões, ajustes) e o que
     * zera (tentativas e pontuação), e deixa o professor decidir se a turma
     * continua — porque repetir a aula com a MESMA turma e abrir a sala para a
     * PRÓXIMA são as duas coisas que ele faz com esta sala, e esquecer a lista
     * de alunos na segunda custaria 35 cadastros.
     */
    function newBattleDialog(room, detail) {
      const batalha = detail?.battle || {};
      const alunos = (detail?.participants || []).filter((entry) => entry.active).length;
      openDialog(ROTULOS_DA_BATALHA.newBattle, `
        <form class="arena-challenge-form" data-new-battle-form>
          <input type="hidden" name="room_id" value="${esc(room.id)}">
          <input type="hidden" name="cycle" value="${Number(batalha.cycle || 1)}">
          <p>O código <b>${esc(formatPin(room.pin || room.code))}</b> e as missões continuam. As tentativas e a pontuação voltam a zero; esta batalha fica no histórico.</p>
          <label class="text-field"><span>Alunos</span>
            <select name="keep_participants">
              <option value="true" selected>Manter a turma (${alunos} ${alunos === 1 ? 'aluno' : 'alunos'})</option>
              <option value="false">Limpar a lista — a próxima turma entra com o mesmo código</option>
            </select>
          </label>
          <div class="arena-dialog-actions">
            <button class="figma-cta" type="button" data-arena-dialog-close>Cancelar</button>
            <button class="figma-cta figma-cta-gradient" type="submit">Começar nova batalha</button>
          </div>
          <p class="form-message" data-new-battle-message></p>
        </form>`);
    }

    /**
     * A janela do telão, aberta no gesto do clique.
     *
     * `window.open` depois de um `await` é uma aba sem gesto nenhum: o navegador
     * tem toda a razão para bloquear. Então a janela nasce AQUI, vazia, e só
     * recebe o endereço quando a sala estiver de pé no servidor.
     */
    function abrirAbaDoTelao() {
      try {
        return window.open('about:blank', '_blank');
      } catch {
        return null;
      }
    }

    /**
     * O telão da sala que acabou de abrir.
     *
     * Abrir a sala sem o telão deixa a turma olhando para um código de um monitor
     * que ninguém está vendo: o telão é a segunda tela da aula, e ele abre junto.
     * Duas saidas, nesta ordem — a janela já aberta no clique recebe o endereço e,
     * se o navegador bloqueou a janela, o diálogo de projeção (o mesmo do botão
     * "Abrir tela de projeção") mostra o código, o QR e o botão de abrir aqui.
     * Nunca as duas: um telão a mais é uma tela pedindo para ser fechada.
     */
    async function apresentarTelao(roomId, aba) {
      let tv = null;
      try {
        tv = await adminApi('arena_tv_token', { room_id: roomId });
      } catch {
        // Sem token de projeção o telão não tem sessão própria; o convite da sala
        // continua na tela, com o QR da entrada dos alunos.
      }
      if (aba && !aba.closed && tv?.url) {
        aba.location.assign(tv.url);
        return;
      }
      if (aba) aba.close();
      if (tv) showProjectionDialog(tv);
    }

    async function roomAction(action, roomId, extra = {}, { aba = null } = {}) {
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
      // "Abrir sala" é o começo da aula: a sala passa a receber alunos e o telão
      // entra junto (ver `apresentarTelao`).
      if (action === 'publish') await apresentarTelao(roomId, aba);
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
      $('[data-arena-dialog-body]').innerHTML = `<h3 id="arena-dialog-title">${esc(title)}</h3>${bodyHtml}`;
      dialog.setAttribute('aria-labelledby', 'arena-dialog-title');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    function closeDialog() {
      const dialog = $('[data-arena-dialog]');
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    // O bloqueio precisa ser visível e reversível, inclusive quando uma
    // validação interrompe a ação antes de ela chegar ao servidor.
    function busyControl(control, label = 'Aguarde…') {
      if (!control) return () => {};
      const previous = {
        html: control.innerHTML,
        disabled: control.disabled,
        busy: control.getAttribute('aria-busy'),
        ariaDisabled: control.getAttribute('aria-disabled'),
      };
      control.textContent = label;
      if ('disabled' in control) control.disabled = true;
      control.setAttribute('aria-busy', 'true');
      control.setAttribute('aria-disabled', 'true');
      return () => {
        // Um sucesso pode já ter escrito "copiado" no botão.
        if (control.textContent === label) control.innerHTML = previous.html;
        if ('disabled' in control) control.disabled = previous.disabled;
        for (const [name, value] of [['aria-busy', previous.busy], ['aria-disabled', previous.ariaDisabled]]) {
          if (value === null) control.removeAttribute(name);
          else control.setAttribute(name, value);
        }
      };
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
      const rodadaResumo = `${Number(challenge?.duration_seconds) > 0 ? formatSeconds(challenge.duration_seconds) : 'sem cronômetro'} · ${SPEED_LABELS[challenge?.speed_weight || 'none']}`;
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
              <input type="hidden" name="attempts" value="1">
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

    /**
     * Uma acao por vez na lista de salas.
     *
     * O clique duplo no cartao disparava a MESMA acao duas vezes: o segundo
     * pedido chegava depois de o primeiro ja ter mudado a sala e voltava 409
     * ("Conclua a rodada atual e seus resultados antes de iniciar outra") — num
     * alerta que o professor nao pediu, com a sala ja certa na tela. Enquanto o
     * primeiro pedido esta em voo, o clique seguinte nao e uma acao nova: e o
     * mesmo clique chegando de novo.
     */
    let acaoEmVoo = false;
    $('[data-arena-room-list]')?.addEventListener('click', async (event) => {
      const card = event.target.closest('[data-room-id]');
      if (!card) return;
      const roomId = card.dataset.roomId;
      // A lista é um seletor: QUALQUER clique na linha seleciona a sala. A ação
      // específica (quando o alvo é um controle) continua mandando; sem ela, o
      // clique no cartão é o pedido de "mostre esta sala no destaque". Antes,
      // clicar na linha sem acertar um botão não fazia nada — e a linha parecia
      // um botão.
      const action = event.target.dataset.action || 'detail';
      if (acaoEmVoo) return;
      acaoEmVoo = true;
      try {
        if (action === 'detail') {
          state.selectedRoomId = roomId;
          // A lista se redesenha NA HORA, e não no próximo poll: a marca da sala
          // escolhida é a resposta ao clique, e esperar 2,5s por ela faz a linha
          // parecer que não respondeu — que é o defeito desta frente em pequeno.
          renderRooms();
          renderLessons();
          await refreshDetail(roomId);
          const detail = $('[data-arena-detail]');
          if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          await roomAction(action, roomId);
        }
      } catch (error) {
        // Sessao vencida no meio de uma acao: o aviso certo e a faixa (com a
        // entrada de novo), nao um alerta com a frase do servidor.
        if (error.status === 401) return sessaoExpirada(error);
        if (showBlockersDialog(error, roomId)) return;
        alert(error.message);
      } finally {
        acaoEmVoo = false;
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

    // A escuta é do PAINEL INTEIRO, e não só do corpo: a faixa de estado subiu
    // para o cabeçalho (LA-07) e o chip dos tempos, que vive nela, ficou fora do
    // corpo — um controle da sala em destaque que não responde porque mudou de
    // lugar dentro do mesmo painel é o defeito que esta raiz única evita.
    // O filtro da lista de alunos é do CLIENTE: ele não chama o servidor, então
    // não passa pela guarda do `acaoEmVoo` (que existe para o clique duplo não
    // mandar a ação duas vezes).
    $('[data-arena-detail]')?.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-student-filter]');
      if (!chip) return;
      state.filtroDeAlunos = chip.dataset.studentFilter || 'todos';
      aplicarFiltroDeAlunos();
    });

    $('[data-arena-detail]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action], a[data-action="open-tv"]');
      if (!button) return;
      const action = button.dataset.action;
      const roomId = state.selectedRoomId;
      if (!roomId) return;
      if (action === 'open-tv') event.preventDefault();
      // A mesma guarda do cartao da sala: um clique duplo no "Encerrar rodada"
      // mandava a acao duas vezes, e a segunda voltava 409 num alerta que o
      // professor nao pediu. Enquanto a primeira esta em voo, a segunda e o
      // mesmo clique.
      if (acaoEmVoo || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      acaoEmVoo = true;
      const releaseControl = busyControl(button);
      try {
        if (action === 'publish') {
          // A janela do telão nasce no gesto do clique — depois do `await` já é
          // tarde, e é o navegador quem decide que era tarde. O mesmo cuidado que
          // a lista tinha, agora que "Abrir sala" é o botão da ação da vez no
          // cabeçalho de comando.
          await roomAction(action, roomId, {}, { aba: abrirAbaDoTelao() });
        } else if (action === 'room-edit') {
          const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          editRoomDialog(detail.room);
        } else if (action === 'new-battle') {
          const detail = (await adminApi('arena_room_detail', { room_id: roomId })).detail;
          newBattleDialog(detail.room, detail);
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
          await adminApi('arena_mode_draw', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-wildcard-close') {
          await adminApi('arena_mode_wildcard_close', { room_id: roomId });
          await refreshDetail(roomId);
        } else if (action === 'arena-dynamic-open') {
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
        if (error.status === 401) return sessaoExpirada(error);
        if (showBlockersDialog(error, roomId)) return;
        alert(error.message);
      } finally {
        releaseControl();
        acaoEmVoo = false;
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

    // Enter repetido e clique duplo pertencem ao mesmo salvamento.
    const formsInFlight = new WeakSet();
    // Delegacao de formularios dentro do dialog
    $('[data-arena-dialog]')?.addEventListener('submit', async (event) => {
      const form = event.target.closest('form');
      if (!form) return;
      event.preventDefault();
      if (formsInFlight.has(form)) return;
      formsInFlight.add(form);
      const previousBusy = form.getAttribute('aria-busy');
      form.setAttribute('aria-busy', 'true');
      const busyLabel = form.matches('[data-arena-create-room]') ? 'Criando sala…'
        : form.matches('[data-add-round-form]') ? 'Adicionando…'
        : form.matches('[data-new-battle-form]') ? 'Preparando…' : 'Salvando…';
      const releaseControls = $$('button[type="submit"]:not(:disabled), button:not([type]):not(:disabled)', form)
        .map((button) => busyControl(button, busyLabel));
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
        } else if (form.matches('[data-new-battle-form]')) {
          const node = $('[data-new-battle-message]', form);
          submit(node);
          const roomId = form.elements.room_id.value;
          await adminApi('arena_new_battle', {
            room_id: roomId,
            cycle: Number(form.elements.cycle.value || 1),
            keep_participants: form.elements.keep_participants.value === 'true',
          });
          closeDialog();
          // A lista de salas volta ao estado de espera e o detalhe reabre na
          // batalha NOVA — sem depender do proximo poll do painel. Vale tambem
          // para o `already`: se outro clique ja criou o ciclo, o que o
          // professor ve depois da releitura e a verdade (o lobby do ciclo
          // novo), e nao uma promessa.
          await refreshAll();
          state.selectedRoomId = roomId;
          await refreshDetail(roomId);
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
          message(node, '', 'info');
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
      } finally {
        releaseControls.forEach((release) => release());
        if (previousBusy === null) form.removeAttribute('aria-busy');
        else form.setAttribute('aria-busy', previousBusy);
        formsInFlight.delete(form);
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
            <span>Lugares</span>
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
      if (!['f', 'F'].includes(e.key) || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (active?.matches('input, textarea, select, [role="textbox"]') || active?.isContentEditable) return;
      e.preventDefault();
      toggleTvFullscreen();
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
        const position = Number(row.position) || index + 1;
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
      // O telão conta o que a turma pergunta em voz alta: "já pode começar?".
      // "Todos estão prontos" só quando os LUGARES estão preenchidos — a parede
      // não tem como prometer o que só o professor decide (se o preset aceita
      // começar com menos gente, quem sabe disso é o painel, que é onde se clica).
      const lugares = Number(room.expected_players || room.settings?.maxPlayers || 0);
      const todosProntos = waiting && lugares > 0 && Number(room.participants || 0) >= lugares;
      return `
        <div class="arena-tv-lobby">
          <div class="arena-tv-lobby-main">
            <div class="arena-tv-pin">
              <small>CODIGO DA SALA</small>
              <strong>${esc(formatPin(room.pin))}</strong>
            </div>
            <p class="arena-tv-waiting${todosProntos ? ' is-ready' : ''}">
              <span class="arena-tv-pulse" aria-hidden="true"></span>
              ${!waiting ? 'Aguardando a próxima rodada…' : todosProntos ? 'Todos estão prontos — aguardando o professor iniciar…' : 'Aguardando o professor iniciar a batalha…'}
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
            <span class="arena-tv-round-badge">${classic ? `RODADA ${pad(round.position)}/${pad(total)} — ADIVINHE O PROMPT` : `MISSÃO ${pad(round.position)}/${pad(total)}`}</span>
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
      const rows = (final ? tv.ranking : results?.ranking) || [];
      const pending = final && Number(tv.results_pending || 0) > 0;
      const champions = final && !pending ? rows.filter((row, index) => (Number(row.position) || index + 1) === 1) : [];
      const tied = champions.length > 1;
      const closed = room.status === 'ended' || room.status === 'archived';
      // UM título principal por estado. O selo que dizia "CLASSIFICAÇÃO FINAL"
      // acima de "Batalha encerrada!" era a terceira camada dizendo o mesmo que
      // o h1; e a linha de baixo repetia o número da rodada que o próprio h1 já
      // diz, então ela carrega só o nome da missão, que é informação nova.
      const heading = pending ? 'Conferindo resultado' : tied ? 'Temos campeões' : final ? (closed ? 'Batalha encerrada!' : 'Resultado final') : `Resultado da rodada ${results?.position || ''}`;
      const sub = pending ? `${tv.results_pending} ${Number(tv.results_pending) === 1 ? 'avaliação pendente' : 'avaliações pendentes'}` : results?.title && !final ? results.title : '';
      const champion = champions[0] || null;
      const winner = champion ? `
            <div class="arena-tv-champion">
              ${medalImage(1, 'arena-tv-champion-medal')}
              ${winnerAvatar('arena-tv-champion-avatar')}
              <span class="arena-tv-champion-copy">
                <span class="arena-tv-champion-kicker">${tied ? 'Empate no topo' : 'Campeão da batalha'}</span>
                <strong>${champions.map((row) => esc(row.name)).join(' · ')}</strong>
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
          ${pending ? '' : `<ol class="arena-tv-rank-list arena-tv-rank-list-large">${rankingMarkup(rows, classic)}</ol>`}
          ${pending ? '' : arenaTvMarkup(tv)}
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
        trocouDeSala('tv', data.tv?.room?.id ?? null);
        // Revisao mais velha que a que ja esta na parede: descarta (ver
        // `aceitaRevisao`). Uma leitura atrasada nao pode desfazer o placar.
        if (!aceitaRevisao('tv', data.tv?.room)) return;
        tvRoomId = data.tv?.room?.id ?? tvRoomId;
        // Estado equivalente: nao remexe a parede (e nao reinicia o que estiver
        // animando nela) para mostrar exatamente a mesma coisa.
        const key = renderKey(data.tv);
        if (key === tvKey) { setTVConnection(false); return; }
        tvKey = key;
        renderTV(data.tv);
        setTVConnection(false);
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
        // Outros erros: mantem o que esta na tela e tenta de novo no poll — mas
        // NAO em silencio. A parede continua mostrando o ultimo estado valido (e
        // o certo a fazer: apagar seria pior) com um aviso discreto de que a
        // atualizacao caiu, em vez de parecer uma sala parada.
        else setTVConnection(true);
      }
    }

    // Tela da TV sem sessao: formulario de codigo curto (projecao em outro
    // aparelho). Ao validar, o servidor grava o cookie e entregamos a sala.
    function showCodeEntry(message) {
      stopPoll();
      // Sem sessão válida não há sala projetada: a barra de cima não pode
      // continuar anunciando a sala que caiu (era ela que ficava na tela
      // enquanto a parede já pedia o código), e o chip de reconexão não diz mais
      // nada agora que a parede está pedindo a credencial.
      if (roomMeta) roomMeta.hidden = true;
      setTVConnection(false);
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
      // Codigo novo pode ser de OUTRA sala: a parede nao pode manter por um
      // instante o placar da anterior — zera a memoria de revisao, esquece a
      // chave de renderizacao e limpa o palco antes de pintar.
      if (tvRoomId && data.tv?.room?.id && data.tv.room.id !== tvRoomId) {
        revisoes.delete('tv');
        tvKey = '';
        setContent('<div class="arena-tv-spinner" aria-hidden="true"></div>', 'connect');
      }
      tvRoomId = data.tv?.room?.id ?? tvRoomId;
      tvKey = renderKey(data.tv);
      renderTV(data.tv);
      setTVConnection(false);
      connectAndPoll();
    }

    function connectAndPoll() {
      if (sseOff) { sseOff(); sseOff = null; }
      // A conexao e da sala projetada, provada pelo cookie da projecao.
      sseOff = subscribeRoomEvents((acao, evento) => {
        // Aviso de uma versao que a parede ja pintou nao vira consulta.
        if (eventoAvanca('tv', evento)) refresh(true);
      }, eventsQuery(tvRoomId), {
        // Stream de volta: releitura completa (o que passou na queda pode nao
        // ter sido visto pelo poll) e o aviso sai.
        onReconnect: () => { setTVConnection(false); refresh(true); },
        onDrop: () => setTVConnection(true),
      });
      poll = window.setInterval(() => {
        if (!hiddenClock()) return;
        if (!pollDue('tv')) return;
        refresh(false);
      }, 2500);
      refresh(true);
    }

    /**
     * O aviso de conexao da parede.
     *
     * Um chip no canto, e nao uma tela de erro: na TV da sala, o ultimo estado
     * valido (placar, rodada, cronometro) e informacao que ainda serve — o que
     * nao serve e ninguem saber que ela parou de atualizar.
     */
    const tvReconnect = $('[data-tv-reconnect]');
    function setTVConnection(caiu) {
      if (tvReconnect) tvReconnect.hidden = !caiu;
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
