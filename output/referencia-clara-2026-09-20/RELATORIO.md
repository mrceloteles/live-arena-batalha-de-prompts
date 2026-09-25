# A sala em destaque no desenho da referência clara — 20/09/2026

## O pedido

A sala em destaque devia ficar **igual ao arquivo anexado** (`stitch_light_mode_design_system`),
no tema claro, mantendo o Live Arena — e com o botão de iniciar.

## O que a referência tem, peça por peça, e o que existe agora

| Peça da referência | Antes | Agora |
|---|---|---|
| Cabeçalho do cartão: selo do código à esquerda, título no meio, QR e portas à direita | já existia (LA-10) | igual |
| Fita de sinal (amarela e escura) no topo do cartão | já existia | igual |
| Faixa de quatro indicadores, com o cartão da rodada em navy | já existia (LA-09) | igual |
| **Seção "Comandos de batalha em tempo real", com selo de sincronia** | não existia: os ladrilhos ficavam soltos sob a faixa | **título + selo do estado da conexão + ladrilhos com ícone em cima e dica** |
| **"Participantes conectados" aberta, com selo do juiz e filtros** | era uma dobra fechada em jogo, sem filtros | **aberta por padrão, selo do juiz, quatro filtros do cliente** |
| **Missão em foco no alto da coluna da direita (imagem, missão, gabarito)** | a missão no ar era uma linha dentro do cartão da partida, sem imagem | **cartão próprio (`arena-mission-now`)** |
| **"Fila de desafios da batalha"** | chamava-se "Missões" | **nome da referência** |
| Botão grande de começar | já existia (LA-10), num ladrilho de 470 px | **largura inteira do cartão** |
| Fundo escuro `#080C16`, fita amarela/preta como enfeite, neon, HP/dano/boss | — | **recusado**: é a identidade da referência, não a do Live Arena. A fita do topo ficou (é a mesma do cartão), o resto não |

## O defeito que a mudança criou e como foi encontrado

Depois de acrescentar `filtroDeAlunos` e `conexaoAoVivo` ao objeto `state`, uma
edição deixou `folds: new Map(),` **dentro do comentário da linha de cima** — a
chave saiu do objeto e `state.folds` passou a ser `undefined`. O sintoma não foi
um erro no console: a tela mostrou **"Cannot read properties of undefined
(reading 'get')"** num alerta do navegador, e o alerta **trava o renderizador** —
o portão de navegador inteiro ficou preso em `Runtime.callFunctionOn timed out`
(180 s por teste) e as capturas saíam em branco. A causa foi achada com uma
sonda instrumentada (`tmp/qa/sonda-loop.mjs`) + o depurador do CDP: o
`Debugger.pause` também estourava o tempo, o que só acontece com a linha de
execução bloqueada; a mensagem do alerta no navegador do usuário fechou o
diagnóstico. Correção: a chave de volta no objeto (`arena.js`, linha 1960).

## Portões

| Portão | Resultado |
|---|---|
| `npm test` | **539 passam · 0 falham · 1 pulado** |
| `npm run test:browser` | **41 passam · 0 falham** (a suíte inteira, com o instantâneo de estilo regravado e conferido depois) |
| Cartórios de CSS (`cascata`, `render`, `contraste`) | regravados: 1 seletor alterado (`grid-template-columns` da bancada), 9 removidos (superfície morta), 9 novos (`::after` das dicas + colunas) |
| `copia/orcamento.json` | teto do `arena.js` **1743 → 1768** (+25 palavras), com nota escrita: são rótulo (título da bancada, filtros, nome da fila) e frase de estado (selo da sincronia, selo do juiz), não prosa |

Duas coisas que a suíte cobrou e que valem o registro:

1. O gabarito do juiz **não fica aberto** no cartão da missão em foco, mesmo com
a referência o mostrando assim: o portão do painel exige que ele fique a um
clique ("o gabarito não ocupa a tela antes de ser pedido"), porque o professor
projeta o próprio painel. Ele virou uma dobra com a alça "Gabarito" — mesmo
desenho, mesma informação, um clique.

2. O portão `test/browser/painel-controles.test.mjs` foi ajustado numa coisa: ele
afirmava que a lista de participantes **começa fechada** em jogo. Ela agora
começa aberta (é o desenho da referência), então o passo passou a medir o que
importa — a escolha do professor sobrevive ao redesenho **nos dois sentidos**
(fechar continua fechado; reabrir continua aberto).

## Onde estão as provas

- `evidencias/folha.html` — folha de contato, 12 prints, abre direto no navegador.
- `evidencias/01..08` — lobby, em jogo e as peças de perto.
- `evidencias/09-em-jogo-{1280,1024,768,390}.png` — as quatro larguras do plano.
- `tmp/qa/sonda-loop.mjs`, `tmp/qa/sonda-painel.mjs` — as duas sondas do defeito.
- `tmp/qa/captura-corpo-referencia.mjs` — o roteiro que produz os prints.
