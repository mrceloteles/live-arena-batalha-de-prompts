# Trilhas independentes de investigação e regressão

Este diretório registra três ferramentas complementares, mas operacionalmente independentes. Nenhuma delas é importada pelo motor do site e nenhuma depende da execução das outras.

## 1. `ai-system-testing`

Responsável pelo método de avaliação: datasets dourados, métricas, repetição estatística, comparação entre candidatos e critérios de regressão para saídas não determinísticas.

Entrada típica: casos observáveis autorizados e respostas esperadas.

Saída típica: plano de avaliação, dataset versionado e relatório estatístico.

## 2. `promptfoo-evals`

Responsável pela execução reproduzível da matriz de testes: provedores, prompts candidatos, assertions, repetições, transformações e integração com CI.

Entrada típica: configuração Promptfoo e dataset de casos.

Saída típica: resultados brutos e relatório comparativo.

## 3. `aalpy-state-inference`

Responsável exclusivamente pela descoberta e validação da máquina de estados observável: cadastro, espera, rodada, pontuação, resultados e reinício.

Entrada típica: um adaptador que implementa `actions()`, `reset()` e `step(action)` usando somente a interface normal e autorizada do sistema avaliado.

Saída típica: `model.dot` e `run.json`.

O modelo inferido é uma hipótese baseada nas consultas executadas. Ele não revela nem prova prompts privados, pesos, fórmula semântica de pontuação ou configuração interna do modelo.

## Como elas se apoiam sem se acoplar

- Cada trilha executa sozinha e mantém seus próprios artefatos.
- A integração acontece apenas por arquivos versionados, nunca por imports entre ferramentas.
- AALpy pode identificar sequências e estados que devem virar casos no dataset dourado.
- `ai-system-testing` define se uma diferença é material e qual repetição estatística é necessária.
- Promptfoo executa a matriz definida e produz evidência comparável no CI.
- Falha ou ausência de uma trilha não impede as outras duas de executar.

As versões e referências exatas estão em `skills.lock.json`. Código externo não é copiado para este repositório; cada ferramenta preserva sua licença e origem.

## Skills mantidas pelo projeto

Ficam em `.agents/skills/` e também aparecem em `skills.lock.json`, para a origem do que serviu de base ficar no mesmo lugar onde ficam as versões.

- `.agents/skills/aalpy-state-inference` — descoberta e validação da máquina de estados observável. É uma das trilhas acima.
- `.agents/skills/copia-de-interface` — decidir e cortar o texto visível das telas em pt-BR. **Não** é trilha de investigação nem de regressão: entra no registro pela procedência, porque deriva de três skills públicas (o framework de quatro padrões, a regra de cortar filler e não fato, e a escala de severidade) e nenhuma linha delas foi copiada — a redação é original e adaptada ao pt-BR e à guarda de orçamento deste repositório.
