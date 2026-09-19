# Laboratório black-box do juiz Red Door

Este diretório aplica a metodologia do `prompt-eval-harness` a um problema de engenharia reversa comportamental: medir o juiz observado sem assumir acesso ao backend, ao prompt privado ou à configuração privada do modelo.

## Regra central

O primeiro objetivo não é provar qual fórmula o Red Door usa. É produzir um **dataset observacional congelado** que permita eliminar hipóteses com evidência.

O prompt de referência privado do Red Door é desconhecido. Por isso, comparar imediatamente o nosso `sourceFallbackPercent()` com o Red Door pode gerar uma conclusão falsa: a diferença pode vir do prompt secreto, não da fórmula do juiz.

## Procedimento — fase 1

1. Escolha **um único desafio** e mantenha-o fixo durante toda a coleta.
2. Escreva manualmente um prompt-base plausível para a imagem desse desafio.
3. Gere as 12 sondas:

```sh
node research/red-door-judge/probe-lab.mjs init "SEU PROMPT BASE AQUI"
```

4. Execute cada `candidate_prompt` no mesmo desafio do Red Door.
5. Faça **pelo menos 3 execuções por sonda** e registre cada percentual em `probes[].runs`.
6. Alterne/randomize a ordem das sondas entre repetições para não confundir efeito de ordem, sessão ou tempo com efeito do prompt.
7. Depois de terminar a coleta, preencha `frozen_at` com timestamp ISO-8601. A partir daí o arquivo é considerado congelado: não edite os prompts nem remova resultados.
8. Gere o relatório:

```sh
node research/red-door-judge/probe-lab.mjs report
```

## O que as 12 sondas discriminam

- `P01_BASELINE`: ponto de referência.
- `P02_CASE`: normalização de caixa.
- `P03_PUNCTUATION`: normalização de pontuação.
- `P04_REORDER`: importância da ordem lexical.
- `P05_COMPACT`: cobertura de palavras de conteúdo sem conectivos.
- `P06_HALF_WORDS`: resposta da nota à perda de cobertura.
- `P07_STUFFING`: vulnerabilidade a repetição de keywords.
- `P08_IRRELEVANT_TAIL`: penalização por conteúdo extra/irrelevante.
- `P09_NEGATION`: sensibilidade semântica à negação.
- `P10_EMPTY`: piso da resposta vazia.
- `P11_RANDOM`: piso da resposta não vazia irrelevante.
- `P12_INJECTION`: indício de LLM-as-judge suscetível a instruções dentro do candidato.

## Métricas produzidas

O relatório calcula por sonda:

- média;
- mediana;
- desvio-padrão;
- delta contra a mediana do baseline.

A mediana é a métrica primária porque reduz a influência de uma execução anômala. O desvio-padrão serve para verificar se existe não determinismo relevante.

## Critério de interpretação

Não concluir arquitetura por uma única sonda. Procurar assinaturas combinadas.

Exemplos:

- `CASE ≈ BASELINE`, `PUNCTUATION ≈ BASELINE` e queda forte em `REORDER` favorecem normalização superficial + componente textual sensível à sequência.
- `COMPACT` alto e `STUFFING` sem ganho importante favorecem cobertura sem simples contagem de repetição.
- `NEGATION ≈ BASELINE` sugere fraca compreensão semântica; queda forte favorece componente semântico/LLM.
- `RANDOM > EMPTY` com piso estável pode revelar clamp mínimo para respostas não vazias.
- alta variância entre repetições sugere modelo não determinístico, backend variável ou outro estado oculto.

## Fase 2 — somente depois do congelamento

Depois que `observations.json` estiver congelado, comparar candidatos na mesma amostra:

1. fallback exato recuperado do pacote (`sourceFallbackPercent`);
2. variantes de pesos/normalização;
3. juiz Gemini com temperatura travada;
4. rubricas alternativas.

Para cada candidato, medir pelo menos:

- MAE entre percentual previsto e observado;
- correlação de Spearman;
- concordância do vencedor/ordenação;
- erro por família de sonda;
- estabilidade em repetições.

Guardar uma parte das observações como **holdout** para validar o candidato final e evitar ajustar a fórmula ao próprio conjunto usado na investigação.

## Limite técnico

Este laboratório reconstrói comportamento observável. Ele não demonstra acesso nem identidade com o backend privado original. Uma hipótese só sobe de confiança quando explica simultaneamente várias sondas e continua funcionando no holdout.
