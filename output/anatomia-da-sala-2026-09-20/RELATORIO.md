# A sala em destaque na anatomia da referência — 20/09/2026

**Pedido.** Aplicar na sala em destaque a referência visual de
`stitch_live_arena_frontend_redesign/code.html` — **só não escuro**, e **sem a
tarja amarela e preta** — e, a partir dela, ajustar o restante da área do
professor.

**Resultado em uma linha.** A composição da referência (código com estado, motor
da partida, faixa de indicadores e a lista de participantes com rosto e selo)
passou a valer no tema claro do Live Arena; a fita de perigo, o neon, o
vocabulário de jogo (HP, dano, boss) e o fundo escuro **não** entraram. No
caminho, apareceu e foi corrigido um defeito real de 390 px que dois portões de
largura deixavam passar.

---

## 1. O que a referência tinha e a tela não

Comparando peça por peça com o cartão `Sala Master Card` da referência, três
coisas existiam aqui e quatro faltavam:

| Peça da referência | Antes | Agora |
|---|---|---|
| Código com selo de estado (`Ativo`) | só uma frase que **sumia durante a aula** | selo `Ativo` / `Entrada bloqueada` / `Fechado` ao lado do número, em todos os estados |
| QR inline + botão de projeção | já existia | mantido |
| Motor da partida (modo, regra, missão no ar) | já existia | mantido |
| Faixa de indicadores (juiz, energia, acerto) | já existia (modo Arena) | mantido |
| Participantes com **rosto**, selo de estado e o que fazem | `🟢 online` / `⏳ escrevendo` em texto solto | iniciais, selo com ponto, selo da missão e a hora em mono |
| Contagem no cabeçalho da seção | não existia | `3 de 3 conectados` |
| Portas de inspeção ao alcance | atrás do `•••`, junto de editar/excluir | no cabeçalho do painel, ligadas à sala em destaque |
| Fita amarela e preta, fundo escuro, neon | — | **recusados**: são a identidade da referência, não a do produto |

## 2. O selo do código responde pela MESMA regra do servidor

O professor apertando *Bloquear entrada* precisa ver a resposta na hora; o
aluno atrasado batendo na porta precisa encontrar a mesma resposta. `podeEntrar`
espelha `canJoinRoom` (`src/domain/room-phases.mjs`) — é a **única** duplicação
desta frente, e está declarada no código. O portão cobra as duas juntas:

- sala aberta: selo `Ativo` → `arena_join` responde **200**;
- entrada bloqueada pelo `•••`: selo `Entrada bloqueada` → o **mesmo PIN** leva
  **409**;
- sala Clássica de três lugares com a batalha no ar: selo `Fechado` (o cadastro
  trava nos três) → **409**;
- sala em rascunho: **não mostra código nenhum** (o PIN nasce com a abertura) →
  **409**.

O interruptor do professor **não** entra em `podeEntrar`: ele é campo da sala,
não estado, e quem o lê é o selo. A duplicação existia e uma mutação não
conseguia reprová-la — linha que nenhuma mutação derruba é linha que não está lá.

## 3. A linha de cada aluno

`estadoDoAluno` responde duas perguntas com três leituras que a tela já fazia
(`detail.participants`, a fila do juiz em `waiting.items` e o ranking da rodada
no ar) — nenhuma rota nova, nenhum número inventado:

| Situação | Selo de estado | Selo da missão |
|---|---|---|
| conectado, sem enviar | ● Conectado | ✎ Escrevendo |
| conectado, enviou, sem nota | ● Conectado | ⏳ Avaliando |
| conectado, com nota | ● Conectado | ★ 83% |
| sem batida recente | ● Desconectado | — |
| removido pelo professor | ● Removido | — |
| rodada fechada sem nota | ● Conectado | — Sem nota |

## 4. O defeito que apareceu OLHANDO a tela

Em 390 px o painel da sala em destaque ia a **575 px** e o corpo da página
ganhava **200 px de rolagem lateral** — causado pela largura mínima de 539 px da
tabela de participantes. Nenhum portão reprovava, e o motivo importa: os dois
mediavam `document.documentElement.scrollWidth`, que **corta** o excesso e
continua dizendo 390 enquanto o conteúdo transborda por dentro dele.

Correção: o invólucro da tabela virou um contêiner de grade com trilha
`minmax(0, 1fr)` — a tabela deixa de ditar a largura do painel e quem cresce é a
rolagem de dentro do invólucro, que já existia. O instrumento foi fechado nos
**dois** portões de largura (`sala-anatomia` e `sala-em-destaque`), que agora
medem o `body` também. Medido depois: `body 390`, `janela 390`.

## 5. Portões

| Portão | Resultado |
|---|---|
| `npm test` | **540 testes, 539 passam, 1 pulado, 0 falhas** (duas rodadas seguidas) |
| `npm run test:browser` | **40/40** (era 39; o portão novo é `test/browser/sala-anatomia.test.mjs`) |
| Mutações | **6/6 reprovam**, cada uma com a sua mensagem, produto restaurado idêntico (`tmp/qa/mutacoes-anatomia.mjs`) |
| Contraste | piso do sistema **5,08 intacto**; 19 pares novos conferidos (`conferidos 236 -> 255`) |
| Cascata | 22 seletores novos, **nenhuma declaração alterada em seletor existente** |
| Cópia | `arena.js` **1606 -> 1607** (+1 palavra, 8 trechos de marcação) |

As seis mutações:

| Caso | Reprova com |
|---|---|
| `selo-promete-o-que-nao-recebe` | *com os três lugares tomados o código para de receber (leu "Ativo")* |
| `selo-ignora-o-bloqueio` | a espera do selo `Entrada bloqueada` |
| `aluno-sem-rosto` | *a linha diz as iniciais, o nome, o estado e a missão de cada aluno* |
| `missao-igual-para-todos` | a nota `★83%` deixa de aparecer na linha |
| `portas-na-sala-errada` | *sem sala em destaque não há o que inspecionar* |
| `tabela-manda-na-largura` | *em 390×844 a página não pode rolar para o lado (documento 390, body 609, janela 390)* |

> **Cartório de cópia estava atrasado.** Ao regravar, os números saltaram de
> portal 10→33, projeção 21→24, painel do professor 68→73 e `arena.js`
> 1346→1607 — nenhum deles desta frente: eram medidas que o arquivo já devia
> registrar e não registrava. A contribuição **desta** frente é +1 palavra, e o
> que entrou/saiu está na `nota` do bundle.

## 6. Uma armadilha de instrumento (registrada no `run.md`)

`node --check public/assets/js/arena.js` **passa** num arquivo que o navegador
recusa: o `package.json` é `"type": "module"`, então o `--check` julga o arquivo
como módulo ES, e no navegador ele é `<script>` clássico. Uma mutação mal
desfeita (trocar um trecho por string **vazia**, que insere no começo do
arquivo) pôs um `return` fora de qualquer função: o `--check` ficou verde e o
painel abriu **sem lista de salas e sem erro de rede**. O jeito de conferir o que
o navegador vê:

```bash
node -e "new (require('vm').Script)(require('fs').readFileSync('public/assets/js/arena.js','utf8'))"
```

## 7. Evidências

`output/anatomia-da-sala-2026-09-20/evidencias/` (folha de contato em
`folha.html`, para abrir direto no navegador):

| Arquivo | O que mostra |
|---|---|
| `01-painel-sem-sala` | o painel sem sala em destaque: portas de inspeção ausentes |
| `02-sala-em-destaque-em-jogo` | a sala inteira, com a anatomia nova |
| `03-codigo-ativo-com-a-dobra-aberta` | `CÓDIGO DA SALA · ATIVO` + PIN + QR + projeção |
| `04-participantes-com-rosto-e-estado` | as quatro linhas: rosto, estado, missão e hora |
| `05-codigo-bloqueado` | `ENTRADA BLOQUEADA` no mesmo PIN |
| `06-codigo-fechado-lugares-fixos` | `FECHADO` na sala Clássica com a batalha no ar |
| `07-portas-de-inspecao-no-topo` | ver como o aluno / ver na TV, no cabeçalho do painel |
| `08-celular-390-tela-cheia` | a tela inteira em 390 px |

## 8. O que fica aberto (não testado / próximo)

- **Tabela em 390 px**: ela rola **dentro** do invólucro (comportamento
  declarado). Virar lista de verdade, como o plano de responsividade pede, não
  foi feito.
- **Coluna "Entrou"** em mono: útil para auditoria, discutível para o meio da
  aula — não foi mexida.
- **Portas de inspeção** levam às **prévias** (sem sessão); a projeção de verdade
  continua em *Abrir tela de projeção*, dentro do acesso. Duas coisas com nomes
  vizinhos, e vale decidir se é assim que deve ser.
- **Colunas e cores** do Modo Arena (`JUIZ IA`, `ENERGIA`, `ACERTO`) continuam no
  desenho antigo: a referência pediria outro tratamento e isso é outra frente.
- **Portão intermitente conhecido** (`test/api/arena-estacionamento.test.mjs`):
  falhou 1 vez em 5 rodadas da suíte inteira e passou nas duas últimas.
