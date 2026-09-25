# Plano de refinamento visual — versão revisada em 16/09/2026

## Instrução de execução e caminhos

Trabalhe no projeto:

`C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main`

Leia este plano em:

`C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-visual-2026-09-16\PLANO-ATUALIZADO-PARA-OUTRA-IA.md`

As 25 capturas que fundamentam este documento estão exclusivamente em:

`C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-visual-2026-09-16`

Os nomes de PNG citados abaixo devem ser abertos dentro dessa pasta. Antes de implementar, capture novamente os estados que serão alterados para confirmar que os problemas ainda existem. Salve novas evidências em uma subpasta própria, sem sobrescrever as referências.

Este documento substitui os planos anteriores como lista de trabalho visual pendente. Não reaplique recomendações antigas automaticamente: várias já foram implementadas.

## Correções da análise anterior

- O portal já foi simplificado para marca, título e entrada. Não precisa de novos cortes nem de aumento obrigatório do cartão; a área vazia ao redor não constitui defeito por si só.
- O relatório já mostra quatro indicadores principais e detalhes recolhíveis. O problema residual é a repetição de grandes superfícies mesmo quando fechadas.
- As categorias das aulas já foram agrupadas. O resumo fechado ainda enumera muitas categorias, sobretudo na Aula 5.
- Novo desafio, configuração da sala, critérios e resultados finais já usam grupos recolhíveis. Refinar a apresentação existente.
- A rodada nova não capturou a partida real completa, o relatório populado/mobile nem a edição da sala. As prévias não comprovam esses estados ao vivo. Não tratar ausência de captura como defeito do produto.

## Objetivo

Dar maior clareza à operação e acabamento consistente ao que já existe. Preservar marca azul/teal, temas claro e escuro, tipografia, conteúdo pedagógico e personalidade lúdica. Melhorar proporção, alinhamento, hierarquia de ações e densidade, sem acrescentar decoração ou novos textos para preencher espaço.

## 1. Painel e detalhe da sala — prioridade alta

Evidências: `06-painel-populado.png` e `09-detalhes-sala.png`.

### Painel geral

- Usar a navegação existente para dar foco à seção escolhida. A visão geral pode mostrar resumos; banco e aulas completos devem ter sua área própria, sem continuar integralmente empilhados durante a operação de uma sala.
- Preservar indicação da seção selecionada, navegação por teclado e caminho de volta à sala.
- Nos cartões de sala, manter título, estado, participantes e ação pertinente. Código, modalidade e quantidade de missões são metadados secundários: reduzir a quantidade de cápsulas com fundo colorido.
- Padronizar botões: a captura mistura pílulas e retângulos com sombras e tamanhos diferentes para ações semelhantes. Usar tratamento recorrente para principal, secundária e destrutiva.
- A exclusão deve continuar acessível, com menor destaque que abrir/iniciar a sala.

### Detalhe da sala

- Diminuir a altura do grande bloco de convite. O QR ocupa a esquerda enquanto há uma grande faixa vazia acima das informações e da ação à direita. Alinhar o conteúdo à mesma linha de início e aproximar estado e botão principal.
- Na espera, manter código/QR visíveis. Durante a atividade, dar prioridade à missão e aos controles, preservando o acesso ao convite para entradas tardias.
- Evitar repetir o código no título, em tamanho grande e no botão de copiar; o botão pode dizer “Copiar código”. Manter o código grande onde ele tem utilidade.
- Preservar “Gerenciar sala”, já existente. Verificar a abertura de editar/bloquear/excluir a partir dele; não recriar esses controles fora do grupo.
- No sorteio, “todos concorrem sempre” e “Todos concorrem em todas as rodadas” comunicam a mesma regra. Manter uma explicação e o motivo de bloqueio, quando houver.
- Não colocar pausar, retomar, encerrar ou avançar em um menu genérico quando forem as ações da fase atual.

Aceite: estado e ação pertinente aparecem na primeira área útil em 1440 × 900; atualizações automáticas preservam foco, detalhes abertos, campos e rolagem. Validar também em 390 × 844.

## 2. Banco e aulas — prioridade média

Evidência: `36-aulas-banco.png`.

- Preservar o agrupamento de categorias implementado. No estado fechado, mostrar título, descrição curta e número de missões. Mover a enumeração completa de modalidades para dentro da abertura.
- Alinhar as ações entre cartões da mesma linha. Na captura, a Aula 4 tem menos linhas e seus botões começam antes dos demais. Usar área de ação consistente, sem criar grandes vazios artificiais.
- Diminuir o peso das ações secundárias, como criar somente no banco, em relação à ação principal disponível.
- Manter nomes dos botões claros. Não substituir ações importantes por ícones sem rótulo.
- Quando houver poucos desafios, evitar um cartão muito largo e alto com pouco conteúdo. Preferir lista ou grade com largura coerente com o restante do banco.

Aceite: cartões comparáveis, títulos fáceis de escanear e detalhes completos acessíveis em uma abertura. Validar com uma aula curta e outra com sete missões.

## 3. Prévias e acabamento do aluno — prioridade alta na barra de prévia

Evidências: `13-previa-aluno.png`, `41-previa-resultado.png` e `41-previa-fim.png`.

- Compactar a barra de prévia: identificação, voltar e seletor de estado permanecem visíveis. Navegação entre missões e opções adicionais podem ocupar um grupo recolhível.
- Os avisos “nada disto está no ar” e “números de exemplo” precisam continuar claros. Não esconder o fato de que se trata de simulação.
- Na captura com uma missão, aparecem anterior/próxima desabilitados e navegação numérica redundante. Omitir controles de navegação sem utilidade nesse caso; preservar indicação da missão atual.
- Nas aberturas de “Resultados das missões” e “Destaques”, colocar seta e título na mesma linha. Hoje a seta aparece isolada acima do título e o cartão fechado ocupa espaço excessivo.
- Preservar “Ver critérios”, já implementado, e os resultados finais recolhidos. Não refazer essas funcionalidades.
- Rever o espaço vertical antes do campo de resposta e entre tentativas e título. A prévia da missão ainda fica longa. Ajustar espaçamento e altura inicial do campo sem diminuir fonte ou cortar enunciado.
- Não alterar automaticamente a partida real com base apenas na prévia. Capturar aluno ao vivo para confirmar se composição e comportamento coincidem.

Aceite: a barra administrativa deixa o início da atividade visível na primeira tela do celular; grupos fechados são linhas compactas e clicáveis; erros e gabarito mantêm as regras de visibilidade existentes.

## 4. Relatório — prioridade média, refinamento da solução existente

Evidências: `42-relatorio-meio.png` e `43-relatorio-fundo.png`, com dados vazios de demonstração.

- Preservar os quatro indicadores e “Mais indicadores”.
- Reduzir altura, bordas e sombras das seções fechadas. O relatório ainda forma uma grade longa de caixas grandes contendo apenas um título.
- Agrupar visualmente consultas relacionadas: gráficos de atividade juntos; participantes e respostas juntos; informações operacionais em grupo secundário. Evitar sucessivas aberturas aninhadas para chegar a um dado simples.
- Distinguir os dois grupos chamados “Rodadas” por sua finalidade, após confirmar o conteúdo de cada um.
- Mostrar o período selecionado uma vez na área de filtro; a captura repete “Todo o período”. Preservar a ação para limpar filtro se esse for o papel de um dos elementos.
- Manter o estado vazio curto, com período e indicação de ausência de resultados. Não adicionar métricas inventadas nem apagar dados de exportação.

Aceite: menos rolagem no estado fechado, gráficos/tabelas alcançáveis sem pesquisa pelo usuário e nenhuma alteração de fórmulas, filtros, impressão ou CSV. Capturar relatório populado e mobile antes de avaliar essas variantes.

## 5. Formulários — prioridade média

Evidências: `07-novo-desafio.png`, `10-tempos.png`, `12-adicionar-missao.png`, `37-desafio-campos-finais.png`, `39-nova-sala-arena-final.png`.

- Preservar os grupos recolhíveis já implementados. Refinar espaçamento entre grupos, campos e ações.
- Novo desafio: reduzir a sensação de caixa dentro de caixa, usando divisores ou títulos para grupos internos quando a borda não ajudar a compreensão.
- Tempo das missões: manter as linhas de edição, mas evitar duplicar a mesma duração em selo e campo sem diferença de significado. Se o selo representa valor salvo e o campo representa edição, preservar essa distinção de forma compreensível.
- O aviso de que todas as missões já têm cronômetro pode ser omitido quando não mudar nenhuma decisão. Preservar formato aceito, regra de encerramento manual e total calculado.
- Padronizar “Usar sugestão” com os demais botões secundários, retirando o gradiente e brilho exclusivo que o faz disputar atenção com “Salvar tempos”.
- Nova sala: manter resumo da partida recolhido. A dica do modo de jogo pode usar texto auxiliar simples, sem parecer um campo adicional.
- Garantir uma única região de rolagem no diálogo e acesso confortável a salvar/fechar. Rodapé fixo, se usado, deve reservar espaço para não cobrir campos ou mensagens.

Aceite: formulários utilizáveis em 390 × 844 e em desktop de 1280 × 720; valores preservados ao abrir/recolher grupos; erros abrem e focalizam o grupo afetado.

## 6. Portal, acessos e TV — preservar e ajustar apenas o necessário

Evidências: `01-portal-desktop.png`, `02-portal-celular.png`, `03-entrada-aluno.png`, `04-login-professor.png`, `14-tv-espera.png`, `15-tv-round.png`, `15-tv-results.png`, `15-tv-final.png`, `40-projecao-dialogo.png`.

- Portal: manter a composição centralizada e o tamanho atual como referência. Não ampliar o cartão só porque sobra fundo. Como acabamento, testar menor intensidade da textura granulada; manter a versão atual se não houver ganho claro de foco.
- Acessos: preservar estrutura curta. Uniformizar botões e foco com o restante do produto.
- TV: preservar tema escuro, escala da informação principal e hierarquia por fase. As capturas novas são de prévia; validar a projeção real separadamente.
- Avaliar o excesso de altura do cabeçalho da TV, incluindo a linha isolada do botão “Tela cheia”. Reunir ferramentas numa faixa discreta, sem obstruir o conteúdo.
- No diálogo de projeção, priorizar QR e código e manter a alternativa por endereço. Preservar a distinção entre código da sala e da projeção.
- Legibilidade à distância depende da projeção real: não declarar essa verificação concluída apenas com screenshot.

## 7. Capturas que faltam antes de concluir

A nova rodada produziu 25 arquivos, não uma cobertura integral de todas as telas e estados. Completar:

1. Edição da sala pelo controle “Gerenciar sala”. A tentativa anterior não abriu o diálogo; isso pode ser incompatibilidade do roteiro de captura e não prova defeito no produto.
2. Aluno real em espera, missão, envio, avaliação, votação, Wild Card e encerramento, com missões de texto e imagem.
3. Painel durante e após a partida, incluindo rolagem interna e largura de celular.
4. Relatório com dados, desktop e celular.
5. Projeção real durante missão, votação e resultado, com sessão válida.

Os roteiros antigos podem ajudar, mas precisam de atualização e conferência do estado antes de cada print. Uma captura de página inteira não revela necessariamente todo o conteúdo de áreas com rolagem própria. Não copiar imagens antigas para preencher lacunas.

## 8. Arquivos e execução

Arquivos principais a inspecionar, respeitando as alterações já existentes:

- `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\src\web\pages\index.mjs`
- `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\js\arena.js`
- `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\js\app.js`
- `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\public\assets\css`

Inspecionar as folhas efetivamente carregadas e sua precedência antes de editar CSS. Reutilizar componentes existentes e reduzir regras concorrentes nos elementos tocados. Não migrar a aplicação nem adicionar bibliotecas só para este refinamento.

Ordem: confirmar estados atuais → painel e sala → prévias → aulas e banco → relatório → formulários → acabamento pontual de acessos/TV. As capturas faltantes devem acompanhar a etapa correspondente, não ficar todas para o fim.

Preservar funcionamento em tempo real, foco, rascunhos, autenticação, pontuação e privacidade do gabarito. Usar banco isolado para demonstrações. Conteúdo recolhido continua acessível por toque e teclado.

Executar os testes pertinentes e, para a entrega integrada, `npm test` e `npm run test:browser` na raiz do projeto. Mudanças intencionais podem exigir revisão dos contratos de CSS/cópia; conferir o resultado visual antes de atualizar referências. Não alterar testes apenas para ocultar regressões.

Entregar prints antes/depois com os mesmos dados e dimensões, lista de arquivos alterados, verificações realizadas e lacunas restantes. Medir contraste e verificar foco e zoom; não reduzir fonte nem clarear texto para mascarar densidade. Não afirmar que todas as telas foram verificadas se faltarem estados.

## Pedido pronto para a IA executora

Implemente o refinamento visual descrito neste arquivo no projeto `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main`. Confirme o estado atual no navegador e consulte somente as referências de `C:\Users\Marcelo\Downloads\live-arena-identidade-ajustada\batalha-de-prompts-main\output\auditoria-visual-2026-09-16` para este diagnóstico. Preserve as melhorias já feitas; priorize painel, sala, prévias e acabamento dos grupos recolhíveis. Complete as capturas faltantes antes de concluir sobre essas telas. Entregue implementação, testes e prints comparáveis, sem alterar regras pedagógicas, dados ou identidade do produto. Não publique sem uma instrução específica para publicação.
