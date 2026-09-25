# A sala em destaque, confrontada com a referência clara — 20/09/2026

## A pergunta

"Tem certeza que está como foi pedido?" — com o print do painel na sala **encerrada**.
Em vez de responder de memória, medi. Este relatório é o resultado da medição e das
três correções que ela apontou.

## O que foi medido (e onde estava errado)

Sonda `tmp/qa/confronto-referencia.mjs`, no painel da 3000, com o banco real: para
cada sala (encerrada, lobby, rascunho, em jogo) ela lê a **ordem das seções do
corpo**, o **selo do código**, as **portas**, os **quatro cartões** e os **comandos**.
A tabela é o antes e o depois.

| Peça da referência | O que a tela fazia | Agora |
|---|---|---|
| A faixa de números abre o corpo da sala, e a bancada de comandos vem **depois** | ao contrário: `arena-workbench` antes de `arena-metrics` nas **quatro** salas medidas | **`arena-metrics` → `arena-workbench`** em todos os estados |
| O selo do código e as portas (QR, copiar link, telão) ficam no cartão da sala, sempre | a sala **encerrada** perdia o selo **e** as portas: `ofereceAcesso` só cobria `waiting/open/playing` | o selo volta com o estado ao lado (`Fechado`), com QR, link e telão; a porta de **trancar** sai (a entrada já está fechada — controle morto) |
| Os cartões mostram os números da aula | na sala encerrada ficavam em branco — "— sem missão no ar", "— aguardando o juiz" — **enquanto a faixa de estado, três linhas acima, escrevia "3 de 3" envios** | os cartões passam a contar a **última missão** que tem dado: `Missão 1 de 1`, `encerrada`, `3 de 3 entregues · 100% concluído · última missão`, `0% 3 avaliados · Notas da última missão` |

O terceiro é o mais grave dos três: o número existia no servidor e o cartão dizia
não existir. Era o mesmo dado escrito de dois jeitos na mesma tela — a classe de
defeito que esta frente existe para tirar.

Antes (medido na sonda):

```text
=== Aula em jogo (Encerrada) ===
  seloDoCodigo: ""            portas: []
  ordemDoCorpo: arena-workbench → arena-metrics → arena-draw → colunas
  cartões: Rodada "--:--" · Envios "— sem missão no ar" · Média "— aguardando o juiz"
```

Depois:

```text
=== Aula em jogo (Encerrada) ===
  seloDoCodigo: "CÓDIGO DA SALA Fechado SXZZ87 ⧉ Copiar código"
  portas: QR · 🔗 Copiar link do aluno · 📺 Abrir telão / TV        (sem 🔒)
  ordemDoCorpo: arena-metrics → arena-workbench → arena-draw → colunas
  cartões: Missão 1 de 1 "encerrada" · 3 de 3 entregues · 0% 3 avaliados
```

## A correção da ordem, provada

O portão de estilo (`css-render`) reprovava em 4 telas: as duas da sala em
destaque, nas duas larguras. Mesma contagem de elementos (549 → 549, 556 → 556),
hash diferente. Antes de regravar o cartório, **voltei a ordem antiga** e rodei o
portão: ele fechou. Depois comparei os dois retratos linha a linha:

- linhas: 549 e 549 (espera), 556 e 556 (em jogo);
- **o multiconjunto de linhas — tag, classe e todas as propriedades computadas —
  é idêntico**;
- o que muda é o **índice do irmão** no caminho do DOM (`main:1>section:4` vira
  `section:3`).

Ou seja: nada de estilo mudou; duas seções irmãs trocaram de lugar. Só então o
cartório foi regravado.

## O que a régua contou (e o que ela não vê)

`test/copia/orcamento.json`: o teto do `arena.js` subiu de **1768 para 1769**
(+1 palavra, 1 trecho) — a palavra `encerrada`, literal solto do relógio do cartão
da rodada. As outras frases novas (`Missão N de M`, `· encerrada`,
`% concluído · última missão`, `Notas da última missão` — 10 palavras) moram em
**ramo de ternário dentro de `${...}`**, o furo já declarado neste cartório; ficou
registrado na nota, com o número, para o dia em que o leitor enxergar esse ramo.

## Os portões

| Portão | Resultado |
|---|---|
| `npm test` | **540 testes · 539 passam · 1 pulado · 0 falham** |
| `npm run test:browser` | **42/42** (era 41; o portão novo é o 42º) |
| `test/css/render.json` | regravado (4 telas), com a prova acima |
| `test/copia/orcamento.json` | regravado (1768 → 1769) com nota escrita |

## O portão novo, e as quatro mutações

`test/browser/sala-indicadores.test.mjs` ganhou duas regras:

1. **a ordem do corpo** (faixa antes de bancada, colunas depois das duas), no teste
   que já existia;
2. **a sala encerrada**, num teste próprio: monta uma aula inteira pelo servidor
   (abre a missão, um envio, fecha a rodada, fecha o resultado, encerra a sala),
   abre o painel, seleciona a sala e cobra — o selo do código com o PIN certo e o
   estado `Fechado`, as portas do link e do telão presentes, a de **trancar
   ausente**, e os cartões com o número **do servidor** (envios e média lidos do
   ranking da última missão, não uma constante escrita no teste).

`node tmp/qa/mutacoes-referencia.mjs` quebra cada regra de propósito e cobra a
reprovação — as quatro mordem, cada uma com a sua frase, e o produto volta
idêntico (sha conferido):

```text
✔ sala encerrada esconde o código de novo
✔ sala encerrada tranca a entrada de novo
✔ cartões voltam a ficar em branco sem missão no ar
✔ faixa de indicadores volta para depois dos comandos
produto restaurado, sha confere
```

## Uma coisa que apareceu no caminho e **não** foi mexida

Ao montar a sala encerrada, o cartão de envios leu **"2 de 2 entregues"** com um
único envio de verdade. Não é defeito do cartão: quando a missão fecha, o servidor
**pontua quem não escreveu** (zero por tempo esgotado) e cria uma submissão vazia
para cada um — então `submitted` conta os zerados também. O cartão mostra o mesmo
número que a faixa de estado; mudar isso mexeria no significado do número em todas
as telas, e não é esta frente. Fica registrado como pergunta em aberto: **"entregues"
e "zerados por tempo" são a mesma pergunta?**

## Onde estão as provas

- `evidencias/01-encerrada.png` — a sala encerrada: selo do código, QR, portas, faixa
  de números preenchida, comandos depois da faixa.
- `evidencias/02-lobby.png` — o lobby, com "Pronta para começar" e o INICIAR MISSÃO.
- `evidencias/03-rascunho.png` — a sala em rascunho (sem código, como deve ser).
- `evidencias/04-em-jogo.png` — a missão no ar com resultados.
- `evidencias/folha.html` — a folha de contato das quatro.
- `tmp/qa/confronto-referencia/medicao.txt` — a medição crua de cada estado.
