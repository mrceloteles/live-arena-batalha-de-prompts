# Scripts aposentados

Estes scripts foram escritos quando o produto tinha as páginas clássicas. Eles
dirigem **este** aplicativo (em `http://localhost:3000`) navegando e chamando
`/game.php`, `/main.php`, `/wall.php` ou `/join.php`.

Essas rotas foram retiradas de propósito: o renderer responde **404** para elas,
o cliente clássico saiu de `public/assets/js/app.js` e o que cada uma mostrava
virou a Arena. Um script que abre `/game.php` hoje não falha de forma visível —
ele recebe um 404, segue adiante e "passa" sem ter testado nada. Foi por isso que
eles saíram da raiz: um script morto que parece vivo é pior do que nenhum.

| Script | O que fazia |
| --- | --- |
| `play-human-3-rounds.mjs` | Jogava três rodadas como humano no fluxo clássico |
| `qa-premium-design-test.mjs` | Conferia o design premium nas telas clássicas |
| `qa-simulation.mjs` | Simulava uma sala inteira pelo fluxo clássico |
| `run-complete-3-rounds.mjs` | Rodada completa de ponta a ponta, três vezes |
| `run-design-qa.mjs` | Varredura de QA visual das telas clássicas |
| `run-full-3-rounds-test.mjs` | Rodada completa com juiz falso |
| `snap-register.mjs` | Fotografava a tela de cadastro da estação |
| `test-3-rodadas.mjs` | Teste de ponta a ponta das três rodadas |
| `test-ui-flow.mjs` | Fluxo de navegação das telas clássicas |
| `test-live-player.mjs` | Acompanhava um jogador ao vivo |
| `test-human-qa.mjs` | QA manual assistido |
| `test-human-35.mjs` | QA de 35 passos |

## O que os substitui

- **A tela renderizada:** `npm run test:browser` — os 12 testes de navegador, com
  o portão de estilo (`test/browser/css-render.test.mjs`) que compara os 18
  retratos de elemento contra um instantâneo versionado.
- **O fluxo da Arena:** `test/smoke/*.test.mjs` e `test/api/*.test.mjs` sobem o
  servidor de verdade e conduzem a sala pelas ações da API.
- **A promessa às rotas retiradas:** `test/web/rotas-retiradas.test.mjs`, que
  reprova qualquer fonte viva que volte a citá-las, e `test/web/pages.test.mjs`,
  que afirma o 404 de cada uma.

## O que NÃO está aqui, de propósito

- **`scripts/capture-original.mjs`** ficou onde estava: ele captura o site
  **original** (`reddoor-google26.phygitalapp.com.br`), não este aplicativo — é a
  proveniência dos bytes em `evidence/original-public/`. Se ele parar de
  funcionar, a fidelidade perde a régua.
- **Os scripts de uso único de patch** (`fix-*.cjs`, `apply-*.mjs`, `recolor*.mjs`,
  `upgrade-logos.mjs`, `add-reg.cjs`) continuam na raiz: eles editam arquivos
  direto no disco, não navegam pelas rotas retiradas, e a decisão sobre eles é
  outra.
