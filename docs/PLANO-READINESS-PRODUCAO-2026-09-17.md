# Auditoria e plano de prontidão para produção

**Data:** 17/09/2026

**Projeto auditado:** `C:/Users/Marcelo/Downloads/live-arena-identidade-ajustada/batalha-de-prompts-main`
**Parecer:** **não publicar para uso real ainda**. Há defeitos de integridade e privacidade reproduzidos em código/validação anterior, lacunas específicas na hospedagem recomendada e nenhuma prova de restauração ou carga de turma realista. As suítes passam, mas não cobrem esses riscos operacionais.

Este documento complementa `docs/PLANO-MELHORIAS-FULLSTACK-2026-09-17.md`. Itens M07, M09 e M10 tiveram correções desde a auditoria inicial e são descritos abaixo pelo estado atual, para não repetir trabalho já concluído.

## O que foi verificado nesta varredura

| Verificação | Resultado | Limite |
|---|---|---|
| Testes funcionais/API/domínio/persistência | 397 passaram, zero falhas (`npm test`) | Testes unitários não substituem homologação |
| Navegador | Execução completa: 23 aprovados, 1 timeout de navegação (283 s); repetição isolada do mesmo caso passou em 3,2 s | Falha parece instabilidade sob suíte longa, mas o gate completo não ficou verde; investigar antes de confiar no CI |
| Dependências de produção | `npm audit --omit=dev`: zero vulnerabilidades reportadas | Não cobre código próprio, dependências de desenvolvimento ou falhas desconhecidas |
| Segredo `.env` | Não rastreado pelo Git e ignorado | Ainda é preciso cadastrar segredos corretos no ambiente de hospedagem |
| Juízes | `src/judge/configuration.mjs` deriva os dois juízes de `JUDGE_MODE`; fallback impede rede; modos inválidos falham | Timeout do cliente e concorrência/custo de chamadas Gemini seguem em aberto |
| SSE e renderização ao vivo | Escopo autorizado por sala, coalescimento, descarte de respostas antigas e preservação de foco/estado já aparecem no código e nos testes | Hub, filas e limites são locais ao processo; não cobrem várias instâncias |
| Git/implantação | Branch local `master`, sem remote configurado; há arquivos locais não rastreados (`arena/`, `output/`, `start-port3000.cmd`) | Repositório novo e destino de deploy ainda não foram definidos |
| Contexto Docker | `output/` e `arena/` não estão no `.dockerignore`; juntos têm aproximadamente 89 MB e o Dockerfile copia todo o contexto | Docker não está disponível nesta máquina; build de imagem não foi executado |

## Bloqueadores confirmados

### P0 — corrigir antes de guardar dados reais de alunos

1. **Votos de participantes diferentes podem sobrescrever estado compartilhado.** Em `src/server/arena-api.mjs`, a fila local usa `vote:${payload.room_id || payload.participant_id}`. O cliente vota autenticado por participante e não precisa enviar `room_id`; participantes diferentes entram em filas diferentes apesar de escreverem o mesmo JSON da sala. Leituras e gravações concorrentes podem perder votos. A fila em memória também não protege dois processos.
2. **Fechar a mesma dinâmica mais de uma vez aplica efeitos repetidos.** `src/domain/arena-mode.mjs::settleDynamic` acrescenta ataque/energia mesmo se `dynamic.revealed_at` já estiver preenchido; a ação `arena_mode_dynamic_close` não a torna idempotente. Um clique repetido ou dois professores podem alterar vida, energia e histórico novamente.
3. **PIN e nome permitem reativar a identidade antiga do aluno.** `arena_join` reativa o registro inativo encontrado pelo nome, emite token novo e mantém perfil/histórico. O PIN da sala e o nome não provam que a pessoa é o titular. O risco fica material quando o relatório guarda e-mail, empresa ou outros dados pessoais.
4. **Exportação CSV permite conteúdo interpretável como fórmula.** `public/assets/js/app.js::csvEscape` apenas duplica aspas e põe aspas em volta do texto. Isso não neutraliza valores que começam com `=`, `+`, `-` ou `@` em planilhas. Campos de aluno e prompts podem ir ao CSV do relatório administrativo.

### P1 — corrigir para o perfil público descrito na documentação

5. **Limitador de tentativas usa o IP do socket, não necessariamente o visitante.** `src/server/http.mjs` passa `request.socket.remoteAddress`; atrás de Caddy/Render, vários usuários podem compartilhar o IP do proxy. O limitador de senha, PIN e código de projeção pode bloquear a turma inteira após tentativas de uma única origem. Configuração atual de proxy confiável e leitura segura de IP real não foi verificada.
6. **O caminho Turso recomendado ainda não tem prova de integridade no serviço real.** `src/db/database.mjs::wrapRemoteDatabase` liga `PRAGMA foreign_keys` depois de abrir a transação. No SQLite isso não ativa FKs dentro de uma transação já aberta. `test/db/remote-adapter.test.mjs` só verifica a ordem de chamadas num cliente simulado. A auditoria anterior reproduziu o problema com o cliente libSQL real e backend local: PRAGMA permaneceu desligado e referência órfã foi aceita. Não anunciar Turso como seguro até validar numa base descartável real ou substituir a garantia por invariantes transacionais comprovadas.
7. **Desligamento pode ficar preso por streams SSE ativos.** `src/server/start.mjs` trata SIGTERM/SIGINT com `server.close()` e só fecha o banco no callback. `src/server/events.mjs` não expõe um fechamento global/drain para o hub. O plano de deploy exige processo contínuo; reinício ou atualização pode esperar até o host forçar o encerramento e interromper operações em curso.
8. **Sem evidência de restauração, logs operacionais ou limite de chamadas Gemini.** A documentação fala em backup, mas não há exercício de restauração verificado. Erros internos viram 500 genérico sem log correlacionável. A nota do juiz por critérios pode levar mais que o timeout de 12 s do cliente ao repetir uma tentativa externa; várias avaliações simultâneas não têm teto global. Para uso com Gemini, há risco de resposta tardia, cota e custo sem controlo operacional suficiente.
9. **Não há carga representativa validada para a hospedagem remota.** A medição já registrada encontrou 44/56 chamadas `prepare` por leitura do lobby e respostas que podem incluir imagem base64 grande. Nenhum teste de 35–50 alunos mediu latência p95, bytes transferidos ou banco remoto. Essa é a escala de sala indicada pela própria documentação, portanto precisa de homologação antes da primeira aula pública.

### P2 — importante para um deploy repetível

10. **Configuração inválida do painel pode parecer saudável.** `createAdminAuth` desabilita o login se senha/segredo forem curtos/ausentes, mas o servidor ainda sobe e `/healthz` responde `200` verificando apenas o banco. O host pode marcar uma implantação sem painel como pronta.
11. **O projeto ainda não está conectado ao novo remote.** `git remote -v` não retorna remote; portanto não há envio/CI/deploy contínuo a validar. O branch atual é `master`; o nome da branch padrão do novo repositório ainda precisa ser escolhido e o workflow executado nele.
12. **Build Docker leva artefatos locais desnecessários.** `.dockerignore` não exclui `output/` nem `arena/`; `Dockerfile` usa `COPY . .`. O inventário mediu aproximadamente 89 MB não ignorados nesses diretórios. O build precisa copiar apenas manifestos, `src/`, `public/` e outros arquivos realmente usados, ou ao menos excluir artefatos locais.
13. **Instância única é uma premissa oculta.** SSE, limitadores de tentativa e filas de serialização vivem na memória do processo. Duas instâncias não compartilham esses estados. Até existir broker/limites compartilhados e testes entre instâncias, documentar e configurar uma única instância por instalação.

## Estado já corrigido e validado por código/testes

- `JUDGE_MODE` agora determina uma política comum para juiz clássico e juiz por critérios. `fallback` não chama Gemini mesmo com chave configurada; modos e falhas têm testes em `test/judge/configuration.test.mjs`.
- Eventos SSE são escopados por sala autorizada em `src/server/events-scope.mjs` e `src/server/events.mjs`; credenciais são revalidadas; conexões inválidas são revogadas.
- O cliente limita consultas em voo, coalesce rajadas, pausa/retoma atualizações por visibilidade e evita respostas de sala antiga. O painel só renderiza mudança relevante e preserva controles/foco; testes em `test/browser/atualizacoes-ao-vivo.test.mjs`, `test/browser/painel-controles.test.mjs` e `test/browser/stream-por-sala.test.mjs`.
- Dependências de produção passaram `npm audit --omit=dev` nesta data.

## Plano de correção por etapas

### Etapa 1 — Integridade de jogo e privacidade (obrigatória)

Arquivos principais: `src/server/arena-api.mjs`, `src/domain/arena-mode.mjs`, `src/db/repositories/arena.mjs`, `src/db/schema.sql`, `test/api/arena-mode-api.test.mjs`, `test/domain/arena-mode.test.mjs`, `test/api/arena-api.test.mjs`.

- [x] Fazer todas as mutações do estado coletivo usarem a chave canônica da sala, resolvida da sessão autenticada do participante no servidor. No mínimo cobrir votos, poderes, revelar/fechar dinâmica, reset e controles do professor.
- [x] Tornar gravação do estado coletivo atômica contra dois despachantes/processos: transação com lock apropriado, controle de versão com compare-and-swap ou tabela normalizada com unicidade por dinâmica/participante. A fila em memória pode continuar como otimização, não como garantia de integridade.
- [x] Tornar fechamento idempotente por ID da dinâmica: segundo pedido devolve o resultado previamente gravado ou conflito sem aplicar dano/energia novamente. Garantir que o resultado e os efeitos persistam atomicamente.
- [x] Separar “novo participante” de “recuperar identidade”. Nome+PIN não pode emitir token para um registro antigo nem preservar e-mail/consentimento/histórico. Exigir token ainda válido ou fluxo administrativo de recuperação; invalidar sessão removida.
  Caminho escolhido: a reentrada vira participante **novo** (o registro antigo é arquivado como `Nome (saiu)`, com o histórico dele). Não existe controle de "reabrir entrada" no painel, então bloquear deixaria o aluno removido sem volta.
- [x] Neutralizar injeção CSV na exportação de dados e no caminho baseado em tabela/DOM. Cobrir `=`, `+`, `-`, `@`, tabulação, CR/LF, aspas e separador; verificar arquivos produzidos em Excel/LibreOffice se esses leitores forem suportados.
- [x] Testes de concorrência devem usar barreiras para forçar sobreposição e incluir dois handlers sobre o mesmo banco. Repetir a segunda chamada de fechamento e comparar o estado inteiro antes/depois.
  Feito: dois despachantes sobre o mesmo banco (`test/api/arena-mode-cas.test.mjs`), com a interferência de um "outro processo" determinística entre a leitura e a gravação, e a segunda chamada de fechamento comparada com o estado de um fechamento só. `test/web/estado-coletivo-cas.test.mjs` impede que a gravação cega volte.

**Aceite:** votos concorrentes não somem; fechamento repetido não altera novamente estado; PIN+nome não recupera dado pessoal antigo; CSV não interpreta entradas de aluno como fórmula.

### Etapa 2 — Definir e validar o ambiente de hospedagem

Arquivos principais: `DEPLOYMENT.md`, `.env.example`, `src/server/start.mjs`, `src/server/http.mjs`, `src/server/rate-limit.mjs`, `src/server/admin-auth.mjs`, `src/db/database.mjs`, `test/smoke/`, `test/db/remote-adapter.test.mjs`.

- [x] Escolher explicitamente um perfil: (a) contêiner + volume persistente + SQLite local, ou (b) contêiner efêmero + serviço libSQL/Turso validado. Registrar domínio, proxy, número de instâncias, limites de CPU/memória e procedimento de rollback.
  Feito: **perfil (a)**, decidido em `src/server/hosting.mjs` e exposto no `/readyz` (`hosting: "volume-persistente"`). Instâncias = 1, banco em volume, porta/proxy/TLS, CPU/memória, disco e o procedimento de rollback (backup + imagem anterior) estão no `DEPLOYMENT.md`. O perfil (b) fica disponível, mas **trancado** (item abaixo).
- [x] Em `NODE_ENV=production`, validar no boot senha e segredo administrativos; falhar cedo com mensagem sem valor secreto se ausentes/inválidos. Não aceitar que `/healthz` esconda painel desabilitado.
  Feito: `assertDeployable` derruba o boot antes de abrir o banco; `/healthz` (processo) e `/readyz` (tráfego) são perguntas separadas, e a prontidão devolve `database`, `config`, `judge`, `hosting`, `draining` e os problemas em 503 — sem valor secreto na resposta.
- [x] Definir proxy confiável. Usar cabeçalhos de IP encaminhado só se a conexão imediata estiver numa lista de proxies confiáveis; não confiar em `X-Forwarded-For` arbitrário. Cobrir lockout por IP compartilhado e cabeçalho falsificado.
  Feito: `TRUSTED_PROXIES` em `src/server/environment.mjs` (endereço exato ou faixa IPv4; nome de host é recusado no boot), lido da direita para a esquerda, e o cabeçalho forjado à esquerda do proxy é ignorado — com caso de teste.
- [ ] Para Turso: testar integração com base descartável real usando a versão e região de produção; verificar referência órfã rejeitada, rollback, exclusão em cascata/restrita conforme schema, migração e `foreign_key_check`. Se FKs não forem oferecidas no modo usado, criar invariantes equivalentes e teste real antes do deploy.
  **Em parte.** A ferramenta (`npm run validar-integridade`) e a trava de boot estão prontas e provadas contra o cliente libSQL real num `file:` (órfão recusado pelo banco, órfãos existentes detectados, backend que aceita órfão reprovado); falta a execução no serviço real do provedor, que exige credencial de quem hospeda. Enquanto isso, produção recusa `TURSO_URL` sem `TURSO_INTEGRITY_VERIFIED=1`.
- [x] Implementar encerramento gracioso com ordem definida: retirar readiness, deixar de aceitar novas operações, encerrar/revogar SSE, aguardar operações até prazo menor que o timeout do host, cancelar chamadas Gemini restantes, fechar banco e sair. Adicionar teste de processo com SIGTERM, streams e avaliação pendente.
  Feito: `src/server/lifecycle.mjs` na ordem do plano (drenagem → recusa → cancelamento externo → revogação dos streams → espera com prazo → fechamento do banco). O cancelamento chega aos quatro adaptadores de juiz por um `AbortController`; `test/smoke/shutdown.test.mjs` sobe a entrada de produção em outro processo, com stream aberto, e exige que ela saia sozinha com código 0. O caso de `SIGTERM` de verdade é pulado no Windows (o sinal não é entregue) e roda no CI Linux.
- [x] Fazer healthcheck/readiness distinguir processo ativo, banco conectado, configuração de produção válida e modo do juiz; não retornar segredos nem detalhes internos.
  Feito: as quatro perguntas no `/readyz`, mais `hosting`/`draining` e avisos que não bloqueiam (banco dentro do diretório da aplicação).
- [x] Resolver e testar backup/restore: backup consistente do backend escolhido, retenção e local separado do servidor, restauração em banco isolado, validação de contagens e integridade, tempo medido. Só declarar política de backup depois desse exercício.
  Feito: `npm run backup-banco` / `conferir` / `npm run restaurar-banco` com `VACUUM INTO`, conferência de `integrity_check` nos dois lados e comparação das contagens das seis tabelas do produto; recusam sobrescrever sem pedido explícito e recusam cópia doente. Exercitado de ponta a ponta (`test/db/backup.test.mjs` + execução real dos três comandos). **Em parte:** a cópia para fora da máquina é operação de quem hospeda — está escrita no `DEPLOYMENT.md` como procedimento, não como cumprida.
- [x] Adicionar logs estruturados de falhas com request ID, ação, sala quando segura, classe/status e duração. Redigir senha, token, chave Gemini, e-mail, nome e prompt. Criar teste que inspecione log de erro para ausência desses dados.
  Feito: `src/server/log.mjs` + `x-request-id`, com o mesmo id no cabeçalho e na linha. A sala entra resolvida pela sessão (nunca do payload), a causa do erro é anexada em vez de descartada, e o teste faz uma submissão de verdade falhar para conferir que nome, e-mail, prompt, PIN e token não aparecem em nenhuma linha.

**Aceite:** tipicamente cumprido com três limites declarados — Turso não validado ao vivo, `SIGTERM` real só em POSIX e a cópia do backup para fora da máquina como procedimento do operador. Ver a revisão de 17/09 no `AUDIT.md`.

### Etapa 3 — Serviço de avaliação e capacidade

Arquivos principais: `src/judge/configuration.mjs`, adaptadores em `src/judge/`, `src/server/http.mjs`, `src/server/arena-api.mjs`, `public/assets/js/arena.js`, `test/judge/`, `test/browser/atualizacoes-ao-vivo.test.mjs`, `DEPLOYMENT.md`.

- [x] Definir o SLA de envio do aluno. O cliente não deve anunciar falha definitiva se o servidor continua julgando; usar resposta pendente com ID de tentativa e consulta de estado, ou alinhar timeout externo ao máximo de timeout/retry do adaptador.
  Feito: as duas coisas. O servidor responde `pending` (com id da submissão e tentativa) após `SUBMIT_WAIT_MS=8000` e segue avaliando; o cliente espera 15 s e diz "recebida, a avaliação continua". A nota chega pela consulta de estado — e o servidor avisa a sala (`arena_score_ready`) quando ela fica pronta, para não esperar o próximo ciclo. Repetir o envio continua a MESMA avaliação (uma em voo por submissão). `test/api/arena-sla.test.mjs` + `test/browser/envio-pendente.test.mjs`.
  **Estendido em 17/09/2026 (mesma etapa):** quando as repetições do provedor também falham, a avaliação é **estacionada** (resposta `pending` + `parked`, com o motivo) e reprocessada com espera crescente — a tela diz "resposta guardada, o juiz está indisponível agora, a nota será concluída automaticamente" e a nota chega sozinha. Nenhuma nota heurística é gravada por falha do provedor, e a submissão nunca fica sem nota por causa de um pico: `src/judge/parking.mjs`, `test/api/arena-estacionamento.test.mjs`, `test/judge/parking.test.mjs`, `test/browser/envio-pendente.test.mjs`. O estado aparece no `/readyz` (`judge_parking`), com aviso (sem bloquear) quando alguma avaliação passa do teto de tentativas.
- [x] Limitar avaliações simultâneas e orçamento de chamadas Gemini por instalação; responder com espera/rejeição recuperável, mantendo a mesma tentativa e sem avaliação dupla.
  Feito: `src/judge/budget.mjs` (concorrência, cota por hora e fundo de fila), ligado no ponto único (`createJudges`) e visível no `/readyz`. A recusa é 503 + `Retry-After`, **não** vira nota local (fila cheia não é falha do provedor) e a tentativa segue preservada — repetir conclui a mesma avaliação. **Desde 17/09/2026 a recusa também estaciona** a avaliação: a nota chega quando o teto libera, mesmo que o aluno não clique de novo.
- [x] Mostrar ao professor quando uma avaliação usou fallback local e o motivo resumido; registrar no relatório qual modo/provedor/modelo gerou a nota.
  Feito no detalhe da sala (a tela onde o professor decide durante a aula): provedor, modelo, "juiz local" e motivo por nota, mais o resumo da rodada, lidos do metadado gravado na tentativa de avaliação. **Em parte:** `/report.php` (fluxo clássico) não recebeu a procedência da Arena.
- [x] Rodar carga sintética autorizada: 35 e 50 clientes, 3 e 12 missões, eventos SSE, submissões simultâneas, backend escolhido e atraso de rede representativo. Medir p50/p95, erros, conexões, consultas e bytes da resposta do lobby. Não testar com API Gemini paga sem limite de orçamento explícito; primeiro usar stub controlado.
  Feito nos dois níveis, com o stub controlado que o item autoriza. `npm run carga` mede o desenho (p50/p95, pendentes, chamadas por submissão, streams, bytes do lobby). `npm run carga:http` mede uma **instalação real** — processo separado com `npm start`, banco em arquivo, HTTP e SSE de verdade, política de juiz vinda do ambiente e o provedor controlado via `GEMINI_BASE_URL` (novo fio: os adaptadores já aceitavam `baseUrl`, o caminho de produção não conseguia usá-lo). Linha de base em `DEPLOYMENT.md`: 35/3 com 120 ms → p50 906 ms, p95 1,43 s, 0 pendentes; 50/12 com 300 ms → p50 2,52 s, p95 4,19 s, 0 pendentes; 35/3 com 900 ms → p95 8,16 s, 3 "pendente"; zero falha, 1,00 chamada por submissão, 35/50 streams, lobby 5,5/9,4 KB, procedência `local: 0`. Dois controles provam que o arnês mede o teto (teto 1 → 27 pendentes e pico 1 no provedor; provedor instantâneo → 0 pendentes) e o arnês **reprova** quando falta nota, falta stream, as chamadas não são uma por submissão ou alguma nota vem do juiz local.
  **Em parte, e é decisão, não pendência técnica:** o provedor controlado tem o atraso escolhido aqui e o host é esta máquina. Falta a execução no host de destino com o provedor real — que exige chave e teto de orçamento — e é ela que produz a meta de latência. Por isso nenhuma meta foi declarada: a tabela é a linha de base a reproduzir, não um alvo cumprido. Consultas por leitura não foram remedidas (o lobby já tinha medição anterior de 44–56 `prepare`).
  **Tentada em 17/09/2026 e bloqueada fora do código.** O arnês ganhou `--provedor real` (com `--teto-chamadas` virando o `JUDGE_CALLS_PER_HOUR` da instância e preflight barato de chave) e `--alvo https://…` (mede uma instalação já rodando, sem SSH). A execução real rodou inteira e devolveu 35 envios, 35 falhas `502`, 35 chamadas contabilizadas de um teto de 50, zero notas: o **projeto** da chave está com acesso negado (`403 PERMISSION_DENIED` em `generateContent`, com a chave na query ou no cabeçalho; `/models` responde `200` e lista `gemini-3.6-flash`). O modo `--alvo` foi provado contra instalação em processo separado (8/8 notas, chamadas do `spent_last_hour`, saída 0). A negação também rendeu um achado de configuração, medido com `--falha-provedor 403`: em `JUDGE_MODE=gemini` a turma inteira recebe **nota local** sem sinal de origem; em `gemini-safe` não há nota e o erro é explícito. **Resolvido na mesma data para o caso passageiro:** a política de repetição passou a ser única para as duas famílias (`src/judge/retry.mjs`) — `429` e `5xx` se repetem com espera (respeitando `Retry-After`, com teto de 2 s e prazo total que caiba na paciência de quem chama) e só depois disso o local entrava. Com o provedor voltando, 4 de 4 notas passaram a vir dele, 0 locais.
  **Fechado em 17/09/2026 (continuação):** "só depois disso o local entrava" deixou de valer — nem o `403` nem qualquer outra falha do provedor produzem nota local. As duas famílias sinalizam indisponibilidade (`src/judge/failure.mjs`) e o servidor **estaciona** a avaliação para reprocessar (`src/judge/parking.mjs`): o `403` entra no pátio e volta em 5 s, 10 s, 20 s e 40 s, então a turma recebe as notas quando o operador conserta o acesso ao projeto — sem que ninguém leve para casa uma nota que não foi avaliada. A heurística local ficou restrita a configuração (sem chave) e a texto ilegível — e isso deixou de ser convenção: o padrão dos dois adaptadores passou a ser `onProviderFailure: 'throw'`, então esquecer o parâmetro ao montar um juiz não devolve a nota de consolo (o modo antigo virou opt-in explícito). Ver `AUDIT.md` (seções **Falha do provedor deixa de virar nota, e passa a ter pátio**, **A porta por onde a heurística ainda podia nascer** e **A fila é o banco: um reinício deixou de custar a nota de quem já tinha enviado**) e `DEPLOYMENT.md`.
  **Fechado também o limite do reinício (17/09/2026):** a fila do pátio é o BANCO, não a memória — submissão sem linha em `arena_scores` é "ainda esperando nota" e o processo seguinte a retoma no boot (`retomarEstacionadas`, `judge_parking_resume` no `/readyz`). Provado com dois processos de produção sobre o mesmo banco (`test/smoke/parking-durable.test.mjs`): a instância A estaciona e é morta com `SIGKILL`, a B entrega a nota do provedor sem ninguém reenviar. O teto de tentativas conta através dos reinícios e a janela de retomada é de 24 h só em salas vivas.
- [ ] Reduzir leituras e evitar reenviar imagem base64 no lobby se a medição remota exceder a meta de latência/bytes definida. Preservar o contrato funcional e comparar o relatório/placar.
  **Não aplicável ainda, e de propósito:** a decisão depende do host de destino, que não existe. Mas a medição do arnês foi confirmada na instalação real: 5 499 bytes (35 alunos) e 9 380 (50) — o valor do stub era 5,5 KB e 9,4 KB, ou seja, o caminho HTTP real não acrescenta o que o arnês anterior deixava de fora. Sem imagem base64 no lobby. Reduzir isso antes de saber a meta seria otimizar o que ninguém mediu.

**Aceite:** cumprido no desenho e medido no stub — sem nota duplicada, sem timeout enganoso e sem custo sem limite. **Não cumprido no host:** falta acesso do projeto da chave ao provedor e um host provisionado, nessa ordem — os dois são decisões de quem opera, não trabalho de código. Até lá a meta de latência continua não declarada, e declarar uma seria inventar número.

### Etapa 4 — Artefato, CI e promoção

Arquivos principais: `.dockerignore`, `Dockerfile`, `.github/workflows/test.yml`, `package.json`, `README.md`, `DEPLOYMENT.md`.

- [ ] Excluir `output/`, `arena/`, capturas, `.env`, bancos, `tmp/` e arquivos de desenvolvimento do contexto Docker; preferir `COPY` seletivo. Buildar a imagem a partir de clone limpo e conferir tamanho/conteúdo.
- [ ] Criar/configurar o remote novo, decidir branch principal e executar o workflow nessa branch. Fazer `npm ci`, suíte funcional e navegador em CI; preservar cache do Chromium sem segredos.
- [ ] Publicar em homologação com banco e segredos separados da produção. Testar login, criação/entrada, uma rodada clássica, rodada por critérios, relatórios/exportação, reconexão SSE, queda do backend e restauração.
- [ ] Fazer backup pré-deploy, registrar artefato/commit e manter procedimento de rollback para app e banco. Não aplicar migração destrutiva sem cópia restaurável testada.
- [ ] Promover somente depois de todas as etapas e critérios aprovados. Manter uma instância por instalação enquanto o estado SSE/limites permanecer local ao processo.

## Decisão final de lançamento

**Parecer inicial: no-go até concluir as correções.** As correções de integridade e privacidade foram implementadas e revalidadas; a situação atual, incluindo o que ainda impede o lançamento, está na reauditoria abaixo.

## Reauditoria após as correções

Conferência do código, dos testes e do Git feita novamente após as alterações acima:

| Gate atual | Resultado desta conferência |
|---|---|
| Testes funcionais | `npm test`: 510 testes, 509 aprovados, zero falhas, 1 ignorado. O teste ignorado envia `SIGTERM` real, que este Windows não entrega; o fluxo de encerramento está coberto por teste de processo e deve rodar no CI Linux. |
| Navegador | `npm run test:browser`: 28 aprovados, zero falhas/ignorados, 250,2 s. Inclui CSV, envio pendente, foco/clique com atualização ao vivo, espera de avaliação no painel e SSE. |
| Dependências de produção | `npm audit --omit=dev`: zero vulnerabilidades reportadas. |
| Carga HTTP local, provedor controlado | 35 alunos/3 missões: p50 879 ms, p95 1,40 s, zero pendentes/falhas, 35 notas e 35 chamadas, 35 streams. 50 alunos/12 missões: p50 2,57 s, p95 4,21 s, zero pendentes/falhas, 50 notas e 50 chamadas, 50 streams. São medições locais com stub, não Gemini nem host de produção. |
| Correções P0 de integridade/privacidade | Os novos testes de CAS/votos, fechamento idempotente, identidade nova na reentrada e CSV passaram na suíte. |
| Prontidão de deploy | **Ainda não verificada:** não há remote Git configurado, o working tree tem 62 alterações/arquivos não commitados, não há host/volume/domínio provisionado e o build Docker não foi executado nesta máquina. |
| Gemini real | **Não liberado:** a última medição documentada recebeu `403 PERMISSION_DENIED` para `generateContent`. O ensaio atual usou somente endpoint controlado local; não confirma que a chave/projeto usada na hospedagem tem acesso. |
| Cópia externa do backup | Ferramentas e restauração local foram testadas; cópia automática para fora do host e exercício de recuperação do operador ainda não foram realizados. |
| Turso/libSQL gerenciado | Não é o perfil escolhido. Continua bloqueado por preflight até a verificação no banco real; usar o perfil local com volume evita depender dessa validação. |

**Parecer atualizado: o código está pronto para homologação, ainda não para lançamento em produção.** As correções de código e os gates locais passaram, mas o pacote não está commitado nem conectado ao novo repositório, o host persistente ainda não existe, o caminho real de Gemini continua recusado e a cópia externa do backup não foi exercitada. Não promova até publicar um commit revisado, criar o host com volume/TLS e uma única instância, comprovar o acesso real do juiz (ou decidir conscientemente usar `fallback` local), confirmar o pipeline Linux e completar um smoke test e restore em homologação.
