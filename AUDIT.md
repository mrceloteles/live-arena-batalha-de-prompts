# Auditoria da matriz funcional

Data da última verificação: 2026-09-17.

## Revisão de prontidão — 2026-09-17 (continuação) — "6,17 PTS": a espera pela nota lia o meio da animação

A verificação pré-deploy registrou `npm run test:browser` com 27 aprovados e 1 falha
em `test/browser/envio-pendente.test.mjs`: a tela mostrava **6,17 PTS** e o teste
esperava "83". A falha é intermitente — a suíte completa passou 28/28 nesta máquina
antes e depois da correção —, mas o defeito **não é só sorte ruim**: a asserção
media a coisa errada, e isso foi medido, não suposto.

### O mecanismo (medido)

A nota do aluno é um count-up de 1,2 s, e o painel fica visível ANTES de o número
fechar. O teste esperava `/83/` no `textContent` e lia o valor logo em seguida. Isso
não é esperar pelo fim da animação: é esperar por um **pedaço** do número. O
instrumento `tmp/qa/quadros-83.mjs` registra cada quadro da animação e quais
contêm "83":

| Quadro | Texto | Contém "83"? |
| --- | --- | --- |
| 3 ms | `5,83 PTS` | sim |
| 20 ms | `9,09 PTS` | **não** — é o quadro que a asserção leria |
| 139 ms | `31,83 PTS` | sim |
| 756 ms | `79,83 PTS` | sim |
| 1027 ms | `82,83 PTS` | sim |
| fim | `83 PTS` | sim (o valor) |

"6,17 PTS" é 83 × `easeOut` a ~30 ms: um quadro inicial de uma animação que ia até
83. O quadro seguinte nunca repete "83", então a leitura depois do casamento cai
em qualquer número — e reprova.

**O contrato da aplicação está certo, e foi conferido antes de mexer no teste:**
na Arena (fora do clássico) o painel mostra `points` — que é o percentual do juiz
multiplicado pelo peso de velocidade do desafio (`calculateArenaPoints`), 1,00
quando o peso é `none`, como no desafio desta turma — formatado em pt-BR com até
dois decimais e o sufixo `PTS`. `83` é a escala certa; quem esperava errado era a
espera.

### A correção

A espera passa a ser pelo valor **assentado**, que é o que a própria página
declara: `textContent === el.dataset.target`. O teste da prévia
(`arena-ui.test.mjs`) já usava exatamente esse par — era este cuidado que faltava
no teste novo. A asserção ficou mais forte, não mais frouxa: `assert.equal(nota,
'83 PTS')` em vez de um `match(/83/)` que aceitava qualquer número que contivesse
83; o segundo caso do arquivo, que só exigia texto não vazio, passou a exigir o
mesmo valor exato.

### O defeito que apareceu no caminho: o primeiro quadro era negativo

O mesmo instrumento mostrou o primeiro quadro da animação em **"-0,94 PTS"** (2 de
3 execuções) e **"-2,64 PTS"**: o quadro recebe o instante em que ele COMEÇOU, que
pode ser anterior ao `performance.now()` do disparo, e `time - start` ficava
negativo. O piso em zero (`Math.max(0, time - start)`) faz o número começar em 0.

### Provas

| Portão | Resultado |
| --- | --- |
| `npm test` | **510** — 509 passando, 1 pulado (o `SIGTERM` real, que este Windows não entrega), 0 falhas |
| `npm run test:browser` | **28/28**, 0 falhas, 0 pulados, 235 s |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas |

O caso de tela prende as duas coisas no mesmo fluxo: o relógio da página adiantado
em 50 ms fixa a defasagem do primeiro quadro (para o defeito ser comprovável em vez
de sorteado), o `MutationObserver` guarda cada quadro, e a asserção exige que
nenhum seja negativo e que o último seja `83 PTS`. **Mordida:** sem o piso em zero,
o teste reprova com `nenhum quadro mostra nota negativa (leu: ["-13,13 PTS",
"-5,77 PTS","-2,2 PTS"])`; com ele, passa. `arena.js` e o teste voltaram idênticos
após a mordida (`md5` conferido).

## Revisão de prontidão — 2026-09-17 (continuação) — O contexto de build sai de 1 323 MB para 8,5 MB

O `Dockerfile` copiava `COPY . .` e o `.dockerignore` não conhecia `output/`
nem `arena/`. Medido com `node tmp/qa/contexto-docker.mjs` (que aplica as regras do
próprio arquivo): o contexto carregava **1 323,3 MB** — 1 228,9 MB de `tmp/`
(diagnóstico e capturas de QA), 84,2 MB de `output/`, 1,1 MB de `arena/`. Nada
disso é servido nem carregado pelo servidor: ele lê `src/` (incluindo o
`schema.sql`, aberto em runtime) e `public/`.

Agora são **duas barreiras**: o `.dockerignore` exclui os artefatos locais
(`tmp`, `output`, `arena`, `.freebuff`, `*.log`, PNGs soltos na raiz) e o
`Dockerfile` copia por caminho — manifestos primeiro (a camada de dependências só
muda quando eles mudam), depois `src/` e `public/` com `--chown=node:node`.

| Medida | Antes | Depois |
| --- | --- | --- |
| Contexto de build | 1 323,3 MB | **8,5 MB** |
| Conteúdo copiado | árvore inteira | 74 arquivos, **8,10 MB** (src 47 + public 24 + 3 manifestos) |
| `.env`, banco, capturas de QA, `tmp/`, `output/`, `arena/` | no contexto | ausentes |

**O build da imagem NÃO foi executado**: não há `docker`, `podman`, `nerdctl`,
`buildah` nem WSL nesta máquina, e o tamanho da imagem não é declarado sem
medição. O que foi provado, e é o que mais importa do COPY seletivo, é que o
conjunto copiado **sobe**: `node tmp/qa/imagem-sobe.mjs` replica o conjunto do
`Dockerfile` num diretório isolado e o inicia como a imagem inicia
(`NODE_ENV=production`, credenciais por ambiente, banco no caminho do volume) —
`/healthz` 200, `/readyz` 200 (`hosting=volume-persistente`,
`database=ready`), as folhas e o cliente da Arena servidos em
`/public/assets/...`, `/play` 200, banco criado no caminho do volume e nenhum
artefato local dentro do subconjunto.

## Revisão de prontidão — 2026-09-17 (continuação) — Falha do provedor deixa de virar nota, e passa a ter pátio

A rodada anterior tirou a heurística local do primeiro lugar: 429 e 5xx se repetem com espera antes de
ela entrar (`src/judge/retry.mjs`). Faltava a pergunta seguinte — **e quando as repetições também
falham?** A resposta, até aqui, era a nota heurística: uma nota que ninguém avaliou, com cara de
avaliada. Medida na auditoria, ela produziu **6 de 6 notas locais** numa turma com o projeto bloqueado.

Agora a avaliação que o provedor não entregou é **estacionada** (`src/judge/parking.mjs`) e
reprocessada com espera crescente. A heurística local não sumiu — ela responde por **configuração**
(sem chave) e por **regra** (texto ilegível), que são casos em que não existe avaliação a pedir ao
provedor. Falha do provedor deixou de ser um terceiro motivo, **nos dois modos com provedor**.

### O que muda no que se vê

| Desfecho | Aluno | Professor | Banco |
| --- | --- | --- | --- |
| Provedor volta na 1ª tentativa do pátio | "Resposta guardada. O juiz está indisponível agora: a nota será concluída automaticamente" — e a nota aparece sozinha | nota com procedência do provedor | **1 nota do provedor, 0 heurísticas** |
| Pátio esgotado (4 tentativas) | a resposta segue guardada; repetir reavalia a MESMA tentativa | envio visível **sem** avaliação + aviso no `/readyz` | **0 notas** |
| Teto de custo da instalação estourado | recusa recuperável (503 + `Retry-After`) e o pátio assume | idem | 0 notas até a hora virar |
| Cancelamento pelo encerramento | falha explícita (não espera o timeout) | idem | 0 notas agora — a submissão volta para a fila na próxima subida |

| Regra do pátio | Valor |
| --- | --- |
| Reprocessamentos depois da falha no envio | 4 |
| Espera | 5 s dobrando (10/20/40 s), com `Retry-After` quando maior e teto de 60 s |
| Dedupe | uma entrada por submissão: repetir o envio nunca abre uma segunda avaliação |
| Tarefa | reavalia **só se a nota ainda não existir** — "reprocessar" não é "avaliar de novo" |
| Visibilidade | `judge_parking` no `/readyz` (`parked`, `attempts`, `resolved`, `exhausted`, `cancelled`, `next_retry_ms`) + `judge_parking_resume` (o que a subida encontrou) + aviso (sem bloquear) quando `exhausted > 0` |
| Reinício/redeploy | as esperas saem da MEMÓRIA, não da fila: a submissão sem nota no banco é retomada no boot do processo seguinte |
| Encerramento | as esperas saem com o processo, com a linha no log dizendo para onde vão |

O aviso do `/readyz` é **aviso**, não impedimento: um 503 ali faria o host reciclar à toa um processo
que continua atendendo as outras salas. O que não pode é a nota que não chegou ficar invisível.

### As quatro provas

`test/api/arena-estacionamento.test.mjs` roda o adaptador **de verdade** (`createJudges` do modo
`gemini`, com o `fetch` trocado pelo provedor):

1. provedor falha e volta — a resposta é `pending` + `parked` com o motivo (`gemini_http_429`), o banco
   fica com **0 notas**, e o pátio entrega a nota do provedor (86%, modelo do provedor) sem ninguém
   repetir; o professor vê `judge.local: 0`;
2. provedor não volta — `exhausted: 1`, **0 notas** (o comportamento antigo gravaria `arena-fallback-v1`
   aqui), a submissão segue `received` e o professor vê a missão com envio e sem avaliação; repetir
   também não inventa nota;
3. repetir durante a espera não duplica: 3 chamadas ao provedor no total, 1 nota, e o pátio não gasta
   chamada quando vence (a nota já existe);
4. a recusa do teto da instalação também estaciona — a nota chega quando a hora vira, sem o aluno clicar.

`test/judge/parking.test.mjs` cobre a mecânica (dedupe, teto de tentativas com contagem de desistência,
`Retry-After` com teto, cancelamento, `stop()`); `test/browser/envio-pendente.test.mjs` cobre a tela: a
mensagem "guardada", a nota chegando sozinha e **uma** nota no banco.

### Mordidas (cada uma desfeita e restaurada byte a byte, `md5` conferido)

| Desfazer | O que reprova |
| --- | --- |
| o modo `gemini` volta a pedir a nota local em falha (`onProviderFailure`) | 3 casos da API + 3 do juiz (a heurística volta a ser gravada) |
| a tarefa do pátio deixa de checar se a nota já existe | o caso da repetição: `o pátio não gastou chamada: a nota já existia` |
| a recusa do orçamento deixa de estacionar | o caso do teto: `a nota chegou sem novo envio do aluno` |
| a tela volta a dizer "conferindo o envio" para a tentativa estacionada | o caso de navegador (a mensagem "guardada" não aparece) |

### Dois defeitos encontrados durante a implementação

1. **O cliente tinha dois lugares para a mesma mensagem.** O envio escrevia "guardada" e o redesenho da
   sala (`renderMission`) reescrevia "Conferindo o envio" por cima — a tela nunca mostrava o que o
   servidor havia respondido. Corrigido com o estado da tentativa estacionada, que a tela respeita
   enquanto a nota não chega. Sem isso, o `parked` do servidor seria invisível para o aluno.
2. **O `ReferenceError` que o próprio teste de navegador pegou.** A primeira versão da mensagem usava
   `roundId`, que existe no manipulador de envio e **não** em `renderMission`: o envio caía no `catch` e
   a tela dizia "não foi possível confirmar o envio" **com a resposta 200 na mão**. Só apareceu porque o
   teste olha a tela, não o JSON.

### Limites declarados

1. **Um vigia por processo, não um agendador distribuído.** A fila vive no banco (submissão sem nota) e
   cada instância a varre enquanto está de pé (`JUDGE_PARK_SWEEP_MS`, padrão 60 s). Com uma instância por
   instalação — premissa já documentada — isso é uma varredura por vez. Duas instâncias sobre o mesmo
   banco fariam as duas varreduras; o dano seria pequeno (o pátio de cada uma tem dedupe próprio, e o
   banco recusa nota dupla), mas a premissa continua sendo uma instância. A janela é de 24 h e só cobre
   salas vivas (`draft`/`waiting`/`open`/`playing`).
2. **Cancelamento (encerramento) não se estaciona neste processo** — e não se perde: a submissão
   continua sem nota no banco e a próxima subida a retoma. A tentativa interrompida CONTA para o teto
   (houve chamada ao provedor), então um laço de reinícios no meio de avaliações consome tentativas;
   a alternativa — nota heurística `gemini_cancelled` — era exatamente a mentira que esta rodada removeu.
3. **O fluxo clássico legado (`createApi`) não estaciona**: ele está bloqueado em produção e não tem a
   linha de submissão que a Arena usa. Nele, a falha do provedor sai como erro explícito, sem nota local.
4. **O `403` continua não se repetindo** (definitivo): ele vai direto para o pátio, que tenta de novo em
   5 s, 10 s, 20 s e 40 s — é isso que faz a turma receber as notas quando o operador conserta a chave.

### A porta por onde a heurística ainda podia nascer

O pátio resolve o caminho, mas a decisão de estacionar morava num **parâmetro**: os dois adaptadores
nasciam com `onProviderFailure = 'fallback'` e só o ponto único de política passava `'throw'`. Ou seja,
bastava alguém construir um juiz com chave e **esquecer o parâmetro** para a nota heurística voltar a
ser prêmio de consolação por falha do provedor — a mesma mentira, por outra porta. O padrão passou a ser
`'throw'` (`src/judge/criteria-judge.mjs`, `src/judge/source-compatible-judge.mjs`): o comportamento
antigo continua existindo, agora como opt-in explícito de quem escreve `onProviderFailure: 'fallback'`.

Os testes que medem o contrato histórico do pacote-base (as 47 observações de equivalência e a nota
`source-fallback-v1`) passaram a declarar o opt-in — não foram apagados nem relaxados. E dois casos
novos prendem o padrão: *esquecer `onProviderFailure` não faz a heurística voltar* e
*esgotadas as repetições, sai o sinal do pátio — nunca uma nota local*. **Mordida:** devolvendo os dois
padrões para `'fallback'`, **5 casos** do juiz reprovam (os arquivos voltaram idênticos, `md5` conferido).

**Portões no estado do disco:** `npm test` **503/503** (24 s; 502 passando e 1 pulado, o `SIGTERM` real,
que este Windows não entrega) e `npm run test:browser` **27/27** (228 s). `git diff --check` limpo.

### A fila é o banco: um reinício deixou de custar a nota de quem já tinha enviado

O pátio vive na memória do processo, então um redeploy (ou um reinício) descartava as esperas — e a
submissão que esperava nota ficava sem nota **até o aluno reenviar**. Era o limite nº 1 declarado acima,
e o mais caro da lista.

A fila, porém, nunca esteve na memória: submissão sem linha em `arena_scores` é exatamente "ainda
esperando nota", e `arena_judge_attempts` guarda as tentativas gastas. O que morria com o processo era só
o relógio de espera. A retomada passou a ser uma **leitura do banco**
(`retomarEstacionadas`, `src/server/arena-api.mjs` + `submissions.listAwaitingScore` no repositório) —
nada precisa ser gravado no instante da falha, nem no encerramento, nem no meio de uma avaliação. É ela
que o boot chama uma vez e que o **VIGIA** repete enquanto o servidor está de pé, de modo que a
recuperação não depende nem de reinício (a fila é do banco) nem de reenvio do aluno (o vigia insiste).

O que a varredura respeita:

| Regra | Valor | Por quê |
| --- | --- | --- |
| Intervalo do vigia | `JUDGE_PARK_SWEEP_MS`, padrão 60 s (`0` desliga) | uma consulta por minuto; o boot segue retomando |
| Tentativas seguidas (surto) | 4, como antes | o provedor que piscou volta em segundos |
| Resfriamento | `JUDGE_PARK_REARM_MS`, padrão 10 min | o surto esgotado não vira surto novo a cada varredura |
| Rearmes | `JUDGE_PARK_REARMS`, padrão 6 — e **um** tentativa por rearme | o provedor que volta depois é aproveitado; o teto do custo da instalação continua por cima |
| Teto da história | 1 (envio) + 4 + 6 tentativas por submissão | finito e escrito, não "enquanto o servidor estiver de pé" |
| Sala | só `draft`/`waiting`/`open`/`playing`, janela de 24 h | aula encerrada não dispara avaliação |
| Teto de tentativas | conta através dos reinícios (vem de `arena_judge_attempts`) | reiniciar não dá tentativas novas — dá, no máximo, um rearme espaçado |
| O que já está na fila | não é reestacionado (`patio.has`) | a varredura não bate na porta que já está respondendo |
| Rajada | esperas escalonadas em 150 ms e piso de 1 s | uma turma inteira retomada não vira rajada no mesmo milissegundo |

A prontidão mostra as duas metades: `judge_parking_resume` é o que a **última** varredura viu
(`found`, `resumed`, `rearms`, `cooling`, `running`, `exhausted`) e `judge_parking_watch` é o **acumulado**
desde a subida (`sweeps`, `recovered`, `rearmed`) — sem o acumulado, um caso recuperado desapareceria da
leitura seguinte e o operador não teria como saber que a rede funcionou.

**A prova de reinício é de DOIS processos** (`test/smoke/parking-durable.test.mjs`): duas instâncias de
produção (`src/server/start.mjs`) com HTTP e banco em arquivo, o provedor trocado pelo caminho que existe
para isso (`GEMINI_BASE_URL`). A instância A aponta para um endpoint que só recusa (503) e é morta com
`SIGKILL` — sem encerramento gracioso, de propósito, para que nada possa depender de um hook de saída. A
instância B sobe sobre o MESMO banco, apontando para um endpoint que responde: o `/readyz` dela diz
`found: 1, resumed: 1` (e `judge_parking_watch.running: true`), e a missão passa a `scored: 1` com 90%
**do provedor** (`judge.local: 0`), sem ninguém reenviar nada e sem a página do aluno aberta.

**A prova sem reinício é o vigia** (`test/api/arena-vigia-fila.test.mjs`, servidor de verdade + HTTP): o
pátio é parado com o processo de pé — a avaliação deixa de estar na fila de quem poderia tentá-la — e a
varredura seguinte a recolhe do banco; a nota chega sozinha, o `/readyz` mostra `recovered` e `sweeps`, e
o caso inclui a perda mais cruel: uma **submissão órfã**, gravada e nunca julgada (a janela em que a
requisição morre entre o INSERT e a avaliação), que também é recolhida e avaliada.

`test/api/arena-estacionamento.test.mjs` cobre a varredura em processo: fila retomada, resfriamento
segurando o rearme, rearme dando **uma** tentativa (não um surto), teto de rearmes, o que já está na fila
sendo ignorado e a sala encerrada ficando de fora. `test/judge/parking.test.mjs` prende a mecânica pura
(`attemptsAllowed`: a entrada rearmada recebe uma tentativa; a retomada é a terceira, não a primeira).

| Desfazer | O que reprova |
| --- | --- |
| o boot deixa de retomar | o caso de dois processos: `B precisa relatar a retomada` (e a nota nunca chega) |
| o boot deixa de ligar o vigia | o caso de dois processos: `o vigia entra em operação no boot` |
| a retomada ignora as tentativas já gastas | 4 casos: o teto volta a valer por processo, não por história |
| o teto deixa de cortar a retomada | o caso do teto: a subida dá novas tentativas ao provedor |
| a varredura ignora o resfriamento | `surto esgotado não vira surto novo` (o rearme vira rajada) |
| a varredura ignora o teto de rearmes | `o vigia rearma até o teto de rearmes` (a fila nunca para) |
| a varredura deixa de pular o que já está na fila | `o que já está na fila não é reestacionado pela varredura` |

## Revisão de prontidão — 2026-09-17 (continuação) — A fila de quem espera nota sai da prontidão e entra no painel

A seção anterior resolveu a PERDA da fila (reinicío, vigia, teto). Faltava o outro lado da palavra
"fila": ela era visível em `/readyz` — número de avaliações estacionadas, quantas esperam — e em
nenhum outro lugar. Na tela onde o professor decide durante a aula, uma submissão sem nota aparecia
apenas como `1 envio · 0 avaliados`.

Isso não responde a pergunta que ele tem: **a nota volta sozinha ou depende de alguém?** Sem ela, as
saídas possíveis (esperar, pedir novo envio ao aluno, reabrir a missão, chamar quem opera o servidor)
são indistinguíveis na tela — e o professor escolhe no escuro, no meio da aula.

### O que o painel passou a mostrar

Um bloco acima das seções longas do detalhe da sala, que **só existe quando existe pendência** (um
painel que anuncia "nenhuma pendência" ocupa a primeira tela para não informar nada). Cada linha traz
nome, missão, tempo de espera, o motivo e — o que decide a ação — se a nota volta:

| Estado | O que a tela diz | O que o professor faz |
| --- | --- | --- |
| `na_fila` | "na fila — nova tentativa em N s" | espera: o pátio está de pé e a nota vem |
| `avaliando` | "avaliando agora" | espera: a avaliação está em voo neste instante |
| `vai_retomar` | "volta sozinha — a recuperação automática a retoma" | espera: o relógio se perdeu (reinício), a fila é do banco e o vigia a pega |
| `esgotada` | "não volta sozinha — as tentativas automáticas se esgotaram" | pede novo envio (ou reabre a missão): o teto da história foi gasto |
| `encerrada` | "sala encerrada — a aula não está mais em andamento" | sabe que a aula acabou: ninguém mais vai buscar essa nota |
| `fora_da_janela` | "fora do prazo — o envio é mais antigo que a janela de recuperação" | idem, com a causa certa (24 h), em vez de "sumiu" |

O motivo sai do vocabulário que o painel **já** usava para a nota do juiz local (`failure.mjs` +
`budget.mjs`): "cota do provedor", "erro do provedor", "tempo esgotado no provedor", "fila da
instalação cheia". Um mesmo rótulo para a mesma falha em toda a tela — traduzir a mesma causa de dois
jeitos faria o professor procurar dois problemas.

### De onde os dados vêm (e por que não de um lugar só)

A fila é o **banco** (submissão sem linha em `arena_scores`), e o **pátio** só diz se o relógio da
reprocessagem está de pé neste processo. As duas coisas juntas respondem o que a tela pergunta; separadas,
nenhuma responde. Os dados já estavam carregados no detalhe (submissões, notas e tentativas por rodada,
para o ranking e para a procedência): cruzar as três custou **zero consulta nova**.

- `patio.pending()` (novo, em `src/judge/parking.mjs`) — a visão **por entrada** do pátio, que até aqui
  só existia resumida em `state()`. Traz o motivo fresco e o `nextRetryInMs`.
- O motivo que **sobrevive ao processo** sai do rastro gravado: a tentativa de avaliação guarda o erro
  como texto, e `failure.mjs` escreve o vocabulário entre parênteses (`... (gemini_http_429)`), enquanto
  `budget.mjs` nomeia o teto em `orcamento_esgotado` / `fila_cheia`. Não reconhecer nada é resultado
  aceitável — a tela diz "motivo não registrado" em vez de inventar uma causa.
- Motivos de **retomada** (`vigia`, `vigia_rearme`, `retomada`) não vão para a tela: eles dizem *como* a
  avaliação voltou para a fila, não *por que* ela saiu da nota. Quando a entrada está nesse estado, o
  motivo mostrado é o da última tentativa gravada.

### Um defeito encontrado ao implementar (e que a tela quase escondeu)

A primeira versão decidia "a sala está viva?" pela fase canônica (`roomPhase(...) !== 'finished'`). O
caso `sala encerrada: a nota não volta sozinha` reprovou com `vai_retomar`: `roomPhase` olha a **rodada**
antes do status da sala, então uma sala `ended` que ainda tem uma missão `open` reporta `playing`. A
tela diria ao professor que a nota volta sozinha quando ninguém mais iria buscá-la — a promessa invertida
do que a seção anterior levou uma rodada para corrigir. A decisão passou a usar
`AWAITING_ROOM_STATUSES`, **importada do repositório**: é a mesma lista que a retomada do pátio usa
(`submissions.listAwaitingScore`), e duas listas divergentes fariam o painel prometer uma retomada que o
vigia não faria.

### Contraste do bloco novo, medido

o bloco reusa a família âmbar do alerta de missão incompleta (`#fff8e6`), e as linhas são branco a 75%
sobre esse âmbar — a composição real, não branco puro. Medidos com o instrumento da própria guarda
(`tmp/qa/medir-espera.mjs`, local e não versionado — o que fica são os números):

| Elemento | Par | Razão |
| --- | --- | --- |
| título do bloco (14px) | `#8a5300` sobre `#fff8e6` | 5,97 |
| resumo e resto da lista (12,5px) | `#7a4b00` sobre `#fff8e6` | 6,99 |
| nome na linha (13px 700) | `#001c50` sobre a linha composta | 16,12 |
| missão e tempo (12px) | `#5f6368` sobre a linha composta | 5,95 |
| estado em espera (12px 800) | `#8a5300` sobre a linha composta | 6,23 |
| estado sem retorno (12px 800) | `#b3261e` sobre a linha composta | 6,43 |
| motivo da linha (12px) | `#7a4b00` sobre a linha composta | 7,29 |

Menor razão do bloco: **5,95** (piso AA 4,5 para 12 px). O cinza da casa (`--gray`, `#949494`) daria
**2,9:1** sobre este âmbar — ele foi trocado pelo cinza escuro que o produto já usa nas telas clássicas
(`#5f6368`), em vez de achar que "secundário" justifica texto apagado.

As duas guardas de CSS foram regeradas com revisão do diff: `test/css/cascata.json` ganhou **12
seletores** (os do bloco, um a um) e `test/css/contraste.json` subiu 442 → **450** na família "tinta sem
fundo na chave" — as declarações de tinta deste bloco, que a aritmética da guarda não alcança porque o
fundo que as pinta está na regra do PAI (a mesma situação de 442 declarações que já existiam no produto).
Nenhum par abaixo do teto AA foi introduzido: a guarda principal passou sem exceção.

### Geometria medida (o teste de tela prova o conteúdo, não o tamanho)

Medição com a aplicação montada e o bloco populado (`tmp/qa/geometria-fila-painel.mjs`, local; capturas
em `output/qa/fila-no-painel-*.png`):

| Cenário | Linhas listadas | Altura do bloco | Topo | Estourou a largura? |
| --- | --- | --- | --- | --- |
| 1440 × 900, 3 envios | 3 (≈60 px cada) | 246 px | 367 px (dentro da dobra) | não |
| 1440 × 900, 12 envios | 8 (o corte) + "e mais 4" | 600 px | 367 px | não |
| 390 × 844, 8 envios | 8 (≈106 px cada, com o texto quebrando) | 989 px | 865 px | não |

Nenhuma linha estoura a largura da coluna, nem com "Aluno com nome comprido 1" em 390 px. O bloco fica
**depois** do estado e dos controles da sala de propósito: com 12 pendências ele empurraria pausar/encerrar
para fora da primeira tela, e a fila é detalhe operacional — não a ação da aula. O preço está declarado
nos limites abaixo: no celular ele começa abaixo da primeira dobra.

### Provas

| Portão | Resultado |
| --- | --- |
| `npm test` | **510** — 509 passando, 1 pulado (o `SIGTERM` real, que este Windows não entrega), 0 falhas, 25 s |
| `npm run test:browser` | **28/28**, 0 falhas, 269 s |
| Testes novos | `test/api/arena-fila-no-painel.test.mjs` (7 casos, um por desfecho) e `test/browser/painel-fila-notas.test.mjs` |
| CSS | 47/47 nas três guardas (cascata, classes vivas, contraste + catraca) |

O caso de tela é o aceite inteiro de uma vez: um aluno envia com o provedor fora (a submissão fica sem
nota), o professor abre o painel e lê o bloco com **nome, missão, tempo, motivo e prazo**; ninguém recarrega
nada, o provedor volta, o pátio reprocessa — e o bloco **some sozinho** enquanto a missão passa a `1
avaliados`. Os sete casos de API fixam um desfecho cada (na fila, avaliando, volta sozinha, esgotada, sala
encerrada, fora da janela, e a fila sendo **da sala**).

**Mordidas** (cada uma desfeita e restaurada byte a byte, `md5` conferido):

| Desfazer | O que reprova |
| --- | --- |
| o detalhe devolve `waiting.items` vazio | 6 dos 7 casos de API |
| o cliente deixa de desenhar o bloco | o caso de tela: `o clique não teve efeito: abrir o detalhe da sala com a fila de avaliação visível` |
| o motivo vai `null` para a tela | 3 casos: o motivo do provedor, a sala encerrada e o surto esgotado |

### Limites declarados

- **O relógio da fila continua sendo do processo.** O painel diz `na_fila` só enquanto o pátio deste
  processo tem a entrada; depois de um reinício ele diz `volta sozinha` — que é a verdade (a fila é o
  banco e o vigia a retoma), e não uma mentira: o que se perde é a precisão do "em N segundos".
- **A lista mostra 8 linhas** e resume o resto (`… e mais N envio(s)`). Numa turma de 35 com o provedor
  fora, a lista completa é rolagem sem informação nova: o que decide é o cabeçalho (quantos e se voltam).
- **No celular o bloco começa abaixo da primeira dobra** (topo em 865 px de 844): ele vem depois do
  estado e dos controles da sala, que são a ação da aula. Numa tela de 390 px cada linha ocupa ~106 px
  (o texto quebra); o cabeçalho — quantos e se voltam — é o que se lê primeiro, e ele está no topo do
  bloco. Não é um defeito escondido, é uma ordem de prioridade escolhida.
- **Instância única** continua sendo a premissa: o pátio, o teto da hora e o hub são locais ao processo.
- **O aluno não vê nada disso** e não precisa: a tela dele já diz que a resposta foi guardada e que a
  nota vem. Este bloco é da decisão de quem conduz a aula.
- **`/readyz` continua sendo a visão da máquina** (contagens, teto, retomada). O painel é a visão de quem
  dá aula; um não substitui o outro, e os dois leem a mesma fila.

## Revisão de prontidão — 2026-09-17 (continuação) — Etapa 3: SLA do envio, teto de avaliações e procedência das notas

A Etapa 3 do plano tinha três defeitos concretos, e o primeiro era uma mentira na tela do aluno.

### O envio deixou de anunciar falha enquanto o servidor avalia

A avaliação externa tem 12 s de timeout **mais uma repetição**; o cliente desistia em 12 s. O aluno
lia "não foi possível confirmar o envio" — ou esperava, sem saber — enquanto o servidor continuava
avaliando, e a nota só aparecia se ele clicasse de novo. Agora:

| Regra | O que ela impede |
| --- | --- |
| o servidor responde `pending` após `SUBMIT_WAIT_MS` (8 s), com id da submissão e tentativa | o navegador desistir de uma avaliação que continua acontecendo |
| o cliente espera 15 s (acima do prazo do servidor) | falha de rede inventada por um prazo curto demais |
| a tela diz "recebida, a avaliação continua" e não "avaliado!" | anunciar nota que ainda não existe |
| uma avaliação **em voo por submissão** não é reaberta por um segundo pedido | duas chamadas ao provedor e duas gravações para a mesma nota |
| o servidor avisa a sala quando a nota fica pronta (`arena_score_ready`) | a nota esperar o próximo ciclo de consulta (até 8 s, porque com SSE recente o poll é aliviado de propósito) |
| o lobby já mostrava `received` vs `scored` | a tela ficar sem estado entre o envio e a nota |

A submissão única por `(rodada, participante, tentativa)` e a nota única por submissão já existiam no
banco; o que faltava era o servidor **não** reabrir a avaliação em voo — e é isso que o teste prende.
Repetir o envio passou a ser exatamente o que a mensagem promete: consultar/concluir a MESMA
avaliação, sem custo novo.

### Teto de avaliações externas por instalação

"Várias avaliações simultâneas não têm teto global" era o texto da auditoria. Agora há três:
`JUDGE_CONCURRENCY` (4), `JUDGE_CALLS_PER_HOUR` (400) e `JUDGE_QUEUE_MAX` (64), com o estado publicado
no `/readyz` (`judge_budget`). O lugar do teto é por **avaliação**, não por requisição HTTP: uma
avaliação que repete por erro 500 do provedor gasta um lugar, não dois.

A recusa é **recuperável** (503 + `Retry-After`, mensagem dizendo que a tentativa está preservada) e
não vira nota local. A decisão foi tomada contra a alternativa óbvia: fila cheia não é falha do
provedor, é limite próprio e passageiro, e comprar uma nota heurística permanente por um pico de fila
seria pior que pedir para repetir, com a tentativa intacta. **Atualização da mesma data:** a recusa
passou a também estacionar a avaliação no pátio, então a nota chega mesmo que o aluno não repita — e a
promessa de "cair no fallback quando o provedor falha" foi substituída por "estacionar e reprocessar"
(ver a seção **Falha do provedor deixa de virar nota, e passa a ter pátio**, no topo deste arquivo).

### O professor vê de onde veio cada nota

A procedência vem do **metadado gravado na tentativa de avaliação** (`response_json`), não de
adivinhação pelo nome do modelo, e chega ao detalhe da sala por uma consulta por rodada
(`judgeAttempts.listByRound`) — não uma por aluno, porque o detalhe é relido durante a aula. Cada
nota carrega provedor, modelo, se o juiz local assumiu e o motivo; a rodada traz o resumo
("2 de 5 nota(s) vieram do juiz local (1× cota do provedor)"), que o painel escreve em português.

### Carga com juiz stub: o desenho medido, não a promessa

`npm run carga` sobe a instalação com um **stub** (sem rede, sem cota) e mede o que a turma sente. Com
o stub dentro do teto, como em produção:

| Cenário | p50 | p95 | pendentes | chamadas ao provedor |
| --- | --- | --- | --- | --- |
| 35 alunos · 3 missões · stub 120 ms | 672 ms | 1,2 s | 0 | 35 (1,00 por submissão) |
| 50 alunos · 12 missões · stub 300 ms | 2,2 s | 3,7 s | 0 | 50 (1,00 por submissão) |
| 35 alunos · stub 900 ms | 4,6 s | 8,1 s | 3 | 35 (1,00 por submissão) |

Nenhuma falha, 35/50 streams de tempo real abertos, lobby de 5,5 KB (35 alunos) e 9,4 KB (50), e o teto
fechando em `spent_last_hour` igual ao número de submissões. O último cenário é o que mostra o SLA
funcionando: com provedor lento, a cauda da turma recebe "pendente" em vez de esperar, e **todas** as
notas terminam gravadas.

### A mesma medição numa instalação real, e não na mesma pilha do arnês

O stub acima mede o desenho dentro do processo que o mede. Faltava a medição que a auditoria pedia —
35 e 50 clientes, SSE, banco escolhido — numa instalação **de verdade**: `npm run carga:http` sobe
`npm start` em **processo separado**, com banco em arquivo, HTTP e SSE reais e a política de juiz vinda
do ambiente.

A peça que faltava era a fiação: os quatro adaptadores já aceitavam `baseUrl`, mas o caminho de
produção só sabia falar com o endpoint de fábrica — então a única medição autorizada (provedor
controlado, sem cota e sem prompt de aluno saindo da máquina) só existia se alguém injetasse uma função
no lugar do adaptador, medindo o desenho e não o caminho real. Agora existe `GEMINI_BASE_URL`: URL torta
falha o boot, e endpoint alternativo **aparece como aviso no `/readyz`** — não bloqueia (a medição é
legítima) e não passa em silêncio (uma instância não pode redirecionar avaliação de aluno sem o
operador ver).

| Cenário (provedor controlado, teto 4) | p50 | p95 | "pendente" | chamadas | notas | streams | lobby |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 35 alunos · 3 missões · 120 ms | 906 ms | 1,43 s | 0 | 35 (1,00/submissão) | 35/35 | 35 | 5 499 B |
| 50 alunos · 12 missões · 300 ms | 2,52 s | 4,19 s | 0 | 50 (1,00/submissão) | 50/50 | 50 | 9 380 B |
| 35 alunos · 3 missões · 900 ms | 4,83 s | 8,16 s | 3 | 35 (1,00/submissão) | 35/35 | 35 | 5 499 B |
| **controle** · 900 ms · teto 1 | 8,09 s | 8,13 s | **27** | 35 (1,00/submissão) | 35/35 | 35 | 5 497 B |
| **controle** · provedor instantâneo | 252 ms | 324 ms | **0** | 35 (1,00/submissão) | 35/35 | 35 | 5 499 B |

Zero falhas; nenhuma nota perdida; procedência `local: 0` (todas do provedor, modelo do endpoint
controlado); cota contabilizada igual às submissões; pico simultâneo no provedor igual ao teto (4) e
igual a 1 no controle de teto 1; tráfego de tempo real de 4,4 a 7,9 KB por aluno. O arnês **reprova**
quando falta nota, há envio sem sucesso, abrem menos streams que alunos, as chamadas não são exatamente
uma por submissão ou alguma nota vem do juiz local — as duas últimas foram provadas fazendo o provedor
controlado responder payload inválido: as três notas caíram no juiz local com motivo
`gemini_ArenaJudgeResponseError` e o arnês disse por quê.

**O que esta tabela não é:** o atraso do provedor é escolhido aqui e o host é a máquina de
desenvolvimento. Ela não prova a latência do Gemini, não prova a capacidade do host de destino e
**não é uma meta declarada** — é a linha de base que a execução no destino precisa reproduzir, e a meta
só se declara depois dela, com o provedor real e com teto de orçamento.

### Mordidas (cada uma desfeita e restaurada byte a byte)

| Desfazer | O que reprova |
| --- | --- |
| a avaliação em voo deixa de ser reaproveitada (volta a chamar o juiz) | o caso da repetição (2 chamadas ao provedor) |
| a resposta pendente volta a esperar a avaliação inteira | 2 casos de `test/api/arena-sla.test.mjs` |
| `createJudges` deixa de passar pelo teto | 2 casos de `test/judge/orcamento.test.mjs` |
| o servidor deixa de avisar a sala quando a nota fica pronta | o caso de navegador, no teto de 4 s |
| `bootstrap` deixa de repassar `GEMINI_BASE_URL` | o caso do endpoint em `test/smoke/deployment.test.mjs` |
| o provedor controlado responde payload inválido | o arnês **sai com código 1**: `procedência com juiz local` (`local: 2`, motivo `gemini_ArenaJudgeResponseError`) |

**Portões no estado do disco:** `npm test` **464/464** (23 s; 463 passando e 1 pulado, o `SIGTERM` real)
e `npm run test:browser` **26/26** (230 s). `git diff --check` limpo.

**Uma armadilha registrada no arnês:** a primeira versão do provedor controlado só respondia quando
`request.destroyed` era falso — e num POST com o corpo já lido, em Node, ele é verdadeiro. O efeito foi
o pior possível para uma medição: com um provedor que respondia em 40 ms, todos os envios voltaram
"pendente" em 8 s e cada submissão gerou **duas** chamadas (o retry do timeout do adaptador). O arnês
estava medindo a si mesmo. A guarda saiu e o caso está comentado no arquivo, porque é exatamente o tipo
de erro que faz um número bonito parecer ruim — ou vice-versa.

### Limites declarados

1. **O stub não é o provedor.** As latências acima medem fila, teto e resposta — não o Gemini nem a
   hospedagem. As metas contra o provedor real e contra o host continuam exigindo execução em
   homologação, que não foi feita.
2. **`arena_score_ready` é um aviso de sala, não uma garantia de ordem.** Se o navegador estiver com o
   stream caído, ele volta ao ciclo de consulta (2,5 s, ou 8 s com SSE recente) e vê a nota do mesmo jeito.
3. **A cota da hora é por processo.** Duas instâncias somam 800 chamadas/hora; a premissa de uma
   instância por instalação continua sendo premissa documentada, não coordenação real.
4. **O teto não cobre a avaliação clássica do fluxo legado por ação** — ele cobre as duas famílias no
   ponto único (`createJudges`), e o fluxo legado está bloqueado em produção.
5. **A rota `/report.php` não recebeu a procedência**: a tela onde o professor decide sobre a aula é o
   detalhe da sala (com as notas, os motivos e o resumo por rodada). O relatório clássico já tinha a
   métrica de fallback; unificar os dois é trabalho de relatório, não de juiz.

## Revisão de prontidão — 2026-09-17 (continuação) — Etapa 2: perfil de hospedagem, encerramento e prontidão honesta

A Etapa 1 fechou os quatro bloqueadores P0. Esta rodada ataca a Etapa 2, e a primeira decisão não
era de código: **qual implantação o produto suporta**. O plano pedia "escolher explicitamente um
perfil". Escolhido: **um processo, um volume persistente, SQLite local** — e não por preferência
estética. O produto guarda estado no processo (hub de tempo real, limitador de tentativas, fila de
escrita do estado coletivo) e o backend onde a integridade referencial está comprovada é o arquivo
local. A decisão mora em `src/server/hosting.mjs` e aparece no `/readyz` (`hosting:
"volume-persistente"`), para não ficar sendo premissa oculta.

### O banco gerenciado ficou trancado — e a trava tem prova

A auditoria P1 já dizia: não anunciar Turso como seguro enquanto a integridade referencial não
fosse comprovada. Em vez de escrever isso num documento, produção **recusa** `TURSO_URL` até haver
prova no banco de quem hospeda:

```
Configuracao de producao invalida:
- backend de banco gerenciado (TURSO_URL) não validado neste banco: ...
  Rode `npm run validar-integridade` ... e, só depois de ele passar, defina TURSO_INTEGRITY_VERIFIED=1
```

O que `npm run validar-integridade` faz é **perguntar ao banco**, não conferir o código que abre o
banco: cria uma referência órfã de verdade dentro de uma transação e vê se ele recusa, roda
`PRAGMA foreign_key_check` nos dados atuais e sai com 1 quando reprova. A sonda derruba as tabelas
de prova antes do commit (teste: `sqlite_master` fica limpo).

Isso importa porque o teste que existia era o furo: `test/db/remote-adapter.test.mjs` conferia a
**ordem das chamadas** num cliente simulado e continuaria verde com o banco aceitando órfão.
`test/db/integridade-referencial.test.mjs` (4 casos) roda com o **@libsql/client de verdade** sobre
um `file:` — é o mesmo adaptador do caminho remoto, sem rede e sem simulação — e exige que a
recusa venha do banco. Os dois lados reprovam de verdade: um caso cria o órfão com as FKs
desligadas e o diagnóstico **acha** o lixo; outro usa um backend que aceita o órfão e exige o
veredito REPROVADO com o comando que corrige.

### Encerramento gracioso: agora com a rede externa cancelada

O encerramento já tirava a instância do rodízio, revogava os streams e esperava as operações em
voo. Faltava a metade que estava escrita como aberta: **cancelar as chamadas Gemini em voo**. Sem
isso, uma avaliação pendente seguia até o próprio timeout do adaptador (12–15 s), mais que o prazo
combinado com o host, e a instância morria no meio da avaliação.

| Regra | O que ela impede |
| --- | --- |
| um `AbortController` de encerramento chega aos QUATRO adaptadores (`createJudges({ signal })`) | uma avaliação em voo segurar a drenagem até o host matar o processo |
| cancelamento não se repete | o adaptador redisparar depois do "pare" — o oposto do pedido |
| cancelamento tem erro próprio (`JudgeCancelledError` / `ArenaJudgeCancelledError`) | o relatório registrar como "timeout" o que foi o redeploy interrompendo |
| modo `gemini` resolve em nota local marcada (`fallback_reason: gemini_cancelled`) | envio do aluno ficar sem nota por causa do encerramento — e a promessa do modo continua valendo |
| modo `gemini-safe` propaga o cancelamento | fallback silencioso onde o modo promete falha explícita |
| `cancel` é chamado ANTES de esperar a drenagem | pagar o prazo inteiro para depois cancelar o que já estourou |
| o log do encerramento diz `cancelou: true/false` | o fio existir só no código e ninguém conseguir conferir de fora |

### Prontidão honesta e log correlacionável

- `/healthz` continua sendo "o processo está de pé" (não toca no banco); `/readyz` responde "posso
  receber tráfego" e agora devolve `hosting`, `config`, `judge`, `draining`, os problemas (503) e
  também **avisos** que não bloqueiam — entre eles o banco dentro do diretório da aplicação, que é o
  caso que morre no próximo redeploy.
- Toda falha da API sai em **uma linha JSON** com `request_id`, `action`, `status`, `duration_ms`,
  `room_id` (resolvido pela sessão, não pelo payload) e `error.name/message/cause`. O mesmo id volta
  no cabeçalho `x-request-id`: quem relata vê o id, quem opera acha a linha. O payload **não entra**
  — ele carrega o PIN da sala, o token do aluno e o prompt escrito.
- A causa do erro deixou de ser descartada: `comCausa()` anexa o erro do provedor ao `ApiError`
  público. Sem isso o log repetia a frase que o aluno leu ("Não foi possível avaliar o prompt
  agora.") e não dizia nada. A causa **não** vai para o corpo da resposta — há teste para isso.
- Redação em duas camadas: valores dos segredos VIVOS do ambiente são substituídos por
  `[redigido]` em qualquer campo (mesmo dentro de uma mensagem de erro), e chave com nome de
  credencial não sai em claro nem se o valor for desconhecido. `error.name` sobrevive (é a classe do
  erro, não o nome de alguém). Todo texto é sanitizado: um `action` com quebra de linha não inventa
  uma segunda linha no log.

### Backup e restauração, exercitados

`npm run backup-banco`, `npm run backup-banco -- conferir <arquivo>` e `npm run restaurar-banco --
<copia> <destino>` usam `VACUUM INTO` (cópia consistente sem parar o servidor) e foram executados
ponta a ponta. O que eles se recusam a fazer é a parte que protege: backup sobre backup (o "último
bom" viraria "último tentado"), cópia de origem que reprove `integrity_check`, restauração sem
conferir a cópia antes de escrever, e restauração sobre arquivo existente sem `--sobrescrever`. A
restauração compara as contagens das seis tabelas do produto. Banco gerenciado é recusado com o
motivo (o backup de um banco remoto é do provedor — um arquivo local seria falsa cópia).

### Mordidas (cada uma desfeita e restaurada byte a byte)

| Desfazer | O que reprova |
| --- | --- |
| o encerramento deixa de passar `cancel: app.cancelarPendencias` | o teste de processo, em `cancelou: false` |
| a fatia de hospedagem sai de `deploymentProblems` | os 2 casos do gate do banco gerenciado |
| a sonda finge "recusou" (`orphanRejected = true` mesmo sem erro) | os casos do banco local e do adaptador remoto real |
| o `x-request-id` sai da resposta | os 2 casos do log (id do cabeçalho ≠ id da linha) |

**Portões no estado do disco:** `npm test` **445/445** (24 s; 444 passando e 1 pulado — o `SIGTERM`
de verdade é pulado no Windows, que não entrega o sinal, e roda no CI Linux) e `npm run
test:browser` **25/25** (234 s). `git diff --check` limpo.

### Limites declarados

1. **Turso continua não validado ao vivo.** Não há credencial de Turso aqui: o que foi provado é que
   a ferramenta **detecta** o defeito (inclusive pelo cliente libSQL real, num `file:`) e que o boot
   recusa o backend sem a marca. A comprovação no serviço do provedor é um passo do operador, com o
   comando pronto.
2. **A prova de `SIGTERM` de verdade só roda em POSIX.** No Windows o sinal vira término imediato
   (medido: `exit -> {codigo: null, sinal: 'SIGTERM'}`, handler nunca chamado); o mesmo caminho de
   encerramento é exercitado no processo pelo gatilho injetado, e o CI é Linux.
3. **A falha ao renderizar página** usa o mesmo logger, mas não tem caso próprio: o teste cobre o
   caminho da API, que é onde a falha tem causa de terceiro.
4. **Uma instância por instalação continua sendo premissa.** SSE, limitadores e a fila de escrita
   vivem no processo; a trava do perfil é documentação + prontidão, não coordenação entre
   instâncias.
5. **Backup não sai da máquina sozinho.** O `cron` do `DEPLOYMENT.md` grava local; copiar para fora
   (outro disco/objeto remoto) é operação de quem hospeda, e foi escrita como tal — não como
   cumprida.
6. **Sem prova de carga.** A Etapa 3 do plano (35–50 clientes, latência p95, bytes do lobby, teto de
   chamadas Gemini) segue inteira e não foi tocada nesta rodada.

## Revisão de prontidão — 2026-09-17 (continuação) — O estado coletivo passa a ter compare-and-swap

Ficou escrito na rodada anterior: a fila em memória serializa UMA instalação, e a metade "contra dois
processos" da Etapa 1 continuava aberta. Agora a gravação do estado coletivo é **condicional ao
que foi lido**.

**A peça é a tabela `settings`.** `getComBruto(key)` devolve também o TEXTO guardado (o objeto
remontado não serve para comparar: a ordem das chaves não é preservada por todo caminho de
leitura). `setSeIntacto(key, valor, esperado, ts)` grava com `UPDATE ... WHERE key = ? AND
value_json = ?` — quando a chave ainda não existe, `INSERT ... DO NOTHING`, de modo que duas
criações concorrentes não se sobrescrevem. `trocarEstado(chave, transform)` lê, transforma, tenta
gravar; **se a gravação não acontece, relê e REAPLICA a transformação** sobre o estado novo (até 8
tentativas, e aí responde 409 dizendo que a sala está mudando).

| Regra | O que ela impede |
| --- | --- |
| a gravação é condicional ao texto lido | a segunda instância gravar em cima da primeira e o voto do aluno sair do resultado |
| quem perde a corrida relê e reaplica | a decisão se perder: ela é recalculada sobre o que existe agora, não descartada |
| `estado: null` significa "não há o que gravar" | o caminho idempotente (desafio já fechado) gravar de novo — inclusive quando o retry descobre que o vizinho fechou |
| o sorteio usa o mesmo CAS | o grupo fechado pelo professor desaparecer porque outro clique gravou por cima |
| uma definição só do estado (`normalizarModoArena`) | a releitura do CAS transformar em cima de um estado diferente do que a leitura entrega |
| 8 tentativas e então 409 explícito | gravar torto em silêncio quando a concorrência não para |

**15 pontos de escrita passaram a usar o helper**, um por um: configuração, reset, sorteio dos
competidores, Wild Card, voto (com confiança), abrir/revelar/fechar dinâmica, avançar rodada, poder,
times e os quatro do sorteio da sala. `writeArenaMode` deixou de existir — era o caminho cego. O
voto, que antes escrevia duas vezes (voto e depois confiança), agora escreve uma: as duas
transformações são aplicadas na mesma leitura, então não existe mais a janela entre elas.

**Cobertura.** `test/api/arena-mode-cas.test.mjs` (6 casos) cria **dois despachantes sobre o mesmo
banco** — que é o que duas instâncias do app têm em comum — e exige que nenhuma decisão se perca.
O caso mais forte é determinístico, sem depender de sorte de agendamento: um "outro processo"
grava de verdade entre o `getComBruto` e a gravação condicional, e a decisão de quem perdeu a
corrida tem de sobreviver por cima. `test/web/estado-coletivo-cas.test.mjs` fecha o caminho: chave
do estado coletivo (`arenaModeKey`, `drawKey`) não pode ser gravada por `settings.set` direto, e o
helper precisa continuar lendo o texto cru e gravando condicionalmente. Cada chave de exceção
está nomeada; uma chave nova não classificada reprova.

As mordidas, todas com restauração byte a byte:

| Desfazer | O que reprova |
| --- | --- |
| `setSeIntacto` volta a ser escrita cega (como era) | 3 dos 6 casos, incluindo votos perdidos e efeito duplo ao fechar |
| `trocarEstado` trata "perdi a corrida" como sucesso | 4 dos 6, incluindo o 409 de desistência |
| o ponto do sorteio volta a `settings.set` | o caso do sorteio, e a catraca de fonte |
| o ponto do sorteio volta a `settings.set` (só a catraca) | `nenhuma chave do estado coletivo é gravada direto` |

**Limite declarado:** o token de projeção continua sendo lido-modificado-gravado sem CAS (criar
um token novo em duas instâncias pode gerar dois códigos válidos na mesma sala). Não é estado
coletivo — nenhum voto, nota ou placar depende dele — e o custo de errar é um QR code a mais.

**Portões:** `npm test` **410/410** (10 s, +8 casos) e `npm run test:browser` **25/25** (219 s),
`git diff --check` limpo. Uma execução anterior do portão 2 teve `o Modo Arena conduz a turma até
derrubar o Juiz` reprovado por espera sob carga (64 s); o mesmo caso passou isolado (65 s) e na
execução completa seguinte. É a instabilidade já registrada na auditoria de 17/09 para este caso —
não veio destas mudanças: com um único processo, todas as escritas da mesma sala passam pela mesma
fila, então o CAS não chega a conflitar dentro do teste de navegador.

## Revisão de prontidão — 2026-09-17 — Etapa 1: integridade de jogo e privacidade

`docs/PLANO-READINESS-PRODUCAO-2026-09-17.md` reprovou a publicação com quatro bloqueadores P0.
Os quatro estão fechados, e cada um foi provado por um teste que **morde**: cada teste novo foi
rodado também contra o código anterior, no mesmo arquivo, e reprovou. Portões no estado exato do
disco: **402/402** (10 s, +5 casos) e **25/25** (228 s, +1), com `git diff --check` limpo.

| Bloqueador | O que estava errado | O que mudou | Mordida (teste contra o código antigo) |
| --- | --- | --- | --- |
| Voto perdido | a fila de escrita do voto usava `vote:<o que o payload dissesse>`; a sala real vem da sessão, então dez votos do mesmo tique liam antes de qualquer gravação e o último apagava os outros | `lockKeyFor`: **toda** escrita do estado coletivo de uma sala entra na mesma fila `room:<id>`, e a sala do voto sai da sessão autenticada | `votos simultâneos da mesma sala chegam todos ao estado` |
| Fechamento repetido | `settleDynamic` somava outro ataque, mais energia e outro coração do Juiz quando o desafio já estava fechado | trava no domínio (segundo `settleDynamic` é erro) e a ação devolve o resultado gravado com `already_closed: true`, sem reaplicar nada | `fechar o mesmo desafio duas vezes não aplica efeito de novo` |
| Identidade por nome+PIN | `arena_join` **ressuscitava** o registro do aluno removido (token novo no mesmo id), entregando e-mail, empresa, consentimento e pontos de outro aluno a quem digitasse o nome | reentrada é participante **novo**, sem PII e sem histórico; o registro antigo é arquivado como `Nome (saiu)` na mesma transação e o token dele é rotacionado | `aluno removido que volta com o mesmo nome entra como identidade nova` |
| CSV como fórmula | `csvEscape` só duplicava aspas: planilha executa campo que começa com `=`/`+`/`-`/`@` mesmo entre aspas, e nome e prompt são texto do aluno | campo suspeito ganha `'` na frente; `-` de "sem dado" e número negativo (como `-3`) continuam intactos | `o CSV do relatório neutraliza nome e prompt que começam com fórmula` |

**Decisões que valem para quem ler depois.** (1) A fila do voto custa uma leitura de sessão antes
do despacho — a mesma que a ação faria adiante — e é o preço de a sala sair da credencial, não do
payload. Isso também serializa voto e sorteio/fechamento entre si, que é o que a janela de votação
curta exige. (2) Nome+PIN não provam titularidade, e **não** havia poda automática de participante:
só o professor remove. Então bloquear a reentrada deixaria o aluno expulso sem volta (não existe
controle de "reabrir entrada"), enquanto a identidade nova fecha o furo de PII/histórico sem
inventar tela nova: o professor vê "Ana" e "Ana (saiu)" no relatório, cada uma com o seu histórico.

**O que NÃO está fechado nesta rodada, por escrito:** a parte "contra dois processos" da Etapa 1.
A fila em memória serializa uma instalação; duas instâncias escrevendo o mesmo JSON ainda não têm
compare-and-swap. O caminho é trocar a escrita por CAS na tabela `settings`
(`UPDATE ... WHERE key = ? AND value_json = ?` com re-leitura e reaplicação) dentro de um helper
`mutateArenaMode`, o que precisa passar por ~15 pontos de leitura-modificação. Fica para a rodada
seguinte, junto da decisão de perfil de hospedagem da Etapa 2 — que é justamente quem decide se
essa premissa de instância única é aceitável.

## Revisão de manutenção — 2026-09-17 (continuação) — A autorização da conexão deixa de ser selo de entrada

A rodada anterior fechou com este limite escrito: a autorização acontecia NA CONEXÃO, então
remover um participante (ou deixar o token da projeção vencer) não cortava o stream já aberto —
ele só perderia o escopo quando reconectasse. Quem recebeu o stream continuava recebendo até o
navegador cair e voltar. Agora a conexão prova DE NOVO, de tempos em tempos, que ainda pode
seguir a sala.

**A reverificação é a MESMA pergunta, refeita.** O hub não sabe o que é cookie, sessão ou token:
ele recebe de quem o criou uma função `revalidate` — em `start.mjs`, literalmente
`() => resolveEventsScope(request, url)`, o mesmo resolvedor que decidiu o escopo na entrada. A
cada `revalidateMs` (10 s por padrão, e injetável) o escopo novo é comparado com o registrado
(`sameScope`); quando deixa de bater, a conexão recebe `event: revoked` com
`{"reason":"scope_lost"}` e é encerrada, saindo dos dois índices do hub. Nenhuma regra de
credencial foi copiada para dentro do hub: há um só lugar que sabe responder "esta conexão pode
seguir esta sala".

| Regra | O que ela impede |
| --- | --- |
| o escopo é reconferido a cada 10 s | aluno removido, token vencido ou cookie expirado continuarem recebendo a sala até reconectar |
| a conexão revogada é fechada com `event: revoked` antes do fim | o EventSource reconectar sozinho — agora em escopo global — e a tela ficar "ao vivo" sem receber nada da própria sala |
| só a conexão cujo escopo mudou é fechada | derrubar a turma inteira porque um aluno saiu |
| falha de LEITURA na reverificação não revoga | um banco que pisca cortar a aula de quem está assistindo |
| conexão global não ganha relógio | pagar leitura de banco para reconfirmar que quem não provou nada continua sem sala |

**O cliente não finge que está ao vivo.** `openRoomEvents` passou a escutar `revoked` e chamar
`closeRoomEvents()`: sem isso o `EventSource` reconectaria no `retry: 1000` e a superfície
ficaria com `roomEventsAlive = true`, espaçando o poll para 8 s, enquanto nada da própria sala
chegava. Fechando, quem volta a contar a verdade é o poll — e ele já sabia o caminho de volta: a
tela do aluno removido recebe 401 do `arena_lobby` e volta para a entrada (`showScreen('join')`).

**A prova de navegador precisou isolar o aluno — e isso é um achado.** As páginas do teste
compartilhavam o mesmo contexto do navegador, então a tela do aluno herdava o cookie
`arena_admin` do professor que tinha acabado de entrar na mesma janela. A conexão dela era
autorizada pelo cookie do painel (que vale para qualquer sala), e remover o participante não
revogava nada. Não é artefato de teste: é a precedência escrita em `events-scope.mjs`
funcionando. A correção foi dar contexto próprio àquela página — o que existe na máquina de um
aluno de verdade — e `abrirPagina` ganhou o parâmetro `context` para isso.

**O que ficou medido.** Hub (`test/smoke/events-revalidate.test.mjs`, novo): perder a sala fecha
com o aviso antes do fim e limpa os dois índices; conexão boa atravessa vários tiques sem ser
tocada; a revogação é POR CONEXÃO (a vizinha autorizada continua recebendo); trocar de sala
também revoga; erro de leitura não revoga, e a perda de verdade é aplicada na primeira
rechecagem que responde; conexão global não gera uma única consulta a mais. Transporte
(`test/smoke/arena-room-events.test.mjs`): com três conexões autorizadas na mesma sala, o
`arena_remove_participant` fecha só a do aluno removido — as outras duas continuam recebendo o
evento seguinte —, e reconectar com a mesma credencial nasce no escopo global (só o evento da
arena), sem oráculo de erro. Navegador (`test/browser/stream-por-sala.test.mjs`, 7,7 s): com
painel, aluno e TV na mesma sala, remover o aluno revoga a conexão dele (`revogadas ≥ 1`),
deixa a sala com as outras duas e — numa janela maior que o `retry: 1000` — nenhuma conexão
anônima aparece; a tela do aluno volta para a entrada.

**Mordida.** `output/qa/prova-mordida-sse.mjs` agora desfaz quatro metades, uma por vez, a
partir de cópia byte a byte: (1) a TV conectar antes de saber a sala → `anônimas: 1`; (2) o hub
entregar evento de sala a quem não provou a sala → `nao podia chegar evento nesta conexao`;
(3) o hub parar de reverificar, deixando a autorização voltar a ser selo de entrada → `a conexao
da Ana recebe o aviso de revogacao`; (4) o cliente reconectar depois da revogação → `a superfície
revogada não reconecta sem prova de sala`. As quatro restauram o arquivo com o hash idêntico.

**Portões.** `npm test` **397/397** (9,5 s, +8: sete do hub e um do transporte) e
`npm run test:browser` **24/24** (223 s). Arquivos de produto tocados: `src/server/events.mjs`
(reverificação e fechamento), `src/server/start.mjs` (liga a função de reverificação e o relógio)
e `public/assets/js/arena.js` (fechar no aviso, em vez de reconectar).

**Limites que ficam escritos.** (1) A revogação tem a janela do relógio: até 10 s entre perder a
autorização e a conexão fechar — é o preço de não pagar uma leitura de banco por conexão por
segundo. (2) A reverificação compara ESCOPO, não permissão: uma conexão do painel continua
valendo para qualquer id de sala, então excluir ou arquivar a sala não fecha o stream de quem
abriu o detalhe (herdado da entrada, e coerente com ela). (3) Quando o cookie do painel expira
(1 h), a conexão do painel é fechada e a superfície volta ao poll; a mesma coisa vale para a
projeção depois das 8 h do token, que segue funcionando no poll. (4) O cliente trata a revogação
fechando e deixando o poll explicar o estado — não há mensagem por superfície ("você foi
removido da sala", por exemplo). (5) Os limites anteriores continuam valendo: hub em memória,
credencial do aluno na query string, sem teto de conexões por sala e sem tratamento de consumidor
lento.

## Revisão de manutenção — 2026-09-17 (continuação) — O stream de tempo real passa a ser entregue por sala

Até a rodada anterior o hub transmitia cada mutação para TODAS as conexões e o cliente
descartava o que não era dele. Isso resolvia a multiplicação de leitura (a tela deixou de
consultar por evento alheio), mas deixava de pé duas coisas: o evento de uma aula chegava a
todos os navegadores ligados no servidor, e a pergunta "isto é meu?" era do cliente — quem
quisesse receber tudo bastava não descartar. Agora quem decide é o servidor, e a decisão é
escopo de CONEXÃO.

**Quem entra, e com o que.** A conexão SSE não tem corpo nem cabeçalho próprio: o navegador
manda os cookies do domínio e o resto viaja na query string. Cada superfície entra com o que
já tem — painel com o cookie HttpOnly `arena_admin`, projeção com o cookie `arena_tv_session`
de 8 h atado à sala, aluno com a própria sessão (`participant_id` + `token`, a mesma que ele
já manda no corpo de toda chamada). Sem prova, a conexão nasce no escopo GLOBAL: recebe o
que vale para a arena inteira (abrir/fechar a entrada) e nada de sala nenhuma. A sala do
ALUNO sai da sessão validada, nunca do `room` que ele pediu — o mesmo princípio de
`roomIdFromOutcome`: identidade ganha da declaração.

| Regra | O que ela impede |
| --- | --- |
| conexão de sala só recebe a própria sala (e o global) | evento de uma turma alcançar o navegador de outra |
| `room` pedido não vale como identidade; a sessão do aluno é que diz a sala | conexão apontar para a sala do colega e receber o movimento dela |
| cookie da projeção é conferido contra a sala pedida, com validade de 8 h | token de uma TV servir para projetar outra sala |
| sem prova, escopo global | existir caminho anônimo para o evento de sala |
| resposta é sempre 200 (nunca 403) | oráculo de "esta sala existe" e o EventSource retentando para sempre (`retry: 1000`) em cada aba |

**O cliente parou de filtrar.** `eventForRoom` saiu do cliente, e com ele a dúvida "chegou
mesmo para mim?": o que chega é o que a conexão provou seguir. O payload mantém `room_id`
como trilha do que foi roteado (e é ele que os testes usam para dizer de que sala era o
evento), mas a tela não decide mais nada com ele.

**A mudança de contrato achou uma regressão de verdade.** A TV era a única superfície que
abria o stream antes de saber a sua sala: `startTV` chamava `connectAndPoll()` assim que via
`?pin=` na URL, e o id da sala só chegava na primeira leitura. Enquanto o hub transmitia a
todos, isso passava; com o escopo por conexão, a TV nasceria global — e ficaria sem o
empurrão da própria sala, caindo no poll de 2,5 s. Corrigido na origem (a primeira leitura
vem antes da conexão), e é o teste de navegador novo que segura isso: sem a correção, ele
reprova com `na sala: 2, anônimas: 1, total: 3`.

**O que ficou medido.** Transporte (`test/smoke/arena-room-events.test.mjs`): conexão
anônima aberta ANTES dos eventos recebe o global (`arena_set_open`, sem `room_id`) e nele
NÃO chega nenhuma mutação de sala — nem a lição adicionada, nem o `arena_join` do aluno —,
com janelas de silêncio de 300 ms; a conexão do painel (cookie + `?room=<id>`) recebe a sala
dela e nada da vizinha; a conexão do aluno com token forjado recebe o global e nenhum evento
de sala. Navegador (`test/browser/stream-por-sala.test.mjs`, 5,4 s): com a aula rodando, as
três telas reais entram na MESMA sala (`naSala = 3`, `anônimas = 0`, `total = 3`, `0` na
sala vizinha), reconectam para a sala depois de o servidor derrubar tudo (`3` de novo, sem
nenhuma anônima) e o `arena_join` de um aluno novo chega à tela do aluno pelo stream.

**Mordida.** `output/qa/prova-mordida-sse.mjs` desfaz uma metade por vez, a partir de cópia
byte a byte: (1) a TV voltar a conectar antes de saber a sala — reprova com `anônimas: 1`;
(2) o hub voltar a entregar evento de sala para quem não provou a sala — reprova com `nao
podia chegar evento nesta conexao`. As duas restauram o arquivo com o hash idêntico ao de
antes.

**Portões.** `npm test` **389/389** (8 s, +11: seis do resolvedor de escopo, dois do hub,
um do transporte, mais os arquivos que cresceram) e `npm run test:browser` **24/24**
(225 s). O único arquivo de produto tocado além do stream é `public/assets/js/arena.js`.

**Limites que ficam escritos.** (1) O hub continua em memória: com mais de uma instância, as
conexões de uma não sabem o que a outra transmitiu — distribuição de eventos segue em aberto,
como estava. (2) A credencial do ALUNO viaja na query string, e não em cookie: o
`EventSource` não aceita cabeçalho próprio e o token não é enviado por outro canal. O painel e
a projeção seguem só com cookie, e o stream carrega apenas `{action, server_now, room_id}` —
nenhum dado de aluno —, mas um proxy que registre URL registraria o token. (3) Não há teto de
conexões por sala nem tratamento de consumidor lento: o hub escreve e segue, e uma conexão
que não drena fica na memória até o socket cair (também em aberto desde o M09). (4) A
autorização acontece NA CONEXÃO: remover um participante ou deixar a sessão expirar não corta
o stream já aberto — ele só perde o escopo quando reconecta. *(Superado na revisão seguinte,
ainda em 17/09: a conexão passou a reverificar a autorização de 10 em 10 segundos e a ser
fechada ao perder a sala — ver "A autorização da conexão deixa de ser selo de entrada".)*
(5) O painel segue a sala
SELECIONADA: trocar de detalhe reabre a conexão, e aí existe uma janela de milissegundos em
que o empurrão não chega (o poll cobre). (6) A precedência é do cookie do painel: um
navegador de professor com sessão de aluno sobrando no `localStorage` continua autorizado
como painel — decisão escrita em `events-scope.mjs`, e testada. (7) A rota `/events` não repete
o bloqueio de `sec-fetch-site: cross-site` que a API tem: o que protege o cookie ali é o
`SameSite=Lax` (não viaja em subrecurso cross-site) e o fato de o stream não carregar dado de
ninguém. Repetir a checagem na rota é endurecimento barato, ainda não feito.

**Artefatos.** `src/server/events-scope.mjs` (novo) decide o escopo; `src/server/events.mjs`
entrega por escopo; `src/server/start.mjs` liga a rota `/events`; `src/server/arena-api.mjs`
expõe as duas checagens compartilhadas (`participantForSession`, `liveTvTokens`) para que a
regra de sessão exista num lugar só. Testes: `test/smoke/events-scope.test.mjs` (novo),
`test/smoke/room-event-room.test.mjs`, `test/smoke/arena-room-events.test.mjs`,
`test/browser/stream-por-sala.test.mjs` (novo) e `test/browser/atualizacoes-ao-vivo.test.mjs`
(que agora exige `naSala` na primeira conexão e na reconexão). Sondas em
`output/qa/probe-sse-escopo.mjs` e prova de mordida em `output/qa/prova-mordida-sse.mjs`.

## Revisão de manutenção — 2026-09-17 — Um `JUDGE_MODE` para os dois juízes, e a atualização ao vivo deixa de atropelar o controle

Duas correções do mesmo dia, vindas de `docs/superpowers/plans/2026-09-17-juiz-e-atualizacao-da-interface.md`
(M07, M09 e M10 do plano de melhorias; M08 seguiu separado).

**O defeito do juiz era um contrato incompleto.** `bootstrap` escolhia o juiz clássico por
`JUDGE_MODE`, mas `createApplication` montava o juiz por critérios da Arena por conta própria, lendo
`process.env.GEMINI_API_KEY`: com a chave preenchida, `JUDGE_MODE=fallback` — o modo anunciado no
README como local, para ensaio em sala — continuava fazendo chamada ao Gemini nas missões
personalizadas. A política virou um ponto único (`src/judge/configuration.mjs`), que deriva as DUAS
famílias do mesmo modo e não lê ambiente; `bootstrap` resolve a política **antes de abrir o banco**, de
forma que modo desconhecido derruba o boot citando os modos aceitos sem deixar conexão pendurada.

| Modo | Clássico | Por critérios (Arena) | Sem chave | Em falha do provedor |
| --- | --- | --- | --- | --- |
| `fallback` (padrão) | fórmula histórica local | heurística local por critério | local | local (não há chamada) |
| `gemini` | source-compatible (numérico, 8 s) | JSON por critério (12 s, 1 retentativa) | local, com motivo | local, com motivo e status |
| `gemini-safe` | JSON estrito | JSON por critério | **erro no boot** | erro explícito (sem local silencioso) |

A prova não é a leitura do código: `test/smoke/judge-mode.test.mjs` faz uma submissão real com
`GEMINI_API_KEY` **canário** no ambiente e `globalThis.fetch` instrumentado, e exige zero chamadas
fora do processo — a mesma prova que a mordida do teste confirmou ao reintroduzir a forma antiga
(três chamadas a `generativelanguage.googleapis.com` reprovaram). Cada tentativa persistida passou a
carregar `judge_mode`, `provider`, `fallback_used` e o motivo, no JSON de metadados que já existia
(sem migração), então o relatório distingue nota do provedor de nota local sem depender do prefixo do
modelo. Os limites do juiz por critérios foram **preservados** do que a Arena já usava (12 s, uma
retentativa) e têm teste próprio: esta correção não muda o tempo de espera do aluno.

**O defeito da atualização ao vivo era multiplicação de leitura.** O evento de sala não dizia de que
sala era, e `arena_submit` é o evento mais frequente da aula: cada envio de qualquer sala acordava uma
leitura completa em todas as telas — e uma rajada abria uma consulta por evento. Agora o evento leva
`room_id`, resolvido do **resultado validado no servidor** (nunca de campo enviado pelo aluno), cada
superfície descarta o que é de outra sala, existe **uma consulta em voo por superfície** com
coalescimento (uma releitura no fim, no máximo) e o redesenho é pulado quando o estado visível é
equivalente. Resposta atrasada de outra sala é descartada. Aba oculta espaça o batimento para 10 s e
voltar faz leitura imediata; SSE caído volta ao polling e o `EventSource` reconecta sozinho.

Baseline medido por `test/browser/atualizacoes-ao-vivo.test.mjs` (consultas de lobby por janela, com
SSE vivo, contadas no servidor — total e simultaneidade):

| Janela | Consultas | Pico simultâneo |
| --- | --- | --- |
| estado estável, 5 s | 1 | 1 |
| rajada de 20 eventos | **2** | **1** |
| evento de outra sala (5) | **0** | 1 |
| evento global (abrir a arena) | 1 | 1 |
| aba oculta, 11 s | 1 | 1 |
| aba oculta + rajada de 20 | 2 | 1 |
| volta da aba | 1 (imediata) | 1 |
| SSE caído, 6 s | 2–3 (recuperação) | 1 |
| SSE de volta + evento | 1 | 1 |

**O controle do professor.** O corpo do detalhe (e o relatório da sala) só é redesenhado quando o
estado visível mudou; quando muda, foco, seleção, texto digitado e rolagem voltam ao lugar.
`test/browser/painel-controles.test.mjs` prova o aceite com mudanças REAIS (alunos entrando): um clique
na rajada vira uma ação e um pedido; o foco continua no mesmo controle depois de três redesenhos; o
`Enter` age uma vez; a dobra que o professor abriu continua aberta. A mordida foi confirmada tirando a
devolução de foco (o teste reprovou com a mensagem certa). Na TV, `setContent` continua substituindo o
conteúdo quando chamado — quem evita a reconstrução é a comparação de estado em `refresh`, que também
não reinicia o cronômetro local de 250 ms.

**Limites que ficam escritos.** (1) O filtro por sala desta rodada é no CLIENTE: o hub ainda transmite a
todos, então isto reduz LEITURAS por sala, não conexões nem bytes SSE — filtrar no servidor exigiria
autorizar cada conexão por sala, e nenhum canal novo de dados foi aberto. *(Superado na revisão seguinte,
ainda em 17/09: a conexão passou a ser autorizada por sala no servidor e o filtro saiu do cliente — ver
“O stream de tempo real passa a ser entregue por sala”.)* (2) Não há revisão/versão de estado no
protocolo; a comparação é do subconjunto serializável, com `server_now` e `last_seen_at` fora. (3) Em
aba oculta o caminho escolhido foi **alongar** (10 s), não pausar: parar de vez deixaria uma sala
parada para quem deixa o painel ou a projeção em segundo plano, comportamento que a suíte de navegador
exercita. (4) O aviso curto de mudança para leitor de tela (aceite do M10) não foi implementado. (5) O
clique do aceite é despachado dentro da página — um gesto, sem repetição — porque o `page.click` do
Puppeteer resolve o nó e clica depois, medindo a corrida do próprio Puppeteer; `clicarAte` continua no
setup.

**Duas falhas de teste corrigidas no caminho, ambas do arnês e não do produto:** o ajuste de tempos
esperava o diálogo pelo formulário, e o markup do diálogo anterior continuava no DOM depois de fechar
(a condição agora exige o diálogo aberto); e as páginas em segundo plano da suíte eram justamente o
que definia "pausar" como regressão, o que fixou o caminho de 10 s. Portões: **377/377** (8 s) e
**23/23** (193 s). Nenhuma folha de estilo foi tocada — os cartórios de cascata, contraste e o retrato
de estilo seguem como estavam.

**Reconciliação do gatilho do CI (fecho de 17/09).** O `push` deste workflow tinha sido corrigido
duas vezes, em sentidos opostos: `[main]` → `[master]` (revisão de 14/09) e `[master]` →
`[main, master]` numa alteração que ficou **fora** do checkpoint, porque a justificativa dela — "o
GitHub usa main" — não tinha como ser conferida daqui. O M15 do plano de melhorias explica o porquê: o
repositório ANTERIOR usava `main`, esta cópia usa `master`, e o destino é um repositório **novo**, cuja
branch padrão ainda será escolhida lá — o remote não existe nem aqui (`DEPLOYMENT.md` registra
"falta o remote") nem na conta, que publica um repositório só, outro (consulta à API pública em 17/09).
Em vez de trocar uma adivinhação por outra, o filtro por nome saiu: `push` sem `branches` dispara em
qualquer branch, que é o que o aceite do M15 pede ("CI executa na branch real") sem exigir acertar um
nome que ainda não existe. O custo aceito, escrito no comentário do próprio arquivo, é uma execução
também em envio de tag. Não há teste que leia o workflow, então isso não move o portão 1: **378/378**
depois da mudança. **Fica pendente**, e só se fecha no destino, conferir uma execução no repositório
novo depois de ele existir — a segunda metade do aceite do M15, que nenhuma máquina daqui pode dar.

## Revisão de manutenção — 2026-09-16 (fechamento) — A classe do painel da missão vira portão: nenhuma regra viva pinta um `hidden`

O defeito de 16/09 não era um seletor errado: era uma **classe de defeito**. `[hidden]` é
implementado pelo navegador como folha do USUÁRIO, a origem mais fraca que existe, então qualquer
`display` de autor que case com o elemento ganha dele — e o elemento continua pintado com o atributo
posto. A `:not([hidden])` consertou o painel da missão; nada impedia a mesma vitória de nascer em
qualquer outro seletor, e três guardas aprovavam justamente porque perguntavam ao atributo. Este
registro fecha a classe, não o caso.

**A guarda.** `test/css/hidden.test.mjs` + `test/support/hidden-css.mjs`, sem navegador (roda no
`npm test`, que já inclui `test/css/*.test.mjs`). Ela monta o catálogo dos elementos que CARREGAM o
atributo e simula, para cada um, a cascata de `display` das folhas vivas — importância,
especificidade, ordem de folha e ordem de regra — reprovando se o vencedor não for `none`.

| O que a régua lê | Medido |
| --- | --- |
| elementos que carregam o `hidden` | **116** — 33 com o atributo na marcação, 81 alvos que o cliente liga/desliga (`elemento.hidden = ...`), 2 alvos sem marcação |
| declarações de `display` lidas das cinco folhas | **482** |
| carregadores avaliados na cascata | **114** (os 2 sem marcação saem por isenção escrita) |
| ocorrências de `hidden` fora da conta, com motivo | **27** — 21 dentro de uma tag sem o atributo, 5 identificadores no código, 1 comentário; **0** sem classificação |
| regras que vencem o `hidden` por declaração escrita | **1** (`refinement.css:420`, a reserva de linha das mensagens) |
| conflitos | **0** |

**Três coisas que a guarda recusa deixar passar em silêncio.** (1) Ocorrência de `hidden` que ela não
saiba classificar — `setAttribute('hidden')`, uma tag montada por concatenação — **reprova pedindo
classificação**, em vez de virar um carregador invisível (o mesmo princípio de "a régua prova que
enxergou tudo" dos outros portões). (2) Alvo que o cliente esconde e nenhuma fonte viva escreve só
vale com isenção declarada em `SEM_ELEMENTO` **com o motivo** — hoje `[data-toast]`, que morava nas
páginas clássicas retiradas; isenção que vira mentira (o alvo deixa de ser escondido) também reprova.
(3) O teto de vitórias deliberadas é **1**, contado por REGRA e não por seletor: uma regra que pinta
elemento escondido precisa do motivo escrito no comentário que a abre (`hidden: <motivo>`), porque
uma vitória por acidente é exatamente o defeito que este portão vigia.

**O furo que a prova de mordida achou — no detector, não no produto.** O teste
`css: a guarda morde o defeito do painel da missão (16/09)` desfaz em memória **só** a `:not([hidden])`
do painel e exige que a régua acuse. Ele reprovou na primeira execução: a régua estava **cega** para o
defeito que existe para pegar. O leitor de seletor casava por expressão regular e parava na primeira
`)`, então em `.arena-mission-panel:has(.arena-mission-empty:not([hidden]))` ele lia `:has` e varria o
resto do argumento como se fosse do SUJEITO: `.arena-mission-empty` passava a ser **exigência** do
elemento (que não tem essa classe) e o `:not([hidden])` de dentro virava negação de sujeito — o
elemento escondido nunca casava e a regra ficava invisível. Conserto na raiz
(`separarFuncionais`: parêntese balanceado, aspas e atributo respeitados, argumento de `:has()` fora
da varredura), com os controles sintéticos cobrindo o que mudou. São **13 seletores com `:has(`** nas
folhas vivas (`design.css` 8, `refinement.css` 2, `app-authorial.css` 2, `app.css` 1); a correção só
**alargou** a janela — as folhas vivas continuavam em zero depois dela, sem uma linha de produto
mudar —, o que é a informação que interessa: a cegueira era do medidor.

**Treze controles provam que a régua morde.** Oito deles exercitam a semântica que o portão decide
(revelador sem importância perde; empate resolve por ordem e é acusado; sem protetor de autor o
elemento é pintado; `:not([hidden])` absolve; protetor escopado cobre quem está dentro e não cobre
quem está fora; pseudo-elemento não é a caixa do elemento; `@media print` fica fora) e cinco
protegem a contabilidade (marca `hidden:` converte conflito em decisão; alvo do cliente conta como
carregador; alvo sem marcação sem isenção reprova; `setAttribute` e `hidden` solto em template
reprovam). Mais os dois que correm sobre as folhas vivas: a catraca em zero e a mordida do painel.

**Portões.** `npm test` **362/362** (7 s, +13 do arquivo novo) e `npm run test:browser`
**21/21** (154 s) no estado registrado aqui. O único arquivo de produto tocado nesta rodada é um
**comentário** em `refinement.css` (a declaração da vitória deliberada), que não muda declaração
nenhuma: o cartório da cascata e o instantâneo de estilo seguem sem regravação.

**Limites que ficam escritos.** (1) `@media print` está fora — o defeito desta classe é de tela. (2)
`@layer`/`@scope` não existem nestas folhas; se aparecerem, a precedência daqui precisa deles. (3)
Pseudo-classe e `:has()` contam como "pode pintar", que é o lado que acusa — por isso um protetor só
vale com certeza. (4) Esconder por CLASSE (o `.hidden` do Tailwind, `class="hidden"`) fica fora: a
guarda pergunta pelo atributo, e nenhuma fonte viva escreve `class="hidden"` hoje (medido); quem
começar a usar essa via não é vigiado por ela — o portão 2 continua sendo o vigia da pintura. (5) A
guarda não mede pixel: ela diz o que a cascata resolve no ARQUIVO, e quem diz o que a tela pintou é o
portão 2.

**Artefatos.** Guarda em `test/css/hidden.test.mjs`; motor em `test/support/hidden-css.mjs`;
instrumento de leitura manual em `scripts/mede-hidden.mjs` (`node scripts/mede-hidden.mjs` imprime a
tabela, `... conflitos` só o que reprova); a sonda que atribuiu a cascata do painel e revelou a
cegueira do leitor, `output/qa/probe-painel.mjs`. A marca de vitória deliberada mora no comentário
da regra que ela autoriza.

## Revisão de manutenção — 2026-09-16 (fechamento) — A evidência do item 7, e um defeito que só ela encontrou

O item 7 do plano revisado (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`)
pede as capturas que faltavam antes de concluir sobre as telas: o **aluno ao vivo** (espera, missão
de texto, missão com imagem, envio, avaliação, votação, Wild Card, encerramento), a **TV na
votação**, a **gestão da sala** e o **painel durante e depois da partida**. As três últimas já tinham
sido fechadas na etapa 6; este registro fecha o resto — e o resto achou um defeito de tela que três
guardas vinham aprovando.

**O instrumento.** `output/qa/refino-item7.mjs` põe uma aula de verdade de pé: duas salas em banco
em memória, seis alunos entrando pela API (`arena_join`), a sessão do aluno sendo a do produto
(`localStorage`: `arena.participant_id` + `arena.token`) e o juiz falso no lugar do modelo. A sala
de aula tem três missões — a segunda na modalidade `reversa`, com arte — e a sala Arena tem **três
rodadas**, que é o que a regra do motor exige para o Wild Card abrir (`competitorPlan`: três rodadas
ou mais, na primeira rodada ou na última). Vinte e três prints em
`output/auditoria-refino-etapa6/item7/`, com `medida.json`.

**Cada captura afirma o estado antes de sair.** Na rodada de 15/09, um `34-tv-votacao.png` saiu
mostrando o estado ANTERIOR — o print existia, o estado não era o que ele dizia. Aqui toda captura é
precedida de `exigir()`: se a fase, o cartão ou a arte não estiverem na tela, o roteiro **não
fotografa**, registra a falha e termina com código diferente de zero. Uma evidência ausente é um
problema; uma evidência que mente é pior do que ele.

| Estado | O que ficou medido |
| --- | --- |
| aluno na espera | 2 blocos pintados (ilustração + título); missão e votação **ausentes** |
| aluno na missão (texto) — 390×844 | campo no topo 561 (169 px de altura) e envio no topo 758: **os dois dentro da janela de 844**, com 23 px de rolagem na página |
| aluno na missão (imagem) | arte de 1200×896 **carregada e pintada** (área de 308×230) |
| aluno no rascunho | o texto no campo e o envio habilitado |
| aluno na avaliação | nota e feedback na tela, com o envio feito pelo **clique** do aluno, não pela API |
| aluno no encerramento | “🏆 Batalha encerrada! 🎉” com **6 linhas** de classificação |
| painel durante — 1440×900 | 3 missões, lista de participantes recolhida (0 à vista), a ação da fase (“⏸ Pausar missão”) no **topo 193**; rola o miolo (979 px em 900) e a página **não** rola |
| painel durante — 390×844 | ação no topo 717, dentro da janela; a rolagem é da página (3694 px) |
| painel depois | sem ação principal (a partida acabou), 3 missões, mesma rolagem interna |
| TV na votação — 1920×1080 e 1280×720 | “🎲 WILD CARD — QUEM ENTRA NA ARENA?” com as 3 opções e a contagem de votos, barra de 72 px, **0 de rolagem**; a rodada **não** está no ar |
| Wild Card, quem está em campo | o mesmo cartão **sem opção nenhuma** e a razão escrita: “Você está no Wild Card — quem está em campo não vota.” |

**O achado: o painel da missão ficava com `hidden` E pintado.** A regra
`.arena-mission-panel:has(.arena-mission-empty:not([hidden]))` (o cartão de espera ganha altura
mínima e centralização) declara `display: flex !important` com **três** classes de especificidade — e
vence, por isso, os três `[hidden]` da cascata (`[data-arena-screen] [hidden]`, `[hidden]`, o do
Tailwind). Medido no navegador: durante a votação o painel tinha o atributo posto e `display: flex`,
então **o aluno que abria a página na votação via a pergunta, as três opções e, logo abaixo, o
cartão de espera de meia tela** com “Aguarde o professor iniciar” — duas situações na mesma tela, que
é exatamente o que o plano pede para não acontecer. O print do defeito, com a mesma fixture, ficou em
`output/auditoria-refino-etapa6/item7/probe/votante.png`; o mesmo estado depois da correção é
`19-aluno-votacao-390.png`.

**A correção.** `:not([hidden])` no **painel**, nos três lugares que escrevem aquele seletor
(`design.css` ×2, `refinement.css` ×1) — a geometria continua onde é declarada, sem sobreposição
nova e sem declaração morta. Cartório da cascata: **3 assinaturas de seletor** regravadas,
declarações idênticas. Catraca de contraste: **219 conferidos / 0 reprovados / piso 5,08**, sem
mudança (a correção não pinta tinta nenhuma). Retrato de estilo: **18 telas, nenhuma mudou** — e isso
também é informação: nenhuma das telas do retrato tem o painel escondido, então o defeito era
invisível para o portão 2, por construção.

**Por que três guardas aprovaram isso.** Todas perguntavam ao **atributo** `hidden`, não à pintura:
`!painel.hidden` era falso e a tela passava. A guarda de navegador do Modo Arena vigiava a missão
sair de cena, nunca o cartão de espera. E o bloco que exercita o Wild Card naquele teste é
**inalcançável**: a sala dele tem `arena_rounds: 2`, e com menos de três rodadas o Wild Card não
abre — o `if (estado.phase === 'wildcard')` nunca rodou. O bloco ficou (está correto e o comentário
dele vale), mas a cobertura que ele parecia dar não existia.

**A guarda nova.** `test/browser/arena-ui.test.mjs` ganhou “a votação do Wild Card ocupa a tela da
aluna sozinha, sem o cartão de espera” (**3,1 s**): monta a sala Arena com três rodadas, joga a
rodada, abre a votação e então **carrega** a página da aluna — o caminho em que o cliente desenha o
estado do zero e onde o defeito aparece. Ela pergunta por `checkVisibility()`: o painel, o cartão de
espera e a missão **não** pintados, as três opções pintadas; clica um voto e confere que ele chegou ao
servidor; e, para quem está em campo, exige o cartão sem opções e a razão escrita. A mesma pergunta
passou a valer na guarda existente do Modo Arena, que agora mede pintura em vez de atributo.

**A prova de que as guardas mordem.** `output/qa/prova-mordida.mjs` desfaz uma metade por vez, a
partir de uma cópia byte a byte, e guarda o texto do erro. As três mordem — com a emenda desfeita, a
mensagem é a esperada; com a folha íntegra, verde de novo:

- **faixa da TV**: `em 1920×1080 a faixa de ferramentas tem de ser UMA linha: ["arena-tv-brand+arena-tv-room","arena-tv-fullscreen-btn"]`;
- **entradas**: o `deepEqual` mostrando os dois botões (aluno `48px/10px/15px/600`, professor `50px/999px/16px/900`);
- **votação**: `o painel da missão não pode estar pintado durante a votação`.

**Dois erros do instrumento, que valem registro.** A primeira rodada acusou o produto de mais duas
coisas, e as duas eram do medidor: a arte da missão aparecia como “não carregada” porque eu media o
`<img>` da modalidade **errada** (as duas existem no DOM e a que não é da vez fica sem `src`), e a TV
aparecia como “missão e pergunta juntas” porque a pergunta estava sendo procurada no contêiner que
**contém** a própria pergunta. Corrigidos os alvos, os dois estados passaram sem que uma linha de
produto mudasse.

**Limites que esta rodada declara.** (1) Os estados novos não têm “antes” com os mesmos dados: os
prints de 15/09 em `output/auditoria-visual-2026-09-16` são referência histórica de outro banco. A
exceção é a votação, que tem par de verdade (`probe/votante.png` → `19-aluno-votacao-390.png`).
(2) A inspeção dos prints foi feita pelas medidas e pelo estado afirmado antes de cada captura, não a
olho em zoom de 200%. (3) Legibilidade da projeção **à distância** continua não verificada: isso
precisa do equipamento, e um screenshot não substitui. (4) O juiz é falso: as notas e os feedbacks das
capturas são de demonstração, não conteúdo de turma.

**Artefatos.** Roteiros em `output/qa/refino-item7.mjs` (evidência), `output/qa/probe-voto-item7.mjs`
(sonda que achou o defeito, com atribuição de cascata) e `output/qa/prova-mordida.mjs` (as três
metades). Prints e medidas em `output/auditoria-refino-etapa6/item7/`.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, etapa 6: a faixa da TV, os acessos e o portal

Sexta e última etapa do plano revisado em 16/09
(`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`), seção 6, mais o item 7 —
as **capturas que faltavam**. As três superfícies nomeadas são a **TV** (cabeçalho e diálogo de
projeção), os **acessos** (entrada do aluno e login do professor) e o **portal**. Duas delas não
pediam mudança, e isso está medido abaixo em vez de suposto.

**O instrumento da rodada.** `output/qa/refino-etapa6.mjs` sobe o servidor com banco em memória,
monta a sala de oito participantes com três missões e — o que faltava — **joga a partida de
verdade**: cinco alunos a mais entram, a rodada abre, os treze enviam, a rodada encerra e a sala
encerra. Assim a rodada fecha as capturas que o plano listava como pendentes: a **projeção real**
(com sessão de TV de verdade, sem a barra da prévia) em espera, missão, resultado e fim, e os
diálogos de **projeção** e de **edição da sala** pelo “Gerenciar sala” — este último, na rodada de
16/09, não abria; aqui a dobra é aberta antes do clique e o diálogo aparece (“Editar sala”, quatro
campos, cartão de 464 px). Prints antes/depois em `output/auditoria-refino-etapa6/antes` e
`.../depois`, com `medida.json` de cada lado, em 1920×1080, 1280×720, 900×700, 640×900, 1440×900 e
390×844. O cabeçalho da TV é medido por **geometria** — a faixa de cada filho da barra, com 20 px de
tolerância —, porque é geometria que estava errada, e um retrato de estilo não a vê.

**O que mudou, com o antes → depois.**

| Medida | Antes | Depois |
| --- | --- | --- |
| linha do botão “Tela cheia” no cabeçalho da TV | **sozinho na segunda linha** (topo 73) | **na primeira, junto da marca** (topo 18) |
| altura do cabeçalho — projeção real, 1920×1080 | 126 px | **72 px** |
| altura do cabeçalho — projeção real, 1280×720 | 123 px | **72 px** |
| topo do conteúdo — projeção real, 1920×1080 / 1280×720 | 297 / 141 px | **270 / 116 px** |
| topo do palco — prévia da TV, 1920×1080 | 238 px (barra da prévia: 100 px) | **184 px** |
| cabeçalho na largura de celular (900×700 / 640×900) | — (só depois) | **105 / 109 px, sobreposição 0** |
| raio do botão “Entrar” do login | 999 px (pílula) | **10 px, o mesmo da entrada do aluno** |
| altura / fonte / peso do mesmo botão | 50 px / 16 px / 900 | **48 px / 15 px / 600** |
| anel de foco do campo — entrada do aluno | 3 px `rgba(0,82,255,.16)` | **4 px `rgba(12,92,255,.10)`** |
| anel de foco do campo — login | 4 px `rgba(12,92,255,.10)` | igual ao da entrada (era o mesmo por acaso, agora por regra) |
| altura do cartão do login (1440×900 / 390×844) | 432 / 403 px | **430 / 401 px** |
| portal — altura do hero (1440×900 / 390×844) | 330 / 273 px | **330 / 273 px (sem mudança, por decisão)** |
| diálogo de projeção | QR, código de 56 px, ações, dica | **igual — ordem `qr → código → ações → dica`, endereço escrito **uma** vez** |

**O achado: uma linha inteira de cabeçalho, criada pela grade.** O botão “Tela cheia” não estava
sozinho na segunda linha por escolha de desenho — estava porque a barra é uma grade de **três**
colunas com o selo `LIVE` num pseudo-elemento com posição explícita (coluna 3, linha 1), e o botão,
auto-colocado, sobrava para a linha 2. Na projeção real isso custava **57 dos 126 px** do cabeçalho
em 1920×1080 (e 51 de 123 em 1280×720), empurrando o palco para baixo em toda apresentação. O selo
e o botão passaram a ser **duas colunas da mesma faixa**, à direita: uma linha, 72 px, e o palco
começa exatamente onde a barra termina — o teste novo mede essa igualdade na projeção de verdade.
Na largura de celular a sala desce para a segunda faixa (regra que já existia no cabeçalho) e a
marca e o botão seguem juntos na primeira, sem sobreposição.

**Os dois acessos viraram o mesmo botão, e o foco virou um anel só.** O login do professor ainda
era a pílula antiga — 999 px, 16 px, peso 900, com brilho — enquanto a entrada do aluno já lia a
família do produto (retângulo de 10 px, 15 px, 600); e o foco dos campos tinha **três larguras e
dois azuis** para o mesmo estado: 3 px de `rgba(0,82,255,.16)` na entrada do aluno, 4 px de
`rgba(12,92,255,.10)` no login. Agora as duas telas irmãs usam o mesmo botão e o mesmo anel, medido
por **Tab de verdade** — `:focus-visible` não casa com foco de script, e a primeira leitura de foco
mentia por isso.

**O portal não mudou, e isso é o resultado.** A composição já estava na forma que o plano pede
(marca, “Descubra o PROMPT” e a entrada centralizados, hero de 720 px de largura, tudo na primeira
tela em 1440×900 e em 390×844) e a textura de ambientação já estava atenuada — pontos de 1 px a
3,5% de alfa numa grade de 24 px, com máscara elíptica. Não havia o que reduzir com ganho claro de
foco, que é exatamente o critério que o plano dá para manter a versão atual. O diálogo de projeção
também já estava na ordem pedida: QR primeiro (topo 277, 234 px de altura), código de 6 dígitos
depois (56 px, peso 900), ações e a instrução curta por último — com a URL escrita uma única vez, e
o código da **sala** zero vezes (não se confunde com o código da projeção).

**As provas, e a catraca que corrigiu o caminho.** Portão 1: `npm test` **349/349** (6 s). Portão 2:
`npm run test:browser` **20/20** (155 s) — os 19 de antes mais a guarda desta etapa. Cartório da
cascata: 5 seletores mudaram e 1 foi acrescentado, todos intencionais. Catraca de contraste:
**219 conferidos / 0 reprovados / piso 5,08**, com a família *tinta sem fundo na chave* em 442 — e
uma medição de atribuição (desfazendo só as emendas desta etapa, em memória, com a própria régua do
projeto) mostrou que **esta etapa acrescenta zero** aos dois números: o movimento do arquivo é das
etapas 1 a 5. Declarações mortas: **0** — e foi essa catraca que barrou o primeiro caminho: a
pílula do login foi corrigida por sobreposição em `refinement.css`, e isso deixava duas
declarações de `design.css` sem valer em elemento nenhum; a forma passou a morar **num** lugar só,
com `!important` onde o `!important` do `.figma-cta` obriga. Retrato de estilo: mudou em **8 telas**
— entrada do aluno com código, painel-login, prévia da TV e projeção da TV, nas duas larguras —,
todas com **0 mudança de contagem de elementos** (168/168, 31/31, 32/32, 71/71): é estilo, não
estrutura.

**A guarda permanente.** `test/browser/arena-ui.test.mjs` ganhou um teste (5,5 s) que mede o que o
retrato não vê: a barra da TV tem de ter **uma** faixa de ferramentas em 1920×1080 e em 1280×720,
com o botão dividindo a linha com a marca e nada sobreposto; na projeção **real**, o palco começa no
pixel onde a barra termina; a 640 px só a sala muda de faixa; e as duas entradas entregam o mesmo
botão (forma, tamanho, fonte, peso, gradiente e brilho) e o mesmo anel de foco. Ele roda na ordem de
quem chega — primeiro as duas portas, depois o painel — porque o cookie é do navegador, não da
página: medir o login depois de autenticar é impossível.

**Limites que esta rodada declara.** (1) O portal e o diálogo de projeção foram **medidos e
mantidos**; não há antes/depois de estilo para eles, e o print serve como registro. (2) As larguras
estreitas da TV (900 e 640 px) só existem no “depois”: a captura foi criada nesta rodada, então não
há par de comparação — o que se afirma ali é que não há sobreposição nem faixa morta. (3) A guarda
mede os filhos reais da barra; o selo `LIVE` é um pseudo-elemento (coluna 3, linha 1, a mesma
faixa) e quem o vigia é o cartório da cascata, não a geometria. (4) A rodada descobriu um
comportamento do produto que vale registrar: a sessão de projeção viaja num cookie do navegador, e
abrir o **diálogo de projeção de outra sala** no mesmo navegador emite um token novo para aquela
sala — a TV da partida em cena cai em “Conectando a sala…” na leitura seguinte, com a rodada já em
`results` no servidor. Não é defeito das telas desta etapa, mas é o tipo de coisa que só aparece
quando alguém mede de verdade, e ficou escrito no roteiro. (5) O contraste desta etapa não foi
medido em pixel: os valores novos são de anel de foco e de brilho de botão, não de tinta sobre
fundo.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, etapa 5: os formulários longos

Quinta etapa do plano revisado em 16/09 (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`),
seção 5, mais o item 12 já fechado em rodada anterior (o "Modo de jogo" da nova sala) e as pontas
que ele deixou: as três telas nomeadas são **novo desafio**, **tempo das missões** e **nova sala**.
A etapa 6 (acessos e TV) veio depois, e o fechamento dela — incluindo a evidência do item 7 — é a
primeira seção deste registro.

**O instrumento da rodada.** `output/qa/refino-etapa5.mjs` sobe o servidor com banco em memória e
monta um professor com o que os três diálogos precisam para existir de verdade: uma sala de cinco
missões (uma cronometrada em 2:00, quatro sem cronômetro) para o ajuste de tempos rolar e ter o que
sugerir, e uma sala de **uma** missão cronometrada, que é o estado em que o atalho de sugestões não
tem o que oferecer. Cada diálogo é aberto de verdade, medido no DOM pintado
(`checkVisibility({ contentVisibilityAuto: true })` — `offsetParent` mente aqui: no Chrome o
conteúdo de uma dobra fechada continua com caixa) e fotografado em 1440×900, 1280×720 e 390×844,
com **todas as dobras abertas** no caso do desafio: é o formulário longo de verdade, e é nele que a
barra de salvar tem o que resolver. Prints antes/depois em `output/auditoria-refino-etapa5/antes` e
`.../depois`, com `medida.json` de cada lado.

**O que mudou, com o antes → depois.**

| Medida | Antes | Depois |
| --- | --- | --- |
| caixas com borda dentro dos dois grupos do desafio | 3 dobras com borda, fundo e raio | **0 — divisor de 1px, sem fundo e sem raio** |
| altura dos grupos (O aluno recebe / O juiz avalia) | 458 / 229 px | **436 / 218 px** |
| vão entre os grupos | 20 px | 20 px (mantido) |
| barra de salvar | `static`, no fim do formulário | **`sticky` na base da janela do diálogo** |
| salvar visível sem rolar — desafio fechado (1440×900) | não (topo 884 de 868 px) | **sim (topo 770 de 868)** |
| salvar visível sem rolar — desafio aberto (1280×720) | não (1 142 px abaixo da janela) | **sim (topo 590 de 688)** |
| salvar visível sem rolar — desafio aberto (390×844) | não (topo 2 244 de 828) | **sim (topo 744 de 828)** |
| salvar visível sem rolar — tempo das missões (1280×720) | não (topo 1 109 de 688) | **sim (topo 590 de 688)** |
| salvar visível sem rolar — nova sala (1280×720) | não (topo 991 de 688) | **sim (topo 590 de 688)** |
| selo do tempo que está no ar | pintado em **5 de 5** linhas (a duração, duas vezes) | **0 de 5**; nasce em 1 quando o campo diverge |
| linha do atalho quando todas as missões já têm cronômetro | `SPAN` "Todas as missões já têm cronômetro." | **não nasce** |
| "usar sugestão" | gradiente, sombra azul 12/24, raio 999, peso 900 | **retângulo 8 px, 600, sem sombra** |
| "Aceitar as sugestões…" | gradiente, pílula, peso 900 | **mesma família neutra** |
| dica do Modo de jogo | `p.form-message`, 46 px, reserva 20 px, margem 20 px | **`p.arena-field-hint`, 18 px, sem reserva, margem 8 px** |
| regiões de rolagem no diálogo da nova sala | 2 (corpo + lista com teto de 320 px) | **1 (o corpo)** |
| último campo da nova sala na janela (1440×900) | cortado (870→888 de 868) | **inteiro (830→848)** |
| rolagem do tempo das missões / nova sala | 321 / 203 px | 354 / 244 px (explicado abaixo) |

**As dobras internas deixaram de ser caixa dentro de caixa.** Os dois grupos de trabalho já são a
caixa com borda; dentro deles, as três dobras (imagem, campos opcionais, critérios e pesos) tinham
a sua própria borda, fundo e raio. Agora a dobra dentro de grupo é uma **linha do grupo**: divisor
de 1px acima, sem fundo e sem raio — o título da dobra segue sendo a alça. A dobra que **não** é
linha de grupo (os *ajustes da rodada*, e o resumo da partida na nova sala) continua cartão, e o
teste guarda as duas metades para ninguém achatar a que funciona. O ganho é de leitura (três caixas
a menos competindo com os campos) e de altura: −22 px no primeiro grupo, −11 px no segundo.

**O achado que o número revelou: o rodapé preso, e a armadilha do `margin-bottom` negativo.** A
barra de salvar é `sticky` e participa do fluxo: no fim da rolagem ela volta ao lugar natural, e a
reserva é a **margem de baixo do corpo do diálogo** (a mesma que separa todo o resto). A primeira
versão cancelava também essa margem (`margin: 0 -32px -32px`), na intenção de deixar a barra
colada na base — e a medição reprovou: o retângulo do `sticky` é encolhido pelas margens do próprio
elemento, então a barra ficava presa **32 px acima da base** e tapava os últimos **12 px** do campo
"Velocidade na pontuação" (`tmp/qa/probe-rodape.mjs` mostra o formulário filho por filho). A versão
que ficou cancela só as laterais (`margin: 0 -32px`, `20px` no celular): a superfície da barra
atravessa o respiro lateral e a reserva de baixo continua sendo do corpo. O teste mede as duas
coisas — a barra dentro da janela com a rolagem no topo, e, no fim, `reservaAbaixo ==
padding-bottom do corpo` — e a mensagem diz os dois números quando falha.

**O tempo das missões: o selo só existe quando difere.** A linha escrevia a **mesma duração duas
vezes** — no selo do `legend` e no campo. Agora o selo nasce vazio e escondido, e `refreshTimingTotal`
(que já roda a cada `input`) o acende só quando o campo deixa de dizer o que está gravado: rascunho
digitado ("no ar: 2:00") ou campo inválido. O selo deixa de ser cópia e passa a ser a única fonte
do que está no ar — que é a distinção de significado que o plano pedia para preservar. Com as
missões todas cronometradas, o atalho de sugestões **não nasce** (era uma linha inteira dizendo
"todas já têm cronômetro", informação que não muda decisão nenhuma), e os dois botões de ajuda
passaram a ler a família secundária (retângulo de 8 px, 12,5 px, peso 600, sem sombra): quem carrega
o gradiente, o azul e o peso 900 é só a ação principal do diálogo. As duas regras que davam peso de
CTA ao botão dentro do `.arena-timing-actions` e do `.arena-timing-suggest` foram **apagadas** junto,
porque deixaram de ter quem as produzisse.

**A nova sala: a dica deixou de ser mensagem, e a lista deixou de ter rolagem própria.** A dica do
modo de jogo era `<p class="form-message">` — a classe de erro e status, com `min-height: 20px` e
margem de mensagem, o que a fazia parecer um campo a mais; virou `.arena-field-hint` (12,5 px, sem
reserva, 8 px de margem), e o texto é o mesmo. A lista de missões tinha `max-height: 320px` com
barra própria **dentro** de um corpo que já rola: no celular o toque ficava preso na lista interna
e a própria lista saía da tela. Sem o teto, a rolagem do diálogo é uma só (o teste conta os
elementos roláveis e exige exatamente o corpo), e a lista inteira passa a ser vista — é daí que vem
o `+41 px` de rolagem da nova sala: **−40** da dica (altura e margem), **+9** da barra (padding de
14/18 contra a margem de 24 de antes) e **+72** da lista que deixou de ser cortada. É crescimento
deliberado: esconder cinco missões atrás de uma barra de rolagem interna não é economia de leitura.
O tempo das missões subiu **+33 px** pelo motivo oposto e igualmente deliberado: o botão secundário
nasceu com 38 px de altura e 114 de largura (era 34 e 107) em quatro linhas. Nenhum dos dois custa
alcance: com a barra presa, salvar está na janela nos dois diálogos.

**A cópia: +2 palavras, e um furo do instrumento medido.** O `arena.js` foi de 1344 para **1346**
palavras, e as duas são o rótulo `no ar:`. A frase que saiu na mesma rodada ("Todas as missões já
têm cronômetro.", 6 palavras) **não descontou** — ela morava no ramo `:` de um ternário dentro do
template grande do diálogo, e o extrator não enxerga literal dentro de `${...}`: medido em
`tmp/qa/regua-ve-o-aviso.mjs`, **0 das 6** entravam na conta (é o mesmo furo que a etapa 1 já tinha
declarado para o markup do convite). O teto ficou **igual ao medido** (1346) — sem folga — e a `nota`
do cartório registra a troca e o furo; o `contexto` do bundle passou a nomear o furo como dívida.

**Os dois portões.** `npm test` **349/349** e `npm run test:browser` **19/19** (eram 17; duas guardas
novas), em 216 s. Cartório da cascata regravado (chaves novas: `.arena-form-group .arena-form-fold`,
`.arena-btn-secondary` e seu `:hover`, `.arena-field-hint`, `.arena-dialog .arena-dialog-actions` nas
duas larguras e `.arena-timing-now[hidden]`; saíram as duas do `figma-cta` dentro do tempo). Catraca
de contraste: **219 conferidos** (217 antes), **0 reprovados**, piso **5,08** intacto — os dois pares
novos são o texto neutro do botão secundário (`#475569`, medido como **candidato** sobre 136
superfícies plausíveis, pior caso **7,58:1**) e o seu `:hover` (`#1e293b` sobre `#f1f5f9`,
**13,35:1**, contado como escrito). A família contada `tinta sem fundo na chave` foi de 441 para
**442** — `.arena-field-hint` é tinta sem fundo declarado na regra nem na chave (classificação obtida
com `tmp/qa/classifica-pares-etapa5.mjs`, não por dedução). Declarações mortas seguem **0**: as
propriedades que a regra nova vence na dobra ficam vivas para as dobras que **não** estão dentro de
grupo, e a catraca só conta o que perde na própria chave. Retrato de estilo: **nenhuma** tela se
moveu nesta etapa (o corpo do diálogo nasce vazio nas 18 telas do retrato, então as regras novas não
têm elemento para pintar) — a prova destas telas é o teste de navegador e os prints.

**As guardas que ficaram, e o que elas medem.** Duas provas de navegador novas em
`test/browser/arena-ui.test.mjs`: (1) *o formulário longo em linhas* — os dois grupos continuam
caixa (`1px 1px`), as dobras dentro deles têm só o divisor (`1px 0px`, fundo transparente, raio 0,
padding lateral 0), a dobra fora de grupo segue cartão, a mensagem do formulário vem **antes** da
barra, a barra é `sticky` e está na janela em 1280×720, e no fim da rolagem o último campo fica
inteiro acima dela com a reserva do corpo embaixo; (2) *uma única rolagem no diálogo* — a dica é
`.arena-field-hint` e não `form-message`, a lista não tem rolagem própria, a lista passa dos 320 px
que a cortavam, e marcar missão continua contando. No teste do tempo das missões, as asserções do
selo passaram a medir a nova regra nas duas pontas: sem divergência, **0 selos pintados**; depois de
aceitar a sugestão e de digitar um rascunho, os dois selos dizem o que está no ar
(`no ar: sem cronômetro` e `no ar: 2:00`); e, reaberto com as duas missões cronometradas, o atalho
não existe e o salvar está preso na janela. Três defeitos reais apareceram ao escrever essas guardas
e foram corrigidos no teste, não no produto: `input[name=speed_weight]` (o campo é um `select`),
`[data-arena-room-missions-list]` (é classe, não atributo) e a espera que exigia a barra colada na
base — que era justamente o defeito do `margin-bottom` negativo.

**Limites declarados.** O retrato de estilo não cobre diálogo nenhum (as 18 telas são de fluxo, e o
corpo do diálogo nasce vazio nelas): para estas três telas a prova é o teste de navegador, as
medidas e os prints — não há retrato de estilo que as pegue. A barra de salvar foi medida pelo
**botão** no roteiro e pelo **recipiente** no teste (posição e reserva); as duas leituras estão
descritas acima e nenhuma delas é estimativa. O fixture não tem missão com imagem nem arquivo
enviado, então o campo de arquivo dentro da dobra de imagem foi aberto e medido, mas não preenchido.
As larguras medidas são 1440×900, 1280×720 e 390×844.

**Artefatos.** Roteiro e medidas em `output/qa/refino-etapa5.mjs`; prints e `medida.json` em
`output/auditoria-refino-etapa5/antes` e `.../depois`; os dois diagnósticos usados para não escrever
número por dedução em `tmp/qa/probe-rodape.mjs`, `tmp/qa/regua-ve-o-aviso.mjs` e
`tmp/qa/classifica-pares-etapa5.mjs`. Nada commitado nesta passagem.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, etapa 4: o relatório

Quarta etapa do plano revisado em 16/09 (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`),
seção 4. As etapas anteriores tocaram painel e sala, a barra da prévia e as aulas; esta toca o
relatório. As etapas 5 e 6 (formulários, acessos e TV) seguem pendentes.

**O instrumento da rodada.** `output/qa/refino-etapa4.mjs` sobe o servidor com banco em memória e
faz o relatório nascer **com dados de verdade**: três alunos jogam uma rodada inteira pelo motor
clássico (`register` → `start_match` → `submit_prompt`, com `allowLegacyPublicApi` ligado só no
fixture), o que enche ranking, gráficos e tabelas. Sem isso a tela testada seria o estado vazio —
e o estado vazio esconde justamente o que esta etapa mede. O que ele grava: altura da página e
rolagem com as dobras fechadas (que é como o professor chega), a altura e o estilo de cada painel
fechado, o agrupamento (título do grupo, painéis e blocos de cada um), quantas vezes o período
está pintado, dobras aninhadas e o estado vazio. Tudo lido do DOM pintado (`checkVisibility`), não
do markup. Prints antes/depois em `output/auditoria-refino-etapa4/antes` e `.../depois`, mais a
impressão emulada por `Emulation.setEmulatedMedia`.

**O que mudou, com o antes → depois (1440×900 e 390×844).**

| Medida | Antes | Depois |
| --- | --- | --- |
| altura da página / rolagem, fechado (1440) | 1491 / 591 px | **1298 / 398 px** |
| altura da página / rolagem, fechado (390) | 2127 / 1283 px | **1601 / 757 px** |
| painel fechado (o que se repete na tela) | 86 px, `padding: 20px` | **60 px, `padding: 14px 16px`** |
| painéis fechados na grade (1440 / 390) | 11 / 12 | **7 / 8** |
| vezes que o período aparece pintado | 2 (pílula + linha de impressão) | **1 (pílula)** |
| dobras aninhadas | 0 | **0** |
| grupos nomeados | — | **3** |

**As consultas ficaram agrupadas por assunto.** `Atividade` (atividade diária, pontuadas por hora,
rodadas pontuadas, calor dia × hora), `Participantes e respostas` (ranking, cadastros, partidas e
respostas) e `Operacional` — este último **uma única dobra** com as quatro consultas operacionais
dentro (por computador, por modo, jogos e rodadas do evento), abertas de uma vez: o plano reprova
chegar a um dado simples atravessando aberturas em série, e o teste guarda isso. Foi de onde veio
a maior parte do ganho de rolagem: quatro caixas de 86 px viraram uma linha de 60 px.

**Os dois "Rodadas" deixaram de se chamar igual.** O gráfico virou `Rodadas pontuadas` (o que ele
mostra, ao lado de "Pontuadas por hora") e a tabela virou `Rodadas do evento` (o registro das
rodadas, agora em `<h3>` dentro do grupo operacional). Semear um `h3` no lugar do `<h2>` foi
decisão de hierarquia: dentro do grupo, os títulos dos blocos são um nível abaixo do grupo.

**A prosa do cabeçalho saiu, e por quê.** `Métricas, ranking e respostas das batalhas.` (5 palavras)
foi uma decisão registrada de uma rodada anterior — ficou porque "nomeia os três blocos do
relatório". Agora quem nomeia os blocos são os próprios grupos, logo abaixo: a frase virou a
repetição que o usuário reclamou, e saiu. A calha de palavras subiu de 103 para **106** (+3 no
líquido: entraram 8 de rótulo — três títulos de grupo e dois títulos desambiguados — e saíram 5),
e isso está escrito na `nota` do cartório, porque subir orçamento é decisão, não acidente.
`public/assets/js/app.js` **não mudou** (236/97): o título de seção do CSV continua `Rodadas` — ali
não existe a colisão de duas consultas na mesma tela, e a renomeação existe para desfazer essa
colisão. Uma primeira tentativa renomeou o CSV junto e custou +6 palavras no bundle; foi revertida.

**A impressão continua mostrando o período.** Tirar a segunda cópia da tela podia ter tirado o
período do papel: o `data-report-print-period` saiu. Medido com a mídia `print` emulada, o que
sustenta a impressão é a pílula do filtro — **1 ocorrência, `report-period-pill`** — e a linha de
impressão ficou com o carimbo de atualização. O print está em `07-impressao-1440.png`.

**Os dois portões.** `npm test` **349/349** e `npm run test:browser` **17/17**. Cartório da cascata
regravado (as chaves novas são as da dobra, dos títulos e dos `<h3>`; 92 linhas de diferença contra
o último checkpoint, que somam as etapas 1 a 4). Catraca de contraste: **217 conferidos**, **0
reprovados**, piso **5,08** intacto, e a família **contada** `tinta sem fundo na chave` de 438 para
**441** — as três regras novas que declaram tinta e nenhum fundo (`.report-group-title`,
`.report-block > h3` e o `:hover/:focus-visible` da dobra), todas acima do teto. Declarações
mortas seguem **0**. Retrato de estilo: só o **relatório** mudou, de 249 para **252 elementos** nas
duas larguras (3 títulos de grupo a mais), com o resto das telas idêntico.

**A guarda que ficou, e as duas mordidas provadas.** `test/web/pages.test.mjs` passou a exigir: as
**doze consultas** do relatório são oito painéis mais os quatro blocos do grupo; **toda dobra tem
alça** (`<details` = `<summary class="panel-title">` = 9); **o grupo operacional é uma dobra só, sem
`<details>` dentro**; os dois `Rodadas` são distintos; e o período aparece **uma vez**, sem
`data-report-print-period`. As duas metades novas foram provadas mordendo: com o gráfico de volta a
`Rodadas`, o teste falha com "os dois Rodadas voltaram a se chamar igual"; com o `span` de impressão
de volta, falha na contagem do período. As duas edições foram desfeitas em seguida.

**Limites declarados.** O fixture é o **motor clássico** (três alunos, um jogo, uma rodada), não uma
partida de Arena: as tabelas `Jogos`, `Rodadas do evento` e as comparações por computador/modo
ficam com uma linha ou nenhuma — a etapa mede altura, agrupamento e período, não conteúdo. O estado
vazio foi obtido filtrando um período futuro, não por base limpa. A impressão foi **emulada**
(mídia `print`), não impressa em papel, e a emulação não dispara `beforeprint` — então o print da
impressão mostra as dobras como estão na tela, e o caminho "abrir tudo para imprimir" não foi
refotografado nesta rodada. A largura de celular medida é 390×844, apenas.

**Artefatos.** Roteiro e medidas em `output/qa/refino-etapa4.mjs`; prints e `medida.json` em
`output/auditoria-refino-etapa4/antes` e `.../depois`. Nada commitado nesta passagem.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, etapa 3: as aulas e o banco

Terceira etapa do plano revisado em 16/09 (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`),
seção 2. A etapa anterior tocou a barra da prévia e as dobras do aluno; esta toca o cartão da aula
e a grade do banco. As etapas 4 a 6 (relatório, formulários, TV) seguem pendentes.

**O instrumento da rodada.** `output/qa/refino-etapa3.mjs` sobe o painel com o catálogo real das
quatro aulas (`src/domain/arena-lessons.mjs`), uma sala selecionada e o banco primeiro com um
desafio e depois com cinco, e grava `medida.json` com o que a seção 2 pede em número: o texto e as
palavras do resumo fechado, a altura de cada cartão, o topo dos botões de cada cartão (para
comparar os que dividem a mesma linha), o estilo computado de cada botão — fundo, relevo, raio,
fonte, peso — e a largura do cartão solitário contra a da grade. Prints em
`output/auditoria-refino-etapa3/antes` e `.../depois`.

**O que mudou, com o antes → depois.**

| Medida | Antes | Depois |
|---|---|---|
| resumo fechado da Aula 5 | 28 palavras em **3 linhas** (56 px) | **2 palavras, 1 linha** (19 px) |
| resumo fechado da Aula 2 / Aula 3 | 15 e 14 palavras em 2 linhas | **2 palavras, 1 linha** |
| resumo fechado da Aula 4 (um tipo só) | 5 palavras | **5 palavras** (sem mudança) |
| altura dos cartões (1440×900) | 246 / 246 / 246 / 265 px | **169 / 169 / 169 / 169 px** |
| topo dos botões na mesma linha | 431 / 431 / **412** (19 px de desalinho) | **586 / 586 / 586** |
| linhas da área de ação | **2** (as duas pílulas não cabiam) | **1** |
| botões da aula | 172×48 e 188×48, 16 px, peso 900, pílula | **124×44 e 134×44, 12,5 px, 700 e 600, retângulo de 8 px** |
| cartão do banco, **um** desafio | **1030 px** (a largura do painel) | **333 px** (a mesma faixa da grade cheia) |
| cartão do banco, cinco desafios | 333 px | 333 px (sem mudança) |
| cartões das aulas no celular (390×844) | 246 / 246 / 227 / 265 px | **221 / 221 / 221 / 221 px** |
| Aula 5 com a dobra aberta | 464 px, 7 missões | **441 px, 7 missões** (+ a linha de modalidades) |

1. **O resumo fechado diz o tamanho, não a lista.** A linha fechada era a maior do cartão na
   aula mais rica: a Aula 5 gastava 28 palavras em três linhas para enumerar sete modalidades, e
   a Aula 4 — uma só modalidade — resolvia em cinco. Agora a alça diz `7 missões`, e a consolidação
   pedida antes continua valendo onde ela informa (`4 missões de Engenharia Reversa`).
2. **A enumeração desceu para dentro da abertura**, numa linha acima das missões. **Nenhuma
   palavra nova**: as mesmas que já estavam na tela mudaram de lugar (o teto de cópia do painel
   segue 68, e o de `arena.js`, 1344).
3. **As ações alinham pela base do cartão.** O cartão virou coluna e a linha de ações usa
   `margin-top: auto`: em três cartões da mesma linha os botões agora começam no mesmo pixel, na
   mesma altura da base — era o pedido do plano para a Aula 4.
4. **A secundária parou de ser uma segunda principal.** `So criar no banco` herdava da pílula do
   CTA o mesmo tamanho e o mesmo peso 900 do botão principal: os dois liam como primários. As duas
   passam a ler a família de botões do painel (retângulo de 8 px, 12,5 px, 700 na principal e 600
   na secundária) e só a principal mantém preenchimento azul e relevo.
5. **O achado que o número revelou, e que não estava no plano.** As duas pílulas largas não
   cabiam nos 307 px de conteúdo do cartão: `172 + 188 + 8` = 368 px em `flex-wrap` viravam **duas
   linhas de ação** em todas as aulas (sobra de 57 px sob o primeiro botão, medido). Com os botões
   na largura da família, a ação cabe numa linha — 44 px em vez de 104 —, e é daí que vem a maior
   parte dos 77 px que o cartão encolheu.
6. **`auto-fill` no lugar de `auto-fit`.** Com um desafio só, o `auto-fit` colapsa as faixas
   vazias e o cartão estica pela largura inteira do painel: 1030 px contra 333 px dos cartões da
   grade cheia. `auto-fill` mantém as faixas, então a largura do cartão não depende de quantos
   irmãos ele tem. A regra das aulas ganhou também o `min(100%, 280px)` que a do banco já tinha —
   abaixo de 280 px de painel a faixa não estoura mais.

**Provas.** `npm test` **349/349** e `npm run test:browser` **17/17 em 147 s** (16 + o teste
novo). O cartório da cascata mudou em **11 seletores** (as três grades, o cartão em coluna, a área
de ação e as quatro regras novas de botão e de modalidades). A catraca de contraste foi de **216
para 217** pares conferidos, com `escrito` 165 → 166: o par novo é o branco sobre o azul da ação
principal (`#ffffff` em `#0052ff`, **5,75:1**). A família contada `tinta sem fundo na chave` foi de
437 para 438 (a linha das modalidades, `#545b61` sobre o cartão `#fbfcff` = **6,72:1**). O piso
segue **5,08**, reprovados **0** e declarações mortas **0**.

**Retrato de estilo.** Só o **painel do professor** mudou, nas duas larguras, de 222 para **225
elementos**: +3 é exatamente uma linha de modalidades nas três aulas de mais de um tipo (a Aula 4
não gera a linha). As telas de entrada e prévia continuam como a etapa 2 as deixou.

**Guarda nova.** O contrato do cartão de aula virou teste de navegador (`arena-ui.test.mjs`): as
quatro aulas iniciam fechadas; o resumo casa com `/^\d+ missões( de .+)?$/`; a enumeração está no
DOM e **não pintada** (`checkVisibility`) enquanto a dobra está fechada, e aparece quando o
professor abre; as ações da mesma linha começam na mesma altura (tolerância de 1 px); a secundária
pesa menos que a principal e é a única sem relevo; e o cartão solitário do banco ocupa uma faixa da
grade, não o painel. **Custo:** 2,0 s na suíte de navegador.

**Limites declarados.** O orçamento de cópia **não vê** esta etapa, e é esperado: a régua conta a
cópia declarada no HTML e nos literais do cliente, não o que está pintado, então as 20 palavras que
saíram da linha fechada continuam contadas onde sempre estiveram — quem mede o ganho de leitura é o
`checkVisibility` do teste e os prints. O resumo da Aula 4 ficou mais informativo que o das outras
(um tipo só preserva o nome do tipo); não é desalinho, é a consolidação pedida antes. E as capturas
que o plano pede no item 7 — gestão da sala, aluno ao vivo com votação e Wild Card, projeção real —
**foram fechadas depois** (primeira seção deste registro).

**Artefatos.** Roteiro e medidas em `output/qa/refino-etapa3.mjs`; prints e `medida.json` em
`output/auditoria-refino-etapa3/antes` e `.../depois`. Nada commitado nesta passagem.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, etapa 2: a barra da prévia e os grupos fechados do aluno

Segunda etapa do plano revisado em 16/09 (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`),
seção 3 (prévias e acabamento do aluno). A etapa anterior tocou painel e detalhe da sala; esta toca
a barra administrativa da prévia, as dobras do painel lateral do aluno e o respiro do composer da
missão. As etapas 3 a 6 (aulas e banco, relatório, formulários, TV) seguem pendentes.

**O instrumento da rodada.** `output/qa/refino-etapa2.mjs` monta o mesmo fixture em memória (sala
de 3 missões com a rodada encerrada e a sala fechada, sala de 1 missão, 6 participantes) e captura
10 estados nos dois tamanhos do plano, gravando `medida.json` com o que a seção 3 pede em número:
altura da barra, o que está à vista contra o que está atrás da dobra, o caret em relação ao título,
o que o cartão fechado ocupa e as distâncias do título ao campo e do campo ao envio. Sondas locais:
`output/auditoria-refino-etapa2/antes` e `.../depois`.

**O que mudou, com o antes → depois.**

| Medida | Antes | Depois |
|---|---|---|
| altura da barra, 3 missões (1440×900) | 186 px | **146 px** |
| altura da barra, 3 missões (390×844) | 266 px | **182 px** |
| controles de navegação à vista | `‹ Anterior`, `Próxima ›`, `1 2 3` | **nenhum (dobra)** |
| contagem da missão atual | dentro da linha de navegação | **alça da dobra, à vista** |
| topo da missão na prévia (1440×900 / 390×844) | 288 / 356 px | **248 / 272 px** |
| barra com UMA missão | 186 px, com `1` e dois botões mortos | **146 px, sem navegação nenhuma** |
| cartão fechado do aluno (`Resultados`, `Destaques`) | 105 px | **42 px** |
| sobra de linha do `summary` (caret sozinho) | 24 px | **0 px** |
| caret acima do título | sim | **não** |
| tentativas → campo (390×844) | 121 px | **107 px** |
| campo de resposta (390×844) | 216 px | **169 px** |
| envio na tela do celular | 831 px (a 13 px do fim) | **770 px** |
| altura da página da missão (390×844) | 940 px | **879 px** |

1. **A navegação vira dobra e a alça é a contagem.** Com duas ou mais missões, `‹ Anterior`,
   `Próxima ›` e a grade numerada foram para dentro de um `<details>` cuja alça é o próprio
   `Missão 1 de 3` que já estava na tela — **nenhuma palavra nova entra na barra** (o teto de
   cópia da tela é 133 palavras e não se moveu). A escolha sobrevive ao redesenho da barra pelo
   mesmo `toggle` que já guardava a alça do aviso de simulação.
2. **Com uma missão não existe navegação.** Os dois botões nasciam desabilitados e a grade
   numerada repetia a única missão. A contagem continua ("Missão 1 de 1") e o `👁 Ver gabarito`
   continua à vista — é ferramenta do professor, não navegação.
3. **A pendência da missão saiu da navegação e subiu para o cabeçalho.** O `⚠` que diz por que a
   missão não pode ir ao ar não podia ficar atrás da dobra que ele acabou de criar.
4. **As dobras do aluno param de desperdiçar uma linha.** O `summary` era `list-item` com um
   `h2` de bloco dentro: o marcador do navegador caía numa linha só para ele (24 px de sobra,
   medido) e o título começava abaixo. Agora a linha é flex e o caret é desenhado — o mesmo
   padrão que as alças do relatório e do painel do professor já usam. O título deixa de ter
   régua e respiro de bloco, e o cartão fechado perde o padding de conteúdo (105 → 42 px; dois
   cartões empilhados economizam 126 px de tela).
5. **Respiro do composer.** A folga entre a linha das tentativas e o campo caiu de 20 para 12 px,
   e a do rótulo para o campo de 14 para 8. A fonte não mudou — o rótulo segue em 21 px.
6. **O campo de resposta no celular.** Ele nascia com 216 px porque os oito `rows` do markup
   venciam a `min-height` (baixar o piso não mudava nada em tela — medido). Agora a altura
   inicial é de seis linhas (`clamp(120px, 20svh, 240px)`) e o campo continua crescendo com o
   texto. É o que traz o envio para dentro da primeira tela sem tocar em fonte nem em enunciado.

**Provas.** `npm test` **349/349** e `npm run test:browser` **16/16 em 143 s**. O retrato de estilo
mudou em **6 telas** (entrada do aluno, entrada com código e prévia do aluno, nas duas larguras),
com **0 mudança de contagem de elementos** (168/168 em todas) — é estilo, não estrutura; as telas
de entrada carregam o markup do lobby (as telas irmãs ficam no DOM, invisíveis), e é nele que as
dobras vivem. O cartório da cascata mudou em **17 seletores** (os 10 novos da barra e das dobras
declarados acima, e as 4 regras ajustadas de espaço). A catraca de contraste foi de **435 para
437** na família `tinta sem fundo na chave`: são os dois `:hover` novos de `summary`, em
`var(--blue)` sobre o branco do cartão do aluno (5,75:1) e sobre o azul-claro da barra da prévia
(5,32:1) — os dois acima do teto AA, e nenhum deles foi reprovado por teto: foram contados porque
a chave não declara fundo próprio. Os 216 pares conferidos, o
piso de 5,08 e as declarações mortas em **0** não se moveram.

**Um teste de navegador passou a mentir se eu não o tocasse.** `arena-ui.test.mjs` navegava entre
missões clicando em `[data-preview-step]` — botão que agora vive numa dobra fechada. O clique não
fazia nada e a espera seguinte estourava os 60 s. O teste passou a abrir a alça antes de clicar
(que é o caminho de quem usa a prévia) e ganhou duas guardas que faltavam: a escolha da dobra
sobrevive ao redesenho da barra na troca de missão, e, com **uma** missão, não existe
`[data-preview-step]` nem `[data-preview-jump]`, a contagem é `Missão 1 de 1` e o gabarito
continua acessível. O teste caiu de 67 s (espera estourada) para 7,3 s.

**Limites declarados.** A dobra da navegação não some para quem já navegava: as setas ← e →
seguem trocando de missão sem abrir nada, e é por isso que a barra pôde esconder os botões. O
instrumento de visibilidade da primeira rodada estava errado — com o `details` fechado o Chromium
mantém a caixa dos filhos e o retângulo responde; a medida passou a usar `checkVisibility`, e o
`innerText` confirma o mesmo (o texto da dobra não aparece). Os prints do encerramento mostram o
cartão fechado, não o conteúdo aberto. E as capturas que o plano pede no item 7 — gestão da sala,
aluno ao vivo com votação e Wild Card, projeção real — **foram fechadas depois** (primeira seção
deste registro).

**Artefatos.** Roteiro e medidas em `output/qa/refino-etapa2.mjs`; prints e `medida.json` em
`output/auditoria-refino-etapa2/antes` e `.../depois`. Nada commitado nesta passagem.

## Revisão de manutenção — 2026-09-16 (continuação) — A tinta sem fundo na própria regra: os seis pares órfãos voltam à aritmética

A seção anterior fechou o corte das 598 declarações mortas deixando um furo nomeado: a régua de contraste
só media a regra que declara tinta **e** fundo no mesmo corpo, e a tinta que mora sozinha numa regra saía
da conta. Esta fecha o furo pelo lado que o pedido nomeia — a **mesma chave** (mídia + seletor), que é onde
a cascata junta as regras. **Nenhuma folha foi tocada nesta rodada**: a mudança é só da régua.

**O que a régua passou a fazer.** Uma regra que declara `color` e nenhum fundo deixa de ser ignorada: a
camada própria dela passa a ser a que a **chave** pinta, venha de outra regra do mesmo seletor, de outra
folha, ou de um `!important` que sobreviveu ali. Quem manda continua sendo a cascata — a declaração de cor
precisa ser a vencedora da chave, senão o par é o que não está em tela. A regra que não declara fundo **em
lugar nenhum da chave** entra na lista com família própria, em vez de sumir: é a população que nenhuma
composição de camadas alcança por não haver o que compor.

**Os seis pares que o corte de ontem orfanizou voltam, e com o fundo certo.** Medidos pelo mesmo
instrumento nas duas árvores — `node output/qa/contraste-tinta-na-chave.mjs`, que lê as folhas
congeladas em `tmp/qa/css-antes-corte/` contra as de hoje:

| par | antes do corte (fundo da própria regra) | hoje (fundo da chave) |
|---|---|---|
| `.figma-cta-blue` | 6,39 · `var(--blue)` | **6,39** · `design.css:689` |
| `.join-card .arena-field > span` | 6,89 · `#fff` | **6,89** · `.join-card` |
| `.arena-roster-item` | 14,68 · `var(--color-surface)` | **14,68** · `design.css:2923` |
| `.figma-cta-gradient` | 5,91 · `linear-gradient(90deg,var(--blue),var(--cyan))` | **5,77** · `design.css:690` |
| `.arena-feedback` | 9,90 · `#f8fafc` | **9,57** · `refinement.css:141` |
| `.arena-tv-rank` | 17,49 · `rgba(15,23,42,.7) !important` | **18,34** (candidato, 135 superfícies) |

Quatro ficaram com o mesmo número; dois mudaram. A diferença entre eles é o motivo do furo: **o fundo que
a régua usava era justamente a declaração morta que o corte apagou**. `linear-gradient(90deg,var(--blue),…`
para o CTA e `#f8fafc` para o feedback nunca pintaram — perdiam a cascata —, e nenhum portão dizia isso. A
partir de agora o par é medido contra quem pinta de verdade, e o relatório escreve de onde veio o fundo
(`fundo da mesma chave (design.css:690)`).

**A prova de que a régua nova não mexeu no que já era medido.** Rodada sobre as folhas **de antes do
corte**, ela reproduz o instantâneo gravado naquela rodada **campo por campo**: 215 conferidos, 167
`escrito` / 48 `candidato`, piso 5,08 — exatamente `tmp/qa/contraste-antes-corte.json`. A única diferença
está na lista de fora da aritmética, que passou a incluir o que antes era invisível. Estruturalmente, o
caminho só muda quando a regra não declara fundo: onde ela declara, a camada própria já era a mesma.

| árvore | conferidos | escrito | candidato | piso |
|---|---|---|---|---|
| antes do corte, régua de hoje | 215 | 167 | 48 | 5,08 |
| hoje, régua anterior (tinta **e** fundo na mesma regra) | 203 | 156 | 47 | 5,08 |
| hoje, régua nova | **209** | **161** | **48** | **5,08** |

**O que ficou contado.** Na chave sem fundo nenhum, `tinta sem fundo na chave`: **431 regras** vivas hoje
(438 na árvore de antes do corte). Não é contagem de defeito — é o alcance da aritmética, dito em número
em vez de em silêncio, e é o próximo passo possível (compor com a **cadeia de ancestrais** escrita no
seletor, que é o que ela já sabe fazer para o par de fundo translúcido). Junto vieram as regras de só-tinta
que perdem a cascata (22 → **79** na árvore antiga), as de cor não resolvida (1 → 5, `color: inherit` do
normalize) e `.arena-tv`, que agora aparece em `gradiente não resolvido` em vez de não existir: o fundo
dela é um gradiente de várias camadas cuja primeira tem parada translúcida, e a régua prefere nomear a
limitação a inventar um número.

**A metade nova morde — provado na folha viva.** Coladas duas regras da mesma chave em `design.css`, uma
dando só o fundo (`#10b981`) e a outra só a tinta (`#ffffff`, 11 px/800): a guarda reprova apontando
`design.css:3613 .arena-alvo-da-guarda`, **2,54 < teto 4,5**, com `cor #ffffff sobre fundo da mesma chave
(design.css:3612)` — o relatório nomeia a regra irmã que pinta. Removidas as duas linhas, verde. A catraca
morde pelo mesmo lado: com a sonda colada, o piso cai de 5,08 para 2,54. Dois controles novos no teste
guardam o caminho: o par repartido em duas regras dá **o mesmo 3,22** do controle de pseudo-elemento, e o
mesmo par em **outra folha** (tinta na primeira, fundo na segunda, como no caso real) mede 7,68.

- **Portões:** `npm test` **349/349** (347 + 2 controles) e `npm run test:browser` **16/16** em 143s.
  `test/css/cascata.json` e `test/css/render.json` **byte a byte iguais** — inclusive aos registros de
  antes do corte —, e nenhum arquivo de `public/assets/css` foi tocado: a catraca de contraste foi a única
  regravada (`203 → 209` conferidos, piso mantido em 5,08). Nada commitado.
- **O limite declarado.** A composição vale para a **chave**. A tinta que não tem fundo declarado ali e
  depende do ancestral continua fora da aritmética — agora contada (431), não escondida.

## Revisão de manutenção — 2026-09-16 (continuação) — Zero: as 598 declarações mortas saem das folhas

A seção anterior congelou em 598 o que não podia crescer. Esta corta as 598 — **100 regras inteiras**
(todas as declarações delas eram mortas) e **357 declarações** soltas, em cinco folhas:

| folha | bytes | linhas |
|---|---|---|
| `design.css` | 117 219 → 101 542 (**−15 677**) | 4 213 → 3 610 |
| `refinement.css` | 26 968 → 25 720 (−1 248) | 756 → 705 |
| `app-authorial.css` | 29 637 → 28 625 (−1 012) | 270 (minificada) |
| `round.css` | 20 247 → 19 715 (−532) | 266 → 262 |
| `arena.css` | 93 756 → 93 282 (−474) | 3 980 → 3 951 |

**Por que apagar é inerte, por propriedade.** Chave é o par (mídia, seletor): a declaração que perde
disputa exatamente os mesmos elementos que a vencedora, e a cascata escolhe uma. A perdedora não se
aplica a elemento algum — e nada herda de uma declaração que nunca se aplica. Remover a regra inteira é o
mesmo argumento aplicado a todas as declarações dela de uma vez.

**Prova 1 — o cartório.** `test/css/cascata.json` **byte a byte igual**: 1 677 chaves, 0 diferenças. Nenhum
vencedor se moveu, em nenhum contexto de mídia. É a prova que o pedido nomeia.

**Prova 2 — o que se pinta.** O instantâneo de estilo do portão 2 (`test/css/render.json`) ficou
**idêntico**, e o portão passou **16/16 em 166s** nas 24 telas: mesma propriedade, mesmo valor, mesma
contagem de elementos.

**Prova 3 — a medida que motivou o corte.** `declaracoesMortas` = **0**. O instantâneo da catraca virou
`{ total: 0, identidades: [] }`, e o controle de sanidade dela mudou de lado: como lista vazia é agora o
resultado **esperado**, o que separa "tudo limpo" de "leitor cego" é o tamanho do que foi **lido**
(*6 376 declarações, piso 4 000*) — um parser que deixasse de enxergar uma folha derruba esta contagem.

**Três erros do meu instrumento, os três pegos antes de gravar.** O primeiro corte saiu errado e foi
revertido do instantâneo: o começo da regra era calculado a partir do corpo, e não do `{`, o que deixava
`seletor {` órfão e inventava **82 chaves fantasmas** na leitura seguinte. O plano passou a conferir que o
texto antes do `{` é o seletor. O segundo: duas regras vizinhas removidas reivindicavam o mesmo espaço em
branco (um span expandia para frente, o outro para trás) — agora a folga vai só para trás e o plano
reprova spans sobrepostos. O terceiro: a lista de alvos vinha da cascata **de cada folha**, que não vê as
**20 declarações que perdem para um vencedor que mora em outra folha** (578 em vez de 598) — agora quem
manda é a cascata inteira. Nenhuma das três gravou arquivo errado: o script aborta antes de escrever, e o
corte foi reaplicado com os deslocamentos reconferidos.

**O custo declarado: 12 pares de contraste deixaram de existir.** Um par é uma regra que declara tinta e
fundo; quando a declaração de fundo era morta, ela saiu e a regra ficou com tinta sem fundo. Seis desses
12 têm irmão na mesma chave com a **mesma tinta resolvida** — a cobertura mudou de dono, para a regra que
vence. Os outros seis **perderam a medida**: `.figma-cta-gradient` (5,91), `.figma-cta-blue` (6,39),
`.arena-tv-rank` (17,49), `.join-card .arena-field > span` (6,89), `.arena-roster-item` (14,68) e
`.arena-feedback` (9,90) — todos bem acima do teto AA, mas sem aritmética de contraste agora, porque o
fundo deles vem de outra regra da mesma chave. A catraca de contraste foi regravada com a diferença
nomeada: **215 → 203 conferidos**, `escrito` 167 → 156, `candidato` 48 → 47, e o **piso ficou em 5,08**
(não caiu: nenhum par foi apertado, só deixaram de existir).

- **Portões:** `npm test` **347/347** (catracas regravadas com a diferença nomeada);
  `npm run test:browser` **16/16** em 166s, com `cascata.json` e `render.json` **byte a byte iguais**.
  Nada commitado.
- **O furo que o corte expôs, e que fica dito.** A régua de contraste só mede regra que declara tinta **e**
  fundo na mesma regra. Toda regra que declara tinta sem fundo está fora da aritmética — antes escondida
  atrás de uma declaração de fundo morta que a acompanhava, hoje exposta. Fechar isso é fazer a régua
  compor a tinta com quem pinta atrás **na mesma chave**, que é o mesmo raciocínio que a sonda de pixels já
  aplica no DOM vivo.

## Revisão de manutenção — 2026-09-16 (continuação) — A catraca das declarações mortas: nenhuma nasce, e o piso não é zero

O pedido era congelar o zero que a rodada anterior alcançou. Medir antes de escrever a guarda mostrou que
aquele zero era mais estreito do que parecia — e é isso que fica registrado, porque número menor escondido
atrás de uma definição não é número.

**O zero de ontem era de PARES.** A família que chegou a 0 contava só as declarações de `color` em regras
que **também declaram um fundo** — o objeto da régua de contraste. Contando **qualquer** declaração que
perde a cascata na própria chave, as cinco folhas têm hoje **598**: `design.css` 482, `app-authorial.css`
44, `refinement.css` 38, `arena.css` 17 e `round.css` 17, espalhadas em 63 propriedades. Entre elas, **71
são `color`** — as outras 49 vivem em regras sem fundo declarado, e por isso a família de pares nunca as
viu.

| guarda | o que conta | hoje |
|---|---|---|
| família `regra que perde a cascata` (contraste) | `color` mais fundo na mesma regra | **0** |
| catraca nova (`test/css/mortas.test.mjs`) | qualquer propriedade, na própria chave | **598**, como teto |

**Então o piso não é zero: é 598, e zero continua sendo o alvo.** A guarda faz o que dá para fazer agora —
nenhuma declaração nova pode nascer morta, e qualquer uma das 598 pode sair. O que ela guarda é
`test/css/mortas.json`: **42 KB de identidades**, não de contagens.

**Por que identidade, e não contagem.** A identidade é `folha|mídia|seletor|propriedade:valor`, com
ordinal quando a mesma declaração morta se repete na mesma chave. A **linha não entra**: ela anda quando
alguém edita acima, e um instantâneo sensível a isso obrigaria a regravar a cada remendo — foi assim que
um cartório já ficou com 12 seletores mudos. Com identidade, crescer aqui é sempre uma declaração nova que
nasceu morta, e a mensagem diz qual, onde e **quem vence** — as duas origens, que é o que quem lê precisa
para decidir qual das duas cores está viva.

**A régua lê a mesma lista que o cartório.** `declaracoesDaCascata` é agora a base de `cascataDe` (o
vencedor de cada chave) e de `declaracoesMortas` (quem perde): duas perguntas sobre uma lista só, em vez de
duas implementações da cascata que podem discordar. Depois do refactor, `test/css/cascata.json` ficou
**byte a byte igual** — 1677 chaves, 0 diferenças.

**As duas metades mordem, provado na folha viva.** Com `.arena-timer { color: rebeccapurple; }` colada no
fim de `design.css`, a guarda reprova apontando **`design.css:4215 .arena-timer`**, o que ela declara
(`color: rebeccapurple`) e quem vence (`#fff !important` em `design.css:3269`). Apagada a linha: verde. No
caminho inverso — instantâneo regravado com ela e depois a linha apagada — quem reprova é a outra metade,
com `1 declaração morta desapareceu`: um instantâneo que ficou para trás esconderia um corte. Nada disso é
automático de propósito: mudança de cascata pede registro.

**Seis controles, porque catraca só olha o conjunto de hoje.** A segunda regra da mesma chave vence e a
primeira é morta; `!important` decide antes da ordem, nos dois sentidos; declaração única não é morta e
contexto de mídia diferente é outra chave; atalho e longo não se matam (`background` × `background-color`,
o limite declarado da régua, que erra para o lado de não acusar); e a identidade com ordinal separa duas
mortas idênticas na mesma chave. Sem eles, um detector que nunca acusasse nada passaria na catraca.

- **Portões:** `npm test` **347/347** (341 mais os 6 controles); `npm run test:browser` **16/16** em 141s,
  com `cascata.json` e `render.json` **inalterados** — a guarda não toca em tinta nenhuma. Nada commitado.
- **O que falta para chegar a zero.** Os 482 de `design.css` são a pilha de sobrescrita acumulada: a folha
  tem uma seção antiga e outra que a reescreveu. Cortá-las é a mesma operação mecânica das 22, com a mesma
  prova de inércia (chave igual, conjunto de elementos igual, e a declaração que perde não se aplica a
  ninguém). `output/qa/losers.mjs` e `output/qa/plano-corte.mjs` já localizam e apagam pelo corpo da regra,
  hoje só para `color`; generalizá-los para qualquer propriedade é o próximo passo — e, enquanto isso, a
  catraca garante que nenhuma morta nova entre.

## Revisão de manutenção — 2026-09-16 (continuação) — As 22 declarações que nunca pintam saem das folhas

A seção anterior deixou uma dívida nomeada: **22 pares da família `regra que perde a cascata`** —
declarações de `color` em regras cuja chave (media + seletor) tem outra regra que vence. Elas existem no
arquivo e **não existem em tela nenhuma**. Esta rodada as apaga, e o argumento não é "parece que não
muda": é que não pode mudar.

**Por que apagar é inerte, por definição.** A chave é a mesma — mesmo seletor, mesmo contexto de mídia —,
logo o conjunto de elementos é idêntico; e a cascata escolhe **uma** declaração por propriedade. A que
perde não se aplica a elemento algum, e como nada a herda, também não sai do documento por herança.
Apagar a que perde não pode pintar nada de diferente em nenhuma tela.

**Prova 1 — o cartório.** `test/css/cascata.json` serializa o vencedor de cada chave. Comparado antes e
depois das 22 remoções: **1677 chaves, 0 diferenças.** Byte a byte igual. Nenhum valor efetivo se moveu,
em nenhum contexto de mídia.

**Prova 2 — o que se pinta.** O instantâneo de estilo do portão 2 (`test/css/render.json`) ficou
**idêntico**, e o portão passou **16/16 em 141s** com as 24 telas capturadas: mesma propriedade, mesmo
valor, mesma contagem de elementos. É a mesma prova de sempre, feita em Chromium real.

**Prova 3 — a catraca de contraste.** `npm test` **341/341**, e a catraca mudou **uma linha**: a família
`regra que perde a cascata` de **22 para 0**. `conferidos` (215), a distribuição por contexto (167 escrito
/ 48 candidato) e o piso (5,08) ficaram **intactos** — esperado, porque essas declarações eram pares
*pulados*, não medidos: elas não entravam em conta nenhuma, só na contagem de quem ficou fora.

**O que era, por tipo de repetição** (22 no total: 20 em `design.css`, 2 em `app-authorial.css`):

| Tipo | Exemplos |
|---|---|
| a mesma cor escrita duas vezes | `.arena-attempt-dot.is-scored` com `#fff` perdendo para `#ffffff !important` (duas ocorrências), `.arena-timer` com `#f8fafc !important` para `#fff !important` |
| o token da casa tomando o lugar do literal (ou o contrário) | `var(--navy)` → `var(--color-text)`/`var(--color-text-muted)` em `.report-period-pill`, `.report-data-table th`, `.arena-roster-item` e `.arena-feedback`; `var(--blue)` → `var(--color-primary)` em `.ghost-link`; `#4a4f63` → `var(--color-primary)` em `.arena-preset-chip` |
| regra antiga duplicada, sobrevivendo embaixo da nova | `.arena-mission-badge` (2), `.arena-attempt-dot.is-scored` e `.is-pending` (2 cada), `.arena-feedback` (2), `.text-field span` e `.ghost-link` em `app-authorial.css` |

Lidas em conjunto, as 22 são o **registro fóssil das rodadas anteriores**: a paleta velha (`--navy`,
`--gray`, `--blue`, `#4a4f63`, `#003ec7`, `#37d9c5`, `#12692c`, `#f8fafc`) que os tokens da casa foram
substituindo, e a regra que cada rodada reescreveu sem apagar a anterior. Apagá-las não é faxina estética:
é a razão de a régua ter de carregar uma família só para isso — enquanto elas existem, quem lê o arquivo
não sabe qual das duas cores está em tela sem consultar o cartório.

- **Como o corte foi feito.** `output/qa/losers.mjs` enumera as 22 (arquivo, linha, valor que perde e o
  que vence); `output/qa/plano-corte.mjs` localiza cada uma **pelo corpo da própria regra** — não por
  varredura de linha, que erra em folha minificada onde dezenas de regras moram na linha 1 — e imprime o
  trecho exato que sairia. Só depois de conferir a fila ele escreve, e aborta se o deslocamento não bater.
  Nenhuma regra ficou vazia e nenhum `;` órfão ficou no arquivo.
- **Portões:** `npm test` **341/341**; `npm run test:browser` **16/16** em 141s, com o instantâneo de estilo
  **idêntico**. Nada commitado.
- **O que sobra fora da aritmética,** depois desta rodada: 3 pares, e os três são limitação de verdade —
  1 imagem de fundo, 1 `background-clip: text` e 1 `inherit`. Acabou a família que era dívida de arquivo.

## Revisão de manutenção — 2026-09-16 (continuação) — As camadas de trás: os 66 pares sem número entram na aritmética

A seção anterior fechou com o furo declarado: **45 pares fora da aritmética por fundo translúcido e 21
por fundo transparente** — e foi exatamente ali que nasceram os dois piores achados da semana, o chip de
modo `is-arena` a **2,12** no topbar escuro da TV e o `::before` de "RESULTADO FINAL" a **3,22**. Um par
assim existe no arquivo e não tem número nenhum: a régua o pulava com motivo escrito e nenhuma captura de
tela o alcança. Esta rodada compõe as camadas de trás e traz os 66 para dentro da conta.

**O que a régua passou a fazer com um fundo que não é opaco.** Ela resolve a pilha na ordem em que o
navegador pinta — o filme da própria regra (quando é ela que pinta), as camadas de trás escritas no
seletor (`.lobby .codigo`), as superfícies que o sistema declara e o branco do canvas — e o par carrega no
campo `contexto` a qualidade do que se sabe:

| contexto | pares | o que é | veredito |
|---|---|---|---|
| `escrito` | 167 | a ancestralidade está no seletor, ou a camada mais externa é opaca, ou nada mais pinta | a aritmética é a do que o navegador pinta: **reprova** abaixo do teto |
| `candidato` | 48 | o filme é translúcido e o seletor não diz onde o elemento vive (`.ghost-link` aparece no cabeçalho claro do relatório e na barra escura do painel) | medido sobre as **135 superfícies** que o sistema declara; reprova só se reprovar em todas |

**O par que nenhum portão via, e ele era real.** `.sidebar-logout:hover` estava com `#d93025` sobre o
filme `rgba(217,48,37,.08)` do próprio tom: **4,23** — 0,27 **abaixo** do teto AA. Ele atravessou duas
rodadas de unificação de vermelho porque o fundo translúcido o tirava da conta: a cor antiga escapou por
não existir para a régua. Rodando a régua **nova sobre as folhas de ontem**, ele reprova em 4,23; corrigido
para o vermelho da casa sobre o filme da mesma família (`#b3261e` sobre `rgba(179,38,30,.08)`), fica em
**5,75**. É a única tinta que mudou nesta rodada — duas declarações, uma chave.

**Números, e o que se compara com o quê.** Antes: **171 conferidos, 69 fora** (45 translúcido, 21
transparente, 1 imagem, 1 texto pintado, 1 cor não resolvida). Agora: **215 conferidos = 167 `escrito` +
48 `candidato`**, e **25 fora** (22 regra que perde a cascata, 1 imagem de fundo, 1 texto pintado com o
fundo, 1 cor não resolvida). **0 reprovados.** Os totais fecham pelos dois lados: 66 pares saíram da lista
dos de fora e 22 entraram nela, e 69 − 66 + 22 = 25 tanto quanto 171 + 66 − 22 = 215. Distribuição dos
215: 2 em 4,5–5, 9 em 5–5,5, 50 em 5,5–6, 58 em 6–7, 18 em 7–8, 11 em 8–10 e 67 acima de 10.

**A conta que eu não forcei.** `escrito` foi de 171 para 167, e são exatamente **quatro** os pares
`candidato` que declaram fundo **opaco** na própria regra: `.arena-preset-chip` (`#eef1f8`),
`.arena-lobby-stats > span:first-child` (`#e9f9f0`), `.arena-mission-badge` (`#eef3ff`) e
`.arena-attempt-dot.is-pending` (`var(--soft-blue)`). Nesses quatro, quem pinta **não é** o fundo que a
regra declara: é o filme de outra regra da mesma chave, que vence a cascata. Medir o fundo declarado neles
era otimista — agora estão no contexto que declara a dúvida.

**Os 25 que continuam fora, e por quê.** **22 são declarações que nunca pintam**: as folhas repetem regras
para a mesma chave e a segunda vence (`.report-period-pill` com `var(--navy)` perdendo para
`var(--color-text)` em `design.css:133`; `.report-header .ghost-link` com `#003ec7 !important` perdendo
para `var(--color-primary) !important` em `design.css:173`; `.arena-attempt-dot.is-scored` com `#fff`
perdendo para `#ffffff !important` em `design.css:359`). Medir a que perde é inventar problema que ninguém
vê em tela, e por isso ela sai da aritmética **com o motivo escrito e dentro da catraca** — era um furo
novo da mesma família dos outros. As outras três são o que a aritmética não alcança mesmo: 1 imagem de
fundo, 1 `background-clip: text` e 1 cor que não resolve (`inherit`).

**O que a régua nova teve de aprender sobre si mesma — três correções, todas achadas por um número que não
podia estar certo.** (1) Seletor composto global (`body[data-page='arena'] …`) casando como ancestral em
qualquer página: passou a valer como **base**, não como camada provada. (2) Pseudo-**classe** tratada como
pseudo-elemento, o que fazia o `::before` de um item virar "caixa sobre o texto" e escurecer a lista
inteira. (3) Competição entre chaves **diferentes**, que faltava: o `background: transparent !important`
do cabeçalho do relatório vence o navy declarado em outra chave, e sem conferir importância,
especificidade e ordem o link azul daquele cabeçalho era medido contra navy e reprovava por engano.
Nenhuma das três foi contornada com exceção: cada uma virou regra do módulo.

**O que os `candidato` ainda não provam, dito na frente.** Dos 48, **46 passam em alguma superfície e não
em todas**, e só **2 passam em todas** (`.toast` e `.text-field input`, 14,81–16,14). A pior superfície de
cada um fica registrada, mas entre 135 superfícies declaradas sempre existe uma cuja luminância empata com
a da tinta: a mediana do `pior` é **1,00**, e isso é estrutural, não é achado. O veredito de um `candidato`
é, portanto, uma existência ("há superfície em que passa"), mais fraca que a de um `escrito` — é por isso
que a catraca conta os contextos separados e o **piso conta só os `escrito`**. Medir contra a superfície em
que o elemento de fato vive exigiria o DOM vivo, e quem faz isso é a sonda de pixels.

**O piso mudou de população, e a diferença é verificável por dentro.** `test/css/contraste.json` foi
regravado: **215 conferidos**, **48 candidato / 167 escrito**, piso **5,08**. O piso desceu de 5,55 para
5,08 — e **não há regressão nenhuma nele**: os **156 pares que declaram fundo sólido continuam com mínimo
exatamente 5,55**, o piso da rodada anterior intacto. O novo mínimo é de um par que **não tinha número
algum** antes: `refinement.css:153 .arena-roster-item em`, tinta `#0052ff` sobre o filme
`rgba(0,82,255,.08)` do próprio azul, **5,08**. Compor o filme do próprio tom aperta o par — é o mesmo
efeito que o controle do fundo verde documenta (4,62 sobre branco, 4,38 sobre o próprio filme).

**Controles novos: o instrumento não é confiável sem eles.** Quatro testes entram na guarda: a composição
do filme contra quem pinta atrás, com os números do caso real (4,62 → 4,38 no verde, e o chip azul a
**2,02** sobre o topbar escuro, que é o achado da semana reduzido a controle positivo); o seletor que não
diz onde vive, medido sobre as superfícies plausíveis **e** reprovando quando reprova em todas; a regra que
perde a cascata, que não vira par; e o pseudo-elemento como caixa dentro do elemento, não camada de trás.

- **Portões:** `npm test` **341/341** (337 + os 4 controles); `npm run test:browser` **16/16** em 151s — o
  instantâneo de estilo não mudou, porque a única tinta tocada é um estado de `:hover`, que as capturas
  não abrem.
- **Custo visual:** um só, e é cor de estado — o `:hover` de "Sair" do painel deixou de usar o vermelho
  antigo (`#d93025`) e passou ao vermelho da casa (`#b3261e`), com o filme de fundo acompanhando.
- **Onde eu parei, e por quê.** Fora da aritmética sobram três pares que ela não alcança de verdade
  (imagem de fundo, `background-clip: text`, `inherit`) e 22 duplicatas que não pintam. As duplicatas não
  são risco de contraste: são dívida de arquivo — regra velha que ainda mora na folha e agora aparece
  nomeada no relatório da catraca. O que continua fora do CI é a sonda de pixels, que segue sendo a régua
  do pixel pintado.

## Revisão de manutenção — 2026-09-16 (continuação) — A fila apertada sai de 5,0–5,5: o piso vai de 5,29 para 5,55

A seção anterior abriu folga nos pares que a régua reprovava e deixou o resto da fila declarado:
**13 pares entre 5,00 e 5,50**, todos do mesmo tipo — o cinza da casa sobre superfície cinza clara,
com os selos e pontos em 5,31–5,50, e o selo de prévia da TV (`#050a1c` sobre `#4d7cff`, 5,29).
AA aprovava com 0,5 de margem sobre o teto e mais nada: era a fila mais barata de derrubar.

**A causa era uma só, e por isso o conserto é um só.** O cinza secundário da casa estava escrito
**quatro vezes** — `#5f6368` (24 regras), `#64748b` (6), `#53637b` (1), `#9aa0a6`/`#8b98ad` (2) —
e o token era o mais claro deles. As 30 regras passaram a ler `var(--color-text-muted)` e o token
desceu de `#5f6368` para `#545b61`: uma linha move a fila inteira, nenhuma regra ganhou
sobrescrita. Foi consolidação e folga na mesma emenda.

| Par (folha, seletor) | Antes | Depois |
|---|---|---|
| selo de prévia da TV (`arena.css:3067`) | **5,29** | **5,90** |
| `.arena-status-badge` sobre `#eef0f5` (`arena.css:420`) | **5,31** | **6,05** |
| `.arena-status-badge.is-ended`, `.is-closed` sobre `#f1f1f4` (`arena.css:437`) | **5,37** | **6,12** |
| `.arena-attempt-dot` sobre `#f1f3f4` (2 regras em `design.css`, 1 em `round.css`) | **5,44** | **6,19** |
| `.arena-timer.is-paused` / `.is-untimed` da rodada (`round.css:97`, `101`) | **5,44** | **6,19** |
| `.arena-completo-hint ul li` sobre `#eef3fa` (`design.css:2713`) | **5,48** | **6,18** |
| `.arena-attempt-dot.is-scored`, branco sobre o gradiente (3 ocorrências) | **5,48** | **5,91** |
| `.arena-preset-chip.is-classic` sobre `#fff1de` (`arena.css:1233`) | **5,50** | **6,15** |

O gradiente do ponto marcado foi o único que não se resolveu pelo token: ele carrega branco, então a
superfície é que desceu (`#047857→#065f46` virou `#036b4c→#05402f`). Duas emendas menores fecham a
rodada: o selo de prévia da TV clareou (`#4d7cff` → `#5a86ff`) e os dois chips de modo escureceram
no próprio fundo claro (`#b35a00`→`#8f4700`, `#007a5e`→`#006650`).

**A distribuição, medida.** Antes: 171 pares conferidos, mínimo **5,29**, 13 na faixa 5,00–5,50.
Agora: **171 pares, mínimo 5,55, zero abaixo de 5,00 e zero entre 5,00 e 5,50**, 50 entre 5,5 e 6,
52 entre 6 e 7, 69 acima de 7. O pior dos treze saiu de 5,29 para 5,90. O novo mínimo do sistema é
`.is-boss .arena-mission-badge` sobre `#fce8e6` (5,55) — fora da faixa que esta rodada atacou.

**Uma correção de conta, declarada.** A seção anterior escreveu "11 pares entre 5,0 e 5,5". A
reconstrução a partir do cartório daquela rodada dá **13**, e é ela que vale: reproduz o mínimo
5,29 e os 171 pares registrados, e a reversão usada para medi-la foi provada (abaixo). As duas que
faltavam são cópias da mesma regra (as três ocorrências do `.is-scored`). O número anterior foi
escrito à mão sobre uma saída que rolava na tela; este sai de script.

**O piso subiu: 5,29 → 5,55**, em `test/css/contraste.json`. E morde: com o piso registrado em
5,60 e o medido em 5,55, o teste reprova nomeando os dois números. O piso antigo era folga real de
0,79 sobre o teto; o de agora é 1,05.

**Atribuição, não aceitação.** Cartório da cascata: **34 chaves, 35 declarações**, cada uma caindo
sobre uma emenda — a troca do token aparece uma vez, em `:root`, e as 30 regras aparecem como a
troca do literal pelo mesmo token. Retrato de estilo: **14 telas, 322 elementos, 11 pares
(propriedade, valor)** — e os onze são o mesmo par: `color` de `rgb(95,99,104)` /
`rgb(100,116,139)` / `rgb(83,99,123)` para `rgb(84,91,97)`, com os quatro `border-*-color`
acompanhando a corrente acima dele. **0 mudança de contagem de elementos** (29 / 168 / 222 / 249
intactos) e nenhuma sombra, medida ou fundo se moveu.

**A reversão foi provada dos dois lados.** Primeiro no texto declarado: revertidas as emendas nas
folhas, a cascata serializada bate com o cartório anterior em **1677 chaves, 0 divergências**.
Depois no que se pinta: com as folhas revertidas, a captura em Chromium **passa contra o retrato
versionado**. Só então as 13 medidas do "antes" foram aceitas.

**O custo visual, declarado.** O cinza secundário ficou dois tons mais escuro em 322 elementos
pintados de 14 telas (entrada do aluno, prévia, painel, relatório, portal). É o texto de apoio do
produto inteiro mudando de peso — listado aqui em vez de diluído em "ajuste de contraste".

**O que a sonda de pixels acrescentou.** 604 medições em 19 estados do aluno e da TV, 573 delas
sobre texto de verdade: **0 abaixo do teto**, mínimo real 4,77 (o selo da rodada na TV, teto 4,5).
72 razões subiram e 3 desceram — e as três são o mesmo grupo, o cartão do PIN na TV, todas marcadas
pela própria sonda com `caixaConfere: false` e `fundoLiso ≈ 0,02` (fundo de brilho não uniforme) e
caixa imóvel (`moveu: 0`): a amostra do anel bateu em outro ponto do gradiente, e nenhuma
declaração daquele cartão foi tocada nesta rodada. As três ficam registradas como leitura
inconclusiva, não como ganho.

- **Portões:** `npm test` **337/337**; `npm run test:browser` **16/16** em 177s.
- **Onde eu parei, e por quê.** Os 50 pares entre 5,5 e 6,0 são a nova fila: não há mais nenhum
  par com folga abaixo de 1,05 sobre o teto por decisão de cor, e o próximo passo de paleta
  (o `--cyan`, os cinzas mais fundos) agora tem espaço para ser feito sem derrubar a fila.
- **O que continua fora do CI.** A sonda de pixels e os scripts de reconstrução do "antes"
  (`output/qa/probe-contraste.mjs`, `reverter-4.mjs`) rodam quando alguém os roda. A guarda sem
  navegador é que roda em cada envio; ela cobre a aritmética declarada, não o pixel pintado.

## Revisão de manutenção — 2026-09-16 (continuação) — Folga real: o piso de contraste sai de 4,50 para 5,29

A guarda de pares declarados mostrou onde o sistema estava apertado, e o resultado foi
constrangedor: **os pares que ela reprovava foram consertados, mas os que passavam estavam no
limite exato**. Seis pares em 4,55 (branco sobre o fim do gradiente de marca) e um em **4,50
cravado** (`#188038` sobre `#e6f6f2`). AA aprovava; folga não existia. Qualquer ajuste de
paleta — o `--cyan`, o verde da casa — derrubava a fila inteira de uma vez.

**O que abriu a folga.** Duas causas, tratadas na raiz:

| Onde | Antes | Depois |
|---|---|---|
| `--color-accent` (token) com texto branco: 4 gradientes, o chip do código e o ponto marcado | `#00875a` **4,55** | `#00725a` **5,91** |
| parada do meio do gradiente do CTA (`.figma-cta`, `.figma-cta-gradient`) | `#087edc` **4,18** | `#0a63c9` **5,77** |
| selo `is-playing`/`is-results` sobre `#e6f6f2` | `#188038` **4,50** | `#12692c` **6,11** |
| ponto marcado da rodada sobre `#e6f4ea` (2 regras) | `#137333` **5,24** | `#12692c` **6,00** |
| chip `is-connected` sobre `#e9f8ef` | `#176f4e` **5,60** | `#12692c` **6,21** |
| pílula "conectados" do lobby sobre `#e9f9f0` | `#16734f` **5,35** | `#12692c` **6,25** |
| chip `is-me` sobre `#eaf1ff` | `#0b56e9` **5,26** | `var(--color-primary)` **5,63** |
| perigo em superfície branca (dois botões do painel) | `#d93025` **4,77** | `#b3261e` **6,54** |
| selo do boss sobre `#fce8e6` | `#c5221f` **4,92** | `#b3261e` **5,55** |
| "fechar detalhe" sobre branco | `#64748b` **4,76** | `#5f6368` **6,05** |
| chip `is-personalizado` sobre `#e9fbf4` | `#007a5e` **4,96** | `var(--color-accent)` **5,51** |
| família do ouro: lugar, nome do campeão, selo `::before`, `is-draft` | `#8a5a12` **5,28–5,72** | `#845413` **5,76–6,24** |

Três dessas foram **consolidação**, não só folga: o verde único (`#12692c`) substitui quatro
verdes que erravam cada um por um pouco; o perigo já era um vermelho só desde a passagem
anterior e agora cobre também o branco e o boss; e o chip `is-me` deixou de carregar um
`#0b56e9` quase-igual ao `--color-primary` — a mesma deriva de paleta que apareceu no azul dos
selos. O `is-personalizado` passou a usar o token do accent, então acompanha o token sozinho.

**A distribuição, medida.** Antes 170 pares conferidos, mínimo **4,50**, 12 na faixa
4,5–5,5. Agora **171 pares**, mínimo **5,29**, e: **0 abaixo de 4,50, 0 entre 4,5 e 5,0, 11
entre 5,0 e 5,5, 160 acima de 5,5**. O par que virou conferido é o do `.figma-cta`: com a
parada do meio em 5,77, todas as paradas passam, então o gradiente saiu de "fora da
aritmética" (69 agora, era 70) e o limite que a seção anterior declarou em aberto está
fechado.

**O teto desceu para o novo medido — virado do avesso.** Em contraste não existe teto de
palavras: o análogo é a **folga**, e ela virou catraca. O `test/css/contraste.json` passa a
guardar `piso` (o menor contraste entre os pares conferidos) ao lado da contagem dos pares
fora da aritmética, e o teste reprova se o piso **cair** — subir é de graça. O piso registrado
é **5,29**; ele era 4,50 na prática, sem ninguém olhando. Provado que morde: devolvendo o
`#188038` ao selo verde, o teto AA continua aprovando (4,50 ≥ 4,5) e **a catraca reprova**,
nomeando o par, o valor antigo e os três seguintes mais apertados.

**Atribuição, não aceitação.** Cartório: **16 chaves, 16 declarações**, cada uma caindo sobre
uma emenda — a troca do token aparece uma vez, em `:root`. Retrato: **10 telas, 12 elementos,
4 pares (propriedade, valor)** — o `border-left` do accent na entrada do aluno (6 elementos),
o cinza do "fechar detalhe" no painel (2), o gradiente do chip de código no painel (2) e o do
CTA no relatório (2) —, com **0 mudança de contagem de elementos** (168/222/249 intactos). De
novo com prova de reversão: desfeitas as emendas, a captura **passou contra o retrato
versionado**; regravei e o portão 2 fechou. As outras emendas (verdes, vermelhos, âmbar, chip
`is-me`) não pintam em nenhuma das 24 telas capturadas: estão provadas pelo cartório e pela
régua, e é isso que o AUDIT diz delas.

**O custo visual, declarado.** O accent ficou dois tons mais fundo: isso muda o fim de quatro
gradientes (CTA, chip do código, chip de sala, botão de envio do código da TV), a borda
esquerda das caixas de dica e o fundo do ponto marcado. Nada disso é marca nova, é o mesmo
matiz — mas é mudança visível, listada aqui em vez de diluída em "ajustes de contraste".

- **Portões:** `npm test` **337/337**; `npm run test:browser` **16/16**.
- **Onde eu parei, e por quê.** Os 11 pares entre 5,0 e 5,5 são todos do mesmo tipo: tinta
  cinza da casa (`--color-text-muted`) sobre superfície cinza clara (selos e pontos: 5,31 a
  5,44) e o selo de prévia da TV (`#050a1c` sobre `#4d7cff`, 5,29). Subir esses significa mexer
  no token de texto secundário — que vale para o produto inteiro — ou reajustar superfícies
  claras; é uma reforma de paleta, não folga. Ficam registrados pelo piso: se qualquer um
  deles apertar, a catraca reprova.

## Revisão de manutenção — 2026-09-16 (continuação) — Refino visual, item 1: painel e sala

Primeira etapa do plano revisado em 16/09 (`output/auditoria-visual-2026-09-16/PLANO-ATUALIZADO-PARA-OUTRA-IA.md`),
que pede foco, hierarquia e densidade — não corte de texto nem redesenho de identidade. A
etapa toca o painel do professor e o detalhe da sala; as etapas 2 a 6 (prévias, aulas e banco,
relatório, formulários, TV) seguem pendentes.

**O instrumento da rodada.** `output/qa/refino-capturas.mjs` monta o fixture das referências
(sala de 3 missões, 8 participantes, juiz de mentira, banco em memória), captura 34 estados e
grava `medida.json` com o que o plano pede em número: cápsulas com fundo por cartão, estilos
de botão, altura do convite, quantas vezes o PIN aparece no texto, posição do estado e da ação.
`output/auditoria-refino/antes` (código íntegro, via `git stash` das duas folhas) e `.../depois`
saíram do **mesmo roteiro**, com os mesmos dados e larguras.

**O que mudou, com o antes → depois.**

| Medida | Antes | Depois |
|---|---|---|
| cápsulas com fundo por cartão de sala | 3 / 4 / 3 | **1 / 2 / 1** |
| ocorrências do PIN no detalhe | 3 | **2** |
| ocorrências do PIN na página | 5 | **3** |
| título do detalhe | `Oficina de prompts (XWVE82)` | **`Oficina de prompts`** |
| altura do convite (espera) | 398 px | **363 px** |
| topo do estado da sala | 573 px | **149 px** |
| topo dos controles (atividade) | 571 px | **149 px** |
| topo da primeira missão (atividade) | 1033 px | **645 px** |
| altura do detalhe no celular (390×844) | 2523 px | **2149 px** |
| texto da regra do sorteio repetido | 2× | **0×** |

1. **Cartões de sala.** Código, contagem de missões e modalidade eram cápsulas coloridas;
   viraram texto simples com separador (`PIN … · 3 missões · Personalizado`). Continuam com
   fundo só o estado da sala e o aviso "⚠ n a corrigir", que são o que muda decisão. As
   classes são as mesmas (`arena-room-code`, `arena-room-missions-badge`, `arena-preset-chip`)
   — mudou o tratamento, no bloco `.arena-admin .arena-room-card-badges`.
2. **Ordem da sala.** O convite vinha antes do cabeçalho, e o botão principal ficava **190 px
   acima** do estado que ele muda. Agora o cabeçalho (estado, participantes, controles da fase)
   vem primeiro, depois os avisos de missão incompleta e só então o convite. Estado e ação
   cabem na primeira tela em 1440×900 sem rolagem.
3. **Convite em atividade.** Com a aula em andamento o bloco inteiro vira uma dobra com o PIN na
   alça ("Convite da sala — **NPRS87**"); na espera ele fica aberto, que é quando serve para
   trazer gente. É o que compra os −388 px até a missão.
4. **Convite mais baixo.** PIN de 56 para 34 px, coluna de 244 para 210 px, QR de 72 para 56 px
   e folgas internas menores.
5. **Código uma vez.** Saiu do título e do rótulo do botão ("Copiar 123456" → "Copiar
   código"). O número continua grande no convite, uma vez.
6. **Sorteio.** O texto curto embaixo de cada botão de modo repetia a dica que o servidor manda
   logo abaixo ("todos concorrem sempre" contra "Todos concorrem em todas as rodadas"). O curto
   saiu; a dica e o motivo de bloqueio ficaram.
7. **Uma família de botões.** A alça "Gerenciar sala" e o chip de tempo eram pílulas ao lado de
   botões retangulares de 8 px. As ações da fase, as duas prévias e a alça passam a ler a mesma
   forma (retângulo 8 px, 12,5 px de texto, hierarquia primária/secundária/destrutiva); o chip de
   tempo vira informação — "⏱ 3 missões · 9 min *ajustar*" — em vez de parecer botão.

**Provas.** `npm test` **349/349** e `npm run test:browser` **16/16**. O retrato de estilo mudou
em **2 das 18 telas** (o painel do professor nas duas larguras), com **0 mudança de contagem de
elementos** (222/222) — é estilo, não estrutura. O cartório da cascata foi regravado (24
seletores novos). A catraca de contraste foi de **209 para 216** pares conferidos (escrito
161→165, candidato 48→51) com o **piso mantido em 5,08**; os dois piores pares seguem sendo
`candidato` (`.arena-mission-empty::before` a 4,66 e `body.arena-classic-room .arena-mission-badge`
a 4,76), de veredito fraco por desenho. Declarações mortas seguem **0**.

**O achado que a régua de cópia não via.** O teto do bundle `arena.js` subiu de 1325 para 1344
com `nota` no cartório — e o motivo é cobertura, não cópia nova: o markup do convite saiu de
dentro de um `${...}` do template grande e virou template próprio, e o instrumento
(`literaisDeCodigo`) não enxerga trecho dentro de `${...}`. São as mesmas 22 palavras que já
estavam na tela. No saldo real a cópia da rodada **encolheu 6 palavras** (os dois textos curtos
do sorteio). Fica registrado como buraco do instrumento: markup em ramo de template é invisível
para o orçamento.

**Limites declarados.** A dobra do convite esconde QR, link e projeção durante a atividade —
um clique (ou Enter na alça) abre, e o código continua visível na alça. "Copiar código" perde o
número no rótulo; ele está grande ao lado. O retrato de estilo **não cobre o detalhe da sala**
(as 18 telas são de fluxo), então a prova dele são os prints e as medidas, não o instantâneo.
E as capturas que o plano pede no item 7 — gestão da sala, aluno ao vivo, projeção real — **foram
fechadas depois** (primeira seção deste registro).

**Artefatos.** Roteiro e sondas em `output/qa/refino-capturas.mjs`; prints e medidas em
`output/auditoria-refino/antes` e `.../depois`. Nada commitado nesta passagem.

## Revisão de manutenção — 2026-09-16 (continuação) — Pares declarados viram guarda do CI

A seção anterior fechou dizendo onde estava o buraco: a conferência de pares declarados era
um script de auditoria (`output/qa/pares-declarados.mjs`, aposentado nesta passagem — era uma
lista de pares escrita à mão, que envelhece em silêncio enquanto a folha muda), não uma
guarda. Enquanto não
virasse teste, um selo novo com par de cores ruim entrava sem ninguém ver — foi assim que o
chip `is-arena` chegou ao topbar escuro da TV a 2,12 e que o `::before` de "RESULTADO
FINAL" ficou em 3,22 sem aparecer em captura nenhuma. Virou guarda.

**O que a guarda é.** `test/css/contraste.test.mjs`, sobre `test/support/contraste-css.mjs`:
para cada regra que declara cor de texto e fundo **na mesma regra**, resolve `var()` contra
os tokens do projeto e calcula a razão WCAG do par, com teto por corpo e peso (4,5 normal,
3,0 em ≥24px ou ≥18,66px a partir de 700). Sem navegador, sem servidor: roda em ~80 ms
dentro de `npm test`, a cada envio. Ela cobre exatamente onde a sonda de pixels não chega —
selos, pílulas, `::before`/`::after` e estados que a fixture não abre.

**O que ela não vê, e o que impede isso de virar buraco.** Fundo translúcido (o que está
atrás vem de outra regra), imagem de fundo, `background-clip: text`, regra com `opacity` e
gradiente cuja **pior parada** não passa: nos quatro o par não é conferido por aritmética e
sai com motivo escrito. A segunda metade do teste é uma **catraca**: as contagens por
família de motivo ficam em `test/css/contraste.json` e qualquer diferença reprova, com o
exemplo de cada família no relatório. Hoje: **170 pares conferidos, 70 fora da aritmética**
(45 fundo translúcido, 21 fundo transparente, 1 imagem, 1 texto pintado com o fundo, 1
`inherit`, 1 gradiente com pior parada em 4,18).

**As duas provas do instrumento, feitas antes de confiar nele.** Com um selo ilegível
(`#fff` sobre `#10b981`, 11px/800) colado numa folha viva, a guarda reprova apontando
`arena.css:3982` com **2,54 < teto 4,5** e a tinta e o fundo usados — e ao remover o selo,
volta a 10/10 verde. Com um selo **translúcido** (par fora da aritmética), quem reprova é a
catraca, não o teto: é o furo que não tem número, e ele também está fechado.

**Os 14 pares que a régua reprovou, e o que virou.** Nenhum era tinta decorativa:

| Onde | Antes | Depois |
|---|---|---|
| `is-draft` sobre `#fff4e5` | `#b06000` **4,28** | `#8a5a12` **5,44** |
| `is-waiting`/`is-open`/`is-refinamento` sobre `#eef3ff` | `#1a73e8` **4,05** | `var(--color-primary)` **5,75** |
| `is-sprint` sobre `#fdeaf2` | `#d93025` **4,14** | `#b3261e` **5,67** |
| `.arena-challenge-criteria span` sobre `#eef3ff` | `#1a73e8` **4,05** | `var(--color-primary)` **5,75** |
| `.arena-table button.is-danger`, `.arena-image-preview button` sobre `#fdeae7` | `#d93025` **4,11** | `#b3261e` **5,63** |
| `.arena-mission-badge` sobre `#eef3ff` | `#1a73e8` **4,05** | `var(--color-primary)` **5,75** |
| `.arena-attempt-dot` (três variantes: `#9aa0a6/#eef0f5`, `#8b98ad/#eef2f8`, `#64748b/#f1f5f9`) | **2,32 / 2,60 / 4,34** | `#5f6368` sobre `#f1f3f4`/`#f1f5f9` **5,44 / 5,44 / 5,52** |
| `.arena-attempt-dot.is-scored` com texto branco sobre gradiente | `#10b981 → #059669` **2,54** | `#047857 → #065f46` **5,48** |
| `.arena-detail-close:hover` e as duas ações destrutivas do painel sobre `#fef2f2` | `#ef4444` **3,44** / `#dc2626` **4,41** | `#b3261e` **5,98** |

Duas escolhas de vocabulário, não só de número: o azul dos selos virou **o token da casa**
(`--color-primary`) em vez de um `#1a73e8` solto que discordava dele, e a família de perigo
inteira adotou **um** vermelho (`#b3261e`) no lugar de três (`#d93025`, `#dc2626`, `#ef4444`)
que erravam cada um por um pouco. O âmbar `#8a5a12` é o mesmo que a família do ouro já usava
desde a passagem anterior.

**Atribuição, não aceitação.** O cartório da cascata mudou em **10 chaves / 11 declarações**
(cada uma caindo sobre uma emenda; nenhuma de arrasto), e ele prova de novo o que já se sabia:
as três variantes mortas do `attempt-dot` e o `arena-mission-badge` de `design.css:299` não
aparecem no contrato porque uma regra posterior com a mesma chave vence — a régua enxerga a
declaração que perde, o cartório registra a que ganha. O retrato de estilo mudou em **2 telas,
14 elementos, 0 mudança de contagem** (222 → 222), e **um único par (propriedade, valor)** em
todo o instantâneo: `color: rgb(26,115,232) → rgb(11,87,208)` — o azul dos selos do painel do
professor, 7 spans em cada viewport. Para afirmar isso, revertí as 14 emendas com script
próprio, rodei a captura e ela **passou contra o retrato versionado** (logo a reversão era
fiel e toda a diferença é atribuível), depois comparei dump por dump. As 13 outras emendas
não pintam em nenhuma das 24 telas capturadas — estão provadas pelo cartório e pela régua,
não pelo retrato, e é isso que o AUDIT diz delas.

- **Portões:** `npm test` **337/337**; `npm run test:browser` **16/16**.
- **Limites que ficam declarados.** (1) Onde a regra não declara `font-size`, a régua adota o
teto **estrito** (4,5) em vez de resolver herança: erra pedindo olho humano, nunca perdoando —
hoje nenhum par cai nessa zona, nenhum entre 3,0 e 4,5 com corpo herdado. (2) O
`.figma-cta` do portal tem gradiente com a pior parada em **4,18** (branco sobre `#087edc`,
que cai no fim da curva, aos 86%): fica fora da aritmética **com o número à vista** e a sonda
de pixels — que mede o ponto onde a letra está — continua aprovando. Não é pendência
silenciosa, é limite de quem não vê geometria no arquivo. (3) A guarda olha só o que está
declarado na mesma regra: par montado por regra de um lado e fundo de outro continua sendo
território da sonda de pixels, que segue sendo a régua de verdade.

## Revisão de manutenção — 2026-09-16 (continuação) — Contraste medido no aluno e na TV

O plano pedia medir contraste em vez de afirmá-lo. Medido, e onde ficava abaixo de AA,
corrigido. O instrumento é `output/qa/probe-contraste.mjs`: Chromium real, **19 estados**
(aluno e TV em 390×844, 1440×900, 1280×720 e 1920×1080), **604 medições**. Ele não lê a cor
declarada — lê o pixel pintado: a tinta no miolo do glifo e o fundo num anel fora dele,
com conferência contra a cor que o CSS diz (quando as duas discordam, a linha é marcada),
teto por corpo e peso (4,5 para texto normal; 3,0 para texto grande, ≥24px ou ≥18,66px
em negrito). Dados de demonstração em banco separado, em memória.

**Antes:** 442 medições válidas, 157 "a decidir" (fundo do anel não uniforme — o número
não decide sozinho), 5 com régua suspeita. **11 linhas abaixo do teto**, das quais 2 entre
as válidas e 9 entre as "a decidir".

**Depois:** 445 válidas, 123 a decidir, 36 suspeitas, **0 abaixo de AA**. A única linha que
reprovava e continua fora do veredito é declarada abaixo, com o motivo.

| Onde | Elemento | Antes | Depois | Teto |
|---|---|---|---|---|
| aluno, missão (390×1400) | "Enviar prompt" — botão travado | **2,83** | **7,03** | 4,5 |
| aluno, missão (1440×1100) | "Enviar prompt" — botão travado | **2,59** | **7,03** | 4,5 |
| aluno, missão (1440×1100) | atalho "Ctrl + Enter ↵" | **2,24** | **7,30** | 4,5 |
| aluno, resultado e fim | "1º lugar · Campeão" | **3,52 / 3,46 / 3,51** | **5,72 / 5,57 / 5,70** | 4,5 |
| aluno, fim | nome do campeão | **3,42** | **5,61** | 4,5 |
| aluno, votação | contador verde do topo | **4,28** | **5,58** | 4,5 |
| TV, votação | selo "Arena — Turma vs. Juiz" | **2,12** | **15,06** | 4,5 |

- **O botão travado apagava o texto junto com o controle.** `.arena-submit:disabled` usava
  `opacity: 0.55`, o que levava "Enviar prompt" a 2,83 e o atalho a 2,24 — abaixo até do
  mínimo de texto grande. O estado desligado passou a ter paleta própria (`#e3e8f0` de
  fundo, `#414c60` de tinta, atalho em `#cbd3e1`/`#333c52`), que lê como indisponível e
  continua legível. **Consequência declarada:** o mesmo `disabled` cobre os estados
  transitórios ("Entrando…", envio em curso) — ali o botão agora também fica neutro, e
  quem diz o que está acontecendo é a mensagem ao lado.
- **A pílula verde e o selo de modo.** O contador verde do topo do aluno estava em 4,28
  sobre a própria pílula verde (`#188038` sobre `rgba(24,128,56,.1)`) → `#136c2f`, 5,58.
  O selo de modo `is-arena` **não tinha par de cores**: herdava o azul do tema claro e caía
  no topbar escuro da TV a 2,12. Passou a ter fundo opaco e tinta escura (`#f5f7fc` /
  `#071f49`, 15,06), como os irmãos `is-classic`, `is-turma` e `is-personalizado`.
- **A família do ouro.** `#b7791f` no lugar e `#b07e00` no nome do campeão davam 3,42–3,52
  sobre o cartão creme — dois âmbares parecidos falhando pelo mesmo motivo. Viraram um
  âmbar só, `#8a5a12` (5,28 no pior fundo), aplicado aos três lugares.
- **O buraco que o olho não vê: pseudo-elemento.** A sonda de pixels não alcança
  `::before`. O selo "🏆 RESULTADO FINAL 🎉" estava em **3,22** (`#b07e00` sobre `#fef2ca`)
  e o selo do modo Clássico em **4,31** (`#b35a00` sobre `#fff1de`). Foi uma conferência
  aritmética de pares declarados na mesma regra (`output/qa/pares-declarados.mjs`) que
  achou os dois. Corrigidos para **5,28** e **5,50**; os outros doze pares declarados
  conferidos já passavam.
- **A régua estava errada num caso, e é preciso dizer qual.** A linha do campeão da TV
  reprovava com 4,01 medido no `<li>` a 16px/400. Mas o `<li>` não pinta texto: quem
  pinta são os filhos, com corpo e peso próprios (24px/700 no nome, 26px/800 nos pontos,
  24px/900 na posição), medidos à parte e aprovados — e em 1280×720 a mesma linha mede
  13,66. O 4,01 era o anel pegando o ouro do gradiente atrás da medalha. Corrigi a
  **régua**, não a tela: contêiner sem texto próprio sai do veredito com o motivo escrito
  ("quem pinta a letra é o filho, medido à parte"). Isso tirou 5 linhas do veredito nesta
  passagem, todas contêineres, e nenhuma delas escondia reprovação real — as 11 de antes
  estão todas listadas acima, uma por uma.
- **Atribuição, não aceitação.** O cartório da cascata mudou em **10 pontos** (2 seletores
  novos, 8 declarações), cada um caindo sobre uma emenda. O retrato de estilo mudou em
  **10 telas e 22 elementos**, com **0 mudanças de contagem de elementos**, e **só três
  pares (propriedade, valor)** distintos em todo o instantâneo: a tinta da pílula verde
  (18×) e o par do selo de modo (4×). Para provar isso, revertí as emendas, rodei a
  captura e ela **passou contra o retrato versionado** — logo a reversão era fiel e a
  diferença toda é atribuível; depois comparei dump por dump, e nada mais se moveu (nem
  `opacity`, nem sombra, nem uma única propriedade de caixa). O botão travado não aparece
  no retrato porque nenhuma das telas capturadas o exibe nesse estado: essa correção está
  provada pela sonda de pixels, não pelo retrato.
- **Portões:** `npm test` **327/327**; `npm run test:browser` **16/16 em 136s**.
- **O que continua aberto, sem fingir cobertura:** a conferência de pares declarados é um
  script de auditoria, não uma guarda no CI — enquanto não virar teste, um selo novo com
  par de cores ruim pode entrar sem ninguém notar. Seguem pendentes também o zoom de 200%,
  os alvos de toque, a medição de contraste nos estados que a fixture não abre (Wild Card,
  erro de rede, pausa) e a captura da TV em 1920×1080 e 1280×720 dentro do retrato.

## Revisão de manutenção — 2026-09-16 (continuação) — Etapas B a F do plano visual

Mesmo método da etapa A, uma etapa por vez e **cada uma com o delta atribuído antes de
regravar o retrato**: um dump de estilo por etapa (`render-B`, `render-C`, `render-final`)
e a comparação elemento a elemento contra o dump anterior.

- **Etapa B — estados do aluno: uma família de superfície.** As telas do aluno
  empilhavam raios (20, 24, 18, 14) e sombras (`12/36`, `6/16`, `16/60`) diferentes para
  dizer a mesma coisa: "aqui começa um grupo". A família passou a ser uma: raio
  `--radius-md`, sombra `--shadow-sm`, a borda da casa, aplicada ao painel da missão, ao
  HUD, ao cartão de votação, ao painel do modo Arena e ao feedback. O **resultado deixou
  de ser uma caixa dentro da caixa**: tinha gradiente, raio e sombra próprios, e virou o
  grupo separado pela linha que a folha base já desenhava. A ilustração da espera caiu
  para `min(200px, 46%)`. Delta: **6 telas, 30 elementos** (raio 30, cor de borda 24,
  sombra 24) — só superfícies do aluno.
- **Etapa C — painel do professor: os tokens entraram na escala.** Havia duas famílias
  em paralelo: os tokens `--la-*` (raio 20, sombra `6/16`) e as regras escritas à mão
  (raio 18 no cartão de sala e no de desafio, raio 22 no cockpit, sombra `14/44`). Os
  tokens passaram a apontar para a escala da casa (`--la-radius-card: var(--radius-md)`,
  `--la-shadow-soft: var(--shadow-sm)`, `--la-line: var(--color-border)`), e os três
  casos escritos à mão passaram a usar os tokens — **consolidar, não acrescentar uma
  camada**. O cockpit também perdeu o gradiente e a sombra alta. Delta: **4 telas, 60
  elementos**, todos no painel do professor e na prévia do aluno.
- **Etapa D — o diálogo cabe na janela e tem UMA região de rolagem.** Quem rolava era o
  overlay e o cartão não tinha teto: dois lugares possíveis de rolagem, título saindo de
  vista e o botão de fechar (absoluto dentro do cartão) indo embora junto com o conteúdo.
  Agora o cartão tem `max-height: calc(100dvh - 2rem)`, quem rola é
  `[data-arena-dialog-body]`, e o `h3` fica preso no topo. Medido em 1280×720 (a "tela
  baixa" do plano) e 390×844: cartão `32→720` e `24→852`, corpo com 964px de conteúdo em
  688 visíveis, e **salvar alcançável depois de rolar** (`alcançável=true`), com o título
  ainda visível. Delta: **2 telas, 6 elementos** (padding e overflow do diálogo).
- **Etapa E — TV: o endereço aparece uma vez.** No diálogo de projeção a mesma URL
  aparecia como texto dentro da instrução **e** como rótulo do QR. Agora o QR carrega o
  endereço, e quando o QR falha o endereço volta **no mesmo lugar** — sem frase nova. A
  primeira tentativa tinha escrito uma frase de fallback e custou **+10 palavras** ao
  cliente; a régua pegou, e a versão final ficou **-1 palavra** (`arena.js` 1326 → 1325,
  com o teto descendo junto). A instrução também perdeu o eco: "Aponte a câmera para o QR
  code" → "Escaneie o QR code".
- **Etapa F — relatório e página não encontrada.** O grid de indicadores do relatório já
  descia para 2 colunas no celular e as tabelas largas já tinham rolagem própria
  (`max-height: 520px` + `overflow: auto`), então aqui não houve mudança — a conferência
  é o resultado. A **página não encontrada** era texto puro numa resposta HTML: sem
  marca, sem fundo e sem caminho de volta. Passou a usar a mesma casca do portal (marca,
  título, botão "Voltar ao início"), sem folha de estilo nova. Custo de cópia declarado:
  o teto da tela subiu de **3 para 11 palavras** — é a única subida desta fase e está no
  orçamento (`pagina-nao-encontrada`).
- **Navegação em seções (item C1) e destaque do código durante a partida (item C3) não
  foram feitos.** O C1 é redesenho de navegação — o painel já tem navegação por âncoras e
  seção ativa; o C3 depende de um marcador de estado da partida no painel. Ficam
  registrados como abertos, junto do item 9 anterior.
- **O que os portões provam.** Portão 1: **327/327**. Portão 2: **16/16 em 149s**. O
  retrato de estilo, comparado com o commit, registra **14 das 18 telas** mudadas por
  hash e **0 mudanças de contagem de elementos** — nenhum elemento nasceu ou morreu nesta
  fase; e cada fatia foi atribuída antes da regravação: A→B 6 telas/30 elementos,
  B→C 4/60, C→final 2/6, cada propriedade caindo sobre uma edição. **Uma ressalva
  honesta:** numa das execuções do portão 2, logo depois de regravar o retrato e com a
  máquina carregada, `browser reviews a room mission by mission` falhou levando 60,9s
  (isolado: 7,3s). Reexecutado, o portão fechou 16/16 — mas fica registrado, porque o
  histórico deste repositório é justamente de não aceitar a segunda tentativa como
  resposta.
- **O que continua pendente do plano visual:** etapas A-F feitas nos itens acima, mas
  ficam de fora a medição de contraste, o zoom de 200%, os alvos de toque, a captura da
  TV em 1920×1080 e 1280×720 sem corte, a votação na TV (`34-tv-votacao.png` continua
  inválido como prova) e o Wild Card. **Resolvido depois:** o contraste virou catraca do CI, as
dimensões de TV entraram nas capturas da etapa 6, a votação na TV e o Wild Card têm prova válida na
primeira seção deste registro. O zoom de 200% segue sem verificação.

## Revisão de manutenção — 2026-09-16 — Etapa A do plano visual: portal e acessos

O plano visual recebido em 16/09 (o sucessor de `output/auditoria-texto/PLANO-DE-CORRECAO.md`)
traz uma ressalva que muda o método: *"Recolher tudo também prejudica o uso"*, e as
notas de 0 a 10 da análise anterior não valem como requisito. A etapa A não cortou
texto — o portal já tinha três elementos desde 15/09 —, ela corrigiu **proporção,
superfície e ação**. As etapas B a F seguem a ordem do plano: estados do aluno,
painel e sala, formulários e prévias, TV e projeção, relatório.

- **A moldura do portal passou a ter o tamanho do que ela contém.** O cartão media
  **1080×367 para 236px de conteúdo (moldura ×1,56)** porque `min-height: 100svh` e
  `padding: clamp(32px, 5vw, 64px)` vinham de duas folhas diferentes, e a largura de
  uma terceira. Agora: **720×330, moldura ×1,18 (50px de folga)**, e o cartão só é
  do tamanho do conteúdo porque `min-height` virou `0`. Medido em Chromium real,
  mesmo fixture, 390×844 e 1440×900. Numa janela de 390×520 o topo **não** é cortado
  (y=123): a centralização do shell ficou verificada no caso que a costuma quebrar.
- **Três superfícies, uma família.** Raio **28/20 → 16** (`--radius-md`) no portal,
  na entrada do aluno e no login do professor; sombra em duas camadas → **uma**, baixa
  e igual nas três (`--shadow-sm`); borda branca invisível → `--color-border`. Antes:
  `0 20px 60px` + `0 2px 8px` no portal, `0 24px 64px` + `0 2px 6px` no aluno e
  `0 28px 80px` só no portal — três cartões da mesma família, três sombras diferentes.
- **O que competia com o título e com a ação, e saiu.** A marca estava dentro de um
  segundo cartão (fundo branco, borda, raio de pílula e sombra própria) **dentro** do
  cartão do portal — a violação literal de "cartão com sombra dentro de cartão com
  sombra". Virou texto sobre a superfície. O botão carregava brilho azul de 28px de
  desfoque (32px no hover) e raio de 14px, fora da família: virou pílula com sombra
  de 10px. A textura pontilhada do fundo caiu de `0.06` para `0.035` de alfa.
- **Nada foi acrescentado.** O espaço liberado não recebeu texto, cartão ou ilustração:
  o portal continua com marca, título e ação — a composição centralizada que o plano
  manda preservar.
- **O furo que a etapa revelou, e que valia mais que o corte.** Ao registrar a
  mudança, o cartório da cascata acusou `border-radius → (ausente)` numa linha que
  existia. A causa não era o CSS: `analisarRegras` tirava o comentário ao procurar as
  chaves, mas **não** ao partir o corpo da regra em declarações — o primeiro `:` de um
  comentário (`/* escuro: contraste */`) virava o nome da propriedade e a declaração
  seguinte **desaparecia do contrato**. Doze seletores viviam assim, incluindo o
  `:root`, onde o cartório registrava `--blue: #0052ff` enquanto **o navegador sempre
  aplicou `var(--color-primary)`** — a guarda guardava o valor perdedor. O parser foi
  corrigido, e há teste novo para as duas metades: comentário não esconde declaração, e
  nenhuma entrada do cartório pode carregar comentário no lugar de propriedade. A
  correção é de escrituração, não de tela: os 12 seletores afetados pelo parser
  (11 com declaração recuperada, mais o `:root`, onde o vencedor registrado mudou)
  estão fora do que esta etapa editou.
- **O que os portões provam, e como a mudança foi atribuída.** Portão 1: **327/327**
  (dois testes novos do parser), com o cartório regravado em **23 seletores mudados, 1
  removido** (`body[data-page='index'] .portal-hero`, que só reescrevia a sombra já
  definida no bloco base) e **5 seletores novos** — todos da mensagem de erro das duas
  entradas. Portão 2: **16/16**. O retrato de
  estilo acusou **10 telas** — e a atribuição foi provada de fora, não aceita: as três
  folhas foram revertidas para o commit, a captura **passou** contra o retrato
  versionado (a reversão é fiel, logo a diferença é minha), e a comparação elemento a
  elemento de ponta a ponta mostrou **20 elementos mudados em 10 telas, 0 elementos
  criados ou removidos**, com cada propriedade caindo exatamente sobre uma edição —
  cor de borda em 14, raio em 14, sombra em 14, `display` em 6 (a linha reservada da
  mensagem), `margin-top` em 8, padding em 4, fundo em 4, brilho em 2. Nenhuma tela
  fora das superfícies tocadas: TV, painel do professor, relatório e missão do aluno
  não têm uma propriedade alterada.
- **O erro das duas entradas deixou de empurrar o formulário — e para isso uma
  frase foi cortada.** Medido em 390×844 com um erro real: quando a mensagem chegava,
  os campos e o botão subiam **31px** na entrada do aluno e **41px** no login, porque
  o cartão cresce e é centralizado — o campo saía de baixo do dedo de quem acabou de
  tocar em "Entrar". Duas causas, as duas corrigidas: (1) a mensagem não reservava a
  linha antes de existir, e (2) as duas entradas usavam famílias de mensagem
  diferentes — a do login era uma caixa de 46px (padding e borda) para dizer uma linha
  que a do aluno diz como texto simples, e ainda herdava `margin-top: 20px` contra os
  4px da reserva. Agora as duas são texto com uma linha reservada: **0px de
  deslocamento nas duas**, com campo, botão e "voltar" exatamente onde estavam
  (`tmp/qa/etapaA-erro/medidas.json`). O preço foi de vocabulário, não de espaço: a
  mensagem da sala dizia `Sala não encontrada. Confira o PIN com o professor.` — 48
  caracteres, duas linhas — e virou `Sala não encontrada. Confira o PIN.`. O corte é
  do eco, não do fato: o kicker da mesma tela já diz "O código vem do professor.", e
  quem escreve o erro não repete o que o formulário acabou de dizer. A régua de cópia
  passou sem regravação (não cresceu em nenhuma tela).
- **Cópia: só o eco do kicker.** Fora a frase do erro, nenhuma string visível mudou
  nesta etapa — 327/327 inclui o inventário de cópia e a varredura, sem regravação de
  teto.
- **O que a etapa A não fez.** As etapas B a F do plano (estados do aluno, painel e
  sala, formulários e prévias, TV e projeção, relatório) ficaram pendentes naquela rodada,
  assim como a medição de contraste, o zoom de 200% e as dimensões de TV (1920×1080 e 1280×720)
  que a seção 6 do plano exige. `34-tv-votacao.png` **continua inválido como prova** — quem
  substitui o arquivo é a captura de 16/09 (`output/auditoria-refino-etapa6/item7/22-tv-votacao-1920x1080.png`),
  feita com o estado afirmado antes do clique — e o Wild Card passou a ter captura em 16/09, com o
  votante e com quem está em campo (primeira seção deste registro).

## Revisão de manutenção — 2026-09-15

- **Fase 1 da redução de carga de leitura: o portal tinha seis blocos de leitura e
  passou a ter três — marca, título e ação.** Saíram a chamada "DESAFIO DE
  ENGENHARIA DE PROMPT" (o terceiro nome do produto na mesma coluna), o parágrafo
  conceitual, a faixa de quatro características e o "Digite o código da sala para
  entrar" (a orientação pertence ao formulário seguinte). Medido: portal 49 → **10
  palavras**, contra as 38 do site base — primeira tela a ficar abaixo dele. No DOM,
  em 390×844 e 1440×900, a abertura tem exatamente três elementos e nenhuma leitura
  secundária.
- **Os estados do aluno perderam as camadas equivalentes.** A espera dizia a mesma
  coisa em dois lugares (título "Aguardando a próxima missão" + linha "O professor
  vai iniciar uma missão", e a variante clássica escrita mais abaixo no cliente):
  virou uma — "Aguarde o professor iniciar", escrita num lugar só. O encerramento
  não repete mais "Confira a classificação final dos campeões abaixo" (a
  classificação está logo abaixo, visível). Os rótulos "01 / O desafio" e "02 /
  Sua resposta" saíram: competiam com o título da missão e com o rótulo do campo. As
  duas âncoras de acessibilidade (`aria-labelledby`) foram movidas para o próprio
  título da missão e para o rótulo "Escreva seu prompt", que é o nome que a seção
  já tinha — nenhuma seção ficou sem nome acessível. O atalho "Ctrl + Enter para
  enviar" (linha própria, que só replicava o "CTRL + ENTER ↵" do botão) saiu; o do
  botão já sumia no celular desde antes.
- **Os três cartões laterais vazios não aparecem mais durante a primeira missão.**
  Antes eles só sumiam no lobby puro: em missão ativa o aluno via "Ainda sem
  resultados.", "Ainda sem pontuação." e "Os destaques aparecem após as missões."
  embaixo do formulário. Agora o cartão vazio some em qualquer estado — quando os
  três somem, a coluna inteira some junto.
- Selos que repetiam o título saíram ("Entrada do jogador" na entrada do aluno,
  "Área do Professor" no login) e a explicação de que a senha vive no `.env` do
  servidor saiu da interface — ela pertence à documentação de configuração. O login
  ficou com um título só ("Entrar no painel") e o botão com um verbo só ("Entrar"),
  porque "Entrar no painel" nos dois era a mesma frase duas vezes: 26 → **16
  palavras**, abaixo das 31 do site base.
- **O que os dois portões provam.** Portão 1: saíram 29 seletores mortos das cinco
  folhas, recortados composto a composto por `node scripts/remover-css-morto.mjs`
  (novo instrumento: a folha é minificada e a lista de seletores é compartilhada, então
  apagar a regra inteira levaria junto o estilo de classes vivas) (as regras das sete classes que ficaram sem produtor) e entraram 2 — o
  `min-height` do campo no celular e a regra compartilhada que perdeu a parte
  morta; **zero declaração alterada**, e nenhum outro seletor se moveu. Portão 2:
  comparação dos 24 retratos antes × depois ignorando o deslocamento de caminho no
  DOM — **0 mudança de estilo em elemento que permanece** em todas as telas; o que
  aparece na comparação é só a saída dos elementos cortados (16 linhas no portal, 6
  na tela do aluno, 2 no login).
- O campo de escrita do aluno tinha 240px fixos em qualquer tela e, no celular, o
  botão de envio ficava longe. Passou a `clamp(132px, 24svh, 240px)`: medido no
  Chromium dos testes, **202px** em 390×844. A unidade `svh` foi checada à parte
  porque uma unidade não entendida derruba a declaração inteira sem erro visível. A
  fonte e o enunciado não encolhem.
- **O que não foi tocado, de propósito:** as mensagens de estado e erro continuam
  inteiras (é onde explicação ganha o lugar), a instrução da TV sem sessão, o
  "Escreva o prompt que produziria algo com estas características" (sem ele o aluno
  não sabe o que produzir diante de uma imagem), e a diferença de caixa entre o
  menu "Banco de Desafios" e a seção "Banco de desafios" — é caixa de idioma, não
  nome diferente.
- **O que ainda falta do plano de carga de leitura** (escopo, não regressão):
  detalhe da sala, aulas, formulários longos, tempos das missões, barra da prévia e
  relatório — as telas do professor. A cópia delas já está sob teto; o que falta ali
  é agrupamento e exibição sob demanda (recolher seções, resumir listas), que é
  trabalho de interface, não de corte de string.
- **Fase 2 da carga de leitura: o detalhamento por critério abre sob demanda.**
  Depois de responder, o aluno lê a nota, o feedback, a evolução e o próximo passo
  ("Tentar novamente (1/2)"); as barras por critério ficam atrás de uma dobra
  fechada ("Ver critérios") que abre no clique, no toque e no teclado — é
  `<details>` nativo, e `summary` já entra no `:focus-visible` das folhas vivas. No
  juiz clássico não há critérios, então a alça inteira sai da tela. Custo de cópia:
  2 palavras de rótulo; o teto da tela do aluno subiu de 131 para 133, e isso fica
  registrado aqui porque regravar o cartório é decisão, não acidente.
- **No encerramento, a classificação é a leitura principal.** "Resultados das
  missões" e "Destaques" viraram dobras fechadas cujo título é a alça (o próprio
  `h2`, sem rótulo novo — custo de cópia zero) e a "Classificação geral" continua
  aberta. Durante a partida as duas ficam abertas: ali são curtas e são o assunto,
  e a dobra só fecha quando o estado principal é o encerramento. Os testes de tela
  ganharam a asserção de que elas começam fechadas no fim e abrem na alça, e de que
  os critérios começam recolhidos depois da resposta.
- **Correção de medição na régua de cópia (2026-09-15).** O instrumento contava
  seletor como prosa: `'.arena-side [data-arena-fold]'` tem duas palavras e nenhum
  caractere de código, então passava pela régua de literal cru. Medido: inflava o
  `arena.js` em 10 palavras e a captura do site base em 4 (836 → **832**) sem que
  ninguém tivesse escrito nada para a tela — e, sob pressão de orçamento, isso
  empurraria alguém a cortar cópia de verdade. A régua nova (`PARECE_SELETOR`:
  frase de tela não começa em `.`, `#` ou `[`) veio com controle positivo no
  próprio teste: o seletor composto não conta e a frase de tela continua contando.
  Cliente com o número corrigido: **1571 palavras** contra 832 do site base.
- **O que as duas fases não fizeram, e por quê.** (1) A retirada do "resultado
  coletivo anterior do topo quando o estado principal já for encerramento": no Modo
  Arena o veredito do ataque é lido no cartão da votação, e o teste de navegador
  afirma exatamente isso (`arena-mode-ui.test.mjs`: "a aluna não fica olhando uma
  tela morta no fim: ela lê o veredito") — esconder o cartão ao encerrar apagaria
  essa leitura. O que o item pede já vale pelo outro lado: votação ativa e cartão de
  espera nunca aparecem juntos. (2) A dobra do enunciado depois da resposta (o plano
  diz "pode ser recolhido"): exigiria recolher a coluna do enunciado no meio da
  missão, e o risco de esconder aquilo sobre o que o aluno está escrevendo é maior
  que o ganho.
- Guarda de orçamento de cópia (`test/copia/orcamento.test.mjs`, sobre o
  instrumento `test/support/copia.mjs`): nenhuma tela viva passa do teto de
  palavras de texto visível, medido sem navegador. Por que faltava: o portão de
  estilo (`test/css/render.json`) retrata propriedades computadas e **nenhum
  texto**, então a cópia era a única camada da tela sem guarda nenhuma — o CSS já
  tinha três.
- A linha de base não é digitada à mão: é o site base congelado, lido de
  `evidence/original-public/` a cada execução, do mesmo arquivo cujo SHA-256 o
  `evidence/manifest.json` congela. Se a captura mudar, o número muda e a guarda
  acusa. Medido contra ela ANTES do corte desta data: o painel do professor estava
  em 2,9× (31 → 89 palavras); o relatório (114) é superfície que o site base não
  tinha (`report.php` original com 0 bytes); o cliente passou de 836 palavras em um
  bundle único (`app.js` clássico, 122 KB) para 2.055 em dois (2,5×); e a tela do
  aluno ficou **mais enxuta** que o station clássico (177 contra 290) — o problema
  nunca foi "texto", foi texto onde não precisa.
- **Corte de cópia (2026-09-15), com o inventário como régua:** saíram do cliente
  447 palavras de prosa explicativa (2.055 → **1.608**; `arena.js` 1.796 → 1.366),
  o painel do professor 89 → **74** e o relatório 114 → **107**. Cada corte foi o
  que existia para explicar o controle em vez de deixá-lo claro: o passo a passo do
  sorteio ("Como no futebol: quem vence fica no jogo…"), a explicação do que é o
  gabarito do juiz, o parágrafo do tempo das missões, a descrição dos presets, o
  "Fique de olho na tela!", a dupla explicação de entrar com o código, e as dicas
  de cartão de métrica do relatório. **O que sobrou acima do site base é rótulo,
  não prosa**: das 1.366 palavras do `arena.js`, 697 são nome de campo, botão e
  coluna, que o original não tinha porque não tinha essas telas. Quem separa uma
  coisa da outra é o perfil frase/rótulo de `node scripts/inventario-copia.mjs`
  (leitura, não guarda).
- **Os tetos desceram para o novo medido, e regravar agora APERTA a régua**: o
  teto de cada tela e de cada bundle acompanha o medido do momento para baixo, que
  é o que faz um corte valer para sempre — sem isso a régua seria decorativa, já
  que quem escreve demais poderia regravar e ficar com o teto antigo. Uma folga
  deliberada sobrevive só quando está escrita (`nota` junto do teto acima do
  medido, que é o par que a guarda exige). `contexto` é campo separado de `nota`:
  registra o que a régua não vê (o residual é rótulo estrutural, não prosa) e não
  sobe nem segura teto nenhum. Há teste para as duas regras.
- A guarda cobre os dois lados: as rotas são lidas do roteador, então superfície
  nova nasce sem orçamento declarado e reprova antes de alguém escrever a primeira
  frase dela; e um bundle novo no cliente também tem de ser declarado. Cortar
  texto nunca reprova; elevar teto exige `nota` escrita no cartório — subir
  orçamento é decisão registrada, não acidente.
- **Fechado o furo do texto que vem por API (2026-09-15).** `mode_hint`,
  `cannot_reason`, `teach` e os campos irmãos (`question`, `label`, o `hint` dos
  poderes) não passavam por régua nenhuma: não são HTML da primeira pintura nem
  literal de bundle, porque o cliente só interpola (`${esc(draw.mode_hint)}`). E
  justamente ali a frase que o aluno lê vem do SERVIDOR — era o buraco em que
  enxugar o cliente parecia corte sem mudar a tela, e foi o que aconteceu no
  sorteio. A família `api` do instrumento passou a medir o produtor por chamada
  real (`drawView` e os catálogos de dinâmica e de energia, todos puros, sem
  banco e sem navegador): **7 campos, 222 palavras**, cada um com teto próprio,
  catraca e `nota`, como o resto do orçamento.
- A família `api` morde por quatro lados, os quatro provados por planta em
  2026-09-15: (1) campo acima do teto, nomeando campo, contagem e onde ele aparece
  (`api dinamica.teach: 78 palavras, teto 67 (+11)`); (2) campo morto — renomear
  `mode_hint` no servidor faz a régua medir o vazio e a guarda avisar em vez de
  passar em silêncio; (3) campo que o cliente deixou de mostrar, que é o texto vivo
  no servidor sem aparecer na tela; e (4) **cobertura do payload** — um campo de
  texto novo no produtor reprova até ser declarado como frase (medido) ou como
  rótulo, que é o mesmo espírito da cobertura de rotas: frase nova não nasce sem
  orçamento. O inventário passou a imprimir a FRASE INTEIRA de cada campo de API,
  por padrão, e não atrás de flag: é a frase, não o número, que denuncia a versão
  longa que sobreviveu no servidor. Ele também reporta réplicas (a mesma frase nos
  dois lados) — hoje nenhuma.
- **Varredura tela por tela (`node scripts/varredura-copia.mjs`, 2026-09-15).** O
  inventário dá número; ele dava fila a ninguém — revisar a cópia exigia abrir o
  navegador e ler cada tela à mão. A varredura fecha isso: atribui cada superfície à
  sua função de template em `src/web/pages/index.mjs` (cromo compartilhado, como o
  wordmark, fica fora) e lista, por tela, as **frases candidatas** com
  `arquivo:linha`, as **réplicas** e as **divergências servidor × cliente**.
  Resultado da primeira passada nas 9 telas: **22 frases candidatas, 3 réplicas, 2
  divergências e 4 elementos duplicados no cliente**.
- A divergência é o achado que a régua de palavras não pega: o servidor serve o
  esqueleto e o cliente sobrescreve o elemento, com **frases diferentes**. O aluno
  lê a do servidor antes de o script rodar — foi assim que `Fique de olho na tela!`
  sobreviveu ao corte de set/2026 (`src/web/pages/index.mjs:346` manda a frase
  longa; `public/assets/js/arena.js:451` manda a curta). Nada cresceu, então nenhum
  teto acusa. A varredura também lista os elementos que os dois lados escrevem
  **iguais** (hoje 4), que é o trabalho obrigatório de qualquer corte naquele bloco.
  A consistência escrita também aparece: `Banco de Desafios` no menu contra `Banco de
  desafios` no título da mesma tela.
- **A fila da varredura aplicada (2026-09-15), tela por tela.** Sobre as 22 frases
  candidatas que a varredura apontou, o corte saiu em quatro telas: portal 57 →
  **49** (o parágrafo de 18 palavras virou 8 — saiu o triple "observação, estratégia
  e linguagem" e a repetição do kicker); entrada e prévia do aluno 177 → **148** (a
  espera alinhada ao cliente, o kicker trocado pelo fato de onde vem o código, o
  botão que ecoava o `h1`, o placeholder que repetia o rótulo, a dica de três
  imperativos e o estado vazio alinhado aos irmãos); painel (login) 36 → **26**;
  painel do professor 74 → **72**. Tetos regravados no novo medido (a régua desceu
  junto), e o login ficou **abaixo do site base** — 26 contra 31, a primeira tela a
  cruzar essa linha para baixo.
- **A divergência do `data-arena-empty-text` fechou:** o servidor passou a dizer o
  mesmo que o cliente (`O professor vai iniciar uma missão.`), e a varredura
  reporta **0 divergências**. Elementos que os dois lados escrevem iguais subiram de
  4 para 6 — é a lista do que qualquer corte naquele bloco precisa acertar nos dois
  arquivos.
- **O que NÃO foi cortado, com o motivo:** os 8 chips do portal (18 palavras, 32% da
  tela) — são a faixa de valor do portal, fora do mandato de cópia de interface, e
  cortá-los muda o desenho da banda (dois rótulos por cartão viram um); o kicker
  `DESAFIO DE ENGENHARIA DE PROMPT` (5) — depois de o parágrafo enxugar ele parou de
  repetir; `A projeção abre pelo Painel do professor, na sala escolhida` (9) — é a
  instrução da TV sem sessão; `Escreva o prompt que produziria algo com estas
  características` (8) — sem ela o aluno não sabe o que produzir diante de uma
  imagem; `Métricas, ranking e respostas das batalhas` (5) — nomeia os três blocos
  do relatório; e `⚡ Conexão instável — tentando reconectar...` — estado, não
  decoração.
- **Duas decisões registradas, e um defeito achado no caminho.** O
  `<p class="round-writing-hint">` ficou **vazio** em vez de removido: a cascata
  vigia o seletor (`test/css/cascata.json`) e a guarda de classes exige produtor
  para a classe — e a única regra dela é `margin-bottom: 18px`, ou seja, o elemento
  é um espaçador. Remover elemento + regra é faxina de CSS, com regravação da
  cascata: outra faixa. E o defeito: na modalidade *essencial* o servidor corta o
  prompt em 250 caracteres (`src/server/arena-api.mjs:2113`), mas o contador do
  cliente usa o `maxLength` (4000) e a tela não avisa — o contador mente, e quem
  precisa mudar é o controle, não a frase.
- Inventário legível: `node scripts/inventario-copia.mjs` (com `--trechos` lista
  cada trecho do cliente com o número da linha). Regravar o cartório:
  `UPDATE_COPY_BASELINE=1 node --test test/copia/orcamento.test.mjs`.
- `npm test`: **324 testes aprovados** (`test/copia/*.test.mjs` entrou no glob do
  script), sem falhas. `npm run test:browser`: **15 aprovados**, incluindo o
  portão de estilo — que **não** precisou de regravação: corte de texto não move
  nenhuma das propriedades computadas que ele fotografa (geometria está fora do
  retrato de propósito).

- **Fase 3 da carga de leitura: no detalhe da sala e nas aulas, o resumo vem
  primeiro.** No cabeçalho do detalhe ficam nome, código, contagem, estado e a
  **ação do momento**; "Editar sala", "Bloquear entrada", "Arquivar" e "Excluir
  sala" foram para "Gerenciar sala" (dobra fechada). Pausar/Retomar, Encerrar
  rodada, Fechar resultados e Encerrar sala **ficaram fora da dobra** — são o que
  o professor procura com a rodada correndo, e atrás de uma alça custariam dois
  cliques. Foi a sonda de dobras que flagrou a primeira versão com tudo escondido.
- Cada missão aparece como resumo (situação, "MISSÃO n — modalidade", título,
  cronômetro, pendência) e o enunciado ("O aluno recebe") e o gabarito ("Gabarito
  do juiz") abrem em dobras por missão; o aviso de gabarito ausente continua à
  vista, porque impede o uso. A lista completa de participantes ficou em dobra,
  aberta enquanto a sala não começou (é quando o professor confere quem entrou) e
  fechada em jogo; a contagem segue no cabeçalho. Decisão registrada: o plano diz
  "recolher a lista", e recolhida é o estado de jogo — antes de abrir, a lista é a
  pergunta do momento.
- **Nas aulas, o resumo virou a alça:** "4 missões de Engenharia Reversa" no lugar
  de quatro selos iguais, com a lista de missões dentro da dobra; "Desafios prontos
  por aula" (subtítulo que só descrevia a seção) saiu. A frase não é escrita à mão:
  sai da contagem por modalidade da própria aula.
- **A memória de dobra é o que faz isso durar:** o painel se redesenha a cada poll
  (2,5 s), então a escolha do professor em cada dobra é guardada por
  `data-fold-key` e reaplicada no desenho seguinte. Provado em navegador: abrir
  "Gerenciar sala" e o gabarito sobrevive ao ciclo do poll.
- **Um defeito de escopo que o portão 2 pegou, e que valia mais que o corte.**
  `state.folds` nasceu no estado da página do aluno e era usado no bloco do painel:
  `aplicarDobras` lia `undefined.get` a cada desenho, o erro era capturado e virava
  `alert()` — e o alerta bloqueia a página. Efeito medido: 3 testes de fluxo
  passaram de ~4 s para estourar o limite de 180 s. Corrigido movendo `folds` e o
  listener de `toggle` para o bloco do painel. A causa não era o corte, era o
  remendo.
- O retrato de estilo (`test/css/render.json`) foi regravado com
  `UPDATE_CSS_BASELINE=1 npm run test:browser`: o anterior tinha sido capturado
  enquanto o painel lançava exceção. A prova de que só o pretendido mudou é a
  comparação independente de caminho (`node tmp/qa/comparar-retratos.mjs`, 24
  telas): **0 mudança de estilo em elemento que permanece**; saiu 1 elemento
  (`p.arena-lessons-hint`) e entraram 8 (4 dobras de aula + 4 alças).
- Cópia: painel do professor **72 → 68** palavras e a varredura por tela não acha
  mais nenhuma frase candidata nele (antes: uma). Varredura geral: 9 telas, 13
  candidatas, 1 réplica, 0 divergências servidor × cliente. Portões desta fase:
  `npm test` **324/324** e `npm run test:browser` **15/15**.

- **Fase 4 da carga de leitura: formulário do desafio, tempo das missões e barra
  da prévia.** As três superfícies onde o trabalho não era cortar frase — era
  separar o que se decide do que se lê uma vez. Medido no mesmo fixture, nas duas
  larguras, antes e depois (`tmp/qa/probe-etapa4.mjs`, prints em
  `tmp/qa/etapa4-antes/` e `tmp/qa/etapa4-depois/`):

  | Superfície | Antes | Depois |
  |---|---|---|
  | Formulário do desafio (altura) | 1475px, 14 blocos soltos | **836px, 6** (2 grupos + 4 dobras + ação) |
  | Critérios e pesos | 351px sempre abertos, dentro do formulário | alça `Critérios e pesos — 2 critérios · 100%`, recolhida |
  | Adicionar missão: prévia da escolhida | 317px (enunciado + gabarito inteiros) | **141px** (resumo + 2 alças) |
  | Tempo das missões: texto da tela | 124 palavras | **72** |
  | Barra da prévia em 390×844 | 364px (43% da primeira tela) | **289px** (34%) |
  | Conteúdo do aluno começa em (390) | 454px | **379px** |

- **Formulário do desafio: três leituras, e só.** "O aluno recebe" e "O juiz
  avalia" são **fieldsets abertos** (o trabalho do professor, com título de grupo);
  a imagem (quando a modalidade é visual), os campos opcionais, os critérios e os
  ajustes da rodada abrem sob alça. A decisão de o grupo obrigatório **não** ser
  dobra é deliberada: o plano proíbe esconder campo obrigatório pendente, e um
  `<details>` fechado com `required` dentro trava o envio sem aviso (o navegador
  não consegue focar o campo). Assim o problema não existe por construção. As
  dobras mostram **resumo fiel** do que guardam (`Critérios e pesos — 2 critérios ·
  100%`, `Ajustes da rodada — 1× · 2:00 · Influencia alta`), e nada é apagado ao
  fechar: o teste do portão 2 lê `expected_result` **dentro da dobra fechada** e o
  valor está lá. "Gabarito do juiz — o aluno não vê" segue explícito no rótulo.
- **Erro dentro de dobra abre a dobra e leva o foco.** Sem critério nenhum o
  envio reprova; os critérios abrem e o foco vai para a primeira caixa — provado
  por asserção no portão 2, não por inspeção. O mesmo vale para o campo que falta:
  aberto pelo card da sala, o formulário abre a dobra da imagem quando é ela que
  trava.
- **A modalidade escolhida decide o campo, e não esconde valor.** O campo da
  imagem aparece aberto quando a modalidade é visual (ou já há imagem, ou é ela
  que falta) e passa a aparecer aberto quando o professor troca para uma modalidade
  visual — os inputs continuam no formulário o tempo todo, então recolher nunca
  apaga o que estava preenchido. A regra do cliente espelha `requiresImage` do
  servidor (`src/domain/room-readiness.mjs`), que é quem de fato recusa abrir a
  sala.
- **Adicionar missão: resumo + prévia sob alça.** A escolha aparece com imagem,
  título, modalidade, tempo e o que faltaria para a sala abrir; "O aluno recebe" e
  "Gabarito do juiz" ficaram a um clique. Interpretação registrada: "acesso à
  prévia" do plano foi lido como acesso ao conteúdo da missão (enunciado e
  gabarito), que é o que o professor confere antes de confirmar — o link da prévia
  junto da sala já existe no detalhe, e ali a sala ainda não tem a missão que se
  está adicionando.
- **No tempo das missões, cada linha diz o que se decide:** missão, modalidade,
  tempo de agora (`⏱ 2:00` / `sem cronômetro`), sugestão e o atalho de aceitá-la. O
  enunciado e a justificativa da sugestão abrem sob alça; o formato do campo (`Tempo
  em mm:ss; vazio = sem cronômetro — a missão então termina no Encerrar rodada`) é
  explicado **uma vez**, no aviso do topo, em vez de repetido no rótulo de cada uma
  das missões. O botão desabilitado "Todas as missões já têm cronômetro" virou
  estado discreto (a mesma frase, sem o controle que não faz nada). Nenhum campo
  perdeu valor: o teste do portão 2 segue aceitando a sugestão de uma missão,
  ajustando a outra à mão e salvando as duas.
- **Barra da prévia: identificação e seletor na frente, preparação atrás da alça.**
  Ficam à vista a etiqueta, o nome da sala, o seletor de estado, a navegação entre
  missões, os chips e "← Voltar ao painel". O **aviso de simulação virou a própria
  alça** ("Nada disto está no ar.") e dentro dela ficam código da sala, tempo
  somado da aula, a modalidade/tempo da missão em revisão e o "✓ pronta para ir ao
  ar" — nenhum texto novo, custo de cópia zero. O que **impede** a sala de abrir
  ("⚠ sem gabarito") continua fora da dobra: o que trava fica à vista, o que só
  confirma pode esperar um clique. A escolha da alça sobrevive à troca de missão
  (o painel se redesenha a cada passo), e o retrato da tela do aluno não mudou em
  1440 — a economia é onde ela importa, no celular.
- **O critério de aceite do item 15 virou asserção de teste:** em 390×844 o
  conteúdo do aluno começa **dentro da primeira tela** e a barra ocupa menos de
  metade dela. Fica no portão 2, então voltar a empurrar o aluno para baixo reprova
  o CI em vez de virar impressão de quem abriu o navegador.
- **A régua de cópia não subiu.** `arena.js` fechou a fase em **1331 palavras** —
  exatamente o teto que já estava no cartório, sem regravação: as 13 palavras que
  os grupos, alças e resumos custaram foram pagas no mesmo formulário (a dica "O
  juiz compara a resposta do aluno com este texto" saiu, o placeholder do gabarito
  e o texto de "sem gabarito" encurtaram). Nenhuma frase nova de tela: as alças
  reusam vocabulário que já existia ("O aluno recebe", "Gabarito do juiz").
- **Portão 1:** a cascata mudou em 23 seletores — **3 saíram**
  (`.arena-criteria-fieldset`, a `legend` dela e `.arena-form-hint`, que ficaram
  sem produtor de verdade: o elemento saiu, a regra saiu), **20 entraram** (os
  grupos, as dobras, os resumos, a barra da prévia) e **0 declarações foram
  alteradas** — nenhum seletor que já existia passou a resolver outro valor. A
  guarda de classes vivas seguiu verde, que é o que prova que regra órfã não
  ficou. Portão 2: **15/15** em 150s, com as quatro asserções novas (dobras do
  formulário, erro que abre a dobra, linha do tempo, preparo da prévia e o critério
  de aceite no celular) — o retrato de estilo (`test/css/render.json`) **não**
  precisou de regravação, porque ele fotografa as 10 telas no estado base e os
  diálogos não estão entre elas; quem os mede é a sonda, com o antes/depois acima.

- **Fase 5 da carga de leitura: o relatório do professor.** A tela era 12 cartões de
  indicador, 6 gráficos e 5 tabelas — todos abertos, um depois do outro, e no
  período sem dados **sete** cartões repetindo o mesmo aviso. O que mudou não foi
  frase: foi o que a tela mostra sem clique. Medido no mesmo fixture (sala Arena
  com 2 missões, 4 alunos e 4 envios) nas duas larguras, antes e depois
  (`tmp/qa/probe-etapa5.mjs` e `tmp/qa/probe-etapa5-comportamento.mjs`, prints em
  `tmp/qa/etapa5-antes/` e `tmp/qa/etapa5-depois/`):

  | Superfície | Antes | Depois |
  |---|---|---|
  | Indicadores à vista | 12 cartões | **4** (participantes, envios, acerto médio, tempo médio) + `Mais indicadores (8)` |
  | Rolagem da tela (1440×900) | 2884px | **1491px** |
  | Rolagem da tela (390×844) | 4295px | **2300px** |
  | Onde começa o ranking (1440) | 1981px | **1033px** |
  | Onde começa o ranking (390) | 2914px | **1613px** |
  | Palavras visíveis na tela (1440) | 475 | **111** |
  | Período sem dados: avisos "sem dados" | 7 cartões | **1** |
  | Período sem dados: palavras na tela | 149 | **54** |
  | Impressão | 12 painéis / 14 linhas | **13 painéis / 14 linhas** (dobras abertas no papel) |

- **A primeira leitura é o resumo do período e o ranking.** Os outros oito
  indicadores são do mesmo tipo e ficam no mesmo cartão, sob a alça `Mais
  indicadores (8)`; os 6 gráficos e as 4 tabelas de detalhe abrem pelo **título que
  já existia** — a alça é o próprio `.panel-title`, então rótulo nenhum foi escrito
  para virar alça e o custo de cópia é zero. O ranking é o único painel que começa
  aberto: é a pergunta que o professor traz para a tela.
- **O caret da alça é desenhado, e o motivo é medição, não gosto.** O `.panel-title`
  é uma linha flex (título à esquerda, legenda à direita), e o marcador nativo do
  `summary` só existe em `list-item` — numa linha flex ele simplesmente não é
  desenhado. Sem caret, um título recolhível parece título estático. O `::before`
  com o triângulo e o giro em `[open]` dá o affordance; a tecla funciona sozinha
  (o `summary` entra no `:focus-visible` global das folhas vivas) e foi conferida
  com `page.keyboard.press('Enter')`, não com `dispatchEvent` — Enter sintético
  **não** ativa um `summary`; o evento real, sim.
- **Duas legendas que repetiam o indicador saíram.** "Cadastros / partidas /
  pontuadas" repetia a legenda que o próprio canvas desenha, e "Turma vs. classico"
  repetia o rótulo das linhas da comparação. As que **distinguem** métricas
  diferentes ficaram ("Pontuadas e media %" separa duas séries; "Partidas
  pontuadas" diz o que o mapa de calor conta). O teto de cópia da tela foi
  **regravado de 107 para 103 palavras** — o único teto que desce nesta fase.
- **Um estado vazio útil, e só um.** Com o período sem uma linha em qualquer
  seção, os blocos de dado são escondidos (`hidden`, DOM preservado) e aparece um
  cartão: `Sem dados no periodo.` + `Ajuste as datas para consultar outro periodo.`
  As três famílias de seção passaram a usar a **mesma** frase (antes: "Sem dados no
  periodo.", "Sem dados para comparar no periodo." e "Sem partidas pontuadas no
  periodo."). Com dado em alguma seção, o que está vazio é só aquela seção —
  esconder as outras mentiria sobre o que existe, então o aviso geral só vale para
  o período inteiro. O DOM continua desenhado no estado vazio: é o caminho de
  reserva da exportação e é o que faz voltar o filtro mostrar dado de novo (provado
  no navegador).
- **O defeito que valia mais que o corte.** A primeira versão decidia "período
  vazio" olhando o tamanho das listas, e `by_hour` **sempre** traz as 24 horas do
  dia com zero nas vazias: com o filtro em 2020 o relatório mostrava 12 cartões
  zerados e nada de aviso, porque "24 linhas" era lido como "tem dado". Corrigido
  para decidir pelos contadores (`total_sessions`, `unique_players`, `games_started`,
  `matches_started`, `matches_scored`) e pelas listas que de fato somem. Ficou
  registrado no próprio código, ao lado da condição.
- **Impressão: o papel não tem clique.** As dobras abrem em `beforeprint` e voltam
  como estavam em `afterprint` — vale para o botão Imprimir e para o Ctrl+P, que
  passam pelo mesmo evento. Medido com `page.pdf()`: **11 dobras abertas e 11 linhas
  de tabela** no momento de imprimir, e o estado do professor restaurado depois.
  0 mudança em CSV (as seções e as colunas são as mesmas, e as tabelas seguem no
  DOM).
- **Portão 1: 325/325.** A cascata declarada registra **15 seletores novos** (as
  dobras, o caret, o cartão do resumo e o estado vazio), **0 removidos e 0
  declarações alteradas**; a guarda de classes vivas segue verde; a cópia teve os
  tetos regravados (`relatorio` 107→103 e o cliente em 236 palavras). Novo teste
  estrutural em `test/web/pages.test.mjs`: o relatório não pode voltar a ter painel
  fixo, toda dobra tem de ter alça, e um só painel pode começar aberto.
- **Portão 2: 15/15 em 165s.** O retrato de estilo mudou em **2 telas** — as duas
  do relatório (245 → 249 elementos) — e a comparação independente dos 24 retratos,
  ignorando o deslocamento de caminho no DOM, mostra 0 mudança fora do pretendido:
  saíram 11 `div.panel-title` (viraram `summary`), 1 `section.report-empty` e 1
  `metric-grid` entraram, e as 32 mudanças de estilo em elemento que permanece são
  todas `cursor: auto → pointer` e `flex-grow: 0 → 1` em `h2`/`span` que passaram a
  ser a alça. Nenhum `canvas` e nenhuma tabela mudaram de linha.
- **Fase 6 (item 12): o modo de jogo é escolha de uma linha, e os ajustes da
  partida ficaram atrás da alça com o resumo na frente.** O rótulo do campo era
  "Preset" e virou **"Modo de jogo"** (o campo `preset` do banco continua com o
  mesmo nome: é vocabulário de tela, não de schema). Os quatro ajustes do Modo
  Arena decoravam a tela antes de a escolha ser feita: eram um `fieldset` com
  `legend` **"Arena — Turma vs. Juiz"** — a mesma frase da opção escolhida no
  seletor logo acima — mais um aviso de duas linhas. Agora são uma dobra do mesmo
  tipo das do formulário de desafio (`.arena-form-fold`), com o **valor escolhido
  no resumo**: `Partida — 3 rodadas · Juiz 5 ♥ · dano a partir de 60% · 2 ataques`.
  O resumo sai dos campos, não de um objeto paralelo, então ele diz o que a sala
  vai receber — e o que a sala vai receber é o que o servidor aplica quando o campo
  fica vazio (o recomendado), que é a mesma regra que o resumo mostra.
- **Medido no mesmo fixture, em Chromium real** (`tmp/qa/probe-etapa6.mjs`,
  prints em `tmp/qa/etapa6-antes/` e `tmp/qa/etapa6-depois/`): o formulário com o
  Modo Arena escolhido foi de **798px para 695px**, as palavras visíveis de **67
  para 53**, e a frase "Arena — Turma vs. Juiz" de **2 para 1** ocorrência (a
  opção do seletor; a `legend` saiu junto com o `fieldset`). A prova que decide não
  é a altura: com a **dobra fechada** o professor mudou Rodadas para 5 e criou a
  sala — a sala nasceu `preset: arena` com `arenaRounds: 5`, lido de volta pelo
  servidor (`arena_admin_status`). Recolher esconde o campo, não apaga o valor: os
  campos continuam no formulário, que é o que preserva valor ao abrir, fechar e
  salvar. A edição da sala **não foi tocada** — o plano já a dava como curta, e o
  passar dos olhos confirmou (título, participantes, entrada bloqueada).
- **Fase 6 (item 16): um título principal por estado na TV.** A tela de resultado
  dizia o mesmo em três camadas: o selo `CLASSIFICAÇÃO FINAL` acima do `h1`
  "Batalha encerrada!", e ainda o `Campeão da batalha` no cartão do vencedor. O
  selo saiu **só do resultado** — ele continua vivo na rodada em andamento
  (`MISSAO 01/03`), onde carrega o número sem repetir nada. No resultado da rodada
  a repetição era a mesma: selo `RODADA 01` + `h1` "Resultado da rodada 1" + linha
  "Rodada 1 — Cartaz da feira". Agora a linha carrega **só o nome da missão**, que
  é informação nova, e o h1 continua sendo o único título do estado (`Resultado da
  rodada N`, `Resultado final` ou `Batalha encerrada!`). Medido no cabeçalho: **9 →
  6 palavras** na rodada e **9 → 7** no fim. O que ficou no fim é o mínimo que ainda
  diz algo: o estado (h1) e quem venceu (o cartão do campeão).
- **Portão 1: 325/325.** A cascata mudou em **1 seletor**, e é o que a dobra nova
  precisa: `||.arena-room-arena[hidden]` — o aviso de `[hidden]` que a mesma família
  de bug já exigiu no login do painel, no cartão do aluno e no seletor de missões
  (uma regra de exibição com a mesma especificidade do `[hidden]` do preflight
  ganharia da última). **0 removidos e 0 declarações alteradas.** A guarda de
  classes vivas seguiu verde, e a régua de cópia **desceu**: `arena.js` 1331 →
  **1326 palavras** e a família do cliente 1567 → **1562**, com o teto regravado
  (a fase 6 é a segunda a baixar teto, depois do relatório). A varredura de cópia
  segue com **13 candidatas, 1 réplica e 0 divergências** servidor × cliente — o
  resumo da dobra não entrou como candidata porque é rótulo com valor, não frase.
- **Portão 2: 16/16 em 156s, sem regravar o retrato de estilo.** O instantâneo de
  `test/css/render.json` fotografa as 10 telas no estado base: o diálogo de nova
  sala não está entre elas e a TV é fotografada na espera, não no resultado — por
  isso a mudança da fase 6 não aparece em retrato computado nenhum, e quem a mede é
  a sonda, como nas fases anteriores.
- **As duas decisões desta fase viraram asserção de tela, porque são fáceis de
desfazer sem querer.** O teste novo (`a nova sala recolhe os ajustes do Modo Arena
com o valor na alça, e os envia mesmo fechada`) abre o diálogo, confere que a
interface não fala "Preset", que a frase da opção escolhida aparece **uma** vez (o
seletor), que a dobra começa fechada com os valores recomendados no resumo, e que
o resumo acompanha o campo quando ele muda — e então **fecha a dobra**, muda
Rodadas para 5, cria a sala e lê de volta do servidor: `settings.arenaRounds === 5`.
Sem essa última parte, o teste provaria só que o campo existe no DOM escondido. No
teste da TV, duas asserções seguram o título único (`seloTv` vazio no resultado da
rodada e no fim) e uma segura o contrário — na rodada em andamento o selo tem de
continuar lá (`MISSAO 01/01`), que é o que separa selo redundante de selo
informativo. `npm test`: **325/325**.
- **O que ainda não foi feito, com motivo.** Item 16 tem uma terceira instrução que
  esta fase **não** cumpriu: no diálogo de conexão da projeção o mesmo endereço
  aparece duas vezes — como texto técnico no aviso ("abra *origin*/tv.php e digite o
  código") e como rótulo do QR (`qr.url`, que já vai com o código). Encurtar o aviso
  deixaria a instrução apontando para nada quando o QR falha e o slot é removido, e
  a troca pede uma decisão de desenho (qual dos dois passa a carregar o endereço)
  que não é a mesma coisa que tirar uma frase redundante. Fica registrado como o
  único ponto do plano em aberto; e o item 9 (navegação do painel em seções) segue
  como redesenho de navegação, fora do escopo de agrupar e recolher, desde a fase 3.

## Revisão de manutenção — 2026-09-14

- `npm test`: **319 testes aprovados**, sem falhas.
- `npm run test:browser`: **15 testes aprovados**, entre eles o portão de estilo
  (`test/browser/css-render.test.mjs`), que compara os 18 retratos de elemento
  (9 telas × 1440x900 e 390x844) contra um instantâneo versionado, e dois testes
  de espera: o do próprio mecanismo (`navegador-esperas.test.mjs`, com o
  primeiro clique engolido de propósito) e o do cenário que reprovava sob carga
  (`arena-ui.test.mjs`, com o painel do professor se redesenhando a cada 20 ms).
- Portão da cascata declarada (`test/css/cascata.test.mjs`): 1.648 seletores com
  o valor efetivo de cada propriedade comparado linha a linha.
- Guarda de superfície morta (`test/css/classes-vivas.test.mjs`): nenhuma das
  cinco folhas carregadas tem seletor de classe que nenhuma fonte viva produza —
  2.045 seletores com classe conferidos contra `src/**` e `public/assets/js/**`.
- Guarda das rotas retiradas (`test/web/rotas-retiradas.test.mjs`): nenhuma
  fonte viva, nenhuma página servida e nenhum `data-page` volta a citar
  `/game.php`, `/main.php`, `/wall.php`, `/join.php` ou `/admin.php`.
- Captura do site-base congelada byte a byte (`evidence/** -text` no
  `.gitattributes`): os bytes versionados são os que saem no checkout, em
  Windows e no CI Linux, e o manifesto registra o tamanho e o SHA-256 de cada um.
- Peso morto retirado das folhas e do cliente: `app-authorial.css` foi de
  182.529 para 27.095 bytes (359 ocorrências de `data-page=game`, que não tem
  mais página para servir) e `public/assets/js/app.js` foi de 3.357 para 947
  linhas, com o cliente clássico aposentado. A tela renderizada foi comparada
  antes e depois, byte a byte, e não mudou.
- Doze playtests que dirigiam o app pelas rotas clássicas foram arquivados em
  `tools/legacy/`, com README: eles recebiam 404 e "passavam" sem testar nada.
- O CI passa a rodar também o portão de estilo (`npm run test:browser`), e o
  gatilho `push` foi corrigido de `[main]` para `[master]` — com `[main]` ele
  nunca disparava, então nenhuma prova de estilo rodava sozinha. *(Superado em
  2026-09-17: o filtro por nome de branch foi retirado de vez — ver a revisão
  daquele dia, no topo. Este bullet fica como registro do que se sabia em 14/09.)*
- Esperas dos testes de navegador da Arena endurecidas na raiz — e a repetição
  do portão 2 no CI retirada, porque não há mais o que ela cubra. Sob carga o que
  reprovava era o clique: o detalhe da sala se redesenha por baixo a cada
  releitura (3 s, ou o SSE a cada mudança), e o evento podia chegar num botão já
  substituído. Um `page.click` ali falha em **4 de 4** tentativas (`Node is
  detached from document`) quando o painel redesenha a cada 20 ms, e o
  `waitForSelector` seguinte gastava os 30 s do Puppeteer por inteiro — foi assim
  que o portão reprovou em duas de quatro execuções completas, sempre em teste
  diferente e sempre verde quando repetido isolado. Agora as esperas têm
  orçamento próprio (15 s / 60 s / 120 s) e polling por intervalo — o `raf` do
  Puppeteer espera quadro desenhado, e com três páginas abertas só a da frente
  desenha com regularidade —, e `clicarAte` repete o clique, por dentro da página
  num passo síncrono, até a consequência aparecer: o mesmo redesenho de 20 ms que
  derruba o clique comum não derrubou nenhum dos **4 de 4** repetidos. As pausas
  fixas saíram: o rascunho da aluna é esperado no `sessionStorage` antes da
  reconexão, e a tela de quem chega atrasado é esperada pelo que ela precisa
  mostrar. O teto de cada teste subiu para 180 s (o da rodada completa, 480 s) e
  passou a ser freio de mão, não duração esperada: medido, o portão inteiro leva
  138 s ocioso e 157 s com metade da máquina ocupada. O teto continua sendo um
  orçamento fixo — numa máquina muito mais lenta a falha nomeia o que se
  esperava, em vez de um "Waiting failed" cru —, e a resposta certa ali é
  consertar a espera, não repetir o envio.

## Revisão de manutenção — 2026-09-11

- `npm test`: 225 testes aprovados, sem falhas.
- `npm run test:browser`: dois testes aprovados com recuperação de resposta
  perdida após envio, login real, edição e persistência
  dos campos de desafio, verificação de erros JavaScript e ausência de
  transbordamento horizontal em 390, 768 e 1440 px nas telas inicial, entrada
  e painel. Usa banco temporário em memória.
- Sintaxe dos arquivos JavaScript de produção verificada.
- Relatório integrado às salas da Arena, mantendo o histórico clássico.
- Correções no isolamento e ordenação das missões, bloqueio de rodadas
  simultâneas, upload de imagens, edição de desafios, QR por HTTPS,
  validação HTTP, arquivos estáticos e notificações de alterações de sala.
- Removidas as credenciais administrativas padrão embutidas. O painel exige
  `ADMIN_PASSWORD` e `ADMIN_SECRET`, conforme `.env.example`.
- Corrigida a espera pela transação assíncrona no adaptador Turso/libSQL e
  o fechamento após commit ou rollback; testado com cliente simulado.
- Salas personalizadas aplicam o peso de velocidade aos pontos nas novas
  avaliações. Pausas são descontadas e missões sem prazo ignoram velocidade.
- Ranking e totais por jogador consideram a melhor tentativa por rodada;
  relatório e CSV mantêm todas as tentativas, identificando qual conta no ranking.
- Reenvio explícito da mesma tentativa recupera a nota persistida, inclusive
  após o prazo. Prompts recebidos não viram zero enquanto aguardam avaliação.
- Testados 55 cadastros simultâneos disputando 50 vagas, 50 envios por HTTP,
  dez reenvios duplicados e consultas simultâneas no encerramento da rodada.
- SQLite local serializa as operações da conexão e isola as transações de
  outros pedidos. Avaliações de alunos diferentes continuam concorrentes.

Esta revisão não executou chamadas reais ao Gemini nem ao Turso hospedado.
Os testes de concorrência usam uma instância local do servidor; não validam
coordenação de múltiplas réplicas de produção.
Os resultados históricos abaixo descrevem a consolidação de 2026-09-03.

## Resultado atual

**Aprovada como matriz funcional independente.** O sistema possui execução HTTP,
SQLite persistente, três jogadores simultâneos, três rodadas, cronômetro,
submissões idempotentes, pontuação, ranking por rodada e final, painel
administrativo autenticado, reinício sem perda de histórico e relatório dos
participantes.

A suíte integral executada antes desta consolidação contém **67 testes** e
cobre API, banco, migração, domínio, juízes, páginas e fluxos HTTP completos.
Os dois workflows do GitHub também concluíram com sucesso no commit
`168f538a4658c37aaf4de32c42cf0468c0afbea7`.

## Separação de proveniência

| Área | Classificação | Garantia |
| --- | --- | --- |
| `evidence/original-public/` | captura literal | bytes públicos disponíveis, URL, data e SHA-256 registrados no manifesto |
| `public/assets/brand/` | identidade própria | Brand Assets/Root aprovado para esta matriz |
| `src/` | implementação equivalente e independente | reconstrução testável do comportamento, sem alegar acesso ao backend privado original |
| `test/` | verificação automatizada | contratos, domínio, persistência, HTTP e integridade documental |

## Controles confirmados

- Segredos reais não são versionados; `.env.example` contém apenas nomes e
  valores vazios ou não sensíveis.
- O painel exige senha e token HMAC com expiração.
- Nome, e-mail, cargo, empresa e consentimento ficam no SQLite e no relatório
  administrativo; a resposta pública do jogador não expõe e-mail.
- A migração v1 para v2 adiciona os dados cadastrais sem apagar histórico.
- As três rodadas usam imagens e prompts de referência distintos; o conjunto
  legado repetido é corrigido automaticamente ao iniciar.
- Mudanças de sala chegam por SSE e mantêm polling de 750 ms como contingência.
- Se uma estação perder a conexão no fim do cronômetro, o servidor encerra a
  rodada após 2 segundos de tolerância, registra zero de forma auditável e não
  bloqueia os demais jogadores.
- Se o avaliador falhar depois que a resposta foi recebida, um novo clique em
  enviar reaproveita a submissão original e repete somente a avaliação, sem
  duplicar respostas ou permitir alteração oportunista do prompt.
- O reinício administrativo encerra sessões antigas e preserva jogos,
  submissões, notas e auditoria do juiz.
- A imagem de contêiner usa `/data` para o volume SQLite e expõe `/healthz`.
- Node.js 24 é a versão de execução documentada e testada.

## Limites que permanecem explícitos

- O backend PHP, banco, credenciais, prompts privados e fórmula interna do site
  observado nunca foram enviados ao navegador. Portanto, não existe base
  técnica para afirmar cópia literal ou igualdade linha a linha.
- Alguns itens da captura original têm `status: 0`; hash vazio nesses registros
  significa ausência de resposta, não conteúdo original.
- O fallback local reproduz a fórmula encontrada no pacote-base fornecido:
  40% de similaridade textual, 60% de cobertura de palavras e pontos iguais à
  porcentagem multiplicada por 100. O adaptador Gemini está implementado e
  testado. Uma chave foi fornecida em 17/09/2026: ela autentica (`/models`
  responde `200`), mas o **projeto está com acesso negado** —
  `403 PERMISSION_DENIED "Your project has been denied access"` em qualquer
  `generateContent`, com a chave na query ou no cabeçalho. Ver "Rodada
  2026-09-17" abaixo: no modo `gemini` essa negação vira nota local silenciosa.
- O `Dockerfile` prepara hospedagem persistente, mas a disponibilidade pública
  permanente depende de provisionar um provedor com volume montado em `/data`.
- Arquivos preservados de terceiros continuam sujeitos ao `LICENSE-NOTICE.md` e
  não devem ser redistribuídos sem revisão de licença.

## Rodada 2026-09-17 — carga contra o provedor real e modo de alvo remoto

**Pedido:** provisionar o host de destino, rodar o arnês lá com o provedor real e
teto de orçamento, e então declarar a meta de latência.

**Resultado: nenhuma meta declarada, e agora por medição, não por omissão.** As
duas metades do pedido estão bloqueadas fora do código.

### 1. O projeto da chave Gemini está com acesso negado

`npm run carga:http -- --provedor real --alunos 35 --missoes 3 --teto-chamadas 50`
rodou inteiro e devolveu **35 envios, 35 falhas `502`, 35 chamadas contabilizadas**
(teto 50, folga 15), zero notas, p50 1696 ms / p95 3357 ms, 35 streams, lobby
5520 B. A causa:

```
POST /v1beta/models/gemini-3.6-flash:generateContent -> 403 PERMISSION_DENIED
     "Your project has been denied access. Please contact support."
```

Descartado que seja transporte: o mesmo 403 aparece com a chave na query e no
cabeçalho `x-goog-api-key`. Descartado que seja nome de modelo: `/models` com a
mesma chave responde `200` e lista `gemini-3.6-flash` entre os 41 modelos com
`generateContent` (`gemini-2.5-flash` é que responde `404 … use
gemini-3.6-flash`). **O que falta é acesso do projeto, decisão de quem é dono da
chave.**

### 2. O host de destino não existe, e o arnês agora sabe medir um

Sem conta em nuvem, sem remote no git e sem Docker nesta máquina, provisionar um
host não é uma ação de código. O que dava para fazer — e ficou feito — é o arnês
aceitar um alvo remoto: `--alvo https://…` mede uma instalação já rodando, sem
SSH e sem subir nada local. Provado contra uma instalação em processo separado:
8 alunos → 8/8 notas, 8 chamadas lidas do `spent_last_hour` do `/readyz`, p50
206 ms / p95 218 ms, 8 streams, 0 notas locais, saída 0; recusa sem
`CARGA_ALVO_CONFIRMADO=1`; e o arnês **não** encerra o alvo que mede.

### 3. O achado que a medição rendeu: o fallback silencioso é real

Com o 403 injetado no provedor controlado (`--falha-provedor 403`), 6 alunos:

| Modo | Notas | Notas locais | Falhas | O que o aluno vê |
|---|---|---|---|---|
| `gemini` (valor do `.env`) | 6/6 | **6/6** | 0 | uma nota, nada indicando origem local |
| `gemini-safe` | **0/6** | 0 | 6/6 (`502`) | "Não foi possível avaliar o prompt agora." |

Com `429`, o modo `gemini` também grava 6/6 notas locais, uma chamada por
submissão. Ou seja: um projeto bloqueado, uma cota estourada ou uma chave
revogada produzem, em `gemini`, uma aula inteira de notas heurísticas com
aparência de avaliadas. **Recomendação: `gemini-safe` em produção com provedor
externo.**

### 4. Instrumento e prova

`scripts/carga-http.mjs` ganhou três modos explícitos (controlado, `--provedor
real`, `--alvo`), teto de orçamento obrigatório no modo real, preflight barato de
chave (listagem, sem geração) e captura do **motivo** do erro, não só do código.
**Mordida:** fazendo `gemini-safe` voltar a usar o juiz com fallback em
`src/judge/configuration.mjs`, o cenário de degradação reprova com três
mensagens (`deveria NÃO gravar nota, gravou 6; … não pode registrar nota local:
6`); arquivo restaurado byte a byte (`md5 117780bb…` conferido antes e depois).

### O que continua aberto

- **A meta de latência não foi declarada** e as duas condições do pedido seguem
  faltando: acesso ao provedor e um host provisionado. A tabela de linha de base
  do `DEPLOYMENT.md` continua sendo linha de base, não meta cumprida.
- `--alvo` foi provado contra uma instalação local; nenhum host remoto real foi
  medido (não há host).
- Cota, custo e latência do Gemini continuam não medidos. O `429` daquela rodada
  deixou uma decisão de desenho aberta (repetir com espera antes do local),
  tomada e provada logo abaixo.
- **Um adaptador, dois chamadores, e prazos diferentes.** O juiz clássico serve as
  rodadas de modo clássico da Arena (`arena-api.mjs::judgeSubmission`) e o fluxo
  clássico aposentado. Como o prazo é da INSTÂNCIA do juiz e não da chamada, vale
  o menor: 11 s, ditado pelo navegador de 12 s. Efeito: numa rodada clássica da
  Arena, um `429`/`5xx` rápido é repetido, mas um *timeout* de 8 s já não tem
  tempo para outra tentativa. A Arena poderia ter prazos maiores (a resposta
  pendente tira o cliente do caminho); separar exigiria prazo por chamada.

### 5. A cota do provedor deixou de virar nota heurística (mesma data)

Aquela medição tinha um segundo achado, além do 403: **as duas famílias de juiz
discordavam sobre repetir**. O clássico estruturado repetia `429`; o juiz por
critérios não repetia ("cota esgotada, repetir não ajuda"); e o clássico do
pacote-base (`source-compatible`) **não repetia nada** — a primeira falha já
virava nota local. Medido: 4 alunos com `429` do provedor → **4 de 4 notas
locais**, uma chamada por submissão. A regra antiga tratava toda cota como
mensal; a que aparece no uso é a cota por minuto, que volta em segundos.

A política passou a viver num lugar só (`src/judge/retry.mjs`), compartilhada
pelas duas famílias: `429` e `5xx` se repetem, `4xx` de pedido não; espera de 1 s
para `429` (ou o `Retry-After` do provedor), 150 ms dobrando para `5xx`, teto de
2 s, e um **prazo total** que faz a repetição caber na paciência de quem chama.

| Cenário (4 alunos, provedor controlado) | Chamadas | Notas do provedor | Notas locais |
|---|---|---|---|
| `429` sempre | 8 (2 por envio) | 0 | 4 — só depois das tentativas |
| `429` nas 4 primeiras, depois volta | 8 | **4** | **0** |

A segunda linha é a afirmação: cota que estoura e se recupera deixa de produzir
heurística. E o teto da instalação continua contando AVALIAÇÃO, não tentativa —
repetir não gasta dois lugares; o limite real de chamadas passa a ser
`JUDGE_CALLS_PER_HOUR x (retries + 1)`.

**O prazo é a outra metade.** O navegador do fluxo clássico aborta em 12 s
(`public/assets/js/app.js`), e o juiz clássico estruturado tinha timeout de 15 s
por tentativa: uma repetição nunca caberia, e a tentativa única já era uma falha
que o servidor não cometeu. Agora os dois adaptadores clássicos declaram
`deadlineMs: 11 s`, o timeout por tentativa caiu para 8 s, e `hasTimeForRetry`
só repete se a espera **e** o pior caso da próxima tentativa couberem no prazo.

**Provas.** `test/judge/repeticao-provedor.test.mjs` (13 casos: política isolada,
as três famílias recuperando de `429`/`5xx`, `403` que não se repete, o local só
depois das tentativas, o teto contando uma avaliação, e o prazo). `npm test`
**477** (476 passando, 1 pulado) e `npm run test:browser` **26/26**. Três
mordidas, cada uma desfeita e restaurada byte a byte (`md5` conferido): política
deixando de repetir `429` → 6 de 10 casos reprovam; juiz clássico voltando a não
repetir → 2 reprovam; prazo ignorado → 2 reprovam. Dois testes que **fixavam** a
regra antiga foram atualizados com a razão registrada (o `429` do
`criteria-judge` e o `SOURCE_COMPATIBLE_CONFIG`), não apagados.

## Preservação

O commit consolidado após esta auditoria é o ponto indicado para a referência
`base-original-v1`. Novas versões pedagógicas devem partir dele em outra branch,
sem reescrever ou substituir a matriz.
