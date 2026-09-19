# Análise visual das telas — Batalha de Prompts

Revisão humana das 27 capturas novas feitas em 17/09/2026. Arquivos de imagem em `output/auditoria-fullstack-2026-09-17/telas/`. O contato visual de todas as telas está em `output/auditoria-fullstack-2026-09-17/contato.png`.

## Parecer de design

A direção visual já tem uma identidade reconhecível: azul profundo e ciano, cartões claros no painel de gestão, tipografia arredondada e uma linguagem de jogo escura para TV e arena. O portal, a entrada de aluno, a missão no celular e a TV têm uma hierarquia clara. Não recomendo trocar a identidade ou refazer tudo.

A impressão de “texto demais” procede em pontos específicos. Ela não vem da tela inicial nem da principal tarefa do aluno. Vem do painel docente, onde explicações de aulas, estados, detalhes e ações aparecem em várias camadas ao mesmo tempo; de informações auxiliares que ficam sempre abertas; e de algumas telas móveis onde a navegação ocupa espaço que deveria servir à tarefa. A correção deve retirar repetição e adiar detalhes, preservando o enunciado que o aluno realmente precisa para responder.

Há ainda um problema mais sério que estética nas telas de prévia: os avisos de estado dizem uma coisa e o conteúdo demonstrativo mostra outra. Isso reduz a confiança de quem prepara a aula e pode levar o professor a avaliar uma tela errada.

## Análise por captura

| Captura | Estado geral | O que a tela mostra e correção indicada |
| --- | --- | --- |
| `01-portal-desktop.png` | Boa | Entrada focada, marca, título e uma ação. Manter simples. O fundo texturizado domina área grande; testar textura um pouco mais discreta, sem adicionar texto ou benefícios ao portal. |
| `02-portal-celular.png` | Boa | Composição central e ação com largura adequada. Manter o mesmo foco do desktop e conferir em telas estreitas/zoom. |
| `03-entrada-aluno.png` | Boa | Dois campos, rótulos explícitos, exemplos úteis e botão principal claro. Preservar esta concisão. Verificar teclado do celular e erros de código/nome. |
| `04-login-professor.png` | Boa, com espaço sobrando | Um único campo e ação são fáceis de entender. O cartão tem espaço vertical bastante maior que seu conteúdo; reduzir a altura interna sem diminuir área clicável. |
| `05-painel-vazio.png` | Denso e sem próximo passo forte | Quatro cartões de trilha trazem várias linhas explicativas e ações, embora não haja sala nem desafio. “Adicionar à sala” parece desabilitado e disputa atenção com “Só criar no banco”. Transformar a progressão em seção secundária recolhida e mostrar um próximo passo útil para criar a primeira sala/desafio. Não repetir textos das aulas em cada cartão. |
| `06-painel-populado.png` | Funcional, mas carregado | A sala e o banco de desafios estão legíveis, porém cada cartão reúne rótulos, contagens e várias ações; a progressão extensa começa logo abaixo. Destacar uma ação principal por sala, agrupar ações secundárias num menu e deixar a progressão fora do caminho da operação diária. |
| `07-novo-desafio.png` | Formulário longo | Boa separação entre o que aluno vê e o que o juiz avalia; campos opcionais e critérios recolhidos são uma boa decisão. O formulário é maior que a janela e tem botão inferior fixo. Garantir rolagem interna até todos os campos, que o botão não cubra conteúdo, e que foco/teclado alcancem os grupos recolhidos. Manter instruções do desafio, mas encurtar rótulos repetidos. |
| `08-nova-sala.png` | Clara | Poucos campos e uma ação principal. Manter. Rever se o título pré-preenchido é útil ou apenas texto demonstrativo e tornar evidente o que “Turma” muda no jogo. |
| `09-detalhes-sala.png` | Excesso de blocos em estado vazio | Código e “Iniciar missão” estão fáceis de achar. Com zero participantes, sorteio, tabela, três missões, ranking e explicações vazias preenchem a tela. Recolher sorteio até haver participantes, tornar detalhes das missões expansíveis e agrupar “Ver na TV” com “Abrir tela de projeção” como uma única seção de projeção, sem eliminar atalhos necessários. O QR e o link ficam pequenos/truncados; oferecer copiar e QR com alvos legíveis. |
| `10-tempos.png` | Informação repetida | Os três campos de tempo repetem exatamente o mesmo conjunto de controles e sugestões; o total de nove minutos aparece só no fim. Oferecer “aplicar a todas” e permitir exceções por missão; manter o resumo total junto ao título. O print não prova que o rodapé fixo permite alcançar todo o modal. |
| `11-editar-sala.png` | Simples | Campos identificáveis e ação clara. O modal tem respiro, mas está equilibrado; manter, verificando foco inicial, Escape e retorno de foco. |
| `12-adicionar-missao.png` | Boa | Seleção, resumo e CTA são suficientes. Manter conteúdo detalhado recolhido e deixar claro se a missão já está na sala para evitar duplicidade. |
| `13-previa-aluno.png` | Útil para docente, com controles demais no mesmo cabeçalho | O selo de prévia e o acesso ao painel ajudam a evitar confusão com a aula ao vivo. Agrupar os seletores de estado em uma barra de prévia distinta e manter o gabarito claramente restrito ao professor. O enunciado é conteúdo de atividade, não texto de interface para cortar. |
| `14-tv-espera.png` | Boa para projeção; dados incoerentes | Código grande, QR, chamada e ranking aproveitam bem o monitor. Porém o aviso diz que ninguém entrou e o contador mostra 0/4, mas quatro nomes e pontuações aparecem. Corrigir a fixture/estado de exemplo: ou lista e placar vazios, ou aviso explícito de dados fictícios com contagens coerentes. |
| `15-tv-round.png` | Hierarquia boa; estado incoerente | Missão e cronômetro têm bom destaque. O cabeçalho diz “nenhuma missão está aberta”, enquanto o corpo mostra a missão, o tempo e três envios. Corrigir o estado/aviso da prévia antes de usar este print como referência de produto. Só reduzir instrução da missão se a informação continuar disponível ao aluno. |
| `15-tv-results.png` | Leitura forte; rótulo contraditório | Resultado, missão e classificação têm boa hierarquia. O topo avisa que nenhuma rodada terminou, mas a tela apresenta “Resultado da rodada 3” e pontuação. Alinhar banner, fase e dados. |
| `15-tv-final.png` | Impactante; rótulo contraditório | Campeão e classificação ficam claros à distância. O aviso diz que a sala não tem respostas enquanto a tela mostra batalha encerrada, vencedora e pontos. Corrigir fixture/aviso. Conferir duração da chuva de confete e respeito a `prefers-reduced-motion`. |
| `16-aluno-espera.png` | Boa, mas quase vazia | Ilustração e instrução única formam uma espera acolhedora; o espaço vazio pode ser adequado. Conferir se status da sala/conexão e orientação de espera continuam claros sem empurrar conteúdo necessário para baixo. |
| `17-aluno-missao.png` | Boa no celular; conteúdo no limite | A tarefa está bem separada do campo de resposta e o CTA aparece. Contexto e enunciado ocupam bastante altura; testar teclado aberto, zoom 200% e enunciados reais longos para garantir que campo e envio continuem acessíveis. Não remover informação necessária para executar a missão. |
| `18-aluno-feedback.png` | Boa | Nota, avaliação e critério principal ficam legíveis; detalhes adicionais recolhidos reduzem ruído. Manter e garantir próximo passo explícito para o aluno. |
| `19-aluno-resultado.png` | Não valida o estado pelo nome | A imagem mostra “Aguarde o professor iniciar”, igual ao estado de espera, e não uma tela de resultado intermediário. O conteúdo é um estado válido de espera; a captura não comprova o “resultado” indicado pelo nome. Corrigir o rótulo/roteiro ou capturar novamente o estado de resultado antes de usar como evidência. |
| `20-aluno-final.png` | Boa | Vencedor e classificação estão claros no celular. A animação traz energia, mas precisa respeitar preferência por movimento reduzido e não esconder a leitura. |
| `21-relatorio.png` | Sólido, extenso | KPIs, filtros e seções recolhíveis estão bem organizados em desktop. A página é comprida; validar se os grupos recolhíveis mantêm contexto e se cabeçalhos de seção não ficam visualmente soltos. Agrupar Exportar/Imprimir como ações secundárias do relatório. |
| `22-relatorio-celular.png` | Ordem precisa melhorar | Exportar e Imprimir aparecem antes do título e ocupam a parte superior. Datas lado a lado ficam apertadas. Ordem recomendada: título/período, filtros, resumo e depois exportação/impressão; usar campos de data que refluam em uma coluna estreita. Este print cobre só o topo, então revisar o restante com rolagem. |
| `24-painel-celular.png` | Principal problema responsivo do professor | A navegação ocupa várias linhas antes do título e das salas. Converter em menu compacto ou navegação que não empurre a tarefa principal; mostrar primeiro estado da Arena e sala ativa. O restante da tela ainda exige rolagem; conferir criação/edição de sala, foco e largura sem overflow. |
| `25-tv-entrada.png` | Boa | Instrução e PIN dominam a tela, campo tem foco visível e botão é fácil de localizar. Preservar para leitura a distância; testar PIN digitado e retorno de erro sem trocar o estado projetado. |
| `26-nao-encontrada.png` | Boa | Mensagem curta e retorno ao início resolvem o erro. Manter simples e verificar códigos HTTP/rota além da aparência. |

## Plano visual de correção para execução

1. **Corrigir a prévia e suas fixtures primeiro.** Revisar a fonte que monta os avisos e os estados de TV/prévia em `src/web/pages/index.mjs` e `public/assets/js/arena.js`. Para cada estado, fazer banner, tela, número de jogadores, envios e classificação corresponderem. Corrigir o roteiro que gerou `19-aluno-resultado.png`; ele precisa esperar a condição do resultado, não apenas salvar o próximo estado disponível. Critério: capturas de espera, rodada, resultado e final mostram estado coerente entre aviso e conteúdo.
2. **Reduzir o ruído do painel do professor.** Em `src/web/pages/index.mjs` e CSS de `public/assets/css/`, encurtar descrições repetidas da progressão, recolher a trilha no painel de visão geral e agrupar comandos secundários de sala. No estado vazio, indicar um único próximo passo acionável. No detalhe da sala, esconder blocos vazios/inativos até serem úteis e unificar entrada para projeção.
3. **Acelerar os formulários.** Em criação de desafio e tempos, manter detalhes opcionais recolhidos, agrupar configurações repetidas, colocar totais/resumos perto da ação e verificar que o rodapé fixo não cubra o último controle. Testar modal com rolagem, teclado e zoom. Não cortar contexto, critérios ou instruções de missão de que aluno/professor precisam.
4. **Reorganizar o mobile docente.** Em 390 px, reduzir a navegação de várias linhas para menu compacto, trazer sala/estado e próxima ação para o primeiro quadro e empilhar datas do relatório quando não houver largura. Usar o mesmo sistema de espaçamento e botões do celular do aluno.
5. **Preservar as partes que já funcionam.** Manter portal com CTA único, formulários curtos de entrada, linguagem visual de TV, campo e envio da missão, feedback com detalhes progressivos e tela 404 concisa. Ajustar microtexto repetido, não inserir novos parágrafos institucionais.
6. **Validar a acessibilidade com ferramentas e interação.** Medir contraste por par de cores, testar navegação apenas por teclado, foco em modais e menus, zoom 200%, leitor de tela para nomes/estados, toque e teclado virtual. Checar `prefers-reduced-motion` nas comemorações. Os prints não permitem declarar conformidade WCAG.

## Verificação visual para aceitar as correções

- Capturar de novo cada fluxo corrigido em 390, 768 e 1440 px; para TV, manter também 1920×1080 e 1280×720.
- Cobrir estados vazio, populado, erro, espera, missão, resposta, resultado e fim. A captura só é aceita quando texto/DOM de estado e o print concordarem.
- Guardar capturas novas antes/depois fora de `.env`, credenciais, nomes de alunos reais ou dados de produção.
- Conferir missões curtas e longas, teclado aberto, rolagem de modal, zoom 200%, foco visível e reduzido movimento.
- Usar `test:browser` como apoio para comportamento, mas fazer inspeção visual dos prints; um teste passando não prova que a tela está clara.

## Limites

As capturas foram feitas com conteúdo sintético. A amostra cobre as telas listadas, não todas as combinações de modo Arena, todos os erros, todas as larguras ou o conteúdo real usado por professores. A captura 19 não demonstra uma tela de resultado intermediário. Prints não verificam semântica acessível, contraste calculado, navegação completa por teclado, comportamento com teclado móvel nem respeito real às preferências de animação. Esses pontos permanecem como testes de implementação.
