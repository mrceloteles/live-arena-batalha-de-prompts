# Mapa e instrução de integração

Este pacote é referência visual corrigida, não substituto pronto de produção. O aplicativo e o backend originais não foram alterados. Integre o visual nos renderizadores existentes; não substitua o aplicativo pelo controlador mock deste HTML.

## Prioridade

1. Contrato funcional e backend atual determinam ações, valores, permissões e transições.
2. code.html define a direção visual aprovada; simulacao.html aplica essa direção ao conjunto ampliado de telas e estados para revisão do produto.
3. Melhorias de agrupamento, cartões, espaçamento e hierarquia do protótipo são desejadas quando preservam as funções. Não é obrigatório preservar a disposição antiga.

## Correspondência

| ID | Método no HTML | Rota real | Ação/renderer | Observação |
|---|---|---|---|---|
| LA-01 | viewPortal | / | indexPage | Entrada única /play |
| LA-02 | viewStudentJoin | /play | arena_join | code, name; sessão retornada pelo servidor |
| LA-03-lobby | viewStudentLobby | /play | arena_lobby | Estado da sala, participantes e permissão para jogar |
| LA-03-mission | viewStudentMission | /play | arena_submit | Usar payload do controlador existente; não inventar token ou tentativa |
| LA-03-evaluating | viewStudentEvaluating | /play | arena_lobby + /events | Aguardar nota; sem botão que força resultado |
| LA-03-result | viewStudentResult | /play | arena_lobby | Nota, feedback, critérios, tentativas disponíveis |
| LA-03-collective | viewStudentCollective | /play | arena_mode_vote | Alternativas, confiança e permissões do estado coletivo |
| LA-04 | viewAdminLogin | /admin-arena.php | admin_login | password; autenticação real por cookie |
| LA-05 | viewTeacherDashboard | /admin-arena.php | arena_admin_status, arena_set_open, arena_create_room | Cartões, portão global e criação |
| LA-06 | viewRoomDetail | /admin-arena.php | arena_room_detail | Ligar cada ação ao dispatcher; respeitar can_start e status |
| LA-07 | viewChallengesBank | /admin-arena.php | arena_list_challenges, arena_save_challenge | Editor completo já existe no projeto, não no ZIP |
| LA-08 | viewLessonsTracks | /admin-arena.php | arena_list_lessons, arena_add_lesson | Catálogo real; importar para sala ou apenas banco |
| LA-09 | viewTVStage | /tv.php | arena_tv_code, arena_tv_token, arena_tv | Fluxo de autorização próprio; aluno não abre admin |
| LA-10 | viewStudentPreview | /aluno-preview.php?room=ID | arena_room_preview | Prévia administrativa, exemplos marcados |
| LA-11 | viewTVPreview | /tv-preview.php?room=ID | arena_tv_preview | Estados de TV; sem executar ações da partida |
| LA-12 | viewAnalyticsReport | /report.php | report_metrics | Filtro e exportação do app.js existente |
| LA-13 | viewNotFound | rota desconhecida | notFoundPage | 404 de página; PIN inválido pertence à entrada |

## Correções aplicadas nesta cópia

Portal com entrada única; remoção da escolha PC 1/2/3 do portal; formulário de entrada somente com code e name; retirada de consentimento inventado para envio de relatório por e-mail; preset Personalizado incluído; distinção de Arena e modalidade Boss; rótulo Tentativas; controles de avanço artificial retirados da superfície do aluno; retorno administrativo retirado da TV; mensagens de gravação/exportação fictícias identificadas; 404 de página separado de erro de PIN; documento visual alinhado ao HTML.

## Cobertura ainda parcial no protótipo — preservar do aplicativo

O ZIP original contém 17 visões, não toda a aplicação. Não apagar as funcionalidades abaixo ao integrar. Aplicar-lhes os mesmos tokens e componentes visuais, usando os dados e handlers existentes:

- Editor completo de desafios, duplicação/exclusão, correção em lote, upload/URL, pesos, tentativas, duração e gabarito privado.
- Criação com capacidade e missões; quatro presets com limites e ajustes coletivos reais.
- Detalhe: participantes, renomeação/remoção, missões ordenáveis, correções, tempos, arquivo/exclusão, QR e autorização de TV.
- Fila de notas: recebido, avaliando, retomada automática, esgotamento, resposta guardada; manter origem da avaliação.
- Sorteio independente livre/mata-mata, histórico e reinício.
- Todas as fases coletivas, Wild Card, oito dinâmicas, confiança, poderes, times, ataques e premiações.
- Resultado por missão e classificação final separados; lidar com empates, menos de três pessoas e ausência de dados.
- Todas as modalidades, incluindo limite 250 do Essencial, referência visual, resgate e refinamento.
- Prévias navegáveis reais sem consumir tentativas.
- Relatório: todos os indicadores, gráficos, tabelas, filtro de período, CSV protegido e campos históricos.
- Estados sem dados, carregamento, erro, sessão expirada, entrada bloqueada, conexão instável e pausa.

O estado selecionado na barra do protótipo não modifica todas as visões. Não tratar o seletor como prova de cobertura de erro. Números, nomes, notas, ranking, cronômetros e permissões no HTML são demonstração. Nenhum toast comprova operação no backend.

## Procedimento para a outra IA

Trabalhe numa cópia isolada que inclua alterações locais. Preserve os controladores do produto. Transfira a camada visual para src/web/pages/index.mjs, public/assets/js/arena.js e public/assets/js/app.js; mantenha ações, seletores e contratos existentes ou registre cada adaptação. Extraia tokens CSS do HTML. Troque mockData por dados reais no adaptador, sem recalcular regras no frontend. Não recrie backend, não altere banco ou juiz, não publique.

Complete a lista de cobertura com o CONTRATO-FUNCIONAL.md e o índice REFERENCIAS-DO-CODIGO.md. Teste os fluxos reais e compare screenshots em celular, desktop e TV. Informe mudanças por tela e funções preservadas.

## Arquivos e limitações

code.html: protótipo visual original ajustado. simulacao.html: simulação navegável ampliada, com dados fictícios e sem backend. capturas-simulacao/: capturas das superfícies principais. assets/: imagem local de referência da missão. portal-corrigido.png: captura anterior do portal. screen.png: captura ORIGINAL enviada pelo gerador (não representa a versão corrigida). Tailwind e fontes são carregados pela internet. O pacote não contém credenciais nem dados do banco real.
