# Sorteio da vez — quem joga agora

Uma turma grande e uma batalha pequena (30 alunos, disputas de 3 em 3) pedem duas
coisas que o painel não tinha: **sortear gente de verdade** e **não perder o fio
da meada** do que já aconteceu. O painel **🎲 Sorteio da vez**, no detalhe da
sala, faz as duas.

O estado é **do servidor**, por sala: recarregar a página no meio da aula (ou
abrir o painel em outro aparelho) não perde o sorteio. Ele não mexe em missão,
nota, rodada ou andamento da sala — é sorteio, não julgamento.

## Os dois modelos

| Modelo | Quem continua no sorteio |
| --- | --- |
| **Sorteio livre** | Toda a turma, sempre. Quem venceu continua no balaio e pode ser sorteado de novo; quem perdeu também. |
| **Mata-mata** | Como no futebol: quem vence fica no jogo e só volta a jogar contra outros vencedores; quem perde sai. |

No **livre**, cada clique em *Sortear* é independente: o painel mostra quantos
ainda não foram sorteados e quem já jogou, para o professor equilibrar sem
precisar de sorte.

No **mata-mata**, cada rodada sorteia grupos entre os vencedores da rodada
anterior, até sobrar um:

1. Rodada 1: a turma inteira é sorteada em grupos de N. Cada grupo tem um
   vencedor; os demais ficam **fora do jogo**.
2. Quando a rodada acaba, a seguinte nasce **só com os vencedores** — o painel
   diz "Rodada 2 · 3 vencedores na disputa".
3. Quando sobra um, ele é o **campeão** e o sorteio para de sortear.

Dois detalhes de honestidade do mata-mata:

- **O grupo encolhe para não deixar ninguém sozinho**: 4 pessoas com grupos de 3
  viram 2 + 2, e o botão diz *"Sortear 2"* — o número do botão é sempre o que vai
  acontecer de fato.
- **Grupo de 2 numa rodada ímpar**: quem sobra passa direto, sem disputa, e o
  histórico registra isso como *"passou direto"*. E isso só acontece quando o
  grupo da vez **fecha**: enquanto alguém está jogando, quem esperou a vez
  continua apenas esperando (ninguém ganha por não ter entrado em campo).

## Como o professor usa

No detalhe da sala, acima da lista de participantes:

- **Modelo**: dois botões explicando cada um. Trocar de modelo com sorteio em
  andamento **recomeça** (o professor confirma antes) — um modelo não vira o
  outro.
- **Quantos por vez**: 2 a 10, salvo na hora. Mudar o número **mantém** o
  histórico quando o modelo é o mesmo.
- **Sortear N**: o grupo da vez aparece com os nomes grandes e um botão
  **🏆 nome** por sorteado, que registra quem venceu. *Sortear de novo* troca o
  grupo sem registrar vencedor.
- **Histórico**: cada disputa com a rodada, quem jogou e quem venceu (ou
  "passou direto"), mais quem ficou **fora do jogo** e em que rodada.
- **↺ Recomeçar**: devolve a turma inteira ao balaio, no mesmo modelo.

Antes de a sala abrir, o sorteio já funciona (é útil para decidir quem começa);
o ajuste só depende de haver pelo menos 2 participantes ativos.

## Na projeção da TV

Na aula quem olha para a parede é a turma, não o professor: o sorteio também
aparece na **TV**, num bloco **🎲 Sorteio da vez** logo abaixo da espera — **sem
nenhum controle**, porque quem sorteia é o painel.

- **É a vez de**: os nomes do grupo sorteado, grandes, enquanto a disputa está
  aberta. Na rodada em andamento a TV repete a mesma linha sobre a missão
  (*"🎲 Vez de Ana · Bia"*), para quem entra no meio da aula não ficar perdido.
- **Mata-mata**: o indicador de rodada (“Mata-mata · Rodada 2”) e o
  **chaveamento vivo** — quantos ainda estão no jogo com os nomes, e a lista de
  quem ficou **fora do jogo**. Isso é o que a turma procura entre uma disputa e
  outra.
- **Última disputa**: quando não há grupo aberto, a TV fecha o ciclo mostrando o
  resultado anterior (“🏆 Ana” ou “passou direto”).
- **Campeão**: quando o mata-mata acaba, a TV anuncia “🏆 CAMPEÃO DO SORTEIO”.

Enquanto o sorteio não começou não aparece bloco nenhum (a espera já tem PIN, QR
e quem entrou) — nada de um painel vazio na parede. A lista de nomes é cortada em
12 com “e mais N”: turma inteira não cabe projetada.

A TV só **lê** o `draw` que o servidor já guarda: o mesmo estado do painel, sem
escrita nova. Por isso o que o professor sorteia aparece na parede no ciclo
seguinte da projeção, e recarregar a TV não perde nada.

## Onde está no código

| Peça | Arquivo |
| --- | --- |
| Regra (modos, sorteio, mata-mata, histórico) | `src/domain/arena-draw.mjs` |
| Ações `arena_draw_setup` / `_next` / `_settle` / `_reset` e o `draw` no detalhe | `src/server/arena-api.mjs` |
| Painel e eventos | `public/assets/js/arena.js` + `public/assets/css/arena.css` |
| Bloco na projeção (espera, rodada e campeão) | `drawTvMarkup` em `public/assets/js/arena.js` |
| Testes | `test/domain/arena-draw.test.mjs`, `test/api/arena-api.test.mjs`, `test/browser/arena-ui.test.mjs` |

O sorteio é guardado em `settings` sob a chave `arena.draw.<room_id>`, como os
tokens de projeção — sem tabela nova, sem migração. Quando a sala é **excluída**,
o servidor esquece o que era só dela (sorteio, tokens de projeção e o código
curto do índice): sala que não existe mais não deixa estado para trás.

## Sondagem (prints)

```bash
BASE=http://127.0.0.1:3221 node tmp/qa/probe-sorteio.mjs
```

Cria uma sala de 6 alunos, percorre o sorteio livre e o mata-mata inteiro no
painel real, mede 390/1920 px e monta `tmp/qa/sorteio/sheet.html` com os prints.
A sala e o desafio de sondagem são apagados no fim e o portão da Arena é
restaurado.

O mesmo sorteio **na projeção**, do primeiro grupo ao campeão:

```bash
BASE=http://127.0.0.1:3221 node tmp/qa/probe-sorteio-tv.mjs
```

Joga o mata-mata inteiro por API e fotografa a TV em cada estado: espera com o
grupo em campo e o chaveamento, a rodada em andamento (com “Vez de …”), quem
saiu, o campeão e a mesma tela na prévia do professor; confere que coube em
1920×1080 e que os nomes do grupo são exatamente os do painel. Monta
`tmp/qa/sorteio-tv/sheet.html` e apaga a sala de sondagem no fim.
