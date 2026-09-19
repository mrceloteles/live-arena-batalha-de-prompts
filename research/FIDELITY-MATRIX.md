# Matriz de Fidelidade — Modo Clássico

Fonte-alvo: `reddoor-google26.phygitalapp.com.br`

Esta visão é derivada de `research/fidelity-matrix.json`. O status mede força de evidência, não porcentagem de fidelidade.

## Resumo

- **IDENTICAL:** 0
- **EQUIVALENT:** 13
- **INFERRED:** 8
- **UNKNOWN:** 1

## Itens

| Área | Status | Comportamento | Diferença conhecida |
|---|---|---|---|
| `routes-pages` | **EQUIVALENT** | Superfícies servidas: `/`, `/index.php`, `/tv.php`, `/admin-arena.php`, `/report.php` e a entrada da Arena. As rotas clássicas `/game.php`, `/main.php`, `/wall.php` e `/join.php` foram retiradas de propósito e respondem 404. | A página clássica não é servida: a cópia congelada vive em `evidence/original-public` e o coletivo do `main.php` virou `/tv.php`. |
| `public-assets` | **INFERRED** | Assets preservam a base onde intencionalmente mantidos. | Alguns assets/branding/runtime foram adaptados; a captura é congelada byte a byte por `evidence/** -text`. |
| `api-contract` | **EQUIVALENT** | Ações/campos públicos seguem o contrato do `app.js` capturado. | Backend interno diferente. |
| `registration` | **EQUIVALENT** | Três estações clássicas, consentimento e espera por todos. | Persistência interna diferente. |
| `heartbeat-sync` | **INFERRED** | Heartbeat e sincronização não devem alterar a experiência visível. | SSE não existia na captura. |
| `state-machine` | **EQUIVALENT** | idle → registration → ready → playing → scoring → results/final_results → idle. | Transições são explicitamente server-owned; modelo AALpy limitado ao alfabeto ensaiado. |
| `timing` | **EQUIVALENT** | 3 jogadores, 3 rounds, 60/10/30 s. | SSE pode detectar estado mais cedo que polling. |
| `submission` | **EQUIVALENT** | Envio único, score no servidor e estado retornado. | Idempotência/auditoria mais fortes. |
| `gemini-judge` | **EQUIVALENT** | Gemini histórico source-compatible. | Backend PHP implantado não é observável byte a byte. |
| `fallback` | **INFERRED** | Pacote histórico reproduzido; o fallback vivo devolveu 20% onde a regra histórica devolve 11,7221%. | Faltam amostras para identificar o novo piso/normalização. |
| `retries` | **EQUIVALENT** | Retry não duplica score; falha direta Gemini cai no fallback. | Auditoria interna mais rica. |
| `scoring` | **INFERRED** | Evidência viva: `20%`, 47/60 s = `2.217` pontos, ajuste exato a `percent×100 + tempo restante×1000/60`. | Um único caso não prova os coeficientes universalmente. |
| `round-ranking` | **INFERRED** | Pontos → percentual → menor tempo. | Branch privado de empate não foi capturado. |
| `final-ranking` | **INFERRED** | total_points → avg_percent → menor tempo total. | Agregação privada original não é visível. |
| `tie-break` | **INFERRED** | Critério explícito e posição compartilhada no empate integral. | Apresentação exata do empate não foi observada. |
| `reload-reconnect` | **EQUIVALENT** | F5 recupera estado autoritativo. | Mecanismo de persistência diferente. |
| `timeout` | **EQUIVALENT** | Timeout vazio vivo: envio no deadline, `timeout_empty`, 0%, 0 pontos, sem fallback. | Timeout com prompt não vazio ainda não foi observado. |
| `messages-modals` | **INFERRED** | Copy de espera/Gemini/rede/resultados segue a captura, comparada contra `evidence/original-public/game/station-1.html`. | Algumas mensagens/branding evoluíram e a rota clássica não é servida. |
| `main-screen` | **INFERRED** | A tela coletiva servida é `/tv.php`; a hierarquia do `main.php` capturado segue como referência. | Branding e otimizações podem divergir; a rota clássica não existe mais. |
| `player-screen` | **EQUIVALENT** | A sequência clássica (cadastro → manual → jogo → espera → resultado) está congelada na captura; a superfície do jogador hoje é a entrada da Arena. | Transporte/persistência diferentes; a página clássica não é servida. |
| `admin-observable` | **UNKNOWN** | Entrada/reset/report onde observados. | Pós-login implantado não foi capturado com credencial. |
| `failure-recovery` | **EQUIVALENT** | Falhas não corrompem estado nem duplicam score. | Implementação é internamente mais robusta. |

## Regra

Nenhum item `INFERRED` ou `UNKNOWN` será promovido sem nova evidência ou teste que demonstre equivalência/identidade observável.

## Captura congelada

`evidence/**` é marcado `-text` em `.gitattributes`: o git não converte o EOL da captura, que é byte a byte o que o manifesto registra. Nos HTML capturados o EOL era misto (a maioria CRLF, algumas linhas só LF) e no `wall-illustration.png` — que o site-base serve como SVG, logo texto sem nenhum byte NUL — era só LF; sem a marca, cada checkout reescrevia esses arquivos e os digests deixavam de fechar. Quatro registros de `evidence/manifest.json` foram regravados para os bytes versionados, cada um com a nota em `integrityNote`.

Dois testes sustentam essa promessa: `test/evidence/manifest.test.mjs` (bytes e sha256 contra o arquivo em disco) e `test/evidence/capture-original.test.mjs` (a marca `-text` continua no lugar). A cópia clássica do jogador é comparada com a captura por `test/evidence/classic-copy.test.mjs`.
