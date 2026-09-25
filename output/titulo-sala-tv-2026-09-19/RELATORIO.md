# O nome da sala na TV — de cortado com reticências a legível

Data: 19/09/2026. Nada foi publicado e nada de produção foi tocado. A batalha, a
API, o SSE, a autenticação, o ranking e as telas de aluno e professor não mudaram.

## 1. O defeito e a causa

`.arena-tv-room > strong` (`public/assets/css/arena.css`) prendia o nome da sala
com um teto e uma linha só:

```css
max-width: min(38vw, 520px);
white-space: nowrap;
text-overflow: ellipsis;
```

Resultado medido: **todo** título era cortado, em **toda** largura. O nome que o
professor digitou — 94 caracteres — ocupa 1011 px a 22 px, e a caixa recebia
520 px em 1920, 486 em 1280 e 389 em 1024. Ou seja: a parede mostrava
`Aula 003 — Turma B do período noturno, ofic…` e nada mais.

O espaço para o nome **existia**: a coluna da grade da sala tem 1428 px em 1920,
957 em 1440, 807 em 1280 e 577 em 1024. O teto de 520 px era quem desperdiçava
isso.

## 2. A correção

Uma regra, em `public/assets/css/arena.css`: o teto sai, o nome passa a usar a
coluna e quebra em no máximo **duas linhas** quando não couber em uma.

```css
.arena-tv-room > strong {
  min-width: 0;                 /* pode encolher: quem quebra é o texto, não a grade */
  max-width: none;              /* o teto de 520 px era o defeito */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;        /* rede: acima de duas linhas corta em duas, não empurra o palco */
  overflow: hidden;
  overflow-wrap: anywhere;
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(14px, 1.45vw, 20px);
  line-height: 1.2;
}
```

Duas linhas é o limite, e não gosto: **marca, selo LIVE e botão moram todos na
linha 1 da grade** (`grid-row: 1`, o selo e o botão com coluna própria). A quebra
é do texto dentro da própria caixa, então nenhum deles desce — e a barra fica em
77 px, abaixo dos 80 px que a faixa de uma linha protege (o defeito antigo eram
126 px).

### Os números que escolheram o `clamp`

Medidos com o maior título que a API aceita (120 caracteres, `max: 120` em
`arena_update_room`), não estimados:

| | 1920×1080 | 1440×900 | 1280×720 | 1024×768 |
|---|---|---|---|---|
| coluna da sala (grade) | 1428 px | 957 px | 807 px | 577 px |
| caixa do título (menos o chip) | 1165 px | 827 px | 677 px | 447 px |
| largura do texto a 20 px | 1165 px | 1165 px | 1165 px | 1165 px |
| fonte resultante | 20 px | 20 px | 18,6 px | 14,8 px |
| linhas | **1** | **2** | **2** | **2** |

O piso de 14 px vem da medida mais apertada: em 1024 o chip "Personalizado" come
118 px da coluna e sobram 447 px para o título — a 15 px o texto de 120
caracteres pediria uma terceira linha (a 16 px, três). O piso entra com folga
justamente porque `overflow-wrap: anywhere` corta palavra no meio e uma sobra
apertada viraria terceira linha.

### Depois, medido

Título de 120 caracteres, na prévia e na **projeção real** (`tv.php`, rodada
viva, sessão de projeção):

| tela | barra | linhas | texto escondido | texto igual ao gravado | faixas da linha 1 |
|---|---|---|---|---|---|
| 1920×1080 | 72 px | 1 | 0 | sim | marca + sala + botão |
| 1440×900 | 77 px | 2 | 0 | sim | marca + sala + botão |
| 1280×720 | 74 px | 2 | 0 | sim | marca + sala + botão |
| 1024×768 | 72 px | 2 | 0 | sim | marca + sala + botão |
| 640×900 | 118 px | 2 | 0 | sim | marca + botão (a sala desce — arranjo estreito) |

Rolagem horizontal 0 em todas. As capturas do cabeçalho estão em
`evidencias/cabecalho-da-tv__*.png` (1920, 1440, 1280 e 1024).

## 3. O teste

`test/browser/arena-ui.test.mjs`, no teste que já media a faixa da TV: a sala
passa a ser **renomeada pela própria ação do painel** (`arena_update_room`) com o
nome de 120 caracteres antes das medições, e cada largura agora afirma:

- a barra mostra o nome **gravado** (não um título curto qualquer);
- `escondido === 0` — nada de texto por baixo do corte, medido por
  `scrollHeight`/`scrollWidth` contra a caixa;
- no máximo **duas linhas** (o teto que mantém a barra abaixo de 80 px).

Isso vale para a prévia **e** para a projeção real, em 1920, 1280 e 1024. As
asserções da faixa de uma linha, do selo LIVE e da rolagem continuam onde
estavam.

**A asserção morde** (teste de mutação, com o arquivo restaurado depois): devolver
o teto de 520 px ao `strong` derruba o teste com

```
em 1920×1080 o nome da sala aparece INTEIRO, sem texto escondido:
{"texto":"Aula 003 — …","linhas":2,"escondido":24}
```

— 24 px de nome escondidos, exatamente o defeito antigo.

## 4. Portões

- `npm run test:browser` — **34/34, 0 falhas**.
- `npm test` — **540 testes, 539 passam, 1 pulado, 0 falhas** (o SIGTERM que o
  Windows não entrega a outro processo).

Cartórios de CSS regravados de forma justificada (`UPDATE_CSS_BASELINE=1`):
`test/css/render.json` (as telas da TV mudaram de hash), `test/css/cascata.json`
(a regra do título) e `test/css/contraste.json` (contagem de pares conferidos).
A regravação também **absorveu regras que estavam fora do cartório desde a frente
anterior** deste mesmo checkout sem commit — a faixa de sessão vencida
(`.arena-session-banner`) e o aviso de reconexão da TV (`.arena-tv-reconnect`).
Isso explica por que o diff dos JSON é maior do que a minha regra: nenhuma dessas
regras é nova, o cartório é que estava incompleto.

## 5. Limitações

- O piso de 14 px deixa o pior caso pequeno em 1024×768: o nome inteiro aparece,
  mas é o preço de caber em duas linhas com 120 caracteres. Um título curto em
  1024 fica em 14,8 px (antes 16,4 px).
- Não houve variação de zoom de sistema (125%/150%) nem de `devicePixelRatio`: o
  eixo medido foi a largura do viewport, como nas medições anteriores.
- Até 560 px o nome continua **escondido por regra própria**
  (`.arena-tv-room > strong { display: none }`), com o chip do preset no lugar.
  Isso é arranjo de celular e não foi mexido — se a projeção num tablet estreito
  precisar do nome, é outro pedido.
- Títulos acima de 120 caracteres não existem no produto (a API limita); o
  `line-clamp: 2` corta em duas linhas se um dia existirem.

## 6. Arquivos alterados

| arquivo | o que mudou |
|---|---|
| `public/assets/css/arena.css` | a regra `.arena-tv-room > strong`: teto fora, duas linhas, `clamp(14px, 1.45vw, 20px)` |
| `test/browser/arena-ui.test.mjs` | a sala do teste passa a ter o nome máximo e o teste afirma nome inteiro, ≤ 2 linhas, na prévia e na projeção real |
| `test/css/render.json`, `test/css/cascata.json`, `test/css/contraste.json` | cartórios regravados |
