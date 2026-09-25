# Auditoria humana e correção — rodada 1 (19/09/2026)

Teste pelo navegador, como professor e alunos de verdade, contra o servidor local
deste checkout (`http://127.0.0.1:3000`, `JUDGE_MODE=gemini`, banco real
`var/descubra-o-prompt.sqlite`). Nada aqui foi executado pela API no lugar de um
controle da tela: se um botão não existe, ele não existe — isso é o resultado.

## 1. Estado encontrado (preparação)

| Item | Valor conferido |
| --- | --- |
| Git | `master`, HEAD `0a3eab4`, 3 commits de hoje (08:15–08:23). Área de trabalho limpa: o redesign está **versionado** nesses commits |
| Banco local | `var/descubra-o-prompt.sqlite` — 45 salas, 54 participantes, 98 desafios, 115 rodadas, 55 envios, 55 notas |
| Backup | `var/backups/descubra-o-prompt-2026-09-19T17-17-12.sqlite` (696 KB, `integrity_check ok`, contagens iguais) — feito **antes** de qualquer escrita |
| Config efetiva | `JUDGE_MODE=gemini`, `GEMINI_MODEL=gemini-3.6-flash`, `NODE_ENV=development`, `PORT=3000` |
| Produção | `/readyz` responde `ok`, `judge: gemini-safe`, banco `ready`, fila vazia (`parked 0`, `spent_last_hour 0`), vigia ativo (165 varreduras) |

## 2. BLOQUEIO EXTERNO — a credencial do juiz está recusada

Sonda direta ao provedor com a chave deste checkout (`tmp/auditoria/sonda-classico.mjs`,
2 chamadas, sem imprimir a chave), reproduzindo o corpo exato do adaptador clássico:

```
http 403 em 576 ms  {"code":403,"status":"PERMISSION_DENIED",
                     "message":"Your project has been denied access. Please contact support."}
```

A mesma recusa acontece **com e sem** o teto de saída de 10 tokens. Consequência:
**não é possível validar a família Gemini neste checkout** — nem a falha relatada,
nem a correção dela. Isso gaveta as prioridades 2, 3 e 6 do plano (§11) e o cenário
de 30 alunos. O teste de percurso humano abaixo rodou com o juiz já recusado, e o
que ele mediu é justamente o comportamento do produto diante disso.

## 3. Defeitos

### D1 — Professor não conseguia iniciar com três alunos · **CORRIGIDO**

Passos para reproduzir (todos pelo navegador, `tmp/auditoria/repro-inicio.mjs`):

1. entrar em `/admin-arena.php`;
2. **+ Nova sala** e preencher **só o título** — o formulário entrega `Modo: Turma` e
   `Participantes: 35` por padrão;
3. criar a sala, publicar e deixar três alunos entrarem pelo código;
4. procurar o botão de iniciar.

Resultado observado **antes**: o cartão da sala na lista não trazia botão de iniciar
(`can_start=false` pela API) e nada na tela explicava o motivo; no detalhe o botão
aparecia **desabilitado** (`▶ Iniciar batalha`, `disabled`), com "Aguardando
jogadores... 3 / 35". Nenhuma requisição era enviada ao clicar.

Causa comprovada — duas pontas liam **capacidade** como **quantidade obrigatória**:

- `src/server/arena-api.mjs`, `arena_admin_status`: marcava `can_start` só quando
  `ativos === capacidade`, em **qualquer** sala de regras clássicas;
- `public/assets/js/arena.js`, detalhe da sala: desabilitava o início pela mesma conta.

A ação `arena_start_round` **sempre** olhou a bandeira certa — `rosterLocksAtStart`.
Ela é `true` no preset Clássico (3 lugares fixos) e **`false` no preset Turma**, que é
clássico no juiz e **livre na entrada**. A tela estava mais exigente que o servidor.
Confirmado no banco: a sala QA nasceu `preset=turma`, `judgeKind=classic`,
`rosterLocksAtStart=false`, `maxPlayers=35`.

Correção (mínima): as duas pontas passaram a usar a regra que o servidor já usava.
O preset Clássico continua esperando os 3 lugares fixos.

Prova (depois da correção, mesmo percurso, `tmp/auditoria/aula-1.mjs`):

- a lista passa a oferecer `Iniciar batalha`, habilitado, com "3 DE 35 LUGARES";
- o clique responde `arena_start_round` **HTTP 200, ok:true**;
- o cartão vira **"Em jogo"** e os **três alunos** recebem `RODADA 01/03`, a missão,
  o cronômetro (0:53 / 0:50 / 0:48) e o campo de resposta — 3 de 3;
- zero erro de console nas quatro sessões.

Regressão: `test/api/arena-inicio.test.mjs` (3 testes). **Vermelho sem a correção**
(verificado restaurando a cláusula antiga: "a turma presente basta para começar" falha),
verde com ela.

### D2 — O motivo da falha da aula relatada aparecia como "não catalogado" · **CORRIGIDO**

O painel dizia `motivo não catalogado (gemini_http_403)` e `motivo não catalogado
(gemini_invalid_numeric_output)` — o professor lia o código cru **justamente na falha
que precisava dele para entender a fila**, e o `README` promete o motivo em português.
O catálogo de rótulos (`public/assets/js/arena.js`) tinha 429 e 5xx, e não tinha a
família 4xx nem a saída numérica inválida. Entraram: `provedor respondeu sem número`
e `acesso recusado pelo provedor`.

### D3 — Capacidade escrita como se fosse número de participantes · **CORRIGIDO**

O formulário rotulava o campo de **Participantes** e o cartão dizia `3 DE 35 ALUNOS`.
Nas duas frases, 35 lê-se como quantidade de gente exigida. Agora o campo diz
**Lugares** e o cartão diz **3 DE 35 LUGARES**, a mesma palavra que o detalhe já usava.
Troca de palavra, sem texto novo (o orçamento de cópia segue verde).

### D4 — Notas zeradas sem procedência · **NÃO CORRIGIDO** (próxima prioridade)

Achado no banco real, não em tese: **17 notas** com `judge_status='timeout'`,
`percent=0`, `points=0` e feedback literal *"Tempo encerrado sem envio. Pontuação
zerada nesta missão."* — a **ausência de envio** vira uma nota 0% gravada, sem
procedência de juiz. Falta decidir, com a tela na frente, se o relatório distingue
essa linha de um zero real, de um timeout de tempo e de uma avaliação pendente.

### D5 — `gemini_invalid_numeric_output` (a falha de pontuação da aula) · **CORRIGIDO em parte** (rodada 2)

Vide §7: a forma da resposta foi reproduzida **offline** e o defeito tinha **duas**
caras — uma alta (a pendência relatada) e uma **silenciosa** (nota 0 falsa com
procedência `gemini`), que o plano não previa. A leitura foi corrigida, com teste
de regressão vermelho sem ela. O **teto de saída de 10 tokens não foi mexido** e
segue como hipótese declarada — ver §7.3.

### D6 — Este banco nunca avaliou um envio com o provedor (rodada 2)

Nenhuma das 55 notas tem procedência de provedor: **20** são `source-fallback-v1`
(heurística local do adaptador clássico), **18** são `arena-fallback-v1` (heurística
do juiz por critérios) e **17** são zeros `timeout` sem modelo. As únicas tentativas
`failed` são **11 linhas na mesma submissão**, todas com o motivo
`O provedor nao entregou a avaliacao (gemini_http_403)` — a credencial recusada da
§2, não saída inválida. E `gemini_invalid_numeric_output` **não ocorre uma vez
sequer** neste banco: as quatro avaliações pendentes do relato são de produção.

Consequência honesta: a falha da aula **não foi reproduzida por ocorrência local**
— foi reproduzida por **forma** (§8.1), que é o que se pode fazer sem provedor.

## 4. Matriz do que foi exercitado nesta rodada

| Tela / ação | Estado |
| --- | --- |
| Login do professor, sessão, painel | **Aprovado** (4 sessões independentes, zero erro de console) |
| Criar sala (formulário padrão), código visível | **Aprovado** |
| Entrada do aluno por código, 3 contextos separados | **Aprovado** (3/3) |
| Iniciar batalha pela lista | **Aprovado** (era o defeito D1) |
| Aluno recebe missão, cronômetro e campo | **Aprovado** (3/3) |
| Envio do aluno | **Aprovado** — resposta guardada, sem nota inventada |
| Fila do professor com motivo legível | **Reprovado** (D2) → corrigido |
| Pontuação pelo Gemini | **Não testado** (bloqueio da §2) |
| Leitura da nota do provedor (formas de resposta) | **Aprovado** por forma — §7.1 |
| Nota falsa a partir de prosa ambígua | **Reprovado** (D5) → corrigido |
| Banco local: alguma nota do provedor | **Reprovado** (D6) — nenhuma, só heurística local |
| Rodadas 2–3, resultado final, reutilização da sala | **Não testado** |
| TV simultânea, reconexão | **Não testado** |
| 30 alunos / 90 envios | **Não testado** |

## 5. O que o envio com o juiz recusado ensinou

Com o provedor respondendo 403, o aluno leu **"Resposta guardada. O juiz está
indisponível agora: a nota será concluída automaticamente."** e o painel mostrou
**"1 envio ainda sem nota · a nota de todos eles chega sozinha — não é preciso
reenviar"**, com o motivo e o estado da retomada. O produto **não inventou nota**
— o que é o comportamento correto e é a razão de D2 doer tanto: o mecanismo de
recuperação funciona, e o texto é que entregava o código cru no lugar do motivo.

## 6. Provas

- `npm test` → **516 testes**, 515 passam, 1 pulado, **0 falhas**;
- `npm run test:browser` → **28/28** (rodada 2: `tmp/auditoria/navegador.log`);
- orçamento de cópia → **verde**, sem exceção escrita;
- capturas: `tmp/auditoria/capturas/` (formulário, sala criada, 3 alunos, detalhe,
  lista com o botão, aluna com a missão, depois do envio, painel);
- relatórios crus: `tmp/auditoria/repro-inicio.json`, `repro-iniciar.json`, `aula-1.json`.

Alterados: `src/server/arena-api.mjs`, `public/assets/js/arena.js` e o novo
`test/api/arena-inicio.test.mjs`. **Nada commitado.**

## 7. Rodada 2 — o juiz clássico, medido por forma

### 7.1 O laboratório de formas (`tmp/auditoria/falhas-juiz.mjs`)

Alimenta os **dois** adaptadores da família clássica com as formas plausíveis de
resposta do provedor, com `fetchImpl` local: **zero chamadas externas, zero cota**.
Resultado que importa:

| Forma da resposta | `gemini` (teto de 10) | `gemini-safe` (produção) |
| --- | --- | --- |
| Só o número `78.5` | 78.5 ✔ | JSON é forçado por schema, então esta forma não ocorre |
| Raciocínio em `parts[0]`, resposta depois | **0 pts** ✘ | pendência (alta) ✔ |
| Prosa que cita a escala antes do número | **0 pts** ✘ | pendência (alta) ✔ |
| Parte sem texto antes da resposta | pendência | pendência ✔ |
| Saída vazia / cortada | `gemini_invalid_numeric_output` | pendência ✔ |
| Prosa com um único número | número ✔ | pendência |

Duas leituras disto, e as duas importam:

1. **O motivo relatado tem mecanismo reproduzível**: `gemini_invalid_numeric_output`
sai quando não há texto utilizável em `parts[0]` — saída vazia/cortada, ou uma parte
que não é texto na frente.
2. **Há um defeito pior que o relatado.** Nas formas 2 e 3 o adaptador clássico
**não falha: ele acerta um zero**. `percent=0`, `provider=gemini`, sem fallback
marcado — indistinguível de um zero real no painel, no relatório e na TV. Essa é a
**terceira** origem de zeros do produto, além do timeout e da ausência de envio, e
nenhuma tela pode desconfiar dela. O modo `gemini-safe`, hoje em produção, **não a
tem**: toda forma estranha vira pendência alta.

### 7.2 A correção

`parsePercent` (em `src/judge/source-compatible-judge.mjs`) passou a aceitar só
apresentação **inequívoca**: um número sozinho em qualquer parte de texto (com ou
sem cerca de código, `78,5` inclusive) ou **um único** número no texto. Texto com
vários números não vira nota — vira pendência, que é alta e reprocessável, em vez
de nota inventada, que é silenciosa e definitiva. Efeito: as formas 2 e 3 passam de
zero falso para **78.5 correto**; a prosa ambígua passa de zero falso para pendência;
nada que hoje acerta passou a errar.

Regressão em `test/judge/source-compatible-judge.test.mjs` (3 testes novos).
**Vermelho sem a correção**: restaurando a leitura antiga, 2 dos 3 falham (o terceiro
é guarda de não-regressão e passa nos dois estados, de propósito).

### 7.3 O que NÃO foi mexido, e por quê

`maxOutputTokens: 10` continua. Ele é uma **trava de fidelidade** com o pacote-base
— `test/judge/source-compatible-judge.test.mjs` e `test/judge/configuration.test.mjs`
fixam o valor, e `test/research-*` fixa os candidatos de pesquisa — e a tese de que
um modelo de raciocínio gaste o orçamento antes de escrever o número **não pôde ser
medida**: a credencial deste checkout responde 403 e o banco local não guarda payload
de provedor (D6, e o `response_json` gravado é o **resultado local**, não a resposta
do Gemini). Mexer num número travado por fidelidade com base em hipótese não medida
seria trocar um defeito silencioso por outro. Fica declarado como a próxima medição
a fazer em homologação, com uma chamada real e uma chave que responda.

## 8. Limpeza pendente

As salas de teste desta rodada ficaram no banco local, com nome `QA AUDITORIA …`
(3 salas), mais os desafios que nascem com cada sala clássica. Foram criadas para
teste, não são aulas reais, e serão removidas ao fim da auditoria.
