# Prompt para gerar o novo frontend da Live Arena

Crie um protótipo completo e navegável de um novo frontend para **Live Arena — Batalha de Prompts**, uma experiência educacional de engenharia de prompts, conduzida ao vivo por um professor. A base funcional descrita aqui já existe. Seu trabalho é redesenhar sua apresentação, cobrindo todas as telas e estados, e entregar código que depois possa ser conectado ao backend existente.

Use o ZIP `stitch_phygital_reddoor_web_experience.zip` como direção visual principal. Aproveite substancialmente suas composições, hierarquia, tipografia, cores e componentes. O resultado deve ter uma aparência nova e coerente, preservando a identidade Live Arena / Batalha de Prompts. **Não exiba logos Google, Google for Startups, marcas de fornecedores ou indicação de parceria com eles.** Isso é uma restrição de identidade visual, não uma ordem para remover integrações técnicas legítimas do sistema existente.

O projeto original está em `C:/Users/Marcelo/Downloads/live-arena-identidade-ajustada/batalha-de-prompts-main`. O ZIP de referência está em `C:/Users/Marcelo/Downloads/stitch_phygital_reddoor_web_experience.zip`. Se você não tem acesso a esses caminhos, use os anexos enviados pelo solicitante. Os caminhos relativos citados abaixo são referências para integração posterior.

## 1. Entrega e limites

Entregue um frontend HTML/CSS/JavaScript, com componentes visuais reutilizáveis, assets locais e dados fictícios separados em arquivos. Prefira a estrutura atual em JavaScript sem framework. Se sua plataforma exigir um framework, isole a apresentação e entregue um mapa de adaptação para a estrutura atual; não afirme que basta trocar arquivos.

Crie um índice de navegação do protótipo e um seletor de estados demonstrativos fora da interface do produto. Todos os estados deste documento devem ser acessíveis sem servidor, credenciais ou API de IA. Os dados simulados devem vir de uma única camada substituível por chamadas reais. Diferencie navegação do protótipo e controles reais da aplicação.

Não crie backend, autenticação própria, novo banco, novas regras de pontuação ou cobrança. Não replique cálculos de ranking e avaliação no frontend. Não inclua recursos fictícios como chat, pagamentos, assinaturas, geração de imagens, login Google, recuperação de senha por e-mail ou perfis sociais.

Os HTMLs estáticos anteriormente exportados são apenas cascas e não mostram todo o produto: muitas telas são preenchidas pelo JavaScript. Não use essas cascas vazias como inventário completo.

## 2. Pessoas e funcionamento geral

- **Professor:** entra com senha administrativa, cria salas, escolhe desafios e aulas, controla rodadas, acompanha respostas, avalia o andamento, abre a projeção e consulta relatórios.
- **Aluno/competidor:** entra com código da sala e nome; aguarda, escreve prompts, recebe avaliação, melhora quando permitido, acompanha classificação e participa de votos/desafios coletivos.
- **Público na TV/projetor:** vê uma apresentação da sala, participantes, missão, tempo, competição e resultados. Essa superfície não é um painel de administração.

A sala é a unidade da experiência. Possui identificador interno, código de entrada, título, preset, capacidade, participantes, missões, estado e resultados. Professor, aluno e TV acompanham a mesma sala em tempo real. Uma mudança de estado atualiza a apresentação sem exigir recarregar a página inteira.

Distinga sala, missão/rodada, tentativa, avaliação e pontuação acumulada. Uma resposta recebida ainda pode estar aguardando avaliação. Zero pontos não significa necessariamente ausência de nota. Porcentagem, pontos e notas por critério devem manter suas unidades e valores recebidos do servidor.

## 3. Inventário de páginas e referências estáveis

Use estes IDs no protótipo e no documento de integração. São identificadores de documentação novos, não endpoints existentes.

| ID | Tela | Rota real | Implementação principal |
|---|---|---|---|
| LA-01 | Portal | `/` e `/index.php` | `src/web/pages/index.mjs`, `indexPage` |
| LA-02 | Entrada do aluno | `/play`, alias `/arena.php` | `arenaPage`; `public/assets/js/arena.js` |
| LA-03 | Área do aluno e estados da partida | mesma `/play` | `renderLobby`, `renderMission`, `renderResults`, `renderRanking`, `renderHighlights` |
| LA-04 | Login do professor | `/admin-arena.php` sem sessão | `adminArenaPage(false)` |
| LA-05 | Painel do professor | `/admin-arena.php` autenticado | `adminArenaPage(true)`; `renderGate`, `renderRooms` |
| LA-06 | Detalhe e controle de sala | dentro do painel | `renderDetail`, `renderReport` em `arena.js` |
| LA-07 | Banco/editor de desafios | dentro do painel | `renderChallenges` e formulários dinâmicos em `arena.js` |
| LA-08 | Aulas e trilhas | dentro do painel | `renderLessons`; `src/domain/arena-lessons.mjs` |
| LA-09 | TV e conexão à projeção | `/tv.php` | `tvPage`, `renderTV` em `arena.js` |
| LA-10 | Prévia do aluno | `/aluno-preview.php?room=ID` | `renderPreviewMission`, `renderPreviewBar` |
| LA-11 | Prévia da TV | `/tv-preview.php?room=ID` | `renderTvPreview` |
| LA-12 | Relatório geral | `/report.php` | `reportPage`; `public/assets/js/app.js` |
| LA-13 | Página inexistente | rota desconhecida | `notFoundPage` |

`/admin.php` apenas redireciona para o painel. Não recrie as rotas antigas `/game.php`, `/main.php`, `/wall.php` ou `/join.php`: foram removidas. O preset Clássico continua existindo dentro do motor atual de salas.

## 4. LA-01 — Portal

Marca Live Arena, título “Descubra o PROMPT” e ação principal “Entrar na Arena”, direcionada à entrada do aluno. Preserve uma entrada simples e rápida, sem manifesto, parágrafos promocionais, listas de benefícios ou blocos redundantes. Não transforme a tela inicial em um dashboard.

## 5. LA-02 — Entrada do aluno

Campos: código da sala (`name="code"`, até 10 caracteres no input, teclado numérico) e nome (`name="name"`, até 60 caracteres). Código recebido pelo parâmetro `pin` do link pode vir preenchido. Botão Entrar, mensagem contextual e retorno ao início.

Represente: tela inicial, envio, código inválido/inexistente, entrada global fechada, sala fechada/bloqueada, capacidade atingida, nome inválido/duplicado, falha de conexão, entrada concluída e recuperação de sessão válida.

Não crie cadastro obrigatório por e-mail/senha para alunos. Há dados de perfil e registros históricos no backend e relatório, mas isso não transforma a entrada atual em um cadastro corporativo. Nome e PIN sozinhos não autorizam recuperar a identidade de outro aluno. Uma reentrada de participante removido segue a decisão do backend.

## 6. LA-03 — Área do aluno

### Espera e cabeçalho

Exibir sala, código, quantidade conectada, identidade quando disponível e Sair. Na espera, chamada curta, ilustração e lista de participantes. Mostrar estados sem participantes, aguardando professor, intervalo entre missões, sala encerrada e sessão inválida/removida. A conexão instável usa aviso discreto com reconexão; preserve o texto digitado durante atualizações.

### Missão em andamento

- Número/progresso da missão, modalidade, título, instruções e contexto quando houver.
- Cronômetro, pausa e variante sem cronômetro; o tempo vem do estado do servidor.
- Referência visual quando existir, com ampliação e fechamento por toque/botão/teclado.
- Prompt original ou cenário de partida nas modalidades que precisam deles.
- Campo de prompt (`name="prompt"`), contador, limite aplicável e tentativas disponíveis/usadas.
- Ação Enviar prompt, atalho Ctrl+Enter e confirmação contextual.
- Layout separando leitura da missão e redação; no celular, ordem clara sem rolagens internas concorrentes.

Não mostre o gabarito do juiz ao aluno. Não o esconda apenas por CSS: ele não deve estar nos dados ou HTML dessa superfície.

### Envio e recuperação

Represente prompt vazio/inválido, limite excedido, enviando, recebido e aguardando nota, juiz temporariamente indisponível com resposta guardada, avaliação recuperada, falha recuperável, tentativa esgotada, tempo encerrado e missão pausada.

Uma nota pendente não deve parecer erro definitivo nem nota zero. O aluno pode receber a nota automaticamente depois; reenviar uma tentativa já aceita não deve consumir uma nova tentativa ou criar outro registro. O protótipo demonstra essa sequência por estados simulados, sem implementar regras próprias.

### Resultado individual

Nota/pontos com unidade correta, feedback, critérios expansíveis, evolução entre tentativas quando disponível e “Melhorar prompt” somente quando permitido. Preserve o prompt enviado para consulta. Ao terminar as tentativas, o campo/botão precisa refletir o bloqueio real.

### Classificação e encerramento

Resultados por missão, classificação geral, posição, nome, pontuação e demais métricas disponíveis. Pódio com primeiro, segundo, terceiro e demais colocados, adaptação para menos de três participantes e empates conforme classificação recebida.

Destaques quando existirem: maior pontuação, mais preciso, melhor contexto, mais eficiente, maior evolução, melhor refinamento, melhor sprint e melhor descrição visual. Não fabrique vencedor/destaque quando não houver dados suficientes.

## 7. Presets e modalidades

Presets de sala, definidos em `src/domain/presets.mjs`:

| Chave | Comportamento |
|---|---|
| `classic` | Clássico: três jogadores, três rodadas de 60 segundos, referência visual e regras originais; configurações fixas do preset |
| `turma` | Batalha clássica para até 50 participantes; padrão 35; três rodadas de 60 segundos |
| `personalizado` | Missões escolhidas pelo professor, juiz por critérios, tempo por desafio e avanço controlado pelo professor |
| `arena` | Missões por critérios com a camada coletiva Turma vs. Juiz |

Capacidade, controles disponíveis, início permitido e progressão devem ser apresentados conforme o backend. Não trate os quatro presets como rótulos intercambiáveis.

Modalidades do banco: `precisao` (Precisão), `contexto` (Contexto), `sprint` (Sprint), `essencial` (Prompt Essencial), `completo` (Prompt Completo), `resgate` (Resgate), `diagnostico` (Diagnóstico), `refinamento` (Refinamento), `reversa` (Engenharia Reversa), `briefing` (Briefing de Cliente), `boss` (Boss Battle) e `livre` (Livre).

Essencial tem limite específico de 250 caracteres. Completo apresenta os elementos esperados — contexto, instruções, restrições, público, formato, critérios e resultado esperado. Resgate apresenta um prompt inicial para melhorar; Diagnóstico um cenário incompleto; Refinamento enfatiza evolução; Reversa usa referência visual; Briefing apresenta a demanda do cliente. As instruções efetivas vêm do desafio cadastrado.

**Boss Battle é uma modalidade de desafio; Arena — Turma vs. Juiz é um modo coletivo.** Não fundir os dois conceitos.

## 8. Modo coletivo Arena — estados do aluno, professor e TV

Todos escrevem. Três competidores são selecionados para a Arena e a turma participa de atividades coletivas contra o Juiz IA. Há resultado individual e resultado coletivo simultaneamente.

Fases canônicas: `mission`, `select`, `wildcard`, `arena`, `dynamic`, `reveal`, `finished`. Use essas chaves no mapa do protótipo. Nem todo fluxo precisa exibir todas as fases; respeite os estados recebidos.

Mostrar rodada atual/total, vida do Juiz, energia da turma, competidores, time quando habilitado, ataques restantes e resultado coletivo. Padrões: três rodadas, cinco corações, dois ataques por rodada, limiar de 60% de acerto entre respondentes para causar dano. O professor pode configurar os valores dentro dos limites existentes.

### Wild Card

Alternativas de prompts anônimos para escolher uma vaga, seleção registrada e possibilidade de trocar voto enquanto a janela estiver aberta. Participante que concorre ao Wild Card pode receber estado “não pode votar”; mostrar o motivo. Encerramento e revelação pelo professor. Não revelar nomes antes do servidor autorizar.

### Dinâmicas coletivas

Catálogo existente: Prever o vencedor (`prever`), Caçada ao erro (`cacada`), Comparação A × B (`comparacao`), Júri especialista (`juri`), Previsão + confiança (`calibracao`), Vote → revele → vote (`mudanca`), Conselho da turma (`conselho`) e Revisão V1 → V2 (`v1v2`).

Pergunta, prompt de referência, alternativas, pista e níveis de confiança vêm dos dados. Mostrar escolha, envio, voto registrado, janela encerrada, resultado e ausência de voto. O renderer atual usa alternativas e confiança quando solicitada; não invente um novo editor ou uma nova operação apenas porque o nome de uma dinâmica sugere isso.

Quando há voto aberto, o voto é a ação principal e substitui a missão na área central. Na revelação, mostrar acertos/total, limiar, “dano no Juiz” ou “Juiz resistiu”, e resultado do voto do aluno. Nem toda dinâmica causa dano: calibração, conselho e revisão têm finalidades próprias.

### Energia, times e poderes

Times temporários PIXEL, NEURAL e BYTE quando habilitados. Poderes: Revelar pista (10 de energia), Conselho da turma (20), Revisão (30), Regra especial (40). Estados bloqueado, disponível e usado; a ativação pertence ao professor. Desenhar o efeito/informação que o backend entregar, sem criar regras novas.

### Professor e fim da partida

Professor pode sortear competidores, fechar Wild Card, abrir dinâmica, revelar resultado, avançar rodada, reorganizar times, ativar poderes e reiniciar partida. Mostrar rotação — quantos alunos já participaram — e histórico de ataques.

Configuração: rodadas 1–6, corações 1–10, limiar 5–100%, ataques por rodada 1–3, times e poderes. Informar quando uma mudança só vale para partida nova.

Fim com veredito coletivo, campeão da Arena, melhor analista, mestre da calibração e maior evolução quando existirem. A TV não deve voltar a “aguarde iniciar” depois da vitória coletiva.

## 9. LA-04/05 — Login e painel do professor

Login administrativo por senha, estados enviando, senha incorreta, limite de tentativas e sessão expirada. Retorno ao portal. Não inventar cadastro de professor ou login social.

Painel com visão geral, salas, banco de desafios, aulas/trilhas, acesso ao relatório e saída. Mostrar controle global de abertura/fechamento de entrada e situação atual. Dados administrativos aparecem apenas na superfície autenticada.

Lista de salas com título, código, preset, situação, participantes/capacidade, andamento e ações permitidas. Estados: lista vazia, carregando, com dados, erro; sala em rascunho, aguardando, jogando, encerrada e arquivada.

Criação: título até 120 caracteres, preset, capacidade aplicável, seleção de missões quando permitida e ajustes do modo Arena. Edição: título, limite e bloqueio de entrada conforme estado da sala. Exibir campos fixos/inaplicáveis corretamente para cada preset.

Abrir sala valida pendências: imagem ou gabarito ausentes, entre outras decisões enviadas pelo backend. Mostrar qual missão precisa de correção e ação para abrir diretamente o campo relevante; não apresentar apenas “erro genérico”.

## 10. LA-06 — Controle detalhado da sala

- Código grande, copiar código, copiar link do aluno e QR de entrada.
- Abrir projeção e instruções/código/QR para outro aparelho.
- Título, preset, situação, capacidade e participantes conectados.
- Iniciar batalha/missão, pausar, retomar, encerrar rodada, fechar resultados, avançar conforme permitido e encerrar sala.
- Editar sala, bloquear/liberar entrada, arquivar quando encerrada e excluir nos estados permitidos.
- Participantes: identificação, situação, desempenho disponível, renomear e remover com confirmação apropriada.
- Missões: ordem, título, modalidade, tempo, estado, prontidão e ações de adicionar, remover, mover para cima/baixo e corrigir.
- Ajuste de tempos por missão, sugestões, tempo total e variante sem cronômetro.
- Prévia do aluno e prévia da TV sem iniciar partida nem consumir tentativa.
- Resultado da sala: médias por rodada/critério, classificação, resultados individuais e destaques disponíveis.
- Origem da avaliação no detalhe do professor: provedor/modelo ou juiz local e motivo disponível. Não anunciar como IA externa uma avaliação local.
- Painel “quem ainda espera nota”: participante, missão, tempo de espera, motivo e se volta automaticamente. Estados na fila, avaliando, retomada prevista, esgotada, encerrada ou fora da janela. Limitar leitura inicial e resumir excedentes; desaparecer quando resolvido.

Atualizações ao vivo não podem fechar formulários, perder foco, apagar edição nem fazer o clique atingir outro elemento.

### Sorteio independente

Ferramenta auxiliar de sorteio com modo, tamanho do grupo, participantes sorteados, nova seleção, definição do vencedor, histórico/chaveamento e reinício. No modo livre os participantes continuam elegíveis; no mata-mata perdedores saem e vencedores avançam. Consulte as opções do código, não invente torneios. Esta ferramenta não altera automaticamente notas ou missões e não é o mesmo sorteio de competidores do modo coletivo.

## 11. LA-07 — Banco de desafios, editor e correção em lote

Listagem com identificação, modalidade, categoria e informações resumidas. Criar, editar, duplicar, excluir e selecionar para sala. Tratar exclusão recusada por desafio em uso. Listas e seletores devem respeitar os filtros existentes, sem criar filtros sem contrato.

Editor completo:

| Campo técnico | Apresentação/limite existente |
|---|---|
| `challenge_id` | identificador interno ao editar |
| `title` | título, até 120 caracteres |
| `modality` | modalidade do catálogo |
| `category` | categoria; opções atuais incluem Fundamentos, Texto, Imagem, Documentos, Refinamento, Reversa, Briefing e Avançado |
| `mission` | instrução da missão, até 4.000 caracteres |
| `context` | contexto, até 4.000 |
| `expected_result` | resultado esperado, até 4.000 |
| `reference_text` | gabarito privado do juiz, até 8.000 |
| `reference_image` | imagem de referência persistida |
| `reference_image_file` | upload PNG/JPEG/WebP; interface anuncia aproximadamente 1,4 MB |
| `reference_image_url` | alternativa por URL, com validação existente |
| `criteria`, `weight_*` | critérios selecionados e pesos |
| `attempts` | uma, duas ou três tentativas conforme validação |
| `duration_seconds` | duração e opção sem cronômetro quando suportada |
| `speed_weight` | peso de velocidade conforme opções existentes |

Critérios: objetivo, contexto, público, formato, restrições, criatividade, clareza, concisão, especificidade e estrutura. Não confundir esses critérios do juiz com alternativas de uma dinâmica coletiva.

Formulário com detalhes progressivos, prévia da imagem, erro junto ao campo, salvando, sucesso e falha. Uma única rolagem principal no diálogo; último campo e salvar alcançáveis.

Correção em lote: abrir todas as missões pendentes de uma sala, preencher referências/gabaritos em uma tela, usar o preenchimento a partir de texto colado já oferecido pelo produto, revisar e salvar o lote. Mostrar pendências restantes e atalho para corrigi-las. Não simular sucesso parcial como sucesso completo.

Adicionar missão a uma sala permite selecionar um desafio existente e conferir sua prévia. Remover da sala não equivale a apagar do banco.

## 12. LA-08 — Aulas e trilhas

Quatro conjuntos atuais: Aula 2 — Fundação (`aula2-fundacao`), Aula 3 — Controle do resultado (`aula3-controle`), Aula 4 — Multimodal e visual (`aula4-visual`), Aula 5 — Arena final (`aula5-final`).

Cartões com resumo expansível, lista de missões/modalidades e ações “Adicionar à sala” e “Só criar no banco”. Selecionar sala quando necessário; mostrar a ação indisponível quando faltar destino elegível. As aulas adicionam desafios existentes/reutilizáveis conforme backend, não devem duplicar conteúdo por decisão do frontend. Missões que precisam de imagem/gabarito continuam passando pela checagem de prontidão.

## 13. LA-09 — TV/projeção

Pensada para leitura à distância em 16:9: poucas informações por vez, títulos grandes, cronômetro legível, referências visuais amplas. Sem controles de professor, gabaritos, tokens visíveis ou dados pessoais administrativos.

Conexão: código de projeção recebido no painel, carregando/validando, inválido/expirado, sala autorizada, perda e recuperação de conexão. Botão tela cheia.

Estados: espera com participantes; missão/rodada; pausa; sem cronômetro; sorteio; fases coletivas; resultado de rodada; ranking/pódio final; veredito coletivo; sala encerrada. Compartilhar componentes visuais e dados com aluno/professor sem tornar as três superfícies idênticas.

## 14. LA-10/11 — Prévias

Professor navega pelas missões da sala como o aluno as verá, e pelos estados de espera/rodada/resultado/final da TV. Exibir claramente “Prévia”, navegação anterior/próxima, retorno ao painel e pendências de conteúdo. Exemplos de resultados devem ser marcados como exemplos quando não houver partida real.

Prévias não inscrevem participantes, enviam prompts, alteram pontuação nem iniciam partida. A abertura de uma projeção real é ação distinta da prévia.

## 15. LA-12 — Relatório analítico

Filtro por data inicial/final, aplicar filtro, período aplicado, horário de atualização, voltar ao painel, exportar CSV e controles de impressão/sessão que o código atual oferecer. Não acrescente novos filtros sem informar que exigiriam implementação.

Indicadores principais: participantes, envios, acerto médio e tempo médio. Indicadores adicionais expansíveis: pessoas únicas, jogos, pontuadas/taxa de conclusão, melhor nota, pico por dia, pico por hora, PCs ativos e avaliações locais/fallbacks.

Gráficos: atividade diária, pontuadas por hora, rodadas pontuadas e média, mapa de calor dia × hora.

Tabelas:

- Ranking: posição, jogador, e-mail, cargo, empresa, PC, rodadas, pontos, precisão, melhor nota e tempo médio.
- Cadastros: data, PC, jogador, e-mail, cargo, empresa e modo.
- Partidas/respostas: início, jogador, PC, rodada, status, nota, tempo, pontos e prompt enviado; conteúdo adicional de imagem/referência conforme renderer existente.
- Operacional: comparação por computador, por modo, jogos e rodadas do evento.

Dados ausentes devem aparecer como ausentes; campos históricos não justificam inventar um cadastro novo. Prompts longos e imagens precisam de consulta sem desmontar a tabela. Exportação inclui os dados reais do conjunto consultado e deve preservar a proteção existente contra fórmulas em CSV. Impressão mantém cabeçalhos e conteúdo legível. Prever período vazio, carregando, erro e sessão expirada.

## 16. Estados transversais e direção visual

Cada componente relevante precisa de estado vazio, carregando, preenchido, erro, desabilitado, foco, seleção e sucesso. Não use toasts como única forma de comunicar um erro em formulário. Confirmações devem explicar a ação sobre sala/participante/partida.

Priorize 390 px para aluno, 1440 px para professor, 1920×1080 para TV; valide também 360 px e tablet. O aluno deve enxergar sua próxima ação, o professor deve operar rapidamente e a TV deve ser legível à distância. Reduza textos repetidos. Use detalhes expansíveis para explicação secundária, sem esconder a ação principal.

Estabeleça tokens para cores, tipografia, espaçamento, bordas, sombras e estados. Preserve contraste, teclado, foco visível, labels, mensagens acessíveis e preferência por movimento reduzido. Animação de nota termina no valor recebido; não deve produzir leitura enganosa. Não use efeitos que alterem o layout durante um clique.

## 17. Contrato de integração

Backend: Node.js; a maioria das operações passa por `/api.php?action=NOME`, com payload JSON conforme os chamadores existentes. Não presuma verbos, campos, envelopes ou permissões: a referência é o código. Atualizações chegam por `/events` e consultas de estado. Autorização administrativa usa sessão/cookie; a projeção possui fluxo próprio; a sessão do aluno tem identificadores/token existentes.

O protótipo deve usar uma camada `mockAdapter` substituível por um `apiAdapter`. Nenhuma chamada real a Gemini, banco ou endpoints locais é necessária. Dados de demonstração não devem chegar ao produto final.

Preserve sempre que possível `data-page`, atributos `data-*`, `name`, IDs e valores usados pelos handlers atuais. A posição e estética podem mudar. Se houver mudança estrutural, documente o seletor antigo, o novo componente e o ajuste necessário no controlador. Preservar atributos sozinho não garante integração: valide também escopo DOM, eventos e estados.

Referências principais:

- `src/web/pages/index.mjs`: cascas, rotas e HTML inicial.
- `public/assets/js/arena.js`: aluno, painel, diálogos, TV, prévias, eventos e estados dinâmicos.
- `public/assets/js/app.js`: relatório e exportação.
- `public/assets/css/{arena,round,design,refinement,app-authorial}.css`: estilos atuais.
- `src/server/arena-api.mjs`: operações de salas, desafios, participantes, projeção, sorteio e modo coletivo.
- `src/server/api.mjs`: autenticação e relatório; também contém motor legado que não deve ser reexposto.
- `src/server/start.mjs`, `events.mjs`, `http.mjs`: roteamento, sessão e atualização ao vivo.
- `src/domain/{presets,arena-mode,arena-draw,arena-lessons,room-phases,room-readiness,mission-timing,arena-scoring,arena-ranking}.mjs`: regras e catálogos.

Consulte o anexo `REFERENCIAS-FRONTEND-LIVE-ARENA.md`, extraído do código, para nomes exatos de ações, handlers, campos e seletores. Ele é índice técnico, não autorização para expor uma operação administrativa ao aluno.

## 18. Formato obrigatório da entrega

1. Código-fonte completo, editável, organizado em páginas/componentes, CSS e assets; não apenas imagens.
2. Índice navegável com LA-01 a LA-13 e todos os estados descritos, incluindo diálogos e estados de erro.
3. Dados fictícios e adaptador de demonstração separados da apresentação.
4. `MAPA-INTEGRACAO.md` com uma linha por tela/estado/ação: ID, rota real, arquivo/componente entregue, seletor antigo/novo, dados consumidos, ação da API correspondente e estados alternativos.
5. `COBERTURA.md` marcando cada funcionalidade deste prompt como implementada, parcial ou ausente, com link para visualização. Não declare como entregue um estado que não é acessível.
6. Guia para abrir/executar, fontes/imagens incluídas e inventário de dependências externas.
7. Capturas desktop, mobile e TV das respectivas superfícies.

No protótipo, uma função demonstrada pode usar dados simulados; toda ação deve deixar claro seu resultado e conservar o vínculo com a função real. Se sua plataforma não conseguir gerar tudo de uma vez, mantenha os IDs e entregue por grupos até cobrir o inventário completo, registrando as pendências. O objetivo é uma nova interface utilizável e integrável, com todas as funções existentes representadas.
