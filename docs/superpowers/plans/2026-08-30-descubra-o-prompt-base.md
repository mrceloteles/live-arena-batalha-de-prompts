# Descubra o Prompt Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar e preservar uma réplica full-stack fiel do site Descubra o Prompt, com o cliente público capturado e um backend equivalente testado.

**Architecture:** Servidor Node.js 24 compatível com as rotas `.php` e API POST JSON do original, persistência SQLite nativa e cliente HTML/CSS/JS fiel. O avaliador Gemini é injetável para que testes usem um juiz determinístico e produção use a API real.

**Tech Stack:** Node.js 24, `node:http`, `node:sqlite`, `node:test`, JavaScript do navegador, Playwright para E2E e scripts de carga Node/k6 quando disponível.

**Spec:** `docs/superpowers/specs/2026-08-30-descubra-o-prompt-base-design.md`

## Global Constraints

- Preservar três jogadores, três rodadas, 60 s, resultado de rodada 10 s e resultado final 30 s.
- Não adicionar recursos pedagógicos, novos modos ou redesign nesta matriz.
- Não colocar credenciais, senha admin ou chave Gemini no cliente ou no Git.
- Identificar claramente arquivos públicos literais e código equivalente criado.
- Toda função de produção nasce após um teste que falha pelo motivo esperado.

---

### Task 1: Captura e manifesto público

**Files:**
- Create: `evidence/original-public/**`
- Create: `evidence/manifest.json`
- Create: `scripts/capture-original.mjs`
- Test: `test/evidence/manifest.test.mjs`

**Interfaces:**
- Produces: inventário `{url, path, status, bytes, sha256, capturedAt}`.

- [ ] Escrever teste que rejeita manifesto sem as páginas/ativos obrigatórios.
- [ ] Executar e observar falha por manifesto inexistente.
- [ ] Implementar captura limitada às rotas e ao domínio autorizado.
- [ ] Rodar captura por navegador e wget; comparar contagens e hashes.
- [ ] Rodar teste e confirmar sucesso.
- [ ] Commitar captura e manifesto.

### Task 2: Núcleo de domínio e máquina de estados

**Files:**
- Create: `src/domain/game-state.mjs`
- Create: `src/domain/ranking.mjs`
- Create: `src/domain/scoring.mjs`
- Test: `test/domain/*.test.mjs`

**Interfaces:**
- Produces: `transitionGame(state, command, now)`, `rankRound(rows)`, `rankFinal(rows)`, `calculatePoints(percent, elapsed, duration)`.

- [ ] Escrever testes das transições válidas e inválidas.
- [ ] Observar falha por módulos ausentes.
- [ ] Implementar a menor máquina que passe.
- [ ] Escrever testes de desempate, percentuais, tempos e empates.
- [ ] Implementar ranking/pontos versionados.
- [ ] Rodar suíte de domínio e refatorar mantendo verde.
- [ ] Commitar núcleo.

### Task 3: Persistência e repositórios

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/database.mjs`
- Create: `src/db/repositories/*.mjs`
- Test: `test/db/*.test.mjs`

**Interfaces:**
- Produces: transações para sala, sessão, match, submissão, pontuação e relatório.

- [ ] Escrever teste de criação/reabertura do banco.
- [ ] Observar falha.
- [ ] Implementar migração idempotente.
- [ ] Escrever testes de unicidade de submissão/token e atomicidade do ranking.
- [ ] Implementar repositórios mínimos.
- [ ] Confirmar reinício sem perda de estado.
- [ ] Commitar persistência.

### Task 4: Contrato da API compatível

**Files:**
- Create: `src/server/api.mjs`
- Create: `src/server/http.mjs`
- Create: `src/server/validation.mjs`
- Test: `test/api/*.test.mjs`

**Interfaces:**
- Consumes: repositórios e domínio.
- Produces: `POST /api.php?action={register|heartbeat|room_status|start_match|match_status|submit_prompt|retry_score|client_log|metrics}`.

- [ ] Criar testes de contrato com os campos públicos observados.
- [ ] Observar 404/falha.
- [ ] Implementar roteamento e respostas JSON mínimas.
- [ ] Adicionar testes de erro, prazo, sessão, idempotência e autorização.
- [ ] Implementar validações e transações.
- [ ] Rodar todos os testes de API.
- [ ] Commitar contrato.

### Task 5: Avaliador Gemini e fallback determinístico

**Files:**
- Create: `src/judge/judge.mjs`
- Create: `src/judge/gemini-judge.mjs`
- Create: `src/judge/fake-judge.mjs`
- Test: `test/judge/*.test.mjs`

**Interfaces:**
- Produces: `judge({referencePrompt, rubric, candidatePrompt, image}) -> {percent, explanation, metadata}`.

- [ ] Escrever testes de JSON válido/inválido, timeout e retry.
- [ ] Observar falha.
- [ ] Implementar juiz falso e adaptador Gemini.
- [ ] Testar prompt injection como conteúdo não confiável.
- [ ] Integrar fila e `retry_score` idempotente.
- [ ] Rodar testes e commit.

### Task 6: Cliente fiel e rotas `.php`

**Files:**
- Create: `src/web/pages/*.mjs`
- Create: `public/assets/**`
- Create: `public/assets/js/app.js`
- Create: `public/assets/css/app.css`
- Test: `test/web/pages.test.mjs`

**Interfaces:**
- Produces: `/`, `/index.php`, `/main.php`, `/wall.php`, `/game.php`, `/admin.php`, `/report.php`.

- [ ] Escrever testes de títulos, `data-*`, telas e formulários.
- [ ] Observar falha.
- [ ] Integrar cliente público capturado e templates.
- [ ] Substituir somente logos/marcas por lockup neutro dimensionalmente compatível.
- [ ] Verificar que todos os seletores esperados por `app.js` existem.
- [ ] Rodar testes e commit.

### Task 7: Administração, relatório e segurança

**Files:**
- Create: `src/server/admin.mjs`
- Create: `src/security/*.mjs`
- Test: `test/security/*.test.mjs`

**Interfaces:**
- Produces: sessão admin, configurações, reset seguro, métricas e CSV.

- [ ] Escrever testes de senha, cookie, CSRF/origem e separação aluno/admin.
- [ ] Observar falhas.
- [ ] Implementar autenticação e headers.
- [ ] Escrever testes de métricas e exportação.
- [ ] Implementar relatório compatível.
- [ ] Rodar auditoria de segredos e commit.

### Task 8: E2E, visual, reconexão e carga

**Files:**
- Create: `test/e2e/battle.spec.mjs`
- Create: `test/e2e/reconnect.spec.mjs`
- Create: `test/e2e/visual.spec.mjs`
- Create: `test/load/classroom.js`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: aplicação completa.
- Produces: evidência de três jogadores, três rodadas, ranking e restauração.

- [ ] Criar cenário Playwright com TV + três contextos de jogador.
- [ ] Confirmar falha antes da integração final.
- [ ] Corrigir somente diferenças comprovadas.
- [ ] Testar F5 e perda de rede em cada fase.
- [ ] Comparar capturas desktop/mobile ao original.
- [ ] Executar burst de submissões e auditoria básica de segurança.
- [ ] Registrar `final result: passed` ou bloqueios reais em `design-qa.md`.
- [ ] Commitar validação.

### Task 9: Empacotamento e preservação privada

**Files:**
- Create: `README.md`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `LICENSE-NOTICE.md`
- Create: `AUDIT.md`

**Interfaces:**
- Produces: repositório privado executável e tag `base-original-v1`.

- [ ] Escrever teste smoke das instruções de instalação.
- [ ] Criar documentação de configuração sem segredos.
- [ ] Verificar hashes, suíte completa, ausência de credenciais e working tree.
- [ ] Criar repositório GitHub privado na conta conectada.
- [ ] Enviar branch principal, tag e release-base.
- [ ] Verificar remotamente privacidade, arquivos e commit/tag.
