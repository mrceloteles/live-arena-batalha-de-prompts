# Cobertura da nova simulação

`simulacao.html` parte diretamente de `code.html`, preservando a identidade visual existente. Inclui seletor de telas e estados demonstrativos fora da interface do produto. As telas marcadas com sufixos são expansões de demonstração; não são novas rotas reais.

| Área | Telas representadas |
|---|---|
| Portal e aluno | Portal; entrada por código e nome; espera; missão; avaliação pendente; resultado; modo coletivo; classificação final. |
| Professor | Todas as telas autenticadas compartilham navegação SaaS persistente e sistema visual claro; inclui painel, gestão da sala baseada na composição do `code.html` de referência (acesso/TV, estado da partida, sorteio, roteiro e participantes), fila de avaliações, banco/editor, correção em lote, aulas e relatório. O modo escuro e a faixa listrada não são aplicados à área administrativa. |
| Conteúdo | Banco de desafios; formulário visual de edição; correção em lote; trilhas e aulas. |
| Projeção e análise | TV ao vivo; conexão demonstrativa; resultado final da TV; prévia do aluno; prévia da TV; relatório; 404. |

## Limites importantes

- Dados, notas, filas e cronômetros são fictícios. Nenhum botão executa ação real ou altera o backend.
- O seletor de estados é global, mas nem todo estado altera todas as telas. Não o considere cobertura completa de erro.
- Editor, correção em lote, fila, participantes e sorteio são representações visuais reduzidas. O contrato funcional e o aplicativo contêm mais regras e casos.
- O modo coletivo Arena é distinto da modalidade de desafio Boss Battle.
- A simulação usa Tailwind e fontes por CDN. Sem internet, cores, tipografia e layout podem não carregar integralmente.
- Não foram produzidas novas capturas de todas as telas desta versão; os PNGs existentes são referência auxiliar, não uma verificação visual completa.

Antes da integração, compare cada tela e estado com o aplicativo atual e preserve handlers, permissões, regras, dados e acessibilidade existentes.
