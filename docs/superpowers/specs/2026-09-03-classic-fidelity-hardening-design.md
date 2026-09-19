# Batalha de Prompts — Hardening de Fidelidade do Modo Clássico

## Objetivo

Levar o modo clássico da implementação atual ao máximo de fidelidade comprovável em relação ao site-base `reddoor-google26.phygitalapp.com.br`, usando três fontes de verdade em ordem de autoridade:

1. capturas públicas preservadas em `evidence/original-public/`;
2. pacote-fonte fornecido pelo usuário (`batalha_prompt.zip`), quando seu conteúdo coincide com a captura implantada;
3. comportamento equivalente já validado por testes no repositório.

A regra principal é simples: **nenhuma melhoria pode alterar o comportamento observável do modo clássico sem evidência de que o site-base se comportava assim**.

## Escopo

Este trabalho cobre somente o modo clássico e seus contratos compartilhados inevitáveis:

- 3 jogadores fixos;
- 3 rodadas;
- 60 s por rodada;
- resultado intermediário por 10 s;
- resultado final por 30 s;
- cadastro, espera, instruções, partida, espera por avaliação, resultado e ranking;
- cronômetro e transições;
- `register`, `heartbeat`, `room_status`, `start_match`, `match_status`, `submit_prompt`, `retry_score`, `client_log` e `metrics`;
- motor Gemini histórico e fallback 40/60;
- pontos, percentual, posição, ranking, desempate e arredondamento;
- reload/reconexão;
- retries, timeout, falha de Gemini, envio duplicado e idempotência;
- textos, estados, loaders, modais, mensagens e intervalos públicos observáveis;
- superfícies `index.php`, `main.php`, `wall.php`, `game.php` e `admin.php` onde houver evidência pública.

Não fazem parte deste hardening:

- novas funcionalidades do Modo Turma;
- redesign;
- novas regras pedagógicas;
- troca do modelo histórico por um modelo mais moderno;
- melhorias de segurança que alterem resultado, tempo ou UX do clássico;
- novas mecânicas de pontuação.

## Princípio de separação

O sistema passa a manter três camadas conceituais explícitas:

### 1. Clássico fiel

Objetivo: reproduzir o comportamento-base.

- `JUDGE_MODE=gemini` usa o juiz source-compatible recuperado do pacote-base;
- fallback automático em falha do Gemini reproduz `scorePromptFallback()`;
- nenhuma rubrica moderna ou proteção adicional pode alterar a nota histórica;
- tempos e estados observáveis seguem o contrato original.

### 2. Clássico equivalente robusto

Melhorias internas são permitidas apenas quando não mudam o comportamento observável:

- SQLite mais seguro;
- idempotência;
- SSE como otimização de transporte;
- recuperação de processo;
- auditoria de tentativas;
- validações que não mudem entradas válidas do jogo-base.

### 3. Modos expandidos

Modo Turma, `gemini-safe`, banco de desafios ampliado e futuras versões pedagógicas ficam isolados da matriz clássica.

## Hierarquia de evidência

Toda decisão de fidelidade receberá um estado:

- `IDENTICAL`: byte, hash, valor ou comportamento comprovadamente idêntico;
- `EQUIVALENT`: implementação diferente, mas resultado observável comprovadamente equivalente;
- `INFERRED`: melhor reconstrução disponível, apoiada em evidência parcial;
- `UNKNOWN`: não há dados suficientes para afirmar comportamento.

Nenhum item `INFERRED` ou `UNKNOWN` pode ser descrito como 100% fiel.

## Matriz obrigatória de fidelidade

Será criado um artefato versionado `research/fidelity-matrix.json` e uma visão humana `research/FIDELITY-MATRIX.md`.

Cada item conterá:

- `area`;
- `behavior`;
- `referenceEvidence`;
- `implementationEvidence`;
- `status` (`IDENTICAL`, `EQUIVALENT`, `INFERRED`, `UNKNOWN`);
- `test`;
- `knownDifference`;
- `decision`.

Áreas mínimas:

1. rotas e páginas;
2. assets públicos;
3. contratos da API;
4. cadastro;
5. sincronização/heartbeat;
6. máquina de estados;
7. temporização;
8. submissão;
9. julgamento Gemini;
10. fallback;
11. retries;
12. pontuação;
13. ranking de rodada;
14. ranking final;
15. desempate;
16. reload/reconexão;
17. timeout;
18. mensagens e modais;
19. painel coletivo;
20. painel do jogador;
21. administração observável;
22. falhas e recuperação.

## Motor de avaliação

### Gemini histórico

O modo clássico deve preservar o comportamento recuperado do pacote-base:

- modelo: `gemini-2.0-flash`;
- temperatura: `0.1`;
- `maxOutputTokens = 10`;
- timeout de 8 s;
- prompt histórico que compara `Prompt Original` e `Prompt do Jogador` por sujeito, estilo, iluminação, ambiente, câmera e detalhes;
- saída numérica de 0–100;
- primeiro decimal positivo parseável;
- arredondamento a 4 casas;
- falha, timeout, HTTP não-200, vazio ou resposta inválida caem automaticamente no fallback.

`gemini-safe` continua disponível, porém nunca é usado como evidência de fidelidade histórica.

### Fallback histórico

O fallback clássico deve permanecer equivalente ao PHP recuperado:

- `trim` + lowercase;
- vazio = 0;
- similaridade textual compatível com `similar_text()`;
- palavras únicas > 2 caracteres;
- match exato ou substring bilateral;
- `40% similar_text + 60% keyword coverage`;
- não vazio limitado a `[5.0, 98.5]`;
- 4 casas decimais.

As três fixtures preservadas do SQLite do pacote permanecem regressão obrigatória.

## Pontos e ranking

O hardening deve distinguir explicitamente três valores:

- `percent`: precisão do juiz;
- `points`: valor derivado usado na ordenação;
- `elapsed_seconds`: tempo usado apenas conforme o critério comprovado de desempate.

Nenhum bônus de velocidade pode ser introduzido sem evidência do site-base.

A ordenação clássica deve ser congelada por testes de cenários de empate, incluindo:

- pontos diferentes;
- pontos iguais e percentual diferente;
- pontos/percentual iguais e tempo diferente;
- empate integral.

A representação pública de percentual deve preservar 4 casas quando a interface original as exibe.

## Máquina de estados e temporização

O relógio do servidor continua autoritativo, mas a experiência observável deve reproduzir o original.

Valores clássicos obrigatórios:

- jogadores: 3;
- rodadas: 3;
- rodada: 60 s;
- resultado intermediário: 10 s;
- resultado final: 30 s;
- heartbeat observado: 2500 ms;
- cronômetro local observado: 250 ms;
- polling/status observado: aproximadamente 1 s nas telas relevantes;
- Gemini/retry pode aguardar até o comportamento público preservado no cliente.

SSE pode reduzir latência internamente, mas não pode pular telas, encurtar fases, mudar mensagens nem criar resultados antes do estado equivalente.

## API e estados públicos

Os testes devem congelar nomes e semântica dos campos usados pelo JavaScript original, com atenção especial a:

- `server_now`;
- `reset_at`;
- `match.id`;
- `round_number`;
- `total_rounds`;
- `deadline_at`;
- `started_at`;
- `submitted_at`;
- `scored_at`;
- `user_prompt`;
- `percent`;
- `points`;
- `submitted`;
- `scored`;
- `status`;
- `gemini_status`;
- `round_ranking`;
- `final_ranking`.

Campos extras internos são permitidos se não interferirem no JavaScript/UX clássico.

## Frontend e mensagens

HTML/CSS/JS preservados da captura pública são a referência primária.

A auditoria fina deve comparar:

- ordem das telas;
- textos visíveis;
- labels dos botões;
- estados disabled/loading;
- mensagens de Gemini lento;
- modal de rede instável;
- tela de espera dos outros jogadores;
- tela de resultado;
- ranking;
- formatação de percentual;
- duração das fases;
- comportamento após F5;
- transição após reset.

Diferenças de marca autorizadas anteriormente podem permanecer intencionais, mas devem ser declaradas na matriz.

## Falhas e recuperação

Para o modo clássico:

- envio duplicado com o mesmo token nunca duplica pontos;
- um prompt diferente não pode substituir uma submissão já aceita;
- F5 recupera sessão e estado;
- falha Gemini não quebra a rodada: aplica fallback histórico;
- timeout do jogador produz o mesmo resultado observável definido pela evidência-base;
- restart do processo não perde estado oficial;
- um retry não recalcula uma nota já finalizada;
- fases expiradas não bloqueiam indefinidamente a sala.

Melhorias internas devem preservar esses resultados.

## Estratégia de testes

Todo ajuste segue TDD:

1. selecionar uma diferença comprovada;
2. adicionar fixture/evidência;
3. escrever teste que falha na implementação atual;
4. executar e confirmar a falha esperada;
5. fazer a menor alteração possível;
6. executar teste específico;
7. executar regressão completa;
8. atualizar a matriz de fidelidade;
9. commit pequeno e rastreável.

Categorias de teste:

- source-package fixtures;
- contratos de API;
- state-machine;
- timers com relógio controlado;
- ranking/empates;
- judge/fallback;
- idempotência;
- reconexão;
- snapshots de HTML/texto;
- hashes/manifestos de assets;
- E2E clássico 3 × 3 rodadas;
- falhas Gemini;
- deadline/timeout.

## Critério de conclusão

O modo clássico só será declarado "fiel dentro do que é observável" quando:

- nenhum item crítico da matriz estiver `UNKNOWN` quando houver evidência disponível;
- nenhum item crítico estiver `INFERRED` se puder ser convertido em `IDENTICAL`/`EQUIVALENT` com os artefatos existentes;
- todos os contratos públicos usados pelo `app.js` estiverem cobertos por teste;
- fallback histórico estiver reproduzido exatamente nas fixtures;
- modo Gemini clássico usar o contrato source-compatible;
- temporização clássica estiver congelada por testes;
- ranking e desempate estiverem congelados por testes;
- fluxo 3 jogadores × 3 rodadas passar integralmente;
- nenhuma melhoria do Modo Turma alterar os testes do clássico;
- toda diferença intencional restante estiver documentada.

## Regra de comunicação de fidelidade

Não usar percentuais vagos como "98%" ou "99%" como substituto de evidência.

O relatório final deve informar:

- quantidade de itens `IDENTICAL`;
- quantidade de itens `EQUIVALENT`;
- quantidade de itens `INFERRED`;
- quantidade de itens `UNKNOWN`;
- diferenças intencionais;
- limitações de observação do backend original.

A meta não é dizer "100%". A meta é fazer com que **tudo que pode ser provado esteja provado, e tudo que não pode ser provado esteja explicitamente marcado**.
