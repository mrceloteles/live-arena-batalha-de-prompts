# Abrir o site pelo GitHub

[![Abrir no GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/mrcelobento-code/batalha-de-prompts?quickstart=1)

Clique no botão acima. O GitHub prepara o ambiente, executa os testes, inicia o motor completo e abre automaticamente a porta **3000** com o site.

# Descubra o Prompt — matriz preservada

Matriz privada, independente e auditável do jogo observado em
`reddoor-google26.phygitalapp.com.br`. O objetivo desta base é preservar o
comportamento público observado para que versões pedagógicas futuras partam de
um ponto estável. Ela não é um produto oficial nem afiliado ao Google ou à Red
Door.

## Estado desta base

- Requer **Node.js 24** (usa `node:sqlite` e o executor de testes nativo).
- A captura pública e seus hashes ficam em `evidence/`.
- A lógica equivalente reconstruída fica em `src/`.
- O servidor HTTP, SQLite e os juízes determinístico/Gemini estão integrados.
- As limitações verificadas estão em `AUDIT.md`.
- A correlação entre o pacote-fonte fornecido e a captura pública está documentada em `research/red-door-judge/DEPLOYMENT-CORRELATION-2026-09-03.md`.

## Verificação local

Na raiz do repositório, instale as dependências e configure o ambiente:

```sh
node --version
npm ci
npm test
npm start
```

Use exatamente Node 24.

Copie `.env.example` para `.env` e preencha `ADMIN_PASSWORD` e `ADMIN_SECRET`
para habilitar o painel. O servidor carrega esse arquivo automaticamente.

Para verificar a edição de desafios e as telas em celular, tablet e computador:

```sh
npm run test:browser
```

Esse teste usa o navegador instalado pelo Puppeteer e um banco em memória.

Para ajustar a interface localmente, use `npm run dev`. O servidor reinicia
quando suas fontes mudam; CSS e JavaScript locais são recarregados sem cache.

## Pontuação e tentativas da Arena

Nas salas personalizadas, novas avaliações calculam pontos com o peso de
velocidade escolhido pelo professor. A qualidade continua registrada como
porcentagem separada. Pausas não penalizam o aluno; missões sem prazo ignoram
o peso de velocidade. Os presets Clássico e Turma mantêm o motor original.

Cada aluno envia uma única resposta por missão. Repetir uma solicitação após
falha de conexão recupera o mesmo envio, sem gastar outra tentativa nem avaliar
duas vezes. O relatório preserva as respostas e suas pontuações.
Notas antigas permanecem gravadas; quando não possuem pontos, sua porcentagem
é usada como pontuação. Repetir um envio pendente preserva a mesma tentativa.

## Modos de avaliação

`JUDGE_MODE` decide uma única POLÍTICA DE PROVEDOR, e ela vale para as duas
famílias de avaliação do produto: o **juiz clássico** (percentual único, motor
do pacote-base) e o **juiz por critérios** (nota por critério e feedback, usado
nas missões personalizadas da Arena). Os algoritmos continuam distintos; o que
não muda entre eles é de onde vem a nota.

| Modo | Juiz clássico | Juiz por critérios (Arena) | Sem `GEMINI_API_KEY` | Se o provedor falhar |
| --- | --- | --- | --- | --- |
| `fallback` (padrão) | fórmula histórica local (40% `similar_text` + 60% cobertura de palavras) | heurísticas locais por critério | local, sem tentar rede | local, sem tentar rede |
| `gemini` | adaptador source-compatible do pacote-base (saída numérica, temperatura 0.1, 10 tokens, 8 s) | juiz estruturado por critério (12 s, 1 retentativa) | cai no local e registra o motivo | **estaciona e reprocessa** — nunca nota local |
| `gemini-safe` | juiz estruturado (resposta válida obrigatória) | juiz estruturado por critério | **erro no boot** | **estaciona e reprocessa**; a falha fica explícita no log e no `/readyz` |

Uma falha do provedor não produz nota heurística em nenhum dos dois modos: a
avaliação entra no **pátio** (`src/judge/parking.mjs`), volta sozinha com espera
crescente (4 tentativas) e, até a nota chegar, a submissão aparece no detalhe da
sala no bloco **quem ainda espera nota** — nome, missão, há quanto tempo, o
motivo em português (cota, erro do provedor, fila da instalação) e, o que decide
ação, se a nota **volta sozinha** ou **não** (tentativas esgotadas, sala
encerrada, envio fora da janela de recuperação). O aluno lê "resposta guardada, a
nota será concluída automaticamente". O `/readyz` publica `judge_parking` e avisa quando alguma
avaliação passou do teto de tentativas. A heurística local continua respondendo
por **configuração** (sem chave) e por **regra** (texto ilegível) — casos em que
não há avaliação a pedir ao provedor.

Um reinício (ou um redeploy) não perde essas avaliações, e nem é preciso
reiniciar: a fila vive no banco — submissão sem nota é exatamente "ainda
esperando nota" — e um **vigia** no processo a varre de tempos em tempos
(`JUDGE_PARK_SWEEP_MS`), além da retomada do boot (janela de 24 h, só em salas
vivas). O que já esgotou as 4 tentativas seguidas volta **uma tentativa por
rearme**, depois de um resfriamento (`JUDGE_PARK_REARM_MS`) e até
`JUDGE_PARK_REARMS` vezes — o teto de custo da hora segue por cima, e o teto de
tentativas conta através dos reinícios. O `/readyz` publica `judge_parking_resume`
(o que a última varredura viu) e `judge_parking_watch` (o que a rede já recuperou
— `sweeps`, `recovered`, `rearmed`).

```sh
# Todas as avaliações locais e determinísticas — ideal para ensaio em sala
JUDGE_MODE=fallback npm start

# Reproduz o motor do batalha_prompt.zip no juiz clássico
JUDGE_MODE=gemini GEMINI_API_KEY='sua-chave-no-ambiente' npm start

# Juiz moderno protegido/estruturado para evoluções pedagógicas
JUDGE_MODE=gemini-safe GEMINI_API_KEY='sua-chave-no-ambiente' npm start
```

`JUDGE_MODE=gemini` é o modo indicado quando a prioridade é reproduzir o motor
fornecido no pacote-base. `gemini-safe` é deliberadamente diferente e existe
para versões futuras, sem contaminar a matriz histórica. Modo desconhecido
falha no boot com a lista de modos aceitos — não vira `fallback` em silêncio.

Sem `GEMINI_MODEL`, cada família usa o modelo padrão do próprio adaptador.
Com a variável definida, as duas usam o mesmo modelo. Cada tentativa gravada
carrega os metadados da avaliação (`judge_mode`, `provider`, `model`,
`fallback_used` e o motivo da queda), então o relatório distingue nota vinda do
Gemini de nota local.

Nunca versione `.env` nem chaves reais.

## Painel administrativo

Antes de iniciar o servidor, configure duas variáveis apenas no ambiente:

```sh
export ADMIN_PASSWORD='uma-senha-forte'
export ADMIN_SECRET='um-segredo-aleatorio-com-pelo-menos-24-caracteres'
npm start
```

Abra `/admin.php` para entrar. O relatório usa os cadastros, prompts, notas e
tempos gravados no SQLite. O botão **Iniciar nova batalha** encerra as sessões
ativas, preserva o histórico e abre um novo ciclo limpo com os três desafios.

Nome, e-mail, cargo e empresa são gravados no banco e ficam disponíveis apenas
no relatório administrativo. A migração da versão anterior ocorre
automaticamente ao iniciar, sem apagar partidas ou participantes existentes.

## Hospedagem persistente

O projeto inclui `Dockerfile` e a rota `GET /healthz`. Em qualquer hospedagem
compatível com contêiner, monte um volume persistente em `/data` e configure:

```sh
ADMIN_PASSWORD=uma-senha-forte
ADMIN_SECRET=um-segredo-aleatorio-com-pelo-menos-24-caracteres
DATABASE_PATH=/data/descubra-o-prompt.sqlite
PORT=3000
```

Sem um volume em `/data`, o banco pode desaparecer quando o provedor recriar o
contêiner. O Codespace é adequado para pré-visualização, mas não substitui a
hospedagem permanente.

## Preservação

O primeiro estado funcional integralmente validado está documentado em
`AUDIT.md` e deve permanecer referenciado como `base-original-v1` no repositório
privado. Evoluções pedagógicas devem usar novas branches e tags, sem reescrever
essa base.

Consulte `LICENSE-NOTICE.md` antes de distribuir qualquer arquivo preservado.
