(() => {
  const body = document.body;
  const page = body?.dataset.page;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const PLAYER_AVATAR = 'public/assets/figma/player-avatar.png';

  const state = {
    stationId: Number(body?.dataset.station || 1),
    mode: body?.dataset.mode || 'wait_all',
    roomId: body?.dataset.room || 'main',
    duration: Number(body?.dataset.duration || 150),
    roundResultsDuration: Number(body?.dataset.roundResultsDuration || 10),
    finalResultsDuration: Number(body?.dataset.finalResultsDuration || 30),
    session: null,
    match: null,
    clockDelta: 0,
    timer: null,
    resultCountdown: null,
    heartbeat: null,
    waitPoll: null,
    waitRegistrationPoll: null,
    mainPoll: null,
    wallPoll: null,
    mainClockTimer: null,
    mainClockMode: '',
    mainClockTargetAt: 0,
    mainClockDuration: 0,
    mainClockSyncServerNow: 0,
    mainClockSyncLocalMs: 0,
    mainHoldResultsUntilPlaying: false,
    instantResultTimer: null,
    screenTransitionId: 0,
    mainStageTransitionId: 0,
    submitting: false,
    startingMatch: false,
    timedOut: false,
    knownResetAt: Number(body?.dataset.resetAt || 0),
    resetReloading: false,
    networkVisible: false,
    geminiRetrySchedule: {},
    geminiRetryInFlight: false,
    reportMetrics: null,
  };
  const transitionMs = 420;
  const GEMINI_RETRY_INITIAL_DELAY_MS = 12000;
  const GEMINI_RETRY_COOLDOWN_MS = 20000;
  const MAIN_CLOCK_DRIFT_TOLERANCE_SECONDS = 3;
  const imagePreloads = new Map();
  const FRONTEND_DEBUG_ENABLED = false;
  const DEBUG_GAME_SCREENS = [
    ['start', 'Inicio'],
    ['register', 'Cadastro'],
    ['wait-registration', 'Aguardando'],
    ['manual', 'Regras'],
    ['play', 'Jogo'],
    ['wait-results', 'Resultado'],
    ['score-round', 'Score Rodada'],
    ['score-final', 'Score Final'],
  ];
  const DEBUG_MAIN_STAGES = [
    ['idle', 'Inicio'],
    ['registration', 'Cadastro'],
    ['instructions', 'Regras'],
    ['playing', 'Jogo'],
    ['round-results', 'Ranking Rodada'],
    ['final-results', 'Ranking Final 3 Rodadas'],
  ];
  const TIMEOUT_DOT_POINTS = [
    [44, 4],
    [64, 9],
    [79, 24],
    [84, 44],
    [79, 64],
    [64, 79],
    [44, 84],
    [24, 79],
    [9, 64],
    [4, 44],
    [9, 24],
    [24, 9],
  ];

  function ensureNetworkModal() {
    let modal = $('[data-network-modal]');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'network-modal';
    modal.dataset.networkModal = '';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="network-modal-card" role="alertdialog" aria-live="assertive" aria-label="Internet instavel">
        <strong>Internet instavel</strong>
        <p>Estamos tentando reconectar com o servidor. Aguarde alguns instantes.</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function showNetworkModal() {
    const modal = ensureNetworkModal();
    state.networkVisible = true;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
  }

  function hideNetworkModal() {
    const modal = ensureNetworkModal();
    state.networkVisible = false;
    modal.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!state.networkVisible) modal.hidden = true;
    }, 220);
  }

  function lgpdModal() {
    return $('[data-lgpd-modal]');
  }

  function showLgpdModal() {
    const modal = lgpdModal();
    if (!modal) return;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-visible'));
  }

  function hideLgpdModal() {
    const modal = lgpdModal();
    if (!modal) return;
    modal.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!modal.classList.contains('is-visible')) {
        modal.hidden = true;
      }
    }, 220);
  }

  function isConnectionError(error) {
    return !navigator.onLine
      || error instanceof TypeError
      || error?.networkIssue === true;
  }

  function isTimeoutError(error) {
    return error?.name === 'AbortError' || error?.timedOut === true;
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

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function waitForFonts(timeout = 900) {
    if (!document.fonts?.ready) return Promise.resolve();
    return Promise.race([
      document.fonts.ready.catch(() => undefined),
      delay(timeout),
    ]);
  }

  function handleServerReset(data) {
    const resetAt = Number(data?.reset_at || 0);
    if (!resetAt) return;
    if (resetAt <= state.knownResetAt) return;

    state.knownResetAt = resetAt;
    if (page === 'game') {
      returnGameToIdle();
      return;
    }

    if (state.resetReloading) return;
    state.resetReloading = true;
    if (state.stationId) {
      clearSavedSession();
    }
    window.location.reload();
  }

  function sessionStorageKey() {
    return `prompt_session_${state.stationId}`;
  }

  function loadSavedSession() {
    if (!state.stationId) return null;
    try {
      const raw = localStorage.getItem(sessionStorageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Number(parsed?.id || 0) > 0 ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function saveSession(session) {
    if (!state.stationId || !session) return;
    localStorage.setItem(sessionStorageKey(), JSON.stringify(session));
  }

  function clearSavedSession() {
    if (!state.stationId) return;
    localStorage.removeItem(sessionStorageKey());
  }

  async function showScreen(name) {
    const screens = $$('.screen');
    const active = screens.find((screen) => screen.classList.contains('is-active') && !screen.hidden);
    const target = screens.find((screen) => screen.dataset.screen === name);
    if (!target) return Promise.resolve();

    if (active === target) {
      body.dataset.currentScreen = name;
      screens.forEach((screen) => {
        const isTarget = screen === target;
        screen.hidden = !isTarget;
        screen.classList.toggle('is-active', isTarget);
        screen.classList.remove('is-entering', 'is-leaving');
      });
      return Promise.resolve();
    }

    const transitionId = ++state.screenTransitionId;
    body.dataset.currentScreen = name;

    screens.forEach((screen) => {
      const isTarget = screen === target;
      screen.hidden = !isTarget;
      screen.classList.toggle('is-entering', isTarget);
      screen.classList.remove('is-active', 'is-leaving');
    });

    await waitForFonts();
    await nextFrame();
    if (transitionId !== state.screenTransitionId) return Promise.resolve();

    target.hidden = false;
    target.classList.add('is-active');
    target.classList.remove('is-entering');

    await delay(transitionMs);
    if (transitionId !== state.screenTransitionId) return Promise.resolve();

    screens.forEach((screen) => {
      const isTarget = screen === target;
      screen.hidden = !isTarget;
      screen.classList.toggle('is-active', isTarget);
      screen.classList.remove('is-entering', 'is-leaving');
    });

    return Promise.resolve();
  }

  function preloadImage(src) {
    if (!src) return Promise.resolve();
    if (imagePreloads.has(src)) return imagePreloads.get(src);

    const promise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = resolve;
      image.onerror = resolve;
      image.src = src;
    });
    imagePreloads.set(src, promise);
    return promise;
  }

  async function setImageSourceWhenReady(node, src) {
    if (!node || !src || node.getAttribute('src') === src) return;
    await preloadImage(src);
    node.src = src;
  }

  function setMessage(selector, message, tone = '') {
    const target = $(selector);
    if (!target) return;
    target.classList.remove('is-gemini-waiting');
    target.textContent = message || '';
    target.dataset.tone = tone;
  }

  function setGeminiWaitingMessage(selector, message = 'Aguardando resposta do Gemini') {
    const target = $(selector);
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = 'info';
    target.classList.add('is-gemini-waiting');
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

  function stopGameRuntime() {
    [
      'timer',
      'resultCountdown',
      'heartbeat',
      'waitPoll',
      'waitRegistrationPoll',
      'waitAcceptedPoll',
      'mainPoll',
      'wallPoll',
      'mainClockTimer',
      'instantResultTimer',
    ].forEach((key) => {
      if (!state[key]) return;
      window.clearInterval(state[key]);
      window.clearTimeout(state[key]);
      state[key] = null;
    });
    state.submitting = false;
    state.startingMatch = false;
    state.timedOut = false;
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

  function formatSeconds(total) {
    const safe = Math.max(0, Math.floor(total));
    const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
    const seconds = String(safe % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function formatPercent(value) {
    return Number(value || 0).toFixed(4).replace('.', ',');
  }

  function localNowSeconds() {
    return Math.floor(Date.now() / 1000) - state.clockDelta;
  }

  function ensureTimeoutDots(target) {
    if (!target || target.querySelector('.timeout-dots')) return;

    const dots = document.createElement('span');
    dots.className = 'timeout-dots';
    dots.setAttribute('aria-hidden', 'true');

    TIMEOUT_DOT_POINTS.forEach(([x, y], index) => {
      const dot = document.createElement('span');
      dot.className = 'timeout-dot';
      dot.style.setProperty('--dot-x', `${x}px`);
      dot.style.setProperty('--dot-y', `${y}px`);
      dot.style.setProperty('--dot-delay', `${index * 0.09}s`);
      dots.appendChild(dot);
    });

    target.appendChild(dots);
    target.classList.add('has-timeout-dots');
  }

  function setClockText(clock, value, animated = false) {
    if (!clock) return;

    if (!animated) {
      clock.classList.remove('has-timeout-dots');
      clock.textContent = value;
      return;
    }

    let valueNode = clock.querySelector('[data-clock-value]');
    if (!valueNode) {
      clock.textContent = '';
      valueNode = document.createElement('span');
      valueNode.className = 'timeout-value';
      valueNode.dataset.clockValue = '';
      clock.appendChild(valueNode);
    }

    valueNode.textContent = value;
    ensureTimeoutDots(clock);
  }

  function setRoundLoaderText(value, countdown = false) {
    const loader = $('.round-loader');
    const target = $('[data-final-percent]');
    if (target) target.textContent = value;
    if (target) target.classList.add('timeout-value');
    if (loader) {
      ensureTimeoutDots(loader);
      loader.classList.toggle('is-countdown', countdown);
    }
  }

  function clearResultCountdown() {
    window.clearInterval(state.resultCountdown);
    state.resultCountdown = null;
    $('.round-loader')?.classList.remove('is-countdown');
  }

  function startResultsCountdown(startedAt, serverNow = null, duration = state.roundResultsDuration) {
    clearResultCountdown();

    const safeServerNow = Number(serverNow || Math.floor(Date.now() / 1000));
    const safeStartedAt = Number(startedAt || safeServerNow);
    const targetAt = safeStartedAt + Math.max(1, Number(duration || 0));
    const localStartedAt = Date.now();

    const tick = () => {
      const localElapsed = Math.floor((Date.now() - localStartedAt) / 1000);
      const currentServerNow = safeServerNow + localElapsed;
      const remaining = Math.max(0, targetAt - currentServerNow);
      setRoundLoaderText(String(Math.ceil(remaining)), true);
    };

    tick();
    state.resultCountdown = window.setInterval(tick, 250);
  }

  function startNextRoundCountdown(match, room) {
    const serverNow = Number(match?.server_now || Math.floor(Date.now() / 1000));
    const resultsAt = Number(room?.round?.results_at || match?.scored_at || serverNow);
    startResultsCountdown(resultsAt, serverNow, state.roundResultsDuration);
  }

  function startFinalResultsCountdown(room, serverNow = null) {
    const safeServerNow = Number(serverNow || Math.floor(Date.now() / 1000));
    const finishedAt = Number(room?.game?.finished_at || safeServerNow);
    startResultsCountdown(finishedAt, safeServerNow, state.finalResultsDuration);
  }

  function clearMainClockCountdown() {
    window.clearInterval(state.mainClockTimer);
    state.mainClockTimer = null;
    state.mainClockMode = '';
    state.mainClockTargetAt = 0;
    state.mainClockDuration = 0;
    state.mainClockSyncServerNow = 0;
    state.mainClockSyncLocalMs = 0;
  }

  function syncMainClock(serverNow) {
    state.mainClockSyncServerNow = Number(serverNow || Math.floor(Date.now() / 1000));
    state.mainClockSyncLocalMs = Date.now();
  }

  function predictedMainServerNow() {
    if (!state.mainClockSyncLocalMs) {
      return Math.floor(Date.now() / 1000);
    }
    const elapsed = Math.floor((Date.now() - state.mainClockSyncLocalMs) / 1000);
    return state.mainClockSyncServerNow + elapsed;
  }

  function renderMainClockTick() {
    const clock = $('.tv-clock');
    if (!clock || !state.mainClockTargetAt || !state.mainClockMode) return;
    const remaining = Math.max(0, state.mainClockTargetAt - predictedMainServerNow());
    if (state.mainClockMode === 'results') {
      setClockText(clock, String(Math.ceil(remaining)), true);
      return;
    }
    setClockText(clock, formatSeconds(remaining));
  }

  function startMainClockCountdown(mode, targetAt, serverNow = null, duration = 0) {
    const safeTargetAt = Number(targetAt || 0);
    if (!safeTargetAt) {
      clearMainClockCountdown();
      return;
    }

    const safeServerNow = Number(serverNow || Math.floor(Date.now() / 1000));
    const changedMode = state.mainClockMode !== mode;
    const changedTarget = state.mainClockTargetAt !== safeTargetAt;
    const changedDuration = state.mainClockDuration !== Number(duration || 0);
    const needsStart = !state.mainClockTimer || changedMode || changedTarget || changedDuration;

    state.mainClockMode = mode;
    state.mainClockTargetAt = safeTargetAt;
    state.mainClockDuration = Number(duration || 0);

    if (needsStart) {
      clearMainClockCountdown();
      state.mainClockMode = mode;
      state.mainClockTargetAt = safeTargetAt;
      state.mainClockDuration = Number(duration || 0);
      syncMainClock(safeServerNow);
      renderMainClockTick();
      state.mainClockTimer = window.setInterval(renderMainClockTick, 250);
      return;
    }

    const drift = Math.abs(predictedMainServerNow() - safeServerNow);
    if (drift > MAIN_CLOCK_DRIFT_TOLERANCE_SECONDS) {
      syncMainClock(safeServerNow);
      renderMainClockTick();
    }
  }

  function currentStatus() {
    const screen = body.dataset.currentScreen || 'start';
    if (screen === 'play') return state.submitting ? 'submitting' : 'playing';
    if (screen === 'wait-registration') return 'waiting_registration';
    if (screen === 'wait-results') return 'waiting_results';
    if (screen === 'score') return 'scored';
    if (screen === 'manual') return 'reading';
    if (screen === 'register') return 'registering';
    return 'idle';
  }

  function startHeartbeat() {
    const send = () => {
      api('heartbeat', {
        station_id: state.stationId,
        session_id: state.session?.id || null,
        match_id: state.match?.id || null,
        status: currentStatus(),
        mode: state.mode,
        reset_at: state.knownResetAt || 0,
      }, { retries: 0, timeout: 5000 }).catch(() => {});
    };
    send();
    window.clearInterval(state.heartbeat);
    state.heartbeat = window.setInterval(send, 2500);
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function clearErrors(form) {
    $$('[data-error-for]', form).forEach((node) => {
      node.textContent = '';
    });
    $$('.text-field', form).forEach((field) => field.classList.remove('has-error'));
    $$('[data-lgpd-field]', form).forEach((field) => field.classList.remove('has-error'));
  }

  function showFieldErrors(form, errors) {
    if (!errors || typeof errors !== 'object') return;
    Object.entries(errors).forEach(([key, message]) => {
      const target = $(`[data-error-for="${key}"]`, form);
      const field = target?.closest('.text-field, [data-lgpd-field]');
      if (target) target.textContent = message;
      if (field) field.classList.add('has-error');
    });
  }

  function requireLgpdAcceptance(form) {
    const checkbox = $('input[name="lgpd_accept"]', form);
    const target = $('[data-error-for="lgpd_accept"]', form);
    const field = $('[data-lgpd-field]', form);
    if (!checkbox) return true;
    if (checkbox.checked) {
      if (target) target.textContent = '';
      field?.classList.remove('has-error');
      return true;
    }
    if (target) target.textContent = 'Voce precisa aceitar os termos da LGPD.';
    field?.classList.add('has-error');
    return false;
  }

  function openLgpdTerms(event) {
    event.preventDefault();
    const form = $('#registerForm');
    const checkbox = form ? $('input[name="lgpd_accept"]', form) : null;
    if (checkbox) checkbox.checked = true;
    if (form) requireLgpdAcceptance(form);
    showLgpdModal();
  }

  function updateTimer() {
    if (!state.match) return;
    const remaining = Math.max(0, state.match.deadline_at - localNowSeconds());
    $$('[data-timer]').forEach((timer) => {
      timer.textContent = formatSeconds(remaining);
      timer.classList.toggle('is-danger', remaining <= 15);
    });
    if (remaining <= 0 && !state.timedOut && body.dataset.currentScreen === 'play') {
      state.timedOut = true;
      submitPrompt(true);
    }
  }

  async function setMatch(match) {
    clearResultCountdown();
    state.match = match;
    state.clockDelta = Math.floor(Date.now() / 1000) - Number(match.server_now || Math.floor(Date.now() / 1000));
    state.timedOut = false;

    const imageUrl = match.image_url;
    const image = $('#promptImage');
    const submittedImage = $('[data-submitted-image]');
    await Promise.all([
      setImageSourceWhenReady(image, imageUrl),
      setImageSourceWhenReady(submittedImage, imageUrl),
    ]);

    const playerName = String(match.player_name || state.session?.player_name || '').trim();
    $$('[data-player-name]').forEach((node) => {
      node.textContent = playerName;
      node.classList.toggle('has-sync-error', !playerName);
    });

    const accuracy = $('[data-accuracy]');
    if (accuracy) {
      accuracy.textContent = 'Acerto: aguardando';
    }

    const roundLabel = `${String(match.round_number || 1).padStart(2, '0')}/${String(match.total_rounds || 1).padStart(2, '0')}`;
    $$('[data-attempts]').forEach((node) => {
      node.textContent = roundLabel;
    });
    $('[data-attempt-pill]') && ($('[data-attempt-pill]').textContent = `Rodada ${roundLabel}`);

    window.clearInterval(state.timer);
    state.timer = window.setInterval(updateTimer, 250);
    updateTimer();
  }

  function submittedDurationLabel(match = state.match) {
    if (match?.submitted_at && match?.started_at) {
      return formatSeconds(Math.max(0, Number(match.submitted_at) - Number(match.started_at)));
    }
    if (match?.deadline_at) {
      const elapsed = Math.max(0, Number(match.duration_seconds || state.duration) - Math.max(0, Number(match.deadline_at) - localNowSeconds()));
      return formatSeconds(elapsed);
    }
    return '00:00';
  }

  function pad2(value) {
    return String(Number(value || 0)).padStart(2, '0');
  }

  function roundOrdinal(value) {
    return `${Math.max(1, Number(value || 1))}º`;
  }

  function rankingName(row) {
    return firstAndLastName(row?.player_name || row?.first_name || '');
  }

  function firstAndLastName(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(' ');
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  function rankingPoints(row) {
    return Number(row?.total_points ?? row?.points ?? 0);
  }

  function rankingPercent(row) {
    return Number(row?.avg_percent ?? row?.percent ?? 0);
  }

  function rankingWins(row) {
    return Number(row?.wins ?? row?.wins_count ?? (Number(row?.position || 0) === 1 ? 1 : 0));
  }

  function rankingIconClass(position) {
    if (Number(position) === 1) return 'rank-gold';
    if (Number(position) === 2) return 'rank-silver';
    if (Number(position) === 3) return 'rank-bronze';
    return 'rank-ribbon';
  }

  function rankingIconSrc(position) {
    if (Number(position) === 1) return 'public/assets/figma/trophy-gold.png';
    if (Number(position) === 2) return 'public/assets/figma/trophy-silver.png';
    if (Number(position) === 3) return 'public/assets/figma/trophy-bronze.png';
    return 'public/assets/figma/medal-ribbon.png';
  }

  function rankingCard(row, kind = 'round') {
    const position = Number(row?.position || 0);
    const name = rankingName(row);
    const hasName = Boolean(name);
    const percent = Math.round(rankingPercent(row));
    const points = rankingPoints(row);
    const wins = rankingWins(row);
    const compact = kind === 'final' && position > 1;
    return `
      <article class="round-rank-entry rank-entry-${position || 'unknown'} ${kind === 'final' ? 'final-rank-entry' : 'round-rank-card'} ${compact ? 'is-compact' : ''} ${hasName ? '' : 'has-sync-error'}">
        <div class="rank-place">
          <span class="rank-medal ${rankingIconClass(position)}" aria-hidden="true">
            <img class="rank-medal-img" src="${rankingIconSrc(position)}" alt="" onerror="this.hidden=true">
          </span>
          <strong>${position ? `${position}º Lugar` : 'Sem posição'}</strong>
        </div>
        <div class="rank-player">
          <img class="rank-avatar" src="${PLAYER_AVATAR}" alt="">
          <span>${escapeHtml(hasName ? name : 'Erro de sincronização')}</span>
        </div>
        <div class="rank-metrics">
          <span class="rank-cups"><i aria-hidden="true"><img src="public/assets/figma/trophy-gold.png" alt="" onerror="this.hidden=true"></i>${pad2(wins)}</span>
          <span class="rank-points"><img src="public/assets/figma/star.png" alt="">${points.toLocaleString('pt-BR')}</span>
          <span class="rank-percent">Acerto: ${percent}%</span>
        </div>
      </article>
    `;
  }

  function setScoreConquests(current, total) {
    const target = $('[data-score-conquests]');
    if (!target) return;
    target.textContent = `${pad2(current)}/${pad2(total || 1)}`;
  }

  function renderSubmittedPrompt(prompt, match = state.match) {
    const target = $('[data-submitted-prompt]');
    if (!target) return;
    const playerName = String(match?.player_name || state.session?.player_name || '').trim();
    const safeName = playerName ? `${escapeHtml(playerName)} (Você)` : 'Erro de sincronização';
    target.innerHTML = `
      <div class="submitted-prompt-head">
        <img src="${PLAYER_AVATAR}" alt="">
        <div>
          <strong class="${playerName ? '' : 'has-sync-error'}">${safeName}</strong>
          <span>Finalizou seu Prompt</span>
        </div>
        <time>${escapeHtml(submittedDurationLabel(match))}</time>
      </div>
      <p>${escapeHtml(prompt || 'Resposta enviada. Aguardando o resultado da rodada.')}</p>
    `;
  }

  function fadeText(node, value) {
    if (!node || node.textContent === value) return;
    node.classList.add('is-fading');
    window.setTimeout(() => {
      node.textContent = value;
      node.classList.remove('is-fading');
    }, 150);
  }

  function stationStatusLabel(station) {
    if (station.game_mode === 'instant' && Number(station.total_rounds || 0) > 1 && Number(station.rounds_completed || 0) > 0) {
      const completed = Math.min(Number(station.rounds_completed || 0), Number(station.total_rounds || 0));
      if (completed >= Number(station.total_rounds || 0)) return `${station.total_rounds} rodadas enviadas`;
      return `Rodada ${completed + 1}/${station.total_rounds}`;
    }
    if (station.scored) return 'Pontuado';
    if (station.submitted) return 'Resposta enviada';
    if (station.match_id) return 'Jogando';
    if (station.registered) return 'Cadastro ok';
    if (station.status === 'registering') return 'Cadastrando';
    if (station.online) return 'Idle';
    return 'Aguardando PC';
  }

  function syncedPlayerName(station) {
    return String(station?.player_name || station?.first_name || '').trim();
  }

  function mainRegistrationPlayerName(station, playerIndex) {
    const syncedName = syncedPlayerName(station);
    if (syncedName) return syncedName;
    if (!station.registered) return `Jogador ${playerIndex}`;
    return '';
  }

  function mainRegistrationStatusLabel(station, playerIndex) {
    if ((station.registered || station.first_name) && syncedPlayerName(station)) return `Jogador ${playerIndex} - Conectado`;
    if (station.registered) return 'Cadastro sem nome';
    return 'Aguardando cadastro';
  }

  function mainInstructionsPlayerName(station) {
    return syncedPlayerName(station);
  }

  function mainInstructionsStatusLabel(station) {
    if (!syncedPlayerName(station)) return 'Erro de sincronização';
    if (station.match_id || station.submitted || station.scored) return 'Aceitou as regras';
    return 'Aguardando aceite';
  }

  function renderPlayerGrid(room, target, options = {}) {
    if (!target) return;
    const allStations = room?.stations || [];
    const expectedStations = Math.max(0, Number(room?.expected_stations || allStations.length) || 0);
    const stations = allStations.slice(0, expectedStations || allStations.length);
    const roundKey = String(room?.round?.id || 'none');
    const mode = options.mode || 'default';
    const reset = target.dataset.roundKey !== roundKey
      || target.dataset.mode !== mode
      || target.children.length !== stations.length;

    if (reset) {
      target.dataset.roundKey = roundKey;
      target.dataset.mode = mode;
      target.innerHTML = stations.map((station, index) => {
        const playerIndex = index + 1;
        const isMainRegistration = mode === 'main-registration';
        const isRegistrationWait = mode === 'registration-wait';
        const isMainInstructions = mode === 'main-instructions';
        const usesAvatar = isMainRegistration || isRegistrationWait || isMainInstructions;
        const badge = usesAvatar
          ? '<img class="player-status-avatar" src="public/assets/figma/player-avatar.png" alt="">'
          : `<span>PC ${station.id}</span>`;
        const name = isMainRegistration || isRegistrationWait
          ? mainRegistrationPlayerName(station, playerIndex)
          : isMainInstructions
            ? mainInstructionsPlayerName(station)
          : (station.label || `PC ${station.id}`);
        const status = isMainRegistration || isRegistrationWait
          ? mainRegistrationStatusLabel(station, playerIndex)
          : isMainInstructions
            ? mainInstructionsStatusLabel(station)
          : stationStatusLabel(station);

        return `
        <article class="player-status-card" data-station-card="${station.id}">
          ${badge}
          <strong class="player-status-name">${escapeHtml(name)}</strong>
          <small>${escapeHtml(status)}</small>
        </article>
      `;
      }).join('');
    }

    stations.forEach((station, index) => {
      const card = $(`[data-station-card="${station.id}"]`, target);
      if (!card) return;
      const name = $('.player-status-name', card);
      const detail = $('small', card);
      const playerIndex = index + 1;
      const isMainRegistration = mode === 'main-registration';
      const isRegistrationWait = mode === 'registration-wait';
      const isMainInstructions = mode === 'main-instructions';
      const nextName = isMainRegistration || isRegistrationWait
        ? mainRegistrationPlayerName(station, playerIndex)
        : isMainInstructions
          ? mainInstructionsPlayerName(station)
        : (station.first_name || station.label || `PC ${station.id}`);
      fadeText(name, nextName);
      if (detail) detail.textContent = isMainRegistration || isRegistrationWait
        ? mainRegistrationStatusLabel(station, playerIndex)
        : isMainInstructions
          ? mainInstructionsStatusLabel(station)
        : stationStatusLabel(station);
      card.dataset.playerIndex = String(playerIndex);
      card.classList.toggle('is-registered', Boolean(station.registered || ((isMainRegistration || isRegistrationWait) && station.first_name)));
      card.classList.toggle('has-sync-error', Boolean((isMainInstructions || station.registered) && !syncedPlayerName(station)));
      card.classList.toggle('is-playing', Boolean(station.match_id));
      card.classList.toggle('is-submitted', Boolean(station.submitted));
      card.classList.toggle('is-scored', Boolean(station.scored));
      card.classList.toggle('is-offline', !station.online);
    });
  }

  function renderRoomProgress(room, target) {
    if (!target) return;
    const waitingForGemini = isWaitingForGemini(room);
    const stations = [...(room?.stations || [])].sort((a, b) => {
      if (Boolean(a.submitted) !== Boolean(b.submitted)) return a.submitted ? -1 : 1;
      if (a.submitted && b.submitted) return Number(a.submitted_at || 0) - Number(b.submitted_at || 0);
      return Number(a.id || 0) - Number(b.id || 0);
    });
    target.innerHTML = stations.map((station) => {
      const playerName = syncedPlayerName(station);
      const elapsedSeconds = station.elapsed_seconds ?? (station.submitted_at && station.started_at
        ? Math.max(0, Number(station.submitted_at) - Number(station.started_at))
        : null);
      const hasTime = station.submitted && (elapsedSeconds !== null || station.duration_label);
      const timeLabel = hasTime
        ? (elapsedSeconds !== null ? formatSeconds(elapsedSeconds) : station.duration_label)
        : '';
      const status = playerName
        ? (waitingForGemini && station.submitted && !station.scored
          ? 'Aguardando resposta do Gemini'
          : station.submitted ? 'Finalizou seu Prompt' : station.match_id ? 'Escrevendo o Prompt' : 'Aguardando rodada')
        : 'Erro de sincronizacao';
      return `
      <article class="main-progress-row${playerName ? '' : ' has-sync-error'}${station.submitted ? ' is-submitted' : ''}${waitingForGemini && station.submitted && !station.scored ? ' is-gemini-waiting' : ''}">
        <img class="main-progress-avatar" src="${PLAYER_AVATAR}" alt="">
        <div class="main-progress-copy">
          <strong>${escapeHtml(playerName)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        ${timeLabel ? `<time>${escapeHtml(timeLabel)}</time>` : ''}
      </article>
    `;
    }).join('');
  }

  function isWaitingForGemini(room) {
    return Boolean(room?.all_submitted)
      && !room?.all_scored
      && Number(room?.scored || 0) < Math.max(1, Number(room?.expected_stations || 1));
  }

  function shouldRetryGeminiForStation(station) {
    const matchId = Number(station?.match_id || 0);
    if (!matchId) return false;
    if (!station?.submitted || station?.scored) return false;
    return String(station?.match_status || '').toLowerCase() !== 'scored';
  }

  async function retryPendingGeminiScores(room) {
    if (!room || !isWaitingForGemini(room) || state.geminiRetryInFlight) return;
    const stations = Array.isArray(room.stations) ? room.stations : [];
    const pendingStations = stations
      .filter((station) => shouldRetryGeminiForStation(station))
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const pendingMatchIds = pendingStations.map((station) => String(Number(station.match_id || 0)));

    Object.keys(state.geminiRetrySchedule).forEach((matchId) => {
      if (!pendingMatchIds.includes(matchId)) {
        delete state.geminiRetrySchedule[matchId];
      }
    });

    if (pendingStations.length === 0) return;

    // Spread retries across player screens to avoid all clients hammering the same pending match.
    const stationOffsetBase = Math.max(0, Number(state.stationId || 1) - 1);
    const stationOffset = stationOffsetBase % pendingStations.length;
    const retryOrder = pendingStations
      .slice(stationOffset)
      .concat(pendingStations.slice(0, stationOffset));

    const now = Date.now();
    for (const station of retryOrder) {
      const matchId = Number(station.match_id || 0);
      const key = String(matchId);
      if (!Object.prototype.hasOwnProperty.call(state.geminiRetrySchedule, key)) {
        state.geminiRetrySchedule[key] = now + GEMINI_RETRY_INITIAL_DELAY_MS;
        continue;
      }

      const dueAt = Number(state.geminiRetrySchedule[key] || 0);
      if (now < dueAt) continue;

      state.geminiRetryInFlight = true;
      state.geminiRetrySchedule[key] = now + GEMINI_RETRY_COOLDOWN_MS;
      try {
        const data = await api('retry_score', { match_id: matchId }, { timeout: 95000, retries: 0, showNetworkModal: false });
        if (Number(data?.match?.id || 0) === Number(state.match?.id || 0)) {
          state.match = data.match;
        }
        logClient('gemini_retry_auto', `Retry score disparado para o match ${matchId}`, {
          match_id: matchId,
          status: station.match_status,
          gemini_status: station.gemini_status,
        });
      } catch (error) {
        logClient('gemini_retry_auto_failed', String(error?.message || 'Falha ao disparar retry_score'), { match_id: matchId });
      } finally {
        state.geminiRetryInFlight = false;
      }
      break;
    }
  }

  function renderAvatarStack(room, target, max = 4) {
    if (!target) return;
    const total = Math.max(1, Math.min(max, Number(room?.expected_stations || room?.stations?.length || max)));
    target.innerHTML = Array.from({ length: total }, () => `<img src="${PLAYER_AVATAR}" alt="">`).join('');
  }

  async function canLeaveIdleForRegistration() {
    try {
      const data = await api('room_status', { room_id: state.roomId }, { timeout: 9000, retries: 0 });
      const room = data?.room || {};
      const station = (room.stations || []).find((item) => Number(item.id || 0) === Number(state.stationId || 0));
      const hasSession = Boolean(station?.session_id);
      const lockedPhases = ['ready', 'playing', 'scoring', 'results', 'final_results'];
      if (!hasSession && (lockedPhases.includes(room.phase) || (room.phase === 'registration' && room.all_registered))) {
        toast('Esta rodada ja foi travada para os jogadores ativos. Aguarde o proximo ciclo para entrar.');
        return false;
      }
      return true;
    } catch (error) {
      toast(isConnectionError(error)
        ? 'Conexao instavel. Nao foi possivel validar a sala agora.'
        : 'Nao foi possivel validar a sala agora.');
      return false;
    }
  }

  async function waitForRegistrations() {
    window.clearInterval(state.waitRegistrationPoll);
    const poll = async () => {
      try {
        const data = await api('room_status', { room_id: state.roomId }, { timeout: 10000, retries: 0 });
        const room = data.room;
        renderPlayerGrid(room, $('[data-wait-players]'), { mode: 'registration-wait' });

        if (room.all_registered) {
          setMessage('[data-wait-message]', 'Todos cadastrados. Avancando para as instrucoes...', 'info');
          window.clearInterval(state.waitRegistrationPoll);
          showScreen('manual');
          setMessage('[data-manual-message]', '');
          startHeartbeat();
          return;
        }

        setMessage(
          '[data-wait-message]',
          `Cadastros: ${room.registered}/${room.expected_stations}. A rodada comeca quando todos finalizarem.`,
          'info',
        );
      } catch (error) {
        setMessage(
          '[data-wait-message]',
          isConnectionError(error)
            ? 'Conexao instavel. Tentando sincronizar novamente...'
            : 'Sincronizando sala. Aguarde mais alguns instantes...',
          'info',
        );
      }
    };

    await poll();
    state.waitRegistrationPoll = window.setInterval(poll, 2500);
  }

  async function waitForAcceptedPlayers(matchId, options = {}) {
    const showManualWhileWaiting = options.showManual !== false;
    window.clearInterval(state.waitAcceptedPoll);
    const poll = async () => {
      try {
        const data = await api('match_status', { match_id: matchId }, { timeout: 10000, retries: 0 });
        const room = data.room;
        if (data.match?.id) await setMatch(data.match);

        if (['playing', 'scoring'].includes(room?.phase)) {
          window.clearInterval(state.waitAcceptedPoll);
          showScreen('play');
          setMessage('[data-manual-message]', '');
          startHeartbeat();
          return;
        }

        if (showManualWhileWaiting) {
          setMessage(
            '[data-manual-message]',
            `Aguardando aceite: ${room?.playing_stations || 0}/${Math.max(1, room?.expected_stations || 1)} jogadores prontos.`,
            'info',
          );
          showScreen('manual');
        }
        startHeartbeat();
      } catch (error) {
        if (showManualWhileWaiting) {
          setMessage(
            '[data-manual-message]',
            isConnectionError(error)
              ? 'Conexao instavel. Tentando sincronizar os aceites...'
              : 'Sincronizando os aceites dos jogadores...',
            'info',
          );
        }
      }
    };

    await poll();
    state.waitAcceptedPoll = window.setInterval(poll, 1000);
  }

  async function registerPlayer(event) {
    event.preventDefault();
    if (body.dataset.debugScreen) {
      setMessage('[data-register-message]', 'Modo debug: cadastro nao enviado.', 'info');
      return;
    }
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    clearErrors(form);
    setMessage('[data-register-message]', '');

    const payload = formData(form);
    if (!requireLgpdAcceptance(form)) {
      setMessage('[data-register-message]', 'Aceite os termos da LGPD para continuar.', 'error');
      return;
    }
    state.mode = payload.mode || state.mode;

    setBusy(button, true, 'Validando...');
    try {
      const data = await api('register', payload, { timeout: 12000 });
      state.session = data.session;
      state.mode = data.session?.mode || state.mode;
      saveSession(state.session);
      startHeartbeat();

      showScreen('wait-registration');
      waitForRegistrations();
    } catch (error) {
      if (error.details && typeof error.details === 'object') {
        showFieldErrors(form, error.details);
        setMessage('[data-register-message]', 'Revise os campos destacados para continuar.', 'error');
      } else {
        setMessage('[data-register-message]', error.message, 'error');
      }
    } finally {
      setBusy(button, false);
    }
  }

  async function startMatch(button, auto = false) {
    if (body.dataset.debugScreen) {
      setMessage('[data-manual-message]', 'Modo debug: inicio de rodada bloqueado.', 'info');
      return;
    }
    if (state.startingMatch) return;
    if (!state.session) {
      toast('Faca o cadastro antes de iniciar a rodada.');
      showScreen('register');
      return;
    }

    state.startingMatch = true;
    setMessage('[data-manual-message]', '');
    setBusy(button, true, 'Preparando...');
    try {
      const data = await api('start_match', {
        session_id: state.session.id,
        mode: state.mode,
      }, { timeout: 12000 });
      await setMatch(data.match);
      const input = $('#promptInput');
      if (input) {
        input.value = '';
        input.disabled = false;
        input.style.height = 'auto';
      }
      const submitButton = $('#promptForm button[type="submit"]');
      if (submitButton) submitButton.disabled = false;
      window.clearInterval(state.waitRegistrationPoll);
      window.clearInterval(state.waitAcceptedPoll);
      if (state.mode !== 'instant') {
        const keepRankingVisible = auto && body.dataset.currentScreen === 'score';
        if (!keepRankingVisible) {
          showScreen('manual');
          setMessage('[data-manual-message]', 'Seu aceite foi registrado. Aguardando os outros jogadores...', 'info');
        }
        startHeartbeat();
        waitForAcceptedPlayers(data.match.id, { showManual: !keepRankingVisible });
        return;
      }
      showScreen('play');
      startHeartbeat();
    } catch (error) {
      if (auto) {
        if (state.match) {
          if (state.mode === 'instant') {
            showScreen('wait-results');
            setMessage('[data-result-message]', `Suas ${state.match.total_rounds || 3} rodadas foram enviadas. Aguardando o ranking final.`, 'info');
            waitForRoom(state.match.id);
          } else {
            showScreen('score');
            waitForNextRoundOrFinal(state.match.round_number || 1);
          }
        } else {
          showScreen('wait-registration');
          setMessage('[data-wait-message]', error.message || 'Aguardando todos os PCs.', 'info');
          waitForRegistrations();
        }
      } else {
        setMessage('[data-manual-message]', error.message, 'error');
      }
    } finally {
      state.startingMatch = false;
      setBusy(button, false);
    }
  }

  async function submitPrompt(timeout = false) {
    if (body.dataset.debugScreen) {
      setMessage('[data-play-message]', 'Modo debug: envio bloqueado para validar o layout.', 'info');
      return;
    }
    if (!state.match || state.submitting) return;

    const form = $('#promptForm');
    const input = $('#promptInput');
    const button = $('button[type="submit"]', form);
    const prompt = input.value.trim();

    if (!timeout && prompt.length < 3) {
      setMessage('[data-play-message]', 'Escreva um prompt antes de enviar.', 'error');
      return;
    }

    state.submitting = true;
    setBusy(button, true, timeout ? 'Tempo esgotado...' : 'Aguardando resposta do Gemini...');
    input.disabled = true;

    const immediateSubmittedScreen = state.match?.mode !== 'instant';
    if (immediateSubmittedScreen) {
      const previewMatch = {
        ...state.match,
        user_prompt: prompt,
        submitted_at: localNowSeconds(),
      };
      renderSubmittedPrompt(prompt, previewMatch);
      showScreen('wait-results');
      setMessage('[data-result-message]', timeout
        ? 'Tempo encerrado. Enviando sua resposta...'
        : 'Enviando resposta para validacao do Gemini...',
      'info');
      startHeartbeat();
    }

    if (timeout) {
      setMessage('[data-play-message]', 'Tempo encerrado. Registrando sua resposta.', 'info');
    } else {
      setGeminiWaitingMessage('[data-play-message]');
    }

    const token = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const processingTimer = window.setTimeout(() => {
      setMessage('[data-play-message]', 'Gemini ainda esta calculando o percentual. Pode levar alguns segundos.', 'info');
    }, 12000);

    try {
      const data = await api('submit_prompt', {
        match_id: state.match.id,
        session_id: state.session.id,
        prompt,
        timeout,
        token,
      }, { timeout: 95000, retries: 1, showNetworkModal: true });

      state.match = data.match;
      if (data.match.mode === 'instant') {
        handleInstantScored(data.match);
      } else {
        renderSubmittedPrompt(prompt, data.match);
        setMessage('[data-result-message]', 'Resposta registrada. Aguardando os outros PCs e o Gemini...', 'info');
        waitForRoom(data.match.id);
      }
    } catch (error) {
      if (immediateSubmittedScreen) {
        showScreen('play');
      }
      input.disabled = false;
      const message = isTimeoutError(error)
        ? 'O Gemini demorou mais que o esperado. O envio foi liberado para uma nova tentativa.'
        : `${error.message} O envio foi liberado para uma nova tentativa.`;
      setMessage('[data-play-message]', message, 'error');
      logClient('submit_failed', error.message);
    } finally {
      window.clearTimeout(processingTimer);
      state.submitting = false;
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Enviar Resposta';
        button.classList.remove('is-loading');
      }
    }
  }

  function handleInstantScored(match) {
    const currentRound = Number(match.round_number || 1);
    const totalRounds = Number(match.total_rounds || 1);

    if (currentRound < totalRounds) {
      renderInstantRoundScore(match, () => startMatch(null, true));
      return;
    }

    renderInstantRoundScore(match, () => {
      showScreen('wait-results');
      setMessage('[data-result-message]', `Suas ${totalRounds} rodadas foram enviadas. Aguardando os outros PCs para liberar o ranking final.`, 'info');
      waitForRoom(match.id);
    });
  }

  function waitForRoom(matchId) {
    window.clearInterval(state.waitPoll);
    const poll = async () => {
      try {
        const data = await api('match_status', { match_id: matchId }, { timeout: 10000, retries: 0 });
        const room = data.room;
        const waitingForGemini = isWaitingForGemini(room);
        renderPlayerGrid(room, $('[data-result-players]'), { mode: 'result-wait' });
        if (waitingForGemini) {
          void retryPendingGeminiScores(room);
        }

        if (room?.phase === 'final_results') {
          window.clearInterval(state.waitPoll);
          renderFinalScore(room, data.match?.server_now);
        } else if (data.match?.mode === 'instant') {
          if (waitingForGemini) {
            setGeminiWaitingMessage('[data-result-message]', 'Aguardando resposta do Gemini para liberar o ranking final');
          } else {
            setMessage(
              '[data-result-message]',
              `Aguardando ranking final: ${room.scored}/${Math.max(1, room.expected_stations)} PCs finalizaram as ${data.match.total_rounds || room.game?.total_rounds || 3} rodadas.`,
              'info',
            );
          }
        } else if (room?.phase === 'results' && room?.all_scored) {
          window.clearInterval(state.waitPoll);
          renderRoundScore(data.match, room);
        } else if (waitingForGemini) {
          setGeminiWaitingMessage('[data-result-message]');
        } else {
          setMessage(
            '[data-result-message]',
            `Aguardando resultados: ${room.scored}/${Math.max(1, room.expected_stations)} pontuados.`,
            'info',
          );
        }
      } catch (error) {
        setMessage(
          '[data-result-message]',
          isConnectionError(error)
            ? 'Conexao instavel. Tentando consultar a sala novamente...'
            : 'Resultado ainda processando. Consultando novamente...',
          'info',
        );
      }
    };
    poll();
    state.waitPoll = window.setInterval(poll, 1000);
  }

  function waitForNextRoundOrFinal(roundNumber) {
    window.clearInterval(state.waitPoll);
    const poll = async () => {
      try {
        const data = await api('room_status', { room_id: state.roomId }, { timeout: 10000, retries: 0 });
        const room = data.room;

        if (room.phase === 'final_results') {
          window.clearInterval(state.waitPoll);
          renderFinalScore(room, data.server_now);
          return;
        }

        const nextRound = Number(room.round?.round_number || 0);
        if (['ready', 'playing'].includes(room.phase) && nextRound > Number(roundNumber || 0)) {
          window.clearInterval(state.waitPoll);
          startMatch(null, true);
        }
      } catch (error) {
        if (isConnectionError(error)) showNetworkModal();
      }
    };

    const pollMs = state.roundResultsDuration <= 2 ? 500 : 1000;
    poll();
    state.waitPoll = window.setInterval(poll, pollMs);
  }

  function returnGameToIdle() {
    window.clearInterval(state.timer);
    window.clearInterval(state.waitPoll);
    window.clearInterval(state.waitRegistrationPoll);
    window.clearTimeout(state.instantResultTimer);
    state.instantResultTimer = null;
    clearResultCountdown();

    state.session = null;
    state.match = null;
    state.submitting = false;
    state.startingMatch = false;
    state.timedOut = false;
    state.geminiRetryInFlight = false;
    state.geminiRetrySchedule = {};
    hideNetworkModal();

    clearSavedSession();

    $('#registerForm')?.reset();
    const input = $('#promptInput');
    if (input) {
      input.value = '';
      input.disabled = false;
      input.style.height = 'auto';
    }
    const submitButton = $('#promptForm button[type="submit"]');
    if (submitButton) submitButton.disabled = false;

    setMessage('[data-wait-message]', '');
    setMessage('[data-result-message]', '');
    setMessage('[data-play-message]', '');
    setMessage('[data-manual-message]', '');
    setMessage('[data-register-message]', '');
    delete body.dataset.scoreKind;
    showScreen('start');
    startHeartbeat();
  }

  function waitForFinalIdle() {
    window.clearInterval(state.waitPoll);
    const poll = async () => {
      try {
        const data = await api('room_status', { room_id: state.roomId }, { timeout: 10000, retries: 0 });
        if (data.room?.phase !== 'final_results') {
          returnGameToIdle();
        }
      } catch (error) {
        if (isConnectionError(error)) showNetworkModal();
      }
    };

    const pollMs = state.finalResultsDuration <= 2 ? 500 : 1000;
    poll();
    state.waitPoll = window.setInterval(poll, pollMs);
  }

  function renderRoundScore(match, room) {
    window.clearInterval(state.timer);
    state.match = match;
    body.dataset.scoreKind = 'round';
    const roundNumber = Number(match.round_number || room.round?.round_number || 1);
    const totalRounds = Number(match.total_rounds || room.game?.total_rounds || 1);
    const scoreName = String(match.player_name || state.session?.player_name || '').trim();

    $('[data-score-title]') && ($('[data-score-title]').textContent = `Fim do ${roundOrdinal(roundNumber)} Round!`);
    $('[data-score-name]') && ($('[data-score-name]').textContent = scoreName);
    $('[data-score-points]') && ($('[data-score-points]').textContent = Number(match.points || 0).toLocaleString('pt-BR'));
    setScoreConquests(roundNumber, totalRounds);
    startNextRoundCountdown(match, room);
    $('[data-score-position]') && ($('[data-score-position]').textContent = `Acerto: ${Math.round(Number(match.percent || 0))}%`);
    $('[data-ranking-title]') && ($('[data-ranking-title]').textContent = 'Veja sua pontuação:');
    $('.winner-pane p') && ($('.winner-pane p').textContent = 'A próxima rodada já vai começar, fique ligado!');
    const tie = $('[data-tie-breaker]');
    if (tie) tie.hidden = true;

    renderRoundRanking(room.round_ranking || [], $('[data-ranking-list]'));
    showScreen('score');
    startHeartbeat();
    waitForNextRoundOrFinal(match.round_number || room.round?.round_number || 1);
  }

  function renderInstantRoundScore(match, onDone) {
    window.clearInterval(state.timer);
    window.clearInterval(state.waitPoll);
    window.clearTimeout(state.instantResultTimer);
    clearResultCountdown();
    state.match = match;
    body.dataset.scoreKind = 'round';

    const roundNumber = match.round_number || 1;
    const totalRounds = match.total_rounds || 3;
    const percent = formatPercent(match.percent);
    const scoreName = String(match.player_name || state.session?.player_name || '').trim();
    const rankName = firstAndLastName(match.player_name || match.first_name || '');

    $('[data-score-title]') && ($('[data-score-title]').textContent = `Fim do ${roundOrdinal(roundNumber)} Round!`);
    $('[data-score-name]') && ($('[data-score-name]').textContent = scoreName);
    $('[data-score-points]') && ($('[data-score-points]').textContent = Number(match.points || 0).toLocaleString('pt-BR'));
    setScoreConquests(roundNumber, totalRounds);
    $('[data-score-position]') && ($('[data-score-position]').textContent = `Acerto: ${Math.round(Number(match.percent || 0))}%`);
    $('[data-ranking-title]') && ($('[data-ranking-title]').textContent = 'Seu resultado');
    setRoundLoaderText(percent);

    const tie = $('[data-tie-breaker]');
    if (tie) tie.hidden = true;

    const list = $('[data-ranking-list]');
    if (list) {
      list.innerHTML = `
        <article class="round-rank-entry">
          <strong>${String(roundNumber).padStart(2, '0')}/${String(totalRounds).padStart(2, '0')}</strong>
          <span>${escapeHtml(rankName)}</span>
          <small>${Math.round(Number(match.percent || 0))}%</small>
        </article>
      `;
    }

    showScreen('score');
    startHeartbeat();
    state.instantResultTimer = window.setTimeout(() => {
      state.instantResultTimer = null;
      onDone();
    }, 3500);
  }

  function renderFinalScore(room, serverNow = null) {
    window.clearInterval(state.timer);
    window.clearInterval(state.waitPoll);
    body.dataset.scoreKind = 'final';

    const ranking = room.final_ranking || [];
    const player = ranking.find((row) => Number(row.station_id) === Number(state.stationId));
    const scoreName = String(player?.player_name || state.session?.player_name || '').trim();

    $('[data-score-title]') && ($('[data-score-title]').textContent = 'Parabéns, você deu um show!');
    $('[data-score-name]') && ($('[data-score-name]').textContent = scoreName);
    $('[data-score-points]') && ($('[data-score-points]').textContent = Number(player?.total_points || 0).toLocaleString('pt-BR'));
    setScoreConquests(player?.wins ?? player?.rounds_completed ?? 0, room.game?.total_rounds || 3);
    startFinalResultsCountdown(room, serverNow);
    $('[data-score-position]') && ($('[data-score-position]').textContent = player
      ? `Acerto médio: ${Math.round(Number(player.avg_percent || 0))}%`
      : 'Ranking final exibido na TV.');
    $('[data-ranking-title]') && ($('[data-ranking-title]').textContent = 'Veja o ranking na TV dessa batalha épica.');
    $('.winner-pane p') && ($('.winner-pane p').textContent = 'Veja o ranking na TV dessa batalha épica.');

    const tie = $('[data-tie-breaker]');
    if (tie) {
      tie.hidden = true;
      tie.textContent = room.game?.tie_breaker || 'Criterio de desempate: menor tempo total para responder as rodadas.';
    }

    renderFinalRanking(ranking, $('[data-ranking-list]'));
    showScreen('score');
    startHeartbeat();
    waitForFinalIdle();
  }

  function renderRoundRanking(list, target) {
    if (!target) return;
    if (!list || list.length === 0) {
      target.innerHTML = '<p class="empty-state">Aguardando resultado da rodada.</p>';
      return;
    }

    target.innerHTML = list.map((row) => rankingCard(row, 'round')).join('');
  }

  function renderFinalRanking(list, target) {
    if (!target) return;
    if (!list || list.length === 0) {
      target.innerHTML = '<p class="empty-state">Aguardando ranking final.</p>';
      return;
    }

    target.innerHTML = list.map((row) => rankingCard(row, 'final')).join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function logClient(type, message, data = null) {
    api('client_log', {
      type,
      message,
      data,
      station_id: state.stationId,
      session_id: state.session?.id,
      match_id: state.match?.id,
    }, { retries: 0, timeout: 4000 }).catch(() => {});
  }

  function debugScreenName() {
    if (!FRONTEND_DEBUG_ENABLED) return '';
    const params = new URLSearchParams(window.location.search);
    const screen = params.get('debug_screen') || params.get('screen');
    return screen ? screen.trim().toLowerCase() : '';
  }

  function normalizeDebugGameScreen(screen) {
    if (screen === 'score') return 'score-round';
    if (screen === 'score-results') return 'score-round';
    if (screen === 'final' || screen === 'final-score') return 'score-final';
    return screen;
  }

  function gameDebugEnabled() {
    if (!FRONTEND_DEBUG_ENABLED) return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('debug') || params.has('debug_screen') || params.has('screen');
  }

  function updateGameDebugUrl(screen) {
    const url = new URL(window.location.href);
    url.searchParams.set('debug', '1');
    url.searchParams.set('screen', screen);
    url.searchParams.delete('debug_screen');
    window.history.replaceState(null, '', url);
  }

  function setGameDebugToolbarActive(screen) {
    $$('[data-debug-screen-option]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.debugScreenOption === screen);
    });
  }

  function ensureGameDebugToolbar(screen = '') {
    if (!FRONTEND_DEBUG_ENABLED) return null;
    let toolbar = $('[data-game-debug-toolbar]');
    if (!toolbar) {
      toolbar = document.createElement('nav');
      toolbar.className = 'debug-toolbar';
      toolbar.dataset.gameDebugToolbar = '';
      toolbar.setAttribute('aria-label', 'Debug do game');
      toolbar.innerHTML = `
        <strong>Debug</strong>
        ${DEBUG_GAME_SCREENS.map(([value, label]) => `<button type="button" data-debug-screen-option="${value}">${label}</button>`).join('')}
        <a href="${window.location.pathname}${body.dataset.station ? `?station=${encodeURIComponent(body.dataset.station)}` : ''}">Sair</a>
      `;
      document.body.appendChild(toolbar);
      $$('[data-debug-screen-option]', toolbar).forEach((button) => {
        button.addEventListener('click', () => {
          applyDebugScreen(button.dataset.debugScreenOption);
          updateGameDebugUrl(button.dataset.debugScreenOption);
        });
      });
    }
    setGameDebugToolbarActive(screen);
    return toolbar;
  }

  function debugStageName() {
    if (!FRONTEND_DEBUG_ENABLED) return '';
    const params = new URLSearchParams(window.location.search);
    const stage = params.get('debug_stage') || params.get('stage');
    return stage ? stage.trim().toLowerCase() : '';
  }

  function setScoreKind(kind) {
    if (kind) {
      body.dataset.scoreKind = kind;
      return;
    }
    delete body.dataset.scoreKind;
  }

  function renderDebugRoundScore(room) {
    setScoreKind('round');
    const match = {
      ...state.match,
      player_name: 'Let\u00edcia de Freitas',
      first_name: 'Let\u00edcia',
      round_number: 1,
      total_rounds: 3,
      percent: 60,
      points: 9146,
    };
    state.match = match;
    state.session = {
      ...state.session,
      player_name: match.player_name,
    };

    $('[data-score-title]') && ($('[data-score-title]').textContent = 'Fim do 1º Round!');
    $('[data-score-name]') && ($('[data-score-name]').textContent = match.player_name);
    $('[data-score-points]') && ($('[data-score-points]').textContent = Number(match.points).toLocaleString('pt-BR'));
    $('[data-score-position]') && ($('[data-score-position]').textContent = 'Acerto: 60%');
    $('[data-ranking-title]') && ($('[data-ranking-title]').textContent = 'Veja sua pontua\u00e7\u00e3o:');
    $('.winner-pane p') && ($('.winner-pane p').textContent = 'A pr\u00f3xima rodada j\u00e1 vai come\u00e7ar, fique ligado!');
    setScoreConquests(2, 3);
    setRoundLoaderText('60');
    const tie = $('[data-tie-breaker]');
    if (tie) tie.hidden = true;
    const rankingList = $('[data-ranking-list]');
    if (rankingList) rankingList.innerHTML = '';
    return room;
  }

  function renderDebugFinalScore(room) {
    setScoreKind('final');
    const finalRoom = debugRoom({
      phase: 'final_results',
      game: {
        ...room.game,
        finished_at: localNowSeconds(),
      },
    });
    const player = finalRoom.final_ranking[0];

    state.session = {
      ...state.session,
      player_name: player.player_name,
    };

    $('[data-score-title]') && ($('[data-score-title]').textContent = 'Parab\u00e9ns, voc\u00ea deu um show!');
    $('[data-score-name]') && ($('[data-score-name]').textContent = player.player_name);
    $('[data-score-points]') && ($('[data-score-points]').textContent = Number(player.total_points || 0).toLocaleString('pt-BR'));
    $('[data-score-position]') && ($('[data-score-position]').textContent = `Acerto m\u00e9dio: ${Math.round(Number(player.avg_percent || 0))}%`);
    $('[data-ranking-title]') && ($('[data-ranking-title]').textContent = 'Ranking final das 3 rodadas');
    $('.winner-pane p') && ($('.winner-pane p').textContent = 'Veja o ranking final somado das 3 rodadas.');
    setScoreConquests(player.wins ?? player.rounds_completed ?? 0, finalRoom.game.total_rounds || 3);
    setRoundLoaderText(String(finalRoom.game.total_rounds || 3).padStart(2, '0'));
    const tie = $('[data-tie-breaker]');
    if (tie) {
      tie.hidden = true;
      tie.textContent = finalRoom.game.tie_breaker;
    }
    renderFinalRanking(finalRoom.final_ranking, $('[data-ranking-list]'));
    return finalRoom;
  }

  function stageDebugEnabled() {
    if (!FRONTEND_DEBUG_ENABLED) return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('debug') || params.has('debug_stage') || params.has('stage');
  }

  function updateStageDebugUrl(stage) {
    const url = new URL(window.location.href);
    url.searchParams.set('debug', '1');
    url.searchParams.set('stage', stage);
    url.searchParams.delete('debug_stage');
    window.history.replaceState(null, '', url);
  }

  function setStageDebugToolbarActive(stage) {
    $$('[data-debug-stage-option]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.debugStageOption === stage);
    });
  }

  function ensureStageDebugToolbar(stages, applyStage, stage = '', label = 'Debug') {
    if (!FRONTEND_DEBUG_ENABLED) return null;
    let toolbar = $('[data-stage-debug-toolbar]');
    if (!toolbar) {
      toolbar = document.createElement('nav');
      toolbar.className = 'debug-toolbar';
      toolbar.dataset.stageDebugToolbar = '';
      toolbar.setAttribute('aria-label', label);
      toolbar.innerHTML = `
        <strong>${escapeHtml(label)}</strong>
        ${stages.map(([value, text]) => `<button type="button" data-debug-stage-option="${value}">${text}</button>`).join('')}
        <a href="${window.location.pathname}">Sair</a>
      `;
      document.body.appendChild(toolbar);
      $$('[data-debug-stage-option]', toolbar).forEach((button) => {
        button.addEventListener('click', async () => {
          await applyStage(button.dataset.debugStageOption);
          updateStageDebugUrl(button.dataset.debugStageOption);
        });
      });
    }
    setStageDebugToolbarActive(stage);
    return toolbar;
  }

  function debugRoom(overrides = {}) {
    const now = localNowSeconds();
    const stations = [
      { id: 1, label: 'PC 1', player_name: 'Maria Silva', first_name: 'Maria', status: 'submitted', online: true, registered: true, match_id: 901, submitted: true, scored: true, started_at: now - 96, submitted_at: now - 38, elapsed_seconds: 58, percent: 72.3456 },
      { id: 2, label: 'PC 2', player_name: 'Joao Pereira', first_name: 'Joao', status: 'submitted', online: true, registered: true, match_id: 902, submitted: true, scored: true, started_at: now - 92, submitted_at: now - 40, elapsed_seconds: 52, percent: 68.2 },
      { id: 3, label: 'PC 3', player_name: 'Ana Costa', first_name: 'Ana', status: 'playing', online: true, registered: true, match_id: 903, submitted: false, scored: false, started_at: now - 80, percent: 65.8 },
    ];

    const roundRanking = [
      { position: 1, station_id: 1, player_name: 'Maria Silva', first_name: 'Maria', points: 8123, percent: 72.3456, duration_label: '58s' },
      { position: 2, station_id: 2, player_name: 'Joao Pereira', first_name: 'Joao', points: 7560, percent: 68.2, duration_label: '52s' },
      { position: 3, station_id: 3, player_name: 'Ana Costa', first_name: 'Ana', points: 7105, percent: 65.8, duration_label: '1m 05s' },
    ];

    const finalRanking = [
      { position: 1, station_id: 1, player_name: 'Maria Silva', first_name: 'Maria', wins: 2, rounds_completed: 3, avg_percent: 74.8, total_points: 24120, duration_label: '2m 48s' },
      { position: 2, station_id: 2, player_name: 'Joao Pereira', first_name: 'Joao', wins: 1, rounds_completed: 3, avg_percent: 70.1, total_points: 22890, duration_label: '2m 35s' },
      { position: 3, station_id: 3, player_name: 'Ana Costa', first_name: 'Ana', wins: 0, rounds_completed: 3, avg_percent: 66.4, total_points: 21105, duration_label: '3m 04s' },
    ];

    return {
      phase: 'results',
      server_now: now,
      expected_stations: 3,
      registered: 3,
      playing_stations: 3,
      scored: 3,
      all_registered: true,
      all_scored: true,
      round: {
        id: 900,
        round_number: 1,
        total_rounds: 3,
        started_at: now - 72,
        deadline_at: now + 78,
        results_at: now,
        image_url: 'public/assets/figma/prompt-sample.png',
      },
      game: {
        total_rounds: 3,
        finished_at: now,
        tie_breaker: 'Criterio de desempate: maior pontuacao, depois acerto e menor tempo.',
      },
      stations,
      round_ranking: roundRanking,
      final_ranking: finalRanking,
      ...overrides,
    };
  }

  function applyDebugScreen(screen) {
    if (!FRONTEND_DEBUG_ENABLED) return false;
    screen = normalizeDebugGameScreen(screen);
    const allowedScreens = DEBUG_GAME_SCREENS.map(([value]) => value);
    if (!allowedScreens.includes(screen)) return false;

    stopGameRuntime();
    body.dataset.debugScreen = screen;
    ensureGameDebugToolbar(screen);
    state.session = {
      id: 999,
      player_name: 'Maria Silva',
    };
    state.match = {
      id: 999,
      player_name: 'Maria Silva',
      first_name: 'Maria',
      image_url: 'public/assets/figma/prompt-sample.png',
      round_number: 1,
      total_rounds: 3,
      percent: 72.3456,
      points: 8123,
      submitted_at: localNowSeconds() - 24,
      started_at: localNowSeconds() - 82,
      scored_at: localNowSeconds(),
    };
    setScoreKind('');

    $$('[data-player-name]').forEach((node) => {
      node.textContent = state.session.player_name;
    });
    $$('[data-attempts], [data-attempt-pill]').forEach((node) => {
      node.textContent = '01/03';
    });
    $$('[data-timer]').forEach((node) => {
      node.textContent = '01:42';
    });

    const promptImage = $('#promptImage');
    if (promptImage) promptImage.src = state.match.image_url;
    const submittedImage = $('[data-submitted-image]');
    if (submittedImage) submittedImage.src = state.match.image_url;
    renderSubmittedPrompt('Retrato cinematografico futurista com luz neon, fundo urbano e composicao dramatica.', state.match);

    const room = debugRoom();

    if (screen === 'wait-registration') {
      renderPlayerGrid(room, $('[data-wait-players]'), { mode: 'registration-wait' });
      setMessage('[data-wait-message]', 'Modo debug: aguardando jogadores.', 'info');
    }

    if (screen === 'wait-results') {
      renderPlayerGrid(room, $('[data-result-players]'), { mode: 'result-wait' });
      setMessage('[data-result-message]', 'Modo debug: resultado aguardando liberacao.', 'info');
    }

    if (screen === 'play') {
      const input = $('#promptInput');
      if (input) {
        input.value = 'Retrato cinematografico futurista com luz neon, fundo urbano e composicao dramatica.';
        input.style.height = 'auto';
        input.style.height = `${Math.min(130, input.scrollHeight)}px`;
      }
      $('[data-accuracy]') && ($('[data-accuracy]').textContent = 'Acerto: aguardando');
      setMessage('[data-play-message]', 'Modo debug: tela liberada sem enviar para o backend.', 'info');
    }

    if (screen === 'score-round') {
      renderDebugRoundScore(room);
    }

    if (screen === 'score-final') {
      renderDebugFinalScore(room);
    }

    showScreen(screen.startsWith('score-') ? 'score' : screen);
    toast(`Modo debug: ${screen}`);
    return true;
  }

  async function resumeGameAfterReload() {
    const savedSession = loadSavedSession();
    if (!savedSession) return false;

    state.session = savedSession;
    state.mode = savedSession?.mode || state.mode;

    try {
      const roomData = await api('room_status', { room_id: state.roomId }, { timeout: 10000, retries: 1 });
      const room = roomData?.room || {};
      const station = (room.stations || []).find((item) => Number(item?.id || 0) === Number(state.stationId || 0));
      const activeSessionId = Number(station?.session_id || 0);
      if (!activeSessionId || activeSessionId !== Number(savedSession.id || 0)) {
        state.session = null;
        clearSavedSession();
        return false;
      }

      const stationMatchId = Number(station?.match_id || 0);
      if (stationMatchId > 0) {
        const matchData = await api('match_status', { match_id: stationMatchId }, { timeout: 10000, retries: 1 });
        const resumedRoom = matchData?.room || room;
        const resumedMatch = matchData?.match || null;
        if (!resumedMatch?.id) return false;
        await setMatch(resumedMatch);

        if (resumedRoom?.phase === 'final_results') {
          renderFinalScore(resumedRoom, resumedMatch?.server_now || roomData?.server_now);
          return true;
        }

        if (resumedRoom?.phase === 'results' && resumedRoom?.all_scored && resumedMatch?.id) {
          renderRoundScore(resumedMatch, resumedRoom);
          return true;
        }

        if (resumedMatch?.submitted_at) {
          renderSubmittedPrompt(String(resumedMatch.user_prompt || ''), resumedMatch);
          showScreen('wait-results');
          if (isWaitingForGemini(resumedRoom)) {
            setGeminiWaitingMessage('[data-result-message]');
          } else {
            setMessage(
              '[data-result-message]',
              `Aguardando resultados: ${resumedRoom.scored}/${Math.max(1, resumedRoom.expected_stations)} pontuados.`,
              'info',
            );
          }
          startHeartbeat();
          waitForRoom(stationMatchId);
          return true;
        }

        showScreen('play');
        setMessage('[data-play-message]', 'Partida retomada apos atualizar a pagina.', 'info');
        startHeartbeat();
        return true;
      }

      if (room?.phase === 'registration' && !room?.all_registered) {
        showScreen('wait-registration');
        setMessage(
          '[data-wait-message]',
          `Cadastros: ${room.registered}/${room.expected_stations}. A rodada comeca quando todos finalizarem.`,
          'info',
        );
        startHeartbeat();
        waitForRegistrations();
        return true;
      }

      showScreen('manual');
      setMessage('[data-manual-message]', 'Cadastro recuperado. Pode seguir para a batalha.', 'info');
      startHeartbeat();
      return true;
    } catch (error) {
      logClient('session_restore_failed', String(error?.message || 'Falha ao restaurar sessao apos F5'));
      return false;
    }
  }

  async function initGame() {
    const registerForm = $('#registerForm');

    $$('[data-go]').forEach((button) => {
      button.addEventListener('click', async () => {
        const nextScreen = button.dataset.go;
        if (nextScreen === 'register' && !body.dataset.debugScreen) {
          const allowed = await canLeaveIdleForRegistration();
          if (!allowed) {
            startHeartbeat();
            return;
          }
        }
        showScreen(nextScreen);
        if (!body.dataset.debugScreen) startHeartbeat();
      });
    });

    $$('[data-help]').forEach((button) => {
      button.addEventListener('click', () => toast('Dica: descreva sujeito, ambiente, estilo, camera, luz, cores e detalhes.'));
    });

    registerForm?.addEventListener('submit', registerPlayer);
    $$('[data-lgpd-open]').forEach((button) => {
      button.addEventListener('click', openLgpdTerms);
    });
    $$('[data-lgpd-close]').forEach((button) => {
      button.addEventListener('click', hideLgpdModal);
    });
    $('input[name="lgpd_accept"]', registerForm || document)?.addEventListener('change', () => {
      if (registerForm) requireLgpdAcceptance(registerForm);
    });
    $('#startMatchButton')?.addEventListener('click', (event) => startMatch(event.currentTarget));
    $('#promptForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitPrompt(false);
    });
    $('#promptInput')?.addEventListener('input', (event) => {
      event.currentTarget.style.height = 'auto';
      event.currentTarget.style.height = `${Math.min(130, event.currentTarget.scrollHeight)}px`;
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideLgpdModal();
    });
    window.addEventListener('error', (event) => logClient('js_error', event.message));

    if (gameDebugEnabled()) {
      const screen = normalizeDebugGameScreen(debugScreenName() || 'start');
      if (applyDebugScreen(screen)) {
        updateGameDebugUrl(screen);
        return;
      }
      applyDebugScreen('start');
      updateGameDebugUrl('start');
      return;
    }

    const resumed = await resumeGameAfterReload();
    if (resumed) return;

    showScreen('start');
    startHeartbeat();
  }

  function applyDebugWall(stage) {
    if (!FRONTEND_DEBUG_ENABLED) return false;
    const allowedStages = ['round', 'results', 'final', 'final-results', 'empty'];
    if (!allowedStages.includes(stage)) return false;

    body.dataset.debugStage = stage;
    const target = $('[data-wall-ranking]');
    const title = $('[data-wall-title]');
    const status = $('[data-wall-status]');
    const room = debugRoom(stage === 'final' || stage === 'final-results'
      ? { phase: 'final_results' }
      : { phase: 'results' });

    if (stage === 'empty') {
      if (title) title.textContent = 'Aguardando a Rodada';
      if (target) target.innerHTML = '<p class="empty-state">O ranking aparece quando a rodada terminar.</p>';
      if (status) status.textContent = 'Modo debug: estado vazio do ranking.';
      return true;
    }

    if (stage === 'final' || stage === 'final-results') {
      if (title) title.textContent = 'Ranking Final das 3 Rodadas';
      renderFinalRanking(room.final_ranking, target);
      if (status) status.textContent = room.game.tie_breaker;
      return true;
    }

    if (title) title.textContent = 'Ranking da Rodada 1';
    renderRoundRanking(room.round_ranking, target);
    if (status) status.textContent = 'Modo debug: resultado da rodada atual.';
    return true;
  }

  async function initWall() {
    if (applyDebugWall(debugStageName())) {
      return;
    }

    const target = $('[data-wall-ranking]');
    const title = $('[data-wall-title]');
    const status = $('[data-wall-status]');
    const roomId = body.dataset.room || state.roomId;

    const refresh = async () => {
      try {
        const roomData = await api('room_status', { room_id: roomId }, { timeout: 10000, retries: 1 });
        const room = roomData.room;

        if (room.phase === 'final_results' && room.final_ranking?.length) {
          if (title) title.textContent = 'Ranking Final das 3 Rodadas';
          renderFinalRanking(room.final_ranking, target);
          if (status) status.textContent = room.game?.tie_breaker || 'Criterio de desempate: menor tempo total.';
          return;
        }

        if (room.phase === 'results' && room.round_ranking?.length) {
          if (title) title.textContent = `Ranking da Rodada ${room.round?.round_number || ''}`.trim();
          renderRoundRanking(room.round_ranking, target);
          if (status) status.textContent = `Resultado da rodada atual - ${new Date().toLocaleTimeString('pt-BR')}`;
          return;
        }

        if (title) title.textContent = 'Aguardando a Rodada';
        if (target) target.innerHTML = '<p class="empty-state">O ranking aparece quando a rodada terminar.</p>';
        if (status) status.textContent = `Sincronizado as ${new Date().toLocaleTimeString('pt-BR')}`;
      } catch (error) {
        if (status) {
          status.textContent = isConnectionError(error)
            ? 'Conexao instavel. Tentando atualizar novamente...'
            : 'Atualizacao em processamento. Tentando novamente...';
        }
      }
    };

    await refresh();
    state.wallPoll = window.setInterval(refresh, 1500);
  }

  async function applyDebugMain(stage) {
    if (!FRONTEND_DEBUG_ENABLED) return false;
    stage = stage === 'results' ? 'round-results' : stage;
    stage = stage === 'final' ? 'final-results' : stage;
    const allowedStages = DEBUG_MAIN_STAGES.map(([value]) => value);
    if (!allowedStages.includes(stage)) return false;

    stopGameRuntime();
    body.dataset.debugStage = stage;
    ensureStageDebugToolbar(DEBUG_MAIN_STAGES, applyDebugMain, stage, 'Debug Main');
    let room = debugRoom();
    if (stage === 'idle') {
      room = debugRoom({ phase: 'idle', stations: room.stations.map((station) => ({ ...station, registered: false, match_id: null, submitted: false, scored: false })) });
    } else if (stage === 'registration') {
      room = debugRoom({ phase: 'registration', registered: 2, all_registered: false });
    } else if (stage === 'instructions') {
      room = debugRoom({ phase: 'ready' });
    } else if (stage === 'playing') {
      room = debugRoom({
        phase: 'playing',
        scored: 0,
        all_scored: false,
        stations: room.stations.map((station, index) => ({
          ...station,
          scored: false,
          submitted: index < 2,
          status: index < 2 ? 'submitted' : 'playing',
        })),
      });
    } else if (stage === 'final' || stage === 'final-results') {
      room = debugRoom({ phase: 'final_results' });
    } else {
      room = debugRoom({ phase: 'results' });
    }

    await renderMain(room);
    return true;
  }

  async function setMainStage(name) {
    const stages = $$('[data-main-stage]');
    const active = stages.find((stage) => stage.classList.contains('is-active') && !stage.hidden);
    const target = stages.find((stage) => stage.dataset.mainStage === name);
    if (!target) return Promise.resolve();

    if (active === target) {
      stages.forEach((stage) => {
        const isTarget = stage === target;
        stage.hidden = !isTarget;
        stage.classList.toggle('is-active', isTarget);
        stage.classList.remove('is-entering', 'is-leaving');
      });
      return Promise.resolve();
    }

    const transitionId = ++state.mainStageTransitionId;

    stages.forEach((stage) => {
      const isTarget = stage === target;
      stage.hidden = !isTarget;
      stage.classList.toggle('is-entering', isTarget);
      stage.classList.remove('is-active', 'is-leaving');
    });

    await waitForFonts();
    await nextFrame();
    if (transitionId !== state.mainStageTransitionId) return Promise.resolve();

    target.hidden = false;
    target.classList.add('is-active');
    target.classList.remove('is-entering');

    await delay(transitionMs);
    if (transitionId !== state.mainStageTransitionId) return Promise.resolve();

    stages.forEach((stage) => {
      const isTarget = stage === target;
      stage.hidden = !isTarget;
      stage.classList.toggle('is-active', isTarget);
      stage.classList.remove('is-entering', 'is-leaving');
    });

    return Promise.resolve();
  }

  function renderMainRound(room) {
    const roundLabel = `${String(room?.round?.round_number || 1).padStart(2, '0')}/${String(room?.round?.total_rounds || room?.game?.total_rounds || 1).padStart(2, '0')}`;
    $$('[data-main-round]').forEach((node) => {
      node.textContent = roundLabel;
    });
  }

  function updateMainClock(room) {
    const startedAt = Number(room?.round?.started_at || 0);
    const deadlineAt = Number(room?.round?.deadline_at || (startedAt ? startedAt + state.duration : 0));
    const serverNow = Number(room?.server_now || Math.floor(Date.now() / 1000));
    if (!deadlineAt) {
      clearMainClockCountdown();
      return;
    }
    startMainClockCountdown('playing', deadlineAt, serverNow);
  }

  function updateMainResultsClock(room) {
    const serverNow = Number(room?.server_now || Math.floor(Date.now() / 1000));
    const isFinalPhase = String(room?.phase || '') === 'final_results';
    const resultsDuration = isFinalPhase
      ? state.finalResultsDuration
      : state.roundResultsDuration;
    const resultStartedAt = isFinalPhase
      ? Number(room?.game?.finished_at || room?.round?.results_at || 0)
      : Number(room?.round?.results_at || room?.game?.finished_at || 0);
    const fallbackTargetAt = (state.mainClockMode === 'results' && state.mainClockTargetAt > 0)
      ? state.mainClockTargetAt
      : (serverNow + Math.max(1, resultsDuration));
    const targetAt = resultStartedAt > 0
      ? (resultStartedAt + Math.max(1, resultsDuration))
      : fallbackTargetAt;
    startMainClockCountdown('results', targetAt, serverNow, resultsDuration);
  }

  async function renderMain(room) {
    const phase = room?.phase || 'idle';
    const playingPhases = ['playing', 'scoring'];

    renderPlayerGrid(room, $('[data-main-idle-players]'), { mode: 'main-idle' });
    renderPlayerGrid(room, $('[data-main-registration-players]'), { mode: 'main-registration' });
    renderPlayerGrid(room, $('[data-main-instructions-players]'), { mode: 'main-instructions' });

    if (phase === 'final_results' && room.final_ranking?.length) {
      state.mainHoldResultsUntilPlaying = false;
      body.dataset.tvStage = 'final-results';
      $('[data-main-results-eyebrow]') && ($('[data-main-results-eyebrow]').textContent = 'Ranking final');
      $('[data-main-results-title]') && ($('[data-main-results-title]').textContent = 'Veja o grande vencedor dessa Batalha!');
      const note = $('[data-main-tie-breaker]');
      if (note) note.hidden = true;
      updateMainResultsClock(room);
      renderFinalRanking(room.final_ranking, $('[data-main-round-ranking]'));
      setMainStage('results');
      return;
    }

    if (phase === 'results' && room.round_ranking?.length) {
      state.mainHoldResultsUntilPlaying = true;
      body.dataset.tvStage = 'round-results';
      $('[data-main-results-eyebrow]') && ($('[data-main-results-eyebrow]').textContent = `Ranking da rodada ${room.round?.round_number || ''}`.trim());
      const note = $('[data-main-tie-breaker]');
      if (note) note.hidden = true;
      $('[data-main-results-title]') && ($('[data-main-results-title]').textContent = `Veja o Ranking do ${roundOrdinal(room.round?.round_number || 1)} Round!`);
      updateMainResultsClock(room);
      renderRoundRanking(room.round_ranking, $('[data-main-round-ranking]'));
      setMainStage('results');
      return;
    }

    if (phase === 'ready') {
      if (state.mainHoldResultsUntilPlaying && body.dataset.tvStage === 'round-results') {
        return;
      }
      body.dataset.tvStage = 'instructions';
      setMainStage('instructions');
      return;
    }

    if (playingPhases.includes(phase)) {
      state.mainHoldResultsUntilPlaying = false;
      body.dataset.tvStage = 'playing';
      const image = $('[data-main-image]');
      if (image && room.round?.image_url) {
        await setImageSourceWhenReady(image, room.round.image_url);
      }
      renderMainRound(room);
      updateMainClock(room);
      renderAvatarStack(room, $('[data-main-avatar-stack]'));
      renderRoomProgress(room, $('[data-main-progress]'));
      setMainStage('playing');
      return;
    }

    if (phase === 'registration') {
      state.mainHoldResultsUntilPlaying = false;
      clearMainClockCountdown();
      body.dataset.tvStage = 'registration';
      setMainStage('registration');
      return;
    }

    state.mainHoldResultsUntilPlaying = false;
    clearMainClockCountdown();
    body.dataset.tvStage = 'idle';
    setMainStage('idle');
  }

  async function initMain() {
    if (stageDebugEnabled()) {
      let stage = debugStageName() || 'idle';
      stage = stage === 'results' ? 'round-results' : stage;
      stage = stage === 'final' ? 'final-results' : stage;
      if (await applyDebugMain(stage)) {
        updateStageDebugUrl(stage);
        return;
      }
      await applyDebugMain('idle');
      updateStageDebugUrl('idle');
      return;
    }

    const roomId = body.dataset.room || state.roomId;
    const refresh = async () => {
      try {
        const data = await api('room_status', { room_id: roomId }, { timeout: 10000, retries: 1 });
        if (data.room) data.room.server_now = data.server_now;
        await renderMain(data.room);
      } catch (error) {
        if (isConnectionError(error)) showNetworkModal();
      }
    };

    await refresh();
    state.mainPoll = window.setInterval(refresh, 1500);
  }

  function metricCard(label, value, hint = '') {
    return `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
  }

  async function initReport() {
    const form = $('[data-report-filters]');
    const printButton = $('[data-print-report]');
    const exportButton = $('[data-export-report]');
    const getPayload = () => ({
      start_date: form?.elements?.start_date?.value || body.dataset.reportStart || '2026-08-26',
      end_date: form?.elements?.end_date?.value || body.dataset.reportEnd || '2026-08-30',
    });

    const load = async () => {
      const data = await api('metrics', getPayload(), { timeout: 16000, retries: 1 });
      state.reportMetrics = data.metrics || {};
      renderFullReport(state.reportMetrics);
    };

    printButton?.addEventListener('click', () => window.print());
    exportButton?.addEventListener('click', () => {
      try {
        exportReportCsv();
      } catch (error) {
        toast(error?.message || 'Nao foi possivel exportar o CSV.');
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

    load().catch((error) => {
      if (isNetworkError(error)) showNetworkModal();
      else toast(error.message);
    });
  }

  function renderFullReport(metrics) {
    const cards = metrics.cards || {};
    const period = metrics.period || {};
    const cardTarget = $('[data-metric-cards]');
    if (cardTarget) {
      cardTarget.innerHTML = [
        metricCard('Cadastros', formatInteger(cards.total_sessions), 'Participantes registrados'),
        metricCard('Pessoas unicas', formatInteger(cards.unique_players), 'Por e-mail informado'),
        metricCard('Jogos', formatInteger(cards.games_started), 'Salas iniciadas'),
        metricCard('Partidas', formatInteger(cards.matches_started), 'Rodadas abertas'),
        metricCard('Pontuadas', formatInteger(cards.matches_scored), `${formatReportPercent(cards.completion_rate)} de conclusao`),
        metricCard('Acerto medio', formatReportPercent(cards.avg_percent), 'Media das notas'),
        metricCard('Melhor nota', formatReportPercent(cards.best_percent), 'Maior similaridade'),
        metricCard('Tempo medio', formatDurationValue(cards.avg_response_seconds), 'Ate enviar resposta'),
        metricCard('Pico por dia', cards.peak_day || '-', `${formatInteger(cards.peak_day_value)} pontuadas`),
        metricCard('Pico por hora', cards.peak_hour || '-', `${formatInteger(cards.peak_hour_value)} pontuadas`),
        metricCard('Fallbacks', formatInteger(cards.fallback_count), 'Pontuacao local'),
        metricCard('PCs ativos', formatInteger(cards.active_stations), 'Heartbeat recente'),
      ].join('');
    }

    const periodText = period.label || '';
    $('[data-report-period]') && ($('[data-report-period]').textContent = periodText);
    $('[data-report-print-period]') && ($('[data-report-print-period]').textContent = periodText);
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
          { key: 'matches_started', label: 'Rodadas iniciadas' },
          { key: 'matches_submitted', label: 'Rodadas enviadas' },
          { key: 'matches_scored', label: 'Rodadas pontuadas' },
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
          { key: 'matches_started', label: 'Rodadas iniciadas' },
          { key: 'matches_submitted', label: 'Rodadas enviadas' },
          { key: 'matches_scored', label: 'Rodadas pontuadas' },
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

  function csvEscape(value) {
    const text = String(value ?? '');
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
      target.innerHTML = '<p class="empty-state">Sem partidas pontuadas no periodo.</p>';
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
      target.innerHTML = '<p class="empty-state">Sem dados para comparar no periodo.</p>';
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

  function renderReportTable(target, columns, rows, emptyMessage = 'Sem dados no periodo.') {
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
      { label: 'Rodadas', value: (row) => `${row.matches_scored || 0}/${row.matches_started || 0}` },
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

  if (page === 'game') void initGame();
  if (page === 'wall') initWall();
  if (page === 'main') initMain();
  if (page === 'report') initReport();
})();
