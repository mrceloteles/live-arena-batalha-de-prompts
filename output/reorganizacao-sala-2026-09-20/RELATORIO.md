# Sala em destaque — reorganização (20/09/2026)

Plano: a sala em destaque deixa de ser uma pilha de cartões e passa a ser uma
página de comando, com a organização espacial da referência clara, a identidade
do Live Arena e os dados reais do backend. Sem trocar cor, sem copiar dado
fictício, sem inventar controle.

## 1. O que a tela fazia e o que ela faz agora

| Peça | Antes | Agora |
|---|---|---|
| Largura da sala | 1080 px **em qualquer janela** (medido em 1920: 1080) | 1440 px — a coluna do plano; 1240 no ajuste intermediário, 1440 na medição final |
| Ordem do corpo | métricas → comandos → colunas → classificação | métricas → comandos → **colunas** → **fila de desafios** → classificação |
| Coluna da direita | "Fila de desafios da batalha" (cabeçalho + missão + grade de missões) | **"Rodada ativa"** (cabeçalho + selo do estado + a missão em foco) |
| Fila de desafios | espremida em ~416 px dentro da coluna | seção de **largura inteira**, abaixo das duas colunas |
| Missão em foco | título, imagem, missão e gabarito | + **limite de caracteres**, **tentativas**, **critérios do juiz** e as **duas prévias** (aluno e telão) |
| Lista de participantes | título e contagem | + a linha que diz o que a lista mostra |
| Cartão no celular | padding de 24 px | 16 px (a medida do plano), a partir de 640 px |

Nada de controle novo: as duas prévias apontam para as telas reais
(`/aluno-preview.php?room=…` e `/tv-preview.php?room=…`, as mesmas portas do
topo do painel), o limite de caracteres sai da **mesma** regra que o campo do
aluno usa (`essencial` = 250; o resto = 4000, agora numa função só), e os
critérios vêm do `arena_room_detail` — o servidor passou a mandar
`criteria: [{ criterion, weight }]` no detalhe da rodada (o dado já era lido
para compor a nota no `breakdown`; faltava subir para a tela).

## 2. A medida, nas seis larguras do plano

Sonda `tmp/qa/sonda-reorganizacao.mjs`, no servidor da 3000 (pid novo, com o
código em disco), banco real, sala "Aula em jogo":

```
1920×1080: sala 1440 · faixa [392, 1772] · fila [392, 1772] · 2 colunas · sem rolagem
1440×900 : sala 1132 · faixa [306, 1378] · fila [306, 1378] · 2 colunas · sem rolagem
1280×720 : sala  972 · faixa [304, 1220] · fila [304, 1220] · 2 colunas · sem rolagem
1024×768 : sala  719 · 1 coluna · sem rolagem
 768×1024: sala  722 · 1 coluna · sem rolagem
 390×844 : sala  358 · 1 coluna · sem rolagem
```

Anatomia lida na tela: `ordem { faixa: 0, bancada: 1, colunas: 4, fila: 5 }`,
`colunas "612.484px 437.5px"` (58/42), título da coluna **"Rodada ativa"**,
selo **"Aguardando o início"**, `Limite: 4000 caracteres · 1 tentativa`,
critérios `["Objetivo 100%"]`, as duas prévias, `gabaritoAberto: false`.
Zero `pageerror`, zero `console.error`, zero alerta nativo nas seis larguras.

## 3. A causa da largura errada (e a lição)

A largura da coluna tinha **duas donas**:

- `.arena-admin-layout section { width: min(1080px, 100%) }` — design.css;
- `.arena-admin > [data-admin-arena-content] { width: min(1240px, 100%) }` — design.css.

A seção ganhava por último e limitava a 1080. O conserto é de dono: o contêiner
passa a 1440 (a medida da referência) e a seção só o preenche (`width: 100%`).
Antes de atribuir largura errada a CSS novo, procure quem mais declara a MESMA
propriedade no mesmo ancestral.

## 4. Portões

- `npm test` — **539 passam · 1 pulado · 0 falham** (o pulado é o de sempre).
- `npm run test:browser` — **42/42**.
- Portão novo/alterado: `test/browser/sala-indicadores.test.mjs` cobra a ordem
  do corpo (métricas → comandos → colunas → **fila**), o título da coluna da
  direita, a **fila fora das colunas** (comparação de posição no DOM) e a
  largura da sala em seis larguras — sem passar de 1441 px e sem encolher abaixo
  de 1300 numa janela de 1920.

### Cartórios regravados (e a prova)

- `test/css/render.json`: as quatro telas da sala em destaque cresceram **+14
  elementos** (549 → 563 e 556 → 570, em 1440 e em 390), e
  `painel-do-professor__390x844` manteve 252 elementos com hash novo — é o
  padding de 16 px do celular, que muda estilo e não cria nó.
- **Prova de que os +14 são só os nós novos**: com a marcação revertida (só o
  markup, guardado em `tmp/qa/arena-pos-reorganizacao.js` e restaurado com sha
  conferido), o portão volta a medir **549 e 556** — os números exatos do
  cartório antigo. O arquivo restaurado tem o mesmo sha256
  (`2f3698a2…f97249`).
- `test/css/cascata.json` e `test/css/contraste.json`: regravados com
  `UPDATE_CSS_BASELINE=1` (47 testes de CSS passam).
- `test/copia/orcamento.json`: `arena.js` 1769 → **1808 palavras** (+39), e a
  `nota` do bundle diz o que entrou: o nome da coluna ("Rodada ativa"), a linha
  da lista de participantes, o limite e as tentativas da missão, as duas
  prévias e a frase do cartão vazio. Nenhuma frase explicativa nova.

## 5. O que ficou de fora (honestamente)

- **Os seis comandos nomeados da referência.** A bancada continua sendo um botão
  grande + •••, com os ladrilhos que o estado da sala sustenta. Ladrilho sem
  ação real é controle morto — é o defeito que o ••• existe para evitar.
- **A etiqueta de latência** ("latência 24ms") não entrou: não há medida de
  verdade no cliente, e o selo da sincronia já responde a pergunta dela (a tela
  está ligada no servidor?).
- **Tabela → lista em 768 e 390.** O plano pede a conversão; hoje a tabela rola
  por dentro do cartão (`overflow-x`), sem rolagem lateral da página. É a
  próxima peça deste mesmo arranjo.
- **A lista de salas** continua abaixo da sala em destaque e compacta (o plano
  admite "compacta", "recolhível" ou "área secundária"); ela não virou um
  seletor recolhido no topo.
- **A separação em funções** (`renderRoomHeader`, `renderRoomMetrics`, …) não foi
  feita: o corpo da sala continua sendo um template literal só, redesenhado a
  cada leitura do servidor. Separar é trabalho de estrutura, não de arranjo, e
  mexer nisso junto com a mudança de layout misturaria duas causas no mesmo
  diff — o que este projeto cobra é uma causa por rodada.

## 6. Evidências

`output/reorganizacao-sala-2026-09-20/evidencias/`

- `sala-1920x1080.png`, `sala-1440x900.png`, `sala-1280x720.png`,
  `sala-1024x768.png`, `sala-768x1024.png`, `sala-390x844.png` — a sala INTEIRA
  em cada largura (a Sonda sobe a viewport para a foto; a medida de rolagem é
  feita antes, na janela de verdade).
- `1920x1080.png` … `390x844.png` — o painel como o professor o vê.
- `folha.html` — as seis telas numa folha só.
- `../tmp/qa/render-antigo/` — o retrato da sala com a marcação antiga (a prova
  dos 549/556) e `../tmp/qa/cartorios-antes/` — os cartórios de antes.
