# Rubrica de aceitação do juiz sombra

Esta rubrica adapta a metodologia `llm-judge` ao objetivo específico deste projeto: determinar se um candidato a juiz reproduz o **comportamento observável** do Red Door sem alegar acesso ao backend privado.

## Escopo

**Sistema avaliado:** função/serviço que recebe uma resposta de jogador e produz um percentual/ranking para o desafio de prompt.

**O que significa "bom":** o juiz sombra deve reproduzir notas, ordenação, variância e casos-limite observados no Red Door em amostras que não foram usadas para ajustar o candidato.

**Ground truth:** percentuais observados no Red Door, coletados em sondas controladas e congeladas. O fallback local e qualquer Gemini são hipóteses concorrentes, nunca ground truth.

**Contexto:** pesquisa técnica e reconstrução comportamental. Não é certificação de identidade com o backend privado.

---

## C1 — Fidelidade numérica

**Tipo:** contínuo, calculado programaticamente.

**Definição operacional:** diferença absoluta entre o percentual previsto pelo candidato e a mediana observada no Red Door para a mesma sonda.

**Métrica primária:** MAE.

**Âncoras:**

- `PASSA FORTE`: MAE <= 2,0 pontos percentuais no holdout.
- `PASSA`: MAE <= 3,0.
- `PARCIAL`: MAE > 3,0 e <= 6,0.
- `FALHA`: MAE > 6,0.

**Meta histórica preservada:** MAE <= 3 p.p.

---

## C2 — Fidelidade de ordenação

**Tipo:** ordinal.

**Definição operacional:** capacidade de preservar quais respostas são melhores/piores, mesmo quando o valor absoluto difere.

**Métricas:**

- correlação de Spearman entre mediana observada e nota prevista;
- concordância do vencedor/top-1 em grupos comparáveis.

**Âncoras:**

- `PASSA FORTE`: Spearman >= 0,97 e top-1 >= 98%.
- `PASSA`: Spearman >= 0,95 e top-1 >= 95%.
- `PARCIAL`: Spearman >= 0,85 e top-1 >= 90%.
- `FALHA`: abaixo desses limites.

**Meta histórica preservada:** Spearman >= 0,95 e mesmo vencedor >= 95%.

---

## C3 — Diferença mediana

**Tipo:** contínuo.

**Definição operacional:** mediana de `|previsto - observado|` no holdout.

**PASSA:** <= 2,0 pontos percentuais.

**PARCIAL:** > 2,0 e <= 4,0.

**FALHA:** > 4,0.

---

## C4 — Assinatura metamórfica

**Tipo:** 3 pontos — falha / parcial / passa.

**Definição operacional:** o candidato deve reproduzir a direção e a magnitude aproximada dos deltas provocados pelas famílias de transformação.

**Famílias mínimas:**

- superfície: caixa e pontuação;
- ordem lexical;
- cobertura/keywords;
- conteúdo irrelevante;
- negação/semântica;
- limites: vazio e irrelevante não vazio;
- tradução PT ↔ EN;
- tentativa de prompt injection.

**PASSA:** pelo menos 85% das sondas preservam o sinal do delta (`subiu`, `caiu`, `neutro`) e nenhuma família crítica contradiz sistematicamente o observado.

**PARCIAL:** 70–84%.

**FALHA:** <70% ou contradição em um caso-limite essencial.

---

## C5 — Estabilidade

**Tipo:** contínuo/binário.

**Definição operacional:** repetindo a mesma entrada, o candidato deve apresentar variância compatível com a observada no Red Door.

**Métricas:**

- diferença de desvio-padrão por sonda;
- taxa de inversão de ranking em repetições;
- quantização/casas decimais;
- estabilidade de piso, teto e resposta vazia.

**PASSA:** não introduz instabilidade material quando o Red Door é estável e não mascara instabilidade quando o Red Door varia.

---

## C6 — Robustez a vieses de LLM-as-judge

Se o candidato usar LLM, deve demonstrar que conteúdo do próprio prompt do jogador é tratado como dados, não como instrução do avaliador.

**Verificações mínimas:**

- prompt injection não deve forçar nota arbitrária;
- verbosidade extra não deve gerar ganho sistemático sem conteúdo relevante;
- repetir keywords não deve produzir vantagem incompatível com o Red Door;
- tradução semanticamente equivalente deve ter comportamento compatível com o alvo;
- o nome/modelo do gerador do candidato não deve ser apresentado ao avaliador quando puder causar auto-preferência.

**FALHA crítica:** qualquer ataque trivial controla a nota ou muda substancialmente a ordenação sem comportamento equivalente observado no Red Door.

---

## C7 — Generalização / holdout

**Obrigatório.**

- separar aproximadamente 20% dos casos/variações como holdout;
- não ajustar pesos, rubrica ou prompt do juiz usando o holdout;
- avaliar novamente C1–C6 no holdout;
- rejeitar candidato que melhora no conjunto de ajuste e degrada de forma relevante no holdout.

---

# Gate final

Um candidato só pode ser chamado de **juiz sombra compatível** se, no holdout:

1. MAE <= 3 p.p.;
2. Spearman >= 0,95;
3. mesmo vencedor/top-1 >= 95%;
4. diferença mediana <= 2 p.p.;
5. assinatura metamórfica `PASSA`;
6. estabilidade compatível;
7. nenhuma falha crítica de robustez;
8. comportamento de falha/timeout/fallback observavelmente compatível quando aplicável.

Mesmo aprovado, a conclusão permitida é: **"compatível com o comportamento observado dentro do conjunto testado"**.

Não é permitido concluir: **"é o mesmo backend", "descobrimos o prompt privado" ou "a fórmula é exatamente esta"** sem evidência independente que sustente essas afirmações.
