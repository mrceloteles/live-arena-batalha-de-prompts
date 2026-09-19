# Auditoria da fonte primária — batalha_prompt.zip

Data: 2026-09-03

## Escopo

Fonte primária fornecida pelo usuário: `batalha_prompt.zip`.

Esta auditoria descreve **o comportamento do pacote fornecido**. Ela não prova, por si só, que o backend implantado em `reddoor-google26.phygitalapp.com.br` executava byte a byte o mesmo PHP.

## Juiz Gemini encontrado em `api.php`

A função `scorePromptGemini(string $basePrompt, string $userPrompt)`:

- usa `gemini-2.0-flash`;
- endpoint `v1beta/...:generateContent`;
- temperatura `0.1`;
- `maxOutputTokens = 10`;
- timeout cURL de 8 segundos;
- desativa `CURLOPT_SSL_VERIFYPEER` no pacote;
- pede exclusivamente um número de 0 a 100;
- extrai o primeiro decimal positivo por regex;
- limita a resposta Gemini a 0–100 e arredonda para 4 casas;
- em ausência de chave, HTTP não-200, resposta vazia ou saída sem número, chama `scorePromptFallback()`.

### Instrução literal preservada

O pacote orienta o modelo como um "juiz de precisão semântica" e pede comparação entre prompt original e prompt do jogador, considerando:

- sujeito;
- estilo;
- iluminação;
- ambiente;
- câmera;
- detalhes.

O pacote não contém a proteção explícita contra prompt injection que existe no juiz pedagógico moderno do repositório.

## Fallback encontrado em `api.php`

`scorePromptFallback()`:

1. trim + lowercase UTF-8;
2. resposta vazia = 0;
3. `similar_text()` do PHP para similaridade textual;
4. palavras únicas com mais de 2 caracteres;
5. match de palavra exato ou por substring em ambas as direções;
6. cobertura de palavras calculada contra o total de palavras da referência;
7. `finalScore = 0.4 * similar_text_percent + 0.6 * keyword_ratio`;
8. resposta não vazia limitada a `[5.0, 98.5]`;
9. arredondamento a 4 casas.

## Fixtures encontradas no SQLite do pacote

O arquivo `data/database.sqlite` contém uma partida de três jogadores para o prompt do astronauta.

| Prompt do jogador | Percentual armazenado | Pontos |
|---|---:|---:|
| Astronauta no espaco com capacete refletivo e luz neon dramatica 8k | 29.0710 | 2907 |
| Pessoa com roupa espacial na orbita da terra com estrelas | 18.6325 | 1863 |
| Um homem flutuando no espaco | 12.6992 | 1270 |

Reexecutando a fórmula fallback recuperada, os três valores são reproduzidos **exatamente, casa por casa**:

- 29.0710 → 29.0710;
- 18.6325 → 18.6325;
- 12.6992 → 12.6992.

Isso fornece uma verificação forte de que `src/judge/fake-judge.mjs` reproduz corretamente a fórmula do pacote para essas fixtures.

## `fallback_used` não é evidência do caminho de avaliação

A coluna `fallback_used INTEGER DEFAULT 0` existe no schema, porém a busca no PHP fornecido não encontrou nenhuma escrita/atualização desse campo. Os três registros acima têm `fallback_used=0` embora seus percentuais coincidam exatamente com o fallback.

Portanto:

**não usar `fallback_used=0` como evidência de que Gemini calculou a nota.**

## Separação necessária de candidatos

Passamos a manter três conceitos diferentes:

1. `source-fallback-v1`: cópia comportamental do fallback do pacote;
2. `package-exact-gemini-v1`: réplica de pesquisa do prompt/configuração Gemini do pacote, sem melhorias modernas;
3. juiz pedagógico seguro: rubrica explícita, proteção contra injection, saída estruturada e configuração moderna.

O candidato `package-exact` existe para investigação histórica. Ele não deve substituir automaticamente o juiz pedagógico de produção.

## Confiança após esta auditoria

### Alta

- fórmula fallback do pacote;
- modelo/configuração especificados no código do pacote;
- texto da instrução Gemini do pacote;
- política de fallback em erro;
- pontos = `round(percent * 100)`;
- compatibilidade exata das três fixtures SQLite com o fallback.

### Ainda não demonstrado

- se o servidor Red Door implantado usava exatamente este arquivo `api.php`;
- se havia uma chave Gemini ativa durante todas as partidas;
- qual snapshot/modelVersion o Google resolveu em cada data;
- se havia alterações privadas de prompt, cache, proxy ou configuração no ambiente implantado;
- pares suficientes de entrada/saída capturados diretamente do servidor original para medir MAE/Spearman.

## Próxima evidência decisiva

A investigação deixa de precisar adivinhar o motor do pacote. A próxima pergunta passa a ser exclusivamente:

> **o comportamento do Red Door implantado coincide com `source-fallback-v1`, `package-exact-gemini-v1` ou uma combinação dos dois?**

Essa pergunta será resolvida pelo torneio sobre observações black-box reais/arquivadas, usando MAE <= 3 p.p., Spearman >= 0.95, mesmo vencedor >= 95% e diferença mediana <= 2 p.p. como gate de equivalência operacional.
