# Sala em destaque — ciclo de correção pelo print (21/09/2026)

Método: o mesmo que um professor faria. Servidor real com uma sala de quatro missões,
três alunos e **rodada viva**, login pela tela, clique na sala, foto em seis larguras,
comparação com o print anexado (`simulacao.html` / prints 1 e 2), correção, nova foto.
Tudo medido no navegador, não deduzido.

## 1. O que estava quebrado (medido antes de mexer)

| Defeito | Medida de entrada | Causa comprovada |
| --- | --- | --- |
| A linha de comando do cabeçalho empilhava os botões à direita, com um vão morto à esquerda | `.arena-detail-command` 1056×134, `display: grid`, `flex-direction: column`, `padding-right: 94px`; "Pausar missão" e "Encerrar rodada" a 1047 px em duas linhas | a linha era a **grade dos ladrilhos** de uma versão em que a AÇÃO DA VEZ morava nela (trilha de 3 colunas); a ação desceu para o palco da partida e a grade ficou sem o ladrilho que a justificava |
| As duas gavetas da linha (controles da batalha e o que fecha a conta) não existiam como caixa | `.arena-hero-actions` 0×0, `.arena-room-danger` 0×0, filhos em x=1047 | `display: contents` dissolvia as duas: cada botão virava item da grade, em trilha própria |
| A fileira de botões não cabia em 1024/768/390 | 5 botões em pilha vertical | a gaveta dos controles tinha `max-width: 430px` da época em que era grade de duas colunas |
| O cartão do código era navy com o PIN em ouro | `background: rgb(6, 24, 60)` | decisão da LA-09, contra o print, que desenha o acesso no cartão azul-claro com o PIN em azul cheio |
| O CTA da projeção não era o azul cheio do print | computado `background: rgb(242, 246, 253)`, tinta azul | perdia para `.arena-hero-action` (fundo claro, tinta azul, `!important`) |
| O selo da sincronia caía numa terceira linha, sozinho, na ponta | `.arena-workbench-sync` em y=237, abaixo de tudo | a linha de números virava 1056 px por causa do chip do cronômetro (331 px) e empurrava o selo para baixo |
| Cada missão do roteiro ocupava 214 px | 4 missões = 878 px | as duas dobras (o que o aluno recebe / gabarito do juiz) traziam borda e respiro próprios, empilhadas |
| O número da missão caía ao lado do estado, não do título | fundo do cartão (214 px) com número centrado | `align-items: center` numa linha de quatro degraus |
| O sorteio punha o cabeçalho numa trilha de 337 px | "Sorteio da vez" com o subtítulo quebrado em duas linhas e a contagem na ponta de baixo | grade de três colunas do plano LA-06 |
| No celular, o selo da sincronia passava por cima do chip do cronômetro | chip do cronômetro cortado na borda | duas colunas na linha de números em 390 px |

## 2. O que mudou

- **Marcação** (`src/web/pages/index.mjs`): a porta do aluno ganhou slot próprio na linha dos
  selos (`[data-arena-chips-doors]`); a porta da TV continua na fila dos comandos.
- **Cliente** (`public/assets/js/arena.js`): `renderTopbarQuick` escreve cada porta no seu lugar;
  o cabeçalho do sorteio ganhou o ladrilho do ícone e a linha de apoio do print.
- **Folha** (`public/assets/css/refinement.css`): a linha de comando virou **fila de pílulas**
  (de `display: grid` para `flex`), as gavetas voltaram a ser caixas de verdade, o cartão do
  acesso virou o do print, o CTA da projeção ganhou o azul cheio, a linha de números e o selo
  dividem duas colunas (uma no celular), o roteiro foi compactado (as duas dobras viraram duas
  pílulas na mesma linha, o número subiu para a linha do título) e o sorteio ganhou as áreas do
  print (cabeçalho inteiro em cima, ação na ponta da linha dos seletores).

## 3. Medidas de saída

| Medida | Antes | Depois |
| --- | --- | --- |
| Linha de comando em 1440 | 1056×134, 2 faixas, botões à direita | **1056×38, 1 faixa, à esquerda** |
| Linha de comando em 1920 / 1180 | 2 faixas | **1 faixa** |
| Altura da sala em jogo em 1440 | 2580 px | **2319 px** |
| Roteiro de missões | 878 px (214 por missão) | **638 px (159 por missão)** |
| Cartão do acesso | navy `#06183c` | `#eef4ff` com PIN `#0b3f9e` |
| Rolagem lateral nas seis larguras | não | não |
| Erros de página | nenhum | nenhum |

## 4. Evidências

- `output/ciclo-01…ciclo-final/evidencias/` — as seis larguras antes e depois.
- `output/rolagem-01…03/evidencias/degrau-*.png` — o painel em degraus de rolagem (roteiro,
  sorteio, participantes), que a foto de página inteira não alcança porque o painel rola por dentro.
- `tmp/qa/pista-cabecalho.mjs` — a sonda que diz **qual regra vence** cada peça do cabeçalho
  (foi ela que achou o `display: contents`, a grade e o `max-width: 430px`).
- `tmp/qa/ref-print.mjs`, `tmp/qa/ref-rolagem.mjs` — as duas sondas de foto.

## 5. Estado dos portões

- `npm test`: **verde** em cascata, contraste, mortas (zero — a única morta que esta rodada
  criou, o `display` do cabeçalho em duas regras, foi cortada na origem), cópia por tela e
  íntegridade, com o instantâneo de cascata/contraste **regravado** nesta rodada
  (`UPDATE_CSS_BASELINE=1`) e conferido depois sem a variável.
- **Dois vermelhos, anteriores a esta rodada** (a rodada anterior foi interrompida no meio, e
  nada do que esta rodada tocou produz estes números):
  - `copia: nenhuma tela viva passa do orçamento` — `arena.js` com 1873 palavras contra o teto
    de 1808. Esta rodada acrescentou 9 (a linha de apoio do sorteio, que é copy do print); as
    outras ~56 vieram do trabalho não confirmado que já estava no disco.
  - `css: nenhuma folha viva tem seletor de classe sem produtor` — 160 seletores sem produtor
    (`.arena-admin-tools`, `.arena-fold-block` e a família do menu `•••`, retirado do cliente
    numa rodada anterior sem que o CSS dele saísse junto). As três classes que esta rodada
    criou (`.arena-chips-doors`, `.arena-draw-icon`, `.arena-draw-title`) **não** aparecem na
    lista: nasceram com produtor na marcação e no cliente.
  - Três testes de navegador (`sala-em-destaque`, `sala-indicadores`, `painel-estado`) ainda
    esperam a **grade de ladrilhos** e a AÇÃO DA VEZ dentro de `[data-arena-detail-body]`, isto
    é, o desenho anterior a esta rodada; um deles nem chega à asserção (espera 62 s por
    `.arena-detail-columns`, que não existe mais).
  - O cartório de **render** (`test/browser/css-render.test.mjs`) também não chega a medir: ele
    espera `[data-arena-detail]:not([hidden]) .arena-detail-head`, e a marcação de hoje tem
    `data-arena-detail-head` **atributo** na `header.arena-detail-head-bar` — o seletor de
    classe é de uma casca anterior. Sem essa espera, não há como dizer se alguma tela mudou de
    estilo; é o primeiro conserto da próxima rodada.
