# Colocando a Batalha de Prompts em produção

## Perfil de hospedagem decidido

**Um processo, um volume persistente, SQLite local.** Não é preferência estética:
o produto guarda estado no processo (hub de tempo real, limitador de tentativas e
a serialização das escritas do estado coletivo vivem na memória de uma
instância) e o backend onde a integridade referencial está comprovada é o
arquivo local. A decisão está no código, em `src/server/hosting.mjs`, e aparece
no `/readyz` em `hosting: "volume-persistente"`.

| Item | Valor |
|---|---|
| Instâncias | **1** (duas instâncias atrás do mesmo proxy não compartilham SSE, limites nem a fila de escrita) |
| Banco | arquivo SQLite em volume persistente (`DATABASE_PATH=/data/descubra-o-prompt.sqlite`) |
| Porta | `PORT` (padrão 3000), atrás de proxy com TLS |
| Proxy | Caddy/nginx no host, uma instância. `TRUSTED_PROXIES` lista quem pode enviar `X-Forwarded-For` |
| CPU/memória | 1 vCPU e 512 MB bastam para uma turma de 35–50; o processo é I/O-bound (polling de 2,5 s) |
| Disco | contexto de build filtrado, **8,5 MB medidos** (era 1 323 MB) + o volume do banco (alguns MB por turma). O tamanho final da IMAGEM nunca foi medido: exige uma máquina com Docker — ver a nota do `Dockerfile` abaixo |
| Rollback | imagem anterior + o backup do banco tirado antes do deploy (ver "Backup e restauração") |

### Banco gerenciado (Turso/libSQL): trancado, e por quê

A auditoria de prontidão reproduziu, com o cliente libSQL real, um caso em que
`PRAGMA foreign_keys` ligado **dentro** de uma transação já aberta não vale — e o
banco aceitava referência órfã. Enquanto isso não for comprovado na base de quem
vai hospedar, produção **recusa** `TURSO_URL`:

```
Configuracao de producao invalida:
- backend de banco gerenciado (TURSO_URL) não validado neste banco: ...
```

A trava sai do lugar em dois passos, os dois com prova:

```bash
npm run validar-integridade          # cria uma referência órfã de verdade e vê se o banco recusa
# só se ele passar:
TURSO_INTEGRITY_VERIFIED=1           # no ambiente do serviço
```

O comando acima não altera dados do produto (a sonda roda em transação e derruba
as tabelas de prova antes do commit), confere `PRAGMA foreign_key_check` nos
dados atuais e sai com 1 quando reprova. Falhar lá é informação, não obstáculo:
significa que aquele banco precisa de invariantes próprias antes de receber
dados de aluno.

## O que o servidor precisa (fatos duros)

- **Processo Node.js contínuo** (`npm start`, Node 24, `node:sqlite`). Não é serverless:
  a experiência exige resposta imediata ao polling de 2,5 s dos 35 navegadores.
- **Banco persistente**: o SQLite fica em `DATABASE_PATH` (padrão
  `./var/descubra-o-prompt.sqlite`). Em host *sem disco persistente* o arquivo
  morre a cada restart → use volume. O `/readyz` avisa (sem bloquear) quando o
  banco está dentro do diretório da aplicação, que é o caso que morre no redeploy.
- **Variáveis** (ver `.env.example`): `PORT`, `DATABASE_PATH`, `TRUSTED_PROXIES`,
  `SHUTDOWN_TIMEOUT_MS`, `JUDGE_MODE` (`fallback` | `gemini` | `gemini-safe`),
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `JUDGE_CONCURRENCY`, `JUDGE_CALLS_PER_HOUR`,
  `JUDGE_QUEUE_MAX`, `SUBMIT_WAIT_MS`, `ADMIN_PASSWORD` + `ADMIN_SECRET`.
  Em `NODE_ENV=production` o boot **falha** sem `ADMIN_PASSWORD`/`ADMIN_SECRET` —
  painel desabilitado não é modo degradado, é implantação que não funciona.
  `JUDGE_MODE` vale para as duas famílias de juiz (clássico e por critérios da
  Arena): `fallback` é local em todos os fluxos, mesmo com chave configurada, e
  `gemini-safe` exige a chave no boot. Modo desconhecido derruba o boot.
- **Imagens/estáticos** ficam em `public/` (versão em `?v=` no HTML — bumpar a
  cada deploy para forçar cache novo).
### Envio do aluno: pendente em vez de falha enganosa

A avaliação externa tem 12 s de timeout e uma repetição — mais que os 12 s que o
navegador esperava antes. O servidor agora **responde "pendente"** depois de
`SUBMIT_WAIT_MS` (padrão 8 s), com o id da submissão e a tentativa: o envio foi
aceito e a nota chega pela consulta de estado (o lobby que a tela já faz). O
cliente espera 15 s, acima do prazo do servidor, para não anunciar falha de rede
enquanto o servidor continua avaliando. Quando a nota fica pronta, o servidor
avisa a sala pelo fluxo de tempo real (`arena_score_ready`), então a tela não
espera o próximo ciclo de consulta.

Repetir o envio é seguro e é o caminho previsto: a submissão é única por
`(rodada, participante, tentativa)` e a nota é única por submissão, e uma
avaliação em voo não é reaberta por um segundo pedido — o aluno consulta/conclui
a MESMA avaliação, sem gastar outra chamada ao provedor.

### Teto de avaliações externas

| Variável | Padrão | O que faz |
|---|---|---|
| `JUDGE_CONCURRENCY` | 4 | avaliações simultâneas por instalação |
| `JUDGE_CALLS_PER_HOUR` | 400 | chamadas ao provedor por hora |
| `JUDGE_QUEUE_MAX` | 64 | quantas avaliações podem esperar na fila |

O `/readyz` publica o estado (`judge_budget`: em voo, na fila, gasto na hora).
Estourar o teto **não** vira nota local: a resposta é recuperável (503 +
`Retry-After`) e a mensagem diz que a tentativa do aluno está preservada. Num
pico de fila, o aluno vê "pendente" (acima) e a nota chega quando a fila anda;
a recusa só aparece quando a fila passa do fundo.

Melhor que discutir o número é medir. São duas medições, e elas respondem a
perguntas diferentes:

- `npm run carga` — juiz **stub injetado** dentro do processo do arnês. Mede o
desenho (fila, teto, resposta pendente) e nada mais. 35 alunos com stub de
120 ms: p50 672 ms, p95 1,2 s, 35 chamadas (uma por submissão).- `npm run carga:http` — **instalação real**: processo separado com `npm start`,
  banco em arquivo, HTTP e SSE de verdade, política de juiz vinda do ambiente e o
  provedor apontado por `GEMINI_BASE_URL` para um endpoint controlado na própria
  máquina. Mede o que a turma sente, do envio do aluno aos bytes do lobby e ao
  tráfego de tempo real de cada conexão. Ver a seção seguinte.
- `npm run carga:http -- --provedor real --teto-chamadas N` — o mesmo arnês contra
  o **provedor oficial**, com `--teto-chamadas` virando o `JUDGE_CALLS_PER_HOUR` da
  instância (o servidor recusa a chamada N+1, então o orçamento não depende de
  boa vontade do script). Exige orçamento explícito: sem ele o arnês recusa.
- `npm run carga:http -- --alvo https://…` — mede uma **instalação já rodando** (o
  host de destino), sem SSH e sem subir nada local: mesma turma, mesmos envios,
  mesmos streams. As chamadas ao provedor passam a ser lidas do `spent_last_hour`
  do `/readyz` em vez do contador local. **Escreve no alvo** (cria sala, missões e
  participantes), então exige `CARGA_ALVO_CONFIRMADO=1` e `CARGA_SENHA_ADMIN` — só
  homologação, nunca produção. O arnês não encerra a instalação que está medindo.

### Linha de base medida numa instalação real (17/09/2026)

```bash
npm run carga:http -- --alunos 35 --missoes 3 --latencia 120
npm run carga:http -- --alunos 50 --missoes 12 --latencia 300
npm run carga:http -- --alunos 35 --missoes 3 --latencia 900
```

Perfil `volume-persistente`, `JUDGE_MODE=gemini` apontando para um provedor
controlado (sem cota, sem tráfego para fora), teto padrão de 4 simultâneas:

| Cenário | envio p50 | envio p95 | "pendente" | chamadas | notas | streams | SSE recebido | lobby |
|---|---|---|---|---|---|---|---|---|
| 35 alunos · 3 missões · provedor 120 ms | 906 ms | 1,43 s | 0 | 35 (1,00/submissão) | 35/35 | 35 | 4,4 KB/aluno | 5,5 KB |
| 50 alunos · 12 missões · provedor 300 ms | 2,52 s | 4,19 s | 0 | 50 (1,00/submissão) | 50/50 | 50 | 6,2 KB/aluno | 9,4 KB |
| 35 alunos · 3 missões · provedor 900 ms | 4,83 s | 8,16 s | 3 | 35 (1,00/submissão) | 35/35 | 35 | 4,8 KB/aluno | 5,5 KB |
| **controle** · 35 alunos · 900 ms · teto 1 | 8,09 s | 8,13 s | **27** | 35 (1,00/submissão) | 35/35 | 35 | 7,9 KB/aluno | 5,5 KB |
| **controle** · 35 alunos · provedor instantâneo | 252 ms | 324 ms | **0** | 35 (1,00/submissão) | 35/35 | 35 | 4,4 KB/aluno | 5,5 KB |

Zero falhas em todos; nenhuma nota perdida; procedência `local: 0` (todas as
notas vieram do provedor) e cota contabilizada igual ao número de submissões. Os
dois controles existem para provar que o arnês **mede** o teto em vez de só
imprimir números: baixando o teto para 1, os "pendente" vão de 3 para 27 e o
pico simultâneo no provedor cai de 4 para 1; com provedor instantâneo, os
"pendente" vão a 0. O arnês **falha** (sai com código 1) se faltar nota, se
houver envio sem sucesso, se abrir menos streams que alunos, se as chamadas ao
provedor não forem exatamente uma por submissão ou se alguma nota vier do juiz
local.

**O que esta tabela não é.** O provedor é controlado e tem o atraso escolhido
acima; o host é esta máquina. Portanto: ela **não** prova a latência do Gemini,
não prova a capacidade do host de destino e **não é uma meta declarada**. É a
linha de base que a execução no host escolhido precisa reproduzir ou superar —
e a meta de latência só se declara depois dessa execução, com o provedor real e
com limite de orçamento. Também não mede consultas por leitura (o lobby já foi
medido em 44–56 `prepare` por leitura antes destas mudanças) nem latência de
banco remoto.

### A execução no provedor real: tentada em 17/09/2026, bloqueada fora do código

```bash
npm run carga:http -- --provedor real --alunos 35 --missoes 3 --teto-chamadas 50
```

O arnês rodou inteiro e a medição **não** existe: os 35 envios voltaram `502`, com
35 chamadas contabilizadas (`spent_last_hour` 35 de um teto de 50, folga 15),
zero notas e p50 1696 / p95 3357 ms. A causa não é o código:

```
POST /v1beta/models/gemini-3.6-flash:generateContent
  -> 403 PERMISSION_DENIED
     "Your project has been denied access. Please contact support."
```

O mesmo 403 aparece com a chave na query e no cabeçalho `x-goog-api-key`, ou
seja: **não é transporte, é o projeto**. A listagem `/models` com a mesma chave
responde `200` e inclui `gemini-3.6-flash` entre os 41 modelos com
`generateContent`, então o nome do modelo está certo (a suspeita antiga de modelo
descontinuado não se confirmou: `gemini-2.5-flash` é que responde `404 … use
models/gemini-3.6-flash`).

**O que destrava:** acesso do projeto à API, ou uma chave de outro projeto. Depois
disso, o comando acima é a medição — e ela é uma linha, sem SSH:

```bash
CARGA_ALVO_CONFIRMADO=1 CARGA_SENHA_ADMIN=… \
  npm run carga:http -- --alvo https://<homologação> --alunos 35 --missoes 3
```

### O fallback silencioso, medido

Um projeto sem acesso não é uma hipótese: é o estado atual desta chave. E ele
mostra por que o modo do juiz importa. Injetando o 403 no provedor controlado
(`--falha-provedor 403`), com 6 alunos:

| Modo | Notas gravadas | Notas locais | Envios que falharam | O que o aluno vê |
|---|---|---|---|---|
| `gemini` (o valor do `.env` naquele dia) | 6/6 | **6/6** | 0 | uma nota, sem sinal de que veio do juiz local |
| `gemini-safe` | **0/6** | 0 | 6/6 (`502`) | "Não foi possível avaliar o prompt agora." |

Aquela tabela é o retrato de um defeito, não o comportamento de hoje: a heurística
local **deixou de ser prêmio de consolação por falha do provedor** (ver "O pátio"
abaixo). Hoje o mesmo 403 produz 0 notas locais nos dois modos.

O `403` é **definitivo** e não se repete (repetir só gastaria cota). Cota e
defeito do provedor são outra história — ver as seções seguintes.

### A repetição antes do fallback (17/09/2026)

A medição acima, feita com `--falha-provedor 429`, mostrou um defeito que ia
além do 403: **as duas famílias de juiz discordavam sobre repetir**. O juiz
clássico estruturado repetia 429; o juiz por critérios não repetia ("cota
esgotada, repetir não ajuda"), e o juiz clássico do pacote-base **não repetia
nada** — a primeira falha já virava nota local. Resultado medido: 4 alunos,
`429` do provedor, **4 de 4 notas locais**, uma chamada por submissão. A regra
antiga tratava toda cota como mensal; a que aparece no uso real é a cota **por
minuto**, que volta em segundos.

A política agora está num lugar só, `src/judge/retry.mjs`, compartilhada pelas
duas famílias:

| Regra | Valor |
|---|---|
| O que se repete | `429` e `5xx`; `4xx` de pedido/chave não (repetir não conserta) |
| Espera para `429` | 1 s (cota volta em segundos), ou `Retry-After` do provedor |
| Espera para `5xx` | 150 ms, dobrando por tentativa |
| Teto da espera | 2 s (um `Retry-After: 3600` não segura a avaliação) |
| Prazo total | 30 s na Arena; **11 s** no fluxo clássico, cujo navegador aborta em 12 s |

O prazo não é detalhe: uma repetição que estoura a paciência de quem chamou
produz uma falha que o servidor não cometeu. `hasTimeForRetry` só repete se a
espera **e** o pior caso da próxima tentativa couberem no prazo.

O que a repetição compra, medido no arnês com `--falha-vezes` (provedor que
recusa as primeiras chamadas e depois volta), 4 alunos:

| Cenário | Chamadas | Notas do provedor | Notas locais |
|---|---|---|---|
| `429` sempre (sem recuperação) | 8 (2 por envio) | 0 | 4 — só depois das tentativas |
| `429` nas 4 primeiras, depois volta | 8 | **4** | **0** |

A segunda linha é a que importa: uma cota que estoura e se recupera em segundos
deixa de virar heurística. **Efeito no teto de custo:** `JUDGE_CALLS_PER_HOUR`
conta **avaliações**, não tentativas — repetir não gasta dois lugares. O limite
real de chamadas ao provedor passa a ser `JUDGE_CALLS_PER_HOUR × (retries + 1)`.

### O pátio: avaliação que o provedor não entregou volta sozinha (17/09/2026)

Faltava a terceira pergunta: e quando as repetições também falham? Antes, a nota
da heurística local era gravada ali — e é exatamente isso que a tabela do 403
mostra como defeito. Agora a avaliação é **estacionada**
(`src/judge/parking.mjs`) e reprocessada com espera crescente, **nos dois modos
com provedor**. O que a turma vê, e o que fica no banco:

| Desfecho | Aluno | Professor | Banco |
|---|---|---|---|
| Provedor volta na 1ª tentativa do pátio | "Resposta guardada… a nota será concluída automaticamente" e a nota aparece sozinha | nota com procedência do provedor | 1 nota do provedor, 0 heurísticas |
| Teto do pátio esgotado (4 tentativas) | a resposta segue guardada; repetir reavalia a MESMA tentativa | envio visível sem avaliação, no bloco **quem ainda espera nota** (nome, missão, tempo, motivo) e como `não volta sozinha`; `/readyz` avisa | 0 notas |
| Teto de custo da instalação estourado | recusa recuperável (503 + `Retry-After`) **e** o pátio assume | idem | 0 notas até a hora virar |
| Cancelamento por encerramento | falha explícita (não espera o timeout) | idem | 0 notas agora; a submissão volta para a fila na próxima subida |
| Reinício / redeploy com avaliação estacionada | a nota aparece sozinha quando o processo novo sobe (até 24 h depois, se a sala ainda estiver viva) | `judge_parking_resume` no `/readyz` diz o que a subida encontrou; no painel a linha passa a dizer `volta sozinha` | 1 nota do provedor, 0 heurísticas |

| Regra do pátio | Valor |
|---|---|
| Reprocessamentos depois da falha no envio | 4 |
| Espera | 5 s dobrando (10/20/40 s), com `Retry-After` do provedor quando maior |
| Teto da espera | 60 s |
| Visibilidade da máquina | `judge_parking` no `/readyz` (`parked`, `resolved`, `exhausted`, `cancelled`,`next_retry_ms`) |
| Visibilidade de quem dá aula | bloco **quem ainda espera nota** no detalhe da sala: nome, missão, há quanto tempo, motivo em português e se a nota **volta sozinha** (`na_fila`, `avaliando`, `vai_retomar`) ou **não** (`esgotada`, `encerrada`, `fora_da_janela`). Só aparece quando há pendência; lista até 8 linhas e resume o resto |
| Retomada | `judge_parking_resume` no `/readyz` (`found`, `resumed`, `exhausted`): o que a subida encontrou no banco |
| Aviso (não bloqueia) | quando `exhausted > 0`: "N avaliação(ões) ficaram sem nota…" |

Consequência operacional que vale escrever: um projeto bloqueado deixa de
produzir notas heurísticas e passa a deixar as submissões **sem nota** (visíveis
no painel e no `/readyz`). É pior de ver e melhor de ser: quem corrige a chave vê
as notas chegarem sozinhas, e nenhuma turma leva para casa uma nota que ninguém
avaliou.

Isto não depende de disciplina de quem monta o juiz: o padrão dos dois
adaptadores é `onProviderFailure: 'throw'`, e a nota heurística em falha do
provedor passou a ser **opt-in explícito** (`'fallback'`). Um juiz construído com
chave e sem esse parâmetro sinaliza indisponibilidade — e o pátio assume.

O pátio (o relógio de espera) é **por processo**, mas a FILA não: submissão sem
linha em `arena_scores` é "ainda esperando nota", e isso está no banco desde o
primeiro envio. Um redeploy, então, deixou de custar a nota de quem já tinha
enviado: o processo novo lê a fila ao subir (`retomarEstacionadas`) e avalia. E
enquanto a instância estiver de pé é um **VIGIA** que repete essa varredura
(`JUDGE_PARK_SWEEP_MS`, padrão 60 s), de modo que a recuperação não depende nem
de reinício nem de o aluno reenviar. O que continua sendo premissa de uma
instalação por processo é o resto — teto de chamadas da hora, hub de eventos e
limitadores de tentativa.

O vigia não martela: um surto de 4 tentativas seguidas, e depois **uma tentativa
por rearme**, com resfriamento de `JUDGE_PARK_REARM_MS` (padrão 10 min) e no
máximo `JUDGE_PARK_REARMS` rearmes (padrão 6). Com os padrões, uma submissão
recebe no máximo 1 + 4 + 6 tentativas na história inteira — finito e escrito — e o
teto de custo da hora continua valendo por cima. `JUDGE_PARK_SWEEP_MS=0` desliga
o vigia (o boot segue retomando).

Três consequências operacionais: a **janela é de 24 h** e só cobre salas vivas
(`draft`, `waiting`, `open`, `playing`) — uma aula encerrada não dispara avaliação;
o **teto de tentativas conta através dos reinícios** (as tentativas gastas vêm de
`arena_judge_attempts`), então reiniciar não é uma forma de dar mais tentativas a
uma submissão que já esgotou as dela; e o `/readyz` separa o que a última
varredura viu (`judge_parking_resume`) do que a rede já recuperou desde a subida
(`judge_parking_watch`: `sweeps`, `recovered`, `rearmed`).

- **Prontidão e vida são perguntas diferentes**: `/healthz` responde "o processo
  está de pé" e não toca no banco (banco que pisca não pode virar reinício em
  laço); `/readyz` responde "posso receber tráfego" e devolve, em JSON,
  `database`, `config`, `judge`, `judge_budget`, `judge_parking`,
  `judge_parking_resume`, `judge_parking_watch`, `hosting`, `draining` e os
  problemas quando há (`503`). Use o `/readyz` no host e no proxy.
- **Encerramento gracioso**: `SIGTERM`/`SIGINT` tiram a instância do rodízio,
  cancelam a rede externa (uma avaliação em voo no Gemini resolveria em 12–15 s,
  mais que o prazo do host), descartam as esperas do pátio (elas vivem neste
  processo), revogam as conexões de tempo real, esperam as operações em voo e só
  então fecham o banco. Prazo: `SHUTDOWN_TIMEOUT_MS` (padrão 9 s, abaixo do
  timeout típico do host).
- Repositório git: local pronto (branch `master`) — **falta o remote**. Nada
  sensível está commitado (`.env`/`var/` no `.gitignore`).

## Opção A — VM sempre ligada (perfil escolhido)

Custo zero permanente em Oracle Cloud Always Free (ou qualquer host com volume).
Exige conta na nuvem; a alternativa sem nuvem é a Opção C.

```bash
# na VM Ubuntu (após provisionar e liberar 80/443 no security list)
git clone https://github.com/mrcelobento-code/batalha-de-prompts.git app
cd app && cp .env.example .env   # ADMIN_PASSWORD/ADMIN_SECRET/JUDGE_MODE/TRUSTED_PROXIES
docker build -t batalha-prompt .
docker run -d --name batalha -p 127.0.0.1:3000:3000 -v batalha-data:/data \
  --env-file .env --restart unless-stopped batalha-prompt
# TLS/HTTPS na frente, com UMA instancia e sem cache para /api.php e /events
apt install -y caddy   # Caddyfile: dominio.com { reverse_proxy 127.0.0.1:3000 }
```

O `Dockerfile` já é este perfil: `DATABASE_PATH=/data/descubra-o-prompt.sqlite`,
`VOLUME ["/data"]` e `HEALTHCHECK` no `/healthz`. Detalhes que importam na
operação:

- o proxy precisa repassar `X-Forwarded-For` **e** o serviço precisa listar o
  proxy em `TRUSTED_PROXIES` (ex.: `127.0.0.1,::1`); fora dessa lista o cabeçalho
  é ignorado, porque qualquer um pode escrevê-lo. Sem isso, o limitador de
  tentativas conta todo mundo como a mesma origem e alguns PINs errados travam a
  turma inteira;
- `/events` é SSE: nada de buffer/cache no proxy para essa rota;
- `--restart unless-stopped` + `SIGTERM` tratado = rolling restart sem aula
  interrompida;
- o contexto de build **não** é o diretório de trabalho: o `.dockerignore` exclui
  os artefatos locais (`tmp/`, `output/`, `arena/`, `.freebuff/`, logs, PNGs
  soltos) e o `Dockerfile` copia por caminho — manifestos, `src/` e `public/`.
  Medido em 17/09/2026: 1 323 MB de contexto para 8,5 MB, e 74 arquivos (8,10 MB)
  no `COPY`. O conjunto copiado foi provado suficiente para subir em produção
  (`node tmp/qa/imagem-sobe.mjs`: `/healthz` e `/readyz` 200, assets e `/play`
  200, banco no caminho do volume). **O build da imagem em si não foi executado**
  — não há Docker, podman, nerdctl nem WSL nesta máquina, e um tamanho de imagem
  não se declara sem medição.

## Backup e restauração (exercitado)

O procedimento abaixo já foi executado de ponta a ponta — não é um roteiro
teórico. Ele usa `VACUUM INTO`, que escreve uma cópia **consistente** sem parar o
servidor.

```bash
# cópia (padrão: ./var/backups/descubra-o-prompt-<carimbo>.sqlite)
npm run backup-banco
npm run backup-banco -- /caminho/fora/do/servidor/copia.sqlite
npm run backup-banco -- conferir /caminho/da/copia.sqlite

# exercício de restauração em banco isolado, ANTES de precisar dele
npm run restaurar-banco -- /caminho/da/copia.sqlite /tmp/restaurado.sqlite
```

- o backup recusa destino existente (um "backup" em cima do anterior transforma o
  último bom no último tentado) e recusa origem que reprove `integrity_check`;
- a restauração confere a cópia **antes** de escrever no destino e compara as
  contagens das tabelas do produto (`arena_rooms`, `arena_participants`,
  `challenges`, `room_rounds`, `arena_submissions`, `arena_scores`);
- o destino da restauração é sempre escrito por quem chama, e um destino
  existente só é sobrescrito com `--sobrescrever`.

Diário, fora do servidor:

```cron
0 3 * * * cd /srv/app && /usr/bin/npm run --silent backup-banco -- /srv/backups/$(date +\%F).sqlite >/dev/null 2>&1
```

A cópia precisa sair da máquina (outro disco, objeto remoto). Backup que mora
junto do servidor não protege contra a perda do servidor.

## Opção B — Hospedagem efêmera + banco gerenciado (bloqueada até a prova)

Render (web service) + Turso é possível e custou R$ 0 em 2026, com dois custos
conhecidos: o serviço grátis **dorme após 15 min sem tráfego** e o disco é
efêmero — por isso o banco iria para o Turso. Enquanto valer a trava do
`hosting.mjs`, esta opção exige `npm run validar-integridade` **no banco de
produção** e `TURSO_INTEGRITY_VERIFIED=1`. O `.dockerignore` já exclui `.env`,
`var/`, bancos e testes.

## Opção C — Continuar na máquina/LAN da sala

Grátis e imediato para uma turma local: `npm start` na máquina do professor e os
alunos abrem `http://<IP-da-máquina>:3000/`. Vale para o dia do evento; as opções
A/B são para acesso remoto/outros professores. Aqui o aviso do `/readyz` sobre
banco dentro do diretório da aplicação pode ser ignorado de propósito — não há
redeploy substituindo o diretório.

## Auditoria pré-deploy (verificada em set/2026)

- **`GEMINI_MODEL`**: código e testes usam `gemini-3.6-flash` (modelo GA atual).
  O `.env` local tinha `gemini-1.5-flash` (descontinuado — avaliação cairia no
  fallback silenciosamente): **corrigido**; no host, setar o mesmo valor.
- **`ADMIN_PASSWORD`**: já é forte (19 chars, maiúsculas/dígitos/símbolo) — **não**
  é `admin123`. Vai como secret do host, nunca em código/commit.
- **`game.php` na raiz**: não existe (removido); os `.php` restantes são as rotas
  servidas pelo app e a cópia em `evidence/` para os testes.
- **Imagens de desafio**: cada rodada tem imagem própria — não falta a 3ª.
- **Assets limpos**: 15 arquivos mortos removidos (~2,7 MB a menos).
- **Cobertura de teste no estado atual**: `npm test` e
  `npm run test:browser` (as contagens ficam no `AUDIT.md`, que é onde elas
  envelhecem junto com a rodada que as mediu). Nenhum dos dois substitui
  homologação.

## Operação do dia

1. Professor abre o painel da Arena e faz login (`ADMIN_PASSWORD`).
2. Alunos abrem o portal e entram com **código da sala + nome**.
3. Com todos conectados, o professor inicia a rodada; a TV mostra código/QR na
   espera, missão e tempo na rodada, placar no resultado.
4. `/report.php` mostra indicadores, gráficos, ranking e exportação CSV;
   **Reiniciar sala** preserva o histórico no relatório.
5. Antes de cada deploy: `npm run backup-banco`, atualizar a imagem, conferir o
   `/readyz` e, se algo piorar, voltar a imagem anterior e restaurar a cópia.
