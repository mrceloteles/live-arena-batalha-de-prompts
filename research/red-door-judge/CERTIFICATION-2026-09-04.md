# Certificação técnica do juiz — 2026-09-04

## Conclusão executiva

Esta certificação separa três afirmações que não devem ser confundidas:

1. **Fórmula do pacote-fonte `batalha_prompt.zip`: RECUPERADA INTEGRALMENTE.**
2. **Reimplementação desta fórmula no repositório: REPRODUÇÃO EXATA PARA TODAS AS FIXTURES E SONDAS CONGELADAS.**
3. **Identidade byte a byte com o backend privado historicamente implantado no domínio Red Door: NÃO DEMONSTRÁVEL COM A EVIDÊNCIA DISPONÍVEL.**

O terceiro item não invalida os dois primeiros. Ele apenas evita transformar correlação forte em uma afirmação impossível de provar depois que o servidor original deixou de estar disponível.

---

## 1. Fórmula privada recuperada do pacote-fonte

O arquivo `api.php` do pacote fornecido contém diretamente as funções de avaliação. Portanto, para o pacote-fonte não estamos inferindo a fórmula: temos a implementação.

### Caminho Gemini

Configuração recuperada:

- modelo: `gemini-2.0-flash`;
- temperatura: `0.1`;
- `maxOutputTokens`: `10`;
- timeout: `8 s`;
- resposta esperada: exclusivamente um número de 0 a 100;
- parser: primeiro número decimal positivo encontrado;
- clamp da resposta Gemini: `0..100`;
- precisão: 4 casas decimais;
- falha de chave, HTTP, timeout, resposta vazia ou saída sem número: cai no fallback local.

A instrução pede comparação semântica entre o prompt original e o prompt do jogador, observando sujeito, estilo, iluminação, ambiente, câmera e detalhes.

### Caminho fallback determinístico

A fórmula recuperada é:

```text
base = trim(lowercase(referencePrompt))
user = trim(lowercase(candidatePrompt))

if user == "":
    return 0

textPercent = PHP similar_text(base, user)

baseWords = palavras únicas de base separadas por whitespace, vírgula, ponto ou hífen,
            mantendo apenas palavras com comprimento > 2
userWords = mesma regra

matchedWords = quantidade de userWords para as quais existe uma baseWord tal que:
               userWord == baseWord
               OU baseWord contém userWord
               OU userWord contém baseWord

keywordRatio = matchedWords / count(baseWords) * 100

raw = 0.4 * textPercent + 0.6 * keywordRatio
final = clamp(raw, 5.0, 98.5)
return round(final, 4)
```

Para resposta não vazia, portanto:

```text
percent = round(clamp(0.4 * similar_text_percent + 0.6 * keyword_coverage, 5, 98.5), 4)
```

Resposta vazia é a exceção e retorna exatamente `0`.

Pontos seguem:

```text
points = round(percent * 100)
```

---

## 2. Evidência independente do SQLite do pacote

Três registros armazenados no SQLite do pacote foram recalculados pela implementação recuperada e coincidem exatamente:

| Percentual armazenado | Recalculado |
|---:|---:|
| 29.0710 | 29.0710 |
| 18.6325 | 18.6325 |
| 12.6992 | 12.6992 |

A coluna `fallback_used` não pode ser usada como indicador de execução Gemini: ela existe no schema com default `0`, mas o PHP fornecido não a atualiza.

---

## 3. As 47 observações adicionais

O arquivo `test/judge/source-fallback-47-observations.test.mjs` congela 47 sondas controladas.

Elas incluem:

- identidade exata;
- caixa;
- pontuação;
- acentuação;
- inversão de ordem;
- sujeito isolado;
- estilo;
- câmera;
- iluminação;
- cobertura parcial;
- stopwords;
- stems/substrings;
- repetição;
- conteúdo irrelevante;
- resposta aleatória;
- vazio;
- limites curtos;
- negação;
- contradição;
- paráfrase semântica;
- tradução EN/ES;
- tokenização por hífen/barra;
- repetição do prompt completo;
- tentativa de instrução para forçar nota.

Assinaturas relevantes observadas:

| Sonda | Percentual |
|---|---:|
| prompt exato | 98.5000 |
| vazio | 0.0000 |
| um caractere | 5.0000 |
| stems/substrings | 81.9949 |
| negação com alto overlap lexical | 65.3597 |
| paráfrase semântica PT | 38.5451 |
| tradução EN | 33.5072 |
| tradução ES | 56.2615 |
| conteúdo aleatório | 9.2562 |
| prompt exato + instrução para responder 97.4321 | 95.5779 |

Esse conjunto reproduz a assinatura esperada de um fallback lexical baseado em `similar_text` + cobertura por substring, e não de um avaliador puramente semântico.

---

## 4. Ensaios HTTP remotos no runner hospedado

O arquivo `test/smoke/http-fidelity-operations.test.mjs` sobe o servidor HTTP real, usa `fetch` contra `/api.php` e testa o SQLite real da aplicação.

Foram exercitados:

### Empate

- três jogadores;
- mesmo prompt;
- mesmo relógio de submissão;
- mesma nota;
- mesmo tempo;
- posições retornadas: `1, 1, 1`.

### Timeout

- dois jogadores enviam;
- terceiro não envia;
- após `deadline + 3 s`, respeitando a tolerância interna de 2 s;
- rodada fecha em `results`;
- `all_submitted = true`;
- `all_scored = true`;
- jogador expirado recebe `0%` e `0 pontos`;
- prompt persistido para o timeout é string vazia, igual ao comportamento recuperado do pacote.

### Administração

- senha incorreta: HTTP `401`;
- reset sem token: HTTP `401`;
- relatório autorizado preserva jogadores e resultados;
- reset administrativo abre novo ciclo limpo;
- histórico anterior continua persistido.

### Reinício de processo

- estado é gravado em SQLite de arquivo;
- servidor e conexão são encerrados;
- nova instância abre o mesmo SQLite;
- sala retorna no mesmo estado `playing`;
- três jogadores continuam registrados;
- envio/pontuação já persistidos continuam presentes;
- permanece somente um jogo ativo.

---

## 5. Resultado do CI

Execução final no GitHub Actions:

- commit: `1647f920ebc0706d3f65bdc4cdb7272d12838107`;
- run: `33868645766`;
- Node.js: 24;
- testes: `114`;
- passaram: `114`;
- falharam: `0`;
- skipped: `0`.

Entre os testes verdes estão explicitamente:

- `47 legitimate source-fallback observations remain exactly reproducible`;
- `47 observations preserve the recovered lexical fingerprint`;
- `remote HTTP protocol: admin auth, exact tie, timeout and administrative restart`;
- `remote HTTP protocol: process restart rehydrates persisted classic state`;
- fixtures independentes do SQLite do pacote;
- configuração e fallback do Gemini source-compatible;
- ranking, pontos, idempotência, multiplayer, SSE e ciclo clássico 3x3.

---

## 6. O que podemos afirmar com 100%

### 100% demonstrado sobre o pacote-fonte

Podemos afirmar que **a fórmula completa do fallback privado contida no `batalha_prompt.zip` foi recuperada**, porque seu código-fonte foi diretamente inspecionado.

Também podemos afirmar que **a configuração, instrução, parser, timeout e política de fallback do caminho Gemini presentes nesse pacote foram recuperados**.

### 100% demonstrado sobre nossa implementação

Para o conjunto de contratos formalizados e executados, podemos afirmar que **a nossa implementação reproduz exatamente as fixtures conhecidas do pacote e as 47 sondas adicionais**, e que todos os 114 testes atuais passaram no runner hospedado.

Isso não significa prova matemática para todas as strings possíveis; significa equivalência comprovada dentro da implementação recuperada, fixtures e conjunto de regressão definido.

---

## 7. O único 100% que não pode ser afirmado

Não é tecnicamente legítimo afirmar que o **backend privado historicamente implantado em `reddoor-google26.phygitalapp.com.br` era byte a byte idêntico ao `api.php` fornecido**.

Motivos:

1. o servidor privado nunca expôs seu código PHP diretamente;
2. o domínio original atualmente não resolve DNS, impedindo novas observações black-box;
3. não possuímos manifesto de deploy, imagem de contêiner, commit de produção ou hash do PHP executado pelo servidor;
4. a parte Gemini depende de um serviço externo e de um snapshot/modelVersion que poderia variar no tempo.

Há evidência forte de mesma base implantada — incluindo assets e JavaScript públicos correlacionados com o pacote — mas correlação de frontend não é prova criptográfica do PHP privado.

---

## Veredito

**Fórmula do pacote-fonte: 100% recuperada.**

**Reprodução determinística do fallback na nossa base: 100% compatível com as fixtures e 47 observações congeladas.**

**Fluxos operacionais testados no nosso servidor: 114/114 verdes, incluindo empate, timeout, reinício e administração.**

**Backend privado histórico do Red Door: evidência muito forte de compatibilidade, mas identidade absoluta não certificável sem o artefato privado de deploy ou novas respostas do servidor original.**
