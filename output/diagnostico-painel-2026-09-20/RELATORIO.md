# O painel "não tá funcionando" — diagnóstico e cura (20/09/2026)

## O que o professor viu

Ao abrir `/admin-arena.php` no navegador da 3000, um alerta nativo do navegador:

```
localhost:3000 diz
Cannot read properties of undefined (reading 'get')
```

A tela por trás estava desenhada — lista de salas, uma sala destacada — e mesmo
assim não respondia ao que se pedia dela. É o pior tipo de defeito: a tela
PARECE de pé.

## A causa, medida

O servidor do preview estava **de pé desde 09:27**, enquanto os arquivos eram
editados depois:

| Arquivo | mtime |
|---|---|
| `public/assets/js/arena.js` | 12:29 |
| `public/assets/css/refinement.css` | 12:29 |
| `src/web/pages/index.mjs` | 12:42 |

O servidor serve `public/` a cada requisição, mas a **casca das páginas vem de
`src/` carregado no boot** — e ele não observa arquivos. Resultado: a resposta do
servidor continuava pedindo os assets da versão antiga…

```
refinement.css?v=25     arena.js?v=109        (o que o servidor de 09:27 pedia)
refinement.css?v=26     arena.js?v=110        (o que o disco tinha)
```

…e o navegador buscava o **JS de agora** para rodar sobre a **markup de antes**.
JavaScript novo contra DOM velho é exatamente onde nasce um
`Cannot read properties of undefined (reading 'get')` dentro de um `catch` que
avisa por `alert(error.message)`.

## A cura

1. **Reinício do servidor** com o código em disco (`node src/server/start.mjs`,
   `PORT=3000`, pid novo). O HTML passou a pedir `refinement.css?v=27` e
   `arena.js?v=110` — as versões do disco.
2. **Tarja de sinal removida** (a pedido): a faixa diagonal amarela e preta no
   topo do cartão da sala em destaque. Saiu o `span.arena-detail-tape` do markup
   e a regra `body[data-page='admin-arena'] .arena-detail-tape` da folha. O
   instantâneo da cascata e o retrato de render foram regravados: a diferença
   medida foi **exatamente um elemento a menos por tela** (253 → 252 no painel,
   550 → 549 na espera, 557 → 556 em jogo), em 1440×900 e em 390×844.
3. `refinement.css?v=26 → 27` (o `?v=` é cache-busting à mão neste projeto).

## A prova

Sonda nova — `tmp/qa/sonda-painel-fresco.mjs` — que **entra pelo formulário**,
escolhe uma sala e reprova diante de `pageerror`, `console.error` ou alerta:

```
[16:21:47] login feito
  assets servidos: .../refinement.css?v=27 .../arena.js?v=110
  sala escolhida: Aula em jogo (e682a564-…)
  colunas lado a lado: arena-detail-col 582px | arena-detail-col 416px
[16:21:47] nenhum erro de página, nenhum console.error
```

E o corpo da sala em destaque, na ordem em que a tela o monta:

```
SECTION.arena-workbench → SECTION.arena-metrics → SECTION.arena-draw
→ DIV.arena-detail-columns (participantes 582px | fila de desafios 416px)
```

Com o botão de conduzir a vez, com nome: **INICIAR MISSÃO** (ou *Iniciar
batalha*, no juiz clássico) no lobby; **NOVA BATALHA NESTA SALA** com o selo
"placar zerado" depois da batalha encerrada.

## Portões

| Portão | Resultado |
|---|---|
| `npm test` | **540 testes · 539 passam · 1 pulado · 0 falhas** |
| `npm run test:browser` | **41/41** |

## Evidência

- `evidencias/01-painel-no-servidor-fresco.png` — o painel no servidor novo.
- `evidencias/02-sala-em-destaque-sem-tarja.png` — o mesmo, sem a fita.
- `evidencias/03-sala-em-destaque-inteira.png` — a sala inteira: cabeçalho,
  comandos, faixa de indicadores, sorteio e as duas colunas.

## O que continua diferente da referência (não é defeito, é escolha)

A referência `stitch_light_mode_design_system` põe a **faixa de métricas antes**
dos comandos. Aqui ela vem **depois** do cartão de comando, para o botão de
iniciar ficar mais perto do cabeçalho e da dobra. Trocar as duas seções é um
movimento pequeno e cabe numa próxima passada, se o professor preferir a ordem
da referência ao pixel.
