# Plano de correção — modo do juiz e atualizações ao vivo

> **Para a IA implementadora:** execute o plano tarefa por tarefa, seguindo `superpowers:executing-plans`. Mantenha o escopo nesta correção; não faça migração de framework nem refatoração geral.

**Objetivo:** fazer `JUDGE_MODE` controlar de forma previsível os dois tipos de avaliação e impedir que atualizações ao vivo da sala descartem controles com os quais alunos ou professores estão interagindo.

**Arquitetura:** separar política do provedor (local ou Gemini) do tipo de avaliação (clássica ou por critérios). O servidor cria ambos os juízes a partir de uma única configuração. Na interface, eventos SSE e polling atualizam estado; renderização só modifica partes cujo conteúdo mudou e não substitui controles ativos. Manter o relógio visual local separado das consultas de rede.

**Tecnologia:** Node.js 24, módulos JavaScript ES, `node:test`, HTTP/SSE nativo, Puppeteer nos testes de navegador.

**Referência da auditoria:** `docs/PLANO-MELHORIAS-FULLSTACK-2026-09-17.md` (M07–M10). Este plano detalha e ajusta aqueles itens com os achados específicos abaixo.

**Estado (17/09/2026):** as cinco tarefas foram executadas. Portão 1 **378/378** (8 s); portão 2 **23/23** (218 s) — reconferidos no estado exato que está no disco, depois de a guarda do atributo `hidden` ganhar um controle sintético a mais. As marcações abaixo indicam o que ficou aberto e com que evidência. M08 seguiu separado.

## Evidência e decisão

1. `src/server/start.mjs` seleciona `judge` segundo `JUDGE_MODE`, mas `createApplication` constrói `arenaJudge` separadamente com `createFallbackSafeCriteriaJudge({ apiKey: process.env.GEMINI_API_KEY })`. Assim, `JUDGE_MODE=fallback` pode continuar fazendo chamada Gemini nas avaliações por critérios se houver chave configurada. README e `.env.example` apresentam `JUDGE_MODE` como configuração do juiz; esse contrato está incompleto.
2. Há duas estratégias legítimas: `classicJudge` em `src/server/api.mjs` e avaliações clássicas na Arena; `criteriaJudge` em `src/server/arena-api.mjs` para missões personalizadas. Corrigir isso não significa forçar o mesmo algoritmo de pontuação, e sim fazer a política de provedor valer para ambos.
3. O painel consulta detalhes por SSE e polling. `refreshDetailQuiet` chama `renderDetail`, cujo corpo recebe um novo `innerHTML`; as atualizações SSE não têm ID da sala e o hub as transmite a todos. O teste de navegador que simula redraw precisa de `clicarAte` para repetir o clique, enquanto o próprio helper documenta que isso contorna um alvo DOM substituído.
4. Sala do aluno e TV também consultam a cada 2,5 s como batimento, mas, com SSE recente, só buscam quando passaram 8 s desde a última leitura. Não confundir esse intervalo com o relógio visual local da rodada, atualizado a cada 250 ms.
5. Evidência de TV: `renderTV` chama `setContent` nos estados de sala, rodada e resultado; investigar se `setContent` já evita reconstruções redundantes e preservar essa otimização se existir.

## Restrições globais

- Preservar os contratos de pontuação clássica e por critérios; esta correção trata seleção de provedor, consistência e renderização.
- `JUDGE_MODE=fallback` deve garantir zero chamadas externas de Gemini em qualquer fluxo e mesmo que `GEMINI_API_KEY` esteja preenchida.
- `JUDGE_MODE=gemini` conserva fallback local em erro do provedor nos dois tipos de juiz.
- `JUDGE_MODE=gemini-safe` usa saída estruturada nos dois tipos; erro inválido/fatal deve permanecer explícito, sem cair silenciosamente no modo local. Exigir chave no bootstrap.
- Um modo desconhecido deve falhar no bootstrap com mensagem que lista os modos aceitos; não converter silenciosamente para fallback.
- Não mudar modelo, fórmula, pesos, retentativas ou valores históricos sem teste que demonstre necessidade.
- Não remover SSE nem o polling de recuperação. Reduzir leituras somente depois de medir e manter recuperação após perda de SSE.
- Não modificar o intervalo de 250 ms do cronômetro visual como se fosse polling de rede.
- Não usar repetição automática do clique como único aceite de uma interação enquanto a interface se atualiza.

## Tarefa 1 — Congelar o contrato dos modos para ambos os juízes

**Arquivos:** `src/server/start.mjs`; novo `src/judge/configuration.mjs` (ou módulo equivalente); `test/server/start.test.mjs` (localizar e reutilizar teste de bootstrap, se houver); testes novos/atuais em `test/judge/`.

- [x] Escrever testes de configuração para cada combinação `JUDGE_MODE` × `{classic, criteria}`. Injetar `fetchImpl` espião e assertar que `fallback` nunca chama rede mesmo com chave; `gemini` usa o adaptador existente do tipo correto e retorna fallback em falha; `gemini-safe` exige chave, usa os dois adaptadores estruturados e propaga falha inválida.
- [x] Testar modo omitido como `fallback`, chave ausente nos três modos, chave presente com modo fallback e valor desconhecido (`typo`). Verificar erro no bootstrap/configuração antes de aceitar requisições.
- [x] Executar os testes novos e confirmar falha no caso atual: avaliação por critérios faz chamada quando `JUDGE_MODE=fallback` e a chave existe. (A mordida foi provada trocando a resolução do juiz por critérios pela forma antiga, que lê `process.env`: o teste reprovou com três chamadas a `generativelanguage.googleapis.com`.)
- [x] Centralizar construção dos dois juízes num único ponto. Receber explicitamente `{ mode, apiKey, model, fetchImpl }`; devolver `{ classicJudge, criteriaJudge }`. Manter algoritmo/formato de cada família apropriado, mas derivar ambos da mesma política de modo.
- [x] Ligar a configuração ao `bootstrap` e a `createApplication`. Remover a criação implícita de um juiz de critérios que lê `process.env` separadamente. Manter a injeção `arenaJudge`/`classicJudge` utilizada pelos testes e definir prioridade de injeção explicitamente.
- [x] Reexecutar testes unitários/API de `fallback`, `source-compatible`, `gemini-safe`, `test/api/arena-api.test.mjs` e `test/api/classic-engine-equivalence.test.mjs`.

Arquivos reais: `src/judge/configuration.mjs` (novo), `src/server/start.mjs`, `test/judge/configuration.test.mjs` e `test/smoke/judge-mode.test.mjs` (não existe `test/server/`; o bootstrap é testado no smoke). `bootstrap` devolve `judgeMode` e resolve a política antes de abrir o banco — modo inválido não deixa conexão aberta para trás.

## Tarefa 2 — Documentar comportamento e rastrear fallback

**Arquivos:** `.env.example`; `README.md`; `DEPLOYMENT.md`; `src/judge/criteria-judge.mjs`; `src/judge/source-compatible-judge.mjs`; `src/judge/gemini-judge.mjs`; persistência/relatório de tentativas onde aplicável.

- [x] Atualizar README e `.env.example` com uma tabela curta: modo, provedor por tipo de juiz, comportamento sem chave, comportamento em falha. Não chamar `fallback` de local se qualquer fluxo ainda puder acessar Gemini.
- [x] Manter o modelo efetivamente usado e marcar explicitamente cada pontuação local de fallback nos metadados persistidos, incluindo motivo sem vazar chave ou texto sensível. Inspecionar as estruturas atuais antes de mudar banco; criar migração apenas se os metadados JSON existentes não suportarem o registro.
- [x] Cobrir pelo menos chave ausente, HTTP 429, HTTP 5xx, timeout e resposta estruturada inválida. Verificar que somente o modo que promete fallback o aplica e que relatório distingue pontuação Gemini de pontuação local.
- [x] Executar `node --test test/judge/*.test.mjs test/api/arena-api.test.mjs test/api/classic-engine-equivalence.test.mjs`.

Sem migração: o carimbo (`judge_mode`, mais `provider`/`fallback_used` normalizados) entra no `metadata` que já é persistido no JSON da tentativa — o relatório passa a distinguir nota Gemini de nota local sem depender do prefixo do modelo. Limite registrado: os limites do juiz por critérios foram preservados do que a Arena já usava (12 s, 1 retentativa), com teste próprio, para a correção não mudar tempo de espera dos alunos.

## Tarefa 3 — Reduzir atualizações inúteis e concorrência de consultas

**Arquivos:** `src/server/events.mjs`; `src/server/start.mjs`; `public/assets/js/arena.js`; `test/smoke/arena-room-events.test.mjs`; testes relevantes em `test/browser/`.

- [x] Criar teste de transporte que confirme que evento de sala carrega identificador de sala, mantendo compatibilidade com eventos globais que não tenham sala. Resolver o ID do payload validado no servidor, nunca confiando num ID arbitrário de aluno.
- [x] Fazer a assinatura do detalhe ignorar eventos de outra sala. Documentar que isso reduz leituras por sala, não o número de conexões ou bytes SSE entregues. Se filtro no servidor exigir autenticação adicional, manter o escopo no cliente nesta entrega e registrar a limitação; não abrir canal de dados de sala sem validar autorização.
- [x] Adicionar guarda de uma consulta em voo por superfície (aluno, painel/admin, TV), consolidar eventos SSE recebidos enquanto a consulta corre e executar no máximo uma releitura ao terminar. Descartar resposta atrasada de sala anterior.
- [x] Pular render quando o estado recebido é equivalente ao estado exibido; usar revisão/versão do servidor, se já disponível, ou comparação do subconjunto serializável relevante. Evitar comparar objetos contendo campos voláteis que mudam em cada leitura.
- [x] Preservar polling de recuperação se SSE cair; pausar ou alongar recuperação em aba oculta, retomando com uma leitura imediata ao voltar. Não remover o `EventSource`.
- [x] Acrescentar verificação reproduzível de contagem de requisições em janela definida: estado SSE estável, SSE desconectado, rajada de eventos e aba oculta/retomada. Registrar baseline antes e depois e provar que uma rajada de 20 eventos não abre 20 chamadas simultâneas.

Em aba oculta o caminho escolhido foi **alongar**, não pausar: o tique espaça para um a cada 10 s e voltar dispara leitura imediata. Parar de vez deixaria uma sala parada para quem deixa o painel (ou a projeção) em segundo plano com a aula acontecendo, e isso é comportamento que a suíte de navegador já exercitava. A tabela de consultas por janela é impressa por `test/browser/atualizacoes-ao-vivo.test.mjs` no fim do teste, como baseline comparável.

## Tarefa 4 — Preservar controles e foco no redraw

**Arquivos:** `public/assets/js/arena.js`; `test/browser/arena-ui.test.mjs`; `test/browser/arena-mode-ui.test.mjs`; `test/support/navegador.mjs` somente se um helper de clique único for necessário.

- [x] Adicionar teste de navegador para botão administrativo real (por exemplo `fix-round` ou pausar rodada): enviar um clique uma única vez durante atualizações frequentes e verificar uma única ação/abertura de diálogo. Não usar `clicarAte` nesse aceite.
- [x] Atualizar o corpo do detalhe sem substituir os botões e campos que não mudaram. Preferir atualização localizada com preservação do nó; se manter renderização por markup, aplicar somente quando houver mudança e salvar/restaurar foco, seleção, valor digitado e posição da rolagem de forma testada.
- [x] Cobrir teclado: botão focado continua focado após três atualizações; `Enter`/`Space` executa a ação uma vez; abrir/fechar dobras não volta ao estado padrão por uma leitura idêntica.
- [x] Na sala do aluno, manter valor e cursor do textarea enquanto chega SSE/poll durante digitação; redefinir rascunho apenas ao trocar de missão/fase como já previsto por `lastMissionKey`.
- [x] Inspecionar `setContent` da TV: se já evita troca quando tipo/conteúdo não mudou, adicionar teste de estabilidade de identidade/foco ou documentar a exceção; se não evita, condicionar a render ao estado alterado sem interromper countdown nem animação.
- [x] Rodar teste de browser dos fluxos alterados e toda suíte `npm run test:browser`.

`setContent` continua substituindo o conteúdo quando é chamado; quem evita a reconstrução é a comparação de estado em `refresh` (comentário no código diz por que a guarda não é duplicada dentro de `setContent`). O clique do aceite é despachado dentro da página — um gesto, sem repetição — porque `page.click` do Puppeteer resolve o nó e clica depois, medindo a corrida do próprio Puppeteer; `clicarAte` continua no setup. `test/support/navegador.mjs` não precisou de helper novo.

## Tarefa 5 — Validar a integração e atualizar o plano geral

**Arquivos:** `docs/PLANO-MELHORIAS-FULLSTACK-2026-09-17.md`; este plano; testes de integração afetados.

- [x] Atualizar M07, M09 e M10 no plano geral para apontar para este documento e registrar os critérios concluídos, sem duplicar soluções divergentes. Manter M08 separado: redução de consultas SQL/tamanho de payload precisa de medição própria.
- [x] Rodar `npm test` e `npm run test:browser`; investigar e corrigir falhas introduzidas antes de concluir.
- [x] Revisar `git diff --check`, os arquivos modificados e logs de teste. Confirmar que nenhuma configuração `fallback` enviou requisição externa e que o clique/foco sobrevive à sincronização ao vivo.

Duas falhas foram corrigidas no caminho e merecem registro: o teste do ajuste de tempos esperava o diálogo pelo formulário, e o markup do diálogo anterior continuava no DOM depois de fechar — a condição agora exige o diálogo aberto; e a suíte de navegador exercita páginas em segundo plano, que foi o que definiu "alongar" em vez de "pausar" no item de aba oculta.

## Critérios de conclusão

- Os três modos têm resultado documentado e testado para juiz clássico e juiz por critérios.
- `fallback` tem zero tráfego Gemini com ou sem `GEMINI_API_KEY`.
- Respostas atrasadas e rajadas de SSE não criam consultas paralelas nem substituem a sala selecionada.
- Uma ação real do professor funciona com um clique durante atualização e o foco/rascunho não se perde.
- Polling continua recuperando estado quando SSE não está disponível; temporizador visual continua correto.
- Testes unitários, de API e de navegador relevantes passam, seguidos das duas suítes completas.
