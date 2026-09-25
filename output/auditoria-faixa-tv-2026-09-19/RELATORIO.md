# Faixa superior da TV — auditoria da quebra em 1280×720

Data: 19/09/2026. Nada foi publicado e nada de produção foi tocado. A batalha, a
API, o SSE, a autenticação, o ranking e as telas de aluno e professor não foram
alterados — nenhuma linha de CSS de produto mudou.

## 1. O que foi pedido e o que foi encontrado

O pedido parte de uma falha: *"em 1280×720 a faixa superior da TV está quebrando
em duas linhas"*, com um teste de navegador reprovando em

```
a faixa da TV cabe numa linha e as duas entradas usam o mesmo botão e o mesmo anel de foco
```

**A falha não existe no código atual.** Medições, não impressões:

| superfície | 1920×1080 | 1440×900 | 1280×720 | 1024×768 | 390×844 |
|---|---|---|---|---|---|
| faixa (`tv-preview.php`) | 1 linha, 72 px | 1 linha, 72 px | **1 linha, 72 px** | 1 linha, 72 px | 2 linhas, 129 px |
| projeção real (`tv.php`), rodada viva | 1 linha, 72 px | 1 linha, 72 px | **1 linha, 72 px** | 1 linha, 72 px | 2 linhas, 129 px |

Na mesma medição: selo LIVE na **linha 1, coluna 3** (46,95×25 px) em todas as
telas; sobreposição **0**; rolagem horizontal **0**; palco começando exatamente
onde a barra termina (`palco == altura` da barra, 72 / 72). A barra é uma grade
de quatro colunas com **todos os itens presos à linha 1** por regra própria
(`refinement.css`, "Quatro colunas, uma linha"), e o comentário no arquivo
registra a origem: com três colunas, o botão "Tela cheia" sobrava sozinho na
segunda linha e o cabeçalho ia a 126 px. **Esse defeito já está corrigido no
repositório.**

O teste nomeado passa isolado (`node --test --test-name-pattern="faixa da TV"`)
e passa dentro do portão inteiro. Não houve reprodução em nenhum dos dois modos.

## 2. As duas telas que parecem quebrar e não quebram

- **Barra de controles da prévia** (`[data-tv-preview-bar]`): 2 linhas em todas
  as telas largas, mas é `flex-direction: column` **por desenho** — o selo
  "EXEMPLO / Dados reais desta sala" em cima, os botões Espera/Rodada/Resultado/
  Fim, Atualizar e Abrir a TV de verdade embaixo. No celular vira 4 linhas, com
  os seis controles presentes (nenhum oculto).
- **Cabeçalho a 390×844**: a sala desce para a segunda linha por regra própria
  do `@media (max-width: 900px)`. É adaptação controlada, já coberta por
  asserção — não é quebra.

## 3. A lacuna que existia — e que foi fechada

O defeito estava no **instrumento**, não na tela. A contagem de linhas do teste
lia `barra.children`, ou seja, só elementos:

- o selo LIVE é um **`::after` da própria barra**, isto é, um item de grade de
  verdade, colocado na terceira coluna. Pseudo-elemento não aparece em
  `children`: se ele voltasse a descer para uma faixa própria, a contagem
  continuaria dizendo "uma linha";
- a **projeção real** só era medida em 1920×1080, e é 1280×720 que a aula usa —
  a mesma resolução em que a faixa já dobrou uma vez;
- ninguém verificava **rolagem horizontal** nem que o botão **Tela cheia**
  continuasse tocável depois de encolher.

Arquivo alterado (só teste): `test/browser/arena-ui.test.mjs` (+62/−9).

1. `lerBarra` passa a devolver o selo lido direto (`grid-row`, `grid-column`,
   largura e altura usadas), a caixa do botão e a rolagem horizontal;
2. a rodada de larguras vira `1920×1080`, `1440×900`, `1280×720`, `1024×768`;
3. três asserções novas por largura: selo na linha 1, selo na coluna 3, selo
   pintado (caixa > 0); rolagem horizontal 0; botão tocável (≥ 80×32);
4. a projeção real passa a ser medida em 1920, **1280** e 1024, com "o palco
   começa onde a barra termina" e "não rola de lado" em cada uma;
5. entra o cabeçalho a **390×844**, com marca e botão juntos na primeira faixa e
   nada sobreposto.

### As asserções novas mordem (teste de mutação, arquivo restaurado depois)

| mutação aplicada | resultado | mensagem |
|---|---|---|
| selo movido de `grid-column: 3` para `4` (barriga de uma linha, altura intacta) | **reprovou** | `em 1920×1080 o selo LIVE é a terceira coluna (coluna 4)` |
| botão Tela cheia com `padding: 1px 2px; font-size: 1px` | **reprovou** | `o botão Tela cheia continua tocável em 1920×1080 (12×6)` |
| selo movido de `grid-row: 1` para `2` | **reprovou** | `em 1920×1080 a faixa de ferramentas tem de ser UMA linha: [...]` |

As duas primeiras só são pegas pelas asserções novas — é a prova de que não são
linhas sempre-verdadeiras. Depois de cada mutação os arquivos foram restaurados
e conferidos por `diff` contra uma cópia de antes (`design.css` e
`refinement.css` idênticos; nenhum `padding: 1px 2px` nem `font-size: 1px`
residual).

## 4. Resultado dos portões

- `npm run test:browser` — **34 testes, 34 passam, 0 falhas** (o teste da faixa
  incluído, agora medindo cinco larguras e a projeção real em três).
- `npm test` — **540 testes, 539 passam, 1 pulado, 0 falhas**. O pulado é o de
  sempre: o SIGTERM que o Windows não entrega a outro processo.

## 5. Nota de método (para quem for testar CSS de tela daqui para frente)

Duas armadilhas custaram tempo e valem registro:

1. **`page.addStyleTag` + `transition: all`** não servem para medir efeito de
   estilo: o valor computado logo depois da injeção ainda é o de origem, porque
   a transição está em curso. Foi por isso que o A/B por folha injetada foi
   **descartado** em favor da leitura direta do `::after` — sem injeção, sem
   transição, sem mentira.
2. **Mutação inserida antes da declaração original não muta nada.** A primeira
   tentativa de encolher o botão colou `padding: 1px 2px` acima do
   `padding: 7px 16px` da mesma regra, e o original venceu — o teste "passou" e
   quase virou a conclusão errada de que a asserção era vazia. Mutação de
   verificação precisa **substituir** a declaração que vence, não conviver com
   ela.

## 6. Limitações

- O nome da sala era sempre cortado com reticências (de 390 a 1920): **resolvido
  depois**, em `output/titulo-sala-tv-2026-09-19/RELATORIO.md`.
- Não há navegador de verdade com zoom de sistema (125%/150%) nem TV com
  `devicePixelRatio` diferente de 1 nas medições; o `viewport` foi o único eixo
  variado, como no pedido.
- A leitura do selo usa `grid-row`/`grid-column` computados: garante o **lugar
  pedido** e que o selo está pintado, não que ele esteja visualmente alinhado ao
  pixel com a marca — o alinhamento é conferido pelas medições de topo com
  tolerância de 20 px, como antes.
- As evidências em `evidencias/` são sondas executáveis (`node tmp/qa/...`
  equivalente a partir de `evidencias/`), não capturas de tela; as capturas
  visuais são as do relatório de sincronização, em
  `output/auditoria-sincronizacao-2026-09-19/`.

## 7. Entrega, item por item do pedido

| pedido | resposta |
|---|---|
| arquivo CSS alterado | **nenhum** — o CSS já estava correto; alterado só `test/browser/arena-ui.test.mjs` |
| causa da quebra de linha | não há quebra em 1280×720; a causa foi encontrada na medição, e era a do teste (selo `::after` fora da contagem, projeção real só em 1920) |
| solução aplicada | instrumento fechado: selo, rolagem, toque, 1024 e projeção real em 1280 e 390 |
| viewports testados | 1920×1080, 1440×900, 1280×720, 1024×768, 640×900, 390×844 |
| `npm run test:browser` | 34/34, 0 falhas |
| `npm test` | 539/540 (1 pulado), 0 falhas |
| confirmação em 1280×720 | 1 linha, 72 px, selo na linha 1/coluna 3, sobreposição 0, rolagem 0, palco = 72 |
