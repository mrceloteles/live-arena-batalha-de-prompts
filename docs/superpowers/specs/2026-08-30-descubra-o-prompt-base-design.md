# Descubra o Prompt — Matriz Preservada

## Objetivo

Preservar uma réplica funcional do site `reddoor-google26.phygitalapp.com.br` como ponto de partida privado para futuras versões pedagógicas. A matriz deve reproduzir o comportamento observado antes de qualquer ampliação, redesign ou adaptação curricular.

## Escopo de fidelidade

- três estações fixas: Jogador 1, Jogador 2 e Jogador 3;
- uma tela coletiva (`main.php`), um mural de ranking (`wall.php`), três telas de jogador (`game.php`) e painel administrativo (`admin.php`);
- cadastro com consentimento LGPD, espera por todos, instruções, partida, espera pelo julgamento, resultado da rodada e resultado final;
- três rodadas de 60 segundos;
- ranking de rodada exibido por 10 segundos e ranking final por 30 segundos;
- uma única imagem de referência visível por rodada;
- prompt original mantido secreto durante a partida;
- Gemini como avaliador no servidor;
- percentual, pontos, vitórias, tempo e ranking acumulado;
- sessão recuperável após atualização da página;
- relatório administrativo e exportação CSV;
- aparência e movimentos reproduzidos a partir do HTML, CSS, JavaScript e ativos públicos capturados.

Não fazem parte desta matriz: expansão da turma, novos modos pedagógicos, novas disciplinas, novo design, WebSockets, gamificação adicional ou mudanças nas regras.

## Proveniência

O repositório terá duas áreas claramente separadas:

1. `evidence/original-public/`: respostas e ativos entregues publicamente pelo servidor, preservados sem edição, acompanhados de URL, data e SHA-256.
2. `src/`: implementação executável. O JavaScript/CSS público será preservado quando tecnicamente utilizável. Código e segredos privados do servidor não serão inferidos como se fossem originais; serão reimplementados e identificados como equivalentes.

Logos, nomes e arquivos de marca do Google/Red Door não serão usados na versão executável. O arquivo público pode permanecer somente na evidência privada, com origem documentada, mas a aplicação exibirá um lockup neutro de dimensões equivalentes.

## Arquitetura

Para executar e testar no ambiente disponível, o servidor equivalente será implementado em Node.js 24, sem framework obrigatório, preservando as URLs e contratos do site original:

- `index.php`, `main.php`, `wall.php`, `game.php`, `admin.php` e `report.php` serão rotas compatíveis;
- `api.php?action=...` aceitará POST JSON;
- `public/assets/js/app.js` conservará a lógica pública observada;
- persistência usará `node:sqlite`, com migrações versionadas;
- o avaliador Gemini ficará atrás da interface `Judge`, permitindo modo real e modo determinístico para testes;
- o relógio do servidor será a única autoridade para prazos;
- tokens idempotentes impedirão envio e pontuação duplicados.

## Máquina de estados

`idle -> registration -> ready -> playing -> scoring -> results -> ready` para as rodadas 1 e 2; após a rodada 3: `scoring -> final_results -> idle`.

Transições só podem ocorrer no servidor. O cliente consulta `room_status` e `match_status` nos intervalos observados: 1,0 s, 1,5 s ou 2,5 s conforme a tela. Heartbeat ocorre a cada 2,5 s. O cronômetro local é apenas uma projeção de `server_now` e `deadline_at`.

## Contrato da API

Ações públicas observadas e que serão reproduzidas:

- `register`
- `heartbeat`
- `room_status`
- `start_match`
- `match_status`
- `submit_prompt`
- `retry_score`
- `client_log`
- `metrics`

O backend também terá ações administrativas autenticadas para reiniciar sala, configurar duração, manter o conjunto de rodadas e consultar relatórios. Credenciais e chave Gemini nunca serão enviadas ao navegador.

## Pontuação equivalente

A fórmula privada original não é pública. A implementação equivalente manterá os mesmos campos e a mesma escala observada:

- Gemini recebe o prompt original, a descrição/rubrica da imagem e o prompt do jogador como dado não confiável;
- retorno obrigatório em JSON estruturado com percentual de 0 a 100 e justificativa;
- `points` utiliza uma fórmula versionada e testada, isolada no módulo de pontuação;
- ranking da rodada ordena pontos, percentual e tempo;
- ranking final acumula `total_points`, `avg_percent`, `wins` e tempo total;
- o relatório guarda versão do modelo, versão da rubrica e resposta técnica para auditoria.

Se a fórmula original puder ser determinada futuramente por evidência legítima, apenas o módulo versionado de pontuação será substituído.

## Dados

Tabelas: `settings`, `games`, `rounds`, `stations`, `sessions`, `matches`, `submissions`, `scores`, `events`, `client_logs` e `judge_attempts`.

Dados pessoais serão mínimos. Nome e consentimento serão registrados; prompts e relatórios permanecerão privados. O reset administrativo encerra sessões e cria um novo ciclo sem apagar auditoria histórica.

## Erros e recuperação

- falha de rede mostra o modal já existente;
- reload recupera a sessão por estação e valida o `session_id` ativo;
- Gemini lento entra em fila/retry no servidor;
- `retry_score` é idempotente;
- submissão usa UUID e restrições únicas;
- resultado nunca é somado duas vezes;
- após reinício do servidor, SQLite preserva o estado oficial.

## Segurança

- senha administrativa armazenada como hash;
- cookie de admin `HttpOnly`, `SameSite=Strict`;
- validação de origem e método;
- limites de payload e rate limiting;
- escape de texto e proteção contra prompt injection;
- CSP e headers de segurança;
- nenhuma chave de API ou prompt original no bundle;
- logs não armazenam cookies, credenciais ou chave Gemini.

## Testes e critérios de aceite

1. Manifesto de captura: todo arquivo público referenciado deve existir e ter SHA-256.
2. Contrato: as ações da API devolvem os mesmos nomes de campos observados.
3. E2E: tela coletiva + três jogadores completam três rodadas.
4. Tempo: cliente adulterado não consegue enviar após o prazo do servidor.
5. Idempotência: duplo clique/retry não duplica submissão nem pontos.
6. Reconexão: F5 em qualquer fase restaura o estado correto.
7. Gemini: falha, atraso e resposta inválida não corrompem ranking.
8. Visual: desktop e mobile são comparados às capturas do original; somente marcas removidas podem divergir intencionalmente.
9. Carga: quatro telas simultâneas e rajada de três submissões no segundo final sem perda.
10. Segurança: nenhum segredo no cliente; aluno não executa ação administrativa.

## Preservação no GitHub

O repositório será privado. O primeiro estado validado receberá uma tag imutável `base-original-v1` e uma release com o inventário da captura, limitações conhecidas, instruções locais e configuração Gemini. Versões futuras partirão de branches/tags novas sem reescrever a matriz.
