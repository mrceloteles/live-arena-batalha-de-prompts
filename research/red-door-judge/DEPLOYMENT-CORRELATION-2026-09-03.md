# Correlação pacote × Red Door implantado — 2026-09-03

## Objetivo

Medir quanto o `batalha_prompt.zip` fornecido corresponde à versão pública capturada de `reddoor-google26.phygitalapp.com.br`.

O domínio deixou de resolver DNS no momento desta verificação, portanto não foram fabricadas novas partidas. A comparação usa:

- `batalha_prompt.zip` fornecido pelo usuário;
- `evidence/manifest.json`, gerado a partir de capturas públicas em 2026-08-31;
- arquivos preservados em `evidence/original-public/`.

## Correspondências byte a byte confirmadas

Os SHA-256 abaixo são idênticos entre o ZIP e a captura pública do Red Door:

| Arquivo | SHA-256 |
|---|---|
| `public/assets/css/app.css` | `0686005777ccedb12c53a4f50c754bc52b870e9778e9359db5459ccd4c1905ae` |
| `public/assets/js/app.js` | `4bb94a2dd57c66047e9f33629f67ae50f07800c928d253dfa21740244ac72cde` |
| `public/assets/figma/battle-prompt-muted.png` | `48f7d30d98677662a6988c741fe443aed6b4a1c5acf4aa24bee0c1894f185949` |
| `public/assets/figma/google-startups-logo.png` | `da97e255f4b4df8d90c38f91a12298930b239e1a39733e88b1179301f88be304` |
| `public/assets/figma/google-startups-muted.png` | `d833a35018d70551df416407530b9405681d8769399e2cdc2dfbf7d9ffcc944a` |
| `public/assets/figma/google-startups-white.png` | `11af9bd7bb659dcc8335c3c799975d708464d563ac46d7575273716ce07128fc` |
| `public/assets/figma/loader.png` | `545b9434be054ed92c96fc273c20c46d2b1e14ef2e9aa6e4d6ebf1f96e2a67fe` |
| `public/assets/figma/manual-illustration.png` | `baa2f7b3db4f87e9df0f810cbe0cf0ba3b426a6c58b548eb54ccf443ef898d8b` |
| `public/assets/figma/manual-instructions-illustration.png` | `8536544d78e86e300db104215dd92ee74c64d7769e9df69c1ba4e7ebd59a9442` |
| `public/assets/figma/player-avatar.png` | `15989b5d4d90deae4beb0896b29b842c0b101ceb41e4f182865520732fbb1e50` |
| `public/assets/figma/prompt-sample.png` | `5aacf1bb517490724a3f1e86caeca57b0fe47e7005c1580837706699fb4b1e51` |
| `public/assets/figma/star.png` | `f2248f2f72a552fa812975bef75c98ba55ebb97b89d18d1bba36be54e1635591` |
| `public/assets/figma/tv-waiting-players-illustration.png` | `54701cdeea9ab8167cd8d17f786772f48b106a072ff8284903f7ce5d745c0a8d` |

### Interpretação

A coincidência exata do JavaScript principal, CSS principal e um conjunto amplo de assets visuais é uma evidência forte de que o pacote fornecido pertence à mesma base de frontend que estava implantada no Red Door capturado.

Em especial, `app.js` contém toda a máquina de estados pública do jogador/telão: cadastro, espera, início, submissão, polling, resultados e ranking. Uma coincidência SHA-256 do arquivo inteiro é mais forte do que mera semelhança visual ou estrutural.

## Diferenças observadas

O site capturado continha alguns recursos adicionais/rotas que não aparecem no ZIP fornecido, por exemplo artefatos de wall/report e alguns assets extras. Isso indica que o ZIP é uma base-fonte muito próxima, mas não autoriza concluir que seja um dump integral do diretório de produção no mesmo instante.

Arquivos PHP também não podem ser comparados diretamente por hash contra HTML capturado, pois a captura contém o **resultado renderizado** do PHP com estado/timestamps dinâmicos, enquanto o ZIP contém o **código-fonte**.

## Correlação do motor de pontuação

Separadamente da correlação de frontend, `PACKAGE-SOURCE-AUDIT-2026-09-03.md` demonstrou que:

- o ZIP contém Gemini `gemini-2.0-flash`, temperatura `0.1`, 10 tokens e timeout de 8 s;
- falhas do Gemini caem para `scorePromptFallback()`;
- o fallback usa 40% `similar_text` + 60% cobertura de palavras;
- três percentuais armazenados no SQLite do ZIP são reproduzidos exatamente pelo fallback reconstruído.

## Conclusão de confiança

### Alta confiança

- o ZIP e o Red Door capturado compartilham a mesma base pública principal;
- a nossa reconstrução do fallback reproduz o motor do ZIP;
- o caminho Gemini source-compatible está especificado diretamente no código-fonte fornecido.

### Não demonstrável com a evidência disponível

- igualdade byte a byte do backend PHP que estava no servidor Red Door;
- se a chave Gemini estava ativa em cada partida do servidor público;
- se o ambiente implantado possuía patches privados não presentes no ZIP;
- equivalência estatística contra 20–30 pares reais do servidor público, pois o domínio não está mais disponível e nenhum dataset público suficiente foi preservado.

## Decisão de implementação

Para a matriz clássica:

- `JUDGE_MODE=fallback` preserva a fórmula histórica local;
- `JUDGE_MODE=gemini` preserva o comportamento source-compatible do pacote, inclusive fallback automático em erro;
- `JUDGE_MODE=gemini-safe` mantém o juiz moderno protegido para evoluções pedagógicas sem contaminar a matriz histórica.

Com isso, as diferenças conhecidas de comportamento do **motor fornecido** foram eliminadas. O único limite restante para declarar 100% em relação ao **servidor Red Door implantado** é evidencial, não uma lacuna conhecida de implementação.
