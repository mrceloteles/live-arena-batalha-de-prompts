# Página inicial — os três papéis (2026-09-19)

Frente 2 do plano de melhoria do Live Arena: *"a página inicial precisa
comunicar rapidamente o que é o Live Arena, quem deve entrar e qual é o próximo
passo"*.

## O problema, medido

`indexPage()` era marca, título e **um** botão:

```
Descubra o PROMPT  →  [ Entrar na Arena ]      (href="/play")
```

Quem recebia o endereço e não era aluno — o professor, a pessoa que liga a TV
da sala — não tinha como descobrir na tela que existem três papéis, nem qual
deles era o dele. O orçamento de cópia da tela registrava isso: **10 palavras**,
contra as 38 do portal original, que ao menos listava modos e PCs.

O CSS já tinha a peça pronta (`.station-grid` / `.station-card`), mas só na
folha capturada `app.css`, que **não é carregada por página nenhuma** — era
sobra da home clássica, não um componente vivo.

## O que a home diz agora

```
Descubra o PROMPT
[ PROFESSOR ]  Criar e conduzir a batalha      →  Abrir o painel     (admin-arena.php)
[ ALUNO     ]  Entrar com o código da sala     →  Entrar na Arena     (/play)
[ TV        ]  Projetar a sala ao vivo         →  Abrir a projeção   (/tv.php)
```

- Cada item é `<li>` de uma `<ul aria-label="Quem entra na arena">` — lista de
  entradas, não um bloco de decoração: leitor de tela anuncia a lista, e "TV" é
  lido como "TV", não como sigla soletrada.
- As três ações usam **a mesma porta de entrada** do produto (`.portal-enter`, a
  pílula de 56 px que já existe para o portal, a entrada do aluno e o login).
  A alternativa era dar ao aluno um botão maior; descartada porque hierarquia
  por tamanho diria "o aluno é mais importante", que não é a informação que
  falta nesta tela — o que falta é *qual porta é a minha*.
- O destino de cada ação foi conferido por `href` no teste de Node e por clique
  de verdade no teste de navegador (o do professor).

## Medição (sonda própria, `evidencias/sonda-portal.mjs`)

```
largura | cartão (x/l/a) | colunas | linhas | ação (alturas) | corte | rol. lateral | altura da página
1440    |  210/1020/393  |    3    |   1    |   56/56/56     |   0   |      0       |        0
1200    |   90/1020/387  |    3    |   1    |   56/56/56     |   0   |      0       |        0
1024    |   31/ 963/399  |    3    |   1    |   56/56/56     |   0   |      0       |        0
 901    |   27/ 847/392  |    3    |   1    |   56/56/56     |   0   |      0       |        0
 900    |   27/ 846/694  |    1    |   3    |   56/56/56     |   0   |      0       |        0
 768    |   23/ 722/687  |    1    |   3    |   56/56/56     |   0   |      0       |        0
 640    |   19/ 602/697  |    1    |   3    |   56/56/56     |   0   |      0       |        0
 390    |   16/ 358/731  |    1    |   3    |   56/56/56     |   0   |      0       |        0
```

- **De 901 px para cima**: três colunas, uma linha, cartão de no máximo 1020 px.
- **De 900 px para baixo**: uma coluna, três linhas. O corte é em 900 e não em
  760 (o primeiro breakpoint da folha) porque nesta faixa cada cartão recebia
  menos de 220 px e o título de duas linhas virava quatro.
- **Nenhum texto cortado** em nenhuma largura (`scrollWidth`/`scrollHeight`
  contra `clientWidth`/`clientHeight` em título e ação — a mesma régua que morde
  no título da TV).
- **Zero rolagem lateral** em todas as larguras: a home já travou por causa
  disso (`body,html{overflow:hidden}` global), e o teste morde nisso em 390.
- **As três ações com 56 px de altura** — o piso do alvo de toque da casa. A
  primeira medição saiu **48/56/48**: o botão de entrada tem `!important` de
  56 px numa folha anterior, e só o do aluno herdava. A correção foi dar a
  mesma porta aos três, não brigar com o `!important`.

## Um tropeço de instrumento, registrado

A composição em três colunas **não** foi vista pelo servidor de preview na
primeira captura, e o motivo não era o CSS: o servidor de preview serve as
páginas geradas de um módulo já carregado em memória, e o reinício veio
depois da edição — a home servida continuou a de antes (`refinement.css?v=21`).
Isso já está escrito no `.freebuff/run.md` ("o servidor não observa arquivos"),
e foi o que me custou uma rodada: **editar `src/` exige reiniciar o servidor**;
só `public/` é lido a cada requisição. O CSS eu pude conferir sem reiniciar.

O preview do thread é estreito (755 px), então a captura de lá mostra o arranjo
empilhado — que é o correto nessa largura. A composição de três colunas foi
conferida com a sonda (1440 → 1020 px de cartão, 3 colunas) e nos prints de
`evidencias/`.

## Cartórios

| cartório | o que mudou |
| --- | --- |
| `test/css/cascata.json` | **6 seletores novos** (`.portal-roles`, `.portal-role`, `.portal-role-kicker`, `.portal-role-title`, `body[data-page='index'] .portal-role-action`, e a entrada da media query de 900) e **1 alterado** (`body[data-page='index'] .portal-hero`, que ganhou `max-width: 1020px`). Nada mais. |
| `test/css/render.json` | só `portal__1440x900` e `portal__390x844`: 30 → 42 elementos. As outras 24 telas não se moveram, e as folhas carregadas seguem as mesmas. |
| `test/copia/orcamento.json` | portal: **10 → 33 palavras**, com `nota` escrita (folga registrada, não acidente). Continua abaixo das 38 do portal original. |

Regravação dos três feita de propósito e o diff revisado chave por chave — o
caso do portal é o inverso do costumeiro ("subiu orçamento"): a tela passou a
dizer algo que não dizia.

## Portões

```
npm test             539/540 (1 pulado — o SIGTERM que o Windows não entrega), 0 falhas
npm run test:browser 35/35, 0 falhas        (era 34; entrou o teste novo da home)
```

O teste novo (`test/browser/portal.test.mjs`) prova: os três papéis na ordem,
com o destino certo; área de toque ≥ 44 px e largura ≥ 120 px; nenhum texto
cortado; os três na mesma linha em 1440; o foco de teclado **visível** no botão
de entrada; o clique no papel do professor chegando ao login do painel; e, em
390, três linhas empilhadas, todas as ações dentro da tela e zero rolagem
lateral. Também falha se a home gerar erro de console.

## Arquivos alterados

- `src/web/pages/index.mjs` — `indexPage()` com os três papéis; `refinement.css?v=21 → 22`.
- `public/assets/css/refinement.css` — bloco "QUEM ENTRA (papéis do portal)",
  no dono do cartão de entrada (`body[data-page='index'] .portal-hero`).
- `test/web/pages.test.mjs` — o teste da home passou a exigir os três papéis e
  os três destinos, mantendo as proibições da home clássica (PCs, modos,
  `main.php`).
- `test/browser/portal.test.mjs` — novo.
- `test/copia/orcamento.json`, `test/css/cascata.json`, `test/css/render.json` — regravados.
- `tmp/qa/sonda-portal.mjs` — sonda de medição e captura (fica fora do git).

## Limitações e o que fica de fora

- **Não há teste de contraste de pixel** na home. O portão de contraste por
  arquivo passa (o texto entra em par declarado: `--color-primary` sobre
  `--color-bg` no rótulo, `--color-primary-dark` sobre `--color-bg` no título),
  mas a leitura final em projetor continua sendo olho humano.
- O portal **não** ganhou atalho para "entrar pelo código que já está na mão"
  (colar o PIN na home). Quem tem o código continua entrando por `/play`, que é
  onde o campo existe.
- As outras fases do plano seguem abertas: a faixa de "estado atual + próxima
  ação" no painel do professor, a telemetria operacional (§13), a matriz de
  estados escrita (§6) e a convivência das três famílias de tokens
  (`--color-*`, `--la-*`, aliases legados).
