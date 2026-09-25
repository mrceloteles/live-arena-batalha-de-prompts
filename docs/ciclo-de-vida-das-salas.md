# Ciclo de vida das salas e das rodadas (Live Arena)

Documento de referência do que o servidor **permite**, do que cada tela
**mostra** e do que os testes **prendem**. Ele existe porque as duas perguntas —
"por que este botão não aparece?" e "quem pode fazer isto agora?" — eram
respondidas por leitura de código em cada rodada de trabalho.

Os nomes de estado são os do banco (`arena_rooms.status`, `room_rounds.status`);
a *fase* é a leitura canônica que todas as telas falam
(`src/domain/room-phases.mjs`). Os dois não são a mesma coisa: uma sala `playing`
com todas as rodadas fechadas está na fase `finished`.

## 1. Estados da sala

| Status | Fase (derivada) | Alunos entram? | Quem age | Ações oferecidas na lista de salas | O que aluno / TV / painel mostram |
| --- | --- | --- | --- | --- | --- |
| `draft` | `lobby` | não | professor | **Abrir sala** (publica) · Excluir | Aluno não vê a sala (o PIN não resolve). TV idem. Painel: cartão com "N missões" e o selo de pendências que travará a publicação |
| `waiting` | `lobby` | sim | professor/aluno | **Iniciar missão/batalha** (quando `can_start`) · Excluir | Aluno: tela de espera com o PIN e "Aguarde o professor iniciar". TV: espera com PIN e QR. Painel: lista de participantes, envios 0 |
| `open` | `lobby` | sim | professor/aluno | **Iniciar missão/batalha** | O mesmo da sala em espera. `open` é a entrada liberada sem rodada viva |
| `playing` | `playing`, `round_results`, `final_results` ou `finished` (pelas rodadas) | sim, até a última rodada fechar¹ | professor/aluno | **Encerrar sala** | Aluno: missão aberta (composer) · resultados da rodada · placar final. TV: rodada viva, placar, fim com campeão. Painel: rodada em andamento, envios, pendências de nota |
| `ended` | `final_results`/`finished` | não | professor | **Arquivar** · (no detalhe) **Nova batalha nesta sala** | Aluno: "Batalha encerrada" + pontuação própria. TV: painel de campeão. Painel: relatório da batalha e a ação de repetir |
| `archived` | `finished` | não | — | — | Aluno: sessão deixa de valer (401 ao reler). TV: 404. Painel: só leitura |

¹ `canJoinRoom` (`room-phases.mjs`) fecha a entrada depois que **todas** as
rodadas estão `closed`, ou já no início da primeira rodada quando o preset tem
`rosterLocksAtStart` (o Clássico, de 3 lugares fixos). É a mesma bandeira que o
`arena_start_round` usa para exigir a sala cheia — e a lista de salas passou a
consultá-la também (`can_start`), senão o botão de iniciar desaparecia numa sala
do preset Turma com 3 de 35 alunos e nada dizia por quê.

Transições permitidas (`src/domain/arena-state.mjs`):

```
draft    -> waiting
waiting  -> open | playing | ended
open     -> playing | ended
playing  -> ended | open      # `open` = BATALHA NOVA (ciclo seguinte)
ended    -> archived | open   # `open` = BATALHA NOVA
archived -> (nada)
```

Qualquer outra transição é `RangeError` — o `nextRoomStatus` é chamado nas
escritas, então uma ação nova que tente pular estado falha no teste de domínio
antes de chegar ao banco (`test/domain/arena-state.test.mjs`).

## 2. Estados da rodada (missão)

| Status | O que significa | Envios aceitos | Efeito nas telas |
| --- | --- | --- | --- |
| `pending` | configurada, aguardando o professor | não | Aluno: espera com a lista de missões. TV: espera |
| `open` | em andamento | **sim** | Aluno: imagem, instruções, cronômetro e composer. TV: missão e quantos já enviaram |
| `submitting` | tempo esgotado, fechando a pontuação dos faltantes | não | Transição curta; o cronômetro sai e a nota dos que não enviaram zera |
| `judging` | avaliação em andamento | não | Aluno: "avaliando" (a nota chega sozinha) |
| `results` | notas visíveis para a turma | não | Aluno: nota própria e evolução. TV: placar da rodada. Painel: envios, notas, avançar |
| `closed` | encerrada pelo professor | não | Sai da lista de resultados da batalha; a rodada da batalha anterior fica no ciclo dela |

Transições (`ROUND_TRANSITIONS`): `pending -> open`; `open -> submitting |
results | closed`; `submitting -> results | closed`; `judging -> results |
closed`; `results -> closed`; `closed` é terminal.

`roundAcceptsSubmissions(round, now)` é a única resposta para "posso enviar
agora?" — ela exige `open`, sem `pausedAt` e com `now <= deadlineAt + 2` (a
tolerância de rede). Envio com a rodada pausada ou vencida é recusado com a
causa, e não com "revise os campos".

## 3. Fase × tela (o que cada superfície desenha)

| Fase | Aluno (`/play`) | Painel (`/admin-arena.php`) | TV (`/tv.php`) |
| --- | --- | --- | --- |
| `lobby` | espera + PIN + quem entrou | cartão da sala, lista de participantes, botão de iniciar (se `can_start`) | PIN grande + QR de entrada + conectados |
| `playing` | missão aberta: imagem, contexto, cronômetro, composer, tentativas | rodada viva: pausar/retomar, encerrar, envios, pendências de nota | imagem da missão, cronômetro central, quem já enviou |
| `round_results` | nota da rodada + evolução + classificação parcial | notas da rodada, avançar/reencerrar | placar da rodada |
| `final_results` | placar final + destaques | relatório e exportação | painel de campeão |
| `finished` | "Batalha encerrada" + pontuação própria | **Nova batalha nesta sala** (se a batalha jogou) / Arquivar | erro de sala encerrada, sem apagar o último placar na tela |

## 4. A revisão da sala (a versão do estado)

`arena_rooms.revision` é o número monótono que toda leitura devolve
(`lobby.revision`, `detail.revision`, `tv.revision`). Regras, todas presas por
`test/api/revisao-da-sala.test.mjs` e `test/browser/sincronizacao.test.mjs`:

* **mutação** sobe a revisão, uma vez por ação, no funil único
  (`anunciarSala`, em `src/server/start.mjs`) — nenhuma tela incrementa nada;
* **leitura** não sobe: duas leituras do mesmo estado devolvem o mesmo número
  (senão a guarda do cliente recusaria a própria leitura seguinte);
* o **evento** de tempo real sai **depois** de o número subir e viaja com ele
  (`revision` no payload do hub), para a tela poder dispensar a releitura de um
  aviso que já pintou;
* a tela **recusa** payload de revisão menor que a que já pintou
  (`aceitaRevisao`, `public/assets/js/arena.js`) e esquece o número ao trocar de
  sala;
* ação **global** (abrir/fechar a Arena) não mexe na revisão de sala nenhuma.

## 5. "Nova batalha nesta sala"

A ação `arena_new_battle` existe para o professor repetir a aula **na mesma
sala**, sem apagar o que aconteceu. O que fica e o que zera:

| Fica | Zera / recomeça |
| --- | --- |
| o **código** (PIN) e a configuração da sala (preset, tempos, missões) | as **tentativas** (vivem por rodada, e as rodadas são novas) |
| os **participantes** (o professor escolhe: manter ou desativar) | a **pontuação** da batalha nova |
| o **histórico**: rodadas `closed`, envios, notas e tentativas de juiz da batalha anterior, presos ao `round_id` e ao `cycle` deles | o **estado do Modo Arena** (Boss, energia, votos) e o **sorteio** da sala |
| os **tokens da TV** (a projeção é da mesma sala, e continua valendo) | `started_at`/`ended_at` da batalha |

Implementação: `room_rounds.cycle` + `arena_rooms.current_cycle` (migração v8).
`rounds.listByRoom(roomId)` lê **só o ciclo corrente** — é por isso que painel,
aluno, TV, ranking geral e relatório ficam recortados sem uma linha em cada
tela. Quem precisa do histórico usa `listByRoomCycle`.

As quatro portas de contaminação, cada uma com teste:

1. **Juiz/vigia**: `submissions.listAwaitingScore` junta `room_rounds` e só olha
   o ciclo corrente — senão a sala volta a `open` e o vigia sai reavaliando
   envios da batalha passada (cota gasta, nota velha escrita depois).
2. **Modo Arena e sorteio**: as chaves de estado (`arena.mode.<sala>`,
   `arena.draw.<sala>`) são esquecidas na batalha nova; os tokens da TV não.
3. **Relatório**: `report-sources.mjs` emite uma entrada por batalha, com
   identidade própria por ciclo (`PIN`, depois `PIN #2`…), o que também mantém
   os totais por rodada sem fundir duas "Rodada 1".
4. **Cliente**: o painel manda o `cycle` que viu no payload; se o servidor já
   estiver noutro, a ação responde `already: true` em vez de criar um terceiro
   ciclo (clique duplo).

Onde está preso: `test/api/arena-nova-batalha.test.mjs`,
`test/db/migration-nova-batalha.test.mjs`,
`test/browser/nova-batalha.test.mjs` e o relatório da rodada em
`output/auditoria-sincronizacao-2026-09-19/RELATORIO.md`.

## 6. Como conferir na mão

```bash
npm test                      # domínio, API, banco, cópia e estilo
npm run test:browser          # as telas, em navegador de verdade
node src/server/start.mjs     # http://127.0.0.1:3000
```

No navegador: `/admin-arena.php` (professor), `/play` (aluno), `/tv.php` (TV —
precisa do link com sessão de projeção gerado no painel, em "Projeção").
