# A sala em destaque olhada com régua de desenho (Apple HIG) — 20/09/2026

Auditoria de desenho da **área da sala selecionada** no painel do professor, feita no
servidor real (`127.0.0.1:3000`), com a sala *Aula em jogo* (`SXZZ87`) aberta. Nada de
batalha, API, SSE, autenticação, ranking, aluno ou telão foi tocado: só a folha de
estilo da sala e a régua que a mede.

## 1. A régua que usei

Não fui "olhar e achar". Escrevi uma sonda (`tmp/qa/sonda-olhar.mjs`) que entra no
painel com a senha do `.env` (lida, nunca escrita), abre a sala e, em **seis larguras**
(1920, 1440, 1280, 1024, 768, 390), faz as quatro perguntas que o olho faz antes de
qualquer crítica:

| pergunta | o que ela mede |
| --- | --- |
| COLADO | irmãos de texto encostados (folga < 2 px na mesma linha) |
| VAZIO | caixa visível que não mostra nada |
| TOQUE | alvo interativo abaixo de 44 px (celular) / 30 px (mouse) |
| ROLAGEM | rolagem lateral, e a tabela rolando por dentro do cartão |

E, além das quatro, a **escala tipográfica que a tela realmente usa** (só texto direto,
não herdado), com um **exemplo por degrau** — porque número solto vira palpite.

Referências de desenho usadas como régua externa: a Human Interface Guidelines da
Apple — **44×44 pt** de alvo de toque no iOS, "**poucos estilos e tamanhos**" de tipo,
legibilidade como piso, e hierarquia feita de tamanho e peso, não de exceções. As
páginas da HIG são renderizadas no cliente; li o que elas dizem pelas súmulas oficiais
de busca e pela página de *layout* já lida nesta sessão.

## 2. O que a régua acusou, e o que ficou no lugar

### 2.1 Alvo de toque — o defeito maior

Em **390 px**, a sala tinha **14 alvos abaixo de 44 px**: os três botões de gestão
(36 px), as pílulas do sorteio (30), os filtros de alunos (30), as ações da linha
(30), o campo "quantos por vez" (40), as prévias (38), o *Encerrar sala* do menu (40),
o selo do tempo da aula (24) e as **alças das dobras (16 e 19 px)** — a alça da lista
de participantes media 19 px de altura.

Correção: um **piso declarado por nome** de controle no celular (44 px) e, no desktop,
o piso da casa (30 px) — com o selo do tempo e as alças subindo para ele.

Prova por reversão, na própria sonda: com o piso ligado, **0 alvos** abaixo de 44 px em
390; desligando o piso em memória (só nesta página, nada no disco), a contagem volta a
**28**. Os 28 estão no relatório bruto, com nome e altura.

### 2.2 Um botão que cresce depois de já estar na tela

A sonda apontava o item do menu do ••• medindo **40 px** e o cartório da cascata dizia
**44 px**. Nenhum dos dois estava errado: a transição da casa é `transition: all .15s`,
então o `min-height` que o piso acabou de impor **animava** de 40 para 44 — a leitura
caía no meio e pegava **40,4505 px** (cinco amostras, com recálculo forçado, mostraram
a transição assentando em 44 na quarta).

Correção: na sala, transição continua existindo, mas **medida e posição não animam**
(`transition-property: color, background-color, border-color, box-shadow, opacity,
transform`). Um elemento que muda de tamanho depois de estar pintado é o tremor que se
vê sem saber nomear.

### 2.3 A escala de tipo, com o exemplo de cada degrau

A sala usava **16 degraus** numa tela só. Conferi cada um antes de encostar:

- **`13.5px`, `750`, `900` são da casa** — aparecem em `design.css`/`arena.css` e em
  outras partes do próprio refinement. Não são acidente desta tela e **não mudam**.
- **Dois valores só existiam aqui e a escala não explicava:**

| o que era | antes | agora | por quê |
| --- | --- | --- | --- |
| rótulo "Próxima ação" (`.arena-state-cell > small`) | **9 px** | **10,5 px** | era o **menor texto da tela** e é justo o que responde "o que eu faço agora"; entra no degrau de sobrancelha que a sala já usa |
| título da missão (`.arena-mission-now h4`) | **18 px** | **20 px** | o 19 px da tela é o "valor em palavras" ("pausada"); o título estava **1 px abaixo** dele — ou seja, no mesmo degrau |

As duas mudanças foram feitas **na declaração de origem**, não por cima: uma regra nova
que só vence deixaria a antiga nascendo morta, e a catraca do projeto cobra exatamente
isso.

### 2.4 O que a régua já dizia bem

- **0 textos colados** nas seis larguras.
- **Uma única margem esquerda** por largura (362, 276, 276, 275, 23, 16) — o conteúdo
  não passeia.
- **Ritmo de 24 px** entre as seções, sempre o mesmo (24, 24, 24, 24).
- **0 rolagem lateral** em todas; a tabela de participantes não rola mais por dentro.
- **0 erro de página** no console durante as seis capturas.

## 3. O instrumento também precisou de conserto

A régua do "VAZIO" acusava **cinco caixas vazias por tela** e nenhuma era defeito: a
imagem do QR (o `src` chega em ~1,2 s e, enquanto decodifica, não tem texto nem filho),
os campos (o **valor** não vive no `textContent`), o `<th>` da coluna de ações e os
pontos de 7 px desenhados por cor de fundo. **Régua que grita lobo ensina a ignorar a
régua.** O teste passou a ser: este nó **pinta** algo além da própria caixa? (imagem com
`src`, campo, gradiente, marca pequena com fundo, célula de tabela contam como
conteúdo). Depois disso: **0 vazios** nas seis larguras.

O QR foi conferido à parte (`tmp/qa/sonda-qr.mjs`): ele começa `hidden`, o `src` chega
em ~1,2 s (`data:image/png`, 480×480) e a URL do aluno aparece junto — **não** é caixa
morta.

## 4. Portões

| portão | resultado |
| --- | --- |
| `npm test` | **539 passa · 0 falha** (regravado na rodada com `UPDATE_CSS_BASELINE=1`); na última passagem, 538/1 — a **falha intermitente conhecida** do estacionamento do juiz, que passou **isolada 10/10** na mesma rodada |
| `npm run test:browser` | **42/42** |
| catraca das declarações mortas | **verde** — e verde porque as duas mudanças foram para a origem, não porque registrei as mortas |
| cartórios regravados | `test/css/cascata.json`, `test/css/contraste.json`, `test/css/render.json`, `test/browser/css-render.test.mjs` |
| orçamento de cópia | **intocado** (`test/copia/orcamento.json` não foi reescrito nesta rodada) |O retrato de estilo do navegador acusou **6 telas** com mudança: as **duas da sala em
destaque** em cada uma das duas larguras (560 → 559 e 571 → 570 elementos, e o hash
diferente) e o **painel do professor** (250 → 250 elementos, só o hash). É esperado: o
corpo do rótulo e o do título mudaram de tamanho. O **−1 elemento** nas telas da sala é
compactação de **um** nó cujo estilo passou a igualar o do pai; **não** enumerei qual nó
foi compactado — fica como ressalva, não como prova.

## 5. O que ficou de fora (de propósito)

1. **A escala da casa continua a mesma** (12/13/13.5/16/19/30). Uniformizá-la em três ou
   quatro degraus é uma decisão de identidade do produto, não de uma tela, e mexeria em
   `design.css` e `arena.css` inteiros.
2. **`font-weight: 750` e o extra-bold 900** seguem como estão: são da família do
   projeto, e "consertar" um deles numa tela só criaria uma inconsistência nova.
3. **O `<th>` da coluna de ações é vazio** — legítimo (a coluna não tem título) e agora
   fora da régua.
4. **A quebra do `renderDetail` em funções** continua pendente; é mudança de estrutura e
   sujaria esta rodada.

## 6. Evidência

- `output/olhar-depois/medidas.json` — as quatro perguntas e a escala, nas seis larguras,
  com os nomes e as alturas dos 28 alvos da reversão.
- `output/olhar-depois/olhar-*.png` — as seis telas.
- `output/olhar-depois/qr-caixa.png` — a caixa do QR depois de carregada.
- `output/olhar-apple-2026-09-20/folha.html` — a folha com as fotos.
- `tmp/qa/sonda-olhar.mjs`, `tmp/qa/sonda-qr.mjs`, `tmp/qa/sonda-tipografia.mjs`,
  `tmp/qa/sonda-transicao.mjs`, `tmp/qa/sonda-botao-perigo*.mjs` — as réguas, com o
  motivo de cada decisão escrito ao lado do código.
