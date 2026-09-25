# Plano de correção — excesso de texto na Live Arena

## Objetivo

Reduzir a quantidade de blocos que pedem leitura simultaneamente. A interface deve deixar claro o que fazer agora e apresentar os detalhes quando forem necessários.

Não basta encurtar frases. Um conjunto de títulos, subtítulos, selos, explicações, estados vazios e botões continua pesado mesmo quando cada texto é curto.

## Base da avaliação

Revisão visual em navegador Chromium real, com capturas do projeto local em 15/09/2026. Dados de demonstração foram criados em banco separado, em memória. Nenhuma correção foi aplicada ao produto.

Foram abertas as páginas de portal, entrada do aluno, login e painel do professor, prévia do aluno, entrada e prévia da TV, projeção autenticada, relatório e página inexistente. Também foram capturados formulários e estados de espera, missão, retorno da avaliação, votação e encerramento. Portal, aluno, relatório e painel foram inspecionados em largura de celular; formulários e TV, principalmente em computador.

Limites: esta é uma auditoria visual, não um teste completo das regras do jogo. Não foram reproduzidos todos os erros, todas as modalidades e as oito dinâmicas coletivas. O sorteio desta execução não passou pelo Wild Card; essa variação precisa de captura na validação da implementação. Uma captura nomeada `34-tv-votacao.png` ainda mostrou o resultado anterior; não deve ser usada como prova visual da votação na TV. Números, notas e textos das missões são dados de demonstração, não conteúdo real da turma. Não houve comparação com outros sites.

## Diagnóstico

As maiores concentrações estão no portal, no detalhe da sala, na missão e no encerramento do aluno, nas prévias e no relatório. A entrada do aluno, o formulário simples de edição da sala e a TV têm problemas menores. Não aplicar um corte uniforme a todas as telas.

## Correções por tela

### 1. Portal — prioridade alta

Evidência: [celular](02-portal-celular.png), [computador](01-portal-desktop.png).

- Manter marca, título principal e botão de entrada.
- Retirar a chamada “Desafio de engenharia de prompt”, o parágrafo conceitual e os quatro blocos inferiores de características.
- Retirar “Digite o código da sala para entrar” desta página; a orientação pertence ao formulário seguinte.
- Não preencher o espaço liberado com outros textos ou cartões.
- Aceite: a abertura apresenta três elementos principais — marca, título e ação — sem leitura secundária obrigatória.

### 2. Entrada do aluno — prioridade baixa

Evidência: [entrada](03-entrada-aluno.png).

- Retirar o selo “Entrada do jogador”: o título e o formulário já identificam a tela.
- Manter código, nome e botão “Entrar”.
- Manter a informação de onde obter o código junto desse campo, se necessária; quando o link já preencher o código, evitar uma explicação desnecessária.
- Preservar rótulos visíveis e mensagens de erro. Não transformar tudo em texto dentro dos campos.

### 3. Espera do aluno — prioridade média

Evidência: [espera](16-aluno-espera.png).

- Há três mensagens para um estado: “Sala de espera”, “Aguardando a próxima missão” e “O professor vai iniciar uma missão”.
- Manter uma mensagem principal: “Aguarde o professor iniciar”. Retirar as outras duas camadas textuais equivalentes.
- A ilustração pode permanecer. A tela não precisa receber conteúdo adicional para ocupar espaço.

### 4. Missão do aluno — prioridade alta

Evidência: [missão no celular](17-aluno-missao.png).

- Preservar o enunciado completo, o contexto necessário, a imagem quando existir, o tempo e as tentativas.
- Retirar camadas redundantes: “01 / O DESAFIO” e “02 / SUA RESPOSTA” não precisam competir com o título da missão e o rótulo do campo.
- Não renderizar os três cartões vazios “Resultados das missões”, “Classificação geral” e “Destaques” antes de haver dados.
- Mostrar o atalho de teclado somente em contexto apropriado a teclado físico; não ocupar uma linha permanente no celular.
- Ajustar espaços e altura inicial do campo para aproximar o botão de envio. Não encolher a fonte nem cortar a missão para fazê-la caber.
- Aceite: durante a primeira missão, não há painéis vazios abaixo do formulário; com um enunciado curto como o da captura, o campo e a ação exigem menos rolagem que antes.

### 5. Avaliação do aluno — prioridade média

Evidência: [avaliação](18-aluno-feedback.png), [prévia com avaliação](41-previa-resultado.png).

- Priorizar nota, feedback útil e próximo passo ou tentativas restantes.
- Permitir abrir o detalhamento de critérios, sem obrigar a leitura de todos junto de classificações e destaques.
- Depois da resposta, o enunciado pode ser recolhido com acesso claro para reler; durante a escrita deve permanecer disponível integralmente.
- Preservar o motivo de não poder enviar novamente. Não remover feedback pedagógico apenas para reduzir palavras.

### 6. Votação e resultado coletivo do aluno — prioridade alta

Evidência: [votação](33-aluno-votacao.png), [resultado coletivo](19-aluno-resultado.png).

- A pergunta de votação está seguida de um grande cartão de espera. Isso comunica duas situações ao mesmo tempo.
- Durante votação ativa, mostrar pergunta, opções, prazo quando houver e confirmação do voto. Ocultar o cartão de espera.
- Depois do resultado, mostrar o resultado e uma orientação curta sobre o próximo passo; evitar reapresentar todo o painel ilustrado de espera junto dele.
- Não cortar o texto das opções quando ele for necessário para comparar prompts. Validar também o Wild Card e opções longas.

### 7. Encerramento do aluno — prioridade alta

Evidência: [final real](20-aluno-final.png), [prévia do final](41-previa-fim.png).

- Manter um título de encerramento e o ranking principal.
- Retirar “Confira a classificação final dos campeões abaixo”. A classificação já está visível.
- Recolher resultados por missão e detalhes dos destaques. Eles continuam acessíveis, sem alongar a primeira leitura.
- Retirar o resultado coletivo anterior do topo quando o estado principal já for encerramento, mantendo-o no histórico pertinente.

### 8. Login do professor — prioridade baixa

Evidência: [login](04-login-professor.png).

- Usar um único título, como “Entrar no painel”. Retirar a combinação de selo e título dizendo a mesma coisa.
- Retirar da interface a explicação sobre a senha estar no `.env` do servidor; essa informação pertence à documentação de configuração.
- Manter campo de senha, entrada, retorno e erros de autenticação.

### 9. Painel geral, banco e aulas — prioridade alta nas aulas, média no restante

Evidência: [painel](06-painel-populado.png), [aulas](36-aulas-banco.png).

- Usar a navegação existente para focar a seção escolhida, evitando apresentar toda a gestão como uma sequência contínua de salas, banco, aulas e resultados.
- Nas aulas, mostrar título, resumo curto e ação principal. Deixar a lista completa de missões dentro dos detalhes.
- A Aula 4 repete quatro selos “Engenharia Reversa”. Consolidar a repetição, preservando a quantidade quando relevante: por exemplo, “4 missões de engenharia reversa”.
- Rebaixar visualmente ações secundárias como duplicar e excluir, sem remover seu acesso nem esconder rótulos atrás de ícones ambíguos.
- Retirar subtítulos que só descrevem a seção, como “Desafios prontos por aula”, quando o título e os cartões já a explicam.

### 10. Detalhes da sala — prioridade máxima

Evidência: [topo](09-detalhes-sala.png), [controles e participantes](28-arena-painel-meio.png), [missões](29-arena-painel-fundo.png).

- Manter no topo nome da sala, código, quantidade de participantes, estado e próxima ação principal.
- Exibir a contagem de participantes/conectados uma única vez; ela aparece repetida na captura.
- Recolher ferramentas administrativas pouco usadas em “Gerenciar sala”. Manter pausar, retomar e encerrar facilmente acessíveis quando pertinentes.
- Mostrar as missões inicialmente como resumo: título, situação, tempo e pendência, se houver.
- Abrir enunciado, gabarito e resultado esperado dentro do detalhe da missão, em vez de deixar todos expandidos.
- Retirar o grande espaço com “Sem imagem — o aluno recebe só o texto” quando a modalidade não precisar de imagem. Preservar aviso de imagem ausente quando isso impedir o uso.
- Recolher a lista completa de participantes; preservar contagem e alertas relevantes na visão principal.
- Aceite: com três missões e oito participantes, localizar e executar a próxima ação não exige percorrer listas ou ler gabaritos.

### 11. Sorteio e modo Arena no painel — prioridade alta

Evidência: [painel Arena](27-arena-painel.png), [sorteio](28-arena-painel-meio.png).

- A opção “todos concorrem sempre” é seguida de “Todos concorrem em todas as rodadas”. Manter uma explicação da regra, sem repetir.
- Mostrar a ação adequada ao momento e manter a justificativa de bloqueio quando necessária.
- Nos indicadores do Juiz e da energia, evitar repetir em prosa o que o indicador já mostra. Preservar valores acessíveis e o significado das regras.
- A configuração da partida já é recolhível: aproveitar esse padrão, sem redesenhar o jogo.
- Não misturar nem alterar as regras dos dois sorteios ao reorganizar sua apresentação.

### 12. Nova sala e edição da sala — prioridade média

Evidência: [nova sala simples](08-nova-sala.png), [nova sala Arena](39-nova-sala-arena-final.png), [edição](11-editar-sala.png).

- Trocar “Preset” por “Modo de jogo”.
- Manter título, modo, participantes e seleção de missões quando necessária.
- Recolher ajustes opcionais do modo Arena, mostrando um resumo fiel dos valores escolhidos. Preservar os valores ao abrir, fechar e salvar.
- Evitar repetir “Arena — Turma vs. Juiz” como seleção, título de seção e explicação em sequência.
- O formulário simples de edição já é curto. Não ampliá-lo nem aplicar uma reforma desnecessária.

### 13. Criar/editar desafio e adicionar missão — prioridade alta no formulário longo

Evidência: [início](07-novo-desafio.png), [campos finais](37-desafio-campos-finais.png), [adicionar missão](12-adicionar-missao.png).

- Organizar o formulário em grupos claros: conteúdo do aluno, avaliação do juiz e ajustes opcionais.
- Mostrar os campos necessários à modalidade escolhida; recolher os opcionais sem apagar valores existentes.
- Manter explícito que o gabarito não aparece para o aluno. Reduzir a explicação repetida entre rótulo, texto dentro do campo e dica.
- Recolher critérios e pesos atrás de um resumo fiel, com abertura automática quando houver erro nesse grupo.
- Ao adicionar uma missão existente, mostrar um resumo e acesso à prévia. Não exigir ler o gabarito completo para confirmar a seleção.

### 14. Tempo das missões — prioridade alta

Evidência: [tempos](10-tempos.png).

- Cada linha deve destacar título, duração e sugestão aplicável.
- Recolher o enunciado completo e a justificativa da sugestão; ambos podem ser consultados por missão.
- Explicar o formato e a opção sem cronômetro uma vez, evitando repetir um rótulo longo a cada linha.
- Substituir o botão desabilitado “Todas as missões já têm cronômetro” por estado discreto, se essa informação for necessária.
- Manter duração total, efeito de mudanças compartilhadas, erros e a regra de encerramento manual.

### 15. Prévia do aluno — prioridade alta no celular

Evidência: [missão](13-previa-aluno.png), [avaliação](41-previa-resultado.png).

- A barra administrativa ocupa grande parte da tela antes de começar a prévia.
- Manter identificação “Prévia”, seletor de estado/missão e voltar. Recolher código, detalhes de tempo e informações de preparação.
- Preservar os avisos de simulação, dados de exemplo e privacidade do gabarito. Condensá-los sem confundir prévia com partida real.
- Aceite: no celular é possível enxergar o início do conteúdo do aluno sem atravessar uma grande área administrativa.

### 16. TV, projeção e prévia da TV — prioridade baixa a média

Evidência: [espera](30-arena-tv-espera.png), [missão](15-tv-round.png), [resultado](15-tv-results.png), [final](15-tv-final.png), [conexão](40-projecao-dialogo.png).

- Preservar código/QR na entrada e na espera; missão/tempo durante a rodada; placar no resultado. Essas telas já têm foco melhor.
- Reduzir redundâncias entre “Classificação final”, “Resultado final” e “Batalha encerrada”, mantendo um título principal por estado.
- Na conexão, manter identificação inequívoca do código de projeção e a alternativa de acesso por endereço. Evitar repetir a mesma URL como texto técnico e instrução extensa.
- Compactar apenas os controles administrativos da prévia; não levar essas instruções à projeção da turma.
- Não aplicar à missão da TV um limite arbitrário de palavras: a tarefa precisa permanecer compreensível.

### 17. Relatório — prioridade alta

Evidência: [topo](21-relatorio.png), [celular](22-relatorio-celular.png), [gráficos](42-relatorio-meio.png), [tabelas e vazios](43-relatorio-fundo.png).

- Começar com um resumo de poucos indicadores úteis ao professor, por exemplo participantes, envios, acerto médio e tempo médio. Manter as demais métricas acessíveis em detalhes.
- Recolher blocos operacionais como fallbacks e comparações por computador quando não forem o foco da consulta.
- Remover legendas que apenas repetem o indicador. Manter explicações que distinguem métricas diferentes.
- Agrupar seções sem dados em um estado vazio útil; evitar vários cartões repetindo “Sem dados no período”.
- Disponibilizar gráficos, ranking, cadastros e respostas em grupos de consulta, em vez de exigir atravessar tudo.
- Preservar filtros, exportação, impressão e acesso aos registros completos. Não alterar fórmulas ou excluir colunas dos dados exportados.

### 18. Página não encontrada — sem prioridade de corte

Evidência: [página inexistente](26-nao-encontrada.png).

A página tem apenas a mensagem de não encontrada. Não há excesso de texto a corrigir nesse escopo.

## Ordem de implementação

1. Portal, redundâncias óbvias e painéis vazios do aluno.
2. Estados do aluno: missão, votação, avaliação e encerramento, garantindo uma orientação principal por vez.
3. Detalhe da sala e aulas: resumos, agrupamento e abertura de detalhes.
4. Formulários longos, tempos e barras de prévia.
5. Relatório e pequenos ajustes da TV/login.

Entregar cada etapa com prints antes/depois usando os mesmos dados e dimensões. Não começar por mudanças de cores, ilustrações, animações ou identidade visual.

## Orientações técnicas para a IA implementadora

- Os templates estão em `src/web/pages/index.mjs`; a maior parte dos estados e formulários é montada em `public/assets/js/arena.js`; portal e relatório também usam `public/assets/js/app.js`.
- Certas mensagens vêm do servidor, incluindo `src/domain/arena-draw.mjs` e `src/domain/arena-mode.mjs`. Se a mesma mensagem for escrita pelo template e pelo cliente, corrigir ambos.
- Consultar `.agents/skills/copia-de-interface/SKILL.md` para cortes de cópia. Esse plano também inclui mudanças estruturais de apresentação; tratá-las como trabalho de interface, não como simples corte de strings.
- Não remover identificadores de eventos, campos ou funções para baixar contagens. Elementos recolhidos devem continuar acessíveis por mouse, toque e teclado.
- Não esconder erros nem campos obrigatórios pendentes dentro de grupos fechados. Abrir o grupo e levar o foco ao problema.
- Rodar `node scripts/inventario-copia.mjs`, `node scripts/varredura-copia.mjs`, `npm test` e `npm run test:browser` conforme as alterações. Os testes não substituem a inspeção dos prints.
- Mudanças intencionais de estrutura e estilo podem exigir revisão dos contratos de CSS e cópia. Não atualizar referências automaticamente para disfarçar regressões.

## Critérios finais de aceite

- Em cada estado, a pessoa identifica a próxima ação sem ler parágrafos explicativos.
- Dados secundários são acessíveis quando solicitados; não desaparecem do produto.
- Não existem cartões vazios em sequência durante a missão inicial.
- Uma votação ativa não exibe simultaneamente a orientação principal de esperar.
- Nenhum enunciado, critério necessário, regra de tentativa, aviso de perda ou erro foi sacrificado para economizar palavras.
- Formulários preservam valores ao recolher seções e continuam salvando corretamente.
- Validar pelo menos em 390 × 844 e 1440 × 900; verificar a TV também na resolução de projeção usada.
- A comparação antes/depois deve considerar blocos visíveis, repetição, rolagem e destaque da ação. A contagem total de palavras é apenas uma medida complementar.

## Pedido pronto para a implementação

Implemente este plano para reduzir a carga de leitura da Live Arena. Use as capturas vinculadas como diagnóstico, confirme o estado atual antes de editar e siga a ordem de prioridades. Preserve conteúdo pedagógico, regras, dados e funcionalidades. Faça cortes, agrupamentos e exibição sob demanda; não acrescente textos decorativos nem redesenhe a identidade visual. Entregue as alterações com evidências visuais antes/depois, testes pertinentes e uma lista objetiva do que foi removido, recolhido e preservado. Não publique sem uma instrução específica de publicação.
