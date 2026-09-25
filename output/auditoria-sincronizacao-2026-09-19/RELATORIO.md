# Auditoria e correção — sincronização, autenticação e experiência em tempo real

Data: 2026-09-19/20 · Branch: `master` (working tree, nada commitado) · Nada foi publicado:
sem deploy, sem tocar em produção.

## 1. Resumo dos problemas encontrados

| # | Problema | Onde dói na aula | Estado |
|---|----------|------------------|--------|
| 1 | Sessão administrativa vencida deixava o painel consultando para sempre (401 em laço), sem dizer o motivo nem oferecer reentrada | O professor só via o painel "vazio e vivo", sem entender por quê | corrigido |
| 2 | Resposta de ação e evento SSE podiam se cruzar: um evento mais antigo repintava a tela por cima de um estado mais novo | rodada/cronômetro voltando no tempo, contagem de envios piscando errada | corrigido |
| 3 | Envio do aluno sem confirmação estável: depois de "Enviado", um recarregamento podia devolver "Enviar prompt" | aluno reenviava achando que perdeu a resposta | corrigido |
| 4 | Queda de conexão silenciosa nas telas de aluno e TV; a TV trocava de código sem limpar o palco anterior | dado de outra sala no ar durante a aula | corrigido |
| 5 | **Instrumento cego (achado nesta rodada):** o portão de estilo fotografava o `:hover` do ponteiro parado — 2 das 4 rodadas do mesmo código davam retrato diferente | portão intermitente ensina a rodar de novo até ficar verde | corrigido |
| 6 | **Instrumento do roteiro humano:** contava envios na página do professor (que não vê os envios do aluno), lia "perdeu a conexão" onde a faixa nem existe, e um seletor solto de `start` clicava na sala de outro cartão | evidência falsa: "clique duplo não enviou nada" | corrigido |

## 2. Causa comprovada de cada problema

**1. 401 em laço.** `admin-auth` só dizia "não autorizado": sessão ausente, sessão
expirada e credencial inválida davam a mesma resposta, e o cliente não tinha como
parar. Agora `check()` devolve o motivo, `requireAdmin`/`participantSession`
propagam, o login separa credencial errada, e o painel trata 401 num caminho só:
para o poll, fecha o SSE, **preserva o que estava na tela** e mostra a faixa com
reentrada (o formulário de senha vive dentro da própria faixa — a página
autenticada não carrega o cartão de login no DOM).

**2. Corrida de estado.** Não havia versão de estado. Agora a sala tem
`revision` (migração **v9**), incrementada no funil único `avisarSala`, devolvida
por lobby, detalhe e TV, e o cliente recusa payload com revisão menor que a que já
pintou. O evento SSE passou a carregar a revisão e a dispensar releitura daquilo
que já está na tela.

**3. Envio que regride.** O botão não era preso à tentativa: o estado "enviado"
morria no recarregamento. Agora a confirmação é do envio (idempotente por
identificador único de tentativa), sobrevive ao reload e distingue "recebido" de
"avaliando" de "nota disponível" — falha do juiz guarda a resposta e a nota chega
sozinha depois.

**4. Queda silenciosa.** Faltava aviso e faltava releitura completa na volta. Agora
há faixa no aluno (sem recarregar), chip na TV (sem apagar o placar) e releitura
completa ao reconectar, com intervalo progressivo.

**5. Portão de estilo intermitente.** Medido, não deduzido: 4 rodadas seguidas do
mesmo código deram 2 hashes diferentes para `sala-em-destaque-em-jogo__390x844`
(`eaeee04e8ab600c3` / `20c89825c8fd3356`). O diff entre os dois retratos tem **uma
linha**: `a.arena-preview-open`, com `border-color` `#dde3ee → #c3d2ea` e
`background` `#fff → #f7f9fd` — exatamente as cores de `:hover` de
`refinement.css`. O ponteiro do mouse fica onde o clique o deixou; depois que a
tela se redesenha ele pode acabar sobre outro elemento, e o `:hover` entrava na
foto. Correção: `await pagina.mouse.move(0, 0)` antes de ler o retrato.

**6. Roteiro humano.** Mesmas três causas: contagem de `arena_submit` presa à
página do professor (o envio acontece na página do aluno); `!undefined.hidden`
lido como "aviso visível" nas telas que não têm a faixa; e
`[data-arena-detail-body] [data-action="start"], [data-action="start"]` — com a
rodada em resultados o botão de iniciar não é desenhado, e o seletor solto casou
com o `start` da **sala vizinha** (medido no banco: a rodada 1 de outra sala
começou às 01:29:10, no lugar desta).

## 3. Arquivos alterados nesta frente

Produção:

| Arquivo | O que mudou |
|---|---|
| `public/assets/js/arena.js` | tratamento único de 401, guarda de revisão, confirmação de envio presa à tentativa, faixa de queda, releitura na volta do stream, limpeza de timers por sala |
| `public/assets/css/design.css` | faixa do painel (com reentrada) e chip da TV |
| `src/web/pages/index.mjs` | marcação da faixa do painel e do chip da TV |
| `src/db/schema.sql` | coluna `revision` em `arena_rooms` |
| `src/db/database.mjs` | migração **v9** (adiciona `revision`) |
| `src/db/repositories/arena.mjs` | gravação/leitura da revisão e do funil `avisarSala` |
| `src/server/admin-auth.mjs` | `check()` com motivo (ausente / expirada / inválida) |
| `src/server/api.mjs` | 401 com motivo e sem corpo enganoso |
| `src/server/arena-api.mjs` | revisão nos payloads de lobby/detalhe/TV |
| `src/server/events.mjs` | evento SSE carrega a revisão |
| `src/server/start.mjs` | revisão no estado inicial e no wiring |

Testes (novos): `test/api/sessao-expirada.test.mjs`,
`test/api/revisao-da-sala.test.mjs`, `test/db/migration-v9.test.mjs`,
`test/browser/sincronizacao.test.mjs`.
Testes (ajustados): `test/browser/css-render.test.mjs` (instrumento: ponteiro
longe do retrato), `test/browser/atualizacoes-ao-vivo.test.mjs`,
`test/api/arena-vigia-fila.test.mjs`, `test/db/database.test.mjs`,
`test/db/migration-unified.test.mjs`, `test/domain/arena-state.test.mjs`,
cartórios `test/css/render.json` (uma tela, justificado abaixo).

Documentação: `docs/ciclo-de-vida-das-salas.md` (estados, quem age em cada um, o
que cada tela mostra).

O working tree também carrega o trabalho **não commitado das duas frentes
anteriores** ("Nova batalha nesta sala" e revisão de cópia/juiz) — não é desta
rodada, mas roda junto nos portões.

## 4. Testes executados

| Portão | Comando | Resultado |
|---|---|---|
| Unitário + API + DB + domínio + cópia + CSS + web | `npm test` | **540 testes, 539 passam, 1 pulado** (SIGTERM: o Windows não entrega o sinal a outro processo), 0 falhas · 34,6 s |
| Navegador (Puppeteer, 34 cenários) | `npm run test:browser` | **34/34**, 0 falhas · 365 s |
| Portão de estilo (regravado) | `npm run test:browser` (3 rodadas extras do arquivo) | verde nas 3, sem intermitência |
| Aula completa pela tela | `node tmp/auditoria/sincronia-aula.mjs` | **13 passos, 0 falhas, 0 erro fatal**, nenhum aviso de console |

Regravação do cartório de estilo: **1 tela** (`sala-em-destaque-em-jogo__390x844`),
exatamente a do `:hover` do ponteiro. Comparação antes/depois em
`evidencias/cartorio-antes.json` × `evidencias/cartorio-depois.json`; as outras 25
telas não se moveram.

## 5. Evidência do fluxo completo (aula de verdade, pela tela)

Sala `856 051` — "QA SINCRONIA 2026-09-20 01:31", criada pelo formulário do
painel, com **3 alunos** em contextos de navegador separados (cookie próprio) e
**1 TV** em outro aparelho, tudo por clique:

- Rodrigo (professor) inicia a rodada 1 pelo botão do cartão; os três alunos caem
  na **mesma missão** ao mesmo tempo.
- **Clique duplo** da Ana: rótulos do botão lidos na tela
  `["Enviar prompt","Enviando…","Enviando…","Enviado ✓"]` e **uma** requisição
  `arena_submit` (o banco confirma: 3 envios, tentativa 1, um por aluno).
- **Queda forçada** da Carla (`setOfflineMode`): faixa de conexão aparece, a página
  **não** recarrega; na volta o aviso sai sozinho, sem recarregar.
- Professor encerra a rodada, **fecha os resultados** e abre a rodada 2: as três
  telas do aluno marcam **RODADA 02/03** e a TV projeta **RODADA 02/03**.
- Requisições no período: 1 `arena_start_round` por rodada, 1 `arena_end_round`,
  1 `arena_close_round`, **1 `arena_submit` por aluno**, 11–15 consultas de lobby
  por aluno (Carla com menos: ficou offline) — nenhum laço, nenhum 401.

Banco depois da aula: sala `playing`, ciclo 1, `revision 16`, rodadas
`1: closed · 2: open · 3: pending`, 3 participantes, 3 envios.

Prints em `evidencias/prints/` (12 telas), retratos do portão em
`evidencias/tela-1..4.txt`, log completo em `evidencias/aula-completa.json`.

## 6. Migração do banco (feita com backup)

Antes de qualquer alteração: `npm run backup-banco` (integridade `ok`, 49 salas /
98 desafios / 127 rodadas / 56 envios). O primeiro boot com o código novo migrou
para a **v9** e reconstruiu `room_rounds`: mesmas 127 rodadas e 56 envios, todas no
ciclo 1 — nada perdido.

## 7. Limitações ainda existentes

1. **O juiz local está fora** (`gemini_invalid_numeric_output` / juiz indisponível):
   nesta rodada os alunos viram a mensagem honesta "juiz indisponível, a nota será
   concluída automaticamente" e o envio ficou guardado. Ou seja: a *entrega* e a
   *recuperação* estão provadas; a **nota chegando sozinha com Gemini real não foi
   medida nesta sessão** (foi medida na frente anterior com juiz de mentira e com o
   juiz voltando, em `test/browser/envio-pendente.test.mjs`).
2. **Uma sala de sondagem foi tocada por engano**: o seletor solto do roteiro (item
   6) iniciou a rodada 1 da sala `890 897` ("QA NOVA BATALHA 22:28"), que é uma sala
   **de teste minha**, não uma aula real. Não houve destruição de dado; a sala ficou
   com a rodada 1 aberta.
3. **Teste de 30 alunos / 90 envios não foi executado** nesta sessão.
4. A TV só entra pela sessão de projeção (`/tv.php?code=...`, gerada no painel);
   `/tv.php?pin=<código>` não sobe — comportamento atual, não é defeito novo.
5. `npm run test:browser` leva ~6 min nesta máquina (um navegador real por arquivo,
   `--test-concurrency=1`).

## 8. Como rodar localmente

```bash
npm install
npm start                 # = node src/server/start.mjs  (lê .env; PORT do .env)
npm test                  # portão 1: unitário/API/DB/CSS/web
npm run test:browser      # portão 2: navegador real
node tmp/auditoria/sincronia-aula.mjs   # a aula completa pela tela (exige servidor em :3000)
```

O servidor **não observa arquivos**: mudou `src/`, `public/` ou página gerada,
reinicie o processo. Antes do primeiro start com código novo, `npm run backup-banco`.

## 9. Pontos que precisam ser revisados antes de publicar

1. **Rodar a aula com Gemini real** (3 alunos, uma rodada) e conferir a nota
   chegando sozinha, com procedência `gemini` no banco e a mesma nota no aluno, no
   professor e no relatório.
2. **Conferir a migração v9 em produção** com backup e janela combinada — ela
   reconstrói `room_rounds`.
3. **Rodar o cenário de 30 alunos / 90 envios** medindo tempo até a nota, pendências
   e duplicações.
4. Revisar o texto da faixa de sessão expirada e do chip da TV em tela de sala de
   aula (projetor, luz do dia).
5. Decidir se a "Nova batalha nesta sala" (frente anterior) entra neste mesmo pacote
   de publicação.
6. `git status`: nada foi commitado nesta rodada; o pacote inteiro está no working
   tree, junto com as duas frentes anteriores.
