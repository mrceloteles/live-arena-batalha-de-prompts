# Classic Fidelity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o modo clássico da Batalha de Prompts ao máximo de fidelidade comprovável em relação ao Red Door preservado, sem contaminar a matriz clássica com melhorias do Modo Turma ou do juiz moderno.

**Architecture:** A execução será orientada por evidência e TDD. Cada diferença observável vira fixture, teste falhando, correção mínima, regressão e atualização da matriz de fidelidade. O transporte SSE e demais melhorias internas podem permanecer quando forem observavelmente equivalentes ao fluxo clássico.

**Tech Stack:** Node.js 24, `node:test`, `node:sqlite`, JavaScript ES modules, HTTP/SSE, assets públicos preservados em `evidence/original-public/`.

**Spec:** `docs/superpowers/specs/2026-09-03-classic-fidelity-hardening-design.md`

## Global Constraints

- Clássico fixo: 3 jogadores, 3 rodadas, 60 s, resultados 10 s, final 30 s.
- `JUDGE_MODE=gemini` = juiz source-compatible histórico; `gemini-safe` permanece separado.
- Fallback histórico = 40% `similar_text` + 60% cobertura de palavras, clamp 5–98,5 para entrada não vazia e 4 casas decimais.
- Nenhum bônus de velocidade em `points`; tempo apenas no desempate comprovado.
- Nenhuma alteração do Modo Turma pode modificar testes/UX do clássico.
- Nenhum item `INFERRED` ou `UNKNOWN` pode ser descrito como idêntico.
- Toda correção comportamental segue RED → GREEN → regressão → matriz → commit.

---

### Task 1: Criar a matriz de fidelidade como contrato executável

**Files:**
- Create: `research/fidelity-matrix.json`
- Create: `research/FIDELITY-MATRIX.md`
- Create: `test/evidence/fidelity-matrix.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: matriz versionada com `area`, `behavior`, `referenceEvidence`, `implementationEvidence`, `status`, `test`, `knownDifference`, `decision`.
- Consumes: `evidence/original-public/manifest.json`, relatórios em `research/red-door-judge/`, testes atuais.

- [ ] **Step 1: Write the failing test**

Criar `test/evidence/fidelity-matrix.test.mjs` exigindo:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matrix = JSON.parse(fs.readFileSync(new URL('../../research/fidelity-matrix.json', import.meta.url), 'utf8'));
const requiredAreas = [
  'routes-pages','public-assets','api-contract','registration','heartbeat-sync','state-machine','timing','submission',
  'gemini-judge','fallback','retries','scoring','round-ranking','final-ranking','tie-break','reload-reconnect','timeout',
  'messages-modals','main-screen','player-screen','admin-observable','failure-recovery',
];

test('fidelity matrix covers every required classic area', () => {
  assert.deepEqual([...new Set(matrix.items.map((x) => x.area))].sort(), [...requiredAreas].sort());
});

test('every matrix item has auditable evidence and a valid status', () => {
  for (const item of matrix.items) {
    assert.ok(['IDENTICAL','EQUIVALENT','INFERRED','UNKNOWN'].includes(item.status));
    for (const key of ['behavior','referenceEvidence','implementationEvidence','test','knownDifference','decision']) {
      assert.equal(typeof item[key], 'string');
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/evidence/fidelity-matrix.test.mjs`
Expected: FAIL because `research/fidelity-matrix.json` does not exist.

- [ ] **Step 3: Write minimal implementation**

Criar a matriz inicial com 22 itens, preenchendo o que já é comprovado e marcando explicitamente `INFERRED`/`UNKNOWN` onde faltar evidência. Gerar `FIDELITY-MATRIX.md` como visão humana da mesma matriz.

- [ ] **Step 4: Add the test to the default gate**

Modificar `package.json` para incluir `test/evidence/*.test.mjs` e também preservar os testes `test/research-*.test.mjs` no gate padrão.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add research/fidelity-matrix.json research/FIDELITY-MATRIX.md test/evidence/fidelity-matrix.test.mjs package.json
git commit -m "test: make classic fidelity matrix executable"
```

---

### Task 2: Congelar contratos públicos e máquina de estados clássica

**Files:**
- Modify: `test/api/api.test.mjs`
- Modify: `test/api/multiplayer-flow.test.mjs`
- Modify: `test/domain/game-state.test.mjs`
- Modify if required: `src/server/api.mjs`
- Modify if required: `src/domain/game-state.mjs`

**Interfaces:**
- Consumes: ações `register`, `heartbeat`, `room_status`, `start_match`, `match_status`, `submit_prompt`, `retry_score`.
- Produces: contrato clássico congelado para `server_now`, `reset_at`, `match`, `round_ranking`, `final_ranking`, `gemini_status` e fases.

- [ ] **Step 1: Write failing API contract tests**

Adicionar asserts exatos de presença e semântica dos campos usados pelo JS original:

```js
for (const key of ['server_now', 'reset_at']) assert.ok(key in result);
for (const key of ['id','round_number','total_rounds','deadline_at','started_at','submitted_at','scored_at','user_prompt','percent','points','submitted','scored','status','gemini_status']) {
  assert.ok(key in result.match, `missing match.${key}`);
}
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/api/api.test.mjs test/api/multiplayer-flow.test.mjs`
Expected: FAIL somente nos campos/estados ausentes ou semanticamente divergentes.

- [ ] **Step 3: Apply minimal API changes**

Corrigir apenas os campos/estados comprovadamente divergentes em `src/server/api.mjs`.

- [ ] **Step 4: Freeze state-machine timings**

Adicionar em `test/domain/game-state.test.mjs`:

```js
assert.deepEqual(GAME_RULES, {
  players: 3,
  rounds: 3,
  roundDuration: 60,
  resultsDuration: 10,
  finalResultsDuration: 30,
});
```

Testar `registration -> ready -> playing -> scoring -> results -> ready` e rodada 3 `-> final_results -> idle` com relógio controlado.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/api/*.test.mjs test/domain/game-state.test.mjs`
Then: `npm test`
Expected: PASS.

- [ ] **Step 6: Update matrix and commit**

Promover somente itens comprovados para `IDENTICAL`/`EQUIVALENT`.

```bash
git commit -am "test: freeze classic API and lifecycle contract"
```

---

### Task 3: Corrigir sincronização e tempos perceptíveis

**Files:**
- Modify: `test/web/sync-latency.test.mjs`
- Modify: `test/web/realtime-events.test.mjs`
- Modify: `public/assets/js/app.js` only if evidence shows a visible mismatch
- Modify: `research/fidelity-matrix.json`
- Modify: `research/FIDELITY-MATRIX.md`

**Interfaces:**
- Produces: heartbeat 2500 ms, timer 250 ms e comportamento visível de polling compatível com a captura, mantendo SSE apenas como otimização interna.

- [ ] **Step 1: Replace "faster is always better" assertions with fidelity assertions**

O teste atual exige polling <=750 ms, mas a referência observada usa aproximadamente 1 s e heartbeat 2500 ms. Escrever testes que separem transporte SSE da cadência pública:

```js
assert.equal(constant('HEARTBEAT_MS'), 2500);
assert.equal(constant('TIMER_TICK_MS'), 250);
assert.ok(constant('PLAYER_MATCH_SYNC_MS') >= 750 && constant('PLAYER_MATCH_SYNC_MS') <= 1100);
```

Onde o `app.js` não tiver `TIMER_TICK_MS`, primeiro escrever o teste contra o valor literal preservado e então extrair a constante sem mudar comportamento.

- [ ] **Step 2: Verify RED**

Run: `node --test test/web/sync-latency.test.mjs test/web/realtime-events.test.mjs`
Expected: FAIL se a implementação atual estiver otimizada além da cadência observada ou sem constante explícita.

- [ ] **Step 3: Make minimal visible-timing corrections**

Manter SSE, mas impedir que eventos pulem fases, loaders ou mensagens. Polling de contingência deve corresponder à faixa observada.

- [ ] **Step 4: Run tests**

Run focused tests, then `npm test`.
Expected: PASS.

- [ ] **Step 5: Update matrix and commit**

```bash
git commit -am "fix: align classic synchronization with observed timing"
```

---

### Task 4: Congelar pontuação, ranking e desempates

**Files:**
- Modify: `test/domain/scoring.test.mjs`
- Modify: `test/domain/ranking.test.mjs`
- Modify if required: `src/domain/scoring.mjs`
- Modify if required: `src/domain/ranking.mjs`
- Modify: `research/fidelity-matrix.json`

**Interfaces:**
- Produces: `points = round(percent * 100)`; ranking por pontos, percentual e menor tempo; empate integral com posição compartilhada e ordem estável por estação apenas para apresentação.

- [ ] **Step 1: Write scoring fixtures**

```js
assert.equal(calculatePoints(29.071, 59, 60), 2907);
assert.equal(calculatePoints(18.6325, 1, 60), 1863);
assert.equal(calculatePoints(12.6992, 30, 60), 1270);
```

- [ ] **Step 2: Write tie-break fixtures**

Criar casos independentes para:

```js
// higher points wins
// same points -> higher percent
// same points and percent -> lower elapsed
// exact tie -> same position; stable station ordering is display-only
```

- [ ] **Step 3: Verify RED**

Run: `node --test test/domain/scoring.test.mjs test/domain/ranking.test.mjs`
Expected: FAIL somente se houver divergência real.

- [ ] **Step 4: Minimal fix and regression**

Alterar `scoring.mjs`/`ranking.mjs` somente se necessário. Run focused then `npm test`.

- [ ] **Step 5: Update matrix and commit**

```bash
git commit -am "test: lock classic scoring and tie-break semantics"
```

---

### Task 5: Congelar juiz histórico e política de fallback

**Files:**
- Modify: `test/judge/source-compatible-judge.test.mjs`
- Modify: `test/research-package-source-fixtures.test.mjs`
- Modify if required: `src/judge/source-compatible-judge.mjs`
- Modify: `research/fidelity-matrix.json`

**Interfaces:**
- Produces: Gemini `gemini-2.0-flash`, temperature `0.1`, max tokens `10`, timeout `8000`, parsing numérico e fallback automático.

- [ ] **Step 1: Add exact source contract tests**

Cobrir request body, modelo, timeout, parsing, clamp 0–100, arredondamento 4 casas e fallback em:

```text
HTTP != 200
Abort/timeout
body vazio
sem número parseável
sem API key (bootstrap não deve selecionar gemini sem chave válida)
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/judge/source-compatible-judge.test.mjs test/research-package-source-fixtures.test.mjs`
Expected: FAIL apenas se algum caminho histórico não estiver preservado.

- [ ] **Step 3: Minimal fix**

Ajustar somente `source-compatible-judge.mjs`; nunca importar rubrica/prompt do `gemini-safe`.

- [ ] **Step 4: Regression and matrix**

Run: `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "test: freeze source-compatible Gemini behavior"
```

---

### Task 6: Comparar frontend e mensagens com a captura pública

**Files:**
- Modify: `test/web/pages.test.mjs`
- Create: `test/evidence/classic-copy.test.mjs`
- Modify if required: `src/web/pages/index.mjs`
- Modify if required: `public/assets/js/app.js`
- Modify: `research/fidelity-matrix.json`

**Interfaces:**
- Consumes: `evidence/original-public/index.php`, `main.php`, `admin.php`, `game/station-1.html`, `public/assets/js/app.js`.
- Produces: snapshots semânticos de textos, labels, estados e mensagens observáveis.

- [ ] **Step 1: Write semantic snapshot tests**

Extrair e congelar frases-chave da captura, incluindo:

```text
Entrar no ringue!
Serão 3 rounds, 3 desafios.
Aguardando resposta do Gemini...
Gemini ainda está calculando a porcentagem
```

Testar também `maxlength=4000`, identificação de 3 estações, botão de envio, espera e ranking.

- [ ] **Step 2: Verify RED**

Run: `node --test test/web/pages.test.mjs test/evidence/classic-copy.test.mjs`
Expected: FAIL nas diferenças reais de copy/DOM.

- [ ] **Step 3: Apply minimal frontend corrections**

Corrigir apenas diferenças comprovadas; diferenças de branding previamente autorizadas permanecem documentadas.

- [ ] **Step 4: Run regression and update matrix**

Run: `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix: align classic screens and messages with capture"
```

---

### Task 7: Congelar falhas, timeout, idempotência e reconexão

**Files:**
- Modify: `test/api/api.test.mjs`
- Modify: `test/api/multiplayer-flow.test.mjs`
- Create: `test/api/classic-recovery.test.mjs`
- Modify if required: `src/server/api.mjs`
- Modify: `research/fidelity-matrix.json`

**Interfaces:**
- Produces: comportamento clássico estável em duplicate submit, retry, timeout, refresh e restart lógico.

- [ ] **Step 1: Write failing edge-case tests**

Cobrir:

```js
// same idempotency token + same payload => one score
// same token + different prompt => 409
// second prompt after accepted submission => 409
// retry_score after existing score => no recalculation
// expired deadline => deterministic timeout result
// room/status after reload reconstructs submitted/scored state
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/api/api.test.mjs test/api/multiplayer-flow.test.mjs test/api/classic-recovery.test.mjs`
Expected: FAIL apenas onde houver lacuna.

- [ ] **Step 3: Minimal fix**

Alterar `api.mjs` somente nos fluxos que falharem; não alterar Modo Turma.

- [ ] **Step 4: Run regression and update matrix**

Run: `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "test: lock classic failure and recovery behavior"
```

---

### Task 8: Gate clássico 3 jogadores × 3 rodadas e relatório final

**Files:**
- Create: `test/api/classic-3x3-fidelity.test.mjs`
- Modify: `research/fidelity-matrix.json`
- Modify: `research/FIDELITY-MATRIX.md`
- Create: `research/CLASSIC-FIDELITY-REPORT-2026-09-03.md`
- Modify: `README.md`

**Interfaces:**
- Produces: teste integrado final e relatório objetivo por status da matriz.

- [ ] **Step 1: Write the integrated classic test**

O teste deve:

```text
1. iniciar ciclo clássico;
2. registrar 3 jogadores;
3. completar round 1 com 3 submits;
4. observar results por 10 s de relógio controlado;
5. completar round 2;
6. completar round 3;
7. observar final_results por 30 s;
8. confirmar ranking, pontos, percentuais e reset para novo ciclo;
9. garantir que nenhuma configuração de classroom apareça no contrato clássico.
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/api/classic-3x3-fidelity.test.mjs`
Expected: FAIL se qualquer detalhe de integração ainda divergir.

- [ ] **Step 3: Fix only the demonstrated integration gaps**

Aplicar correções mínimas e repetir até PASS.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm test
node --test test/api/classic-3x3-fidelity.test.mjs
```

Expected: PASS sem warnings/erros relevantes.

- [ ] **Step 5: Generate final report from matrix**

`CLASSIC-FIDELITY-REPORT-2026-09-03.md` deve listar:

```text
IDENTICAL: N
EQUIVALENT: N
INFERRED: N
UNKNOWN: N
Diferenças intencionais
Limitações de observação do backend privado
```

Sem porcentagens vagas de fidelidade.

- [ ] **Step 6: Commit**

```bash
git add test/api/classic-3x3-fidelity.test.mjs research/CLASSIC-FIDELITY-REPORT-2026-09-03.md research/fidelity-matrix.json research/FIDELITY-MATRIX.md README.md
git commit -m "test: certify observable classic fidelity"
```

---

## Self-review

- Spec coverage: todas as 22 áreas mínimas aparecem na Task 1 e são validadas nas Tasks 2–8.
- Placeholder scan: nenhum `TBD`, `TODO`, “similar ao anterior” ou passo sem comando/critério esperado.
- Type consistency: os nomes públicos usados no plano correspondem aos contratos atuais (`match`, `room`, `percent`, `points`, `elapsed_seconds`, `round_ranking`, `final_ranking`).
- Scope: Modo Turma e `gemini-safe` permanecem explicitamente fora do hardening, salvo testes para provar que não contaminam o clássico.
