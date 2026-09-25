// Guarda sem navegador: nenhuma tela viva pode ganhar texto visível além do seu
// orçamento de palavras.
//
// Por que ela existe: `test/css/render.json` retrata propriedades computadas de
// estilo e NENHUM texto — o CSS tem três guardas e a cópia não tinha nenhuma. A
// conta do que isso custou, medida contra o site base congelado em
// `evidence/original-public/`:
//
//   - o painel do professor tinha saído de 31 para 89 palavras (2,9×) — e depois
//     do corte desta frente está em 74, quase tudo rótulo de seção;
//   - o relatório do professor, 107 palavras, é superfície que o site base não
//     tinha (o `report.php` original tem 0 bytes) — nasceu sem régua nenhuma;
//   - a tela do aluno (177) ficou MAIS enxuta que o station clássico (290), e
//     essa é a prova de que o problema não é "texto", é texto onde não precisa;
//   - o cliente tinha passado de 836 palavras de prosa (o `app.js` clássico, 122 KB,
//     arquivo único) para 2055 em dois bundles (2,5×), e está em 1608 depois do
//     corte. É o número que mais dói, porque `arena.js` é o que o aluno lê com o
//     cronômetro correndo.
//
// O que sobrou acima do site base é RÓTULO, não prosa: das 1366 palavras do
// `arena.js`, 697 são nome de campo, botão e coluna ("Rodadas", "Corações do
// Juiz", "Pontuadas"), que o site base não tinha porque não tinha essas telas.
// A régua de palavras não consegue distinguir uma coisa da outra: quem separa é
// `node scripts/inventario-copia.mjs`, que imprime o perfil frase/rótulo de cada
// bundle — e cada corte desta frente saiu de lá.
//
// Nada disso reprovou nada até hoje. Sem guarda, a próxima frase explicativa
// entra do mesmo jeito — e explicar na tela é o que se escreve quando a interface
// não está clara, então a tendência é sempre crescer.
//
// O TERCEIRO LADO: o texto que o servidor manda por API e a tela mostra depois.
//
// `mode_hint`, `cannot_reason`, `teach` não são HTML nem literal de bundle: o
// cliente só interpola (`${esc(draw.mode_hint)}`), e por isso o orçamento não os
// via. O custo apareceu no corte de set/2026 — o cliente foi enxugado e a frase
// longa continuou viva no servidor, na frente do aluno, porque a versão visível
// vinha de lá. A família `api` fecha isso medindo o PRODUTOR (`drawView` e os
// catálogos de dinâmica e de energia, todos puros), campo por campo, com o mesmo
// teto e a mesma catraca do resto.
//
// Consequência prática que a guarda agora sustenta: cortar só o cliente não muda
// o que o aluno lê nesses pontos da tela. Se a intenção é encurtar a pista, a
// frase que sai é a do servidor — e enquanto ela estiver lá, ela aparece no
// inventário (`node scripts/inventario-copia.mjs`), com o texto inteiro.
//
// O QUE A GUARDA PROTEGE, e o que ela deixa livre:
//
//   - ela reprova quando uma tela PASSA do teto. Cortar texto nunca reprova:
//     enxugar é sempre permitido, e o medido fica abaixo do teto até alguém
//     baixar o teto de propósito.
//   - ela reprova quando o `base` gravado no cartório divergir do que a captura
//     responde HOJE. A linha de base não é digitada à mão: é lida de
//     `evidence/original-public/` a cada execução, do mesmo arquivo cujo sha256 o
//     `evidence/manifest.json` já congela. Se a captura mudar, o número muda e a
//     guarda acusa.
//   - ela reprova quando alguém abre folga: `teto` acima do medido exige `nota`
//     escrita. Subir orçamento é decisão registrada, não acidente.
//   - ela reprova quando uma rota VIVA não está no cartório: as rotas são lidas
//     do próprio roteador (`src/web/pages/index.mjs`), então superfície nova
//     nasce sem orçamento declarado e a guarda morde antes de alguém escrever a
//     primeira frase dela.
//
// REGRAVAR (depois de uma decisão, nunca para calar a guarda):
//
//   UPDATE_COPY_BASELINE=1 node --test test/copia/orcamento.test.mjs
//
// Regravar APERTA a régua: o teto de cada tela/bundle desce para o medido do
// momento (um corte vira o novo limite, e a próxima palavra que entrar reprova).
// Só uma folga ESCRITA sobrevive — teto acima do medido com `nota` no cartório.
//
// A tabela legível do inventário sai de `node scripts/inventario-copia.mjs`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import {
  BASE_DO_CLIENTE,
  DIRETORIO_DO_CLIENTE,
  FONTES_DA_API,
  ROTAS_NAO_TELA,
  TELAS,
  camposDeTextoDaApi,
  cartorio,
  copiaDoCliente,
  inventario,
  linhaDeBase,
  literaisDeCodigo,
  palavras,
  relatarTabela,
  rotasDoRoteador,
  textoVisivel,
} from '../support/copia.mjs';

const RAIZ = new URL('../../', import.meta.url);
const CARTORIO = new URL('test/copia/orcamento.json', RAIZ);
const atualizar = process.env.UPDATE_COPY_BASELINE === '1';

const ler = (caminho) => readFileSync(new URL(caminho, RAIZ), 'utf8');
const lerCartorio = () => (existsSync(CARTORIO) ? JSON.parse(readFileSync(CARTORIO, 'utf8')) : null);

test('copia: nenhuma tela viva passa do orçamento de palavras', () => {
  const { telas, cliente, api } = inventario(RAIZ);
  const base = linhaDeBase(RAIZ);
  const atual = lerCartorio();
  assert.ok(atual, 'falta test/copia/orcamento.json — regrave com UPDATE_COPY_BASELINE=1');
  assert.ok(
    atual.api,
    'o cartório não tem a família `api` (o texto que o servidor manda e a tela mostra) — ' +
      'regrave com UPDATE_COPY_BASELINE=1',
  );

  // O instrumento tem de estar enxergando texto: um extrator quebrado mediria
  // zero em tudo e a guarda passaria sem guardar nada. (Fora do relato abaixo,
  // que é sobre a cópia e não sobre a régua.)
  for (const [nome, dados] of Object.entries(telas)) {
    assert.ok(dados.palavras > 0, `${nome}: nenhuma palavra visível medida — o extrator perdeu a tela`);
  }

  // Todos os achados entram numa lista só, para uma execução contar a história
  // inteira: quem for corrigir precisa ver de uma vez as telas estouradas, as
  // rotas sem orçamento e a régua fora de lugar — não uma por execução.
  const problemas = [];

  // Cobertura: tela viva sem orçamento declarado é superfície que nasceu sem
  // régua. As rotas vêm do roteador, então isto acompanha o produto sozinho.
  const declaradas = new Set([
    ...Object.values(atual.telas).flatMap((tela) => tela.rotas ?? []),
    ...ROTAS_NAO_TELA,
  ]);
  for (const rota of rotasDoRoteador(RAIZ)) {
    if (!declaradas.has(rota)) {
      problemas.push(
        `rota viva sem tela declarada no orçamento: ${rota}\n` +
          '    toda rota que o roteador serve precisa de uma entrada em test/copia/orcamento.json — ou ' +
          'de uma linha em ROTAS_NAO_TELA (test/support/copia.mjs), se ela redireciona em vez de ' +
          'servir tela. Declare a tela e regrave com UPDATE_COPY_BASELINE=1.',
      );
    }
  }
  for (const nome of Object.keys(atual.telas)) {
    if (!telas[nome]) problemas.push(`o orçamento declara a tela \`${nome}\`, que o inventário não mede mais`);
  }

  // A linha de base é recomputada da captura, não confiada ao cartório.
  for (const [nome] of Object.entries(telas)) {
    if (atual.telas[nome].base !== base.telas[nome]) {
      problemas.push(
        `${nome}: a linha de base mudou (cartório ${JSON.stringify(atual.telas[nome].base)}, ` +
          `captura ${JSON.stringify(base.telas[nome])})\n` +
          '    a régua vem de evidence/original-public/ a cada execução; se a captura foi refeita, ' +
          'regrave o cartório.',
      );
    }
  }
  if (atual.cliente.soma.base !== base.cliente.palavras) {
    problemas.push(
      `a base do cliente mudou (cartório ${atual.cliente.soma.base}, captura ${base.cliente.palavras}) — ` +
        'ela vem da captura congelada, não de um número digitado',
    );
  }

  // O orçamento em si.
  for (const [nome, dados] of Object.entries(telas)) {
    const antes = atual.telas[nome];
    if (dados.palavras > antes.teto) {
      const linhaBase = antes.base === null ? 'sem equivalente no site base' : `base ${antes.base}`;
      problemas.push(
        `  ${nome}: ${dados.palavras} palavras, teto ${antes.teto} (+${dados.palavras - antes.teto}) — ${linhaBase}`,
      );
    }
    if (antes.teto > dados.palavras) {
      assert.ok(
        typeof antes.nota === 'string' && antes.nota.trim().length > 0,
        `${nome}: teto ${antes.teto} acima do medido ${dados.palavras} sem \`nota\`. Folga no ` +
          'orçamento é decisão registrada: escreva no cartório por que a tela pode crescer até aí, ' +
          'ou baixe o teto para o medido.',
      );
    }
  }
  for (const [caminho, dados] of Object.entries(cliente)) {
    const antes = atual.cliente.bundles[caminho];
    if (dados.palavras > antes.teto) {
      problemas.push(`  ${caminho}: ${dados.palavras} palavras, teto ${antes.teto} (+${dados.palavras - antes.teto})`);
    }
  }

  // O texto de API. Aqui a frase NÃO vem do bundle: ela é o que o servidor manda
  // e o cliente só põe na tela, então crescer neste campo é crescer na leitura do
  // aluno sem passar por bundle nenhum.
  for (const [chave, dados] of Object.entries(api.campos)) {
    const antes = atual.api.campos[chave];
    if (!antes) {
      problemas.push(`  api ${chave}: campo medido que o orçamento não declara — regrave o cartório`);
      continue;
    }
    // Campo morto vem antes de qualquer conta: falar de teto aqui contaria a
    // história errada ("folga sem nota") quando o que aconteceu foi a régua ficar
    // medindo o vazio.
    if (dados.trechos === 0) {
      problemas.push(
        `  api ${chave}: nenhuma frase medida — ${dados.origem} deixou de mandar este campo\n` +
          '    a régua ficou medindo o vazio: ajuste a declaração em test/support/copia.mjs e regrave o cartório.',
      );
      continue;
    }
    if (dados.palavras > antes.teto) {
      problemas.push(
        `  api ${chave}: ${dados.palavras} palavras, teto ${antes.teto} (+${dados.palavras - antes.teto}) — ` +
          `${dados.onde}, por ${dados.origem}`,
      );
    }
    if (antes.teto > dados.palavras) {
      assert.ok(
        typeof antes.nota === 'string' && antes.nota.trim().length > 0,
        `api ${chave}: teto ${antes.teto} acima do medido ${dados.palavras} sem \`nota\`. Folga no ` +
          'orçamento é decisão registrada: escreva no cartório por que este campo pode crescer até aí, ' +
          'ou baixe o teto para o medido.',
      );
    }
  }
  for (const chave of Object.keys(atual.api.campos)) {
    if (!api.campos[chave]) {
      problemas.push(
        `  o orçamento declara o campo de API \`${chave}\`, que o servidor não manda mais` +
          '\n    campo morto no cartório: ou o produtor mudou de nome (a régua ficou medindo o vazio), ' +
          'ou a frase saiu da tela. Ajuste a declaração em test/support/copia.mjs e regrave.',
      );
    }
  }

  const soma = Object.values(cliente).reduce((total, dados) => total + dados.palavras, 0);
  assert.deepEqual(
    problemas,
    [],
    'a cópia viva saiu do orçamento:\n' +
      `${problemas.join('\n')}\n\n` +
      `cliente (família): ${soma} palavras hoje, ${atual.cliente.soma.base} no site base ` +
      `(${BASE_DO_CLIENTE.arquivos.join(', ')}, arquivo único).\n` +
      `texto de API: ${api.soma.palavras} palavras em ${Object.keys(api.campos).length} campos ` +
      '(pista e motivo do sorteio, cartão do desafio coletivo, botões de energia).\n\n' +
      'Este último é o texto que o cliente só interpola: enxugar o bundle não muda o que o aluno lê ' +
      'ali — a versão visível vem do servidor, e é a dele que precisa encolher.\n\n' +
      'Texto explicativo na tela é o que se escreve quando a interface não está clara: se a frase ' +
      'existe para compensar um controle ambíguo, o conserto é o controle, não o texto. Se o ' +
      'crescimento é deliberado, eleve o `teto` em test/copia/orcamento.json E escreva a `nota` — ' +
      'subir orçamento é decisão registrada, não acidente. Cortar nunca precisa de nada.\n\n' +
      '— inventário de hoje —\n' +
      relatarTabela(inventario(RAIZ), linhaDeBase(RAIZ), atual),
  );
});

test('copia: o instrumento conta cópia e ignora código (controle positivo)', () => {
  // Sem este controle, um extrator que devolvesse vazio para tudo passaria na
  // guarda acima e não guardaria nada. Aqui estão os casos que decidem o número,
  // cada um com o resultado que ele PRECISA ter.

  // 1. marcação: nó de texto é cópia por definição, e rótulo de campo vazio
  //    também é (o aluno lê um placeholder). `class` e `data-*` não são.
  assert.equal(
    textoVisivel('<div class="x" data-foo="1"><span>Tentativas</span><input placeholder="Escreva seu prompt"></div>'),
    'Tentativas Escreva seu prompt',
    'o extrator tem de pegar nó de texto e rótulo visível, e ignorar class/data',
  );
  assert.equal(
    textoVisivel('<head><title>Live Arena</title></head><body><!-- Prosa em comentário --><b>Arena</b></body>'),
    'Arena',
    'título é cromo do navegador e comentário não é tela',
  );

  // 2. comentário e código não são cópia — o repositório escreve comentário em
  //    português explicando a tela, e é justamente uma prosa longa.
  const fonte =
    '// Nada disto aparece na tela do aluno, é só registro do que saiu.\n' +
    '/* Este bloco explica a rodada em prosa e não é cópia nenhuma. */\n' +
    "el.className = isPaused ? 'is-paused' : 'arena-tv';\n" +
    'const rotulo = "Ainda sem resultados.";\n' +
    'const medida = `/public/assets/css/arena.css?v=${versao}`;\n' +
    "const fonte = '12px Google Sans, Arial, sans-serif';\n";
  assert.deepEqual(
    literaisDeCodigo(fonte).map((l) => l.valor),
    ['is-paused', 'arena-tv', 'Ainda sem resultados.', '/public/assets/css/arena.css?v=', '12px Google Sans, Arial, sans-serif'],
    'o leitor de literais tem de pular comentário e devolver só as strings',
  );
  assert.deepEqual(
    copiaDoCliente(fonte).trechos.map((t) => t.texto),
    ['Ainda sem resultados.'],
    'classe, caminho de asset, valor de CSS e comentário não são cópia; a frase é',
  );

  // 3. a régua de duas palavras para literal cru separa frase de identificador
  //    sem precisar adivinhar intenção.
  assert.equal(copiaDoCliente("const a = 'Tentativas';").trechos.length, 0, 'uma palavra solta não é cópia');
  assert.equal(copiaDoCliente("const a = 'Leia o desafio.';").trechos.length, 1, 'frase é cópia');

  // 3b. seletor não é frase. `'.arena-side [data-arena-fold]'` tem duas palavras
  //     e nenhum caractere de código, então passava como prosa: uma consulta nova
  //     no cliente inflava o orçamento em palavras que ninguém escreveu para a
  //     tela. A régua de duas palavras precisa continuar valendo para frase.
  assert.equal(
    copiaDoCliente("el.querySelectorAll('.arena-side [data-arena-fold]');").trechos.length,
    0,
    'seletor composto não é cópia',
  );
  assert.equal(
    copiaDoCliente("const aviso = 'Escolha o prompt que merece entrar em campo.';").trechos.length,
    1,
    'a régua de seletor não pode engolir frase de tela',
  );

  // 4. a contagem ignora número solto e marcador — senão o orçamento mexeria
  //    quando um contador na tela mudasse de valor.
  assert.equal(palavras('0 conectados · 3 de 5 participantes'), 3, 'só o que dá trabalho de ler conta');

  // 3c. DESSINCRONIA: um REGEX dentro de `${...}` com ASPA na classe de
  //     caractere. Sem saber ler regex na interpolação, o leitor entrava na aspa
  //     da classe como se fosse string, consumia o `"` de fechamento, saía de
  //     fase e a varredura do arquivo morria ali — tudo depois deixava de contar,
  //     e a guarda não reprovava porque a folga escrita cobria o buraco. Medido
  //     em 19/09/2026 no `arena.js` real: 691 palavras medidas contra 1346 no
  //     cartório, com o painel do professor inteiro fora da régua.
  const comRegex =
    'const sel = `[${attr}="${String(el.getAttribute(attr)).replace(/(["\\\\])/g, "\\\\$1")}"]`;\n' +
    "const depois = 'Rodada encerrada, confira o placar.';\n";
  assert.deepEqual(
    copiaDoCliente(comRegex).trechos.map((t) => t.texto),
    ['Rodada encerrada, confira o placar.'],
    'regex com aspa dentro de ${...} não pode dessincronizar o leitor — a frase DEPOIS dele tem de continuar contando',
  );

  // 3d. DIVISÃO dentro de `${...}`. Era o defeito que mais custava, e o mais
  //     silencioso: ESPAÇO zerava a marca de "depois de valor", então o `/` de
  //     `a / b` virava ABERTURA DE REGEX, engolia até a quebra de linha — com o
  //     `}` que fecha a interpolação dentro — e o leitor saía de fase. No
  //     `arena.js` real quem disparava era o relatório do painel
  //     (`${Math.round((entry.avg / 20) * 100)}`), e o efeito não era medir de
  //     menos: o leitor voltava a fase englobando CÓDIGO como se fosse tela, e
  //     o `arena.js` "media" 1654 palavras contra 1484 do mesmo arquivo sem a
  //     frente — 170 palavras de `function`, `const` e `querySelector` dentro do
  //     orçamento de cópia.
  assert.deepEqual(
    literaisDeCodigo("const r = `a${x / y}b`;\nconst depois = 'Frase depois.';\n").map((l) => l.valor),
    ['ab', 'Frase depois.'],
    'divisão dentro de ${...} não é regex — espaço não apaga a marca de "depois de valor"',
  );

  // E o extrator precisa continuar enxergando o cliente do produto ATÉ O FIM: se
  // a varredura dessincronizar no meio, o cartório do cliente conta menos e a
  // guarda passa em falso. Um piso de palavras não bastava (691 passava de 500);
  // o invariante de verdade é o leitor CHEGAR ao fim do arquivo, e é o que a
  // última linha com cópia prova.
  const fonteDoCliente = ler(`${DIRETORIO_DO_CLIENTE}/arena.js`);
  const { trechos: doCliente, palavras: palavrasDoCliente } = copiaDoCliente(fonteDoCliente);
  const linhas = fonteDoCliente.split('\n').length;
  assert.ok(
    doCliente.length > 0 && doCliente.at(-1).linha > linhas * 0.9,
    `o leitor de literais parou em ${doCliente.at(-1)?.linha ?? 0} de ${linhas} linhas — ` +
      'a varredura dessincronizou e o resto do arena.js ficou fora da régua',
  );
  assert.ok(
    palavrasDoCliente > 1500,
    'o inventário do cliente ficou pequeno demais — o leitor de literais deixou de enxergar o arena.js',
  );
});

test('copia: o cartório bate com o medido, tela por tela', () => {
  const { telas, cliente, api } = inventario(RAIZ);
  if (atualizar) {
    writeFileSync(CARTORIO, `${JSON.stringify(cartorio(RAIZ, lerCartorio()), null, 2)}\n`);
    return;
  }
  const atual = lerCartorio();
  assert.ok(atual, 'falta test/copia/orcamento.json — regrave com UPDATE_COPY_BASELINE=1');

  // O medido de hoje tem de bater com o que o cartório grava: se a conta mudou
  // sem ninguém regravar, o cartório mente sobre a tela.
  assert.deepEqual(
    Object.keys(atual.telas).sort(),
    TELAS.map((tela) => tela.nome).sort(),
    'o cartório tem de declarar exatamente as telas do inventário',
  );
  for (const [nome, dados] of Object.entries(telas)) {
    assert.deepEqual(atual.telas[nome].rotas, dados.rotas, `${nome}: as rotas mudaram sem regravar o cartório`);
    assert.deepEqual(
      atual.telas[nome].bundles,
      dados.bundles,
      `${nome}: os bundles que a tela carrega mudaram sem regravar o cartório`,
    );
  }
  assert.deepEqual(
    Object.keys(atual.cliente.bundles).sort(),
    Object.keys(cliente).sort(),
    'há bundle no cliente que o orçamento não declara (ou declara um que não existe)',
  );
  assert.deepEqual(
    Object.keys(atual.api.campos).sort(),
    Object.keys(api.campos).sort(),
    'os campos de API do cartório têm de ser exatamente os que o instrumento mede hoje',
  );
});

test('copia: o texto de API é medido no produtor, chega à tela e cobre o payload', () => {
  const { api } = inventario(RAIZ);

  // 1. Campo vivo. Um campo declarado que devolve zero significa que a régua ficou
  //    medindo o vazio: renomearam `mode_hint` no servidor e a guarda passaria sem
  //    nunca mais contar a pista que o aluno lê.
  for (const [chave, dados] of Object.entries(api.campos)) {
    assert.ok(
      dados.trechos > 0 && dados.palavras > 0,
      `api ${chave}: nenhuma frase medida — ${dados.origem} deixou de mandar este campo. ` +
        'Ajuste a declaração em test/support/copia.mjs: campo que não existe mais não pode passar por medido.',
    );
  }

  // 2. Campo mostrado. Medir o servidor não basta: o texto tem de continuar
  //    chegando à tela. Se o cliente parar de renderizar o campo, a frase fica viva
  //    no servidor sem ninguém ver — que é o defeito que esta família existe para
  //    fechar, só que na direção contrária.
  for (const fonte of FONTES_DA_API) {
    const doCliente = ler(fonte.arquivoNoCliente);
    for (const campo of fonte.campos) {
      assert.ok(
        doCliente.includes(campo.noCliente),
        `api ${fonte.chave}.${campo.nome}: ${fonte.arquivoNoCliente} não contém \`${campo.noCliente}\` — ` +
          'o cliente deixou de mostrar este campo, e o texto ficou vivo no servidor sem aparecer. ' +
          'Ou devolva a renderização, ou tire o campo da declaração e regrave o cartório.',
      );
    }
  }

  // 3. Cobertura do payload. Todo campo de TEXTO que o produtor manda tem de estar
  //    declarado — como frase (medido, com teto) ou como rótulo. É o mesmo espírito
  //    da cobertura de rotas: frase nova não nasce sem orçamento. Uma dica a mais
  //    numa dinâmica (`example`, digamos) reprova aqui, antes de a guarda ficar
  //    cega para ela.
  for (const fonte of FONTES_DA_API) {
    assert.deepEqual(
      camposDeTextoDaApi(fonte),
      [...fonte.campos.map((campo) => campo.nome), ...fonte.rotulos].sort(),
      `api ${fonte.chave}: o payload mudou sem a declaração mudar. Declare o campo novo como frase ` +
        '(em `campos`, com a meta de palavras) ou como rótulo (em `rotulos`), em test/support/copia.mjs.',
    );
  }
});

test('copia: regravar APERTA a régua, e só folga escrita sobrevive', () => {
  // O teto não é um número que alguém digita: ele desce para o medido do momento,
  // que é o que faz um corte valer para sempre — sem isso a régua vira decorativa,
  // porque quem escreve demais sempre pode regravar e ficar com o teto antigo.
  //
  // `nota` é o único jeito de segurar um teto acima do medido, e ela responde por
  // isso (a guarda exige a nota sempre que o teto estiver acima do medido).
  // `contexto` NÃO é `nota`: ele registra o que a régua não vê — que o que passa
  // do site base é rótulo de tela que o original não tinha — e por isso mesmo não
  // sobe nem segura teto nenhum.
  const anterior = (extra) => ({
    telas: { 'painel-do-professor': { teto: 999, ...extra }, relatorio: { teto: 999 } },
    cliente: { soma: { teto: 999 }, bundles: {} },
    api: { soma: { teto: 999 }, campos: { 'dinamica.teach': { teto: 999, ...extra } } },
  });

  const semNada = cartorio(RAIZ, anterior({}));
  assert.equal(
    semNada.telas['painel-do-professor'].teto,
    semNada.telas['painel-do-professor'].palavras,
    'teto acima do medido e sem `nota` tem de cair para o medido na regravação',
  );
  assert.equal(semNada.telas.relatorio.teto, semNada.telas.relatorio.palavras);
  assert.equal(semNada.cliente.soma.teto, semNada.cliente.soma.palavras);

  const comContexto = cartorio(RAIZ, anterior({ contexto: 'explica o residual, não pede folga' }));
  assert.equal(
    comContexto.telas['painel-do-professor'].teto,
    comContexto.telas['painel-do-professor'].palavras,
    '`contexto` descreve; quem segura teto é `nota`',
  );
  assert.equal(
    comContexto.telas['painel-do-professor'].contexto,
    'explica o residual, não pede folga',
    'e ainda assim o contexto fica registrado no cartório',
  );

  const comNota = cartorio(RAIZ, anterior({ nota: 'esta tela pode crescer até aqui' }));
  assert.equal(comNota.telas['painel-do-professor'].teto, 999, 'folga com `nota` é decisão registrada e sobrevive');

  // O texto de API entra na mesma catraca, pelo mesmo motivo: é onde a frase
  // sobrevive sem passar pelo bundle, então é onde um corte no cliente dá a
  // impressão de que a tela encolheu.
  assert.equal(
    semNada.api.campos['dinamica.teach'].teto,
    semNada.api.campos['dinamica.teach'].palavras,
    'teto de API acima do medido e sem `nota` tem de cair para o medido na regravação',
  );
  assert.equal(semNada.api.soma.teto, semNada.api.soma.palavras);
  assert.equal(
    comNota.api.campos['dinamica.teach'].teto,
    999,
    'folga com `nota` também sobrevive num campo de API',
  );
});
