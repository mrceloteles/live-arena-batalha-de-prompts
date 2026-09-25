# Referências técnicas — Live Arena

Índice extraído do código em 18/09/2026. Caminhos relativos à raiz do projeto. As linhas são localizadores desta versão e podem mudar. Nomes extraídos não garantem que uma operação seja acessível publicamente; confirmar roteamento e permissões.

## src/web/pages/index.mjs

### Funções nomeadas (localizadores de renderização e comportamento)

- `indexPage` — linha 57
- `tvPage` — linha 79
- `reportPage` — linha 106
- `arenaPage` — linha 270
- `adminLoginPage` — linha 471
- `adminArenaPage` — linha 495
- `renderPage` — linha 602
- `notFoundPage` — linha 625

### Atributos data-* literais referenciados

`data-admin-arena-content`, `data-admin-arena-login`, `data-admin-arena-login-panel`, `data-admin-arena-message`, `data-arena-admin-logout`, `data-arena-attempts`, `data-arena-breakdown`, `data-arena-breakdown-fold`, `data-arena-challenge-list`, `data-arena-challenge-message`, `data-arena-classic`, `data-arena-classic-image`, `data-arena-close-detail`, `data-arena-completo-hint`, `data-arena-confidence`, `data-arena-confidence-options`, `data-arena-connected`, `data-arena-connected-label`, `data-arena-counter`, `data-arena-detail`, `data-arena-detail-body`, `data-arena-detail-title`, `data-arena-dialog`, `data-arena-dialog-body`, `data-arena-dialog-close`, `data-arena-dialog-form`, `data-arena-empty-title`, `data-arena-energy-fill`, `data-arena-evolution`, `data-arena-feedback`, `data-arena-fold`, `data-arena-gate-status`, `data-arena-gate-toggle`, `data-arena-hearts`, `data-arena-highlights`, `data-arena-join-form`, `data-arena-join-message`, `data-arena-leave`, `data-arena-lesson-list`, `data-arena-lightbox`, `data-arena-lightbox-close`, `data-arena-lightbox-img`, `data-arena-mission`, `data-arena-mission-badge`, `data-arena-mission-body`, `data-arena-mission-context`, `data-arena-mission-empty`, `data-arena-mission-message`, `data-arena-mission-panel`, `data-arena-mission-title`, `data-arena-mode-hud`, `data-arena-mode-vote`, `data-arena-new-challenge`, `data-arena-offline`, `data-arena-preview`, `data-arena-prompt-form`, `data-arena-ranking`, `data-arena-report-body`, `data-arena-report-panel`, `data-arena-rescue`, `data-arena-rescue-prompt`, `data-arena-result`, `data-arena-result-label`, `data-arena-result-percent`, `data-arena-results-list`, `data-arena-results-panel`, `data-arena-retry`, `data-arena-reversa`, `data-arena-reversa-image`, `data-arena-room-code`, `data-arena-room-count`, `data-arena-room-list`, `data-arena-room-title`, `data-arena-roster`, `data-arena-round-count`, `data-arena-scenario`, `data-arena-scenario-label`, `data-arena-scenario-prompt`, `data-arena-screen`, `data-arena-send`, `data-arena-team`, `data-arena-timer`, `data-arena-tv`, `data-arena-vote-intro`, `data-arena-vote-kicker`, `data-arena-vote-options`, `data-arena-vote-prompt`, `data-arena-vote-question`, `data-arena-vote-status`, `data-export-report`, `data-game-table`, `data-heatmap`, `data-match-table`, `data-metric-cards`, `data-metric-cards-extra`, `data-mode-comparison`, `data-page`, `data-player-table`, `data-print-report`, `data-report-csv-note`, `data-report-data`, `data-report-empty`, `data-report-filters`, `data-report-group`, `data-report-image-close`, `data-report-image-img`, `data-report-image-modal`, `data-report-image-title`, `data-report-more-count`, `data-report-more-metrics`, `data-report-period`, `data-reset-at`, `data-round-table`, `data-session-table`, `data-station-comparison`, `data-table`, `data-table-dense`, `data-tv-content`, `data-tv-fullscreen`, `data-tv-heading`, `data-tv-preset`, `data-tv-preview`, `data-tv-room`, `data-tv-room-title`, `data-tv-stage`, `data-tv-text`, `data-updated-at`

### Ações data-action literais



### Campos name literais

`code`, `end_date`, `name`, `password`, `prompt`, `start_date`, `viewport`

### Chamadas de API literais


## public/assets/js/arena.js

### Funções nomeadas (localizadores de renderização e comportamento)

- `arenaHeartsMarkup` — linha 162
- `arenaEnergyMarkup` — linha 177
- `arenaAccuracyMarkup` — linha 187
- `rulesSummary` — linha 208
- `rotuloDoMotivo` — linha 242
- `motivoDoJuizLocal` — linha 246
- `api` — linha 256
- `eventsQuery` — linha 293
- `subscribeRoomEvents` — linha 310
- `openRoomEvents` — linha 321
- `closeRoomEvents` — linha 345
- `createFetchGate` — linha 361
- `hiddenPollClock` — linha 399
- `onVisibleResume` — linha 410
- `breakdownBars` — linha 462
- `showScreen` — linha 486
- `savedSession` — linha 491
- `clearSession` — linha 495
- `message` — linha 500
- `joinRoom` — linha 505
- `enterLobby` — linha 512
- `setOfflineState` — linha 535
- `refreshLobby` — linha 547
- `startPolling` — linha 581
- `renderLobby` — linha 597
- `frame` — linha 634
- `updateCounter` — linha 689
- `renderMission` — linha 700
- `startTimer` — linha 954
- `renderResults` — linha 995
- `renderRanking` — linha 1021
- `renderHighlights` — linha 1049
- `arenaVoteStatus` — linha 1194
- `renderArenaMode` — linha 1202
- `renderArenaVote` — linha 1223
- `sendArenaVote` — linha 1315
- `openLightbox` — linha 1378
- `closeLightbox` — linha 1384
- `renderPreviewMission` — linha 1418
- `renderPreviewBar` — linha 1466
- `wirePreviewKeys` — linha 1548
- `startPreview` — linha 1587
- `startAdminCountdown` — linha 1698
- `showBlockersDialog` — linha 1732
- `showLogin` — linha 1750
- `showContent` — linha 1757
- `login` — linha 1764
- `refreshAll` — linha 1771
- `renderGate` — linha 1782
- `toggleGate` — linha 1795
- `renderRooms` — linha 1807
- `refreshChallenges` — linha 1853
- `refreshLessons` — linha 1865
- `contagemPorTipo` — linha 1876
- `lessonResumo` — linha 1894
- `lessonMix` — linha 1902
- `aplicarDobras` — linha 1915
- `renderLessons` — linha 1930
- `addLesson` — linha 1962
- `renderChallenges` — linha 1970
- `refreshDetail` — linha 1995
- `refreshDetailQuiet` — linha 2005
- `readDetail` — linha 2009
- `scheduleDetailPoll` — linha 2046
- `drawPanel` — linha 2075
- `arenaPanel` — linha 2160
- `controlSelector` — linha 2342
- `captureViewState` — linha 2356
- `restoreViewState` — linha 2370
- `blocoDeEspera` — linha 2442
- `renderDetail` — linha 2477
- `renderReport` — linha 2724
- `roomAction` — linha 2780
- `updateMissionCount` — linha 2809
- `openDialog` — linha 2819
- `closeDialog` — linha 2826
- `focusFixFields` — linha 2845
- `openChallengeFix` — linha 2870
- `flashFixNote` — linha 2891
- `showProjectionDialog` — linha 2910
- `challengeFormHtml` — linha 2962
- `editRoomDialog` — linha 3063
- `bulkFixDialog` — linha 3081
- `bulkFillCounts` — linha 3140
- `refreshBulkFill` — linha 3149
- `applyBulkFill` — linha 3173
- `openBulkFix` — linha 3210
- `parseDurationText` — linha 3233
- `timingRowHtml` — linha 3252
- `refreshTimingTotal` — linha 3284
- `openTimingDialog` — linha 3329
- `flashTimingNote` — linha 3356
- `saveTimingForm` — linha 3374
- `addRoundDialog` — linha 3411
- `renderAddRoundPreview` — linha 3430
- `arenaConfigResumo` — linha 4112
- `refreshArenaConfigResumo` — linha 4120
- `toggleTvFullscreen` — linha 4237
- `setContent` — linha 4274
- `standingValue` — linha 4279
- `standingLabel` — linha 4283
- `rankingMarkup` — linha 4287
- `rosterMarkup` — linha 4307
- `miniRankingMarkup` — linha 4325
- `drawTvMarkup` — linha 4342
- `arenaTvMarkup` — linha 4399
- `arenaVerdictFallMarkup` — linha 4481
- `semMovimento` — linha 4505
- `paintArenaVerdict` — linha 4514
- `lobbyMarkup` — linha 4543
- `roundMarkup` — linha 4575
- `resultsMarkup` — linha 4615
- `renderTV` — linha 4650
- `startCountdown` — linha 4687
- `stopCountdown` — linha 4706
- `refresh` — linha 4710
- `readTV` — linha 4716
- `showCodeEntry` — linha 4746
- `redeemCode` — linha 4792
- `connectAndPoll` — linha 4807
- `stopPoll` — linha 4821
- `tvPreviewBarMarkup` — linha 4839
- `renderTvPreview` — linha 4861
- `refreshTvPreview` — linha 4875
- `selectTvMode` — linha 4880
- `openRealProjection` — linha 4894
- `wireTvPreview` — linha 4908
- `startTvPreview` — linha 4930
- `startTV` — linha 4951

### Atributos data-* literais referenciados

`data-action`, `data-add-round-challenge`, `data-add-round-form`, `data-add-round-message`, `data-add-round-preview`, `data-admin-arena-content`, `data-admin-arena-login`, `data-admin-arena-login-panel`, `data-admin-arena-message`, `data-arena-admin-logout`, `data-arena-arena-summary`, `data-arena-attempts`, `data-arena-breakdown`, `data-arena-breakdown-fold`, `data-arena-challenge-list`, `data-arena-classic`, `data-arena-classic-image`, `data-arena-close-detail`, `data-arena-completo-hint`, `data-arena-confidence`, `data-arena-confidence-choice`, `data-arena-confidence-options`, `data-arena-config`, `data-arena-connected`, `data-arena-connected-label`, `data-arena-counter`, `data-arena-create-message`, `data-arena-create-room`, `data-arena-detail`, `data-arena-detail-body`, `data-arena-detail-title`, `data-arena-dialog`, `data-arena-dialog-body`, `data-arena-dialog-close`, `data-arena-draw`, `data-arena-empty-title`, `data-arena-energy-fill`, `data-arena-evolution`, `data-arena-feedback`, `data-arena-fold`, `data-arena-gate-status`, `data-arena-gate-toggle`, `data-arena-hearts`, `data-arena-highlights`, `data-arena-join-form`, `data-arena-join-message`, `data-arena-leave`, `data-arena-lesson-list`, `data-arena-lightbox`, `data-arena-lightbox-close`, `data-arena-lightbox-img`, `data-arena-mission`, `data-arena-mission-badge`, `data-arena-mission-body`, `data-arena-mission-context`, `data-arena-mission-empty`, `data-arena-mission-message`, `data-arena-mission-panel`, `data-arena-mission-title`, `data-arena-mode-hud`, `data-arena-mode-panel`, `data-arena-mode-vote`, `data-arena-new-challenge`, `data-arena-offline`, `data-arena-players-field`, `data-arena-preset`, `data-arena-preset-hint`, `data-arena-preview-bar`, `data-arena-prompt-form`, `data-arena-ranking`, `data-arena-report-body`, `data-arena-report-panel`, `data-arena-rescue`, `data-arena-rescue-prompt`, `data-arena-result`, `data-arena-result-label`, `data-arena-result-percent`, `data-arena-results-list`, `data-arena-results-panel`, `data-arena-retry`, `data-arena-reversa`, `data-arena-reversa-image`, `data-arena-room-arena`, `data-arena-room-code`, `data-arena-room-count`, `data-arena-room-list`, `data-arena-room-missions`, `data-arena-room-missions-count`, `data-arena-room-title`, `data-arena-roster`, `data-arena-round-count`, `data-arena-scenario`, `data-arena-scenario-label`, `data-arena-scenario-prompt`, `data-arena-screen`, `data-arena-send`, `data-arena-team`, `data-arena-timer`, `data-arena-tv`, `data-arena-vote-choice`, `data-arena-vote-intro`, `data-arena-vote-kicker`, `data-arena-vote-kind`, `data-arena-vote-options`, `data-arena-vote-prompt`, `data-arena-vote-question`, `data-arena-vote-status`, `data-arena-waiting`, `data-bulk-apply`, `data-bulk-fill-hint`, `data-bulk-fill-message`, `data-bulk-fill-source`, `data-bulk-fix-form`, `data-bulk-fix-message`, `data-bulk-from`, `data-bulk-gabarito`, `data-bulk-image`, `data-bulk-image-url`, `data-bulk-item`, `data-bulk-only`, `data-bulk-preview`, `data-challenge-form`, `data-challenge-form-message`, `data-challenge-id`, `data-code`, `data-copy-tv-code`, `data-dir`, `data-draw-mode`, `data-draw-size`, `data-dynamic`, `data-fix-field`, `data-fold-key`, `data-form-criteria`, `data-form-fold`, `data-id`, `data-image-preview`, `data-image-preview-clear`, `data-lesson`, `data-lesson-message`, `data-link`, `data-missing`, `data-mode`, `data-participant-id`, `data-pid`, `data-power`, `data-preview-gabarito`, `data-preview-gabarito-panel`, `data-preview-jump`, `data-preview-mode`, `data-preview-nav-fold`, `data-preview-prep`, `data-preview-step`, `data-preview-timer`, `data-preview-timing`, `data-proj-hint`, `data-proj-qr`, `data-qr-entry`, `data-qr-entry-url`, `data-room-form`, `data-room-form-message`, `data-room-id`, `data-room-timing`, `data-room-timing-form`, `data-room-timing-message`, `data-round-countdown`, `data-round-id`, `data-round-timer`, `data-timing-apply-suggestions`, `data-timing-current`, `data-timing-error`, `data-timing-input`, `data-timing-item`, `data-timing-now`, `data-timing-total`, `data-timing-use`, `data-timing-value`, `data-tv-arena`, `data-tv-arena-fall`, `data-tv-base-ms`, `data-tv-code`, `data-tv-code-error`, `data-tv-code-form`, `data-tv-code-input`, `data-tv-content`, `data-tv-countdown`, `data-tv-draw`, `data-tv-fullscreen`, `data-tv-paused`, `data-tv-preset`, `data-tv-preview-bar`, `data-tv-preview-message`, `data-tv-preview-mode`, `data-tv-preview-open`, `data-tv-preview-refresh`, `data-tv-room`, `data-tv-room-title`, `data-tv-server`, `data-tv-untimed`

### Ações data-action literais

`add-lesson-bank`, `add-lesson-room`, `add-round`, `archive`, `arena-config`, `arena-draw`, `arena-dynamic-close`, `arena-dynamic-open`, `arena-next`, `arena-power`, `arena-reset`, `arena-teams`, `arena-wildcard-close`, `close-round`, `copy-code`, `copy-link`, `delete`, `detail`, `draw-mode`, `draw-next`, `draw-reset`, `draw-winner`, `duplicate`, `edit`, `end-room`, `end-round`, `fix-all`, `fix-round`, `move-round`, `open-tv`, `pause-round`, `publish`, `remove-participant`, `remove-round`, `rename-participant`, `resume-round`, `room-block`, `room-edit`, `room-timing`, `start`

### Campos name literais

`arena_attacks_per_round`, `arena_boss_health`, `arena_damage_threshold`, `arena_rounds`, `attempts`, `category`, `challenge_id`, `context`, `criteria`, `duration_seconds`, `entry_blocked`, `expected_players`, `expected_result`, `mission`, `mission_ids`, `modality`, `preset`, `reference_image`, `reference_image_file`, `reference_image_url`, `reference_text`, `room_id`, `speed_weight`, `title`

### Chamadas de API literais

- `arena_join` — linha 506
- `arena_lobby` — linha 519
- `arena_lobby` — linha 557
- `arena_submit` — linha 1111
- `arena_lobby` — linha 1139
- `arena_lobby` — linha 1147
- `arena_mode_vote` — linha 1323
- `arena_room_preview` — linha 1593
- `arena_status` — linha 1631
- `arena_lobby` — linha 1643
- `admin_login` — linha 1767
- `arena_qr` — linha 2700
- `arena_qr` — linha 2929
- `arena_set_round_times` — linha 3398
- `admin_logout` — linha 3475
- `arena_save_challenges` — linha 3872
- `arena_tv` — linha 4718
- `arena_tv_code` — linha 4793
- `arena_tv_preview` — linha 4876
- `arena_tv_token` — linha 4898
- `arena_tv_preview` — linha 4938

## public/assets/js/app.js

### Funções nomeadas (localizadores de renderização e comportamento)

- `ensureNetworkModal` — linha 17
- `scheduleNetworkRecovery` — linha 37
- `showNetworkModal` — linha 48
- `hideNetworkModal` — linha 56
- `isConnectionError` — linha 69
- `isNetworkError` — linha 75
- `api` — linha 79
- `delay` — linha 135
- `handleServerReset` — linha 145
- `toast` — linha 163
- `setBusy` — linha 174
- `escapeHtml` — linha 188
- `initReport` — linha 197
- `metricCard` — linha 291
- `periodoSemDados` — linha 307
- `renderReportVazio` — linha 324
- `renderFullReport` — linha 334
- `exportReportCsv` — linha 400
- `reportCsvSections` — linha 446
- `completeCsvColumns` — linha 594
- `dataToCsvLines` — linha 609
- `csvDataValue` — linha 618
- `tableToCsvLines` — linha 626
- `csvCellValue` — linha 641
- `normalizeCsvCell` — linha 651
- `csvEscape` — linha 667
- `formInput` — linha 675
- `formatInteger` — linha 679
- `formatReportPercent` — linha 683
- `formatNullablePercent` — linha 690
- `formatNullableInteger` — linha 695
- `formatBoolean` — linha 700
- `formatReportMode` — linha 708
- `formatDurationValue` — linha 715
- `shortText` — linha 722
- `reportPromptCell` — linha 728
- `drawBars` — linha 734
- `drawGroupedBars` — linha 765
- `renderHeatmap` — linha 816
- `renderComparison` — linha 842
- `renderReportTable` — linha 864
- `renderPlayerTable` — linha 884
- `renderSessionReportTable` — linha 900
- `renderMatchReportTable` — linha 915
- `reportImageThumb` — linha 938
- `bindReportImageModal` — linha 949
- `closeReportImageModal` — linha 980
- `renderGameReportTable` — linha 993
- `renderRoundReportTable` — linha 1005

### Atributos data-* literais referenciados

`data-admin-logout`, `data-admin-reset`, `data-close-report-image`, `data-export-report`, `data-game-table`, `data-heatmap`, `data-index-stations`, `data-match-table`, `data-metric-cards`, `data-metric-cards-extra`, `data-mode-comparison`, `data-network-modal`, `data-player-table`, `data-print-report`, `data-report-data`, `data-report-empty`, `data-report-filters`, `data-report-image-modal`, `data-report-image-modal-img`, `data-report-image-modal-title`, `data-report-image-src`, `data-report-image-title`, `data-report-more-count`, `data-report-period`, `data-round-table`, `data-session-table`, `data-station-comparison`, `data-toast`, `data-updated-at`

### Ações data-action literais



### Campos name literais



### Chamadas de API literais

- `report_metrics` — linha 218
- `admin_logout` — linha 249
- `admin_reset` — linha 257

## src/server/arena-api.mjs

### Operações encontradas no dispatcher

- `arena_status` — linha 2287
- `arena_tv` — linha 2291
- `arena_tv_preview` — linha 2321
- `arena_tv_code` — linha 2454
- `arena_qr` — linha 2496
- `arena_tv_token` — linha 2516
- `arena_join` — linha 2546
- `arena_lobby` — linha 2611
- `arena_submit` — linha 2623
- `arena_admin_status` — linha 2769
- `arena_set_open` — linha 2805
- `arena_create_room` — linha 2812
- `arena_update_room` — linha 2870
- `arena_delete_room` — linha 2883
- `arena_publish_room` — linha 2894
- `arena_room_detail` — linha 2910
- `arena_room_preview` — linha 2927
- `arena_start_round` — linha 2992
- `arena_end_round` — linha 3026
- `arena_pause_round` — linha 3033
- `arena_resume_round` — linha 3044
- `arena_close_round` — linha 3055
- `arena_end_room` — linha 3071
- `arena_archive_room` — linha 3079
- `arena_add_round` — linha 3087
- `arena_remove_round` — linha 3106
- `arena_reorder_rounds` — linha 3121
- `arena_save_challenge` — linha 3143
- `arena_set_round_times` — linha 3166
- `arena_save_challenges` — linha 3229
- `arena_duplicate_challenge` — linha 3266
- `arena_delete_challenge` — linha 3291
- `arena_list_challenges` — linha 3307
- `arena_list_lessons` — linha 3313
- `arena_add_lesson` — linha 3331
- `arena_set_profile` — linha 3376
- `arena_remove_participant` — linha 3398
- `arena_rename_participant` — linha 3407
- `arena_draw_setup` — linha 3430
- `arena_draw_next` — linha 3445
- `arena_draw_settle` — linha 3455
- `arena_draw_reset` — linha 3466
- `arena_mode_configure` — linha 3486
- `arena_mode_reset` — linha 3514
- `arena_mode_draw` — linha 3532
- `arena_mode_wildcard_close` — linha 3567
- `arena_mode_vote` — linha 3583
- `arena_mode_dynamic_open` — linha 3616
- `arena_mode_dynamic_hint` — linha 3647
- `arena_mode_dynamic_close` — linha 3662
- `arena_mode_next` — linha 3690
- `arena_mode_power` — linha 3717
- `arena_mode_teams` — linha 3739

## src/server/api.mjs

### Operações encontradas no dispatcher

- `admin_login` — linha 916
- `admin_logout` — linha 937
- `admin_status` — linha 942
- `report_metrics` — linha 947
- `configure_classroom` — linha 952
- `start_classroom` — linha 966
- `admin_reset` — linha 985
- `register` — linha 999
- `heartbeat` — linha 1041
- `room_status` — linha 1048
- `start_match` — linha 1053
- `match_status` — linha 1096
- `submit_prompt` — linha 1109
- `retry_score` — linha 1225
- `client_log` — linha 1262
- `metrics` — linha 1277

Atenção: contém ações do motor clássico legado. O frontend público atual não deve reexpor register, heartbeat, room_status, start_match, match_status, submit_prompt, retry_score, client_log e metrics; consultar o bloqueio em src/server/start.mjs.

## Catálogo: src/domain/presets.mjs

- Linha 62: key: 'classic',
- Linha 63: label: 'Clássico',
- Linha 79: key: 'turma',
- Linha 80: label: 'Turma',
- Linha 97: key: 'personalizado',
- Linha 98: label: 'Personalizado',
- Linha 127: key: 'arena',
- Linha 128: label: 'Arena — Turma vs. Juiz',

## Catálogo: src/domain/arena-mode.mjs

- Linha 62: rapida: { label: 'Rápida', rounds: 2 },
- Linha 63: padrao: { label: 'Padrão', rounds: 3 },
- Linha 64: estendida: { label: 'Estendida', rounds: 4 },
- Linha 69: { key: 'pixel', name: 'PIXEL', glyph: '🔵' },
- Linha 70: { key: 'neural', name: 'NEURAL', glyph: '🟣' },
- Linha 71: { key: 'byte', name: 'BYTE', glyph: '🟢' },
- Linha 81: key: 'prever',
- Linha 82: label: 'Prever o vencedor',
- Linha 83: question: 'Qual prompt o Juiz vai colocar em primeiro?',
- Linha 90: key: 'cacada',
- Linha 91: label: 'Caçada ao erro',
- Linha 92: question: 'Qual é a principal fraqueza deste prompt?',
- Linha 99: key: 'comparacao',
- Linha 100: label: 'Comparação A × B',
- Linha 101: question: 'Qual prompt atende melhor ao objetivo?',
- Linha 108: key: 'juri',
- Linha 109: label: 'Júri especialista',
- Linha 110: question: 'Avalie o prompt apenas pelo seu critério.',
- Linha 117: key: 'calibracao',
- Linha 118: label: 'Previsão + confiança',
- Linha 119: question: 'Quem o Juiz vai escolher? E com quanta certeza?',
- Linha 126: key: 'mudanca',
- Linha 127: label: 'Vote → revele → vote',
- Linha 128: question: 'Você mantém sua decisão?',
- Linha 135: key: 'conselho',
- Linha 136: label: 'Conselho da turma',
- Linha 137: question: 'Qual melhoria o competidor deveria fazer?',
- Linha 144: key: 'v1v2',
- Linha 145: label: 'Revisão V1 → V2',
- Linha 146: question: 'Reescreva seu prompt usando o que aprendeu.',
- Linha 161: pista: { key: 'pista', label: 'Revelar pista', glyph: '🔍', at: 10, hint: 'Uma pista curta sobre um critério importante do Juiz.' },
- Linha 162: conselho: { key: 'conselho', label: 'Conselho da turma', glyph: '📣', at: 20, hint: 'A turma ajuda um competidor antes da decisão final.' },
- Linha 163: revisao: { key: 'revisao', label: 'Revisão', glyph: '🛡️', at: 30, hint: 'Uma revisão pequena do prompt antes da decisão final.' },
- Linha 164: regra: { key: 'regra', label: 'Regra especial', glyph: '🎲', at: 40, hint: 'A turma escolhe entre duas condições para o próximo desafio.' },
- Linha 171: { key: 'baixa', label: 'Baixa' },
- Linha 172: { key: 'media', label: 'Média' },
- Linha 173: { key: 'alta', label: 'Alta' },
- Linha 638: hint: '',

## Catálogo: src/domain/arena-draw.mjs


## Catálogo: src/domain/arena-lessons.mjs

- Linha 4: id: 'aula2-fundacao',
- Linha 5: title: 'Aula 2 — Fundação',
- Linha 9: { title: 'Resgate: apresentação de IA', modality: 'resgate', mission: 'Faça uma apresentação sobre inteligência artificial.', context: 'Este é o ponto de partida. Defina o público, o objetivo, o formato e o nível de detalhe para melhorar o resultado.', expected_result: 'Um prompt capaz de gerar uma apresentação realmente utilizável.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
- Linha 10: { title: 'Precisão: cartaz da feira', modality: 'precisao', mission: 'Crie um cartaz para a feira de tecnologia da escola.', context: 'Feira anual de projetos do ensino médio, aberta à comunidade.', expected_result: 'Cartaz A3 chamativo para adolescentes, com horários, estandes e contato.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
- Linha 11: { title: 'Essencial: resumo de IA', modality: 'essencial', mission: 'Explique o que é inteligência artificial em poucas palavras.', context: 'Objetividade máxima: o melhor prompt em até 250 caracteres.', expected_result: 'Um prompt curto e completo, sem palavras desperdiçadas.', duration_seconds: 150, speed_weight: 'none', category: 'Fundamentos' },
- Linha 12: { title: 'Diagnóstico: falta algo', modality: 'diagnostico', mission: 'Explique inteligência artificial.', context: 'Este prompt está incompleto: faltam público, nível, objetivo, formato e profundidade.', expected_result: 'A versão completa do prompt, identificando tudo o que faltava.', duration_seconds: 180, speed_weight: 'none', category: 'Fundamentos' },
- Linha 16: id: 'aula3-controle',
- Linha 17: title: 'Aula 3 — Controle do resultado',
- Linha 21: { title: 'Documento: relatório técnico', modality: 'completo', mission: 'Gere um relatório técnico sobre o projeto de robótica.', context: 'O relatório será lido pela banca avaliadora da feira.', expected_result: 'Prompt que especifica estrutura, seções, público, finalidade, nível de detalhe e formato.', duration_seconds: 200, speed_weight: 'none', category: 'Documentos' },
- Linha 22: { title: 'Tabela comparativa', modality: 'precisao', mission: 'Crie uma tabela comparando três linguagens de programação.', context: 'Para iniciantes escolherem a primeira linguagem.', expected_result: 'Prompt que define colunas, linhas, critérios de comparação e público.', duration_seconds: 180, speed_weight: 'none', category: 'Documentos' },
- Linha 23: { title: 'Instruções estruturadas', modality: 'completo', mission: 'Escreva um passo a passo para configurar um repositório Git.', context: 'Alunos do 1º ano, sem experiência com terminal.', expected_result: 'Prompt com passos numerados, pré-requisitos, erros comuns e formato claro.', duration_seconds: 200, speed_weight: 'none', category: 'Documentos' },
- Linha 24: { title: 'Briefing: o cliente confuso', modality: 'briefing', mission: 'Quero uma postagem para minha empresa. Tem que parecer profissional, mas não muito formal. Meu público é jovem. Não quero muito texto. Quero algo bonito.', context: 'O cliente falou exatamente assim. Transforme o pedido em um prompt profissional.', expected_result: 'Prompt com público, tom, formato, restrições e objetivo claros.', duration_seconds: 200, speed_weight: 'none', category: 'Briefing' },
- Linha 28: id: 'aula4-visual',
- Linha 29: title: 'Aula 4 — Multimodal e visual',
- Linha 33: { title: 'Reversa: cartaz publicitário', modality: 'reversa', mission: 'Uma peça publicitária sofisticada de um festival de música, com tipografia grande, paleta neon sobre fundo escuro e destaque para a data.', context: 'Descreva a referência visual com enquadramento, cores, composição e atmosfera.', expected_result: 'Prompt que recriaria uma peça com essas características.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
- Linha 34: { title: 'Reversa: fotografia', modality: 'reversa', mission: 'Uma fotografia de retrato com luz lateral suave, fundo desfocado urbano à noite, tons quentes e atmosfera cinematográfica.', context: 'Identifique enquadramento, iluminação, estilo, ambiente, composição e atmosfera.', expected_result: 'Prompt de descrição fotográfica completa.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
- Linha 35: { title: 'Reversa: infográfico', modality: 'reversa', mission: 'Um infográfico educativo sobre energia solar: 5 seções numeradas, ícones simples, cores amarelo e azul, para alunos do 6º ano.', context: 'Traduza a referência em instruções visuais e de conteúdo.', expected_result: 'Prompt que gera um infográfico com aquela estrutura e estilo.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
- Linha 36: { title: 'Reversa: interface de app', modality: 'reversa', mission: 'Uma tela de aplicativo de estudos: cabeçalho com saudação, barra de progresso semanal, grade de disciplinas em cartões e botão flutuante de nova tarefa.', context: 'Descreva a estrutura da interface em instruções precisas.', expected_result: 'Prompt que orienta a construção de uma interface com essa referência.', duration_seconds: 200, speed_weight: 'none', category: 'Imagem' },
- Linha 40: id: 'aula5-final',
- Linha 41: title: 'Aula 5 — Arena final',
- Linha 45: { title: 'M1 Precisão: e-mail profissional', modality: 'precisao', mission: 'Escreva um e-mail pedindo participação em um evento de tecnologia.', context: 'E-mail para a coordenação da escola.', expected_result: 'Prompt claro com tom, estrutura e objetivo.', duration_seconds: 120, speed_weight: 'none', category: 'Arena Final' },
- Linha 46: { title: 'M2 Sprint: slogan', modality: 'sprint', mission: 'Crie um slogan para um app de estudos.', context: 'Sprint de 90 segundos: vá direto ao ponto.', expected_result: 'Prompt rápido e eficaz.', duration_seconds: 90, speed_weight: 'low', category: 'Arena Final' },
- Linha 47: { title: 'M3 Essencial: definição', modality: 'essencial', mission: 'Defina machine learning em poucas palavras.', context: 'Até 250 caracteres.', expected_result: 'Prompt curto e completo.', duration_seconds: 120, speed_weight: 'none', category: 'Arena Final' },
- Linha 48: { title: 'M4 Resgate: site de carros', modality: 'resgate', mission: 'Faça um site bonito sobre carros.', context: 'Um pedido inicial que você pode tornar mais claro e específico.', expected_result: 'Prompt de site utilizável.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
- Linha 49: { title: 'M5 Reversa: anúncio', modality: 'reversa', mission: 'Um anúncio de redes sociais para uma cafeteria, com produto central, fundo quente desfocado e texto curto em destaque.', context: 'Descreva a referência em instruções.', expected_result: 'Prompt que recria o anúncio.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
- Linha 50: { title: 'M6 Briefing: startup', modality: 'briefing', mission: 'Preciso de um texto pro site da minha startup. Tem que ser moderno, mas sério. É pra investidores e clientes. Não pode ser longo. Precisa passar confiança.', context: 'Transforme o pedido do cliente em um prompt profissional.', expected_result: 'Prompt com público, tom e estrutura claros.', duration_seconds: 150, speed_weight: 'none', category: 'Arena Final' },
- Linha 51: { title: 'M7 BOSS: lançamento', modality: 'boss', mission: 'Planeje o lançamento de um aplicativo de estudos para alunos do ensino médio.', context: 'Missão final: combine necessidade, público, restrições, formato e problema em um prompt completo.', expected_result: 'Prompt completo com contexto, público, formato, critérios e restrições.', duration_seconds: 300, speed_weight: 'none', category: 'Arena Final' },
