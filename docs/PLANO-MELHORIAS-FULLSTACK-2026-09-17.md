# Plano de melhorias — Live Arena / Batalha de Prompts

Auditoria realizada em 17/09/2026 sobre a cópia de trabalho baseada no commit `074119a`, incluindo alterações locais já existentes. Documento para outra IA implementar em entregas pequenas e verificáveis.

**Parecer:** a base é funcional e tem boas proteções e testes, mas encontrei defeitos concretos na votação simultânea, no encerramento repetido de desafios e na recuperação de identidade de alunos. Esses defeitos devem ser corrigidos antes de investir em uma grande reformulação visual. A arquitetura atual pode continuar atendendo ao produto; não há evidência que justifique migrar imediatamente para React, Next.js, microsserviços ou outro banco.

**Caminho do projeto nesta máquina:**

`C:/Users/Marcelo/Downloads/live-arena-identidade-ajustada/batalha-de-prompts-main`

Todos os caminhos abaixo partem dessa raiz. O próprio plano fica em `docs/PLANO-MELHORIAS-FULLSTACK-2026-09-17.md`. Os arquivos citados existem; as linhas são referências da versão auditada e devem ser reconferidas após mudanças.

**O que foi efetivamente verificado**

| Verificação | Resultado e limite |
| --- | --- |
| Ambiente local | Node 24.18.0, npm 11.16.0, Windows |
| Testes funcionais | `npm test`: 362 aprovados, zero falhas, aproximadamente 9,8 s |
| Testes de navegador | `npm run test:browser`: 21 aprovados, zero falhas, aproximadamente 162 s |
| Dependências | `npm audit --json`: zero vulnerabilidades conhecidas reportadas naquele momento; não prova ausência de defeitos no aplicativo |
| Votos simultâneos | Dez chamadas aceitas; apenas um voto persistido em uma execução local isolada |
| Encerramento duplicado | Mesma dinâmica encerrada duas vezes: vida 5 → 4 → 3; energia 0 → 4 → 8; dois registros de ataque |
| Reentrada de aluno | Mesmo nome inativo + código da sala gerou novo token para a identidade antiga e permitiu recuperar email sintético anterior |
| Consultas do aluno | Sala sintética com dez participantes e três missões: 44 chamadas a `prepare` no lobby antes das respostas; 56 depois de uma rodada respondida |
| Integridade libSQL | Adaptador remoto com cliente libSQL real usando backend local em memória: `foreign_keys` permaneceu 0 dentro da transação e aceitou referência inexistente |
| Encerramento com SSE | `server.close()` não concluiu durante a observação de 250 ms com um stream aberto; a implementação não tem fechamento do hub nem prazo máximo |
| Interface | 27 novas capturas, desktop 1440×900 e celular 390×844; dados sintéticos, incluindo prévias explicitamente marcadas como exemplos |

Os testes adicionais usaram banco em memória e juiz simulado. Não foram acessados dados reais de alunos, a chave local, o banco Turso de produção ou o serviço Gemini. A medição de consultas não é um teste de carga nem uma estimativa de latência de produção.

A revisão de segurança percorreu os principais limites de confiança e validou quatro achados. Sua cobertura é parcial: não equivale à leitura integral de cada arquivo histórico, captura preservada, arquivo gerado e combinação possível de estados. O auditor independente geral foi interrompido por limite de uso; seus candidatos foram validados pelo responsável. A análise independente de arquitetura e a investigação focal de concorrência foram concluídas. Isso não impede o plano, mas impede afirmar uma certificação de segurança completa.

**Estrutura atual e partes que vale preservar**

O servidor usa HTTP nativo do Node e páginas renderizadas em `src/web/pages/index.mjs`. As ações chegam a `src/server/http.mjs`, seguem para `arena-api.mjs` ou `api.mjs`, usam regras em `src/domain/` e repositórios em `src/db/repositories/`. A persistência é SQLite local ou libSQL conforme configuração. O navegador usa JavaScript sem framework, SSE e consultas de recuperação. O juiz pode ser determinístico ou Gemini.

Há SQL parametrizado nos caminhos examinados, cookie administrativo HttpOnly, assinatura e expiração de sessão administrativa, proteção de origem, limite de corpo HTTP, validação de identidade e sala nos envios, alocação transacional de estações, preservação de tentativa após perda de resposta e testes de regressão de regras e CSS. O gabarito é retirado da visão normal do aluno. O motor clássico preservado tem finalidade documental e testes próprios; sua remoção indiscriminada perderia essa garantia.

O administrador é compartilhado por instalação. Não há contas independentes de professores nem isolamento de instituições. Isso é compatível com uma instalação controlada; oferecer um serviço para várias escolas exigiria um projeto específico de contas, autorização por sala e isolamento de dados.

**Ordem recomendada**

P1 significa corrigir antes da próxima utilização importante ou publicação. P2 significa executar na sequência para melhorar operação e manutenção. P3 é evolução condicionada a necessidade. Prioridade de implantação e severidade de segurança são escalas distintas.

| ID | Prioridade | Entrega | Esforço relativo |
| --- | --- | --- | --- |
| M01 | P1 | Preservar todos os votos concorrentes | Médio |
| M02 | P1 | Encerrar cada dinâmica uma única vez | Pequeno/médio |
| M03 | P1 | Impedir recuperação de aluno apenas pelo nome | Médio |
| M04 | P1 em implantação com proxy | Separar os limitadores por cliente real | Médio |
| M05 | P1 antes de exportar para planilhas | Neutralizar fórmulas em CSV | Pequeno |
| M06 | P1 antes de depender de Turso | Validar e garantir integridade no adaptador remoto | Médio |
| M07 | P1 para operação previsível de IA | Tornar explícito o modo de avaliação e fallback | Médio |
| M08 | P2 | Reduzir leituras e tamanho das respostas | Médio/grande |
| M09 | P2 | Sincronizar somente a sala relevante | Médio |
| M10 | P2 | Preservar foco e interação durante atualização da tela | Médio |
| M11 | P2 | Encerrar servidor e avaliações de forma controlada | Médio |
| M12 | P2 | Registrar falhas, medir operação e testar restauração | Médio |
| M13 | P2 | Separar responsabilidades dos arquivos grandes | Gradual |
| M14 | P2 | Ajustar hierarquia visual e tarefa principal no celular | Médio |
| M15 | P2 | Corrigir bootstrap, empacotamento e documentação | Pequeno/médio |
| M16 | P2 | Congelar referência da missão e definir tempo efetivo | Médio |
| M17 | P3 | Evoluções de produto e segurança conforme expansão | Variável |

**M01 — votos concorrentes sobrescrevem uns aos outros. Defeito reproduzido.**

Onde: `src/server/arena-api.mjs:2988`, `:3161`; `src/db/repositories/index.mjs:248`; `src/domain/arena-mode.mjs:692`; `public/assets/js/arena.js:1127`.

O cliente envia participante e token. A fila usa `vote:<participante>` e os controles do professor usam `room:<sala>`. Cada voto lê o JSON completo da sala, acrescenta uma resposta e salva o JSON inteiro. Duas leituras do mesmo estado podem produzir duas versões, das quais só a última permanece. A fila de statements do SQLite não torna a sequência inteira atômica. A mesma diferença de filas permite que uma gravação atrasada concorra com encerramento ou reinício; essa variação foi validada por fonte, não reproduzida dinamicamente.

Implementar resolução da sala pela sessão autenticada antes de escolher a fila. Usar a mesma chave canônica para todos os escritores desse estado, incluindo voto, confiança, dicas, fechamento e reset. Não confiar no `room_id` opcional enviado pelo aluno. Para suportar mais de um processo, adicionar versão persistida com comparação e repetição, uma transação apropriada ou uma tabela de votos com chave única por dinâmica e participante. A validação de fase/prazo precisa ocorrer dentro da operação protegida. Não manter transação aberta durante chamada externa de IA.

Aceite: dez e depois cinquenta votos simultâneos ficam todos salvos; trocar voto conta uma única pessoa; voto concorrente com fechamento não reabre a votação; dois despachantes usando o mesmo banco mantêm o resultado. Cobrir também Wild Card. Adicionar casos em `test/api/arena-mode-api.test.mjs` e nos testes de persistência, com barreiras controladas para produzir a sobreposição.

**M02 — um segundo encerramento cobra novamente o mesmo resultado. Defeito reproduzido.**

Onde: `src/server/arena-api.mjs:3062`; `src/domain/arena-mode.mjs:802`.

`settleDynamic` verifica se a dinâmica existe, mas não rejeita ou reutiliza uma dinâmica já revelada. Reaplica dano, energia, ataque e estatísticas. A fila ordena chamadas, porém não impede esse efeito em duas chamadas sequenciais. Pode surgir por clique repetido, reenvio ou dois aparelhos do professor; não exige um ataque.

Tornar o encerramento idempotente: o mesmo identificador de dinâmica deve produzir um único resultado persistido. Devolver o resultado existente ou conflito claro quando já encerrado. Aplicar a guarda na regra de domínio e assegurar atomicidade na persistência. Auditar comandos vizinhos que concedem pontos, poderes ou avançam rodada para a mesma propriedade.

Aceite: chamar fechamento duas vezes, inclusive de clientes diferentes, não altera novamente vida, energia, ataques, público ou prêmios. Acrescentar um teste de domínio e um de API que comparem o estado completo antes e depois do segundo fechamento.

**M03 — nome de aluno removido funciona como recuperação de conta. Defeito reproduzido.**

Onde: `src/server/arena-api.mjs:2052`, `:2780`; `src/db/repositories/arena.mjs:220`.

Ao encontrar um nome inativo, o servidor emite novo token para o mesmo ID, conservando perfil e submissões. A pessoa que conhece o código e o nome pode assumir essa identidade. A reprodução confirmou acesso ao email sintético anterior por `arena_set_profile` ao alterar somente consentimento. Há condições: a sala deve permitir entrada e a estação antiga não pode estar ocupada por outro participante. Nomes ativos são corretamente recusados.

Definir dois fluxos explícitos. Retomar a identidade antiga exige token anterior válido ou recuperação iniciada pelo professor. Uma entrada nova não herda notas, perfil ou consentimento de outra identidade. Ajustar a unicidade do nome, se necessário, sem transformar nome em credencial. A remoção deve invalidar a sessão e a regra de recuperação precisa ser visível ao professor.

Aceite: PIN + nome sem credencial anterior não revela histórico/perfil; recuperação autorizada preserva o aluno correto; tokens antigos são invalidados; retorno não gera colisão de estação nem ultrapassa capacidade. Testar também nomes com espaços/case conforme a política escolhida.

**M04 — limitadores compartilham a identidade do proxy. Risco condicionado à implantação.**

Onde: `src/server/http.mjs:74`; `src/server/api.mjs:901`; `src/server/rate-limit.mjs:4`; `src/server/arena-api.mjs:1930`, `:2022`; `DEPLOYMENT.md:60`.

O IP usado é `request.socket.remoteAddress`. Com o Caddy encaminhando para localhost como documentado, vários visitantes aparecem com o IP do proxy. Cinco senhas erradas bloqueiam a chave por 300 segundos antes mesmo da verificação de uma senha correta. Os limitadores de PIN e código TV têm a mesma limitação de identidade. Não foi inspecionada a topologia real em produção.

Adicionar configuração explícita de proxies confiáveis. Usar IP encaminhado somente quando a conexão imediata vier de proxy autorizado, respeitando a cadeia esperada. Não aceitar `X-Forwarded-For` de qualquer origem. Combinar limites por cliente e por operação, com teto global que não transforme um usuário em bloqueio de toda a turma. Expirar entradas antigas dos mapas para que origens abandonadas não permaneçam indefinidamente.

Aceite: cliente A bloqueado não impede cliente B de entrar pelo mesmo proxy; cabeçalho forjado em conexão direta não muda identidade; testes de IP IPv4/IPv6, rede local e proxy real de homologação.

**M05 — escape de CSV não neutraliza fórmulas. Confirmado por fonte.**

Onde: `public/assets/js/app.js:400`, `:453`, `:651`; `src/server/report-sources.mjs:17`.

O CSV faz escape das aspas, mas deixa conteúdo como `=1+1` intacto. Nome, empresa, cargo ou prompt vêm de participantes. Ao abrir em um leitor que interpreta fórmulas, uma célula textual pode executar uma expressão. O relatório exige autenticação; o risco acontece depois da exportação. Não foi demonstrada execução de código ou exfiltração.

Criar uma função única para células textuais, neutralizando os prefixos de fórmula e controles relevantes depois da normalização. Aplicar tanto ao caminho baseado nos dados quanto ao fallback baseado no DOM. Distinguir números confiáveis de texto. Validar em Excel/LibreOffice conforme os leitores usados; CSV não carrega um tipo de célula universal. A [OWASP descreve essa classe de problema](https://community.owasp.org/attacks/CSV_Injection).

Aceite: `=`, `+`, `-`, `@`, tabulação e retorno de carro no início de texto não viram fórmulas; aspas, vírgulas/ponto e vírgula e quebras continuam corretos; números e acentos são preservados.

**M06 — o adaptador remoto não prova que as chaves estrangeiras estão ligadas. Defeito local reproduzido; Turso real pendente.**

Onde: `src/db/database.mjs:77`, `:96`, `:105`, `:241`; `test/db/remote-adapter.test.mjs:5`; `src/db/schema.sql`.

O adaptador inicia a transação e depois executa `PRAGMA foreign_keys = ON`. O comentário afirma que isso protege a transação. Em SQLite, mudar esse PRAGMA durante transação é ineficaz, conforme a [documentação oficial](https://www.sqlite.org/pragma.html#pragma_foreign_keys). O teste atual usa um objeto simulado e apenas verifica a ordem das chamadas. Com `@libsql/client` real em backend local e FK inicialmente desligada, o PRAGMA continuou em zero e um registro órfão foi aceito. Isso não prova a configuração da conexão de um serviço Turso real.

Definir e testar o contrato por backend: toda conexão usada para escrita deve ter integridade habilitada de forma suportada, ou a aplicação precisa garantir invariantes equivalentes explicitamente. Não confiar em PRAGMA enviado a um stream diferente. Rever também migrações que recriam tabelas e o comentário contraditório sobre transações. Criar integração com libSQL real e uma base descartável de homologação remota antes de afirmar equivalência.

Aceite: referência inexistente, exclusão de pai em uso, rollback e migração de versão antiga são verificados nos dois backends. `PRAGMA foreign_key_check` não encontra órfãos após migração. Não executar correções destrutivas em dados antigos sem inventário e backup restaurável.

**M07 — configuração do juiz e transparência do fallback precisam de um contrato único. Confirmado por fonte.**

Onde: `src/server/start.mjs:71`, `:181`; `src/judge/criteria-judge.mjs:110`; `src/judge/source-compatible-judge.mjs:5`; `src/judge/gemini-judge.mjs:72`; `public/assets/js/arena.js:229`, `:938`.

`JUDGE_MODE=fallback` seleciona o juiz clássico, mas a Arena personalizada cria seu juiz por critérios separadamente e pode chamar Gemini quando a chave existe. O modo anunciado como local não garante ausência de chamada externa em todos os fluxos. Os padrões de modelo também diferem: source-compatible/critérios usam 3.6 Flash e o clássico seguro usa 2.5 Flash. A existência de [Gemini 3.6 Flash foi confirmada na documentação oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash); não há motivo para recomendar troca de modelo apenas pelo número.

Centralizar a construção dos juízes e validar os valores de ambiente. Tornar explícito se o modo vale globalmente ou por motor. Registrar provedor efetivo, modelo, versão de regra/rubrica, duração, motivo do fallback e uso retornado pelo provedor. Mostrar ao professor um estado simples de avaliação local/degradada; o relatório deve permitir identificar notas de mecanismos diferentes. Não recalcular notas históricas automaticamente após trocar juiz.

O cliente de envio usa timeout padrão de 12 s; o juiz por critérios pode realizar duas tentativas de até 12 s, além da persistência. A recuperação da mesma tentativa existe e é uma boa proteção, mas a espera pode apresentar falha enquanto a avaliação continua. Definir um orçamento coerente ou responder com ID e estado pendente, consultado depois. Limitar avaliações simultâneas e orçamento por instalação, mantendo a justiça entre alunos. O fallback heurístico deve ter um conjunto de exemplos calibrados: texto cheio de palavras-chave não é necessariamente um bom prompt.

Aceite: modo local não invoca `fetch`; modo remoto sem configuração falha de forma clara ou usa fallback explicitamente escolhido; 429, timeout, resposta inválida e 5xx têm comportamento previsível; reenvio não duplica nota nem cobrança evitável; testes cobrem as durações máximas sem usar API paga.

**Estado em 17/09/2026 — resolvido no que era contrato de modo.** A política virou um ponto único (`src/judge/configuration.mjs`) que deriva os DOIS juízes de `JUDGE_MODE`; `fallback` não faz chamada externa nem com `GEMINI_API_KEY` preenchida (provado em `test/smoke/judge-mode.test.mjs` com canário no ambiente e `fetch` instrumentado), modo desconhecido derruba o boot citando os modos aceitos, `gemini-safe` exige chave e não cai no local em erro, e cada tentativa persistida carrega `judge_mode`, `provider`, `fallback_used` e o motivo (`test/judge/configuration.test.mjs` cobre chave ausente, 429, 5xx, timeout e resposta estruturada inválida). Continuam em aberto, deste item: orçamento de tempo do envio (12 s do cliente contra as tentativas do juiz), limite de avaliações simultâneas e o estado visível de "avaliação local/degradada" para o professor. Plano detalhado: `docs/superpowers/plans/2026-09-17-juiz-e-atualizacao-da-interface.md`.

**M08 — a visão do aluno refaz muitas leituras e pode reenviar imagens grandes. Medido e confirmado por fonte.**

Onde: `src/server/arena-api.mjs:1161`, `:1266`, `:1348`, `:1576`; `src/server/report-sources.mjs:2`; `src/db/repositories/arena.mjs:342`, `:475`; `src/db/schema.sql`.

O lobby percorre missões e submissões e depois ranking/destaques consultam novamente dados relacionados. A medição foi 44/56 chamadas a `prepare` por leitura em uma sala pequena. Com libSQL remoto, sequências de consultas podem somar viagens de rede. O relatório também percorre histórico inteiro antes de vários filtros. Não há medição de saturação real nesta auditoria.

Criar consultas agregadas por sala, carregar uma visão consistente uma vez por requisição e compartilhá-la com ranking/destaques. Consultar submissões do próprio participante diretamente, sem trazer todas para filtrar em memória. Paginar listas administrativas e aplicar período/filtros no banco. Usar `EXPLAIN QUERY PLAN` antes de adicionar índices; avaliar índices por participante/data e sala/data em submissões, pois a unicidade por rodada/participante/tentativa não cobre todo acesso por participante.

Separar conteúdo estável da missão do estado dinâmico. Uma imagem base64 de até 2,1 milhões de caracteres integra a resposta da missão e pode ser reenviada a cada leitura. Preferir recurso estático com URL e cache/versionamento; se imagens ficarem no banco, oferecer endpoint adequado em vez de repetir o conteúdo dentro do lobby.

Aceite: registrar orçamento de consultas antes/depois para 3 e 12 missões, sem crescimento desnecessário por tentativa; garantir redução relevante dos 44/56 acessos medidos. Medir bytes e latência p50/p95 com 35 e 50 clientes e latência artificial de banco. Definir metas a partir dessa medição, não prometer uma capacidade de produção não testada.

**M09 — eventos globais e consultas sobrepostas ampliam o trabalho. Confirmado por fonte.**

Onde: `src/server/events.mjs:4`, `:31`; `src/server/start.mjs:84`; `public/assets/js/arena.js:260`, `:411`, `:1833`.

O hub transmite cada mutação a todos os clientes, sem filtrar sala. O evento não expõe registros privados: contém ação e horário. Porém, alunos/professores de outras salas podem atualizar à toa. O cliente já reduz polling enquanto SSE está vivo; não seria correto afirmar que ele sempre consulta a cada 2,5 s. Ainda assim, eventos forçados e respostas sobrepostas podem provocar leituras redundantes, especialmente no detalhe administrativo.

Escopar assinatura por sala e autorização aplicável; oferecer canal administrativo separado quando necessário. Incluir versão/revisão do estado. Coalescer eventos próximos, permitir no máximo uma leitura em voo por superfície e descartar respostas antigas quando a seleção de sala mudar. Reconciliar ao reconectar, com atraso progressivo e variação aleatória nas novas tentativas. Considerar abas ocultas. Adicionar limite de conexões e tratamento de consumidor lento no servidor.

Aceite: evento da sala A não consulta sala B; uma rajada de vinte eventos não gera vinte leituras simultâneas; resposta atrasada da sala anterior não troca o detalhe; desconectar/reconectar recupera o estado. Se houver múltiplas instâncias, planejar distribuição de eventos; o hub em memória não atravessa processos.

**Estado em 17/09/2026 — resolvido no que era multiplicação de leitura.** O evento carrega `room_id`, resolvido do resultado validado no servidor (nunca de campo do aluno), e cada superfície descarta o que é de outra sala; a assinatura do detalhe ignora sala alheia; existe uma consulta em voo por superfície com coalescimento (vinte eventos viram no máximo duas leituras, pico de simultaneidade 1), resposta atrasada de outra sala é descartada e o redesenho é pulado quando o estado é equivalente. Aba oculta espaça o batimento para 10 s e voltar dispara leitura imediata; SSE caído volta ao polling e reconecta sozinho. Medido em `test/browser/atualizacoes-ao-vivo.test.mjs`, que imprime a tabela de consultas por janela.

**Entrega de 17/09 (continuação) — o filtro foi para o servidor.** A conexão do stream passou a ser autorizada POR SALA (`src/server/events-scope.mjs`): painel pelo cookie `arena_admin`, projeção pelo cookie `arena_tv_session` (8 h, conferido contra a sala pedida) e aluno pela própria sessão (`participant_id` + `token`), com a sala saindo da sessão validada, nunca do `room` pedido. Sem prova, a conexão nasce no escopo global: recebe o evento da arena e nada de sala nenhuma. O hub entrega o evento de sala apenas às conexões que provaram seguir aquela sala, então o cliente não descarta mais nada — `room_id` no payload passou a ser trilha do que foi roteado, não critério de tela. Medido: conexão anônima não recebe mutação de sala nenhuma (nem o `arena_join` do aluno) e as três telas reais entram na mesma sala, reconectando nela depois de queda (`test/browser/stream-por-sala.test.mjs`, novos casos em `test/smoke/arena-room-events.test.mjs`). Continuam em aberto: revisão/versão do estado no protocolo, retentativa com atraso progressivo e reconciliação, distribuição de eventos entre instâncias (o hub é em memória), limite de conexões por sala e consumidor lento. O corte do stream quando a sessão deixa de valer foi resolvido na entrega seguinte.

**Entrega de 17/09 (continuação 2) — a autorização da conexão passou a ser reverificada.** A conexão do stream reconfere o escopo de 10 em 10 segundos (relógio injetável) com o MESMO resolvedor da entrada — em `start.mjs`, `revalidate: () => resolveEventsScope(request, url)` —, comparado por `sameScope`: quem perde a sala recebe `event: revoked` e é fechado, e o cliente fecha em vez de reconectar, porque o `EventSource` voltaria em escopo global (`retry: 1000`) e a tela ficaria "ao vivo" sem receber nada da própria sala. Regras escritas: só a conexão cujo escopo mudou é fechada, falha de leitura NÃO revoga (banco que pisca não corta a aula) e a conexão global não paga o relógio. Fica em aberto a janela de até 10 s da própria reverificação. Medido em `test/smoke/events-revalidate.test.mjs` (novo), em `test/smoke/arena-room-events.test.mjs` (o aluno removido é revogado, painel e a outra sessão continuam) e em `test/browser/stream-por-sala.test.mjs` (a tela do aluno agora roda em contexto próprio, sem herdar o cookie do professor).

**M10 — atualização de dados substitui controles com os quais a pessoa está interagindo. Confirmado por fonte e documentação de testes.**

Onde: `public/assets/js/arena.js:1805`, `:2117`, `:2195`; `test/support/navegador.mjs:29`; `test/browser/navegador-esperas.test.mjs`.

`refreshDetailQuiet` reconstrói o detalhe com `innerHTML`. Já há proteção enquanto um diálogo está aberto e preservação de dobras, mas controles fora do diálogo continuam substituíveis. O helper dos testes explica cliques perdidos durante redesenho e repete até ocorrer a consequência. Isso torna o teste mais resistente; também documenta uma fragilidade de interação que merece correção no produto.

Atualizar somente os elementos cujos valores mudaram, mantendo identidade dos botões, foco, seleção de texto e edição de controles. Comparar revisão de dados antes de redesenhar. Evitar listeners duplicados e limpar assinaturas/intervalos ao sair da superfície. Acrescentar um teste de clique único e navegação por teclado durante atualização forçada; não depender apenas da repetição do clique.

Aceite: clique único abre o comando durante um refresh; foco e valor digitado permanecem após três atualizações; leitor de tela recebe aviso curto de mudança relevante, sem reler o painel inteiro.

**Estado em 17/09/2026 — resolvido.** O corpo do detalhe (e do relatório da sala) só é redesenhado quando o estado visível mudou e, quando muda, foco, seleção, valor digitado e rolagem voltam ao lugar (`captureViewState`/`restoreViewState`); a TV só troca conteúdo quando o estado muda — o cronômetro é intervalo local e não reinicia. Aceite coberto em `test/browser/painel-controles.test.mjs` (um clique na rajada = uma ação; `Enter` executa uma vez com o foco mantido depois de três redesenhos reais; dobra aberta continua aberta) e a digitação preservada do aluno em `test/browser/atualizacoes-ao-vivo.test.mjs`. Fica registrado: o clique do aceite é despachado dentro da página (um gesto, sem repetição), e `clicarAte` continua existindo e documentado para o setup — o helper deixou de ser o único caminho de aceite. Em aberto: o aviso curto de mudança relevante para leitor de tela.

**M11 — desligamento precisa fechar SSE e tratar avaliações em curso. Confirmado por fonte e observação local.**

Onde: `src/server/start.mjs:190`; `src/server/events.mjs:4`; `src/server/arena-api.mjs:1095`, `:2121`.

O encerramento espera `server.close()` e só depois fecha o banco. O stream SSE mantém uma resposta ativa e o hub não expõe fechamento. A observação confirmou que o callback permaneceu pendente com stream aberto; não é uma medição do tempo de deploy. [O Node distingue fechamento do servidor e das conexões ativas](https://nodejs.org/api/http.html#servercloseallconnections).

Adicionar drenagem: retirar prontidão, impedir novas operações, encerrar SSE, aguardar operações em curso até prazo definido, cancelar chamadas externas restantes e fechar banco. Submissões recebidas antes da interrupção devem ser identificáveis como pendentes e retomadas com a mesma identidade de tentativa. Evitar que reinício transforme uma resposta já recebida em nota ausente permanentemente.

Aceite: SIGTERM com TV, aluno e avaliação em curso termina dentro do prazo documentado; banco reabre sem corrupção; submissão pendente é recuperável; nenhum evento escreve após fechamento.

**M12 — falhas internas são ocultadas do operador e restauração não foi demonstrada. Lacuna operacional.**

Onde: `src/server/http.mjs:97`; `src/server/start.mjs:159`; `DEPLOYMENT.md:66`.

As respostas genéricas ao cliente são adequadas, mas os blocos de erro examinados não registram a causa no servidor. O healthcheck lista salas antigas para verificar banco, e o documento apenas menciona backup diário. Não encontrei nesses caminhos uma rotina verificada de restauração, retenção ou alerta.

Registrar erros com ID de requisição, ação, sala quando cabível, duração, status e classe de erro. Excluir senha, tokens, chave, conteúdo do prompt e perfil pessoal por padrão. Medir consultas lentas, falhas do juiz, percentual de fallback, avaliações pendentes e conexões SSE. Separar liveness de readiness; usar consulta leve de banco. Definir backup consistente, destino, retenção e teste periódico de restauração. Para SQLite com WAL, usar mecanismo de backup consistente, não copiar só o arquivo principal em uso.

Aceite: erro simulado recebe ID correlacionável; logs não contêm dados sensíveis; backup restaurado em banco isolado mantém contagem e integridade de salas, respostas e notas. Documentar responsáveis e recuperação após deploy defeituoso.

**M13 — separar arquivos grandes reduz risco de mudanças futuras. Melhoria de manutenção.**

Onde: `public/assets/js/arena.js` (4.592 linhas físicas e cerca de 244 KB), `src/server/arena-api.mjs` (3.174 linhas físicas e cerca de 156 KB), `src/web/pages/index.mjs`, `public/assets/css/arena.css`, `design.css`, `refinement.css`.

Aluno, painel, TV, prévias, diálogos e transporte estão no mesmo arquivo de navegador. A API agrega comandos, composição de visões, juiz e evolução de estado. Isso dificulta revisar uma mudança e mantém lógica de telas diferentes no mesmo carregamento.

Extrair gradualmente transporte/sessão, aluno, professor, TV e funções puras de apresentação para módulos ES. No servidor, separar comandos de sala, participantes, votação, avaliação e consultas de visão; manter regras no domínio e operações de banco nos repositórios. Uma camada de comandos pode declarar autenticação, limite de corpo, chave de concorrência e evento, evitando listas divergentes. Não introduzir um framework como condição para essa separação.

Consolidar tokens de cor, espaçamento, tipografia e botões, identificando a regra proprietária antes de remover sobrescritas. As guardas de CSS existentes devem continuar passando. Considerar verificação gradual de tipos por JSDoc/checkJs e contratos de payload; começar por estados, pontuação e interfaces de persistência, sem reescrever tudo em TypeScript de uma vez.

Aceite: extração preserva fluxos e CSS renderizado; cada tela carrega somente seus módulos necessários; uma alteração de votação pode ser revisada sem percorrer toda a TV; contratos inválidos falham em teste/verificação estática.

**M14 — a interface atual precisa de hierarquia e consistência, com atenção ao celular. Opinião de design baseada em capturas novas.**

Análise visual tela a tela, parecer geral, prioridades e critérios de aceite: `docs/ANALISE-VISUAL-TELAS-2026-09-17.md`. A revisão individual das 27 capturas confirmou que o maior excesso de informação está no painel docente e nos formulários longos, não na entrada nem no fluxo principal do aluno. Ela também encontrou estados de demonstração contraditórios na TV e uma captura de espera etiquetada como resultado; trate isso como erro de prévia/evidência até novo teste confirmar o produto ao vivo.

Onde: `src/web/pages/index.mjs`, `public/assets/js/arena.js`, `public/assets/css/refinement.css`, `arena.css`, `design.css`.

O portal atual está enxuto. A captura antiga com slogan, parágrafo e quatro benefícios não representa mais a tela atual. Não reintroduzir esses blocos. O fundo granuloso ocupa quase todo o quadro e chama muita atenção; testar uma textura menos intensa mantendo a identidade azul/verde. O título dividido em duas linhas e a ação central funcionam como entrada simples.

No painel, o cartão da sala mistura chip, texto pequeno, contagem e várias ações; o detalhe tem grande espaço vazio no convite e duas formas de acessar projeção (`Ver na TV` e `Abrir tela de projeção`). Separar claramente prévia e projeção real, agrupando o acesso e nomeando o resultado da ação. Colocar estado, participação e próximo comando juntos; recolher sorteio vazio e detalhes de configuração quando não forem a tarefa atual. Não remover comandos úteis só para diminuir palavras.

No celular do aluno, contexto e missão ocupam boa parte da primeira tela. Na captura com missão sintética longa, o botão de envio chega ao limite inferior. Manter uma instrução direta na frente e contexto complementar acessível por expansão, quando não for essencial para responder. Testar com teclado aberto, zoom e enunciados reais curtos/longos. A tela de feedback pode destacar nota e próximo passo, reduzindo a repetição do enunciado após a única tentativa. Distinguir visualmente pontos e qualidade sem acrescentar um parágrafo explicativo.

No relatório móvel, exportar e imprimir têm mais destaque e aparecem antes do título e dos resultados. Propor título/período primeiro, métricas depois e ações de saída em grupo secundário. Nos formulários, manter rótulos, indicação de obrigatoriedade e mensagens de erro específicas. As dobras atuais de campos opcionais e critérios já reduzem a densidade; preserve essa melhoria. Usar ícones coerentes para ações em vez de misturar emojis e desenhos com estilos diferentes.

Aceite: nova captura de cada tela alterada em 390, 768 e 1440 px, estados vazios/populados/erro e teclado aberto; nenhum controle essencial oculto, rolagem horizontal acidental ou foco perdido. Validar contraste medido, zoom 200%, nome acessível de ícones, foco visível e não encoberto. A WCAG 2.2 estabelece critérios de [alvo mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) e [foco não encoberto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum); não declarar conformidade só por inspeção visual.

As 27 capturas locais estão em `output/auditoria-fullstack-2026-09-17/telas/`. Cobrem portal desktop/celular, entrada, login, painel vazio/populado, novo desafio, nova sala, detalhe, tempos, edição, adicionar missão, prévia do aluno, quatro prévias TV, aluno em espera/missão/feedback/estado seguinte/fim, relatório desktop/celular, painel celular, entrada TV e 404. A revisão visual marcou estados contraditórios nas prévias de TV e a captura 19 não representa resultado. Use o relatório visual e recapture esses estados com uma checagem explícita antes de ampliar a matriz para modos, erros e tamanhos ainda ausentes.

**M15 — preparação, empacotamento e documentação têm divergências concretas.**

Onde: `.devcontainer/devcontainer.json`, `.github/workflows/test.yml`, `Dockerfile`, `.dockerignore`, `README.md`, `DEPLOYMENT.md`, `package.json`.

O devcontainer executa testes no `postCreateCommand` sem instalar dependências e sem usar toda a seleção de `npm test`. Em clone limpo, a presença de dependências não está garantida por esse arquivo. Usar instalação determinística com lockfile, testes e inicialização separados; evitar múltiplos servidores em reinícios do ambiente.

O Docker copia todo o contexto antes de instalar. `.dockerignore` não exclui `tmp/` nem `output/`; existem muitos artefatos locais, inclusive centenas de MB de capturas em subpastas temporárias. Isso pode inflar contexto e imagem. Preferir cópias explícitas de manifesto/lock e depois `src/` e `public/`, preservando os arquivos que o runtime realmente lê. Excluir variantes de ambiente, capturas e metadados locais. Validar a imagem a partir de clone limpo.

O repositório GitHub anterior usava `main`; a cópia local usava `master`, e o workflow inicial só disparava em `master`. O gatilho local foi preparado para `main` e `master`. Como o usuário decidiu criar um repositório novo, configurar a branch padrão e validar o workflow no novo destino depois que ele estiver criado. Revisar nomes de rotas retiradas, comandos Windows, quantidade atual de testes, pré-requisitos de Turso, configuração do juiz e instruções de operação. O README afirma que nomes só aparecem no relatório, mas nomes aparecem no placar; corrigir a descrição da privacidade conforme o comportamento real.

Manter Node 24 LTS atualizado dentro da linha suportada, lockfile e política de atualizações. O projeto usar JavaScript sem framework não é evidência de desatualização. A [política oficial de releases do Node](https://nodejs.org/en/about/previous-releases) deve orientar atualização; o teste foi feito em 24.18.0, não em toda versão permitida por `>=24`.

Aceite: clone limpo inicia seguindo apenas o README, Codespace instala tudo, CI executa na branch real, imagem não contém `.env`, `tmp/` ou capturas, healthcheck funciona e arquivos estáticos necessários existem. Links de documentação não apontam para rotas mortas.

**M16 — missões referenciam um desafio mutável e tempos são calculados de maneiras diferentes. Risco funcional confirmado por estrutura, sem reprodução completa.**

Onde: `src/db/schema.sql` (`room_rounds.challenge_id`); `src/db/repositories/arena.mjs:278`, `:329`; `src/server/arena-api.mjs:1095`, `:1138`, `:1266`; `src/server/report-sources.mjs:23`.

Rodadas guardam uma referência ao desafio. Alterações no banco de desafios ou duração podem atingir salas que compartilham o mesmo registro; o detalhe já calcula `other_rooms`, reconhecendo esse vínculo. O relatório consulta o desafio atual. Isso dificulta provar, depois de editar um gabarito, qual versão foi apresentada e usada na avaliação antiga.

Definir uma versão ou cópia imutável do conteúdo, critérios, gabarito e regras no momento escolhido — publicação ou início de rodada. Alterar o catálogo não deve modificar silenciosamente uma missão em andamento ou concluída. Para salas ainda não iniciadas, oferecer atualização explícita quando necessário.

A pontuação desconta duração de pausa inferida pelo prazo, mas ranking/destaques/relatório usam em certos pontos `submittedAt - startedAt`. Portanto, a promessa de não penalizar pausas não está expressa por uma única função para todas as métricas. Definir tempo de parede versus tempo ativo, qual tentativa fornece o tempo de desempate e como representar ambos. Registrar tempo ativo ou eventos de pausa de forma auditável.

Aceite: editar desafio após uma rodada não altera conteúdo histórico nem rubrica registrada; duas salas podem usar versões distintas; alunos empatados não são prejudicados por pausa; relatório e ranking mostram métricas coerentes e explicitamente nomeadas. Antes de migrar dados antigos, marcar versão desconhecida em vez de inventar uma versão retroativa.

**M17 — evoluções condicionadas à expansão.**

Para uma instalação única, priorizar M01–M16. Se o produto passar a atender vários professores/escolas, projetar contas, autorização por sala e administração de acesso antes de expor a instalação compartilhada. Para histórico longo, adicionar retenção e exclusão/anominização seletiva com trilha administrativa e restauração; a exclusão de sala atual não resolve todos os pedidos sobre uma pessoa específica. Não chamar esse item de auditoria jurídica de LGPD.

Como defesa adicional, planejar CSP em modo de relatório antes de bloquear, reduzindo handlers e estilos inline necessários. Não foi encontrado um XSS validado que justifique afirmar exploração; CSP complementa escape/validação. Sessões de aluno com prazo explícito e recuperação assistida podem reduzir permanência de tokens em máquinas compartilhadas. Manter opção de uso simples em sala.

**Roteiro para a IA que vai implementar**

1. Ler este plano, o `README.md`, as regras atuais e os testes. Conferir `git status` e preservar trabalho existente. Reproduzir M01, M02 e M03 em banco descartável. Não usar credenciais/dados reais nos testes.
2. Entregar M01 e M02 com os testes de concorrência e idempotência. Depois M03, M04 e M05 em mudanças separadas. Não alterar fórmulas de pontuação para esconder os sintomas.
3. Resolver M06 e M07 antes de anunciar prontidão para banco remoto e IA. Registrar limites ainda não testados com serviço real.
4. Medir M08 e implementar junto a M09. Guardar comparação de consultas, bytes, latência e resultados; conservar o ranking e as tentativas.
5. Corrigir M10 e M11. Usar testes de foco, clique único, desconexão e reinício. Fazer M12 com exercício real de restauração em ambiente isolado.
6. Extrair módulos por responsabilidade conforme M13, sem mudança simultânea de comportamento. Ajustar UI conforme M14, uma família de telas por vez, com capturas novas antes/depois.
7. Fechar documentação/empacotamento M15 e invariantes históricos M16. Executar `npm test`, `npm run test:browser`, build/boot de contêiner e integração do backend realmente escolhido.
8. Publicar primeiro em homologação com banco separado, exercitar uma turma de 35/50 clientes sintéticos e comparar relatório/placar. Só promover após backup restaurável e plano de retorno. Não executar testes de carga em produção.

Em cada entrega, informar arquivos alterados, defeito resolvido, teste que falhava antes, resultado depois e limitações. Um teste aprovado não autoriza afirmar cobertura de uma tela/estado que não foi exercitado. Não apagar evidências históricas ou atualizar todos os snapshots para fazer uma regressão desaparecer. As mudanças sugeridas neste documento ainda não foram implementadas por esta auditoria.

**Artefatos locais de suporte**

- `output/auditoria-fullstack-2026-09-17/testes-funcionais.log`
- `output/auditoria-fullstack-2026-09-17/testes-navegador.log`
- `output/auditoria-fullstack-2026-09-17/dependencias.json`
- `output/auditoria-fullstack-2026-09-17/verificacoes-isoladas.json`
- `output/auditoria-fullstack-2026-09-17/telas/` (27 PNGs novos)
- `tmp/auditoria-fullstack-probes.mjs` (sondas isoladas usadas nesta auditoria)

Esses artefatos locais podem não acompanhar o clone do GitHub. Os resultados essenciais e as instruções de regressão foram preservados neste plano para que a próxima IA não dependa deles para começar.
