# Redesign de 18/09 — o que mudou, como provar e o que ficou de fora

Esta pasta é a evidência da rodada que passou a identidade do pacote
`output/redesign-compativel/code.html` (a cópia corrigida do
`live-arena-redesign-ajustado.zip`) para o produto de verdade. O `MAPA-INTEGRACAO.md`
e o `DESIGN.md` do pacote continuam sendo a régua de integração.

## Por que a rodada anterior não se enxergava

A rodada anterior mexeu na **forma** (raio, sombra, fita, sublinhado, pílula) e
deixou os **fundos** como estavam: foto no portal, cinza chapado no painel,
pontilhado na espera, cinza claro no jogo, tinta escura na TV. Forma nova sobre o
mesmo fundo continua lendo como o mesmo produto — e era isso que fazia a tela
parecer igual.

A referência tem exatamente **dois fundos**, e cada tela escolhe um:

| Fundo | Onde |
|---|---|
| Gradiente suave menta/azul/lavanda | portal, entradas, espera, painel, relatório, prévias |
| Listras diagonais azuis (`#005ce6` / `#0076ff`, −45°, 32 px) | rodada do aluno e projeção (TV) |

Sobre os dois, a linguagem de superfície: **cartão branco de canto grande com
sombra flutuante**, **fita de perigo** amarela/preta na aresta de cima, **sublinhado
magenta** sob os títulos, **botão em pílula** e **números em monoespaçada**.

A regra que não muda: **nenhum texto encosta em listra ou gradiente**. Fundo de
página é ambientação; superfície de leitura continua branca e sólida — é o que
preserva cada par de contraste já medido.

## O que mudou, por superfície

| Superfície | Antes | Agora |
|---|---|---|
| Portal (LA-01) e 404 (LA-13) | foto `start-bg.png` + cartão 16 px translúcido | gradiente da marca + cartão branco 28 px com fita e sublinhado |
| Entrada do aluno (LA-02) | fundo cinza, cartão 16 px, botão retangular | gradiente + cartão com fita, campo de código monoespaçado e centralizado, botão em pílula |
| Login do painel (LA-04) | iguais ao anterior, sem fita | família única com a entrada do aluno |
| Espera do aluno (LA-03) | fundo pontilhado, cartão 16 px | gradiente + cartão com `signal-tape` |
| Missão/resultado do aluno (LA-03) | fundo `#f6f8fc`, painel dissolvido | listras azuis + workspace branco 28 px com fita e sublinhado |
| Painel do professor (LA-05..08) | cinza quase branco, cartões com borda de 1 px | gradiente + cartões brancos flutuantes |
| Relatório (LA-12) | cinza claro | gradiente + cartões brancos flutuantes + sublinhado no título |
| TV (LA-09/11) | página escura | listras azuis **atrás** do palco, que vira cartão escuro de moldura clara com a fita na aresta |
| Prévias (LA-10/11) | — | herdam as mesmas superfícies dos renderizadores reais |

Nenhum seletor `data-*`, `name`, ID, handler, payload ou permissão mudou. As
marcas novas na marcação são decorativas e inertes: `brand-tape`, `brand-swoosh`,
`signal-tape`.

## O que a régua provou

| Portão | Comando | Resultado |
|---|---|---|
| Cascata declarada | `npm test` (test/css) | 47/47, instantâneo regenerado |
| Contraste AA | `npm test` (test/css) | 220 pares conferidos, piso **5,08** mantido |
| Texto sobre `hidden` | `npm test` (test/css) | 0 conflito |
| Classe sem produtor | `npm test` (test/css) | 0 órfã |
| Estilo por elemento | `npm run test:browser` | 28/28, `render.json` regenerado |
| Suíte completa | `npm test` | 510 testes, 0 falha |
| Antes/depois | `node output/qa/redesign-capturas.mjs` | 90 propriedades mudadas, 27 capturas por modo |
| Orçamento de cópia | `npm test` (test/copia) | dentro do teto, sem abrir folga (68/68 no painel) |

As capturas são `antes/` (o MESMO render servido com as folhas do `HEAD`) e
`depois/`, mais a tabela de estilo computado em `medida.json`. O servidor do
script é próprio, em memória — o banco de desenvolvimento do repositório fica
fora da conta.

## Decisões declaradas

- **A TV continua escura.** A referência desenha o palco branco; aqui ele é escuro
  e a identidade entra na moldura (listra atrás, moldura clara, fita, números em
  monoespaçada). Motivo: a projeção é lida à distância numa sala com luz baixa, e
  todos os pares de contraste dela — roster, ranking, sorteio, dinâmicas,
  resultados — foram medidos sobre tinta branca. Inverter a tinta de todos seria
  reauditar cada par, e é a única mudança desta rodada com esse custo.
- **O `start-bg.png` saiu do fundo do portal.** O arquivo continua no repositório:
  o `evidence/manifest.json` exige a captura dele.
- **A tinta de leitura não mudou.** O azul das ações (`--color-primary`) e o verde
  de marca (`--color-accent`) seguem os da casa; a referência diverge em matiz, e
  trocar o azul da ação mexeria em todo par de contraste já medido sem ganho de
  leitura.
- **A rodada do aluno termina na espera.** Neste produto, encerrar a rodada devolve
  o aluno à sala de espera; não existe tela de classificação da rodada para o
  aluno. As capturas `15`/`16` mostram exatamente isso.

## Rodada 2 (mesmo dia) — a VOZ e a composição

A primeira rodada deu à tela a forma e o fundo. Faltavam três coisas que a
referência tem e que se leem antes de qualquer borda: a **voz tipográfica**, a
**hierarquia do painel** e o **momento pedagógico** da nota.

### 1. Uma face por papel

A referência carrega três famílias e dá um papel a cada uma. O produto baixava
uma (Plus Jakarta Sans) e desenhava com quatro:

| Papel | Antes | Agora |
|---|---|---|
| Título | sem face própria (a do texto) | **Space Grotesk** (`--font-display`) |
| Texto | Plus Jakarta Sans | Plus Jakarta Sans (agora declarada; `--font-google` deixou de nomear marca de terceiro) |
| Número e micro-rótulo | três pilhas diferentes (`ui-monospace, 'Cascadia Code'` em `arena.css`, `ui-monospace, SFMono-Regular` em `design.css`, e `--la-mono` pedindo uma JetBrains Mono que ninguém baixava) e `Arial Black` no cronômetro | **JetBrains Mono**`, uma pilha só |

Código da sala, PIN, contagem de missões, tentativa, rótulo de indicador e
"RODADA 01/03" passam a ler como o mesmo tipo de dado no produto inteiro.

### 2. Painel do professor: um cartão para cada trabalho (LA-05)

O painel empilhava caixas com a mesma borda clara, o mesmo raio e a mesma sombra —
nada era "a página". Agora há uma **faixa de números da Arena** (salas, em
andamento, alunos, online) com a ação primária ao lado, e a lista de salas é
**uma lista contínua**: as linhas perderam caixa, raio e sombra e passaram a ser
separadas por fio (`border-radius: 0`, `box-shadow: none`, `background: none`),
como em `teacher-room-list`.

A faixa não ganhou uma frase: o teto de palavras do painel estava exatamente no
limite (68/68) e a decisão foi caber sem abrir folga — só os quatro rótulos de
dado, escritos pelo cliente.

### 3. Resultado como diagnóstico (LA-03D)

A nota era uma caixa azul com gradiente, sombra própria e um `%` colado ao
número. Agora é um **anel** (`conic-gradient` sobre `--la-score`, 132 px) com o
valor dentro, e sob o feedback entram duas frases: **Melhor ponto** e **Foco
agora**, com o critério e o que ainda dá ponto (`+N pts possíveis`). O detalhe
critério a critério continua atrás da dobra, como já era — o anel e o diagnóstico
são a leitura de quem decidiu o próximo movimento, não uma segunda tabela.

No clássico o número grande são pontos absolutos e a unidade do anel troca para
`acerto`; sem dois critérios medidos não há par para comparar e o diagnóstico não
aparece.

### Medições desta rodada (`medida.json`)

| Tela | Alvo | Propriedade | Antes | Depois |
|---|---|---|---|---|
| 01-portal | `body` | `fontFamily` | `"Google Sans", "Product Sans", …` | `"Plus Jakarta Sans", …` |
| 01-portal | `.portal-hero-headline` | `fontFamily` | idem (sem face de título) | `"Space Grotesk", …` |
| 06-painel | `.arena-hero-stats` | `gridTemplateColumns` | `none` | `210.75px ×4` |
| 06-painel | `.arena-hero-stat > span` | `fontFamily` | sans | `"JetBrains Mono", …` |
| 06-painel | `.arena-room-card` | `borderRadius` / `boxShadow` / `backgroundColor` | `16px` / sombra / `slate-100` | `0px` / `none` / transparente |
| 08-relatório | `.metric-card > span` | `fontFamily` | sans | `"JetBrains Mono", …` |
| 14-resultado | `.arena-score-ring` | `width`×`height` / `backgroundImage` | `152×32`, `none` | `132×132`, `conic-gradient(... 53%, …)` |
| 14-resultado | `.arena-diagnosis-item.is-focus > span` | `color` | `#202124` | `#8a5a00` (5,61:1 sobre `#fff8ea`) |

## Rodada 3 (mesmo dia) — a TELA DE JOGO do aluno, e os defeitos que ela escondia

A rodada 2 deu voz e composição ao produto inteiro. Faltava a superfície onde o
aluno passa o tempo: no desenho da referência (LA-03B) ela é **um** cartão branco
com a fita na aresta, uma banda de partida no topo e um compositor com o rótulo
na mesma linha do contador — e nada disso existia.

### O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Área de trabalho | `.round-layout` com borda de 1 px, raio 24, coluna do enunciado em azul `#eaf1fc`, dentro do cartão | **um** cartão branco (o próprio workspace) com a fita na aresta; o `round-layout` perde moldura e fundo |
| Banda da partida | `MISSÃO 01/03` + selo empilhados, "Tempo restante" em caixa mista | contagem e selo em mono caixa alta à esquerda, cronômetro à direita, fio separando a banda do trabalho |
| Tentativas | no topo do compositor, empilhando um segundo micro-rótulo | na banda da partida, ao lado da rodada (é onde a referência as põe: `Tentativas 01/03`) |
| Campo | rótulo de **21 px** (o mesmo tamanho do título da missão) e contador embaixo da caixa | rótulo micro (11 px mono), linha `[rótulo | contador]`, contador à direita em mono |
| Ação | `div` sem regra com o botão encostado à esquerda | linha em `flex` com a pílula na ponta direita |
| Referência visual | clique que abre o lightbox sem aviso | selo 🔍 na imagem (decorativo, sem gastar palavra do orçamento) |
| Medida | `min(1320px)` de coluna | `min(1080px)` — a referência limita a leitura a 980 px e com 1320 as linhas corriam em ~120 caracteres |

### Os três defeitos que a captura pegou (e que não eram de gosto)

1. **O gradiente da marca estava ladrilhado.** A folha antiga da sala de espera
   fixa `background-size: 34px 35.5px` + `position: 19px 20px`; trocar só a
   `background-image` deixava esses valores de pé e a ambiência virava um xadrez
   de manchas repetidas a cada 34 px — **medido**: 702 fronteiras de cor na
   captura da sala de espera. Agora há `background-size/position/repeat`
   explícitos (`auto` / `0 0` / `no-repeat`), e a medida é `auto` com a lavagem
   contínua.
2. **A entrada cobria a própria ambiência.** O `.arena-bg` da tela de entrada
   pintava um `#f8faff` **opaco** com grade de pontos de 26 px por cima do
   gradiente da página: sobrava "fundo branco com bolinhas" nas bordas do
   cartão. O elemento continua na marcação (posiciona o cartão) e não pinta mais.
3. **O número da nota aparecia atrás do disco do anel.** O disco branco é
   `position: absolute` e pinta depois de qualquer filho em fluxo; o valor não
   tinha `z-index` (a unidade tinha). Só aparecia o que **transbordava** — a
   medição de pixels do PNG pegou duas faixas verdes de 13 px e 6 px coladas na
   aresta esquerda. Além disso, "50,88 PTS" a 32 px mede ~171 px e quebrava em
   duas linhas dentro do anel de 132 px. Agora o valor tem `position: relative;
   z-index: 1` e o tamanho vem de consulta de contêiner (`clamp(17px, 15cqw,
   30px)`), então **o pior caso real cabe**: "99,99 PTS" mede 103 px no disco de
   114, em UMA linha, centrado — e 99 px de glifos verdes efetivamente pintados.

No caminho, um defeito de outra natureza: uma **crase dentro de um comentário
HTML** no `index.mjs` fechava o template literal da página e derrubava 25 arquivos
de teste de uma vez. O portão que pegou isso foi a própria suíte (todo arquivo
importa o módulo); o conserto foi tirar as crases do comentário.

### Medições desta rodada (`medida.json`, 102 propriedades)

| Tela | Alvo | Propriedade | Antes | Depois |
|---|---|---|---|---|
| 12-espera | `.arena-lobby` | `backgroundSize` / `position` | `34px 35.5px` / `19px 20px` | `auto` / `0% 0%` |
| 13-missão | `.arena-field` | `display` | `flex` | `grid` |
| 13-missão | `.arena-counter` | `textAlign` / `fontFamily` | `left` / sans | `right` / JetBrains Mono |
| 13-missão | `.round-submit-row` | `display` / `justifyContent` | `block` / `normal` | `flex` / `flex-end` |
| 13-missão | `.arena-attempts` | `margin` | `12px 0 16px` | `0px` |
| 14-resultado | `.arena-score-ring strong` | `fontSize` / `whiteSpace` | `32px` / `normal` | `19.8px` / `nowrap` |

A régua da listra foi conferida **no arquivo**, não no olho: período horizontal de
**90,5 px** nas capturas de 1440 e de 390 (passo de 32/64 px a −45°, fixo), que é
exatamente o `repeating-linear-gradient` do `arena-stripes-bg` da referência.

### Portões desta rodada

`npm test` → **510 testes, 0 falha**; portões de CSS → **47/47** com o piso de
contraste **5,08** intacto (220 pares) e o cartório de mortas **sem diff** (duas
declarações minhas nasceram mortas e foram removidas, não registradas);
`npm run test:browser` → **28/28** com `render.json` regerado; capturas → **102
propriedades** mudadas, 27 telas por modo.

### Decisão declarada desta rodada

- **O número dentro do anel é do tamanho do pior caso.** O texto que o cliente
escreve ("N PTS") é contrato de teste, e o valor real em pt-BR é longo ("50,88
PTS"). Para caber no disco de 114 px sem quebrar linha, ele lê a ~20 px em vez
dos 36 px da referência — que desenha um inteiro de dois dígitos. Preferi número
menor e sempre legível a número grande que quebra; o anel de 132 px e o texto
seguem os mesmos.

## Rodada 4 (mesmo dia) — a SALA EM DESTAQUE (LA-06)

O pedido veio com a tela da referência: a sala em destaque, com o cabeçalho de
dois selos, as duas colunas (acesso à esquerda, partida à direita) e a faixa de
indicadores embaixo. É a tela onde o professor passa a aula, e três decisões
diferentes moravam nela misturadas.

### O que mudou

**Cabeçalho.** Os dois selos subiram para cima do título — `SALA EM DESTAQUE` e o
do estado, que o cliente escreve (antes o estado dividia a linha dos números:
dois dados de naturezas diferentes na mesma frase). O título é um `h1` em Space
Grotesk (34 px), a linha de dados vem em seguida em mono tabular
(`N participantes • N conectados • Rodada N de M`) e as ações formam **uma
família de pílula** com uma única primária azul (`Ver na TV`) e as destrutivas
reconhecíveis (`Encerrar sala`). Os rótulos estão na mesma ordem da referência.

**Duas colunas.** O acesso é o cartão da esquerda: rótulo em mono, código em
mono azul a 50 px, os dois botões de copiar, o QR rotulado (`ACESSO RÁPIDO`) e a
projeção como pílula primária de largura inteira. A partida é o cartão da
direita: chip do preset e `N de M lugares` na mesma linha, a regra da sala sob um
fio, a rodada no ar em cartão interno (quando existe) e a próxima missão ao lado
da ação. A moldura dupla do cockpit saiu: agora é um cartão por coluna.

**Faixa de indicadores (só no modo Arena).** Juiz/Boss com os corações e a
legenda, energia da turma com a barra, e acerto da turma — três cartões tintados,
lado a lado, exatamente onde a referência os desenha. Em sala do preset
Personalizado a faixa **não entra**: não há dado para ela, e nada foi inventado.

**Roteiro de missões em linhas.** Cada missão é `número · título · status ·
modalidade e duração · ações`, com a imagem de referência em miniatura à
esquerda; o que a missão tem de peso (o aluno recebe, gabarito, envios, ranking)
continua nas dobras logo abaixo. Era grade de cartões de altura fixa.

### O defeito que a captura pegou: o mesmo número duas vezes

A faixa de indicadores nasceu duplicando os quadros do painel do modo Arena
(`☠️ JUIZ IA`, `⚡ ENERGIA DA TURMA`, `DANO`), que ficam logo abaixo — vistos na
mesma dobra, com os mesmos corações e a mesma energia. Pela regra da casa (o
mesmo número dito duas vezes na mesma tela não informa nada), o painel perdeu a
tríade e ficou com o que só ele dizia, numa linha: `N poder(es) disponível(is) ·
N de M ataques nesta rodada · DANO N% de acerto`. As três caixas e as suas regras
saíram de `arena.css` junto com o markup — nenhuma classe ficou órfã (o portão de
classes vivas não teve o que condenar).

### Portões desta rodada

`npm test` → **510 testes, 0 falha** (um teste de temporizador da fila de notas
falhou uma vez na primeira passada e passou nas duas seguintes, isolado e no
conjunto: intermitência de relógio, não regressão); portões de CSS → **47/47**
com o piso de contraste **5,08** intacto (236 pares conferidos, +17 dos cartões e
pílulas novos) e o cartório de mortas **sem diff**; `npm run test:browser` →
**28/28** com `render.json` regerado (o painel do professor ganhou dois elementos
na casca: o selo do estado e o parágrafo da linha de dados).

Duas asserções do teste do modo Arena foram **apontadas para a superfície nova**,
com o motivo escrito na linha: `/JUIZ IA/`, `/ENERGIA DA TURMA/` e `/derrotado/`
descrevem o que o professor precisa ver, e o que mudou foi onde — da caixa do
painel para a faixa do cartão. A pergunta da guarda continua a mesma.

### Medições desta rodada (`medida.json`, 170 propriedades)

| Tela | Alvo | Propriedade | Antes | Depois |
|---|---|---|---|---|
| 07-detalhe | `.arena-detail-head-bar h1` | `fontFamily` / `fontSize` | sans / `16px` | Space Grotesk / `34px` |
| 07-detalhe | `.arena-detail-state` | `display` / `borderRadius` | `inline` / `0` | `flex` / `999px` |
| 07-detalhe | `.arena-detail-access` | `backgroundColor` / `borderRadius` | transparente / `0` | `#f7f9ff` / `16px` |
| 07-detalhe | `.arena-detail-pin strong` | `fontSize` / `color` | `34px` / `#071f49` | `50px` / `#0052cc` |
| 07-detalhe | `.arena-rounds-grid` | `gridTemplateColumns` | `333px ×3` | `1020px` |
| 07-detalhe | `.arena-round-row` | `display` / `gap` | `block` / `normal` | `flex` / `14px` |
| 07b-arena | `.arena-detail-stats` | `display` / `gridTemplateColumns` | `block` / `none` | `grid` / `204px ×3` |
| 07b-arena | `.arena-stat-card.is-boss` | `backgroundColor` / `borderTopColor` | transparente / `#e5e7eb` | `#fdf3f4` / `#f6d5da` |
| 07b-arena | `.arena-stat-card > strong` | `fontFamily` / `fontSize` | sans / `16px` | JetBrains Mono / `26px` |

O roteiro de captura ganhou **duas telas** (`07b`, a sala do modo Arena, única
com a faixa de indicadores, e `07c`, o roteiro de missões rolado até a seção) e um
parâmetro novo, `rolar`: o retrato é da **dobra**, e sem ele a região abaixo de
900 px não aparecia em captura nenhuma.

### Decisões declaradas desta rodada

- **O QR continua sendo gerado na hora.** Ele só aparece em sala `waiting`,
`open` ou `playing`, e agora tem rótulo. Em sala de outro estado a referência
desenha um QR demonstrativo; aqui não se inventa código.
- **A seção de missões se chama `Missões`, não `Roteiro de missões`.** O desenho é
o da referência (linhas, com a ação à direita), mas o `arena.js` está **no teto de
palavras** (`1346 = teto`, sem folga): o título novo custaria 3 palavras e o
subtítulo da referência outras 6, de prosa explicativa. O rótulo que já existe
diz o mesmo, e o botão `+ Adicionar missão` mudou de lugar para o cabeçalho da
seção, onde a referência põe o dela.
- **A faixa de indicadores mora no cartão, e a frase longa continua no painel.**
Os rótulos novos (`JUIZ IA`, `ENERGIA DA TURMA`, `ACERTO DA TURMA`) caem no furo
já declarado no cartório de cópia — literal dentro de `${...}` de um template não
entra na conta. O medido **não subiu**: entraram 6 palavras contadas e saíram 6 (o
link virou `Copiar link` e o aviso de imagem ausente perdeu a explicação). Está
escrito na `nota` do cartório, com o número do furo à vista.

## Rodada 5 (mesmo dia) — o portão de estilo passa a enxergar a SALA EM DESTAQUE

A rodada 4 terminou declarando um buraco: o portão de estilo do navegador
fotografava só a **casca** do detalhe (`240 → 242` elementos), e tudo o que ela
construiu — as duas colunas, a faixa de indicadores, as linhas de missão — ficava
fora da régua. Agora não fica.

### O que o portão passou a fazer

Duas telas novas, cada uma em 1440 e em 390 — **478** e **489** elementos contra
os 242 do painel:

| Tela | Estado | O que entra na régua |
|---|---|---|
| `sala-em-destaque-em-espera` | sala publicada, aguardando | `.arena-cockpit` com as duas colunas abertas (`arena-detail-access` / `arena-detail-match`), o PIN a 50 px, o chip de tempo, a faixa de indicadores e as 2 linhas de missão |
| `sala-em-destaque-em-jogo` | a mesma sala, missão aberta | as duas colunas dentro do `details.arena-invite-fold`, o `article.arena-detail-current is-open` (a rodada no ar) e o cronômetro correndo |

A tela não tem URL própria — quem escolhe a sala é o cliente, ao clicar —, então
o portão faz **o gesto do professor**: espera o cartão da sala na lista, clica em
`Ver sala` e só fotografa quando a tela tem o que mostrar (o cabeçalho, as linhas
de missão e o QR do convite, que chega numa segunda requisição). Sem a espera do
QR, o retrato podia pegar a tela no meio e a diferença de `display` reprovaria o
portão sozinha.

### Duas salas, e não uma

A sala que já começou **não volta** a "aguardando", e cada tela do portão precisa
de um estado só. Por isso são duas salas: a publicada e aguardando, e a mesma
coisa com a missão aberta — a segunda leva `arena_set_round_times` (300 s) antes
de publicar, porque o ajuste de tempo é recusado com a sala em jogo. De brinde, as
duas variantes do cronômetro entram no retrato: `.arena-round-timer` na sala em
jogo e `.arena-round-timer.is-untimed` na que só espera. As duas salas usam **as
mesmas duas missões**: no produto o desafio vive numa biblioteca e a sala o
referencia, e inventar missões novas faria o painel crescer por um motivo que não
é o que a régua mede.

### O que isso mexeu nas telas de antes

Comparação byte a byte contra o instantâneo anterior (medida com o arquivo de
teste de antes do portão, no mesmo código de produto): das 18 telas antigas, **16
ficaram idênticas** — inclusive a projeção da TV, a entrada do aluno e as prévias,
que continuam na sala publicada e aguardando. Mudaram duas, e pelo mesmo motivo
declarado: agora existe uma segunda sala.

| Tela | Antes | Depois | Por quê |
|---|---|---|---|
| `painel-do-professor` | 242 | 262 | **+20**: o cartão da segunda sala na lista |
| `relatorio` | 253 | 305 | **+52**: a página do relatório é montada a partir das salas e das missões |

### Portões desta rodada

`npm test` → **510 testes** (509 passam, 1 pulado), **0 falha**; `npm run
test:browser` → **28/28** em **4m16s** (o teste do retrato de estilo passou de 38 s
para 46 s com as 4 capturas novas, contra o teto de 240 s do próprio teste). O
instantâneo `test/css/render.json` foi regerado e a passada seguinte — **sem
`UPDATE_CSS_BASELINE`** — ficou verde: as telas novas são determinísticas, e o
portão não vai ensinar ninguém a rodar de novo até passar.

## Rodada 6 (mesmo dia) — a PROJEÇÃO DA TV na régua, e o que ela não desenha

A projeção entrava no retrato só na sala publicada e **aguardando** (71
elementos, o palco de espera). Agora a régua tem os três estados que a TV sabe
desenhar, e a contagem de telas vai de 22 para **26**:

| Tela | Sala | O que entra na régua |
|---|---|---|
| `projecao-da-tv` | publicada, aguardando | o palco de espera (inalterado, byte a byte) |
| `projecao-da-tv-rodada-viva` | publicada, rodada aberta (300 s) | **52** elementos: `.arena-tv-round`, a fita, o cabeçalho, o **`.arena-tv-timer` no alto** e a faixa compacta do Juiz (`.arena-tv-mode is-strip`) |
| `projecao-da-tv-placar` | publicada, rodada fechada com 3 notas | **85** elementos: `.arena-tv-results`, o cabeçalho, o **placar** (`.arena-tv-rank-list-large`, 4 linhas `pos-1..4`, com medalha de ouro/prata/bronze/fita e a primeira marcada `is-champion`) |

### O achado: rodada viva não tem placar na projeção

A sonda (fora do navegador, no mesmo app do portão) mostrou o payload da TV com
a rodada aberta: `phase: playing`, `current_round` presente e **`ranking: []`** — e
o markup do estágio de rodada não chama o placar em lugar nenhum. Ou seja: um
placar no ar durante a rodada só existe na **referência** (a LA-09 desenha
“Líderes do Round” ao lado da missão). Não é buraco de portão, é desenho que a
projeção ainda não tem — e por isso o placar entrou na régua no estágio em que o
produto **o desenha**: o resultado da rodada, dentro da mesma sala viva.

### A terceira sala

O placar precisa de nota, e nota precisa de envio. A sala do placar é publicada
com tempo, recebe 4 alunos, tem a **rodada 1 aberta e fechada** com 3 envios
pontuados. Duas coisas fazem isso caber num portão determinístico: a nota sai **na
própria requisição do envio** (os três envios somaram 49 ms — nada de esperar
fila), e tudo acontece **antes da primeira captura**: o portão fotografa estado
parado, nunca um placar se montando.

### O que isso mexeu nas telas de antes

| Tela | Antes | Depois | Por quê |
|---|---|---|---|
| `projecao-da-tv` | 71 | 71 | **igual, byte a byte**: a sala 1 não mudou de estado |
| `painel-do-professor` | 262 | 282 | **+20**: o cartão da terceira sala |
| `sala-em-destaque-em-espera` / `em-jogo` | 478 / 489 | 498 / 509 | **+20 cada**: o detalhe é o painel com o detalhe aberto, então a lista de salas de baixo entra na foto |
| `relatorio` | 305 | 608 | **+303**: o relatório deixou de estar vazio — 29 `tr`, 261 `td`, com as tabelas de nota e de comparação preenchidas |

O relatório é o efeito colateral grande, e ele é ganho de cobertura: com sala
pontuada, as tabelas de nota deixaram de ser estado vazio, coisa que nenhuma
tela do retrato mostrava antes.

### Portões desta rodada

`npm test` → **510 testes** (509 passam, 1 pulado), **0 falha**; `npm run
test:browser` → **28/28** em **4m19s**, com o instantâneo regerado e a passada
seguinte **sem `UPDATE_CSS_BASELINE`** verde — as duas telas novas são
determinísticas. O teste do retrato de estilo saiu de 46 s para **55 s** com as 4
capturas novas (teto de 240 s do próprio teste).

## Rodada 7 (mesmo dia) — a fita da TV: uma só, e a ponta no canto

Duas queixas do dono do produto, e a segunda custou duas tentativas.

**1. "Remova o de cima."** A projeção tinha **duas** fitas: a de
`.arena-tv::before`, uma tarja de 10px colada na borda de cima da janela, acima do
cabeçalho, e a da aresta do palco. A de cima saiu — sobrou a do palco, que é a
que tem um cartão para seguir.

**2. "O círculo está mau feito, ficando em cima da parte branca."**

O palco é um cartão de raio 28px com 4px de moldura branca, **sem
`overflow: hidden`** (decisão declarada: o conteúdo do palco se mede em vh/vw e
recortar ali esconderia o que se lê de longe). A fita é um `::after`
absolutamente posicionado, e sem raio nenhum a ponta dela terminava em canto reto
por dentro da curva. A **primeira** tentativa foi dar à fita o raio de dentro:
`border-radius: calc(var(--la-radius-card-lg) - 4px) ... 0 0`.

Foi insuficiente, e a prova que apresentei era falsa. `getComputedStyle`
devolve o valor **declarado** (`24px`) e a foto de 4x parecia boa — mas a tarja tem
**10px de altura**, e num box de 10px o CSS **reduz os raios verticais para caber**
(CSS Backgrounds §5.5: a soma dos raios de cada lado não pode passar do lado).
24 + 0 > 10 → o raio era **pintado com 10px**. A fita continuava a invadir a
moldura na quina.

**Como isso foi medido**, já que o computed style mente: a sonda
`tmp/qa/fita-tv/mede-canto.mjs` fotografa o canto a **4x**, decodifica o PNG com
`pngjs` e acha, em cada linha, o primeiro pixel de fita (amarelo `#ffd000` ou
tinta `#1c1917`) — comparando o perfil com os dois arcos possíveis.

| linha (px do canto) | pintado | arco de raio 24 | arco de raio 10 |
|---|---|---|---|
| 4,13 | **13,00** | 25,55 | 12,42 |
| 5,13 | **9,50** | 20,74 | 9,39 |
| 8,13 | **6,00** | 14,55 | 5,91 |
| 13,13 | **4,00** | 9,17 | 4,04 |

O perfil pintado **é** o arco de 10px. Na linha de cima a fita começa em 13px onde
o arco verdadeiro estaria em 25,5: são ~12px de moldura branca cobertos por ela —
exatamente a quina do print do dono do produto.

**O conserto.** A fita deixa de ser uma tarja de 10px e passa a **vestir a caixa
inteira do palco**, pintando só a faixa de cima:

```css
  top: 0; right: 0; bottom: 0; left: 0;   /* a caixa do palco, não uma tarja */
  background-size: 100% 10px;             /* a fita continua com 10px */
  background-repeat: no-repeat;
  background-position: top;
  border-radius: calc(var(--la-radius-card-lg) - 4px) ... 0 0;
```

Com a caixa alta o raio **não é escalado**, e é a curva do box que recorta a
tarja. Medido em pixel, o preenchimento passa a seguir o arco de 24 dentro de
meio pixel em todas as linhas (25,25 / 22,50 / 21,00 / … / 8,75 contra 25,55 /
22,56 / 20,74 / … / 8,78) — e a faixa continua com **10 CSS px** de altura.

**O que NÃO tinha o defeito.** As outras fitas — `brand-tape` do portal, da
entrada do aluno, do cartão de login e do painel de missão — desenham por
*padding* + `overflow: hidden` no cartão, que recorta a ponta na própria curva;
não têm raio declarado para ser escalado. Este defeito é filho do jeito do palco
(raio sem recorte), não do componente.

**Portões.** `npm test` → **510 testes** (509 passam, 1 pulado), **0 falha**;
`npm run test:browser` → **28/28** em **4m22s**; portões de CSS → **47/47**. O
portão de **cascata** acusou as duas mudanças nomeando cada uma — no `::after`,
`height: 10px → (ausente)`, `bottom`, `background-size/repeat/position`; e
`||body[data-page='tv'] .arena-tv::before` **seletor desapareceu** — e o cartório
foi regerado com a prova em mãos. `mortas.json` ficou **sem diff**: a declaração
nova não é morta, e a folha que saiu não deixou classe órfã.

## Como olhar

```bash
PORT=3000 npm start        # portal em http://localhost:3000
node output/qa/redesign-capturas.mjs
node tmp/qa/revisao-lac06.mjs   # página antes/depois para o Preview
```
